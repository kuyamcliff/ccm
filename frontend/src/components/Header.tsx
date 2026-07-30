import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Header() {
  const { user, logout } = useAuth();
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
          Cam Chop <span className="brand-meat">Meat</span>
        </Link>
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
        <nav id="site-nav" className={`site-nav${open ? " open" : ""}`} aria-label="Main">
          <NavLink to="/menu" onClick={close}>Menu</NavLink>
          <NavLink to="/offers" onClick={close}>Offers</NavLink>
          <NavLink to="/gallery" onClick={close}>Gallery</NavLink>
          <NavLink to="/about" onClick={close}>About</NavLink>
          <NavLink to="/reviews" onClick={close}>Reviews</NavLink>
          {user ? (
            <>
              <NavLink to="/my-tables" onClick={close}>My Tables</NavLink>
              <NavLink to="/account" onClick={close}>Account</NavLink>
              {(user.role === "admin" || user.role === "super_admin") ? (
                <NavLink to="/admin" onClick={close} className="admin-link">Admin</NavLink>
              ) : null}
              <button className="link-btn" onClick={handleLogout}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login" onClick={close}>Sign in</NavLink>
          )}
          <NavLink to="/reserve" className="btn btn-amber" onClick={close}>Book a table</NavLink>
        </nav>
      </div>
    </header>
  );
}
