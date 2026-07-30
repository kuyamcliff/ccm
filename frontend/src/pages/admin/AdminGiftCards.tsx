import { useEffect, useState } from "react";
import { api, GiftCard } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

type ModalState = { title: string; body?: string; label?: string; danger?: boolean; onConfirm: () => void };

export default function AdminGiftCards() {
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
      setError(err instanceof Error ? err.message : "Failed to create gift card.");
    } finally { setCreating(false); }
  }

  function toggle(id: number, currentlyActive: boolean) {
    const action = currentlyActive ? "Deactivate" : "Activate";
    setModal({
      title: `${action} this gift card?`,
      body: currentlyActive
        ? "The card will no longer be accepted at checkout until re-activated."
        : "The card will be usable at checkout again.",
      label: action,
      danger: currentlyActive,
      onConfirm: () => { api.admin.toggleGiftCard(id).then(load); },
    });
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Gift Cards</h1>
      </div>

      <div className="admin-two-col">
        <div>
          <h3 style={{ marginBottom: "1rem" }}>Generate gift card</h3>
          {newCard && (
            <div className="alert alert-ok" style={{ marginBottom: "1rem" }}>
              <strong>New card created!</strong>
              <p>Code: <code style={{ fontSize: "1.1rem", letterSpacing: 2 }}>{newCard.code}</code></p>
              <p>Value: <strong>{newCard.value_fcfa.toLocaleString()} FCFA</strong></p>
            </div>
          )}
          <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Value (FCFA) *</label>
              <input className="form-input" type="number" min={500} step={500} value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000" required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creating}>{creating ? "Generating…" : "Generate gift card"}</button>
          </form>
        </div>

        <div>
          <h3 style={{ marginBottom: "1rem" }}>All gift cards ({cards.length})</h3>
          {loading && <p className="muted">Loading…</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {cards.map((c) => (
              <div key={c.id} className={`admin-gift-card-row${!c.is_active ? " dimmed" : ""}`}>
                <div>
                  <code className="gift-code">{c.code}</code>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem" }}>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>Initial: {c.initial_value_fcfa.toLocaleString()} FCFA</span>
                    <span style={{ fontSize: "0.8rem", color: c.remaining_value_fcfa === 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                      Remaining: {c.remaining_value_fcfa.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {!c.is_active
                    ? <button className="btn btn-sm btn-outline" style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.35)" }} onClick={() => toggle(c.id, false)}>Activate</button>
                    : <button className="btn btn-sm btn-outline" onClick={() => toggle(c.id, true)}>Deactivate</button>
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
        confirmLabel={modal?.label ?? "Confirm"}
        confirmClass={modal?.danger !== false ? "btn-danger" : "btn-primary"}
        onConfirm={() => { modal?.onConfirm(); setModal(null); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
