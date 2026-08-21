import { useEffect, useRef, useState } from "react";
import { useConversation } from "./useConversation";
import { timeAgo } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Action } from "~/ui/Button";
import { Pulse } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";

/**
 * The chat itself, without any chrome.
 *
 * Used twice: full width on the Help page, and inside the floating launcher's
 * panel. Both want the same transcript and the same composer, and neither wants
 * to own the scroll behaviour, so it lives here.
 *
 * Messages are bubbles, which is the one place in this product where a rounded
 * container is right: a chat message genuinely is a discrete object from one
 * person, and every messaging app on the phone already taught everybody to read
 * it that way.
 */
export function Conversation({ active, compact }: { active: boolean; compact?: boolean }) {
  const { c } = useCopy();
  const { user } = useSession();
  const chat = useConversation(active);

  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const endOfList = useRef<HTMLDivElement | null>(null);

  /* Follow the conversation down as it grows, but only if the person is already
     at the bottom: yanking somebody back down while they are reading something
     further up is the single most irritating thing a chat can do. */
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (atBottom) endOfList.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.messages.length, chat.typing]);

  const needsName = !user && chat.messages.length === 0;
  const canSend = draft.trim().length > 0 && (!needsName || name.trim().length > 1);

  async function send() {
    if (!canSend) return;
    const text = draft;
    setDraft("");
    await chat.send(text, needsName ? name.trim() : undefined);
  }

  return (
    <div className={["chat", compact ? "chat--compact" : null].filter(Boolean).join(" ")}>
      <div className="chat__status">
        <Pulse on={chat.staffed} label={chat.staffed ? c.help.online : c.help.offline} />
        {chat.connected ? null : <span className="fine faint">reconnecting</span>}
      </div>

      <div className="chat__list" ref={scroller} data-scroller="">
        {chat.loading ? (
          <div className="stack stack--tight">
            <Skeleton height="2.25rem" width="70%" radius="var(--r-lg)" />
            <Skeleton height="2.25rem" width="55%" radius="var(--r-lg)" />
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="chat__intro">
            <Icon name="message" size={22} className="faint" />
            <p className="lead center">{c.help.lead}</p>
            <div className="bar bar--wrap bar--tight chat__quick">
              {[c.help.quickBooking, c.help.quickOrder, c.help.quickWhere, c.help.quickMenu].map((prompt) => (
                <QuickPrompt key={prompt} label={prompt} onSelect={() => setDraft(prompt)} />
              ))}
            </div>
          </div>
        ) : (
          chat.messages.map((message) => (
            <div key={message.id} className="chat__msg" data-from={message.sender}>
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
          ))
        )}

        {chat.typing ? (
          <div className="chat__msg" data-from="admin">
            <div className="chat__bubble chat__bubble--typing" aria-label={`${chat.typing.name} is typing`}>
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}

        <div ref={endOfList} />
      </div>

      <form
        className="chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {needsName ? (
          <input
            className="chat__name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={c.auth.name}
            aria-label={c.auth.name}
            autoComplete="name"
          />
        ) : null}

        <div className="chat__row">
          <textarea
            className="chat__input"
            value={draft}
            rows={1}
            placeholder={c.help.placeholder}
            aria-label={c.help.placeholder}
            onChange={(event) => {
              setDraft(event.target.value);
              chat.nudgeTyping();
            }}
            onKeyDown={(event) => {
              /* Enter sends, shift-enter breaks the line. On a phone the soft
                 keyboard's own return key is a newline, which is why the send
                 button beside it is not optional. */
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Action
            type="submit"
            tone="primary"
            size="sm"
            className="btn--icon"
            pending={chat.sending}
            disabled={!canSend}
            aria-label={c.help.send}
          >
            <Icon name="send" size={17} />
          </Action>
        </div>
      </form>
    </div>
  );
}

function QuickPrompt({ label, onSelect }: { label: string; onSelect: () => void }) {
  const press = usePress();
  return (
    <button type="button" className="chip" onClick={onSelect} {...press.pressProps}>
      {label}
    </button>
  );
}
