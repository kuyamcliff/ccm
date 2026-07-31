import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useLanguage } from "../i18n/context";
import { LANGUAGES } from "../i18n/translations";

export function Header() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleLogout() {
    await logout();
    setOpen(false);
    navigate("/");
  }

  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand" onClick={close}>
          {t("nav", "brandFirst")} <span className="brand-meat">{t("nav", "brandSecond")}</span>
        </Link>
        <div className="header-actions">
          <div className="lang-toggle" role="group" aria-label={t("common", "language")}>
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
          <button
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="site-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
              </svg>
            </span>
          </button>
        </div>
        <nav id="site-nav" className={`site-nav${open ? " open" : ""}`} aria-label="Main">
          <NavLink to="/menu" onClick={close}>{t("nav", "menu")}</NavLink>
          <NavLink to="/offers" onClick={close}>{t("nav", "offers")}</NavLink>
          <NavLink to="/gallery" onClick={close}>{t("nav", "gallery")}</NavLink>
          <NavLink to="/about" onClick={close}>{t("nav", "about")}</NavLink>
          <NavLink to="/reviews" onClick={close}>{t("nav", "reviews")}</NavLink>
          {user ? (
            <>
              <NavLink to="/my-tables" onClick={close}>{t("nav", "myTables")}</NavLink>
              <NavLink to="/account" onClick={close}>{t("nav", "account")}</NavLink>
              {(user.role === "admin" || user.role === "super_admin") ? (
                <NavLink to="/admin" onClick={close} className="admin-link">{t("nav", "admin")}</NavLink>
              ) : null}
              <button className="link-btn" onClick={handleLogout}>{t("nav", "signOut")}</button>
            </>
          ) : (
            <NavLink to="/login" onClick={close}>{t("nav", "signIn")}</NavLink>
          )}
          <NavLink to="/reserve" className="btn btn-amber" onClick={close}>{t("nav", "bookTable")}</NavLink>
        </nav>
      </div>
    </header>
  );
}
