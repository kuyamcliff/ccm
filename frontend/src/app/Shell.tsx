import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "~/ui/Icon";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { SupportLauncher } from "~/features/support/SupportLauncher";

type NavItem = { to: string; label: string; icon: IconName };

/*
 * Five destinations, and the last two depend on who is looking.
 *
 * "Mine" is an empty room for somebody with no account, and "You" is a sign-in
 * page wearing the wrong name. A signed-out visitor gets the two things they
 * can actually act on instead: takeaway, and a way in.
 */
const NAV_SIGNED_OUT: NavItem[] = [
  { to: "/", label: "Home", icon: "flame" },
  { to: "/menu", label: "Menu", icon: "list" },
  { to: "/book", label: "Book", icon: "calendar" },
  { to: "/order", label: "Takeaway", icon: "bag" },
  { to: "/signin", label: "Sign in", icon: "user" },
];

const NAV_SIGNED_IN: NavItem[] = [
  { to: "/", label: "Home", icon: "flame" },
  { to: "/menu", label: "Menu", icon: "list" },
  { to: "/book", label: "Book", icon: "calendar" },
  { to: "/mine", label: "Mine", icon: "ticket" },
  { to: "/account", label: "You", icon: "user" },
];

function Wordmark() {
  return (
    <Link to="/" className="brand" aria-label="Cam Chop Meat, home">
      <img src="/mark.svg" alt="" className="brand__mark" width={32} height={32} />
      <span className="brand__name">
        Cam Chop <span>Meat</span>
      </span>
    </Link>
  );
}

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  const { count } = useBasket();
  const { user, isStaff } = useSession();
  const nav = user ? NAV_SIGNED_IN : NAV_SIGNED_OUT;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="topbar" data-scrolled={scrolled}>
      <Wordmark />

      <nav className="topnav" aria-label="Main">
        {nav.slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className="topnav__link">
            {item.label}
          </NavLink>
        ))}
        <NavLink to="/reviews" className="topnav__link">
          Reviews
        </NavLink>
        <NavLink to="/gallery" className="topnav__link">
          Gallery
        </NavLink>
      </nav>

      <div className="topbar__actions">
        {isStaff ? (
          <Link to="/desk" className="btn btn--ghost btn--sm" title="Staff console">
            <Icon name="grid" size={16} />
            Desk
          </Link>
        ) : null}

        <Link to="/order" className="btn btn--quiet btn--icon tally" aria-label={`Basket, ${count} items`}>
          <Icon name="basket" size={20} />
          {count > 0 ? (
            <span className="tally__count" aria-hidden="true">
              {count}
            </span>
          ) : null}
        </Link>

        {/* Signed out, this is a labelled invitation rather than a mystery
            icon: it is the one thing a new visitor may need to find. */}
        {user ? (
          <Link to="/account" className="btn btn--quiet btn--icon" aria-label="Your account">
            <Icon name="user" size={20} />
          </Link>
        ) : (
          <Link to="/signin" className="btn btn--ghost btn--sm">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function TabBar() {
  const { count } = useBasket();
  const { user } = useSession();
  const nav = user ? NAV_SIGNED_IN : NAV_SIGNED_OUT;

  return (
    <nav className="tabbar" aria-label="Main">
      {nav.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === "/"} className="tabbar__item">
          <span className="tabbar__icon">
            <Icon name={item.icon} size={22} />
            {/* The count belongs on the basket. Signed in there is no takeaway
                tab, and the basket icon in the top bar carries it instead. */}
            {item.to === "/order" && count > 0 ? (
              <span className="tally__count" aria-hidden="true" style={{ top: "-0.35rem", right: "-0.6rem" }}>
                {count}
              </span>
            ) : null}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  const { address, hours, phone, phoneHref, socials } = useVenue();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="page">
        <div className="footer__grid">
          <div>
            <Wordmark />
            <p className="fine muted" style={{ marginTop: "var(--s-3)", maxWidth: "24rem" }}>
              The best meat in Buea. Beef, chicken and more, cooked fresh every day. {address}.
            </p>
            <p className="fine faint" style={{ marginTop: "var(--s-2)" }}>
              {hours}
            </p>
          </div>

          <div>
            <p className="footer__heading">Come and eat</p>
            <div className="footer__links">
              <Link to="/menu">Menu and prices</Link>
              <Link to="/book">Book a table</Link>
              <Link to="/order">Order takeaway</Link>
              <Link to="/waitlist">Join the queue</Link>
              <Link to="/events">Private events</Link>
            </div>
          </div>

          <div>
            <p className="footer__heading">Get in touch</p>
            <div className="footer__links">
              {phoneHref ? <a href={phoneHref}>{phone}</a> : null}
              <Link to="/help">Message us</Link>
              {socials.map((social) => (
                <a key={social.label} href={social.url} target="_blank" rel="noreferrer noopener">
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {year} Cam Chop Meat, Buea</span>
          <span className="row" style={{ gap: "var(--s-4)" }}>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Every navigation starts at the top of the new page, the way a page load
    would, except when the browser is restoring a position on Back. */
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function Shell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <TopBar />
      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <SupportLauncher />
      <TabBar />
    </div>
  );
}
