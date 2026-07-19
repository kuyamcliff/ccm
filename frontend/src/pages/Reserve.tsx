import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Reservation } from "../api";
import { useAuth } from "../auth";

const SLOTS: string[] = [];
for (let h = 12; h <= 21; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function Reserve() {
  const { user, loading } = useAuth();
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Reservation | null>(null);

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
          <p className="eyebrow">Reservations</p>
          <h1 className="page-title">Book a table</h1>
          <div className="ticket">
            <p>
              You need an account to book, so we know who the table is for and can reach you if
              anything changes.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-red" to="/register">
                Create an account
              </Link>
              <Link className="btn btn-ink" to="/login">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (done) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <p className="eyebrow">Reservations</p>
          <h1 className="page-title">You're booked.</h1>
          <div className="ticket ticket-confirmed">
            <p className="ticket-no">TABLE TICKET Nº {String(done.id).padStart(4, "0")}</p>
            <dl className="ticket-rows">
              <div>
                <dt>Name</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{done.date}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{done.time}</dd>
              </div>
              <div>
                <dt>People</dt>
                <dd>{done.party_size}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{done.phone}</dd>
              </div>
            </dl>
            <p className="ticket-foot">
              Show this at the door, or just say your name. Manage it under{" "}
              <Link to="/account">My tables</Link>.
            </p>
          </div>
          <p className="section-cta">
            <button className="btn btn-ink" onClick={() => setDone(null)}>
              Book another table
            </button>
          </p>
        </div>
      </section>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api.createReservation({ date, time, partySize, phone, note });
      setDone(r.reservation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Reservations</p>
        <h1 className="page-title">Book a table</h1>
        <form className="form ticket" onSubmit={submit}>
          <div className="form-row two">
            <label>
              Date
              <input
                type="date"
                required
                min={todayLocal()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Time
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row two">
            <label>
              How many people
              <input
                type="number"
                min={1}
                max={20}
                required
                value={partySize}
                onChange={(e) => setPartySize(Number(e.target.value))}
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                required
                placeholder="+237 6 xx xx xx xx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <label>
            Anything we should know? <span className="optional">(optional)</span>
            <textarea
              rows={3}
              maxLength={300}
              placeholder="Birthday, big appetite, keep the goat coming..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-red btn-big" disabled={busy}>
            {busy ? "Booking..." : "Book it"}
          </button>
          <p className="form-fine">
            Groups above 20? Call us on +237 000 000 000 and we will sort it out.
          </p>
        </form>
      </div>
    </section>
  );
}
