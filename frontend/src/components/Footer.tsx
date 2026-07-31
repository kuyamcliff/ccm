import { Link } from "react-router-dom";
import { useSettings } from "../settings";
import { useT } from "../i18n/context";

export function Footer() {
  const t = useT("footer");
  const year = new Date().getFullYear();
  const { address, city, region, hours, phone, tiktok, instagram: ig, facebook: fb, whatsappHref } =
    useSettings();

  const chatHref = whatsappHref(`Hi, I'd like to ask about Cam Chop Meat in ${city}.`);

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <p className="footer-brand">Cam Chop <span style={{ color: "var(--amber)" }}>Meat</span></p>
          <p className="footer-desc">{t("desc")} {city}, {region}.</p>
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
          <span className="footer-label">{t("findUs")}</span>
          {address.split(",").map((line, i) => <p key={i}>{line.trim()}</p>)}
          <p>{hours}</p>
        </div>
        <div>
          <span className="footer-label">{t("contact")}</span>
          {phone && <p>{phone}</p>}
          {/* The floating chat button is hidden during checkout flows, so the
              WhatsApp channel lives here too and stays reachable everywhere. */}
          <a href={chatHref} target="_blank" rel="noopener noreferrer" className="social-link">
            {t("chatWhatsapp")}
          </a>
          <p>{t("payMomo")}</p>
        </div>
        <div>
          <span className="footer-label">{t("navigate")}</span>
          <Link to="/reserve">{t("bookTable")}</Link>
          <Link to="/menu">{t("menu")}</Link>
          <Link to="/about">{t("about")}</Link>
          <Link to="/reviews">{t("reviews")}</Link>
          <Link to="/privacy" className="footer-legal">{t("privacyPolicy")}</Link>
          <Link to="/terms" className="footer-legal">{t("termsOfUse")}</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {year} Cam Chop Meat, {city}. {t("copyright")}</p>
        <p className="footer-bottom-right">{t("bottomRight")}</p>
      </div>
    </footer>
  );
}
