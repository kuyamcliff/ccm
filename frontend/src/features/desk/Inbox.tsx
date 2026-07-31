import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { DeskThread, SupportMessage } from "~/lib/api";
import type { DeskTranscript } from "~/lib/api/support";
import { stampLabel, timeAgo } from "~/lib/format";
import { openStream } from "~/lib/sse";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { Avatar, Badge } from "~/ui/Bits";
import { SelectField, TextAreaField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { EmptyState, Skeleton } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Toolbar } from "./parts";

/**
 * The support desk.
 *
 * Two columns: conversations on the left, the open one on the right. Under
 * 64rem the list becomes the whole screen until a thread is opened, because a
 * split view on a phone gives you two things too small to use.
 *
 * One event stream feeds the whole screen. Opening a thread does not open a
 * second one, and a message arriving in a thread that is not open bumps it up
 * the list with an unread count rather than interrupting.
 */
export function Inbox() {
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [status, setStatus] = useState<"open" | "closed" | "">("open");
  const [openId, setOpenId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<DeskTranscript | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [handOver, setHandOver] = useState(false);
  const [handTo, setHandTo] = useState("");
  const [handNote, setHandNote] = useState("");

  const threads = useResource(() => api.deskSupport.threads({ status: status || undefined }), [status]);
  const roster = useResource(() => api.deskSupport.roster(), []);
  const bottom = useRef<HTMLDivElement>(null);
  const typingSent = useRef(0);

  const load = useCallback(
    async (id: number) => {
      try {
        setTranscript(await api.deskSupport.thread(id));
      } catch (err) {
        toast.failed(err);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (openId !== null) void load(openId);
  }, [openId, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [transcript?.messages.length]);

  useEffect(
    () =>
      openStream("/api/support/admin/stream", {
        onEvent: (event, data) => {
          const payload = data as Record<string, unknown>;

          if (event === "message") {
            const message = payload as unknown as SupportMessage;
            threads.reload();
            setTranscript((current) => {
              if (!current || current.thread.id !== message.thread_id) return current;
              if (current.messages.some((existing) => existing.id === message.id)) return current;
              return { ...current, messages: [...current.messages, message], typing: null };
            });
            return;
          }

          if (event === "typing") {
            const who = payload.who as "user" | "admin" | undefined;
            if (who !== "user") return;
            setTranscript((current) => {
              if (!current || current.thread.id !== Number(payload.thread_id)) return current;
              return {
                ...current,
                typing: payload.stopped ? null : { who: "user", name: String(payload.name ?? "Visitor") },
              };
            });
            return;
          }

          if (event === "thread_touched" || event === "thread_assigned" || event === "thread_deleted") {
            threads.reload();
          }
        },
      }),
    // The stream is opened once for the life of the screen; reload is stable
    // enough for this and re-subscribing on every list change would thrash it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function send() {
    const body = draft.trim();
    if (!body || openId === null) return;
    setSending(true);
    try {
      const result = await api.deskSupport.reply(openId, body);
      setDraft("");
      setTranscript((current) => (current ? { ...current, messages: result.messages } : current));
      threads.reload();
    } catch (err) {
      toast.failed(err);
    } finally {
      setSending(false);
    }
  }

  const list = threads.data?.threads ?? [];

  return (
    <DeskPage title="Messages">
      {confirmElement}

      <Toolbar>
        <div className="chip-rail">
          {(
            [
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "", label: "Everything" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="fine faint push">
          {(threads.data?.online_admins ?? []).length} of you on the desk
        </p>
      </Toolbar>

      <div className={`inbox${openId !== null ? " inbox--open" : ""}`}>
        <aside className="inbox__list">
          {threads.loading ? (
            <Skeleton height="12rem" />
          ) : list.length === 0 ? (
            <EmptyState icon="message" title="No conversations">
              Messages from the site land here.
            </EmptyState>
          ) : (
            list.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="inbox__item"
                aria-current={thread.id === openId}
                onClick={() => setOpenId(thread.id)}
              >
                <Avatar name={thread.display_name} />
                <span className="inbox__body">
                  <span className="row row--between">
                    <strong>{thread.display_name}</strong>
                    <span className="fine faint">{timeAgo(thread.last_message_at)}</span>
                  </span>
                  <span className="fine muted inbox__preview">{thread.last_body ?? "No messages yet"}</span>
                  <span className="row" style={{ gap: "var(--s-2)" }}>
                    {thread.unread_for_admin > 0 ? <Badge tone="hot">{thread.unread_for_admin} new</Badge> : null}
                    {thread.visitor_online ? <Badge tone="good">Online</Badge> : null}
                    {thread.assigned_admin_name ? (
                      <span className="fine faint">with {thread.assigned_admin_name}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="inbox__thread">
          {openId === null ? (
            <EmptyState icon="message" title="Pick a conversation">
              Choose one on the left to read it and reply.
            </EmptyState>
          ) : !transcript ? (
            <Skeleton height="20rem" />
          ) : (
            <>
              <header className="inbox__head">
                <IconButton name="arrow-left" label="Back to the list" className="inbox__back" onClick={() => setOpenId(null)} />
                <div>
                  <strong>{transcript.thread.display_name}</strong>
                  <p className="fine faint">
                    {transcript.thread.user_email ?? "Not signed in"}
                    {transcript.visitor_online ? " · online now" : ""}
                  </p>
                </div>
                <div className="push row">
                  <Button size="sm" tone="ghost" icon="send" onClick={() => setHandOver(true)}>
                    Hand over
                  </Button>
                  <Button
                    size="sm"
                    tone="ghost"
                    onClick={async () => {
                      const next = transcript.thread.status === "open" ? "closed" : "open";
                      try {
                        await api.deskSupport.setStatus(transcript.thread.id, next);
                        threads.reload();
                        void load(transcript.thread.id);
                        toast.done(next === "closed" ? "Closed." : "Reopened.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    {transcript.thread.status === "open" ? "Close" : "Reopen"}
                  </Button>
                  <IconButton
                    name="trash"
                    label="Delete this conversation"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Delete this conversation?",
                        body: "Every message in it goes.",
                        confirmLabel: "Delete",
                      });
                      if (!ok) return;
                      try {
                        await api.deskSupport.remove(transcript.thread.id);
                        setOpenId(null);
                        setTranscript(null);
                        threads.reload();
                        toast.done("Deleted.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  />
                </div>
              </header>

              {transcript.transfers.length > 0 ? (
                <p className="fine faint">
                  Handed over {transcript.transfers.length} times, last by {transcript.transfers[0]?.from_name ?? "someone"}
                </p>
              ) : null}

              <div className="chat__log" role="log" aria-live="polite">
                {transcript.messages.map((message) => (
                  <div key={message.id} className={`bubble bubble--${message.sender}`} data-kind={message.kind}>
                    {message.kind === "system" ? (
                      <p className="fine faint">{message.body}</p>
                    ) : (
                      <>
                        <p>{message.body}</p>
                        <p className="bubble__meta fine">
                          {message.sender === "admin" ? message.author_name : transcript.thread.display_name}{" "}
                          {stampLabel(message.created_at)}
                        </p>
                      </>
                    )}
                  </div>
                ))}
                {transcript.typing ? <p className="chat__typing fine faint">{transcript.typing.name} is typing</p> : null}
                <div ref={bottom} />
              </div>

              <form
                className="chat__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <div className="chat__row">
                  <label className="sr-only" htmlFor="desk-reply">
                    Your reply
                  </label>
                  <textarea
                    id="desk-reply"
                    className="textarea chat__input"
                    rows={1}
                    placeholder="Type your reply"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      const now = Date.now();
                      if (openId !== null && now - typingSent.current > 2500) {
                        typingSent.current = now;
                        void api.deskSupport.typing(openId).catch(() => {});
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <Button type="submit" tone="primary" busy={sending} disabled={!draft.trim()} aria-label="Send">
                    <Icon name="send" size={18} />
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      <Sheet
        open={handOver}
        onClose={() => setHandOver(false)}
        title="Hand this over"
        description="The note is written into the conversation so whoever picks it up knows where you left it."
        footer={
          <>
            <Button tone="ghost" onClick={() => setHandOver(false)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              disabled={!handTo}
              onClick={async () => {
                if (openId === null || !handTo) return;
                try {
                  await api.deskSupport.handOver(openId, Number(handTo), handNote.trim());
                  setHandOver(false);
                  setHandNote("");
                  void load(openId);
                  threads.reload();
                  toast.done("Handed over.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Hand over
            </Button>
          </>
        }
      >
        <SelectField label="To" value={handTo} onChange={(e) => setHandTo(e.target.value)}>
          <option value="">Choose somebody</option>
          {(roster.data ?? []).map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name}
              {admin.online ? " (on the desk)" : ""}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Note"
          placeholder="What you have already told them, and what is still needed."
          value={handNote}
          maxLength={400}
          onChange={(e) => setHandNote(e.target.value)}
        />
      </Sheet>
    </DeskPage>
  );
}

/** Exported for the shell's unread badge, kept here beside the thread shape. */
export function unreadCount(threads: DeskThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.unread_for_admin, 0);
}
