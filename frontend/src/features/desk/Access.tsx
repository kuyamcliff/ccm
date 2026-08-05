import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { AdminScope, StaffAccess } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Avatar, Badge } from "~/ui/Bits";
import { Switch } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useSession } from "~/state/session";
import { DeskPage, Loaded, Nothing, Stat, TableWrap } from "./parts";

/**
 * Who can reach what.
 *
 * Owner only, in both directions: the nav hides it from everyone else and the
 * server refuses the same request, so a locked-out admin cannot reach this by
 * typing the URL either. Every toggle below writes straight through — there
 * is no "save" button, because a restriction the owner meant to apply is one
 * they want applied now, not after they remember to press something.
 */
export function Access() {
  const { isTopOwner } = useSession();
  const access = useResource(() => api.desk.access.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [editing, setEditing] = useState<StaffAccess | null>(null);

  const staff = access.data?.staff ?? [];
  const superAdmins = staff.filter((s) => s.role === "super_admin").length;
  const restricted = staff.filter((s) => s.role === "admin" && Object.values(s.scopes).some((v) => !v)).length;

  if (!isTopOwner) {
    return (
      <DeskPage title="Access">
        <Notice tone="warn">This page is for the owner only.</Notice>
      </DeskPage>
    );
  }

  return (
    <DeskPage title="Access" lead="What each admin can reach, and who you have made a super admin.">
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Staff" value={staff.length} icon="users" />
        <Stat label="Super admins" value={superAdmins} icon="shield" hint="All your powers except being you." />
        <Stat label="Restricted" value={restricted} icon="lock" hint="Admins locked out of at least one page." />
      </div>

      <Loaded resource={access}>
        {(data) =>
          data.staff.length === 0 ? (
            <Nothing>Nobody has staff access yet.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.staff.map((row) => {
                  const lockedCount = Object.values(row.scopes).filter((v) => !v).length;
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="row">
                          <Avatar name={row.name} />
                          <span>
                            <strong>{row.name}</strong>
                            <p className="fine faint">{row.email}</p>
                          </span>
                        </span>
                      </td>
                      <td>
                        {row.role === "super_admin" ? (
                          <Badge tone="hot">Super admin</Badge>
                        ) : (
                          <Badge tone="good">Staff</Badge>
                        )}
                      </td>
                      <td>
                        {row.role === "super_admin" ? (
                          <span className="fine faint">Unrestricted</span>
                        ) : lockedCount === 0 ? (
                          <span className="fine faint">Full access</span>
                        ) : (
                          <Badge tone="warn">{lockedCount} locked</Badge>
                        )}
                      </td>
                      <td className="fine faint">{stampLabel(row.created_at)}</td>
                      <td>
                        <div className="table__actions">
                          {row.role === "admin" ? (
                            <Button size="sm" tone="quiet" onClick={() => setEditing(row)}>
                              Permissions
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            tone="ghost"
                            onClick={async () => {
                              const promoting = row.role === "admin";
                              const ok = await confirm({
                                title: promoting ? `Make ${row.name} a super admin?` : `Demote ${row.name} to admin?`,
                                body: promoting
                                  ? "They get every page and every action you have, with nothing locked. Only you outrank them."
                                  : "They go back to a plain admin, with whatever pages you have already granted them.",
                                confirmLabel: promoting ? "Make super admin" : "Demote",
                                destructive: !promoting,
                              });
                              if (!ok) return;
                              try {
                                await api.desk.access.setRole(row.id, promoting ? "super_admin" : "admin");
                                access.reload();
                                toast.done(promoting ? "Now a super admin." : "Demoted to admin.");
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          >
                            {row.role === "admin" ? "Make super admin" : "Demote"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      <PermissionsSheet
        staffer={editing}
        scopes={access.data?.scopes ?? []}
        onClose={() => setEditing(null)}
        onChanged={(id, scope, granted) => {
          access.set((current) => ({
            ...current!,
            staff: current!.staff.map((s) => (s.id === id ? { ...s, scopes: { ...s.scopes, [scope]: granted } } : s)),
          }));
          setEditing((cur) => (cur && cur.id === id ? { ...cur, scopes: { ...cur.scopes, [scope]: granted } } : cur));
        }}
      />
    </DeskPage>
  );
}

function PermissionsSheet({
  staffer,
  scopes,
  onClose,
  onChanged,
}: {
  staffer: StaffAccess | null;
  scopes: { key: AdminScope; label: string; hint: string }[];
  onClose: () => void;
  onChanged: (id: number, scope: AdminScope, granted: boolean) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<AdminScope | null>(null);

  const lockedCount = useMemo(
    () => (staffer ? Object.values(staffer.scopes).filter((v) => !v).length : 0),
    [staffer]
  );

  return (
    <Sheet
      open={staffer !== null}
      onClose={onClose}
      title={staffer ? `${staffer.name}'s access` : ""}
      description={
        staffer
          ? lockedCount === 0
            ? "Every page is switched on. Turn one off to lock them out of it."
            : `${lockedCount} page${lockedCount === 1 ? "" : "s"} locked.`
          : undefined
      }
    >
      {staffer ? (
        <div className="stack">
          {scopes.map((scope) => (
            <Switch
              key={scope.key}
              label={
                <span>
                  {scope.label}
                  <span className="fine faint" style={{ display: "block" }}>
                    {scope.hint}
                  </span>
                </span>
              }
              checked={staffer.scopes[scope.key] ?? true}
              disabled={busy === scope.key}
              onChange={async (next) => {
                setBusy(scope.key);
                try {
                  await api.desk.access.setScope(staffer.id, scope.key, next);
                  onChanged(staffer.id, scope.key, next);
                } catch (err) {
                  toast.failed(err);
                } finally {
                  setBusy(null);
                }
              }}
            />
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
