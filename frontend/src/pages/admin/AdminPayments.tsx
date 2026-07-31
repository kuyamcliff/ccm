import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Payment } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

type AdminPayment = Payment & { res_date: string; res_time: string; user_name: string };

export function AdminPayments() {
  const { t } = useLanguage();
  const tp = (key: string) => t("adminPayments", key);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);

  function load() {
    api.admin
      .payments()
      .then((r) => setPayments(r.payments))
      .catch((e) => setError(e instanceof Error ? e.message : tp("errLoad")))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function doMarkFailed() {
    if (cancelTarget === null) return;
    const id = cancelTarget;
    setCancelTarget(null);
    setBusy(id);
    try {
      await api.admin.updatePayment(id, "failed");
      setPayments((ps) => ps.map((p) => p.id === id ? { ...p, status: "failed" } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : tp("errAction"));
    } finally {
      setBusy(null);
    }
  }

  const filtered = filterStatus ? payments.filter((p) => p.status === filterStatus) : payments;

  const totalCollected = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + (p.amount_fcfa ?? 0), 0);

  const pending = payments.filter((p) => p.status === "pending").length;
  const failed  = payments.filter((p) => p.status === "failed").length;

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      completed: "badge-green",
      pending: "badge-amber",
      failed: "badge-red",
    };
    const labelKey: Record<string, string> = { completed: "completed", pending: "pending", failed: "failed" };
    return <span className={`badge ${map[status] ?? "badge-muted"}`}>{tp(labelKey[status] ?? "pending")}</span>;
  }

  function methodLabel(method?: string) {
    if (!method) return "";
    if (method === "orange_money") return tp("orangeMoney");
    if (method === "mtn_momo") return tp("mtnMomo");
    if (method === "free") return tp("free");
    return method;
  }

  return (
    <div>
      <h1 className="admin-page-title">{tp("title")}</h1>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <p className="stat-value">
            {totalCollected.toLocaleString()}
            <span style={{ fontSize: "0.9rem", marginLeft: "0.25rem" }}>FCFA</span>
          </p>
          <p className="stat-label">{tp("totalCollected")}</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{payments.filter((p) => p.status === "completed").length}</p>
          <p className="stat-label">{tp("completed")}</p>
        </div>
        <div className="stat-card">
          <p className="stat-value" style={{ color: "var(--amber-light)" }}>{pending}</p>
          <p className="stat-label">{tp("pending")}</p>
        </div>
        <div className="stat-card">
          <p className="stat-value" style={{ color: "var(--red)" }}>{failed}</p>
          <p className="stat-label">{tp("failed")}</p>
        </div>
      </div>

      <div className="admin-filters" style={{ marginBottom: "1.25rem" }}>
        <label>
          {tp("status")}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{tp("all")}</option>
            <option value="completed">{tp("completed")}</option>
            <option value="pending">{tp("pending")}</option>
            <option value="failed">{tp("failed")}</option>
          </select>
        </label>
      </div>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tp("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="empty-admin">{tp("noPayments")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tp("colReference")}</th>
                <th>{tp("colCustomer")}</th>
                <th>{tp("colReservation")}</th>
                <th>{tp("colMethod")}</th>
                <th>{tp("colAmount")}</th>
                <th>{tp("colStatus")}</th>
                <th>{tp("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td data-label={tp("colReference")} className="mono" style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    {p.reference}
                  </td>
                  <td data-label={tp("colCustomer")}>{p.user_name}</td>
                  <td data-label={tp("colReservation")} className="mono" style={{ fontSize: "0.8rem" }}>
                    {p.res_date} {p.res_time}
                  </td>
                  <td data-label={tp("colMethod")} style={{ fontSize: "0.85rem" }}>{methodLabel(p.method)}</td>
                  <td data-label={tp("colAmount")} className="mono" style={{ fontWeight: 700, color: p.status === "completed" ? "var(--green)" : "var(--text)" }}>
                    {p.amount_fcfa?.toLocaleString() ?? ""} FCFA
                  </td>
                  <td data-label={tp("colStatus")}>{statusBadge(p.status)}</td>
                  <td>
                    {p.status === "pending" && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busy === p.id}
                        onClick={() => setCancelTarget(p.id)}
                      >
                        {tp("cancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={cancelTarget !== null}
        title={tp("markFailedTitle")}
        body={tp("markFailedBody")}
        confirmLabel={tp("markFailed")}
        confirmClass="btn-danger"
        onConfirm={doMarkFailed}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
