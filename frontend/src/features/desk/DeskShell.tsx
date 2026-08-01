import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "~/ui/Icon";
import { Avatar } from "~/ui/Bits";
import { IconButton } from "~/ui/Button";
import { useSession } from "~/state/session";

/**
 * The staff console shell.
 *
 * A different application wearing the same design language: denser, colder,
 * and built for someone standing at a counter with one hand free. The customer
 * site's bottom tab bar would be wrong here — there are twenty destinations,
 * not five — so navigation is a rail that becomes a drawer under 64rem.
 */

interface Item {
  to: string;
  label: string;
  icon: IconName;
  /** Only the owner sees these. */
  owner?: boolean;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Tonight",
    items: [
      { to: "/desk", label: "Overview", icon: "chart" },
      { to: "/desk/door", label: "Door", icon: "scan" },
      { to: "/desk/bookings", label: "Bookings", icon: "calendar" },
      { to: "/desk/orders", label: "Takeaway", icon: "bag" },
      { to: "/desk/queue", label: "Queue", icon: "users" },
      { to: "/desk/floor", label: "Floor", icon: "grid" },
    ],
  },
  {
    title: "The place",
    items: [
      { to: "/desk/menu", label: "Menu", icon: "list" },
      { to: "/desk/offers", label: "Offers", icon: "flame" },
      { to: "/desk/gallery", label: "Photos", icon: "image" },
      { to: "/desk/reviews", label: "Reviews", icon: "star" },
      { to: "/desk/events", label: "Events", icon: "sparkle" },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/desk/money", label: "Payments", icon: "wallet" },
      { to: "/desk/promos", label: "Promo codes", icon: "tag" },
      { to: "/desk/cards", label: "Gift cards", icon: "gift" },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/desk/inbox", label: "Messages", icon: "message" },
      { to: "/desk/guests", label: "Guests", icon: "user" },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/desk/insights", label: "Insights", icon: "chart" },
      { to: "/desk/settings", label: "Details", icon: "settings" },
      { to: "/desk/legal", label: "Terms and privacy", icon: "receipt" },
      { to: "/desk/log", label: "Audit log", icon: "shield", owner: true },
    ],
  },
];

export function DeskShell() {
  const { user, isOwner, signOut } = useSession();
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();

  // A tap on a destination should close the drawer, not leave it covering the
  // page it just opened.
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="desk">
      <a className="skip-link" href="#desk-main">
        Skip to content
      </a>

      <header className="desk__bar">
        <IconButton
          name={drawer ? "close" : "menu"}
          label={drawer ? "Close menu" : "Open menu"}
          className="desk__burger"
          onClick={() => setDrawer((open) => !open)}
        />
        <Link to="/desk" className="brand">
          <img src="/mark.svg" alt="" className="brand__mark" width={28} height={28} />
          <span className="brand__name">
            Desk<span>.</span>
          </span>
        </Link>

        <div className="push row">
          <Link to="/" className="btn btn--quiet btn--sm">
            <Icon name="external" size={16} />
            The site
          </Link>
          <span className="desk__who">
            <Avatar name={user?.name ?? ""} />
            <span className="fine">
              {user?.name}
              <span className="faint"> {isOwner ? "owner" : "staff"}</span>
            </span>
          </span>
          <IconButton name="logout" label="Sign out" onClick={() => void signOut()} />
        </div>
      </header>

      <div className="desk__body">
        <nav className={`desk__rail${drawer ? " desk__rail--open" : ""}`} aria-label="Console">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.owner || isOwner);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="desk__group">
                <p className="desk__grouptitle">{group.title}</p>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === "/desk"} className="desk__link">
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {drawer ? <button type="button" className="desk__scrim" aria-label="Close menu" onClick={() => setDrawer(false)} /> : null}

        <main id="desk-main" className="desk__main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
