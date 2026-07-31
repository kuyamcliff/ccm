import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/context";

/**
 * Per-route document title. A single-page app keeps whatever title it loaded
 * with, so browser history, bookmarks and shared tabs all read the same
 * without this.
 */
const TITLES: Record<string, string> = {
  "/": "Cam Chop Meat | Charcoal grill in Buea. Book a table.",
  "/menu": "Menu | Cam Chop Meat",
  "/about": "About us | Cam Chop Meat",
  "/reserve": "Book a table | Cam Chop Meat",
  "/reserve/confirmed": "Booking confirmed | Cam Chop Meat",
  "/reviews": "Reviews | Cam Chop Meat",
  "/login": "Sign in | Cam Chop Meat",
  "/register": "Create an account | Cam Chop Meat",
  "/my-tables": "My bookings | Cam Chop Meat",
  "/account": "My account | Cam Chop Meat",
  "/offers": "Offers | Cam Chop Meat",
  "/gallery": "Gallery | Cam Chop Meat",
  "/events": "Private events | Cam Chop Meat",
  "/waitlist": "Join the waitlist | Cam Chop Meat",
  "/takeaway": "Order takeaway | Cam Chop Meat",
  "/privacy": "Privacy policy | Cam Chop Meat",
  "/terms": "Terms | Cam Chop Meat",
};

export function RouteChrome() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = pathname.startsWith("/admin")
      ? "Admin | Cam Chop Meat"
      : TITLES[pathname] ?? "Cam Chop Meat";
  }, [pathname]);

  useEffect(() => {
    // An in-page anchor should scroll to its target, not jump to the top.
    if (hash) {
      const target = document.querySelector(hash);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
    // `instant` so navigation does not animate a long scroll back up.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return null;
}

/** Shown while a lazily loaded route is fetched. */
export function RouteFallback() {
  const { t } = useLanguage();
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-fallback-dot" aria-hidden="true" />
      <span className="visually-hidden">{t("common", "loading")}</span>
    </div>
  );
}
