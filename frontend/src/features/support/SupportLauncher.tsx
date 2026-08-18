import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "~/ui/Icon";
import { Sheet } from "~/ui/Sheet";
import { Conversation } from "./Conversation";
import { useVenue } from "~/state/venue";
import { useLocale } from "~/state/locale";

export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { siteConfig, phone, phoneHref, whatsappHref } = useVenue();
  const { t, locale } = useLocale();
  const [readyToShow, setReadyToShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReadyToShow(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!siteConfig.support.enabled) return null;
  if (pathname.startsWith("/help") || pathname.startsWith("/desk")) return null;
  if (!readyToShow) return null;

  const hasChat = siteConfig.features.supportChat;
  const hasDirect = (siteConfig.support.phone && phoneHref) || (siteConfig.support.whatsapp && whatsappHref);
  if (!hasChat && !hasDirect) return null;

  return (
    <>
      <button type="button" className="helper" onClick={() => setOpen(true)} aria-label={t("messageUs")}>
        <Icon name="message" size={18} />
        {t("messageUs")}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("needHelp")}>
        <div className="stack stack--loose">
          <div className="stack stack--tight">
            <p className="display display--md">{locale === "fr" ? "Comment pouvons-nous vous aider ?" : "How can we help?"}</p>
            <p className="fine muted">{siteConfig.support.staffed ? `${t("usuallyReplies")} ${siteConfig.support.responseMinutes} min.` : siteConfig.support.afterHoursMessage[locale]}</p>
          </div>

          <div className="actions">
            {siteConfig.support.phone && phoneHref ? <a className="btn btn--ghost" href={phoneHref}><Icon name="phone" size={18} />{locale === "fr" ? "Appeler" : "Call"}{phone ? ` · ${phone}` : ""}</a> : null}
            {siteConfig.support.whatsapp && whatsappHref ? <a className="btn btn--ghost" href={whatsappHref} target="_blank" rel="noreferrer noopener"><Icon name="message" size={18} />WhatsApp</a> : null}
          </div>

          {hasChat ? <Conversation active={open} compact /> : <p className="fine muted">{locale === "fr" ? "Utilisez l'un des contacts ci-dessus pour nous joindre." : "Use one of the contact options above to reach us."}</p>}
        </div>
      </Sheet>
    </>
  );
}
