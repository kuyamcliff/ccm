import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Review } from "../api";
import { MARQUEE_ITEMS } from "../data/menu";
import { Stars } from "../components/Stars";

export function Home() {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    api
      .reviews()
      .then((r) => setReviews(r.reviews.slice(0, 3)))
      .catch(() => {});
  }, []);

  const marquee = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">A charcoal grill in Buea</p>
            <h1>
              Come <em>chop.</em>
            </h1>
            <p className="hero-lede">
              Chicken, pork and goat over real charcoal, opposite the Survey School in Clerks
              Quarters. Plates from 2,500 francs. Book a table online and it is waiting when you
              arrive.
            </p>
            <div className="hero-actions">
              <Link to="/reserve" className="btn btn-red btn-big">
                Book a table
              </Link>
              <Link to="/menu" className="btn btn-ink btn-big">
                See the menu
              </Link>
            </div>
          </div>
          <div className="stamp" aria-hidden="true">
            <svg viewBox="0 0 200 200">
              <defs>
                <path id="circ" d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0" />
              </defs>
              <circle cx="100" cy="100" r="96" className="stamp-ring" />
              <circle cx="100" cy="100" r="56" className="stamp-ring thin" />
              <text className="stamp-text">
                <textPath href="#circ" startOffset="0%">
                  CHARCOAL ONLY · BUEA · NO SHORTCUTS · CAM CHOP MEAT ·
                </textPath>
              </text>
              <text x="100" y="94" textAnchor="middle" className="stamp-center">
                EST.
              </text>
              <text x="100" y="120" textAnchor="middle" className="stamp-center big">
                BUEA
              </text>
            </svg>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {marquee.map((item, i) => (
            <span key={i}>
              {item} <b>✶</b>
            </span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-inner">
          <h2 className="rule-head">
            <span className="head-no">01</span> How it works
          </h2>
          <ol className="steps">
            <li>
              <span className="step-no">1</span>
              <h3>Book your table</h3>
              <p>Pick a date, a time and how many of you are coming. Takes a minute.</p>
            </li>
            <li>
              <span className="step-no">2</span>
              <h3>We fire the grill</h3>
              <p>Your table is held and the coals are already hot when you walk in.</p>
            </li>
            <li>
              <span className="step-no">3</span>
              <h3>You chop</h3>
              <p>Meat off the fire, pepper sauce on the side, matango if the calabash came.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-tint">
        <div className="section-inner split">
          <div>
            <h2 className="rule-head">
              <span className="head-no">02</span> The name says it
            </h2>
            <p>
              Ask around Buea where to chop good grilled meat and this name keeps coming up. The
              spot sits opposite the Survey School in Clerks Quarters. The fire starts in the
              afternoon and the smell does the advertising.
            </p>
            <p>
              No waiters in bow ties, no menu in French cursive. Meat done properly, fair prices,
              and music at the level where you can still hear your friends laugh.
            </p>
          </div>
          <blockquote className="pull-quote">
            "If you love juicy grilled meat, this na the place."
          </blockquote>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="section">
          <div className="section-inner">
            <h2 className="rule-head">
              <span className="head-no">03</span> What people say
            </h2>
            <div className="review-grid">
              {reviews.map((r) => (
                <article key={r.id} className="review-card">
                  <Stars value={r.rating} />
                  <p className="review-text">{r.text}</p>
                  <p className="review-author">{r.author}</p>
                </article>
              ))}
            </div>
            <p className="section-cta">
              <Link to="/reviews" className="btn btn-ink">
                All reviews
              </Link>
            </p>
          </div>
        </section>
      )}

      <section className="section section-ink">
        <div className="section-inner center">
          <h2 className="closing-head">Hungry yet?</h2>
          <p>Evenings and weekends fill up. Booking online skips the wait.</p>
          <p className="section-cta">
            <Link to="/reserve" className="btn btn-red btn-big">
              Book a table
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
