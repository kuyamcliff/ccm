import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { AdminScope } from "~/lib/api";
import { Icon, type IconName } from "~/ui/Icon";
import { IconButton } from "~/ui/Button";
import { usePress } from "~/ui/press";
import { useSession } from "~/state/session";

/**
 * The console's own chrome.
 *
 * A rail on a desk, a drawer on a phone. The customer shell's bottom tab bar
 * does not work here: there are twenty-odd screens and no five of them are the
 * five somebody needs, so the navigation has to be a list rather than a bar.
 *
 * ── What the rail hides, and what it does not ──────────────────────────────
 *
 * Items are filtered by role and by scope, so an admin restricted to the door
 * does not see a link to Payments. **That is convenience, not access control.**
 * Every route behind these links is enforced again on the server by
 * `requireAdmin` and `requireScope`, and a restricted admin who types the URL
 * gets a 403 from the API rather than a page full of data. It is worth being
 * blunt about that here, because a rail that filters is exactly the kind of
 * thing somebody later mistakes for security.
 */

interface Item {
  to: string;
  label: string;
  icon: IconName;
  /** Hidden unless the signed-in admin holds this scope. */
  scope?: AdminScope;
  /** Super admin, owner or developer. */
  owner?: boolean;
  /** Owner or developer only. */
  topOwner?: boolean;
  /** The developer tier only. */
  developer?: boolean;
  end?: boolean;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Tonight",
    items: [
      { to: "/desk", label: "Overview", icon: "grid", end: true },
      { to: "/desk/door", label: "Door", icon: "scan", scope: "door" },
      { to: "/desk/bookings", label: "Bookings", icon: "calendar", scope: "bookings" },
      { to: "/desk/orders", label: "Orders", icon: "bag", scope: "takeaway" },
      { to: "/desk/queue", label: "Queue", icon: "users", scope: "queue" },
      { to: "/desk/floor", label: "Floor", icon: "grid", scope: "floor" },
    ],
  },
  {
    title: "The place",
    items: [
      { to: "/desk/menu", label: "Menu", icon: "list", scope: "menu" },
      { to: "/desk/offers", label: "Offers", icon: "tag", scope: "offers" },
      { to: "/desk/gallery", label: "Photos", icon: "image", scope: "gallery" },
      { to: "/desk/reviews", label: "Reviews", icon: "star", scope: "reviews" },
      { to: "/desk/events", label: "Events", icon: "sparkle", scope: "events" },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/desk/money", label: "Payments", icon: "wallet", scope: "payments" },
      { to: "/desk/promos", label: "Promo codes", icon: "tag", scope: "promos" },
      { to: "/desk/cards", label: "Gift cards", icon: "gift", scope: "giftcards" },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/desk/inbox", label: "Messages", icon: "message", scope: "messages" },
      { to: "/desk/guests", label: "Guests", icon: "user", scope: "guests" },
      { to: "/desk/reminders", label: "Reminders", icon: "bell", scope: "messages" },
    ],
  },
  {
    title: "The site",
    items: [
      { to: "/desk/insights", label: "Insights", icon: "chart", scope: "insights" },
      { to: "/desk/settings", label: "Details", icon: "settings", scope: "settings" },
      { to: "/desk/site-control", label: "Site control", icon: "sliders", topOwner: true },
      { to: "/desk/translations", label: "Translations", icon: "globe", scope: "settings" },
      { to: "/desk/legal", label: "Terms and privacy", icon: "receipt", scope: "legal" },
      { to: "/desk/log", label: "Audit log", icon: "list", owner: true },
      { to: "/desk/access", label: "Staff access", icon: "shield", topOwner: true },
    ],
  },
  {
    title: "Developer",
    items: [
      { to: "/desk/dev", label: "System", icon: "activity", developer: true, end: true },
      { to: "/desk/dev/errors", label: "Errors", icon: "bug", developer: true },
      { to: "/desk/dev/flags", label: "Flags", icon: "flag", developer: true },
      { to: "/desk/dev/data", label: "Database", icon: "database", developer: true },
      { to: "/desk/dev/impersonate", label: "Impersonate", icon: "users", developer: true },
    ],
  },
];

export function DeskShell() {
  const { user, isOwner, isTopOwner, isDeveloper, can } = useSession();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);

  /* The drawer is a phone thing and it must close on navigation, or tapping a
     link leaves somebody looking at the menu they just used. */
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const visible = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.developer) return isDeveloper;
      if (item.topOwner) return isTopOwner;
      if (item.owner) return isOwner;
      if (item.scope) return can(item.scope);
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="dk" data-drawer={drawer ? "open" : undefined}>
      <header className="dk-top">
        <IconButton
          name={drawer ? "close" : "menu"}
          label={drawer ? "Close menu" : "Open menu"}
          className="dk-top__burger"
          onClick={() => setDrawer((current) => !current)}
        />

        <Link to="/desk" className="dk-brand">
          <img src="/mark.svg" alt="" width={20} height={20} />
          <span>Desk</span>
        </Link>

        <div className="push bar bar--tight">
          {user ? <span className="fine faint dk-top__who">{user.name}</span> : null}
          <Link to="/" className="btn btn--quiet btn--sm">
            <Icon name="external" size={15} />
            <span className="dk-top__site">The site</span>
          </Link>
        </div>
      </header>

      {/* Only on a phone, and only while the drawer is open. */}
      {drawer ? <div className="dk-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}

      <nav className="dk-rail" aria-label="Console">
        {visible.map((group) => (
          <div key={group.title} className="dk-rail__group">
            <p className="label dk-rail__title">{group.title}</p>
            {group.items.map((item) => (
              <RailLink key={item.to} item={item} />
            ))}
          </div>
        ))}
      </nav>

      <main className="dk-main" id="main">
        <Outlet />
      </main>
    </div>
  );
}

function RailLink({ item }: { item: Item }) {
  const press = usePress();
  return (
    <NavLink to={item.to} end={item.end} className="dk-rail__link" viewTransition {...press.pressProps}>
      <Icon name={item.icon} size={16} />
      <span>{item.label}</span>
    </NavLink>
  );
}
