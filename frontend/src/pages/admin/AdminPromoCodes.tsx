import { useEffect, useState } from "react";
import { api, PromoCode } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

type ModalState = { title: string; body?: string; label?: string; danger?: boolean; onConfirm: () => void };

const EMPTY = { code: "", type: "percent" as "percent" | "flat", value: "", description: "", min_spend_fcfa: "", max_uses: "", expires_at: "" };

export default function AdminPromoCodes() {
  const { t } = useLanguage();
  const tp = (key: string) => t("adminPromoCodes", key);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = () => api.admin.promoCodes().then((d) => { setCodes(d.codes); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.admin.createPromoCode({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        description: form.description,
        min_spend_fcfa: form.min_spend_fcfa ? Number(form.min_spend_fcfa) : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : undefined,
        expires_at: form.expires_at || undefined,
      });
      setForm(EMPTY);
      load();
      showToast(tp("created"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tp("errCreate"));
    } finally { setSaving(false); }
  }

  function toggle(c: PromoCode) {
    const enabling = !c.is_active;
    setModal({
      title: tp("toggleTitle").replace("{action}", enabling ? tp("enable") : tp("disable")).replace("{code}", c.code),
      body: enabling ? tp("enableBody") : tp("disableBody"),
      label: enabling ? tp("enable") : tp("disable"),
      danger: !enabling,
      onConfirm: () => { api.admin.togglePromoCode(c.id, !c.is_active).then(load); },
    });
  }

  function del(id: number, code: string) {
    setModal({
      title: tp("deleteTitle").replace("{code}", code),
      body: tp("deleteBody"),
      label: tp("delete"),
      danger: true,
      onConfirm: () => { api.admin.deletePromoCode(id).then(() => { load(); showToast(tp("deleted")); }); },
    });
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{tp("title")}</h1>
      </div>

      <div className="admin-two-col">
        <div>
          <h3 style={{ marginBottom: "1rem" }}>{tp("createCode")}</h3>
          <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">{tp("codeLabel")}</label>
              <input className="form-input" value={form.code} onChange={set("code")} placeholder="SUMMER20" required style={{ textTransform: "uppercase" }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{tp("type")}</label>
                <select className="form-input" value={form.type} onChange={set("type")}>
                  <option value="percent">{tp("percent")}</option>
                  <option value="flat">{tp("flat")}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{tp("valueLabel").replace("{unit}", form.type === "percent" ? "%" : "FCFA")}</label>
                <input className="form-input" type="number" min={1} value={form.value} onChange={set("value")} placeholder={form.type === "percent" ? "20" : "1000"} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{tp("description")}</label>
              <input className="form-input" value={form.description} onChange={set("description")} placeholder={tp("descPlaceholder")} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{tp("minSpend")}</label>
                <input className="form-input" type="number" min={0} value={form.min_spend_fcfa} onChange={set("min_spend_fcfa")} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">{tp("maxUses")}</label>
                <input className="form-input" type="number" min={1} value={form.max_uses} onChange={set("max_uses")} placeholder="100" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{tp("expiresAt")}</label>
              <input className="form-input" type="date" value={form.expires_at} onChange={set("expires_at")} />
            </div>

            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? tp("creating") : tp("create")}</button>
          </form>
        </div>

        <div>
          <h3 style={{ marginBottom: "1rem" }}>{tp("allCodes").replace("{n}", String(codes.length))}</h3>
          {loading && <p className="muted">{tp("loading")}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {codes.map((c) => (
              <div key={c.id} className={`admin-promo-row${!c.is_active ? " dimmed" : ""}`}>
                <div>
                  <code className="promo-code-text">{c.code}</code>
                  <span className="promo-type-pill">
                    {c.type === "percent" ? tp("percentOff").replace("{value}", String(c.value)) : tp("flatOff").replace("{value}", c.value.toLocaleString())}
                  </span>
                  {c.description && <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.15rem" }}>{c.description}</p>}
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.15rem" }}>
                    <span className="hint">{tp("used").replace("{count}", `${c.uses_count}${c.max_uses ? `/${c.max_uses}` : ""}`)}</span>
                    {c.expires_at && <span className="hint">{tp("expires").replace("{date}", c.expires_at)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button className="btn btn-sm btn-outline" onClick={() => toggle(c)}>{c.is_active ? tp("disable") : tp("enable")}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(c.id, c.code)}>{tp("delete")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="toast toast-ok">{toast}</div>}

      <ConfirmModal
        open={modal !== null}
        title={modal?.title ?? ""}
        body={modal?.body}
        confirmLabel={modal?.label ?? tp("confirm")}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
