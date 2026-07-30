import { Link } from "react-router-dom";
import { useSettings } from "../settings";

export function Footer() {
  const year = new Date().getFullYear();
  const { address, city, region, hours, phone, tiktok, instagram: ig, facebook: fb, whatsappHref } =
    useSettings();

  const chatHref = whatsappHref(`Hi, I'd like to ask about Cam Chop Meat in ${city}.`);

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <p className="footer-brand">Cam Chop <span style={{ color: "var(--amber)" }}>Meat</span></p>
          <p className="footer-desc">Charcoal-grilled chicken, pork and goat. {city}, {region}.</p>
          <div className="footer-socials">
            {tiktok && (
              <a href={tiktok} target="_blank" rel="noopener" className="social-link">TikTok</a>
            )}
            {ig && (
              <a href={ig} target="_blank" rel="noopener" className="social-link">Instagram</a>
            )}
            {fb && (
              <a href={fb} target="_blank" rel="noopener" className="social-link">Facebook</a>
            )}
          </div>
        </div>
        <div>
          <span className="footer-label">Find us</span>
          {address.split(",").map((line, i) => <p key={i}>{line.trim()}</p>)}
          <p>{hours}</p>
        </div>
        <div>
          <span className="footer-label">Contact</span>
          {phone && <p>{phone}</p>}
          {/* The floating chat button is hidden during checkout flows, so the
              WhatsApp channel lives here too and stays reachable everywhere. */}
          <a href={chatHref} target="_blank" rel="noopener noreferrer" className="social-link">
            Chat on WhatsApp
          </a>
          <p>Pay by MTN Mobile Money</p>
        </div>
        <div>
          <span className="footer-label">Navigate</span>
          <Link to="/reserve">Book a table</Link>
          <Link to="/menu">Menu</Link>
          <Link to="/about">About</Link>
          <Link to="/reviews">Reviews</Link>
          <Link to="/privacy" className="footer-legal">Privacy policy</Link>
          <Link to="/terms" className="footer-legal">Terms of use</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {year} Cam Chop Meat, {city}. Grilled over real charcoal, daily.</p>
        <p className="footer-bottom-right">Dine in · Collect · We take bookings</p>
      </div>
    </footer>
  );
}
