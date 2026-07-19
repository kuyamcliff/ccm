import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
          {open ? "Close" : "Menu"}
        </button>
        <nav id="site-nav" className={open ? "site-nav open" : "site-nav"} aria-label="Main">
          <NavLink to="/menu" onClick={close}>
            Menu
          </NavLink>
          <NavLink to="/reviews" onClick={close}>
            Reviews
          </NavLink>
          {user ? (
            <>
              <NavLink to="/account" onClick={close}>
                My tables
              </NavLink>
              <button className="link-btn" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login" onClick={close}>
              Sign in
            </NavLink>
          )}
          <NavLink to="/reserve" className="btn btn-red" onClick={close}>
            Book a table
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
