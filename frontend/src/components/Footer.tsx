import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <p className="footer-brand">Cam Chop Meat</p>
          <p>Charcoal-grilled chicken, pork and goat. Buea, South West Region, Cameroon.</p>
        </div>
        <div>
          <p className="footer-label">Visit</p>
          <p>Opposite the Survey School, Clerks Quarters, Buea</p>
          {/* PLACEHOLDER: confirm real opening hours with the owner */}
          <p>Open daily, midday till late</p>
        </div>
        <div>
          <p className="footer-label">Talk to us</p>
          {/* PLACEHOLDER: replace with the real phone number */}
          <p>+237 000 000 000</p>
          <p>
            <a href="https://www.tiktok.com/@cam.chop.meat" target="_blank" rel="noopener">
              @cam.chop.meat on TikTok
            </a>
          </p>
        </div>
        <div>
          <p className="footer-label">Do something</p>
          <p>
            <Link to="/reserve">Book a table</Link>
          </p>
          <p>
            <Link to="/reviews">Read the reviews</Link>
          </p>
        </div>
      </div>
      <p className="footer-fine">© 2026 Cam Chop Meat, Buea. Grilled daily.</p>
    </footer>
  );
}
