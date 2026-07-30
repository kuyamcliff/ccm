import { useEffect, useState } from "react";
import { api, EventBooking } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { PhoneInput, isCompletePhone, toInternational } from "../../components/PhoneInput";

type ModalState = { title: string; body?: string; label?: string; danger?: boolean; onConfirm: () => void };

const EVENT_TYPES = [
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "private_dining", label: "Private Dining" },
  { value: "wedding", label: "Wedding" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#22c55e",
  cancelled: "#6b7280",
};

const EMPTY_FORM = { name: "", email: "", phone: "", event_type: "birthday", date: "", time: "18:00", guest_count: "10", note: "", status: "confirmed" };

export default function AdminEvents() {
  const [bookings, setBookings] = useState<EventBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = () => api.admin.events().then((d) => { setBookings(d.bookings); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function update(id: number, status: "pending" | "confirmed" | "cancelled") {
    await api.admin.updateEvent(id, status);
    load();
  }

  function del(id: number, name: string) {
    setModal({
      title: `Delete ${name}'s event booking?`,
      body: "This permanently removes the event record.",
      label: "Delete",
      danger: true,
      onConfirm: () => { api.admin.deleteEvent(id).then(load); },
    });
  }

  function setField(k: keyof typeof EMPTY_FORM, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submitCreate() {
    setFormErr("");
    const guestCount = Number(form.guest_count);
    if (!form.name.trim() || form.name.trim().length < 2) { setFormErr("Name required."); return; }
    if (!form.email.includes("@")) { setFormErr("Valid email required."); return; }
    if (!isCompletePhone(form.phone)) { setFormErr("Enter 9 digits starting with 6."); return; }
    if (!form.date) { setFormErr("Date required."); return; }
    if (!form.time) { setFormErr("Time required."); return; }
    if (!Number.isInteger(guestCount) || guestCount < 5) { setFormErr("Minimum 5 guests."); return; }

    setCreating(true);
    try {
      await api.admin.createEvent({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: toInternational(form.phone.trim()),
        event_type: form.event_type,
        date: form.date,
        time: form.time,
        guest_count: guestCount,
        note: form.note.trim(),
        status: form.status,
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setCreating(false);
    }
  }

  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Private Events</h1>
          <p className="admin-page-sub">{bookings.filter((b) => b.status === "pending").length} pending</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setCreateOpen(true); setFormErr(""); }}>+ New event</button>
      </div>

      <div className="filter-chips" style={{ marginBottom: "1.5rem" }}>
        {(["all", "pending", "confirmed", "cancelled"] as const).map((s) => (
          <button key={s} className={`filter-chip${filter === s ? " active" : ""}`} onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="muted">No event bookings found.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {filtered.map((b) => (
          <div key={b.id} className="admin-event-card">
            <div className="admin-event-header">
              <div>
                <strong>{b.name}</strong>
                <span className="admin-event-type">{EVENT_TYPES.find((t) => t.value === b.event_type)?.label ?? b.event_type}</span>
                <span className="status-pill" style={{ background: STATUS_COLORS[b.status] + "22", color: STATUS_COLORS[b.status] }}>
                  {b.status}
                </span>
              </div>
              <div className="admin-event-meta">
                <span>{b.date} at {b.time}</span>
                <span>{b.guest_count} guests</span>
              </div>
            </div>
            <div className="admin-event-contact">
              <span><a href={`mailto:${b.email}`}>{b.email}</a></span>
              <span><a href={`tel:${b.phone}`}>{b.phone}</a></span>
            </div>
            {b.note && <p className="admin-event-note">{b.note}</p>}
            <div className="admin-event-actions">
              {b.status === "pending" && (
                <>
                  <button className="btn btn-sm btn-primary" onClick={() => update(b.id, "confirmed")}>Confirm</button>
                  <button className="btn btn-sm btn-outline" onClick={() => update(b.id, "cancelled")}>Cancel</button>
                </>
              )}
              {b.status === "confirmed" && (
                <button className="btn btn-sm btn-outline" onClick={() => update(b.id, "cancelled")}>Cancel</button>
              )}
              <button className="btn btn-sm btn-danger" onClick={() => del(b.id, b.name)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={modal !== null}
        title={modal?.title ?? ""}
        body={modal?.body}
        confirmLabel={modal?.label ?? "Confirm"}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />

      {/* Create event modal */}
      {createOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          onClick={() => setCreateOpen(false)}
        >
          <div
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.5rem", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Create event booking</h3>
              <button onClick={() => setCreateOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem" }}>✕</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Contact name</label>
                <input className="form-input" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label className="form-label">Event type</label>
                <select className="form-input" value={form.event_type} onChange={(e) => setField("event_type", e.target.value)}>
                  {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <PhoneInput
                  label="Phone"
                  value={form.phone}
                  onChange={(digits) => setField("phone", digits)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Time</label>
                <input className="form-input" type="time" value={form.time} onChange={(e) => setField("time", e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Guest count</label>
                <input className="form-input" type="number" min={5} value={form.guest_count} onChange={(e) => setField("guest_count", e.target.value)} placeholder="Min. 5" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={(e) => setField("status", e.target.value)}>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} maxLength={600} value={form.note} onChange={(e) => setField("note", e.target.value)} placeholder="Any special requests or details…" />
            </div>

            {formErr && <p className="form-error" style={{ marginBottom: "0.75rem" }}>{formErr}</p>}

            <button className="btn btn-primary" style={{ width: "100%" }} onClick={submitCreate} disabled={creating}>
              {creating ? "Creating…" : "Create event"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
