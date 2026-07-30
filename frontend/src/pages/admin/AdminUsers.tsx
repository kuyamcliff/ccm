import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AdminUser } from "../../api";
import { useAuth } from "../../auth";
import { ConfirmModal } from "../../components/ConfirmModal";

function RoleBadge({ role }: { role: string }) {
  const cls = role === "super_admin" ? "role-badge super" : role === "admin" ? "role-badge admin" : "role-badge user";
  const label = role === "super_admin" ? "Super admin" : role === "admin" ? "Admin" : "User";
  return <span className={cls}>{label}</span>;
}

export function AdminUsers() {
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
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  async function doBan(id: number) {
    setBanTarget(null);
    setBusy(id);
    try {
      await api.admin.banUser(id);
      setUsers((us) => us.map((u) => u.id === id ? { ...u, banned_at: new Date().toISOString() } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ban failed.");
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
      setError(e instanceof Error ? e.message : "Unban failed.");
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
      setError(e instanceof Error ? e.message : "Role update failed.");
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
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Users</h1>

      {error &&<p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">Loading...</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.banned_at ? "row-cancelled" : ""}>
                    <td data-label="ID" className="mono" style={{ color: "var(--text-muted)" }}>{u.id}</td>
                    <td data-label="Name">{u.name} {isSelf && <span className="role-badge user" style={{ fontSize: "0.7rem" }}>you</span>}</td>
                    <td data-label="Email" style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{u.email}</td>
                    <td data-label="Role"><RoleBadge role={u.role} /></td>
                    <td data-label="Status">
                      {u.banned_at
                        ? <span className="badge badge-red">Banned</span>
                        : <span className="badge badge-green">Active</span>}
                    </td>
                    <td data-label="Joined" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{u.created_at.slice(0, 10)}</td>
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
                              Ban
                            </button>
                          )}
                          {u.banned_at && isSuperAdmin && (
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={busy === u.id}
                              onClick={() => setUnbanTarget(u)}
                            >
                              Unban
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
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                          {/* Delete */}
                          {isSuperAdmin && (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busy === u.id}
                              onClick={() => setDeleteTarget(u)}
                            >
                              Delete
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
        title={`Ban ${banTarget?.name}?`}
        body="They will no longer be able to sign in. An admin can unban them later."
        confirmLabel="Ban user"
        confirmClass="btn-danger"
        onConfirm={() => { if (banTarget) doBan(banTarget.id); }}
        onCancel={() => setBanTarget(null)}
      />

      <ConfirmModal
        open={unbanTarget !== null}
        title={`Unban ${unbanTarget?.name}?`}
        body="They will be able to sign in again."
        confirmLabel="Unban"
        confirmClass="btn-amber"
        onConfirm={() => { if (unbanTarget) doUnban(unbanTarget.id); }}
        onCancel={() => setUnbanTarget(null)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.name}'s account?`}
        body="This removes their account permanently. Their booking history stays on file."
        confirmLabel="Delete account"
        confirmClass="btn-danger"
        onConfirm={() => { if (deleteTarget) doDelete(deleteTarget.id); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
