import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Review, MenuItem, Offer } from "../api";
import { MARQUEE_ITEMS } from "../data/menu";
import { Stars } from "../components/Stars";
import { useReveal } from "../hooks/useReveal";
import { useSettings } from "../settings";
import { useT } from "../i18n/context";
import {
  IconBox, IconCalendar, IconChair, IconChicken, IconChild, IconDrink,
  IconFlame, IconGroup, IconMeat, IconMusic, IconParking, IconPepper,
  OfferIcon,
} from "../components/Icons";

const AMENITY_ICONS = [
  { Icon: IconFlame, key: "amenityFlame" },
  { Icon: IconChicken, key: "amenityChicken" },
  { Icon: IconMeat, key: "amenityMeat" },
  { Icon: IconPepper, key: "amenityPepper" },
  { Icon: IconDrink, key: "amenityDrink" },
  { Icon: IconGroup, key: "amenityGroup" },
  { Icon: IconChild, key: "amenityChild" },
  { Icon: IconParking, key: "amenityParking" },
  { Icon: IconChair, key: "amenityDine" },
  { Icon: IconBox, key: "amenityBox" },
  { Icon: IconCalendar, key: "amenityCalendar" },
  { Icon: IconMusic, key: "amenityMusic" },
] as const;

export function Home() {
  const t = useT("home");
  const { city, address, hours } = useSettings();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [topItems, setTopItems] = useState<MenuItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const marquee = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  const AMENITIES = AMENITY_ICONS.map((a) => ({ Icon: a.Icon, label: t(a.key) }));

  useReveal();

  useEffect(() => {
    api.reviews().then((r) => setReviews(r.reviews.slice(0, 3))).catch(() => {});
    api.popular().then((r) => setTopItems(r.topItems.slice(0, 3))).catch(() => {});
    api.offers().then((r) => setOffers(r.offers.filter((o: Offer) => o.is_active).slice(0, 4))).catch(() => {});
  }, []);

  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        {/* Served at three widths; the browser picks by viewport so a phone
            pulls 39 kB rather than the full 137 kB. */}
        <div className="hero-photo" aria-hidden="true">
          <img
            src="/hero-grill-1000.webp"
            srcSet="/hero-grill-600.webp 600w, /hero-grill-1000.webp 1000w, /hero-grill-1600.webp 1600w"
            sizes="100vw"
            alt=""
            width={1600}
            height={1120}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        {/* The rotating stamp that used to sit here was fighting the photo for
            the same space and reading as clutter. The picture carries the
            weight now. */}
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow animate-up">{t("eyebrow")} . {address}</p>
            <h1 className="animate-up delay-1">
              {t("heroTitleStart")} <em>{t("heroTitleEm")}</em>
            </h1>
            <p className="hero-lede animate-up delay-2">{t("heroLede")}</p>
            <div className="hero-actions animate-up delay-3">
              <Link to="/reserve" className="btn btn-amber btn-big">{t("bookTable")}</Link>
              <Link to="/menu" className="btn btn-outline btn-big">{t("seeMenu")}</Link>
            </div>
            <div className="hero-chips animate-up delay-4">
              <span className="hero-chip">{t("chipOpen")}</span>
              <span className="hero-chip">{t("chipDine")}</span>
              <span className="hero-chip">{t("chipFrom")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {marquee.map((item, i) => (
            <span key={i}>{item} <b aria-hidden="true">/</b></span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className="section section-dark reveal">
        <div className="section-inner">
          <p className="section-label animate-up">{t("howLabel")}</p>
          <h2 className="section-title animate-up delay-1">{t("howTitle")}</h2>
          <ol className="steps">
            <li className="animate-up delay-1">
              <span className="step-no">1</span>
              <h3>{t("step1Title")}</h3>
              <p>{t("step1Body")}</p>
            </li>
            <li className="animate-up delay-2">
              <span className="step-no">2</span>
              <h3>{t("step2Title")}</h3>
              <p>{t("step2Body")}</p>
            </li>
            <li className="animate-up delay-3">
              <span className="step-no">3</span>
              <h3>{t("step3Title")}</h3>
              <p>{t("step3Body")}</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── POPULAR / MENU PREVIEW ── */}
      {topItems.length > 0 && (
        <section className="section reveal">
          <div className="section-inner">
            <div className="section-header-row">
              <div>
                <p className="section-label animate-up">{t("popularLabel")}</p>
                <h2 className="section-title animate-up delay-1">{t("popularTitle")}</h2>
              </div>
              <Link to="/menu" className="btn btn-outline animate-up delay-1">{t("fullMenu")}</Link>
            </div>
            <div className="popular-grid">
              {topItems.map((item, i) => (
                <div key={item.id} className={`popular-card animate-up delay-${i + 1 as 1|2|3}`}>
                  <div
                    className="popular-card-img"
                    /* Only ever the longhand. Setting `background` alongside
                       `backgroundImage` in one style object makes React clear
                       the longhand on re-render, which left every card blank. */
                    style={{
                      backgroundImage: item.image_url
                        ? `url("${item.image_url}")`
                        : "radial-gradient(ellipse at center, rgba(224,123,46,0.22) 0%, rgba(11,9,6,0.8) 70%)",
                    }}
                  />
                  <div className="popular-card-overlay" />
                  <div className="popular-card-body">
                    <p className="popular-card-cat">{item.category}</p>
                    <h3 className="popular-card-name">{item.name}</h3>
                    {item.price_fcfa && (
                      <p className="popular-card-price">{t("priceFrom")} {item.price_fcfa.toLocaleString()} FCFA</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── ABOUT SPLIT ── */}
      <section className="section reveal">
        <div className="section-inner split">
          <div className="split-text animate-up">
            <p className="section-label">{t("nameLabel")}</p>
            <h2 className="section-title">
              {t("aboutTitle").split("\n").map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </h2>
            <p>{t("aboutBody1").replace("{city}", city).replace("{address}", address)}</p>
            <p>{t("aboutBody2")}</p>
            <p className="section-cta">
              <Link to="/about" className="btn btn-outline">{t("ourStory")}</Link>
            </p>
          </div>
          <blockquote className="pull-quote animate-up delay-2">
            &ldquo;{t("quote")}&rdquo;
          </blockquote>
        </div>
      </section>

      {/* ── AMENITIES ── */}
      <section className="section section-dark reveal">
        <div className="section-inner">
          <p className="section-label animate-up">{t("amenitiesLabel")}</p>
          <h2 className="section-title animate-up delay-1">
            {t("amenitiesTitle").split("\n").map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </h2>
          <div className="amenities-grid">
            {AMENITIES.map((a, i) => (
              <div key={a.label} className={`amenity-card animate-up delay-${Math.min(i % 4 + 1, 4) as 1 | 2 | 3 | 4}`}>
                <span className="amenity-icon"><a.Icon size={22} /></span>
                <span className="amenity-label">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPECIAL OFFERS ── */}
      {offers.length > 0 && (
        <section className="section section-dark reveal">
          <div className="section-inner">
            <div className="section-header-row">
              <div>
                <p className="section-label animate-up">{t("offersLabel")}</p>
                <h2 className="section-title animate-up delay-1">{t("offersTitle")}</h2>
              </div>
              <Link to="/offers" className="btn btn-outline animate-up delay-1">{t("allOffers")}</Link>
            </div>
            <div className="offers-home-grid">
              {offers.map((offer, i) => (
                <div key={offer.id} className={`offers-home-card animate-up delay-${Math.min(i + 1, 4) as 1|2|3|4}`}>
                  <span className="offers-home-icon"><OfferIcon name={offer.icon || "flame"} size={20} /></span>
                  {offer.badge && <span className="offers-home-badge">{offer.badge}</span>}
                  <h3 className="offers-home-title">{offer.title}</h3>
                  <p className="offers-home-desc">{offer.description}</p>
                  {offer.valid_until && (
                    <p className="offers-home-until">{t("until")} {new Date(offer.valid_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── REVIEWS ── */}
      {reviews.length > 0 && (
        <section className="section reveal">
          <div className="section-inner">
            <div className="section-header-row">
              <div>
                <p className="section-label animate-up">{t("reviewsLabel")}</p>
                <h2 className="section-title animate-up delay-1">{t("reviewsTitle")}</h2>
              </div>
              <Link to="/reviews" className="btn btn-outline animate-up delay-1">{t("allReviews")}</Link>
            </div>
            <div className="review-grid">
              {reviews.map((r, i) => (
                <article key={r.id} className={`review-card animate-up delay-${(i + 1) as 1 | 2 | 3}`}>
                  <Stars value={r.rating} />
                  <p className="review-text">{r.text}</p>
                  {(r.media_urls?.length ?? 0) > 0 && (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
                      {r.media_urls.filter((u) => !u.startsWith("data:video")).slice(0, 3).map((url, j) => (
                        <img key={j} src={url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, display: "block" }} loading="lazy" />
                      ))}
                    </div>
                  )}
                  <p className="review-author">{r.author}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="section home-cta-section">
        <div className="section-inner center">
          <p className="section-label animate-up">{t("readyLabel")}</p>
          <h2 className="closing-head animate-up delay-1">{t("hungry")}</h2>
          <p className="animate-up delay-2" style={{ color: "var(--text-muted)", marginBottom: "0.5rem", fontSize: "1.05rem" }}>
            {t("fillUp")}
          </p>
          <p className="animate-up delay-3" style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "2.5rem", fontFamily: "var(--mono)", letterSpacing: "0.05em" }}>
            {address} . {hours}
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link to="/reserve" className="btn btn-amber btn-big animate-up delay-4">{t("bookTable")}</Link>
            <Link to="/menu" className="btn btn-outline btn-big animate-up delay-5">{t("seeMenu")}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
