import { useEffect, useState } from "react";
import { api } from "../../api";
import type { RestaurantTable } from "../../api";

type AdminTable = RestaurantTable & { active: number };

export function AdminTables() {
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api.admin.tables()
      .then((r) => setTables(r.tables))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tables."))
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(t: AdminTable) {
    setBusy(t.id);
    const newActive = !t.active;
    try {
      await api.admin.updateTable(t.id, { active: newActive });
      setTables((ts) => ts.map((x) => x.id === t.id ? { ...x, active: newActive ? 1 : 0 } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Tables</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Deactivating a table removes it from the reservation picker. Active tables appear on the floor plan.
      </p>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">Loading tables...</p>
      ) : tables.length === 0 ? (
        <p className="empty-admin">No tables found. Add tables via the database.</p>
      ) : (
        <div className="admin-tables-grid">
          {tables.map((t) => (
            <div key={t.id} className={`admin-table-card${t.active ? "" : " inactive"}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <h3>Table {t.label}</h3>
                <span className={`badge badge-${t.active ? "green" : "muted"}`}>
                  {t.active ? "active" : "inactive"}
                </span>
              </div>
              <p>Capacity: {t.capacity} seats</p>
              <p>Zone: {t.zone === "outdoor" ? "Outdoor terrace" : "Indoor main hall"}</p>
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                pos ({t.pos_x}, {t.pos_y})
              </p>
              <div className="admin-table-actions">
                <button
                  className={t.active ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
                  disabled={busy === t.id}
                  onClick={() => toggleActive(t)}
                >
                  {busy === t.id ? "..." : t.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
