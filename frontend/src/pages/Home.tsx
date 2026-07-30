import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Review, MenuItem, Offer } from "../api";
import { MARQUEE_ITEMS } from "../data/menu";
import { Stars } from "../components/Stars";
import { useReveal } from "../hooks/useReveal";
import { useSettings } from "../settings";
import {
  IconBox, IconCalendar, IconChair, IconChicken, IconChild, IconDrink,
  IconFlame, IconGroup, IconMeat, IconMusic, IconParking, IconPepper,
  OfferIcon,
} from "../components/Icons";

const AMENITIES = [
  { Icon: IconFlame, label: "Real charcoal grill" },
  { Icon: IconChicken, label: "Grilled chicken" },
  { Icon: IconMeat, label: "Pork and goat" },
  { Icon: IconPepper, label: "Fresh pepper sauce" },
  { Icon: IconDrink, label: "Beer and wine" },
  { Icon: IconGroup, label: "Good for groups" },
  { Icon: IconChild, label: "Good for children" },
  { Icon: IconParking, label: "Free parking" },
  { Icon: IconChair, label: "Dine in" },
  { Icon: IconBox, label: "Collect your order" },
  { Icon: IconCalendar, label: "We take bookings" },
  { Icon: IconMusic, label: "Easy atmosphere" },
];

export function Home() {
  const { city, address, hours } = useSettings();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [topItems, setTopItems] = useState<MenuItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const marquee = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

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
            <p className="eyebrow animate-up">Charcoal grill · {address}</p>
            <h1 className="animate-up delay-1">
              Come <em>chop.</em>
            </h1>
            <p className="hero-lede animate-up delay-2">
              Chicken, pork and goat over real charcoal. Plates start for 2,500 FCFA.
              Book your table and e go dey wait for you when you reach.
            </p>
            <div className="hero-actions animate-up delay-3">
              <Link to="/reserve" className="btn btn-amber btn-big">Book a table</Link>
              <Link to="/menu" className="btn btn-outline btn-big">See the menu</Link>
            </div>
            <div className="hero-chips animate-up delay-4">
              <span className="hero-chip">Open daily, 9am till late</span>
              <span className="hero-chip">Dine in or collect</span>
              <span className="hero-chip">From 2,500 FCFA</span>
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
          <p className="section-label animate-up">How e dey work</p>
          <h2 className="section-title animate-up delay-1">Three steps to the fire.</h2>
          <ol className="steps">
            <li className="animate-up delay-1">
              <span className="step-no">1</span>
              <h3>Book your table</h3>
              <p>Choose the day, the time and how plenty you be. Pay the deposit with MTN Mobile Money. E no go take you two minutes.</p>
            </li>
            <li className="animate-up delay-2">
              <span className="step-no">2</span>
              <h3>We fire the grill</h3>
              <p>Your table dey wait. The coals done hot before you even reach the door.</p>
            </li>
            <li className="animate-up delay-3">
              <span className="step-no">3</span>
              <h3>You chop</h3>
              <p>Meat straight from the fire, pepper sauce for side. Matango if the calabash land. Show your code and sit down.</p>
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
                <p className="section-label animate-up">What's on the fire</p>
                <h2 className="section-title animate-up delay-1">From the board.</h2>
              </div>
              <Link to="/menu" className="btn btn-outline animate-up delay-1">Full menu</Link>
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
                      <p className="popular-card-price">from {item.price_fcfa.toLocaleString()} FCFA</p>
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
            <p className="section-label">The name says it</p>
            <h2 className="section-title">Real fire,<br />real flavour.</h2>
            <p>
              Ask around {city} where to chop good grilled meat and this name keeps coming up.
              The spot sits at {address}, near Mariton hotel. The fire starts in the
              afternoon and the smell does the advertising.
            </p>
            <p>
              No bow ties, no cursive menus. Meat done properly, fair prices, and music at
              the level where you can still hear your friends laugh.
            </p>
            <p className="section-cta">
              <Link to="/about" className="btn btn-outline">Our story</Link>
            </p>
          </div>
          <blockquote className="pull-quote animate-up delay-2">
            "If you love juicy grilled meat, this na the place."
          </blockquote>
        </div>
      </section>

      {/* ── AMENITIES ── */}
      <section className="section section-dark reveal">
        <div className="section-inner">
          <p className="section-label animate-up">Everything on offer</p>
          <h2 className="section-title animate-up delay-1">Nothing you won't find.<br />Nothing you don't need.</h2>
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
                <p className="section-label animate-up">What's on</p>
                <h2 className="section-title animate-up delay-1">Special offers.</h2>
              </div>
              <Link to="/offers" className="btn btn-outline animate-up delay-1">All offers</Link>
            </div>
            <div className="offers-home-grid">
              {offers.map((offer, i) => (
                <div key={offer.id} className={`offers-home-card animate-up delay-${Math.min(i + 1, 4) as 1|2|3|4}`}>
                  <span className="offers-home-icon"><OfferIcon name={offer.icon || "flame"} size={20} /></span>
                  {offer.badge && <span className="offers-home-badge">{offer.badge}</span>}
                  <h3 className="offers-home-title">{offer.title}</h3>
                  <p className="offers-home-desc">{offer.description}</p>
                  {offer.valid_until && (
                    <p className="offers-home-until">Until {new Date(offer.valid_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
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
                <p className="section-label animate-up">What people say</p>
                <h2 className="section-title animate-up delay-1">Word on the street.</h2>
              </div>
              <Link to="/reviews" className="btn btn-outline animate-up delay-1">All reviews</Link>
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
          <p className="section-label animate-up">Ready?</p>
          <h2 className="closing-head animate-up delay-1">Hungry yet?</h2>
          <p className="animate-up delay-2" style={{ color: "var(--text-muted)", marginBottom: "0.5rem", fontSize: "1.05rem" }}>
            Evenings and weekends fill up fast. Booking online skips the wait.
          </p>
          <p className="animate-up delay-3" style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "2.5rem", fontFamily: "var(--mono)", letterSpacing: "0.05em" }}>
            {address} · {hours}
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link to="/reserve" className="btn btn-amber btn-big animate-up delay-4">Book a table</Link>
            <Link to="/menu" className="btn btn-outline btn-big animate-up delay-5">See the menu</Link>
          </div>
        </div>
      </section>
    </>
  );
}
