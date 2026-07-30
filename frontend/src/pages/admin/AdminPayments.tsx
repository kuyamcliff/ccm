import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Payment } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

type AdminPayment = Payment & { res_date: string; res_time: string; user_name: string };

export function AdminPayments() {
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
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payments."))
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
      setError(e instanceof Error ? e.message : "Action failed.");
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
    return <span className={`badge ${map[status] ?? "badge-muted"}`}>{status}</span>;
  }

  function methodLabel(method?: string) {
    if (!method) return "";
    if (method === "orange_money") return "Orange Money";
    if (method === "mtn_momo") return "MTN MoMo";
    if (method === "free") return "Free (promo/gift)";
    return method;
  }

  return (
    <div>
      <h1 className="admin-page-title">Payments</h1>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <p className="stat-value">
            {totalCollected.toLocaleString()}
            <span style={{ fontSize: "0.9rem", marginLeft: "0.25rem" }}>FCFA</span>
          </p>
          <p className="stat-label">Total collected</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{payments.filter((p) => p.status === "completed").length}</p>
          <p className="stat-label">Completed</p>
        </div>
        <div className="stat-card">
          <p className="stat-value" style={{ color: "var(--amber-light)" }}>{pending}</p>
          <p className="stat-label">Pending</p>
        </div>
        <div className="stat-card">
          <p className="stat-value" style={{ color: "var(--red)" }}>{failed}</p>
          <p className="stat-label">Failed</p>
        </div>
      </div>

      <div className="admin-filters" style={{ marginBottom: "1.25rem" }}>
        <label>
          Status
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="empty-admin">No payments for this filter.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Reservation</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td data-label="Reference" className="mono" style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    {p.reference}
                  </td>
                  <td data-label="Customer">{p.user_name}</td>
                  <td data-label="Reservation" className="mono" style={{ fontSize: "0.8rem" }}>
                    {p.res_date} {p.res_time}
                  </td>
                  <td data-label="Method" style={{ fontSize: "0.85rem" }}>{methodLabel(p.method)}</td>
                  <td data-label="Amount" className="mono" style={{ fontWeight: 700, color: p.status === "completed" ? "var(--green)" : "var(--text)" }}>
                    {p.amount_fcfa?.toLocaleString() ?? ""} FCFA
                  </td>
                  <td data-label="Status">{statusBadge(p.status)}</td>
                  <td>
                    {p.status === "pending" && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busy === p.id}
                        onClick={() => setCancelTarget(p.id)}
                      >
                        Cancel
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
        title="Mark this payment as failed?"
        body="This cancels the payment record. The customer will not be charged."
        confirmLabel="Mark failed"
        confirmClass="btn-danger"
        onConfirm={doMarkFailed}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
