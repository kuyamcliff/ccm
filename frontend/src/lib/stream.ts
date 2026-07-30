import { getSupportToken } from "../api";

/**
 * Server-sent events over fetch rather than `EventSource`.
 *
 * `EventSource` cannot set request headers, and a signed-out visitor is
 * identified by the `x-support-token` header. The alternative — putting that
 * token in the query string — would write it into every access log and proxy
 * cache along the way. Reading the body as a stream keeps it in a header, and
 * gives us an AbortController for teardown.
 *
 * Reconnection is ours to handle too, so it backs off instead of hammering a
 * server that has just fallen over.
 */

type Handler = (event: string, data: unknown) => void;

interface StreamOptions {
  /** Called for every event, including `ready`. */
  onEvent: Handler;
  /** Connection came up or went down. */
  onStatus?: (connected: boolean) => void;
  /** Sends the visitor's support token. Omit for the admin stream. */
  withSupportToken?: boolean;
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
      if (options.withSupportToken) {
        const token = getSupportToken();
        if (token) headers["x-support-token"] = token;
      }

      const res = await fetch(path, {
        headers,
        credentials: "include",
        signal: controller.signal,
        // Without this a browser may serve a cached stream and never connect.
        cache: "no-store",
      });

      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

      attempt = 0;
      options.onStatus?.(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line. Anything after the last one is
        // a partial frame and stays in the buffer for the next read.
        let split: number;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          dispatch(frame, options.onEvent);
        }
      }
      throw new Error("stream ended");
    } catch (err) {
      if (closed || (err instanceof DOMException && err.name === "AbortError")) return;

      options.onStatus?.(false);
      attempt += 1;
      // Exponential with jitter, so a server restart does not get a
      // synchronised stampede from every open tab.
      const wait = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      const jitter = wait * 0.3 * Math.random();
      retryTimer = setTimeout(() => { void connect(); }, wait + jitter);
    }
  }

  void connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller.abort();
  };
}

/** Parses one SSE frame and hands it to the caller. */
function dispatch(frame: string, onEvent: Handler): void {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    // A line opening with a colon is a comment — the keep-alive ping.
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return;

  try {
    onEvent(event, JSON.parse(dataLines.join("\n")));
  } catch {
    // A frame we cannot parse is dropped rather than killing the stream.
  }
}
