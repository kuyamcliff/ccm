import { useEffect, useState } from "react";
import { api, GiftCard } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

type ModalState = { title: string; body?: string; label?: string; danger?: boolean; onConfirm: () => void };

export default function AdminGiftCards() {
  const { t } = useLanguage();
  const tg = (key: string) => t("adminGiftCards", key);
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newCard, setNewCard] = useState<{ code: string; value_fcfa: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const load = () => api.admin.giftCards().then((d) => { setCards(d.cards); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await api.admin.createGiftCard(Number(value));
      setNewCard(res);
      setValue("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tg("errCreate"));
    } finally { setCreating(false); }
  }

  function toggle(id: number, currentlyActive: boolean) {
    const action = currentlyActive ? tg("deactivate") : tg("activate");
    setModal({
      title: tg("toggleTitle").replace("{action}", action),
      body: currentlyActive ? tg("deactivateBody") : tg("activateBody"),
      label: action,
      danger: currentlyActive,
      onConfirm: () => { api.admin.toggleGiftCard(id).then(load); },
    });
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{tg("title")}</h1>
      </div>

      <div className="admin-two-col">
        <div>
          <h3 style={{ marginBottom: "1rem" }}>{tg("generateCard")}</h3>
          {newCard && (
            <div className="alert alert-ok" style={{ marginBottom: "1rem" }}>
              <strong>{tg("newCardCreated")}</strong>
              <p>{tg("code")} <code style={{ fontSize: "1.1rem", letterSpacing: 2 }}>{newCard.code}</code></p>
              <p>{tg("value")} <strong>{newCard.value_fcfa.toLocaleString()} FCFA</strong></p>
            </div>
          )}
          <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">{tg("valueLabel")}</label>
              <input className="form-input" type="number" min={500} step={500} value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000" required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? tg("generating") : tg("generate")}</button>
          </form>
        </div>

        <div>
          <h3 style={{ marginBottom: "1rem" }}>{tg("allCards").replace("{n}", String(cards.length))}</h3>
          {loading && <p className="muted">{tg("loading")}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {cards.map((c) => (
              <div key={c.id} className={`admin-gift-card-row${!c.is_active ? " dimmed" : ""}`}>
                <div>
                  <code className="gift-code">{c.code}</code>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>{tg("initial").replace("{amount}", c.initial_value_fcfa.toLocaleString())}</span>
                    <span style={{ fontSize: "0.8rem", color: c.remaining_value_fcfa === 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                      {tg("remaining").replace("{amount}", c.remaining_value_fcfa.toLocaleString())}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {!c.is_active
                    ? <button className="btn btn-sm btn-outline" style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.35)" }} onClick={() => toggle(c.id, false)}>{tg("activate")}</button>
                    : <button className="btn btn-sm btn-outline" onClick={() => toggle(c.id, true)}>{tg("deactivate")}</button>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={modal !== null}
        title={modal?.title ?? ""}
        body={modal?.body}
        confirmLabel={modal?.label ?? tg("confirm")}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
