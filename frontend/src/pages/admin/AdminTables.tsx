import { useEffect, useState } from "react";
import { api } from "../../api";
import type { RestaurantTable } from "../../api";
import { useLanguage } from "../../i18n/context";

type AdminTable = RestaurantTable & { active: number };

export function AdminTables() {
  const { t } = useLanguage();
  const tt = (key: string) => t("adminTables", key);
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api.admin.tables()
      .then((r) => setTables(r.tables))
      .catch((e) => setError(e instanceof Error ? e.message : tt("errLoad")))
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(t: AdminTable) {
    setBusy(t.id);
    const newActive = !t.active;
    try {
      await api.admin.updateTable(t.id, { active: newActive });
      setTables((ts) => ts.map((x) => x.id === t.id ? { ...x, active: newActive ? 1 : 0 } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("errUpdate"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">{tt("title")}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {tt("subtitle")}
      </p>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tt("loading")}</p>
      ) : tables.length === 0 ? (
        <p className="empty-admin">{tt("noTables")}</p>
      ) : (
        <div className="admin-tables-grid">
          {tables.map((tbl) => (
            <div key={tbl.id} className={`admin-table-card${tbl.active ? "" : " inactive"}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <h3>{tt("table")} {tbl.label}</h3>
                <span className={`badge badge-${tbl.active ? "green" : "muted"}`}>
                  {tbl.active ? tt("active") : tt("inactive")}
                </span>
              </div>
              <p>{tt("capacity").replace("{n}", String(tbl.capacity))}</p>
              <p>{tt("zone")} {tbl.zone === "outdoor" ? tt("outdoor") : tt("indoor")}</p>
              <p style={{ fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                pos ({tbl.pos_x}, {tbl.pos_y})
              </p>
              <div className="admin-table-actions">
                <button
                  className={tbl.active ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
                  disabled={busy === tbl.id}
                  onClick={() => toggleActive(tbl)}
                >
                  {busy === tbl.id ? "..." : tbl.active ? tt("deactivate") : tt("activate")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
