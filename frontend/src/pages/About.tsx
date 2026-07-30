import { Link } from "react-router-dom";
import { useSettings } from "../settings";

const AMENITY_GROUPS = [
  {
    label: "Service options",
    items: ["Takeaway", "Dine-in"],
  },
  {
    label: "Popular for",
    items: ["Lunch", "Dinner", "Solo dining"],
  },
  {
    label: "Offerings",
    items: ["Alcohol", "Beer", "Small plates", "Wine"],
  },
  {
    label: "Dining options",
    items: ["Lunch", "Dinner", "Table service"],
  },
  {
    label: "Amenities",
    items: ["Toilet"],
  },
  {
    label: "Atmosphere",
    items: ["Casual", "Cosy", "Trendy"],
  },
  {
    label: "Crowd",
    items: ["Groups", "Tourists"],
  },
  {
    label: "Planning",
    items: ["Accepts reservations"],
  },
  {
    label: "Children",
    items: ["Good for kids"],
  },
  {
    label: "Parking",
    items: ["Free street parking", "Free parking lot"],
  },
];

const HOURS = [
  { day: "Monday", hours: "9:00 am to late" },
  { day: "Tuesday", hours: "9:00 am to late" },
  { day: "Wednesday", hours: "9:00 am to late" },
  { day: "Thursday", hours: "9:00 am to late" },
  { day: "Friday", hours: "9:00 am to late" },
  { day: "Saturday", hours: "9:00 am to late" },
  { day: "Sunday", hours: "9:00 am to late" },
];

export function About() {
  const { city, address, hours } = useSettings();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return (
    <>
      {/* ── HERO ── */}
      <section className="section about-hero">
        <div className="section-inner">
          <div className="about-hero-inner">
            <div className="animate-up">
              <p className="eyebrow">About us</p>
              <h1 className="page-title">A proper charcoal grill in {city}.</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", maxWidth: "48ch", lineHeight: 1.7 }}>
                No gas. No shortcuts. Wood charcoal, a good fire, and meat that earns its reputation.
                Sit down, eat well, leave satisfied.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem", flexWrap: "wrap" }}>
                <Link to="/reserve" className="btn btn-amber">Book a table</Link>
                <Link to="/menu" className="btn btn-outline">See the menu</Link>
              </div>
            </div>
            <div className="about-hero-stats animate-up delay-2">
              <div className="about-stat">
                <span className="about-stat-num">2,500</span>
                <span className="about-stat-label">FCFA starting price</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">3</span>
                <span className="about-stat-label">Meats on the fire</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">Daily</span>
                <span className="about-stat-label">9am till late</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STORY ── */}
      <section className="section">
        <div className="section-inner split">
          <div className="split-text animate-up">
            <p className="section-label">The story</p>
            <h2 className="section-title">The smell finds you before the sign does.</h2>
            <p>
              Cam Chop Meat sits at {address}, in the neighbourhood near Mariton hôtel.
              The fire starts in the afternoon. By early evening the smoke has already
              done the marketing.
            </p>
            <p>
              Chicken, pork and goat, grilled slow over charcoal the way it has always been done in this part of
              Cameroon. The pepper sauce is made fresh. The matango comes when the calabash arrives. The music
              stays at a level where you can still hear your friends laugh.
            </p>
            <p>
              {hours}. Walk-ins welcome. Reservations hold your seat.
            </p>
          </div>
          <blockquote className="pull-quote animate-up delay-2">
            "The fire starts in the afternoon. The smell does the advertising."
          </blockquote>
        </div>
      </section>

      {/* ── LOCATION + HOURS ── */}
      <section className="section section-dark">
        <div className="section-inner">
          <div className="about-info-grid">
            {/* Location */}
            <div className="animate-up">
              <p className="section-label">Find us</p>
              <h2 className="section-title" style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>Getting here.</h2>
              <div className="ticket" style={{ marginTop: "1.25rem" }}>
                <dl className="ticket-rows">
                  <div><dt>Address</dt><dd>{address}</dd></div>
                  <div><dt>Town</dt><dd>{city}</dd></div>
                  <div><dt>Landmark</dt><dd>Near Mariton hôtel</dd></div>
                  <div><dt>Hours</dt><dd>{hours}</dd></div>
                  <div><dt>Parking</dt><dd>Free street + lot</dd></div>
                </dl>
                <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-amber btn-sm"
                  >
                    Open in Google Maps
                  </a>
                  <a
                    href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    Apple Maps
                  </a>
                </div>
                <p className="ticket-foot" style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}>
                  {address}
                </p>
              </div>
            </div>

            {/* Hours */}
            <div className="animate-up delay-2">
              <p className="section-label">Opening hours</p>
              <h2 className="section-title" style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>We're open.</h2>
              <div className="hours-table">
                {HOURS.map((h) => (
                  <div key={h.day} className={`hours-row${h.day === today ? " today" : ""}`}>
                    <span className="hours-day">{h.day}</span>
                    <span className="hours-time">{h.hours}</span>
                    {h.day === today && <span className="hours-today-badge">Today</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AMENITIES ── */}
      <section className="section">
        <div className="section-inner">
          <p className="section-label animate-up">Full details</p>
          <h2 className="section-title animate-up delay-1">What to expect.</h2>
          <div className="amenities-section" style={{ marginTop: "2rem" }}>
            {AMENITY_GROUPS.map((group, i) => (
              <div key={group.label} className={`amenity-group animate-up delay-${Math.min(i % 3 + 1, 3) as 1|2|3}`}>
                <h3>{group.label}</h3>
                <div className="amenity-tags">
                  {group.items.map((item) => (
                    <span key={item} className="amenity-tag">{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="section section-dark">
        <div className="section-inner center">
          <h2 className="closing-head animate-up">Ready to sit down?</h2>
          <p className="animate-up delay-1" style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            Book your table in two minutes. The fire starts in the afternoon.
          </p>
          <Link to="/reserve" className="btn btn-amber btn-big animate-up delay-2">Book a table</Link>
        </div>
      </section>
    </>
  );
}
