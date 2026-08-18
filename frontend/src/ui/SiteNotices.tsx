import { Link } from "react-router-dom";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { Icon, type IconName } from "~/ui/Icon";

export function SiteNotices() {
  const { siteConfig, hours } = useVenue();
  const { locale, t } = useLocale();
  const business = siteConfig.business;
  const announcement = siteConfig.announcement;
  const notices: { tone: "info" | "good" | "warn"; text: string; icon: IconName }[] = [];

  if (business.mode === "closed") notices.push({ tone: "warn", icon: "clock", text: `${t("closed")} · ${business.message[locale]}` });
  else if (business.mode === "busy") notices.push({ tone: "info", icon: "clock", text: `${t("busy")} · ${business.message[locale]}` });
  else notices.push({ tone: "good", icon: "check-circle", text: `${t("openNow")} · ${hours}` });

  if (announcement.enabled && announcement.message[locale].trim()) {
    const tone = announcement.tone;
    notices.push({ tone, icon: tone === "good" ? "check-circle" : tone === "warn" ? "alert" : "info", text: announcement.message[locale] });
  }

  return <div className="site-notices" aria-label="Restaurant status">{notices.map((notice, index) => <div key={`${notice.text}-${index}`} className={`site-notice site-notice--${notice.tone}`}><Icon name={notice.icon} size={16} /><span>{notice.text}</span>{business.mode === "closed" && index === 0 ? <Link to="/menu" className="site-notice__link">{t("menu")}</Link> : null}</div>)}</div>;
}
