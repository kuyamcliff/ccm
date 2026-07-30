import { useEffect, useState } from "react";
import { api, WaitlistEntry } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

const STATUS_COLORS: Record<string, string> = {
  waiting: "#f59e0b",
  notified: "#3b82f6",
  seated: "#22c55e",
  cancelled: "#6b7280",
  no_show: "#ef4444",
};

export default function AdminWaitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);

  const load = () => api.admin.waitlist().then((d) => { setEntries(d.entries); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  async function update(id: number, status: string) {
    await api.admin.updateWaitlistEntry(id, status);
    load();
  }

  async function doClear() {
    setClearOpen(false);
    await api.admin.clearWaitlist();
    load();
  }

  const waiting = entries.filter((e) => e.status === "waiting").length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Walk-in Waitlist</h1>
          <p className="admin-page-sub">{waiting} party/parties currently waiting · Auto-refreshes every 30s</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => setClearOpen(true)}>Clear old entries</button>
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && entries.length === 0 && <p className="muted">No waitlist entries today.</p>}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Party</th>
              <th>Note</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td data-label="#">{i + 1}</td>
                <td data-label="Name">{e.name}</td>
                <td data-label="Phone"><a href={`tel:${e.phone}`}>{e.phone}</a></td>
                <td data-label="Party">{e.party_size}</td>
                <td data-label="Note">{e.note || ""}</td>
                <td data-label="Joined">{new Date(e.joined_at + "Z").toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                <td data-label="Status">
                  <span className="status-pill" style={{ background: STATUS_COLORS[e.status] + "22", color: STATUS_COLORS[e.status] }}>
                    {e.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {e.status === "waiting" && (
                      <>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "notified")}>Notify</button>
                        <button className="btn btn-sm btn-primary" onClick={() => update(e.id, "seated")}>Seat</button>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "no_show")}>No-show</button>
                      </>
                    )}
                    {e.status === "notified" && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => update(e.id, "seated")}>Seat</button>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "no_show")}>No-show</button>
                      </>
                    )}
                    {(e.status === "seated" || e.status === "cancelled" || e.status === "no_show") && (
                      <span className="muted" style={{ fontSize: "0.8rem" }}>Done</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={clearOpen}
        title="Remove old waitlist entries?"
        body="This removes all entries older than 24 hours. It cannot be undone."
        confirmLabel="Clear entries"
        confirmClass="btn-danger"
        onConfirm={doClear}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
