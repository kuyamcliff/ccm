import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Reservation } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

type AdminReservation = Reservation & { user_name: string; user_email: string };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function undoSecondsLeft(cancelledAt: string | null): number {
  if (!cancelledAt) return 0;
  const ts = new Date(cancelledAt + (cancelledAt.endsWith("Z") ? "" : "Z")).getTime();
  const remaining = Math.floor((ts + 30 * 60 * 1000 - Date.now()) / 1000);
  return Math.max(0, remaining);
}

function UndoTimer({ cancelledAt, onUndo }: { cancelledAt: string; onUndo: () => void }) {
  const [secs, setSecs] = useState(() => undoSecondsLeft(cancelledAt));
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => {
      const s = undoSecondsLeft(cancelledAt);
      setSecs(s);
      if (s === 0 && ref.current) clearInterval(ref.current);
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [cancelledAt]);

  if (secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <button className="btn btn-outline btn-sm" onClick={onUndo} title="Undo cancellation">
      Undo ({m}:{String(s).padStart(2, "0")})
    </button>
  );
}

export function AdminReservations() {
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(todayLocal());
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const [cancelTarget, setCancelTarget] = useState<AdminReservation | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: { date?: string; status?: string; q?: string } = {};
      if (filterDate) params.date = filterDate;
      if (filterStatus) params.status = filterStatus;
      if (searchQ.trim()) params.q = searchQ.trim();
      const r = await api.admin.reservations(params);
      setReservations(r.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reservations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterDate, filterStatus]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  async function updateStatus(id: number, status: string) {
    setBusy(id);
    try {
      await api.admin.updateReservation(id, status);
      setReservations((rs) =>
        rs.map((r) => (r.id === id ? { ...r, status: status as AdminReservation["status"] } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function doCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    setBusy(id);
    try {
      await api.admin.cancelReservation(id, cancelReason.trim());
      setReservations((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, status: "cancelled" as const, cancelled_at: new Date().toISOString(), cancel_reason: cancelReason.trim() }
            : r
        )
      );
      setCancelReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setBusy(null);
    }
  }

  async function doUncancel(id: number) {
    setBusy(id);
    try {
      await api.admin.uncancelReservation(id);
      setReservations((rs) =>
        rs.map((r) => r.id === id ? { ...r, status: "confirmed" as const, cancelled_at: null } : r)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo cancellation.");
    } finally {
      setBusy(null);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      confirmed: "badge-green",
      cancelled: "badge-red",
      completed: "badge-muted",
    };
    return <span className={`badge ${map[status] ?? "badge-muted"}`}>{status}</span>;
  }

  return (
    <div>
      <h1 className="admin-page-title">Reservations</h1>

      <form className="admin-filters" onSubmit={handleSearch}>
        <label>
          Date
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </label>
        <label>
          Status
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          Search
          <input
            type="text"
            placeholder="CCM code, phone, or name..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-outline btn-sm">Search</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Refresh</button>
      </form>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">Loading...</p>
      ) : reservations.length === 0 ? (
        <p className="empty-admin">No reservations found for these filters.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>CCM Code</th>
                <th>Date</th>
                <th>Time</th>
                <th>Name</th>
                <th>Email</th>
                <th>Table</th>
                <th>Party</th>
                <th>Phone</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className={r.status === "cancelled" ? "row-cancelled" : ""}>
                  <td data-label="CCM code" className="mono" style={{ fontSize: "0.76rem", color: r.ccm_code ? "var(--amber)" : "var(--text-muted)" }}>
                    {r.ccm_code ?? `#${String(r.id).padStart(4, "0")}`}
                  </td>
                  <td data-label="Date" className="mono">{r.date}</td>
                  <td data-label="Time" className="mono">{r.time}</td>
                  <td data-label="Name">{r.user_name}</td>
                  <td data-label="Email" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{r.user_email}</td>
                  <td data-label="Table">{r.table_label ?? ""}</td>
                  <td data-label="Party">{r.party_size}</td>
                  <td data-label="Phone" className="mono" style={{ fontSize: "0.82rem" }}>{r.phone}</td>
                  <td data-label="Payment">
                    <span className={`badge badge-${r.payment_status === "paid" ? "green" : r.payment_status === "refunded" ? "muted" : "amber"}`}>
                      {r.payment_status}
                    </span>
                  </td>
                  <td data-label="Status">{statusBadge(r.status)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {r.status === "confirmed" && (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={busy === r.id}
                            onClick={() => updateStatus(r.id, "completed")}
                          >
                            Complete
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busy === r.id}
                            onClick={() => { setCancelTarget(r); setCancelReason(""); }}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {r.status === "cancelled" && r.cancelled_at && (
                        <UndoTimer
                          cancelledAt={r.cancelled_at}
                          onUndo={() => doUncancel(r.id)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={cancelTarget !== null}
        title={`Cancel ${cancelTarget?.user_name}'s reservation?`}
        confirmLabel="Cancel reservation"
        confirmClass="btn-danger"
        onConfirm={doCancel}
        onCancel={() => { setCancelTarget(null); setCancelReason(""); }}
      >
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.9rem" }}>
            Reason (optional)
            <textarea
              rows={2}
              maxLength={300}
              placeholder="e.g. table unavailable, restaurant closing early..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)", padding: "0.5rem", fontFamily: "inherit", fontSize: "0.88rem", resize: "vertical" }}
            />
          </label>
        </div>
      </ConfirmModal>
    </div>
  );
}
