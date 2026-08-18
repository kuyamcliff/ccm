import { useEffect, useRef, useState } from "react";
import { stampLabel } from "~/lib/format";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useConversation } from "./useConversation";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";

export function Conversation({ active, compact }: { active: boolean; compact?: boolean }) {
  const { user } = useSession();
  const { locale, t } = useLocale();
  const { siteConfig } = useVenue();
  const chat = useConversation(active);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [chat.messages.length, chat.typing]);

  const needsName = !user && chat.messages.length === 0;
  const quiet = !chat.staffed;

  function useQuickMessage(message: string) {
    setDraft(message);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={`chat${compact ? " chat--compact" : ""}`}>
      <div className="chat__status fine">
        <span className="helper__dot" data-staffed={chat.staffed} aria-hidden="true" />
        {chat.staffed ? t("supportOnline") : t("supportOffline")}
        {!chat.connected && !chat.loading ? <span className="faint push">Reconnecting</span> : null}
      </div>

      <div className="chat__log" role="log" aria-live="polite" aria-label={t("messageUs")}>
        {chat.loading ? (
          <div className="stack">
            <Skeleton height="3rem" radius="var(--r-md)" />
            <Skeleton height="3rem" width="70%" radius="var(--r-md)" />
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="stack stack--tight">
            <p className="chat__intro muted">
              {locale === "fr"
                ? "Posez-nous une question sur votre réservation, votre commande, le menu ou votre visite."
                : "Ask us about a booking, an order, the menu, opening hours or your visit."}
            </p>
            {quiet ? (
              <p className="fine faint">
                {siteConfig.support.afterHoursMessage[locale]} {t("usuallyReplies")} {siteConfig.support.responseMinutes} min.
              </p>
            ) : (
              <p className="fine faint">{t("usuallyReplies")} {siteConfig.support.responseMinutes} min.</p>
            )}
            <div className="chat__quick" aria-label={locale === "fr" ? "Questions rapides" : "Quick help"}>
              <button type="button" onClick={() => useQuickMessage(t("bookingHelp"))}>{t("bookingHelp")}</button>
              <button type="button" onClick={() => useQuickMessage(t("orderHelp"))}>{t("orderHelp")}</button>
              <button type="button" onClick={() => useQuickMessage(t("paymentIssue"))}>{t("paymentIssue")}</button>
              <button type="button" onClick={() => useQuickMessage(t("locationHelp"))}>{t("locationHelp")}</button>
              <button type="button" onClick={() => useQuickMessage(t("menuHelp"))}>{t("menuHelp")}</button>
            </div>
          </div>
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
            label={locale === "fr" ? "Votre nom" : "Your name"}
            placeholder={locale === "fr" ? "Pour que nous sachions à qui nous répondons" : "So we know who we are talking to"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : null}

        <div className="chat__row">
          <label className="sr-only" htmlFor="chat-draft">
            {locale === "fr" ? "Votre message" : "Your message"}
          </label>
          <textarea
            ref={inputRef}
            id="chat-draft"
            className="textarea chat__input"
            rows={1}
            placeholder={locale === "fr" ? "Écrivez votre message" : "Type your message"}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              chat.nudgeTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" tone="primary" busy={chat.sending} disabled={!draft.trim()} aria-label={locale === "fr" ? "Envoyer" : "Send"}>
            <Icon name="send" size={18} />
          </Button>
        </div>
      </form>
    </div>
  );
}
