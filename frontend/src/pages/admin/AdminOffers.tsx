import { useEffect, useMemo, useState } from "react";
import { api, Offer } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { OfferIcon, OFFER_ICON_KEYS } from "../../components/Icons";
import { useLanguage } from "../../i18n/context";

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
  const { t } = useLanguage();
  const to = (key: string) => t("adminOffers", key);
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
        showToast(to("created"));
      } else {
        await api.admin.updateOffer(editingId, payload);
        showToast(to("updated"));
      }
      cancelEdit();
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : to("errSave"));
    } finally {
      setSaving(false);
    }
  }

  function toggle(o: Offer) {
    const enabling = !o.is_active;
    setModal({
      title: (enabling ? to("showTitle") : to("hideTitle")).replace("{title}", o.title),
      body: enabling ? to("showBody") : to("hideBody"),
      label: enabling ? to("show") : to("hide"),
      danger: !enabling,
      onConfirm: () => {
        api.admin.updateOffer(o.id, { is_active: enabling ? 1 : 0 })
          .then(() => { load(); showToast(enabling ? to("isLive") : to("isHidden")); })
          .catch(() => showToast(to("errToggle")));
      },
    });
  }

  function del(o: Offer) {
    setModal({
      title: to("deleteTitle").replace("{title}", o.title),
      body: to("cannotBeUndone"),
      label: to("delete"),
      danger: true,
      onConfirm: () => {
        api.admin.deleteOffer(o.id)
          .then(() => { if (editingId === o.id) cancelEdit(); load(); showToast(to("deleted")); })
          .catch(() => showToast(to("errDelete")));
      },
    });
  }

  return (
    <div className="admin-page ofr">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{to("title")}</h1>
        <span className="ofr-tally mono">{to("tally").replace("{live}", String(liveCount)).replace("{total}", String(offers.length))}</span>
      </div>

      <div className="ofr-layout">
        {/* ── Editor ── */}
        <form className="ofr-editor" onSubmit={save}>
          <div className="ofr-editor-head">
            <h2 className="ofr-editor-title">{editingId === null ? to("newOffer") : to("editingOffer")}</h2>
            {editingId !== null && (
              <button type="button" className="link-btn" onClick={cancelEdit}>{to("cancel")}</button>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <label className="ofr-field">
            {to("fieldTitle")}
            <input value={form.title} onChange={set("title")} required maxLength={120} placeholder={to("titlePlaceholder")} />
          </label>

          <label className="ofr-field">
            {to("fieldDescription")}
            <textarea value={form.description} onChange={set("description")} rows={3} maxLength={400} placeholder={to("descPlaceholder")} />
          </label>

          <fieldset className="ofr-icons">
            <legend>{to("icon")}</legend>
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
              {to("badge")} <span className="optional">{to("optional")}</span>
              <input value={form.badge} onChange={set("badge")} maxLength={40} placeholder={to("badgePlaceholder")} />
            </label>
            <label className="ofr-field">
              {to("validUntil")} <span className="optional">{to("optional")}</span>
              <input type="date" value={form.valid_until} onChange={set("valid_until")} />
            </label>
          </div>

          <label className="ofr-field ofr-field-narrow">
            {to("sortOrder")}
            <input type="number" value={form.sort_order} onChange={set("sort_order")} min={0} max={999} />
          </label>

          <div className="ofr-preview">
            <p className="ofr-preview-label mono">{to("preview")}</p>
            <article className="offer-card">
              <span className="offer-icon"><OfferIcon name={form.icon} size={22} /></span>
              {form.badge && <span className="offer-badge">{form.badge}</span>}
              <h3 className="offer-title">{form.title || to("offerTitlePlaceholder")}</h3>
              {form.description && <p className="offer-desc">{form.description}</p>}
              {form.valid_until && <p className="offer-expires">{to("validUntilPreview")} {form.valid_until}</p>}
            </article>
          </div>

          <button className="btn btn-amber ofr-save" type="submit" disabled={saving || !form.title.trim()}>
            {saving ? to("saving") : editingId === null ? to("createOffer") : to("saveChanges")}
          </button>
        </form>

        {/* ── List ── */}
        <div className="ofr-list">
          {loading && <p className="muted">{to("loading")}</p>}
          {!loading && offers.length === 0 && <p className="empty-admin">{to("noOffers")}</p>}

          {offers.map((o) => (
            <article key={o.id} className={`ofr-row${o.is_active ? "" : " is-hidden"}${editingId === o.id ? " is-editing" : ""}`}>
              <span className="ofr-row-icon"><OfferIcon name={o.icon || "flame"} size={20} /></span>

              <div className="ofr-row-body">
                <div className="ofr-row-head">
                  <h3 className="ofr-row-title">{o.title}</h3>
                  <span className={`ofr-state ${o.is_active ? "live" : "off"}`}>{o.is_active ? to("live") : to("hidden")}</span>
                </div>
                {o.badge && <span className="ofr-row-badge">{o.badge}</span>}
                {o.description && <p className="ofr-row-desc">{o.description}</p>}
                {o.valid_until && <p className="ofr-row-meta mono">{to("until")} {o.valid_until}</p>}
              </div>

              <div className="ofr-row-actions">
                <button className="btn btn-sm btn-outline" onClick={() => startEdit(o)}>{to("edit")}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => toggle(o)}>{o.is_active ? to("hide") : to("show")}</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(o)}>{to("delete")}</button>
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
        confirmLabel={modal?.label ?? to("confirm")}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
