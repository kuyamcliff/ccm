import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { DeskUser } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Avatar, Badge } from "~/ui/Bits";
import { TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useSession } from "~/state/session";
import { DeskPage, Loaded, Nothing, Stat, Toolbar } from "./parts";

function roleBadge(row: DeskUser) {
  if (row.role === "owner") return <Badge tone="hot">Owner</Badge>;
  if (row.role === "super_admin") return <Badge tone="hot">Super admin</Badge>;
  if (row.role === "admin") return <Badge tone="good">Staff</Badge>;
  if (row.banned_at) return <Badge tone="bad">Blocked</Badge>;
  return <Badge tone="neutral">Guest</Badge>;
}

/**
 * Accounts.
 *
 * Only the owner can hand out or take back staff access, and nobody can act on
 * their own account here — the actions are simply not offered for it, so there
 * is no way to lock yourself out of your own console by mis-tapping.
 *
 * A row is a name and nothing else: what it costs to look at four hundred
 * accounts on a phone matters more here than anywhere else in the console.
 * The four actions a row used to carry — points, staff, block, delete — live
 * behind a tap instead, one screen at a time.
 *
 * The search box queries the server rather than filtering a list already on
 * the page, and the list itself pages in batches rather than arriving whole —
 * a venue open a few years has thousands of these, not dozens.
 */
const PAGE = 30;

export function Guests() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const [rows, setRows] = useState<DeskUser[]>([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useResource(() => api.desk.users.list({ q: term || undefined, limit: PAGE }), [term]);

  useEffect(() => {
    if (page.data) { setRows(page.data.users); setMore(page.data.more); }
  }, [page.data]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api.desk.users.list({ q: term || undefined, limit: PAGE, offset: rows.length });
      setRows((current) => [...current, ...next.users]);
      setMore(next.more);
    } catch (err) {
      toast.failed(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const { user: me, isOwner } = useSession();
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [selected, setSelected] = useState<DeskUser | null>(null);
  const [points, setPoints] = useState<{ user: DeskUser; amount: number; reason: string } | null>(null);

  const totals = page.data?.totals ?? { total: 0, staff: 0, banned: 0 };
  const selectedIsMe = selected?.id === me?.id;
  const selectedIsProtected = selected?.role === "super_admin" || selected?.role === "owner";

  return (
    <DeskPage title="Guests">
      {confirmElement}

      <div className="stat-grid">
        <Stat label="Accounts" value={totals.total} icon="users" />
        <Stat label="Staff" value={totals.staff} icon="shield" />
        <Stat label="Blocked" value={totals.banned} icon="ban" />
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

      <Loaded resource={page}>
        {() =>
          rows.length === 0 ? (
            <Nothing>Nobody matches that.</Nothing>
          ) : (
            <div className="guest-list">
              {rows.map((row) => (
                <button key={row.id} type="button" className="guest-row" onClick={() => setSelected(row)}>
                  <Avatar name={row.name} />
                  <span className="guest-row__body">
                    <strong>
                      {row.name}
                      {row.id === me?.id ? <span className="fine faint"> · you</span> : null}
                    </strong>
                    <span className="fine faint">{row.email}</span>
                  </span>
                  {roleBadge(row)}
                  <Icon name="chevron-right" size={16} />
                </button>
              ))}
              {more ? (
                <Button tone="ghost" busy={loadingMore} onClick={() => void loadMore()}>
                  Show more
                </Button>
              ) : (
                <p className="fine faint guest-list__end">
                  {rows.length} of {totals.total.toLocaleString()} shown.
                </p>
              )}
            </div>
          )
        }
      </Loaded>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        description={selected?.email}
      >
        {selected ? (
          <div className="stack">
            <div className="row row--wrap">
              {roleBadge(selected)}
              <span className="fine faint">Joined {stampLabel(selected.created_at)}</span>
            </div>

            {selectedIsMe || selectedIsProtected ? (
              <p className="fine faint">
                {selectedIsMe ? "There is nothing to do to your own account here." : "Owners and super admins are unrestricted — demote them instead of acting on them here."}
              </p>
            ) : (
              <div className="stack stack--tight">
                <Button
                  tone="quiet"
                  icon="gift"
                  onClick={() => {
                    setPoints({ user: selected, amount: 100, reason: "Goodwill" });
                    setSelected(null);
                  }}
                >
                  Adjust points
                </Button>

                {isOwner ? (
                  <Button
                    tone="quiet"
                    icon="shield"
                    onClick={async () => {
                      const makingStaff = selected.role === "user";
                      const ok = await confirm({
                        title: makingStaff ? `Give ${selected.name} staff access?` : `Remove ${selected.name}'s staff access?`,
                        body: makingStaff
                          ? "They will be able to see every booking, every payment and every message."
                          : "They will lose the console immediately.",
                        confirmLabel: makingStaff ? "Make staff" : "Remove access",
                        destructive: !makingStaff,
                      });
                      if (!ok) return;
                      try {
                        await api.desk.users.setRole(selected.id, makingStaff ? "admin" : "user");
                        page.reload();
                        setSelected(null);
                        toast.done("Role changed.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    {selected.role === "user" ? "Make staff" : "Remove staff"}
                  </Button>
                ) : null}

                <Button
                  tone={selected.banned_at ? "quiet" : "danger"}
                  icon="ban"
                  onClick={async () => {
                    if (selected.banned_at) {
                      try {
                        await api.desk.users.unban(selected.id);
                        page.reload();
                        setSelected(null);
                        toast.done("Unblocked.");
                      } catch (err) {
                        toast.failed(err);
                      }
                      return;
                    }
                    const ok = await confirm({
                      title: `Block ${selected.name}?`,
                      body: "They cannot sign in or book until you unblock them. Their existing bookings stay.",
                      confirmLabel: "Block them",
                    });
                    if (!ok) return;
                    try {
                      await api.desk.users.ban(selected.id);
                      page.reload();
                      setSelected(null);
                      toast.done("Blocked.");
                    } catch (err) {
                      toast.failed(err);
                    }
                  }}
                >
                  {selected.banned_at ? "Unblock" : "Block"}
                </Button>

                {isOwner ? (
                  <Button
                    tone="danger"
                    icon="trash"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete ${selected.name}'s account?`,
                        body: "Their reviews and personal details go. Bookings and takings stay in the records.",
                        confirmLabel: "Delete",
                      });
                      if (!ok) return;
                      try {
                        await api.desk.users.remove(selected.id);
                        page.reload();
                        setSelected(null);
                        toast.done("Account deleted.");
                      } catch (err) {
                        toast.failed(err);
                      }
                    }}
                  >
                    Delete account
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </Sheet>

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
