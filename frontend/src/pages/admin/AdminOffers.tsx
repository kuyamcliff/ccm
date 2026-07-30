import { useEffect, useMemo, useState } from "react";
import { api, Offer } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { OfferIcon, OFFER_ICON_KEYS } from "../../components/Icons";

type ModalState = { title: string; body?: string; label?: string; danger?: boolean; onConfirm: () => void };

type Draft = {
  title: string;
  description: string;
  badge: string;
  icon: string;
  valid_until: string;
  sort_order: number;
};

const EMPTY: Draft = { title: "", description: "", badge: "", icon: "flame", valid_until: "", sort_order: 0 };

/**
 * Offers.
 *
 * The editor is a live preview rather than a form beside a list: an offer is a
 * card on the public site, so the thing being edited is shown as that card
 * while it is typed. Editing an existing offer reuses the same panel instead
 * of opening a second, differently-shaped dialog.
 */
export default function AdminOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = () =>
    api.admin.offers()
      .then((d) => { setOffers(d.offers); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const set =
    (k: keyof Draft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const liveCount = useMemo(() => offers.filter((o) => o.is_active).length, [offers]);

  function startEdit(o: Offer) {
    setEditingId(o.id);
    setError(null);
    setForm({
      title: o.title,
      description: o.description,
      badge: o.badge,
      icon: o.icon || "flame",
      valid_until: o.valid_until ?? "",
      sort_order: o.sort_order,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        valid_until: form.valid_until || null,
        sort_order: Number(form.sort_order) || 0,
      };
      if (editingId === null) {
        await api.admin.createOffer(payload);
        showToast("Offer created.");
      } else {
        await api.admin.updateOffer(editingId, payload);
        showToast("Offer updated.");
      }
      cancelEdit();
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save that offer.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(o: Offer) {
    const enabling = !o.is_active;
    setModal({
      title: `${enabling ? "Show" : "Hide"} "${o.title}"?`,
      body: enabling ? "Customers will see this offer straight away." : "Customers will stop seeing this offer.",
      label: enabling ? "Show" : "Hide",
      danger: !enabling,
      onConfirm: () => {
        api.admin.updateOffer(o.id, { is_active: enabling ? 1 : 0 })
          .then(() => { load(); showToast(enabling ? "Offer is live." : "Offer hidden."); })
          .catch(() => showToast("Could not change that offer."));
      },
    });
  }

  function del(o: Offer) {
    setModal({
      title: `Delete "${o.title}"?`,
      body: "This cannot be undone.",
      label: "Delete",
      danger: true,
      onConfirm: () => {
        api.admin.deleteOffer(o.id)
          .then(() => { if (editingId === o.id) cancelEdit(); load(); showToast("Offer deleted."); })
          .catch(() => showToast("Could not delete that offer."));
      },
    });
  }

  return (
    <div className="admin-page ofr">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Offers</h1>
        <span className="ofr-tally mono">{liveCount} live · {offers.length} total</span>
      </div>

      <div className="ofr-layout">
        {/* ── Editor ── */}
        <form className="ofr-editor" onSubmit={save}>
          <div className="ofr-editor-head">
            <h2 className="ofr-editor-title">{editingId === null ? "New offer" : "Editing offer"}</h2>
            {editingId !== null && (
              <button type="button" className="link-btn" onClick={cancelEdit}>Cancel</button>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <label className="ofr-field">
            Title
            <input value={form.title} onChange={set("title")} required maxLength={120} placeholder="Happy hour, 20 percent off" />
          </label>

          <label className="ofr-field">
            Description
            <textarea value={form.description} onChange={set("description")} rows={3} maxLength={400} placeholder="Every day from 6 to 8 pm." />
          </label>

          <fieldset className="ofr-icons">
            <legend>Icon</legend>
            <div className="ofr-icon-row">
              {OFFER_ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`ofr-icon-btn${form.icon === key ? " active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, icon: key }))}
                  aria-pressed={form.icon === key}
                  aria-label={key}
                  title={key}
                >
                  <OfferIcon name={key} size={18} />
                </button>
              ))}
            </div>
          </fieldset>

          <div className="ofr-field-row">
            <label className="ofr-field">
              Badge <span className="optional">optional</span>
              <input value={form.badge} onChange={set("badge")} maxLength={40} placeholder="Limited time" />
            </label>
            <label className="ofr-field">
              Valid until <span className="optional">optional</span>
              <input type="date" value={form.valid_until} onChange={set("valid_until")} />
            </label>
          </div>

          <label className="ofr-field ofr-field-narrow">
            Sort order
            <input type="number" value={form.sort_order} onChange={set("sort_order")} min={0} max={999} />
          </label>

          <div className="ofr-preview">
            <p className="ofr-preview-label mono">Preview</p>
            <article className="offer-card">
              <span className="offer-icon"><OfferIcon name={form.icon} size={22} /></span>
              {form.badge && <span className="offer-badge">{form.badge}</span>}
              <h3 className="offer-title">{form.title || "Offer title"}</h3>
              {form.description && <p className="offer-desc">{form.description}</p>}
              {form.valid_until && <p className="offer-expires">Valid until {form.valid_until}</p>}
            </article>
          </div>

          <button className="btn btn-amber ofr-save" type="submit" disabled={saving || !form.title.trim()}>
            {saving ? "Saving" : editingId === null ? "Create offer" : "Save changes"}
          </button>
        </form>

        {/* ── List ── */}
        <div className="ofr-list">
          {loading && <p className="muted">Loading</p>}
          {!loading && offers.length === 0 && <p className="empty-admin">No offers yet.</p>}

          {offers.map((o) => (
            <article key={o.id} className={`ofr-row${o.is_active ? "" : " is-hidden"}${editingId === o.id ? " is-editing" : ""}`}>
              <span className="ofr-row-icon"><OfferIcon name={o.icon || "flame"} size={20} /></span>

              <div className="ofr-row-body">
                <div className="ofr-row-head">
                  <h3 className="ofr-row-title">{o.title}</h3>
                  <span className={`ofr-state ${o.is_active ? "live" : "off"}`}>{o.is_active ? "Live" : "Hidden"}</span>
                </div>
                {o.badge && <span className="ofr-row-badge">{o.badge}</span>}
                {o.description && <p className="ofr-row-desc">{o.description}</p>}
                {o.valid_until && <p className="ofr-row-meta mono">Until {o.valid_until}</p>}
              </div>

              <div className="ofr-row-actions">
                <button className="btn btn-sm btn-outline" onClick={() => startEdit(o)}>Edit</button>
                <button className="btn btn-sm btn-ghost" onClick={() => toggle(o)}>{o.is_active ? "Hide" : "Show"}</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(o)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {toast && <div className="toast toast-ok" role="status" aria-live="polite">{toast}</div>}

      <ConfirmModal
        open={modal !== null}
        title={modal?.title ?? ""}
        body={modal?.body}
        confirmLabel={modal?.label ?? "Confirm"}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
