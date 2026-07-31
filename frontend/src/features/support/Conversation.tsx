import { useEffect, useRef, useState } from "react";
import { stampLabel } from "~/lib/format";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useConversation } from "./useConversation";

/**
 * The chat itself, used both in the floating sheet and on the help page.
 *
 * A signed-out visitor is asked for a name once, up front, because "Guest"
 * replying to "Guest" is unworkable at the desk end.
 */
export function Conversation({ active, compact }: { active: boolean; compact?: boolean }) {
  const { user } = useSession();
  const chat = useConversation(active);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the conversation down as it grows, the way a messaging app does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [chat.messages.length, chat.typing]);

  const needsName = !user && chat.messages.length === 0;

  return (
    <div className={`chat${compact ? " chat--compact" : ""}`}>
      <div className="chat__status fine">
        <span className="helper__dot" data-staffed={chat.staffed} aria-hidden="true" />
        {chat.staffed ? "Someone is at the desk" : "Nobody at the desk right now"}
        {!chat.connected && !chat.loading ? <span className="faint push">Reconnecting</span> : null}
      </div>

      <div className="chat__log" role="log" aria-live="polite" aria-label="Conversation">
        {chat.loading ? (
          <div className="stack">
            <Skeleton height="3rem" radius="var(--r-md)" />
            <Skeleton height="3rem" width="70%" radius="var(--r-md)" />
          </div>
        ) : chat.messages.length === 0 ? (
          <p className="chat__intro muted">
            Ask us anything. Bookings, an order that has gone quiet, whether there is goat left tonight.
            {!chat.staffed ? " Nobody is on right now, so this may sit until the morning." : ""}
          </p>
        ) : (
          chat.messages.map((message) => (
            <div key={message.id} className={`bubble bubble--${message.sender}`} data-kind={message.kind}>
              {message.kind === "system" ? (
                <p className="fine faint">{message.body}</p>
              ) : (
                <>
                  <p>{message.body}</p>
                  <p className="bubble__meta fine">
                    {message.sender === "user" ? "You" : message.author_name} {stampLabel(message.created_at)}
                  </p>
                </>
              )}
            </div>
          ))
        )}

        {chat.typing ? (
          <p className="chat__typing fine faint" aria-live="off">
            {chat.typing.name} is typing
          </p>
        ) : null}
        <div ref={bottom} />
      </div>

      <form
        className="chat__composer"
        onSubmit={async (event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          await chat.send(text, name.trim() || undefined);
        }}
      >
        {needsName ? (
          <TextField
            label="Your name"
            placeholder="So we know who we are talking to"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}

        <div className="chat__row">
          <label className="sr-only" htmlFor="chat-draft">
            Your message
          </label>
          <textarea
            id="chat-draft"
            className="textarea chat__input"
            rows={1}
            placeholder="Type your message"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              chat.nudgeTyping();
            }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. On a phone the button
              // is there for anyone whose keyboard has no Enter.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" tone="primary" busy={chat.sending} disabled={!draft.trim()} aria-label="Send">
            <Icon name="send" size={18} />
          </Button>
        </div>
      </form>
    </div>
  );
}
