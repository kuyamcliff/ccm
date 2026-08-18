import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon } from "~/ui/Icon";
import type { IconName } from "~/ui/Icon";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useLocale } from "~/state/locale";
import { useVenue } from "~/state/venue";
import { phoneLabel } from "~/lib/format";
import { SupportLauncher } from "~/features/support/SupportLauncher";
import { SiteNotices } from "~/ui/SiteNotices";
import { LanguageSwitcher } from "~/ui/LanguageSwitcher";

function Wordmark() { return <Link to="/" className="brand" aria-label="Cam Chop Meat, home"><img src="/mark.svg" alt="" className="brand__mark" width={32} height={32} /><span className="brand__name">Cam Chop <span>Meat</span></span></Link>; }

function TopBar() {
  const [scrolled, setScrolled] = useState(false); const { count } = useBasket(); const { user, isStaff } = useSession(); const { phoneHref, siteConfig } = useVenue(); const { t } = useLocale();
  useEffect(() => { let queued = false; const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(() => { setScrolled(window.scrollY > 8); queued = false; }); }; onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); return () => window.removeEventListener("scroll", onScroll); }, []);
  return <header className="topbar" data-scrolled={scrolled}><Wordmark /><nav className="topnav" aria-label="Main"><NavLink to="/menu" className="topnav__link">{t("menu")}</NavLink>{siteConfig.features.ordering ? <NavLink to="/order" className="topnav__link">{t("takeaway")}</NavLink> : null}{siteConfig.features.booking ? <NavLink to="/book" className="topnav__link">{t("book")}</NavLink> : null}<NavLink to="/story" className="topnav__link">{t("story")}</NavLink><NavLink to="/find" className="topnav__link">{t("find")}</NavLink></nav><div className="topbar__actions"><LanguageSwitcher />{isStaff ? <Link to="/desk" className="btn btn--ghost btn--sm topbar__desk" title={t("admin")} aria-label={t("admin")}><Icon name="grid" size={16} />{t("admin")}</Link> : null}{siteConfig.support.phone && phoneHref ? <a href={phoneHref} className="btn btn--quiet btn--icon topbar__call" aria-label={t("call")}><Icon name="phone" size={20} /></a> : null}{siteConfig.features.ordering ? <Link to="/order" className="btn btn--quiet btn--icon tally" aria-label={`${t("basket")}, ${count} items`}><Icon name="basket" size={20} />{count > 0 ? <span className="tally__count" aria-hidden="true">{count}</span> : null}</Link> : null}{user && siteConfig.features.customerAccounts ? <Link to="/account" className="btn btn--quiet btn--icon" aria-label={t("account")}><Icon name="user" size={20} /></Link> : !user && siteConfig.features.customerAccounts ? <Link to="/signin" className="btn btn--ghost btn--sm">{t("signIn")}</Link> : null}</div></header>;
}

function TabBar() {
  const { count } = useBasket(); const { user } = useSession(); const { siteConfig } = useVenue(); const { t } = useLocale();
  const nav: { to: string; label: string; icon: IconName }[] = [{ to: "/", label: t("home"), icon: "flame" }, { to: "/menu", label: t("menu"), icon: "list" }];
  if (siteConfig.features.ordering) nav.push({ to: "/order", label: t("takeaway"), icon: "bag" }); else if (siteConfig.features.booking) nav.push({ to: "/book", label: t("book"), icon: "calendar" });
  if (user && siteConfig.features.customerAccounts) nav.push({ to: "/mine", label: t("mine"), icon: "ticket" }, { to: "/account", label: t("account"), icon: "user" }); else nav.push({ to: "/find", label: t("find"), icon: "pin" });
  return <nav className="tabbar" aria-label="Main">{nav.slice(0, 5).map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} className="tabbar__item"><span className="tabbar__icon"><Icon name={item.icon} size={22} />{item.to === "/order" && count > 0 ? <span className="tally__count" aria-hidden="true" style={{ top: "-0.35rem", right: "-0.6rem" }}>{count}</span> : null}</span>{item.label}</NavLink>)}</nav>;
}

function Footer() {
  const { address, hours, phone, phoneHref, whatsappHref, socials, siteConfig } = useVenue(); const { t } = useLocale(); const year = new Date().getFullYear();
  return <footer className="footer"><div className="page"><div className="footer__grid"><div><Wordmark /><p className="fine muted" style={{ marginTop: "var(--s-3)", maxWidth: "24rem" }}>{t("freshFooter")} {address}.</p><p className="fine faint" style={{ marginTop: "var(--s-2)" }}>{hours}</p></div><div><p className="footer__heading">{t("comeEat")}</p><div className="footer__links"><Link to="/menu">{t("menu")}</Link>{siteConfig.features.ordering ? <Link to="/order">{t("takeaway")}</Link> : null}{siteConfig.features.booking ? <Link to="/book">{t("book")}</Link> : null}{siteConfig.features.waitlist ? <Link to="/waitlist">{t("waitlist")}</Link> : null}{siteConfig.features.events ? <Link to="/events">{t("events")}</Link> : null}</div></div><div><p className="footer__heading">{t("reachUs")}</p><div className="footer__links">{siteConfig.support.phone && phone && phoneHref ? <a href={phoneHref}>{phoneLabel(phone)}</a> : null}{siteConfig.support.whatsapp && whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer noopener">WhatsApp</a> : null}<Link to="/find">{t("find")}</Link><Link to="/story">{t("story")}</Link>{siteConfig.features.supportChat && siteConfig.support.enabled ? <Link to="/help">{t("help")}</Link> : null}{socials.map((social) => <a key={social.label} href={social.url} target="_blank" rel="noreferrer noopener">{social.label}</a>)}</div></div></div><div className="footer__bottom"><span>© {year} Cam Chop Meat, Buea</span><span className="row" style={{ gap: "var(--s-4)" }}><Link to="/terms">{t("terms")}</Link><Link to="/privacy">{t("privacy")}</Link></span></div></div></footer>;
}

function ScrollReset() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; }
export function Shell() { const { pathname } = useLocation(); return <div className="shell"><a className="skip-link" href="#main">Skip to content</a><ScrollReset /><TopBar /><SiteNotices /><main key={pathname} id="main" className="shell__main route-in" tabIndex={-1}><Outlet /></main><Footer /><SupportLauncher /><TabBar /></div>; }
