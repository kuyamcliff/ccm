import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Reservation } from "../api";
import { useAuth } from "../auth";

export function Account() {
  const { user, loading } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .myReservations()
      .then((r) => setReservations(r.reservations))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load reservations."))
      .finally(() => setLoaded(true));
  }, [user?.id]);

  if (loading) {
    return (
      <section className="section">
        <div className="section-inner narrow center">
          <p>One moment...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <h1 className="page-title">My tables</h1>
          <p className="notice">
            <Link to="/login">Sign in</Link> to see your reservations.
          </p>
        </div>
      </section>
    );
  }

  async function cancel(id: number) {
    setError("");
    try {
      await api.cancelReservation(id);
      setReservations((rs) =>
        rs.map((r) => (r.id === id ? { ...r, status: "cancelled" as const } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel that one.");
    }
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Hey {user.name.split(" ")[0]}</p>
        <h1 className="page-title">My tables</h1>
        {error && <p className="form-error">{error}</p>}

        {loaded && reservations.length === 0 && (
          <div className="empty-state">
            <p className="empty-mark" aria-hidden="true">✶</p>
            <p>
              No reservations yet. <Link to="/reserve">Book your first table</Link> and the coals
              will be waiting.
            </p>
          </div>
        )}

        <div className="ticket-stack">
          {reservations.map((r) => (
            <article
              key={r.id}
              className={r.status === "cancelled" ? "ticket ticket-dead" : "ticket"}
            >
              <p className="ticket-no">
                TABLE TICKET Nº {String(r.id).padStart(4, "0")}
                {r.status === "cancelled" && <span className="ticket-stamp">CANCELLED</span>}
              </p>
              <dl className="ticket-rows">
                <div>
                  <dt>Date</dt>
                  <dd>{r.date}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{r.time}</dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{r.party_size}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{r.phone}</dd>
                </div>
              </dl>
              {r.note && <p className="ticket-note">"{r.note}"</p>}
              {r.status === "confirmed" && (
                <button className="btn btn-ink btn-small" onClick={() => cancel(r.id)}>
                  Cancel this table
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
