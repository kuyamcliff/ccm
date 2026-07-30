import { useEffect, useState } from "react";
import { api } from "../api";
import { PhoneInput, toInternational } from "../components/PhoneInput";
import { IconCheck } from "../components/Icons";

export default function WaitlistPage() {
  const [info, setInfo] = useState<{ waiting: number; est_wait_minutes: number } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", party_size: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: number; position: number; est_wait_minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.waitlistInfo().then(setInfo).catch(() => null);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.joinWaitlist({ name: form.name, phone: toInternational(form.phone), party_size: Number(form.party_size), note: form.note });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not join waitlist.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="section-hero text-center rv">
        <h1>Walk-in Waitlist</h1>
        <p className="hero-sub">Join the queue and we'll let you know when your table is ready.</p>
      </section>

      {info && (
        <section className="section-pad rv" style={{ paddingBottom: 0 }}>
          <div className="container text-center">
            <div className="waitlist-status">
              <div className="waitlist-stat">
                <span className="waitlist-stat-num">{info.waiting}</span>
                <span className="waitlist-stat-label">{info.waiting === 1 ? "party" : "parties"} ahead</span>
              </div>
              <div className="waitlist-stat">
                <span className="waitlist-stat-num">~{info.est_wait_minutes}</span>
                <span className="waitlist-stat-label">min estimated wait</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section-pad rv">
        <div className="container" style={{ maxWidth: 520 }}>
          {result ? (
            <div className="card text-center" style={{ padding: "3rem" }}>
              <div className="wl-done-mark" aria-hidden="true"><IconCheck size={28} /></div>
              <h2 style={{ marginBottom: "0.5rem" }}>You're on the list!</h2>
              <p className="muted">You are <strong>#{result.position}</strong> in the queue.</p>
              <p className="muted" style={{ marginTop: "0.25rem" }}>Estimated wait: <strong>~{result.est_wait_minutes} minutes</strong>.</p>
              <p className="hint" style={{ marginTop: "1rem" }}>Please stay nearby, our team will come find you when your table is ready.</p>
              <button className="btn btn-outline" style={{ marginTop: "1.5rem" }} onClick={() => { setResult(null); setForm({ name: "", phone: "", party_size: "", note: "" }); }}>
                Join again
              </button>
            </div>
          ) : (
            <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h2 style={{ marginBottom: "0.25rem" }}>Join the queue</h2>
              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={set("name")} placeholder="Your name" required />
              </div>
              <div className="form-group">
                <PhoneInput
                  label="Phone number *"
                  value={form.phone}
                  onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Party size *</label>
                <input className="form-input" type="number" min={1} max={20} value={form.party_size} onChange={set("party_size")} placeholder="2" required />
              </div>
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <textarea className="form-input" value={form.note} onChange={set("note")} rows={2} maxLength={200} placeholder="High chair needed, allergies…" />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: "0.5rem" }}>
                {submitting ? "Joining…" : "Join waitlist"}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
