import { Link } from "react-router-dom";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { Icon, type IconName } from "~/ui/Icon";

/**
 * Whether the place is open, and anything the owner wants said today.
 *
 * A strip rather than a banner, and one line each. It sits directly under the
 * top bar because "are they open right now" is the question most visitors arrive
 * with, and answering it below the fold is answering it too late.
 *
 * The wording for closed, busy and the announcement is the owner's own, typed in
 * Desk > Site control, so it is read out of the config rather than written here.
 */
type Tone = "info" | "good" | "warn";

export function SiteNotices() {
  const { siteConfig, hours } = useVenue();
  const { locale, c } = useCopy();

  const business = siteConfig.business;
  const announcement = siteConfig.announcement;
  const notices: { tone: Tone; text: string; icon: IconName; menuLink?: boolean }[] = [];

  if (business.mode === "closed") {
    notices.push({
      tone: "warn",
      icon: "clock",
      text: [c.common.closedNow, business.message[locale]].filter(Boolean).join(" · "),
      /* Closed is the one state worth offering a way forward from: somebody can
         still read the menu and decide to come tomorrow. */
      menuLink: true,
    });
  } else if (business.mode === "busy") {
    notices.push({
      tone: "info",
      icon: "clock",
      text: [c.common.busyNow, business.message[locale]].filter(Boolean).join(" · "),
    });
  } else {
    notices.push({ tone: "good", icon: "check-circle", text: `${c.common.openNow} · ${hours}` });
  }

  if (announcement.enabled && announcement.message[locale].trim()) {
    const tone = announcement.tone;
    notices.push({
      tone,
      icon: tone === "good" ? "check-circle" : tone === "warn" ? "alert" : "info",
      text: announcement.message[locale],
    });
  }

  return (
    <div className="notices" aria-label="Restaurant status">
      {notices.map((notice, index) => (
        <div key={`${notice.text}-${index}`} className={`notices__row notices__row--${notice.tone}`}>
          <Icon name={notice.icon} size={15} />
          <span className="clip">{notice.text}</span>
          {notice.menuLink ? (
            <Link to="/menu" className="notices__link push" viewTransition>
              {c.nav.menu}
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
