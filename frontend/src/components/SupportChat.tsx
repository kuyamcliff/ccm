import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, setSupportToken } from "../api";
import type { SupportMessage, SupportThreadSummary } from "../api";
import { useAuth } from "../auth";
import { useSettings } from "../settings";
import { openStream } from "../lib/stream";

/**
 * Routes where the floating launcher is suppressed.
 *
 * It sits bottom-right, which is exactly where these pages put their own
 * controls: the menu's sticky cart bar and the reservation flow's buttons ended
 * up underneath it. Support stays reachable from the footer on every page.
 */
const HIDE_ON = ["/menu", "/reserve", "/admin"];

/** How long after the last keystroke we tell the desk typing has stopped. */
const TYPING_IDLE_MS = 2200;
/** Minimum gap between typing pings while someone types continuously. */
const TYPING_PING_MS = 1800;

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return formatTime(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type View = "list" | "chat";

export function SupportChat() {
  const { user } = useAuth();
  const { city, whatsappHref } = useSettings();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");

  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [staffed, setStaffed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [adminTyping, setAdminTyping] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const lastTypingPing = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  activeIdRef.current = activeId;
  openRef.current = open;

  const hidden = HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  /* ── The live connection ──────────────────────────────────────────────
     Held for the whole session, not just while the panel is open, so a reply
     arriving with the widget shut still lights the launcher. */
  useEffect(() => {
    if (hidden) return;

    const close = openStream("/api/support/stream", {
      withSupportToken: true,
      onStatus: setConnected,
      onEvent: (event, data) => {
        const payload = data as Record<string, unknown>;

        if (event === "ready" || event === "presence") {
          setStaffed(Boolean(payload.staffed));
          return;
        }

        if (event === "message") {
          const msg = data as SupportMessage;
          // A message for another of the caller's conversations still counts
          // towards the badge, it just does not join the open transcript.
          if (msg.thread_id === activeIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            if (msg.sender !== "user") setAdminTyping(null);
          }
          if (msg.sender !== "user" && (!openRef.current || msg.thread_id !== activeIdRef.current)) {
            setUnread((n) => n + 1);
          }
          setThreads((prev) =>
            prev.map((t) => (t.id === msg.thread_id ? { ...t, last_message_at: msg.created_at } : t))
          );
          return;
        }

        if (event === "typing") {
          if (Number(payload.thread_id) !== activeIdRef.current) return;
          if (payload.stopped) { setAdminTyping(null); return; }
          if (payload.who !== "admin") return;
          setAdminTyping(String(payload.name || "Cam Chop Meat"));
          // A dropped "stopped" event would otherwise leave the dots forever.
          if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
          typingClearTimer.current = setTimeout(() => setAdminTyping(null), 6000);
          return;
        }

        if (event === "thread_status") {
          const id = Number(payload.thread_id);
          setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, status: String(payload.status) } : t)));
        }
      },
    });

    return () => {
      close();
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
    };
  }, [hidden, user?.id]);

  const loadThreads = useCallback(async () => {
    try {
      const r = await api.supportThreads();
      if (r.guest_token) setSupportToken(r.guest_token);
      setThreads(r.threads);
      setStaffed(r.staffed);
      return r.threads;
    } catch {
      return [] as SupportThreadSummary[];
    }
  }, []);

  const loadTranscript = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const r = await api.supportTranscript(id);
      setMessages(r.messages);
      setStaffed(r.staffed);
      setAdminTyping(r.typing?.who === "admin" ? r.typing.name : null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that conversation.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* Opening the panel picks up where the visitor left off: their most recent
     conversation, or a blank composer if they have never written. */
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    void (async () => {
      const list = await loadThreads();
      if (activeIdRef.current !== null) return;
      if (list.length > 0) {
        setActiveId(list[0].id);
        setView("chat");
        void loadTranscript(list[0].id);
      } else {
        setView("chat");
      }
    })();
  }, [open, loadThreads, loadTranscript]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, adminTyping]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** Throttled keystroke signal, with a trailing "stopped". */
  function signalTyping() {
    const id = activeIdRef.current;
    if (id === null) return;

    const now = Date.now();
    if (now - lastTypingPing.current > TYPING_PING_MS) {
      lastTypingPing.current = now;
      void api.supportTyping(id).catch(() => {});
    }

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      lastTypingPing.current = 0;
      void api.supportTyping(id, true).catch(() => {});
    }, TYPING_IDLE_MS);
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([]);
    setDraft("");
    setError("");
    setAdminTyping(null);
    setView("chat");
  }

  function openThread(t: SupportThreadSummary) {
    setActiveId(t.id);
    setView("chat");
    setAdminTyping(null);
    void loadTranscript(t.id);
    setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, unread_for_user: 0 } : x)));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError("");
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);

    try {
      const r = await api.sendSupportMessage(body, activeId, user ? undefined : name.trim() || undefined);
      if (r.guest_token) setSupportToken(r.guest_token);
      setActiveId(r.thread.id);
      setMessages(r.messages);
      setDraft("");
      setStaffed(r.staffed);
      setThreads((prev) => {
        const without = prev.filter((t) => t.id !== r.thread.id);
        return [r.thread, ...without];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message did not send.");
    } finally {
      setSending(false);
    }
  }

  if (hidden) return null;

  const waHref = whatsappHref(`Hi, I have a question about Cam Chop Meat in ${city}.`);
  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="sc-fab"
          onClick={() => setOpen(true)}
          aria-label={unread > 0 ? `Open support chat, ${unread} new` : "Open support chat"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {unread > 0 && <span className="sc-fab-count">{unread > 9 ? "9+" : unread}</span>}
        </button>
      )}

      {open && (
        <div className="sc-panel" role="dialog" aria-label="Support chat">
          <header className="sc-head">
            {view === "chat" && threads.length > 0 && (
              <button type="button" className="sc-head-back" onClick={() => setView("list")} aria-label="All conversations">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}

            <div className="sc-head-info">
              <p className="sc-head-title">
                {view === "list" ? "Your conversations" : active ? active.subject : "Chat with us"}
              </p>
              <p className={`sc-presence${staffed ? " on" : ""}`}>
                <span className="sc-presence-dot" aria-hidden="true" />
                {staffed ? "We are online" : "Away, leave a message"}
              </p>
            </div>

            <div className="sc-head-actions">
              {view === "chat" && (
                <button type="button" className="sc-head-btn" onClick={startNewChat} aria-label="Start a new conversation" title="New conversation">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              <button type="button" className="sc-close" onClick={() => setOpen(false)} aria-label="Close chat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          {!connected && <p className="sc-offline" role="status">Reconnecting</p>}

          {/* ── History ── */}
          {view === "list" && (
            <div className="sc-body">
              <button type="button" className="sc-new" onClick={startNewChat}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Start a new conversation
              </button>

              <ul className="sc-threads">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`sc-thread${t.id === activeId ? " active" : ""}`}
                      onClick={() => openThread(t)}
                    >
                      <span className="sc-thread-head">
                        <span className="sc-thread-subject">{t.subject}</span>
                        <span className="sc-thread-when mono">{formatDay(t.last_message_at)}</span>
                      </span>
                      <span className="sc-thread-meta">
                        <span className={`sc-thread-state ${t.status}`}>{t.status === "open" ? "Open" : "Closed"}</span>
                        {t.unread_for_user > 0 && <span className="sc-thread-unread">{t.unread_for_user}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Transcript ── */}
          {view === "chat" && (
            <div className="sc-body" ref={scrollRef}>
              {loading && messages.length === 0 && <p className="sc-meta">Loading</p>}

              {!loading && messages.length === 0 && (
                <p className="sc-empty">
                  Ask us anything: opening hours, big bookings, whether the goat is on today.
                </p>
              )}

              {messages.map((m) =>
                m.kind === "system" ? (
                  <p key={m.id} className="sc-system">{m.body}</p>
                ) : (
                  <div key={m.id} className={`sc-msg${m.sender === "admin" ? " from-admin" : " from-user"}`}>
                    {m.sender === "admin" && <span className="sc-msg-who">{m.author_name || "Cam Chop Meat"}</span>}
                    <p className="sc-msg-body">{m.body}</p>
                    <span className="sc-msg-time">{formatTime(m.created_at)}</span>
                  </div>
                )
              )}

              {adminTyping && (
                <div className="sc-msg from-admin sc-typing-msg">
                  <span className="sc-msg-who">{adminTyping}</span>
                  <span className="sc-typing" aria-label={`${adminTyping} is typing`}>
                    <span /><span /><span />
                  </span>
                </div>
              )}

              {error && <p className="sc-error" role="alert">{error}</p>}
            </div>
          )}

          {view === "chat" && (
            <form className="sc-form" onSubmit={send}>
              {!user && activeId === null && (
                <input
                  className="sc-name"
                  type="text"
                  placeholder="Your name (optional)"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <div className="sc-row">
                <textarea
                  className="sc-input"
                  rows={1}
                  placeholder="Type your message"
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => { setDraft(e.target.value); signalTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(e); }
                  }}
                />
                <button className="btn btn-amber btn-sm" disabled={sending || !draft.trim()}>
                  {sending ? "Sending" : "Send"}
                </button>
              </div>
            </form>
          )}

          <a className="sc-wa" href={waHref} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            Prefer WhatsApp? Continue there
          </a>
        </div>
      )}
    </>
  );
}
