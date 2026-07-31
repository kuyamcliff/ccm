import { guestToken } from "./http";

/**
 * Server-sent events, read through fetch rather than EventSource.
 *
 * EventSource cannot set request headers, and a signed-out visitor is
 * identified by one — putting that token in the query string instead would
 * write it into every access log and proxy cache on the way. Reading the body
 * as a stream keeps it in a header and hands us an AbortController for
 * teardown.
 *
 * Reconnection is therefore ours to do, so it backs off rather than hammering
 * a server that has just fallen over.
 */

interface StreamOptions {
  onEvent: (event: string, data: unknown) => void;
  onStatus?: (connected: boolean) => void;
  /** Sends the guest's support token. Omit for the staff stream. */
  asGuest?: boolean;
}

const MAX_BACKOFF_MS = 30_000;

export function openStream(path: string, options: StreamOptions): () => void {
  const controller = new AbortController();
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function connect(): Promise<void> {
    if (closed) return;

    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      if (options.asGuest) {
        const token = guestToken.read();
        if (token) headers["x-support-token"] = token;
      }

      const response = await fetch(path, {
        headers,
        credentials: "same-origin",
        signal: controller.signal,
        // Without this a browser may hand back a cached stream and never connect.
        cache: "no-store",
      });

      if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

      attempt = 0;
      options.onStatus?.(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Events are separated by a blank line; anything after the last one is
        // a partial frame and waits for the next chunk.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          let name = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;
          try {
            options.onEvent(name, JSON.parse(dataLines.join("\n")));
          } catch {
            /* A heartbeat or a comment frame. Nothing to do. */
          }
        }
      }
    } catch {
      /* Fall through to the retry below. An aborted stream lands here too, and
         the `closed` guard stops it from reconnecting. */
    }

    if (closed) return;
    options.onStatus?.(false);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.random() * 500;
    attempt += 1;
    retryTimer = setTimeout(connect, delay);
  }

  void connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller.abort();
  };
}
