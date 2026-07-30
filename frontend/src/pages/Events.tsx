import { useState } from "react";
import { api } from "../api";
import { PhoneInput, toInternational } from "../components/PhoneInput";
import { IconSpark } from "../components/Icons";

const EVENT_TYPES = [
  { value: "birthday", label: "Birthday Celebration" },
  { value: "corporate", label: "Corporate Dinner" },
  { value: "private_dining", label: "Private Dining" },
  { value: "wedding", label: "Wedding Reception" },
  { value: "other", label: "Other Event" },
];

export default function EventsPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", event_type: "", date: "", time: "", guest_count: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.bookEvent({
        name: form.name,
        email: form.email,
        phone: toInternational(form.phone),
        event_type: form.event_type,
        date: form.date,
        time: form.time,
        guest_count: Number(form.guest_count),
        note: form.note,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="section-hero text-center rv">
        <h1>Private Events</h1>
        <p className="hero-sub">Celebrate milestones, corporate dinners, and unforgettable moments with us.</p>
      </section>

      <section className="section-pad rv">
        <div className="container" style={{ maxWidth: 640 }}>

            {done ? (
              <div className="card text-center" style={{ padding: "3rem" }}>
                <div className="wl-done-mark" aria-hidden="true"><IconSpark size={28} /></div>
                <h2 style={{ marginBottom: "0.5rem" }}>Request received!</h2>
                <p className="muted">We'll contact you within 24 hours to confirm the details of your event.</p>
                <button className="btn btn-outline" style={{ marginTop: "1.5rem" }} onClick={() => { setDone(false); setForm({ name: "", email: "", phone: "", event_type: "", date: "", time: "", guest_count: "", note: "" }); }}>
                  Submit another request
                </button>
              </div>
            ) : (
              <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h2 style={{ marginBottom: "0.25rem" }}>Event Enquiry</h2>
                <p className="muted" style={{ marginBottom: "0.5rem" }}>Fill in the form and our team will get back to you within 24 hours.</p>

                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Your name *</label>
                    <input className="form-input" value={form.name} onChange={set("name")} placeholder="Full name" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="form-input" type="email" value={form.email} onChange={set("email")} placeholder="you@email.com" required />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <PhoneInput
                      label="Phone *"
                      value={form.phone}
                      onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Event type *</label>
                    <select className="form-input" value={form.event_type} onChange={set("event_type")} required>
                      <option value="">Select type…</option>
                      {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Preferred date *</label>
                    <input className="form-input" type="date" value={form.date} onChange={set("date")} min={new Date().toISOString().slice(0, 10)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred time *</label>
                    <input className="form-input" type="time" value={form.time} onChange={set("time")} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Number of guests * (min. 5)</label>
                  <input className="form-input" type="number" min={5} max={500} value={form.guest_count} onChange={set("guest_count")} placeholder="20" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Additional notes</label>
                  <textarea className="form-input" value={form.note} onChange={set("note")} rows={4} maxLength={600} placeholder="Menu preferences, décor requests, dietary restrictions…" />
                </div>

                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: "0.5rem" }}>
                  {submitting ? "Sending…" : "Send enquiry"}
                </button>
              </form>
            )}
          </div>
      </section>
    </>
  );
}
