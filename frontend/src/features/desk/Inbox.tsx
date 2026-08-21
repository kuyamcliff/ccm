import { useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, usePoll, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { openStream } from "~/lib/sse";
import { Action, Button } from "~/ui/Button";
import { TextAreaField, Segmented, SelectField } from "~/ui/Field";
import { Sheet } from "~/ui/Sheet";
import { Avatar, Pulse } from "~/ui/Bits";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Nothing, State } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The support inbox, live.
 *
 * ── Two panes, one at a time on a phone ────────────────────────────────────
 *
 * A list of conversations and one open conversation. On a desk they sit side by
 * side; on a phone the list is the screen until you pick a thread, and then the
 * thread is. A two-pane layout squeezed onto 360px gives you two things too
 * narrow to use rather than one that works.
 *
 * ── The stream is transport, never truth ───────────────────────────────────
 *
 * Messages arrive over server-sent events so a reply lands while somebody is
 * looking at it. But every open and every send returns the **full** transcript,
 * and that is what gets rendered. A dropped frame heals on the next interaction
 * instead of leaving a hole in the conversation that nobody can see is there.
 */

type Filter = "open" | "mine" | "all";

export function Inbox() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [openId, setOpenId] = useState<number | null>(null);

  const threads = useQuery(
    `${K.desk.threads}.${filter}`,
    () => api.deskSupport.threads(filter === "all" ? {} : filter === "mine" ? { mine: true } : { status: "open" }),
    { staleMs: 15_000 }
  );

  /* The admin stream tells this tab when anything anywhere changed. Cheaper and
     far more responsive than polling a list of threads every few seconds. */
  useEffect(() => {
    const close = openStream("/api/support/admin/stream", {
      onEvent: () => {
        /* Any event at all means something somewhere changed. Rather than
           decoding which thread, re-read the list: it is one small request and
           it cannot drift out of step with what the stream said. */
        invalidate("desk.thread");
        threads.reload();
      },
    });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  /* A backstop for a dropped stream. Long enough not to matter, short enough
     that a broken connection is not a broken inbox. */
  usePoll(() => threads.reload(), 45_000);

  const list = threads.data?.threads ?? [];
  const waiting = list.filter((thread) => thread.unread_for_admin > 0).length;

  return (
    <DeskPage
      title="Messages"
      hint="Live. Hand a conversation to somebody else if it is not yours."
      actions={
        threads.data ? (
          <Pulse
            on={threads.data.online_admins.length > 0}
            label={`${threads.data.online_admins.length} at the desk`}
          />
        ) : null
      }
    >
      <Segmented
        value={filter}
        onChange={setFilter}
        label="Which conversations"
        options={[
          { value: "open", label: waiting > 0 ? `Open (${waiting})` : "Open" },
          { value: "mine", label: "Mine" },
          { value: "all", label: "All" },
        ]}
      />

      <Loaded query={threads}>
        {() =>
          list.length === 0 ? (
            <Nothing icon="message">Nothing waiting. Nobody needs anything.</Nothing>
          ) : (
            <div className="rows">
              {list.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className="row row--tall pressable"
                  onClick={() => setOpenId(thread.id)}
                >
                  <Avatar name={thread.display_name || thread.user_name || "Guest"} size={30} />

                  <span className="grow stack stack--tight">
                    <span className="bar bar--tight">
                      <span className="small strong">{thread.display_name || thread.user_name || "Guest"}</span>
                      {thread.visitor_online ? <Pulse on label="Here now" /> : null}
                      {thread.unread_for_admin > 0 ? <State tone="hot">{thread.unread_for_admin} new</State> : null}
                    </span>
                    <span className="fine faint clip">{thread.last_body ?? "No messages yet"}</span>
                    <span className="micro faint">
                      {timeAgo(thread.last_message_at)}
                      {thread.assigned_admin_name ? ` · with ${thread.assigned_admin_name}` : ""}
                    </span>
                  </span>

                  <Icon name="chevron-right" size={15} className="faint" />
                </button>
              ))}
            </div>
          )
        }
      </Loaded>

      <Thread
        id={openId}
        onClose={() => {
          setOpenId(null);
          threads.reload();
        }}
        onTrouble={(error) => toast.failed(error, "desk")}
      />
    </DeskPage>
  );
}

/* ── One conversation ───────────────────────────────────────────────────────*/

function Thread({
  id,
  onClose,
  onTrouble,
}: {
  id: number | null;
  onClose: () => void;
  onTrouble: (error: unknown) => void;
}) {
  const [draft, setDraft] = useState("");
  const [handingOver, setHandingOver] = useState(false);
  const endOfList = useRef<HTMLDivElement | null>(null);

  const transcript = useQuery(
    id ? K.desk.thread(id) : "desk.thread.none",
    () => api.deskSupport.thread(id!),
    { enabled: id !== null, staleMs: 5_000 }
  );

  useEffect(() => {
    if (!id) return;
    const close = openStream("/api/support/admin/stream", { onEvent: () => transcript.reload() });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    endOfList.current?.scrollIntoView({ block: "end" });
  }, [transcript.data?.messages.length]);

  const send = useMutation(async () => {
    if (!id) return;
    await api.deskSupport.reply(id, draft.trim());
    setDraft("");
    transcript.reload();
  });

  const setStatus = useMutation(async (status: "open" | "closed") => {
    if (!id) return;
    await api.deskSupport.setStatus(id, status);
    transcript.reload();
  });

  const data = transcript.data;

  return (
    <>
      <Sheet
        open={id !== null}
        onClose={onClose}
        title={data?.thread.display_name || data?.thread.user_name || "Conversation"}
        footer={
          <form
            className="dk-reply__form"
            onSubmit={async (event) => {
              event.preventDefault();
              await send.run();
              const error = send.readError();
              if (error) onTrouble(error);
            }}
          >
            <textarea
              className="chat__input"
              rows={1}
              value={draft}
              placeholder="Reply"
              aria-label="Reply"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send.run();
                }
              }}
            />
            <Action
              type="submit"
              tone="primary"
              size="sm"
              className="btn--icon"
              pending={send.pending}
              disabled={draft.trim().length === 0}
              aria-label="Send"
            >
              <Icon name="send" size={16} />
            </Action>
          </form>
        }
      >
        {data ? (
          <div className="stack">
            <div className="bar bar--tight bar--wrap">
              {data.visitor_online ? <Pulse on label="Here now" /> : <span className="fine faint">Not here</span>}
              {data.thread.user_email ? <span className="fine faint">{data.thread.user_email}</span> : null}
              <span className="push bar bar--tight">
                <Button size="sm" tone="quiet" icon="arrow-right" onClick={() => setHandingOver(true)}>
                  Hand over
                </Button>
                <Action
                  size="sm"
                  tone="quiet"
                  pending={setStatus.pending}
                  pendingLabel="Saving"
                  onClick={() => void setStatus.run(data.thread.status === "closed" ? "open" : "closed")}
                >
                  {data.thread.status === "closed" ? "Reopen" : "Close"}
                </Action>
              </span>
            </div>

            <div className="chat__list chat__list--desk">
              {data.messages.map((message) => (
                <div key={message.id} className="chat__msg" data-from={message.sender === "admin" ? "user" : "admin"}>
                  {message.kind === "system" ? (
                    <p className="fine faint center">{message.body}</p>
                  ) : (
                    <>
                      <div className="chat__bubble">{message.body}</div>
                      <span className="micro faint chat__meta">
                        {message.sender === "admin" ? `${message.author_name} · ` : ""}
                        {timeAgo(message.created_at)}
                      </span>
                    </>
                  )}
                </div>
              ))}
              <div ref={endOfList} />
            </div>

            {data.transfers.length > 0 ? (
              <div className="stack stack--tight">
                <span className="label">Handed over</span>
                {data.transfers.map((transfer, index) => (
                  <p key={index} className="fine faint">
                    {transfer.from_name ?? "Somebody"} to {transfer.to_name ?? "somebody"}
                    {transfer.note ? `: ${transfer.note}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="fine faint">One moment.</p>
        )}
      </Sheet>

      <HandOver
        threadId={handingOver ? id : null}
        onClose={() => setHandingOver(false)}
        onDone={() => {
          setHandingOver(false);
          transcript.reload();
        }}
      />
    </>
  );
}

function HandOver({
  threadId,
  onClose,
  onDone,
}: {
  threadId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  const roster = useQuery("desk.roster", () => api.deskSupport.roster(), {
    enabled: threadId !== null,
    staleMs: 60_000,
  });

  const hand = useMutation(async () => {
    if (!threadId || !to) return;
    await api.deskSupport.handOver(threadId, Number(to), note.trim());
    setNote("");
    onDone();
  });

  return (
    <Sheet
      open={threadId !== null}
      onClose={onClose}
      title="Hand this over"
      footer={
        <Action
          tone="primary"
          block
          pending={hand.pending}
          pendingLabel="Sending"
          disabled={!to}
          onClick={() => void hand.run()}
        >
          Hand it over
        </Action>
      }
    >
      <div className="stack">
        <SelectField label="To" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Choose somebody</option>
          {roster.data?.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name}
              {admin.online ? " (here now)" : ""}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Anything they should know"
          hint="Only staff see this."
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={300}
        />
      </div>
    </Sheet>
  );
}
