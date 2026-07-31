import { useState } from "react";
import { api } from "../api";
import { PhoneInput, toInternational } from "../components/PhoneInput";
import { IconSpark } from "../components/Icons";
import { useT } from "../i18n/context";

export default function EventsPage() {
  const t = useT("events");
  const EVENT_TYPES = [
    { value: "birthday", label: t("typeBirthday") },
    { value: "corporate", label: t("typeCorporate") },
    { value: "private_dining", label: t("typePrivate") },
    { value: "wedding", label: t("typeWedding") },
    { value: "other", label: t("typeOther") },
  ];
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
      setError(err instanceof Error ? err.message : t("errBooking"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="section-hero text-center rv">
        <h1>{t("heroTitle")}</h1>
        <p className="hero-sub">{t("heroSub")}</p>
      </section>

      <section className="section-pad rv">
        <div className="container" style={{ maxWidth: 640 }}>

            {done ? (
              <div className="card text-center" style={{ padding: "3rem" }}>
                <div className="wl-done-mark" aria-hidden="true"><IconSpark size={28} /></div>
                <h2 style={{ marginBottom: "0.5rem" }}>{t("receivedTitle")}</h2>
                <p className="muted">{t("receivedBody")}</p>
                <button className="btn btn-outline" style={{ marginTop: "1.5rem" }} onClick={() => { setDone(false); setForm({ name: "", email: "", phone: "", event_type: "", date: "", time: "", guest_count: "", note: "" }); }}>
                  {t("submitAnother")}
                </button>
              </div>
            ) : (
              <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h2 style={{ marginBottom: "0.25rem" }}>{t("formTitle")}</h2>
                <p className="muted" style={{ marginBottom: "0.5rem" }}>{t("formLede")}</p>

                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t("yourName")}</label>
                    <input className="form-input" value={form.name} onChange={set("name")} placeholder={t("fullNamePlaceholder")} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t("email")}</label>
                    <input className="form-input" type="email" value={form.email} onChange={set("email")} placeholder="you@email.com" required />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <PhoneInput
                      label={t("phoneStar")}
                      value={form.phone}
                      onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t("eventType")}</label>
                    <select className="form-input" value={form.event_type} onChange={set("event_type")} required>
                      <option value="">{t("selectType")}</option>
                      {EVENT_TYPES.map((et) => <option key={et.value} value={et.value}>{et.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t("preferredDate")}</label>
                    <input className="form-input" type="date" value={form.date} onChange={set("date")} min={new Date().toISOString().slice(0, 10)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t("preferredTime")}</label>
                    <input className="form-input" type="time" value={form.time} onChange={set("time")} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t("guestCount")}</label>
                  <input className="form-input" type="number" min={5} max={500} value={form.guest_count} onChange={set("guest_count")} placeholder="20" required />
                </div>

                <div className="form-group">
                  <label className="form-label">{t("additionalNotes")}</label>
                  <textarea className="form-input" value={form.note} onChange={set("note")} rows={4} maxLength={600} placeholder={t("notesPlaceholder")} />
                </div>

                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: "0.5rem" }}>
                  {submitting ? t("sending") : t("sendEnquiry")}
                </button>
              </form>
            )}
          </div>
      </section>
    </>
  );
}
