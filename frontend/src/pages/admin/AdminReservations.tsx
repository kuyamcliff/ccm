import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Reservation } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

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
  const { t } = useLanguage();
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
    <button className="btn btn-outline btn-sm" onClick={onUndo} title={t("adminReservations", "undoCancellation")}>
      {t("adminReservations", "undo")} ({m}:{String(s).padStart(2, "0")})
    </button>
  );
}

export function AdminReservations() {
  const { t } = useLanguage();
  const tr = (key: string) => t("adminReservations", key);
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
      setError(e instanceof Error ? e.message : tr("errLoad"));
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
      setError(e instanceof Error ? e.message : tr("errUpdate"));
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
      setError(e instanceof Error ? e.message : tr("errCancel"));
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
      setError(e instanceof Error ? e.message : tr("errUndo"));
    } finally {
      setBusy(null);
    }
  }

  const STATUS_KEYS: Record<string, string> = { confirmed: "confirmed", cancelled: "cancelled", completed: "completed" };

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      confirmed: "badge-green",
      cancelled: "badge-red",
      completed: "badge-muted",
    };
    return <span className={`badge ${map[status] ?? "badge-muted"}`}>{tr(STATUS_KEYS[status] ?? "confirmed")}</span>;
  }

  return (
    <div>
      <h1 className="admin-page-title">{tr("title")}</h1>

      <form className="admin-filters" onSubmit={handleSearch}>
        <label>
          {tr("date")}
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </label>
        <label>
          {tr("status")}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{tr("all")}</option>
            <option value="confirmed">{tr("confirmed")}</option>
            <option value="cancelled">{tr("cancelled")}</option>
            <option value="completed">{tr("completed")}</option>
          </select>
        </label>
        <label>
          {tr("search")}
          <input
            type="text"
            placeholder={tr("searchPlaceholder")}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-outline btn-sm">{tr("search")}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>{tr("refresh")}</button>
      </form>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tr("loading")}</p>
      ) : reservations.length === 0 ? (
        <p className="empty-admin">{tr("noResults")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("colCcmCode")}</th>
                <th>{tr("colDate")}</th>
                <th>{tr("colTime")}</th>
                <th>{tr("colName")}</th>
                <th>{tr("colEmail")}</th>
                <th>{tr("colTable")}</th>
                <th>{tr("colParty")}</th>
                <th>{tr("colPhone")}</th>
                <th>{tr("colPayment")}</th>
                <th>{tr("colStatus")}</th>
                <th>{tr("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className={r.status === "cancelled" ? "row-cancelled" : ""}>
                  <td data-label={tr("colCcmCode")} className="mono" style={{ fontSize: "0.76rem", color: r.ccm_code ? "var(--amber)" : "var(--text-muted)" }}>
                    {r.ccm_code ?? `#${String(r.id).padStart(4, "0")}`}
                  </td>
                  <td data-label={tr("colDate")} className="mono">{r.date}</td>
                  <td data-label={tr("colTime")} className="mono">{r.time}</td>
                  <td data-label={tr("colName")}>{r.user_name}</td>
                  <td data-label={tr("colEmail")} style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{r.user_email}</td>
                  <td data-label={tr("colTable")}>{r.table_label ?? ""}</td>
                  <td data-label={tr("colParty")}>{r.party_size}</td>
                  <td data-label={tr("colPhone")} className="mono" style={{ fontSize: "0.82rem" }}>{r.phone}</td>
                  <td data-label={tr("colPayment")}>
                    <span className={`badge badge-${r.payment_status === "paid" ? "green" : r.payment_status === "refunded" ? "muted" : "amber"}`}>
                      {tr(r.payment_status === "paid" ? "payPaid" : r.payment_status === "refunded" ? "payRefunded" : "payUnpaid")}
                    </span>
                  </td>
                  <td data-label={tr("colStatus")}>{statusBadge(r.status)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {r.status === "confirmed" && (
                        <>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={busy === r.id}
                            onClick={() => updateStatus(r.id, "completed")}
                          >
                            {tr("complete")}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busy === r.id}
                            onClick={() => { setCancelTarget(r); setCancelReason(""); }}
                          >
                            {tr("cancel")}
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
        title={tr("cancelTitle").replace("{name}", cancelTarget?.user_name ?? "")}
        confirmLabel={tr("cancelReservation")}
        confirmClass="btn-danger"
        onConfirm={doCancel}
        onCancel={() => { setCancelTarget(null); setCancelReason(""); }}
      >
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.9rem" }}>
            {tr("reasonOptional")}
            <textarea
              rows={2}
              maxLength={300}
              placeholder={tr("reasonPlaceholder")}
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
