import { useState } from "react";
import { api } from "~/lib/api";
import type { DeskUser } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { stampLabel } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Avatar } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, Pager, Search, State, StatTile, Stats, TableWrap, Toolbar } from "./parts";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";

/**
 * Accounts.
 *
 * Paginated on the server rather than filtered in the browser, because this is
 * the one list in the console that grows without limit and a restaurant with
 * five thousand accounts should not be sending all five thousand to a phone.
 *
 * Who can do what here is deliberately layered, and the layers are the server's,
 * not this screen's:
 *
 *   admin        look, and block somebody
 *   super admin  unblock, and make somebody staff
 *   owner        everything, including closing an account
 *
 * The buttons follow that, but they are hiding rather than protecting. Every one
 * of these routes checks the role again.
 */

const PAGE = 25;

export function Guests() {
  const toast = useToast();
  const { isOwner, isTopOwner } = useSession();
  const { confirm, element } = useConfirm();

  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [points, setPoints] = useState<DeskUser | null>(null);

  const guests = useQuery(
    K.desk.users(query, offset),
    () => api.desk.users.list({ q: query || undefined, limit: PAGE, offset }),
    { staleMs: 30_000 }
  );

  function refresh() {
    invalidate("desk.users*");
    guests.reload();
  }

  const ban = useMutation(async (id: number) => {
    await api.desk.users.ban(id);
    refresh();
    toast.done("Blocked.");
  });

  const unban = useMutation(async (id: number) => {
    await api.desk.users.unban(id);
    refresh();
    toast.done("Unblocked.");
  });

  const setRole = useMutation(async (input: { id: number; role: "user" | "admin" }) => {
    await api.desk.users.setRole(input.id, input.role);
    refresh();
    toast.done("Saved.");
  });

  const close = useMutation(async (id: number) => {
    await api.desk.users.remove(id);
    refresh();
    toast.done("Account closed.");
  });

  return (
    <DeskPage title="Guests" hint="Accounts, and who is staff.">
      <Loaded query={guests}>
        {(page) => (
          <>
            <Stats>
              <StatTile label="Accounts" value={page.totals.total} />
              <StatTile label="Staff" value={page.totals.staff} />
              <StatTile label="Blocked" value={page.totals.banned} />
            </Stats>

            <Toolbar>
              <Search
                value={query}
                onChange={(next) => {
                  setQuery(next);
                  setOffset(0);
                }}
                placeholder="Name or email"
              />
              {query ? <span className="fine faint">{page.matching} matching</span> : null}
            </Toolbar>

            {page.users.length === 0 ? (
              <Nothing icon="user">Nobody matches that.</Nothing>
            ) : (
              <TableWrap label="Guests">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Joined</th>
                    <th>Role</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {page.users.map((guest) => (
                    <tr key={guest.id}>
                      <td>
                        <span className="bar bar--tight">
                          <Avatar name={guest.name} size={26} />
                          <span className="dk-cell">
                            <span>{guest.name}</span>
                            <span className="fine faint">{guest.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="nowrap fine faint">{stampLabel(guest.created_at)}</td>
                      <td>
                        {guest.banned_at ? (
                          <State tone="bad">Blocked</State>
                        ) : guest.role === "user" ? (
                          <State>Guest</State>
                        ) : (
                          <State tone="hot">{guest.role.replace("_", " ")}</State>
                        )}
                      </td>
                      <td>
                        <div className="bar bar--tight nowrap">
                          <Button size="sm" tone="quiet" onClick={() => setPoints(guest)}>
                            Points
                          </Button>

                          {guest.banned_at ? (
                            isOwner ? (
                              <Action
                                size="sm"
                                tone="ghost"
                                pending={unban.pendingFor(guest.id)}
                                pendingLabel="Saving"
                                onClick={() => void unban.run(guest.id)}
                              >
                                Unblock
                              </Action>
                            ) : (
                              <span className="fine faint">Only a super admin can unblock</span>
                            )
                          ) : (
                            <Action
                              size="sm"
                              tone="quiet"
                              pending={ban.pendingFor(guest.id)}
                              pendingLabel="Saving"
                              onClick={async () => {
                                const sure = await confirm({
                                  title: `Block ${guest.name}?`,
                                  body: "They will be signed out everywhere and cannot book or order until somebody unblocks them.",
                                  confirmLabel: "Block them",
                                });
                                if (!sure) return;
                                await ban.run(guest.id);
                              }}
                            >
                              Block
                            </Action>
                          )}

                          {isOwner && (guest.role === "user" || guest.role === "admin") ? (
                            <Action
                              size="sm"
                              tone="quiet"
                              pending={setRole.pendingFor(guest.id)}
                              pendingLabel="Saving"
                              onClick={async () => {
                                const makingStaff = guest.role === "user";
                                const sure = await confirm({
                                  title: makingStaff ? `Make ${guest.name} staff?` : `Remove ${guest.name} from staff?`,
                                  body: makingStaff
                                    ? "They will be able to open the console. You can restrict exactly what they see under Staff access."
                                    : "They keep their account but lose the console.",
                                  confirmLabel: makingStaff ? "Make them staff" : "Remove access",
                                  tone: makingStaff ? "primary" : "danger",
                                });
                                if (!sure) return;
                                await setRole.run({ id: guest.id, role: makingStaff ? "admin" : "user" });
                              }}
                            >
                              {guest.role === "user" ? "Make staff" : "Remove staff"}
                            </Action>
                          ) : null}

                          {isTopOwner && guest.role === "user" ? (
                            <Action
                              size="sm"
                              tone="quiet"
                              pending={close.pendingFor(guest.id)}
                              pendingLabel="Closing"
                              onClick={async () => {
                                const sure = await confirm({
                                  title: `Close ${guest.name}'s account?`,
                                  body: "Their name, email and reviews go. Their bookings and payments stay, because those are the restaurant's records too.",
                                  confirmLabel: "Close it",
                                });
                                if (!sure) return;
                                await close.run(guest.id);
                              }}
                            >
                              Close
                            </Action>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}

            <Pager offset={offset} limit={PAGE} more={page.more} onMove={setOffset} />
          </>
        )}
      </Loaded>

      <AdjustPoints guest={points} onClose={() => setPoints(null)} onDone={refresh} />
      {element}
    </DeskPage>
  );
}

/**
 * Adding or taking away points by hand.
 *
 * Always with a reason, and the reason ends up on the guest's own points history
 * where they can read it. "Goodwill after a long wait" is a sentence somebody
 * will be glad to see; a silent adjustment is one they will ring up about.
 */
function AdjustPoints({
  guest,
  onClose,
  onDone,
}: {
  guest: DeskUser | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [negative, setNegative] = useState(false);

  const adjust = useMutation(async () => {
    if (!guest) return;
    const value = Number(amount) * (negative ? -1 : 1);
    await api.desk.users.adjustPoints(guest.id, value, reason.trim());
    setReason("");
    onDone();
    onClose();
    toast.done("Points adjusted.");
  });

  return (
    <Sheet
      open={guest !== null}
      onClose={onClose}
      title={guest ? `Points for ${guest.name}` : "Points"}
      footer={
        <Action
          tone="primary"
          block
          pending={adjust.pending}
          pendingLabel="Saving"
          disabled={!amount || reason.trim().length < 3}
          onClick={async () => {
            await adjust.run();
            const error = adjust.readError();
            if (error) toast.failed(error, "desk");
          }}
        >
          {negative ? "Take them off" : "Give them"}
        </Action>
      }
    >
      <div className="stack">
        <div className="bar bar--tight">
          <Button size="sm" tone={negative ? "quiet" : "primary"} block onClick={() => setNegative(false)}>
            Give
          </Button>
          <Button size="sm" tone={negative ? "danger" : "quiet"} block onClick={() => setNegative(true)}>
            Take away
          </Button>
        </div>

        <TextField
          label="How many points"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />

        <TextField
          label="Why"
          hint="The guest sees this in their own points history, so write it for them."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={120}
        />

        <div className="bar bar--wrap bar--tight">
          {["Goodwill after a long wait", "Correcting a mistake", "Competition prize"].map((preset) => (
            <Button key={preset} size="sm" tone="ghost" onClick={() => setReason(preset)}>
              {preset}
            </Button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
