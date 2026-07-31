import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { AdminSupportRoster, AdminSupportThread, SupportMessage, SupportTransfer } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useAuth } from "../../auth";
import { openStream } from "../../lib/stream";
import { useLanguage } from "../../i18n/context";

const TYPING_IDLE_MS = 2200;
const TYPING_PING_MS = 1800;

function formatWhen(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The support desk.
 *
 * Everything on this screen is driven by the live stream rather than a poll:
 * a customer's message, their typing, whether they still have the widget open,
 * and which colleagues are at their desks all arrive as events.
 */
export default function AdminSupport() {
  const { t } = useLanguage();
  const ts = (key: string) => t("adminSupport", key);
  const { user } = useAuth();

  const [threads, setThreads] = useState<AdminSupportThread[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<AdminSupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [transfers, setTransfers] = useState<SupportTransfer[]>([]);
  const [visitorOnline, setVisitorOnline] = useState(false);
  const [userTyping, setUserTyping] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState<{ id: number; name: string }[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [roster, setRoster] = useState<AdminSupportRoster[]>([]);
  const [forwardTo, setForwardTo] = useState<number | null>(null);
  const [forwardNote, setForwardNote] = useState("");
  const [forwarding, setForwarding] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const lastTypingPing = useRef(0);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tsRef = useRef(ts);

  activeIdRef.current = activeId;
  tsRef.current = ts;

  const loadThreads = useCallback(async () => {
    try {
      const r = await api.admin.supportThreads({ status: statusFilter || undefined, mine: mineOnly });
      setThreads(r.threads);
      setOnlineAdmins(r.online_admins);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("errLoadThreads"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, mineOnly]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  const openThread = useCallback(async (id: number) => {
    setActiveId(id);
    setUserTyping(null);
    try {
      const r = await api.admin.supportThread(id);
      setActive(r.thread);
      setMessages(r.messages);
      setTransfers(r.transfers);
      setVisitorOnline(r.visitor_online);
      setUserTyping(r.typing?.who === "user" ? r.typing.name : null);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread_for_admin: 0 } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("errOpenThread"));
    }
  }, []);

  /* ── The live connection ── */
  useEffect(() => {
    const close = openStream("/api/support/admin/stream", {
      onStatus: setConnected,
      onEvent: (event, data) => {
        const payload = data as Record<string, unknown>;

        if (event === "ready" || event === "presence") {
          setOnlineAdmins((payload.admins as { id: number; name: string }[]) ?? []);
          return;
        }

        if (event === "message") {
          const msg = data as SupportMessage;
          if (msg.thread_id === activeIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            if (msg.sender === "user") setUserTyping(null);
          }
          setThreads((prev) =>
            prev.map((t) =>
              t.id === msg.thread_id
                ? {
                    ...t,
                    last_body: msg.body,
                    last_message_at: msg.created_at,
                    unread_for_admin:
                      msg.sender === "user" && msg.thread_id !== activeIdRef.current
                        ? t.unread_for_admin + 1
                        : t.unread_for_admin,
                  }
                : t
            )
          );
          return;
        }

        if (event === "typing") {
          if (Number(payload.thread_id) !== activeIdRef.current) return;
          if (payload.stopped || payload.who !== "user") { setUserTyping(null); return; }
          setUserTyping(String(payload.name || tsRef.current("customerTyping")));
          if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
          typingClearTimer.current = setTimeout(() => setUserTyping(null), 6000);
          return;
        }

        if (event === "visitor_presence") {
          const id = Number(payload.thread_id);
          const online = Boolean(payload.online);
          setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, visitor_online: online } : t)));
          if (id === activeIdRef.current) setVisitorOnline(online);
          return;
        }

        if (event === "thread_assigned") {
          const id = Number(payload.thread_id);
          const adminId = Number(payload.admin_id);
          const adminName = String(payload.admin_name);
          setThreads((prev) =>
            prev.map((t) => (t.id === id ? { ...t, assigned_admin_id: adminId, assigned_admin_name: adminName } : t))
          );
          setActive((prev) =>
            prev && prev.id === id ? { ...prev, assigned_admin_id: adminId, assigned_admin_name: adminName } : prev
          );
          return;
        }

        // A new conversation is not in the list yet, so it takes a refetch.
        if (event === "thread_touched" && payload.created) void loadThreads();
        if (event === "thread_deleted") {
          const id = Number(payload.thread_id);
          setThreads((prev) => prev.filter((t) => t.id !== id));
          if (id === activeIdRef.current) { setActiveId(null); setActive(null); setMessages([]); }
        }
      },
    });

    return () => {
      close();
      if (typingClearTimer.current) clearTimeout(typingClearTimer.current);
    };
  }, [loadThreads]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, userTyping]);

  function signalTyping() {
    const id = activeIdRef.current;
    if (id === null) return;

    const now = Date.now();
    if (now - lastTypingPing.current > TYPING_PING_MS) {
      lastTypingPing.current = now;
      void api.admin.supportTyping(id).catch(() => {});
    }

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      lastTypingPing.current = 0;
      void api.admin.supportTyping(id, true).catch(() => {});
    }, TYPING_IDLE_MS);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body || sending || activeId === null) return;

    setSending(true);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    try {
      await api.admin.replySupport(activeId, body);
      setReply("");
    } catch (err) {
      setError(err instanceof Error ? err.message : ts("errReplyFailed"));
    } finally {
      setSending(false);
    }
  }

  async function setStatus(id: number, status: "open" | "closed") {
    try {
      await api.admin.setSupportStatus(id, status);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      setActive((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("errChangeStatus"));
    }
  }

  async function openForward() {
    setForwardOpen(true);
    setForwardTo(null);
    setForwardNote("");
    try {
      const r = await api.admin.supportAdmins();
      setRoster(r.admins);
    } catch {
      setRoster([]);
    }
  }

  async function doForward() {
    if (activeId === null || forwardTo === null) return;
    setForwarding(true);
    try {
      await api.admin.forwardSupport(activeId, forwardTo, forwardNote.trim());
      setForwardOpen(false);
      void openThread(activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("errForward"));
    } finally {
      setForwarding(false);
    }
  }

  const unassigned = threads.filter((t) => t.assigned_admin_id === null).length;

  return (
    <div className="admin-page sup">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{ts("title")}</h1>
        <div className="sup-status">
          <span className={`sup-conn${connected ? " on" : ""}`}>
            <span className="sup-conn-dot" aria-hidden="true" />
            {connected ? ts("live") : ts("reconnecting")}
          </span>
          <span className="sup-online mono">
            {onlineAdmins.length} {onlineAdmins.length === 1 ? ts("adminSingularOnline") : ts("adminPluralOnline")}
          </span>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="sup-layout">
        {/* ── Queue ── */}
        <aside className="sup-list">
          <div className="sup-filters">
            {([["", ts("all")], ["open", ts("open")], ["closed", ts("closed")]] as [string, string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={`filter-chip${statusFilter === v ? " active" : ""}`}
                onClick={() => setStatusFilter(v)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={`filter-chip${mineOnly ? " active" : ""}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              {ts("mine")}
            </button>
          </div>

          {unassigned > 0 && (
            <p className="sup-waiting mono">{ts("waitingForOwner").replace("{n}", String(unassigned))}</p>
          )}

          {loading && <p className="muted">{ts("loading")}</p>}
          {!loading && threads.length === 0 && <p className="empty-admin">{ts("noConversations")}</p>}

          <ul className="sup-threads">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`sup-thread${t.id === activeId ? " active" : ""}${t.unread_for_admin > 0 ? " unread" : ""}`}
                  onClick={() => void openThread(t.id)}
                >
                  <span className="sup-thread-top">
                    <span className="sup-thread-name">
                      <span
                        className={`sup-dot${t.visitor_online ? " on" : ""}`}
                        aria-label={t.visitor_online ? ts("customerOnline") : ts("customerOffline")}
                      />
                      {t.user_name || t.display_name}
                    </span>
                    <span className="sup-thread-when mono">{formatWhen(t.last_message_at)}</span>
                  </span>

                  <span className="sup-thread-preview">{t.last_body || t.subject}</span>

                  <span className="sup-thread-tags">
                    <span className={`sup-tag ${t.status}`}>{t.status === "open" ? ts("open") : ts("closed")}</span>
                    {t.assigned_admin_name ? (
                      <span className={`sup-tag owner${t.assigned_admin_id === user?.id ? " me" : ""}`}>
                        {t.assigned_admin_id === user?.id ? ts("you") : t.assigned_admin_name}
                      </span>
                    ) : (
                      <span className="sup-tag waiting">{ts("unassigned")}</span>
                    )}
                    {t.unread_for_admin > 0 && <span className="sup-tag count">{t.unread_for_admin}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Transcript ── */}
        <section className="sup-pane">
          {activeId === null || !active ? (
            <p className="sup-pick">{ts("pickConversation")}</p>
          ) : (
            <>
              <header className="sup-pane-head">
                <div>
                  <h2 className="sup-pane-title">{active.user_name || active.display_name}</h2>
                  <p className="sup-pane-sub">
                    {active.user_email || ts("guest")}
                    <span className={`sup-dot${visitorOnline ? " on" : ""}`} aria-hidden="true" />
                    {visitorOnline ? ts("online") : ts("offline")}
                    {active.assigned_admin_name && `, ${active.assigned_admin_name}`}
                  </p>
                </div>
                <div className="sup-pane-actions">
                  <button className="btn btn-sm btn-outline" onClick={openForward}>{ts("forward")}</button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => void setStatus(active.id, active.status === "open" ? "closed" : "open")}
                  >
                    {active.status === "open" ? ts("close") : ts("reopen")}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(active.id)}>{ts("delete")}</button>
                </div>
              </header>

              {transfers.length > 0 && (
                <div className="sup-handovers">
                  {transfers.map((tr, i) => (
                    <p key={i} className="sup-handover">
                      {tr.from_name ?? ts("someone")} {ts("transferTo")} {tr.to_name ?? ts("someone")}
                      {tr.note && <span className="sup-handover-note">{tr.note}</span>}
                    </p>
                  ))}
                </div>
              )}

              <div className="sup-msgs" ref={scrollRef}>
                {messages.map((m) =>
                  m.kind === "system" ? (
                    <p key={m.id} className="sup-system">{m.body}</p>
                  ) : (
                    <div key={m.id} className={`sup-msg${m.sender === "admin" ? " from-admin" : " from-user"}`}>
                      <span className="sup-msg-who">{m.author_name || (m.sender === "admin" ? ts("staff") : ts("customer"))}</span>
                      <p className="sup-msg-body">{m.body}</p>
                      <span className="sup-msg-time mono">{formatTime(m.created_at)}</span>
                    </div>
                  )
                )}

                {userTyping && (
                  <div className="sup-msg from-user sup-typing-msg">
                    <span className="sup-msg-who">{userTyping}</span>
                    <span className="sc-typing" aria-label={`${userTyping} ${ts("isTyping")}`}>
                      <span /><span /><span />
                    </span>
                  </div>
                )}
              </div>

              <form className="sup-form" onSubmit={send}>
                <textarea
                  rows={2}
                  value={reply}
                  maxLength={2000}
                  placeholder={ts("replyPlaceholder")}
                  onChange={(e) => { setReply(e.target.value); signalTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(e); }
                  }}
                />
                <button className="btn btn-amber" disabled={sending || !reply.trim()}>
                  {sending ? ts("sending") : ts("send")}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* ── Forward ── */}
      {forwardOpen && (
        <div className="modal-backdrop" onMouseDown={() => setForwardOpen(false)}>
          <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="fwd-title" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="modal-title" id="fwd-title">{ts("forwardTitle")}</h2>

            {roster.length === 0 && <p className="muted">{ts("noOneToForward")}</p>}

            <ul className="sup-roster">
              {roster.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`sup-roster-btn${forwardTo === a.id ? " active" : ""}`}
                    onClick={() => setForwardTo(a.id)}
                    aria-pressed={forwardTo === a.id}
                  >
                    <span className={`sup-dot${a.online ? " on" : ""}`} aria-hidden="true" />
                    <span className="sup-roster-name">{a.name}</span>
                    <span className="sup-roster-role mono">{a.role === "super_admin" ? ts("superAdmin") : ts("admin")}</span>
                    <span className="sup-roster-state mono">{a.online ? ts("online") : ts("offline")}</span>
                  </button>
                </li>
              ))}
            </ul>

            <label className="ofr-field">
              {ts("note")} <span className="optional">{ts("optional")}</span>
              <textarea
                rows={2}
                value={forwardNote}
                maxLength={300}
                placeholder={ts("notePlaceholder")}
                onChange={(e) => setForwardNote(e.target.value)}
              />
            </label>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setForwardOpen(false)}>{ts("cancel")}</button>
              <button className="btn btn-amber" disabled={forwardTo === null || forwarding} onClick={doForward}>
                {forwarding ? ts("sending") : ts("forward")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={ts("deleteTitle")}
        body={ts("deleteBody")}
        confirmLabel={ts("delete")}
        confirmClass="btn-danger"
        onConfirm={() => {
          const id = deleteTarget;
          setDeleteTarget(null);
          if (id === null) return;
          void api.admin.deleteSupportThread(id)
            .then(() => {
              setThreads((prev) => prev.filter((t) => t.id !== id));
              if (id === activeId) { setActiveId(null); setActive(null); setMessages([]); }
            })
            .catch((e) => setError(e instanceof Error ? e.message : ts("errDelete")));
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
