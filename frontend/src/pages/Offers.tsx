import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Offer } from "../api";
import { OfferIcon } from "../components/Icons";
import { Reveal } from "../components/Reveal";
import { useT } from "../i18n/context";

/** Long-form date for the expiry line, or the raw value if it will not parse. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function OffersPage() {
  const t = useT("offers");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.offers()
      .then((d) => setOffers(d.offers))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ofrs">
      <header className="ofrs-hero">
        <div className="ofrs-inner">
          <h1 className="ofrs-title animate-up">{t("title")}</h1>
          <p className="ofrs-lede animate-up delay-1">{t("lede")}</p>
        </div>
      </header>

      <div className="ofrs-inner ofrs-body">
        {loading && <div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div>}

        {!loading && offers.length === 0 && (
          <div className="ofrs-empty">
            <p>{t("empty")}</p>
            <Link to="/menu" className="btn btn-outline">{t("seeMenu")}</Link>
          </div>
        )}

        {offers.length > 0 && (
          <div className="offers-grid">
            {/* The reveal sits on a wrapper, not the card: both animate
                `transform`, and sharing one element would let the settled
                reveal state override the card's hover lift. */}
            {offers.map((o, i) => (
              <Reveal key={o.id} delay={i * 60}>
                <article className="offer-card">
                  <span className="offer-icon"><OfferIcon name={o.icon || "flame"} size={22} /></span>
                  {o.badge && <span className="offer-badge">{o.badge}</span>}
                  <h2 className="offer-title">{o.title}</h2>
                  {o.description && <p className="offer-desc">{o.description}</p>}
                  {o.valid_until && <p className="offer-expires">{t("validUntil")} {longDate(o.valid_until)}</p>}
                </article>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
