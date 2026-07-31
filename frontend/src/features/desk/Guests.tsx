import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { DeskUser } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { Avatar, Badge } from "~/ui/Bits";
import { TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useSession } from "~/state/session";
import { DeskPage, Loaded, Nothing, Stat, TableWrap, Toolbar } from "./parts";

/**
 * Accounts.
 *
 * Only the owner can hand out or take back staff access, and nobody can act on
 * their own account here — the buttons are simply not rendered for it, so there
 * is no way to lock yourself out of your own console by mis-tapping.
 */
export function Guests() {
  const users = useResource(() => api.desk.users.list(), []);
  const { user: me, isOwner } = useSession();
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [search, setSearch] = useState("");
  const [points, setPoints] = useState<{ user: DeskUser; amount: number; reason: string } | null>(null);

  const rows = users.data ?? [];
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) => row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle)
    );
  }, [rows, search]);

  const staff = rows.filter((row) => row.role !== "user").length;
  const banned = rows.filter((row) => row.banned_at).length;

  return (
    <DeskPage title="Guests">
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Accounts" value={rows.length} icon="users" />
        <Stat label="Staff" value={staff} icon="shield" />
        <Stat label="Blocked" value={banned} icon="ban" />
      </div>

      <Toolbar>
        <label className="desk-field desk-field--grow">
          <span className="label">Search</span>
          <input
            type="search"
            className="input"
            placeholder="Name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </Toolbar>

      <Loaded resource={users}>
        {() =>
          shown.length === 0 ? (
            <Nothing>Nobody matches that.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const isMe = row.id === me?.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="row">
                          <Avatar name={row.name} />
                          <span>
                            <strong>{row.name}</strong>
                            {isMe ? <span className="fine faint"> you</span> : null}
                            <p className="fine faint">{row.email}</p>
                          </span>
                        </span>
                      </td>
                      <td>
                        {row.role === "super_admin" ? (
                          <Badge tone="hot">Owner</Badge>
                        ) : row.role === "admin" ? (
                          <Badge tone="good">Staff</Badge>
                        ) : row.banned_at ? (
                          <Badge tone="bad">Blocked</Badge>
                        ) : (
                          <Badge tone="neutral">Guest</Badge>
                        )}
                      </td>
                      <td className="fine faint">{stampLabel(row.created_at)}</td>
                      <td>
                        {isMe || row.role === "super_admin" ? (
                          <span className="fine faint">No actions</span>
                        ) : (
                          <div className="table__actions">
                            <Button
                              size="sm"
                              tone="quiet"
                              onClick={() => setPoints({ user: row, amount: 100, reason: "Goodwill" })}
                            >
                              Points
                            </Button>

                            {isOwner ? (
                              <Button
                                size="sm"
                                tone="ghost"
                                onClick={async () => {
                                  const makingStaff = row.role === "user";
                                  const ok = await confirm({
                                    title: makingStaff ? `Give ${row.name} staff access?` : `Remove ${row.name}'s staff access?`,
                                    body: makingStaff
                                      ? "They will be able to see every booking, every payment and every message."
                                      : "They will lose the console immediately.",
                                    confirmLabel: makingStaff ? "Make staff" : "Remove access",
                                    destructive: !makingStaff,
                                  });
                                  if (!ok) return;
                                  try {
                                    await api.desk.users.setRole(row.id, makingStaff ? "admin" : "user");
                                    users.reload();
                                    toast.done("Role changed.");
                                  } catch (err) {
                                    toast.failed(err);
                                  }
                                }}
                              >
                                {row.role === "user" ? "Make staff" : "Remove staff"}
                              </Button>
                            ) : null}

                            <Button
                              size="sm"
                              tone={row.banned_at ? "ghost" : "danger"}
                              onClick={async () => {
                                if (row.banned_at) {
                                  try {
                                    await api.desk.users.unban(row.id);
                                    users.reload();
                                    toast.done("Unblocked.");
                                  } catch (err) {
                                    toast.failed(err);
                                  }
                                  return;
                                }
                                const ok = await confirm({
                                  title: `Block ${row.name}?`,
                                  body: "They cannot sign in or book until you unblock them. Their existing bookings stay.",
                                  confirmLabel: "Block them",
                                });
                                if (!ok) return;
                                try {
                                  await api.desk.users.ban(row.id);
                                  users.reload();
                                  toast.done("Blocked.");
                                } catch (err) {
                                  toast.failed(err);
                                }
                              }}
                            >
                              {row.banned_at ? "Unblock" : "Block"}
                            </Button>

                            {isOwner ? (
                              <IconButton
                                name="trash"
                                label={`Delete ${row.name}`}
                                size="sm"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: `Delete ${row.name}'s account?`,
                                    body: "Their reviews and personal details go. Bookings and takings stay in the records.",
                                    confirmLabel: "Delete",
                                  });
                                  if (!ok) return;
                                  try {
                                    await api.desk.users.remove(row.id);
                                    users.reload();
                                    toast.done("Account deleted.");
                                  } catch (err) {
                                    toast.failed(err);
                                  }
                                }}
                              />
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      <Sheet
        open={points !== null}
        onClose={() => setPoints(null)}
        title={points ? `Points for ${points.user.name}` : ""}
        description="A negative number takes points away. One point is roughly 100 FCFA spent."
        footer={
          <>
            <Button tone="ghost" onClick={() => setPoints(null)}>
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                if (!points) return;
                try {
                  await api.desk.users.adjustPoints(points.user.id, points.amount, points.reason);
                  setPoints(null);
                  toast.done("Points adjusted.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        {points ? (
          <>
            <TextField
              label="Points"
              type="number"
              value={points.amount}
              onChange={(e) => setPoints({ ...points, amount: Number(e.target.value) })}
            />
            <TextField
              label="Why"
              hint="They see this in their account."
              value={points.reason}
              maxLength={100}
              onChange={(e) => setPoints({ ...points, reason: e.target.value })}
            />
          </>
        ) : null}
      </Sheet>
    </DeskPage>
  );
}
