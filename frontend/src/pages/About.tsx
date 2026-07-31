import { Link } from "react-router-dom";
import { useSettings } from "../settings";
import { useT } from "../i18n/context";

const AMENITY_GROUP_KEYS = [
  { label: "group_service", items: ["amenity_takeaway", "amenity_dinein"] },
  { label: "group_popular", items: ["amenity_lunch", "amenity_dinner", "amenity_solodining"] },
  { label: "group_offerings", items: ["amenity_alcohol", "amenity_beer", "amenity_smallplates", "amenity_wine"] },
  { label: "group_dining", items: ["amenity_lunch", "amenity_dinner", "amenity_tableservice"] },
  { label: "group_amenities", items: ["amenity_toilet"] },
  { label: "group_atmosphere", items: ["amenity_casual", "amenity_cosy", "amenity_trendy"] },
  { label: "group_crowd", items: ["amenity_groups", "amenity_tourists"] },
  { label: "group_planning", items: ["amenity_reservations"] },
  { label: "group_children", items: ["amenity_kids"] },
  { label: "group_parking", items: ["amenity_streetparking", "amenity_parkinglot"] },
] as const;

const DAY_KEYS = ["day_mon", "day_tue", "day_wed", "day_thu", "day_fri", "day_sat", "day_sun"] as const;

export function About() {
  const t = useT("about");
  const { city, address, hours } = useSettings();
  // getDay(): 0 = Sunday .. 6 = Saturday. DAY_KEYS starts Monday, so shift by one.
  const todayIndex = (new Date().getDay() + 6) % 7;

  return (
    <>
      {/* ── HERO ── */}
      <section className="section about-hero">
        <div className="section-inner">
          <div className="about-hero-inner">
            <div className="animate-up">
              <p className="eyebrow">{t("eyebrow")}</p>
              <h1 className="page-title">{t("pageTitle").replace("{city}", city)}</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", maxWidth: "48ch", lineHeight: 1.7 }}>
                {t("heroLede")}
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem", flexWrap: "wrap" }}>
                <Link to="/reserve" className="btn btn-amber">{t("bookTable")}</Link>
                <Link to="/menu" className="btn btn-outline">{t("seeMenu")}</Link>
              </div>
            </div>
            <div className="about-hero-stats animate-up delay-2">
              <div className="about-stat">
                <span className="about-stat-num">2,500</span>
                <span className="about-stat-label">{t("statPriceLabel")}</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">3</span>
                <span className="about-stat-label">{t("statMeatsLabel")}</span>
              </div>
              <div className="about-stat">
                <span className="about-stat-num">{t("statDailyValue")}</span>
                <span className="about-stat-label">{t("statDailyLabel")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STORY ── */}
      <section className="section">
        <div className="section-inner split">
          <div className="split-text animate-up">
            <p className="section-label">{t("storyLabel")}</p>
            <h2 className="section-title">{t("storyTitle")}</h2>
            <p>{t("storyBody1").replace("{address}", address)}</p>
            <p>{t("storyBody2")}</p>
            <p>{t("storyBody3").replace("{hours}", hours)}</p>
          </div>
          <blockquote className="pull-quote animate-up delay-2">
            &ldquo;{t("storyQuote")}&rdquo;
          </blockquote>
        </div>
      </section>

      {/* ── LOCATION + HOURS ── */}
      <section className="section section-dark">
        <div className="section-inner">
          <div className="about-info-grid">
            {/* Location */}
            <div className="animate-up">
              <p className="section-label">{t("findUsLabel")}</p>
              <h2 className="section-title" style={{ fontSize: "clamp(1.35rem, 4vw, 2.2rem)" }}>{t("gettingHere")}</h2>
              <div className="ticket" style={{ marginTop: "1.25rem" }}>
                <dl className="ticket-rows">
                  <div><dt>{t("dtAddress")}</dt><dd>{address}</dd></div>
                  <div><dt>{t("dtTown")}</dt><dd>{city}</dd></div>
                  <div><dt>{t("dtLandmark")}</dt><dd>{t("landmarkValue")}</dd></div>
                  <div><dt>{t("dtHours")}</dt><dd>{hours}</dd></div>
                  <div><dt>{t("dtParking")}</dt><dd>{t("parkingValue")}</dd></div>
                </dl>
                <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-amber btn-sm"
                  >
                    {t("openGoogleMaps")}
                  </a>
                  <a
                    href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    {t("appleMaps")}
                  </a>
                </div>
                <p className="ticket-foot" style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}>
                  {address}
                </p>
              </div>
            </div>

            {/* Hours */}
            <div className="animate-up delay-2">
              <p className="section-label">{t("openingHoursLabel")}</p>
              <h2 className="section-title" style={{ fontSize: "clamp(1.35rem, 4vw, 2.2rem)" }}>{t("weAreOpen")}</h2>
              <div className="hours-table">
                {DAY_KEYS.map((dayKey, i) => (
                  <div key={dayKey} className={`hours-row${i === todayIndex ? " today" : ""}`}>
                    <span className="hours-day">{t(dayKey)}</span>
                    <span className="hours-time">{t("hoursValue")}</span>
                    {i === todayIndex && <span className="hours-today-badge">{t("today")}</span>}
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
          <p className="section-label animate-up">{t("fullDetailsLabel")}</p>
          <h2 className="section-title animate-up delay-1">{t("whatToExpect")}</h2>
          <div className="amenities-section" style={{ marginTop: "2rem" }}>
            {AMENITY_GROUP_KEYS.map((group, i) => (
              <div key={group.label} className={`amenity-group animate-up delay-${Math.min(i % 3 + 1, 3) as 1|2|3}`}>
                <h3>{t(group.label)}</h3>
                <div className="amenity-tags">
                  {group.items.map((item) => (
                    <span key={item} className="amenity-tag">{t(item)}</span>
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
          <h2 className="closing-head animate-up">{t("readyTitle")}</h2>
          <p className="animate-up delay-1" style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
            {t("readyBody")}
          </p>
          <Link to="/reserve" className="btn btn-amber btn-big animate-up delay-2">{t("bookTable")}</Link>
        </div>
      </section>
    </>
  );
}
