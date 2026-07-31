import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { RouteFallback } from "../../components/RouteChrome";
import { useLanguage } from "../../i18n/context";
import { LANGUAGES } from "../../i18n/translations";
import {
  IconBack, IconBag, IconCal, IconCamera, IconChart, IconClock, IconClose, IconDash,
  IconGear, IconGift, IconList, IconMap, IconMenu, IconParty, IconPay, IconPercent,
  IconChat, IconReceipt, IconScan, IconStar, IconTag, IconUsers,
} from "./AdminNavIcons";

interface NavItem {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  labelKey: string;
}

/**
 * Sixteen destinations in one flat column is a wall. Grouping them by what the
 * job actually is makes the list scannable and gives the mobile drawer natural
 * stopping points.
 */
const NAV_GROUPS: { headingKey: string; items: NavItem[] }[] = [
  {
    headingKey: "groupOverview",
    items: [
      { to: "/admin", end: true, icon: <IconDash />, labelKey: "navDashboard" },
      { to: "/admin/analytics", icon: <IconChart />, labelKey: "navAnalytics" },
    ],
  },
  {
    headingKey: "groupService",
    items: [
      { to: "/admin/verify", icon: <IconScan />, labelKey: "navVerifyBooking" },
      { to: "/admin/reservations", icon: <IconCal />, labelKey: "navReservations" },
      { to: "/admin/floor", icon: <IconMap />, labelKey: "navFloorPlan" },
      { to: "/admin/waitlist", icon: <IconClock />, labelKey: "navWaitlist" },
      { to: "/admin/takeaway-admin", icon: <IconBag />, labelKey: "navTakeaway" },
      { to: "/admin/events-admin", icon: <IconParty />, labelKey: "navEvents" },
    ],
  },
  {
    headingKey: "groupContent",
    items: [
      { to: "/admin/menu", icon: <IconList />, labelKey: "navMenu" },
      { to: "/admin/gallery-admin", icon: <IconCamera />, labelKey: "navGallery" },
      { to: "/admin/reviews", icon: <IconStar />, labelKey: "navReviews" },
    ],
  },
  {
    headingKey: "groupMoney",
    items: [
      { to: "/admin/payments", icon: <IconPay />, labelKey: "navPayments" },
      { to: "/admin/receipts", icon: <IconReceipt />, labelKey: "navReceipts" },
      { to: "/admin/offers", icon: <IconTag />, labelKey: "navOffers" },
      { to: "/admin/promos", icon: <IconPercent />, labelKey: "navPromoCodes" },
      { to: "/admin/gift-cards", icon: <IconGift />, labelKey: "navGiftCards" },
    ],
  },
  {
    headingKey: "groupPeople",
    items: [
      { to: "/admin/users", icon: <IconUsers />, labelKey: "navUsers" },
      { to: "/admin/support", icon: <IconChat />, labelKey: "navSupport" },
    ],
  },
];

export function AdminLayout() {
  const { t, lang, setLang } = useLanguage();
  const ta = (key: string) => t("admin", key);
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (!loading && !isAdmin) navigate("/", { replace: true });
  }, [loading, isAdmin, navigate]);

  // Following a link should always leave the drawer closed behind you.
  useEffect(() => setNavOpen(false), [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        toggleRef.current?.focus();
      }
    };
    // The page underneath must not scroll while the drawer covers it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  if (loading) {
    return (
      <div className="admin-boot" role="status" aria-live="polite">
        <span className="route-fallback-dot" aria-hidden="true" />
        <span className="visually-hidden">{ta("checkingAccess")}</span>
      </div>
    );
  }

  if (!isAdmin || !user) return null;

  const currentLabelKey =
    NAV_GROUPS.flatMap((g) => g.items).find((i) =>
      i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)
    )?.labelKey ?? (location.pathname.endsWith("/settings") ? "navSiteSettings" : "admin");
  const currentLabel = ta(currentLabelKey);

  return (
    <div className={`admin-layout${navOpen ? " nav-open" : ""}`}>
      {/* Compact bar shown only below the sidebar breakpoint. */}
      <header className="admin-topbar">
        <button
          ref={toggleRef}
          type="button"
          className="admin-topbar-toggle"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          aria-label={navOpen ? ta("closeMenu") : ta("openMenu")}
        >
          {navOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
        </button>
        <p className="admin-topbar-title">{currentLabel}</p>
        <Link to="/" className="admin-topbar-exit" aria-label={ta("backToPublicSite")}>
          <IconBack size={14} />
        </Link>
      </header>

      <div
        className="admin-scrim"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
        hidden={!navOpen}
      />

      <aside id="admin-sidebar" className="admin-sidebar">
        <div className="admin-sidebar-top">
          <div className="admin-brand">
            <span className="admin-brand-dot" aria-hidden="true" />
            <div>
              <p className="admin-brand-name">Cam Chop Meat</p>
              <p className="admin-brand-label">{isSuperAdmin ? ta("boss") : ta("adminPanel")}</p>
            </div>
          </div>

          <div className="lang-toggle admin-lang-toggle" role="group" aria-label={t("common", "language")}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`lang-btn${lang === l.code ? " active" : ""}`}
                aria-pressed={lang === l.code}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Sits above the nav rather than buried at the bottom, where it
              needed a scroll past sixteen links to reach. */}
          <Link to="/" className="admin-back-link admin-back-top">
            <IconBack size={12} />
            {ta("backToSite")}
          </Link>

          <nav className="admin-nav" aria-label={ta("adminSections")}>
            {NAV_GROUPS.map((group) => (
              <div className="admin-nav-group" key={group.headingKey}>
                <p className="admin-nav-heading">{ta(group.headingKey)}</p>
                {group.items.map(({ to, end, icon, labelKey }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
                  >
                    <span className="admin-nav-icon">{icon}</span>
                    <span className="admin-nav-text">{ta(labelKey)}</span>
                  </NavLink>
                ))}
              </div>
            ))}

            {isSuperAdmin && (
              <div className="admin-nav-group">
                <p className="admin-nav-heading">{ta("groupSystem")}</p>
                <NavLink
                  to="/admin/settings"
                  className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
                >
                  <span className="admin-nav-icon"><IconGear /></span>
                  <span className="admin-nav-text">{ta("navSiteSettings")}</span>
                </NavLink>
                <NavLink
                  to="/admin/legal"
                  className={({ isActive }) => `admin-nav-item${isActive ? " active" : ""}`}
                >
                  <span className="admin-nav-icon"><IconGear /></span>
                  <span className="admin-nav-text">{ta("navLegalPages")}</span>
                </NavLink>
              </div>
            )}
          </nav>
        </div>

        <div className="admin-sidebar-foot">
          <div className="admin-user-chip">
            <span className="admin-user-avatar" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="admin-user-info">
              <p className="admin-user-name">{user.name}</p>
              <p className="admin-user-role">{isSuperAdmin ? ta("bossRole") : ta("adminRole")}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
