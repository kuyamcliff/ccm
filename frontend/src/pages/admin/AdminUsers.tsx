import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AdminUser } from "../../api";
import { useAuth } from "../../auth";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

function RoleBadge({ role }: { role: string }) {
  const { t } = useLanguage();
  const cls = role === "super_admin" ? "role-badge super" : role === "admin" ? "role-badge admin" : "role-badge user";
  const label = role === "super_admin" ? t("adminUsers", "superAdmin") : role === "admin" ? t("adminUsers", "admin") : t("adminUsers", "user");
  return <span className={cls}>{label}</span>;
}

export function AdminUsers() {
  const { t } = useLanguage();
  const tu = (key: string) => t("adminUsers", key);
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === "super_admin";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    api.admin.users()
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : tu("errLoad")))
      .finally(() => setLoading(false));
  }, []);

  async function doBan(id: number) {
    setBanTarget(null);
    setBusy(id);
    try {
      await api.admin.banUser(id);
      setUsers((us) => us.map((u) => u.id === id ? { ...u, banned_at: new Date().toISOString() } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : tu("errBan"));
    } finally {
      setBusy(null);
    }
  }

  async function doUnban(id: number) {
    setUnbanTarget(null);
    setBusy(id);
    try {
      await api.admin.unbanUser(id);
      setUsers((us) => us.map((u) => u.id === id ? { ...u, banned_at: null } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : tu("errUnban"));
    } finally {
      setBusy(null);
    }
  }

  async function setRole(id: number, role: "user" | "admin") {
    setBusy(id);
    try {
      await api.admin.setUserRole(id, role);
      setUsers((us) => us.map((u) => u.id === id ? { ...u, role } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : tu("errRole"));
    } finally {
      setBusy(null);
    }
  }

  async function doDelete(id: number) {
    setDeleteTarget(null);
    setBusy(id);
    try {
      await api.admin.deleteUser(id);
      setUsers((us) => us.filter((u) => u.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : tu("errDelete"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">{tu("title")}</h1>

      {error &&<p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tu("loading")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tu("colId")}</th>
                <th>{tu("colName")}</th>
                <th>{tu("colEmail")}</th>
                <th>{tu("colRole")}</th>
                <th>{tu("colStatus")}</th>
                <th>{tu("colJoined")}</th>
                <th>{tu("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.banned_at ? "row-cancelled" : ""}>
                    <td data-label={tu("colId")} className="mono" style={{ color: "var(--text-muted)" }}>{u.id}</td>
                    <td data-label={tu("colName")}>{u.name} {isSelf && <span className="role-badge user" style={{ fontSize: "0.7rem" }}>{tu("you")}</span>}</td>
                    <td data-label={tu("colEmail")} style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{u.email}</td>
                    <td data-label={tu("colRole")}><RoleBadge role={u.role} /></td>
                    <td data-label={tu("colStatus")}>
                      {u.banned_at
                        ? <span className="badge badge-red">{tu("banned")}</span>
                        : <span className="badge badge-green">{tu("active")}</span>}
                    </td>
                    <td data-label={tu("colJoined")} style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{u.created_at.slice(0, 10)}</td>
                    <td>
                      {!isSelf && (
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {/* Ban / Unban */}
                          {!u.banned_at && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busy === u.id}
                              onClick={() => setBanTarget(u)}
                            >
                              {tu("ban")}
                            </button>
                          )}
                          {u.banned_at && isSuperAdmin && (
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={busy === u.id}
                              onClick={() => setUnbanTarget(u)}
                            >
                              {tu("unban")}
                            </button>
                          )}
                          {/* Role (super admin only) */}
                          {isSuperAdmin && u.role !== "super_admin" && (
                            <select
                              className="role-select"
                              value={u.role}
                              disabled={busy === u.id}
                              onChange={(e) => setRole(u.id, e.target.value as "user" | "admin")}
                            >
                              <option value="user">{tu("user")}</option>
                              <option value="admin">{tu("admin")}</option>
                            </select>
                          )}
                          {/* Delete */}
                          {isSuperAdmin && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busy === u.id}
                              onClick={() => setDeleteTarget(u)}
                            >
                              {tu("delete")}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={banTarget !== null}
        title={tu("banTitle").replace("{name}", banTarget?.name ?? "")}
        body={tu("banBody")}
        confirmLabel={tu("banUser")}
        confirmClass="btn-danger"
        onConfirm={() => { if (banTarget) doBan(banTarget.id); }}
        onCancel={() => setBanTarget(null)}
      />

      <ConfirmModal
        open={unbanTarget !== null}
        title={tu("unbanTitle").replace("{name}", unbanTarget?.name ?? "")}
        body={tu("unbanBody")}
        confirmLabel={tu("unban")}
        confirmClass="btn-amber"
        onConfirm={() => { if (unbanTarget) doUnban(unbanTarget.id); }}
        onCancel={() => setUnbanTarget(null)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={tu("deleteTitle").replace("{name}", deleteTarget?.name ?? "")}
        body={tu("deleteBody")}
        confirmLabel={tu("deleteAccount")}
        confirmClass="btn-danger"
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget.id); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
