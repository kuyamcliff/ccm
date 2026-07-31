import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { AdminAnalytics as AnalyticsData } from "../../api";
import { useLanguage } from "../../i18n/context";

type Series = { day: string; revenue?: number; count?: number; payments?: number };

const WEEKDAY_KEYS = ["daySun", "dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat"];

/** Fills gaps so a quiet day draws as zero instead of collapsing the x axis. */
function densify(rows: Series[], key: "revenue" | "count", days = 30) {
  const byDay = new Map(rows.map((r) => [r.day, Number(r[key]) || 0]));
  const out: { day: string; value: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ day: iso, value: byDay.get(iso) ?? 0 });
  }
  return out;
}

function pctChange(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
}

function Delta({ value }: { value: number | null }) {
  const { t } = useLanguage();
  if (value === null) return <span className="an-delta an-delta-new">{t("adminAnalytics", "new")}</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="an-delta">{t("adminAnalytics", "level")}</span>;
  const up = rounded > 0;
  return (
    <span className={`an-delta ${up ? "an-delta-up" : "an-delta-down"}`}>
      {up ? "+" : ""}{rounded}%
    </span>
  );
}

/**
 * Area chart drawn as inline SVG.
 *
 * Thirty days of bars were unreadably thin at this width, and a trend is what
 * the question actually is. Uses a viewBox so it scales with the container
 * rather than needing a resize observer.
 */
function AreaChart({ points, unit }: { points: { day: string; value: number }[]; unit: string }) {
  const { t } = useLanguage();
  const ta = (key: string) => t("adminAnalytics", key);
  const W = 600;
  const H = 160;
  const PAD = 6;

  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = (W - PAD * 2) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const line = points.map((p, i) => `${PAD + i * stepX},${y(p.value)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${PAD + (points.length - 1) * stepX},${H - PAD}`;

  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);

  return (
    <div className="an-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           aria-label={ta("trendAriaLabel").replace("{n}", String(points.length)).replace("{peak}", peak.value.toLocaleString()).replace("{unit}", unit)}>
        <defs>
          <linearGradient id="anFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={PAD + (H - PAD * 2) * f} y2={PAD + (H - PAD * 2) * f}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}

        <polygon points={area} fill="url(#anFill)" />
        <polyline points={line} fill="none" stroke="var(--amber)" strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="an-chart-axis">
        <span>{points[0]?.day.slice(5)}</span>
        <span>{ta("peak")} {peak.value.toLocaleString()} {unit}</span>
        <span>{points[points.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { t } = useLanguage();
  const ta = (key: string) => t("adminAnalytics", key);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<"revenue" | "signups">("revenue");

  useEffect(() => {
    api.admin.analytics()
      .then((d) => setData(d))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const series = useMemo(() => {
    if (!data) return [];
    return metric === "revenue"
      ? densify(data.revenueByDay, "revenue")
      : densify(data.newUsersByDay, "count");
  }, [data, metric]);

  if (loading) {
    return <div className="admin-page"><div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div></div>;
  }
  if (failed || !data) {
    return <div className="admin-page"><p className="form-error">{ta("errLoad")}</p></div>;
  }

  const revenue30 = data.revenueByDay.reduce((s, d) => s + (d.revenue ?? 0), 0);
  const signups30 = data.newUsersByDay.reduce((s, d) => s + (d.count ?? 0), 0);
  const { bookings, covers, cancelled, arrived } = data.window30;

  const showRate = bookings > 0 ? Math.round((arrived / bookings) * 100) : null;
  const cancelRate = bookings > 0 ? Math.round((cancelled / bookings) * 100) : 0;
  const avgParty = bookings > 0 ? (covers / bookings).toFixed(1) : "0";
  const avgTicket = revenue30 > 0 && bookings > 0 ? Math.round(revenue30 / bookings) : 0;

  const peakMax = Math.max(...data.peakHours.map((h) => h.count), 1);
  const dayMax = Math.max(...data.busiestDays.map((d) => d.count), 1);
  const topQty = Math.max(...data.topMenuItems.map((i) => i.qty), 1);

  return (
    <div className="admin-page an">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{ta("title")}</h1>
          <p className="admin-page-sub">{ta("subtitle")}</p>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="an-kpis">
        <article className="an-kpi an-kpi-lead">
          <p className="an-kpi-label">{ta("revenueCollected")}</p>
          <p className="an-kpi-value mono">
            {revenue30.toLocaleString()}<span className="an-kpi-unit">FCFA</span>
          </p>
          <Delta value={pctChange(revenue30, data.previous.revenue)} />
        </article>

        <article className="an-kpi">
          <p className="an-kpi-label">{ta("bookings")}</p>
          <p className="an-kpi-value mono">{bookings}</p>
          <Delta value={pctChange(bookings, data.previous.bookings)} />
        </article>

        <article className="an-kpi">
          <p className="an-kpi-label">{ta("coversSeated")}</p>
          <p className="an-kpi-value mono">{covers}</p>
          <Delta value={pctChange(covers, data.previous.covers)} />
        </article>

        <article className="an-kpi">
          <p className="an-kpi-label">{ta("averageParty")}</p>
          <p className="an-kpi-value mono">{avgParty}</p>
          <span className="an-kpi-foot">{ta("guestsPerBooking")}</span>
        </article>
      </div>

      {/* Trend */}
      <section className="an-panel an-panel-wide">
        <header className="an-panel-head">
          <h2 className="an-panel-title">
            {metric === "revenue" ? ta("revenueByDay") : ta("newCustomersByDay")}
          </h2>
          <div className="filter-chips an-toggle">
            <button className={`filter-chip${metric === "revenue" ? " active" : ""}`} onClick={() => setMetric("revenue")}>
              {ta("revenue")}
            </button>
            <button className={`filter-chip${metric === "signups" ? " active" : ""}`} onClick={() => setMetric("signups")}>
              {ta("signUps")}
            </button>
          </div>
        </header>

        {series.every((p) => p.value === 0) ? (
          <p className="an-empty">
            {ta("nothingRecorded")} {metric === "revenue" ? ta("takings") : ta("signUps")} {ta("willDrawHere")}
          </p>
        ) : (
          <AreaChart points={series} unit={metric === "revenue" ? ta("unit") : ta("unitPeople")} />
        )}

        <div className="an-inline-stats">
          <div><span className="an-inline-num mono">{signups30}</span><span>{ta("newCustomers")}</span></div>
          <div><span className="an-inline-num mono">{avgTicket.toLocaleString()}</span><span>{ta("avgDeposit")}</span></div>
          <div><span className="an-inline-num mono">{cancelRate}%</span><span>{ta("cancelled")}</span></div>
          <div>
            <span className="an-inline-num mono">{showRate === null ? "0" : showRate}%</span>
            <span>{ta("checkedInAtDoor")}</span>
          </div>
        </div>
      </section>

      <div className="an-grid">
        {/* Service times */}
        <section className="an-panel">
          <h2 className="an-panel-title">{ta("busiestTimes")}</h2>
          {data.peakHours.length === 0 ? (
            <p className="an-empty">{ta("noBookingsYet")}</p>
          ) : (
            <div className="an-hours">
              {data.peakHours.map((h) => (
                <div key={h.hour} className="an-hour" title={ta("bookingsHourLabel").replace("{hour}", String(h.hour)).replace("{count}", String(h.count))}>
                  <div className="an-hour-track">
                    <div className="an-hour-fill" style={{ height: `${(h.count / peakMax) * 100}%` }} />
                  </div>
                  <span className="an-hour-label mono">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Weekday pattern */}
        <section className="an-panel">
          <h2 className="an-panel-title">{ta("busiestDays")}</h2>
          {data.busiestDays.length === 0 ? (
            <p className="an-empty">{ta("noBookingsYet")}</p>
          ) : (
            <ul className="an-bars">
              {data.busiestDays.map((d) => (
                <li key={d.weekday}>
                  <span className="an-bar-label">{ta(WEEKDAY_KEYS[d.weekday]) ?? d.weekday}</span>
                  <span className="an-bar-track">
                    <span className="an-bar-fill" style={{ width: `${(d.count / dayMax) * 100}%` }} />
                  </span>
                  <span className="an-bar-val mono">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Most ordered */}
        <section className="an-panel">
          <h2 className="an-panel-title">{ta("mostOrdered")}</h2>
          {data.topMenuItems.length === 0 ? (
            <p className="an-empty">{ta("noTakeawayOrders")}</p>
          ) : (
            <ol className="an-top">
              {data.topMenuItems.map((item, i) => (
                <li key={item.name}>
                  <span className="an-top-rank mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="an-top-body">
                    <span className="an-top-name">{item.name}</span>
                    <span className="an-top-track">
                      <span className="an-top-fill" style={{ width: `${(item.qty / topQty) * 100}%` }} />
                    </span>
                  </span>
                  <span className="an-top-qty mono">{item.qty}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Reviews */}
        <section className="an-panel">
          <h2 className="an-panel-title">{ta("whatPeopleSay")}</h2>
          {data.reviewSummary.total === 0 ? (
            <p className="an-empty">{ta("noReviewsYet")}</p>
          ) : (
            <div className="an-reviews">
              <p className="an-reviews-score mono">
                {Number(data.reviewSummary.avg_rating ?? 0).toFixed(1)}
                <span>{ta("outOf5")}</span>
              </p>
              <p className="an-reviews-count">
                {ta(data.reviewSummary.total === 1 ? "fromReviewSingular" : "fromReviewPlural").replace("{n}", String(data.reviewSummary.total))}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
