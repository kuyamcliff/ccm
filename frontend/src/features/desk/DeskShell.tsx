import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "~/ui/Icon";
import type { AdminScope } from "~/lib/api";
import { Avatar } from "~/ui/Bits";
import { IconButton } from "~/ui/Button";
import { useSession } from "~/state/session";

import "~/styles/desk-search.css";

interface Item { to: string; label: string; icon: IconName; owner?: boolean; topOwner?: boolean; scope?: AdminScope; }
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Tonight", items: [{ to: "/desk", label: "Overview", icon: "chart" }, { to: "/desk/door", label: "Door", icon: "scan", scope: "door" }, { to: "/desk/bookings", label: "Bookings", icon: "calendar", scope: "bookings" }, { to: "/desk/orders", label: "Takeaway", icon: "bag", scope: "takeaway" }, { to: "/desk/queue", label: "Queue", icon: "users", scope: "queue" }, { to: "/desk/floor", label: "Floor", icon: "grid", scope: "floor" }] },
  { title: "The place", items: [{ to: "/desk/menu", label: "Menu", icon: "list", scope: "menu" }, { to: "/desk/offers", label: "Offers", icon: "flame", scope: "offers" }, { to: "/desk/gallery", label: "Photos", icon: "image", scope: "gallery" }, { to: "/desk/reviews", label: "Reviews", icon: "star", scope: "reviews" }, { to: "/desk/events", label: "Events", icon: "sparkle", scope: "events" }] },
  { title: "Money", items: [{ to: "/desk/money", label: "Payments", icon: "wallet", scope: "payments" }, { to: "/desk/promos", label: "Promo codes", icon: "tag", scope: "promos" }, { to: "/desk/cards", label: "Gift cards", icon: "gift", scope: "giftcards" }] },
  { title: "People", items: [{ to: "/desk/inbox", label: "Messages", icon: "message", scope: "messages" }, { to: "/desk/guests", label: "Guests", icon: "user", scope: "guests" }] },
  { title: "Website", items: [{ to: "/desk/insights", label: "Insights", icon: "chart", scope: "insights" }, { to: "/desk/settings", label: "Settings", icon: "settings", scope: "settings" }, { to: "/desk/site-control", label: "Site control", icon: "settings", topOwner: true }, { to: "/desk/legal", label: "Terms and privacy", icon: "receipt", scope: "legal" }, { to: "/desk/log", label: "Audit log", icon: "shield", owner: true }, { to: "/desk/access", label: "Access", icon: "lock", topOwner: true }] },
];

export function DeskShell() {
  const { user, isOwner, isTopOwner, can, signOut } = useSession();
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const { pathname } = useLocation();
  useEffect(() => setDrawer(false), [pathname]);
  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => { const visible = (!item.topOwner || isTopOwner) && (!item.owner || isOwner) && (!item.scope || can(item.scope)); return visible && (!normalized || `${group.title} ${item.label}`.toLowerCase().includes(normalized)); }) })).filter((group) => group.items.length > 0);
  }, [can, isOwner, isTopOwner, query]);
  return <div className="desk"><a className="skip-link" href="#desk-main">Skip to content</a><header className="desk__bar"><IconButton name={drawer ? "close" : "menu"} label={drawer ? "Close menu" : "Open menu"} className="desk__burger" onClick={() => setDrawer((open) => !open)} /><Link to="/desk" className="brand"><img src="/mark.svg" alt="" className="brand__mark" width={28} height={28} /><span className="brand__name">Desk<span>.</span></span></Link><div className="push row"><Link to="/" className="btn btn--quiet btn--sm"><Icon name="external" size={16} />The site</Link>{isTopOwner ? <Link to="/desk/site-control" className="btn btn--quiet btn--sm"><Icon name="settings" size={16} />Site control</Link> : null}<span className="desk__who"><Avatar name={user?.name ?? ""} /><span className="fine">{user?.name}<span className="faint"> {isTopOwner ? "owner" : isOwner ? "super admin" : "staff"}</span></span></span><IconButton name="logout" label="Sign out" onClick={() => void signOut()} /></div></header><div className="desk__body"><nav className={`desk__rail${drawer ? " desk__rail--open" : ""}`} aria-label="Console"><div className="desk__search"><label className="sr-only" htmlFor="desk-nav-search">Search console</label><div className="desk__searchbox"><Icon name="search" size={16} /><input id="desk-nav-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search console" autoComplete="off" /></div></div>{visibleGroups.length === 0 ? <p className="fine faint desk__no-results">No matching tools.</p> : visibleGroups.map((group) => <div key={group.title} className="desk__group"><p className="desk__grouptitle">{group.title}</p>{group.items.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/desk"} className="desk__link"><Icon name={item.icon} size={18} />{item.label}</NavLink>)}</div>)}</nav>{drawer ? <button type="button" className="desk__scrim" aria-label="Close menu" onClick={() => setDrawer(false)} /> : null}<main id="desk-main" className="desk__main" tabIndex={-1}><Outlet /></main></div></div>;
}
