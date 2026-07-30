import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import type { Reservation } from "../../api";

type Stats = {
  totalReservations: number;
  todayReservations: number;
  totalUsers: number;
  pendingPayments: number;
  totalRevenue: number;
};

type AdminReservation = Reservation & { user_name: string; user_email: string };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CalIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function MapIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>; }
function UsersIcon(){ return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function MenuIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function StarIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }
function PayIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }

export function AdminDashboard() {
  const today    = todayLocal();
  const tomorrow = tomorrowLocal();

  const [stats, setStats]           = useState<Stats | null>(null);
  const [todayRes, setTodayRes]     = useState<AdminReservation[]>([]);
  const [tomorrowRes, setTomorrowRes] = useState<AdminReservation[]>([]);
  const [loading, setLoading]       = useState(true);

  const currentTime = nowHHMM();

  useEffect(() => {
    Promise.all([
      api.admin.stats().then(setStats).catch(() => {}),
      api.admin.reservations({ date: today, status: "confirmed" })
        .then((r) => setTodayRes(r.reservations)).catch(() => {}),
      api.admin.reservations({ date: tomorrow, status: "confirmed" })
        .then((r) => setTomorrowRes(r.reservations)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [today, tomorrow]);

  const upcomingToday = todayRes
    .filter((r) => r.time >= currentTime)
    .sort((a, b) => a.time.localeCompare(b.time));

  const pastToday = todayRes
    .filter((r) => r.time < currentTime)
    .sort((a, b) => b.time.localeCompare(a.time));

  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="adash">

      {/* Header */}
      <div className="adash-head">
        <div>
          <p className="adash-eyebrow">Overview</p>
          <h1 className="adash-title">Dashboard</h1>
        </div>
        <p className="adash-date">{dateStr}</p>
      </div>

      {/* Stat strip */}
      <div className="adash-stats">
        <div className="adash-stat adash-stat-red">
          <p className="adash-stat-val">{loading ? "" : stats?.todayReservations ?? 0}</p>
          <p className="adash-stat-lbl">Today</p>
        </div>
        <div className="adash-stat">
          <p className="adash-stat-val">{loading ? "" : stats?.totalReservations ?? 0}</p>
          <p className="adash-stat-lbl">All-time confirmed</p>
        </div>
        <div className="adash-stat">
          <p className="adash-stat-val">{loading ? "" : stats?.totalUsers ?? 0}</p>
          <p className="adash-stat-lbl">Accounts</p>
        </div>
        <div className="adash-stat" style={{ color: stats?.pendingPayments ? "var(--amber)" : "inherit" }}>
          <p className="adash-stat-val" style={{ color: stats?.pendingPayments ? "var(--amber)" : "inherit" }}>
            {loading ? "" : stats?.pendingPayments ?? 0}
          </p>
          <p className="adash-stat-lbl">Pending payment</p>
        </div>
        <div className="adash-stat adash-stat-green">
          <p className="adash-stat-val" style={{ fontSize: "1.5rem" }}>
            {loading ? "" : (stats?.totalRevenue ?? 0).toLocaleString()}
            <span className="adash-stat-unit">FCFA</span>
          </p>
          <p className="adash-stat-lbl">Revenue collected</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="adash-links">
        <Link to="/admin/reservations" className="adash-link">
          <CalIcon /> Reservations
        </Link>
        <Link to="/admin/floor" className="adash-link">
          <MapIcon /> Floor plan
        </Link>
        <Link to="/admin/users" className="adash-link">
          <UsersIcon /> Users
        </Link>
        <Link to="/admin/menu" className="adash-link">
          <MenuIcon /> Menu
        </Link>
        <Link to="/admin/reviews" className="adash-link">
          <StarIcon /> Reviews
        </Link>
        <Link to="/admin/payments" className="adash-link">
          <PayIcon /> Payments
        </Link>
      </div>

      {/* Today's schedule */}
      <div className="adash-section-head">
        <h2 className="adash-section-title">
          Today
          <span className="adash-section-sub">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </h2>
        {todayRes.length > 0 && (
          <span className="adash-count-badge">{todayRes.length} reservation{todayRes.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading ? (
        <p className="empty-admin">Loading schedule...</p>
      ) : todayRes.length === 0 ? (
        <div className="adash-empty">
          <p>No confirmed reservations today.</p>
          <Link to="/admin/reservations">View all reservations →</Link>
        </div>
      ) : (
        <>
          {upcomingToday.length > 0 && (
            <div className="adash-time-group">
              <p className="adash-time-label">Upcoming</p>
              <div className="adash-res-list">
                {upcomingToday.map((r) => <DashResRow key={r.id} r={r} upcoming />)}
              </div>
            </div>
          )}
          {pastToday.length > 0 && (
            <div className="adash-time-group" style={{ marginTop: "1.5rem" }}>
              <p className="adash-time-label">Already seated</p>
              <div className="adash-res-list">
                {pastToday.map((r) => <DashResRow key={r.id} r={r} upcoming={false} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tomorrow */}
      {tomorrowRes.length > 0 && (
        <>
          <div className="adash-section-head" style={{ marginTop: "2.5rem" }}>
            <h2 className="adash-section-title">
              Tomorrow
              <span className="adash-section-sub">
                {new Date(tomorrow + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </h2>
            <span className="adash-count-badge">{tomorrowRes.length} reservation{tomorrowRes.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Table</th>
                  <th>Party</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {tomorrowRes.sort((a, b) => a.time.localeCompare(b.time)).map((r) => (
                  <tr key={r.id}>
                    <td data-label="Time" className="mono">{r.time}</td>
                    <td data-label="Name">{r.user_name}</td>
                    <td data-label="Table">{r.table_label ?? ""}</td>
                    <td data-label="Party">{r.party_size}</td>
                    <td data-label="Payment">
                      <span className={`badge badge-${r.payment_status === "paid" ? "green" : "amber"}`}>
                        {r.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DashResRow({ r, upcoming }: { r: AdminReservation; upcoming: boolean }) {
  return (
    <div className={`adash-res-row${upcoming ? " upcoming" : " past"}`}>
      <span className="adash-res-time">{r.time}</span>
      <div className="adash-res-info">
        <span className="adash-res-name">{r.user_name}</span>
        <span className="adash-res-meta">
          {r.party_size} {r.party_size === 1 ? "person" : "people"}
          {r.table_label ? ` · Table ${r.table_label}` : ""}
          {r.phone ? ` · ${r.phone}` : ""}
        </span>
      </div>
      <span className={`badge badge-${r.payment_status === "paid" ? "green" : "amber"}`}>
        {r.payment_status}
      </span>
    </div>
  );
}
