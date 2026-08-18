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
  const { siteConfig } = useVenue();
  const { t } = useLocale();
  const [readyToShow, setReadyToShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReadyToShow(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!siteConfig.features.supportChat || !siteConfig.support.enabled) return null;
  if (pathname.startsWith("/help") || pathname.startsWith("/desk")) return null;
  if (!readyToShow) return null;

  return (
    <>
      <button
        type="button"
        className="helper"
        onClick={() => setOpen(true)}
        aria-label={t("messageUs")}
      >
        <Icon name="message" size={18} />
        {t("messageUs")}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("messageUs")}>
        <Conversation active={open} compact />
      </Sheet>
    </>
  );
}
