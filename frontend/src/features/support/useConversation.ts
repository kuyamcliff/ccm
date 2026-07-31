import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { SupportMessage, TypingState } from "~/lib/api";
import { guestToken } from "~/lib/http";
import { openStream } from "~/lib/sse";

/**
 * The guest's side of a support conversation.
 *
 * Messages arrive over a server-sent event stream rather than by polling: the
 * point of a chat is that a reply lands while you are looking at it, and a
 * poll frequent enough to feel live would be a request every second or two on
 * a mobile connection.
 *
 * The stream is the transport, never the source of truth about what exists —
 * the first load and every send return the full transcript, so a missed frame
 * heals on the next interaction rather than leaving a hole in the thread.
 */
export function useConversation(active: boolean) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [staffed, setStaffed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const typingSent = useRef(0);

  /* Open the most recent conversation, or none. Starting a fresh thread for
     every visit would leave the desk with a pile of one-line threads from the
     same person. */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    api.support
      .myThreads()
      .then(async (result) => {
        if (cancelled) return;
        setStaffed(result.staffed);
        if (result.guest_token) guestToken.write(result.guest_token);

        const latest = result.threads[0];
        if (!latest) {
          setLoading(false);
          return;
        }
        const transcript = await api.support.transcript(latest.id);
        if (cancelled) return;
        setThreadId(transcript.thread.id);
        setMessages(transcript.messages);
        setTyping(transcript.typing);
      })
      .catch(() => {
        /* No thread yet, or a network blip. The composer still works: sending
           starts a conversation from nothing. */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    return openStream("/api/support/stream", {
      asGuest: true,
      onStatus: setConnected,
      onEvent: (event, data) => {
        const payload = data as Record<string, unknown>;

        if (event === "message") {
          const message = payload as unknown as SupportMessage;
          setMessages((current) =>
            current.some((existing) => existing.id === message.id) ? current : [...current, message]
          );
          setThreadId((current) => current ?? message.thread_id);
          // Their reply lands, so whatever they were typing is now said.
          setTyping(null);
          return;
        }

        if (event === "typing") {
          const who = payload.who as "user" | "admin" | undefined;
          if (who !== "admin") return;
          setTyping(payload.stopped ? null : { who: "admin", name: String(payload.name ?? "The desk") });
          return;
        }

        if (event === "presence") {
          setStaffed(Boolean(payload.staffed));
        }
      },
    });
  }, [active]);

  const send = useCallback(
    async (body: string, name?: string) => {
      const text = body.trim();
      if (!text || sending) return;

      setSending(true);
      try {
        const result = await api.support.send(text, threadId, name);
        if (result.guest_token) guestToken.write(result.guest_token);
        setThreadId(result.thread.id);
        setStaffed(result.staffed);
        // The response carries the whole transcript, which settles any
        // difference between what the stream delivered and what was stored.
        setMessages(result.messages);
      } finally {
        setSending(false);
      }
    },
    [threadId, sending]
  );

  /** Throttled: the desk needs to know somebody is writing, not every keystroke. */
  const nudgeTyping = useCallback(() => {
    if (!threadId) return;
    const now = Date.now();
    if (now - typingSent.current < 2500) return;
    typingSent.current = now;
    void api.support.typing(threadId).catch(() => {});
  }, [threadId]);

  return { messages, staffed, connected, typing, loading, sending, send, nudgeTyping, threadId };
}
