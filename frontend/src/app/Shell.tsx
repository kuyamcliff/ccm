import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import { Icon, type IconName } from "~/ui/Icon";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { usePress } from "~/ui/press";
import { SiteNotices } from "~/ui/SiteNotices";
import { NetworkStatus } from "~/ui/NetworkStatus";
import { LanguageSwitcher } from "~/ui/LanguageSwitcher";
import { SupportLauncher } from "~/features/support/SupportLauncher";

/**
 * The frame around every customer screen.
 *
 * Navigation is a bottom tab bar on a phone and a top bar from 60rem up. Not
 * both: a phone showing a top nav *and* a tab bar spends a fifth of a small
 * screen on chrome, and the top one is out of thumb reach anyway.
 */

function Wordmark({ compact }: { compact?: boolean }) {
  const press = usePress();
  return (
    <Link to="/" className="brand" aria-label="Cam Chop Meat, home" {...press.pressProps}>
      <img src="/mark.svg" alt="" className="brand__mark" width={26} height={26} />
      {compact ? null : (
        <span className="brand__name">
          Cam Chop <span>Meat</span>
        </span>
      )}
    </Link>
  );
}

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  const { count } = useBasket();
  const { user, isStaff } = useSession();
  const { phoneHref, siteConfig } = useVenue();
  const { c } = useCopy();

  /*
   * The bar gains its ground once the page is off the top.
   *
   * Read through requestAnimationFrame and a queued flag, so a fast scroll
   * produces one layout read per frame rather than one per scroll event. On a
   * mid range Android the naive version is a measurable part of a janky scroll.
   */
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        queued = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="topbar" data-scrolled={scrolled ? "true" : undefined}>
      <Wordmark />

      <nav className="topnav" aria-label="Main">
        <NavLink to="/menu" className="topnav__link" viewTransition>
          {c.nav.menu}
        </NavLink>
        {siteConfig.features.ordering ? (
          <NavLink to="/order" className="topnav__link" viewTransition>
            {c.nav.order}
          </NavLink>
        ) : null}
        {siteConfig.features.booking ? (
          <NavLink to="/book" className="topnav__link" viewTransition>
            {c.nav.book}
          </NavLink>
        ) : null}
        <NavLink to="/story" className="topnav__link" viewTransition>
          {c.nav.story}
        </NavLink>
        <NavLink to="/find" className="topnav__link" viewTransition>
          {c.nav.find}
        </NavLink>
      </nav>

      <div className="topbar__actions">
        <LanguageSwitcher />

        {isStaff ? (
          <Link to="/desk" className="btn btn--ghost btn--sm topbar__desk">
            <Icon name="grid" size={15} />
            {c.nav.desk}
          </Link>
        ) : null}

        {siteConfig.support.phone && phoneHref ? (
          <a href={phoneHref} className="btn btn--quiet btn--icon btn--sm" aria-label={c.nav.call}>
            <Icon name="phone" size={18} />
          </a>
        ) : null}

        {siteConfig.features.ordering ? (
          <Link
            to="/order"
            className="btn btn--quiet btn--icon btn--sm tally"
            aria-label={`${c.nav.basket}, ${count} items`}
            viewTransition
          >
            <Icon name="basket" size={18} />
            {count > 0 ? (
              <span className="tally__count" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </Link>
        ) : null}

        {!user && siteConfig.features.customerAccounts ? (
          <Link to="/signin" className="btn btn--ghost btn--sm topbar__signin" viewTransition>
            {c.nav.signIn}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The bottom bar, on phones.
 *
 * Five slots, never more: past five the labels have to shrink below the 10px
 * floor and the targets drop under a thumb's width. Which five depends on
 * whether the person is signed in, because "My visits" is worth more to somebody
 * with a booking than "Find us" is.
 */
function TabBar() {
  const { count } = useBasket();
  const { user } = useSession();
  const { siteConfig } = useVenue();
  const { c } = useCopy();

  const items: { to: string; label: string; icon: IconName }[] = [
    { to: "/", label: c.nav.home, icon: "flame" },
    { to: "/menu", label: c.nav.menu, icon: "list" },
  ];

  if (siteConfig.features.ordering) items.push({ to: "/order", label: c.nav.order, icon: "bag" });
  else if (siteConfig.features.booking) items.push({ to: "/book", label: c.nav.book, icon: "calendar" });

  if (user && siteConfig.features.customerAccounts) {
    items.push({ to: "/mine", label: c.nav.mine, icon: "ticket" }, { to: "/account", label: c.nav.you, icon: "user" });
  } else {
    items.push({ to: "/find", label: c.nav.find, icon: "pin" });
  }

  return (
    <nav className="tabbar" aria-label="Main">
      {items.slice(0, 5).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className="tabbar__item"
          viewTransition
        >
          <span className="tabbar__icon">
            <Icon name={item.icon} size={21} />
            {item.to === "/order" && count > 0 ? (
              <span className="tally__count tally__count--tab" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </span>
          <span className="tabbar__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The footer.
 *
 * Deliberately short. The version before this one had three columns of headings
 * with up to six links each, which on a phone is a wall of blue-ish text roughly
 * the height of a screen that nobody reads and everybody scrolls past. It also
 * duplicated the tab bar, which is two taps away at all times.
 *
 * What is left is what is genuinely only here: the address and hours, a way to
 * ring or message, the socials, and the two legal pages. One line each.
 */
function Footer() {
  const { address, hours, phone, phoneHref, whatsappHref, socials, siteConfig } = useVenue();
  const { c } = useCopy();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="page footer__inner">
        <div className="footer__lead">
          <Wordmark />
          <p className="fine muted">{address}</p>
          <p className="fine faint">{hours}</p>
        </div>

        {/*
          * Only what is not somewhere else.
          *
          * Menu, Book and Find us all came out: every one of them is a tab at
          * the bottom of the screen at all times, so putting them here again is
          * asking somebody to scroll to the end of a page to reach something
          * already under their thumb. What is left is what genuinely lives
          * nowhere else — the legal pages, a way to reach a person, and the
          * socials people actually arrive from.
          */}
        <nav className="footer__links" aria-label="Footer">
          <Link to="/terms" viewTransition>
            {c.nav.terms}
          </Link>
          <Link to="/privacy" viewTransition>
            {c.nav.privacy}
          </Link>
          {siteConfig.features.supportChat && siteConfig.support.enabled ? (
            <Link to="/help" viewTransition>
              {c.nav.help}
            </Link>
          ) : null}
          {siteConfig.support.phone && phone && phoneHref ? <a href={phoneHref}>{c.find.phone}</a> : null}
          {siteConfig.support.whatsapp && whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noreferrer noopener">
              WhatsApp
            </a>
          ) : null}
          {socials.map((social) => (
            <a key={social.label} href={social.url} target="_blank" rel="noreferrer noopener">
              {social.label}
            </a>
          ))}
        </nav>

        <div className="footer__bottom fine faint">
          <span>
            &copy; {year} {c.footer.rights}
          </span>
        </div>
      </div>
    </footer>
  );
}

/**
 * Back to the top on every navigation.
 *
 * Not on a back gesture: React Router restores the scroll position itself for
 * POP navigations, and overriding it means the back button dumps somebody at the
 * top of a menu they had scrolled halfway down.
 */
function ScrollReset() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    /* POP is the back or forward gesture. The browser and the router between
       them restore where the person was, and overriding that dumps somebody at
       the top of a menu they had scrolled halfway down. */
    if (navigationType === "POP") return;
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}

export function Shell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <NetworkStatus />
      <TopBar />
      <SiteNotices />
      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <SupportLauncher />
      <TabBar />
    </div>
  );
}
