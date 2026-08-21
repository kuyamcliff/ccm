import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { useMutation, useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { Action } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { Avatar } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Nothing, Search, State } from "../parts";
import { resetCache } from "~/lib/store";
import { clearBoot } from "~/lib/boot";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";

/**
 * Signing in as a guest, to see exactly what they see.
 *
 * The most useful debugging tool in a product like this, and the most dangerous
 * thing in the console. The server fences it four ways, and this screen states
 * all four rather than hiding them, because somebody about to use it should know
 * what it does:
 *
 *   - developer only
 *   - guests only, never another member of staff
 *   - written to the audit log naming both accounts, before the session opens
 *   - an ordinary session, so it expires and shows in that guest's own device
 *     list where they can revoke it
 *
 * There is no way back except signing in again. That is deliberate: a reversible
 * impersonation is one somebody forgets they are inside.
 */
const PAGE = 20;

export function DevImpersonate() {
  const toast = useToast();
  const navigate = useNavigate();
  const { settle } = useSession();
  const { confirm, element } = useConfirm();
  const [query, setQuery] = useState("");

  const guests = useQuery(
    K.desk.users(`impersonate.${query}`, 0),
    () => api.desk.users.list({ q: query || undefined, limit: PAGE, offset: 0 }),
    { staleMs: 30_000 }
  );

  const become = useMutation(async (id: number) => {
    const result = await api.desk.dev.impersonate(id);

    /* Everything cached belongs to the developer who was signed in a moment
       ago. Dropping it is not tidiness: leaving it would show the guest's
       screens filled with somebody else's bookings. */
    clearBoot();
    resetCache();
    settle(result.user);

    navigate("/", { replace: true });
    toast.say(`You are now signed in as ${result.user.name}.`);
  });

  return (
    <DeskPage title="Impersonate" hint="Sign in as a guest to see what they see.">
      <Notice tone="warn" title="Read this before using it">
        <ul className="dk-bullets fine">
          <li>You will be signed out of your own account. There is no way back except signing in again.</li>
          <li>It is written to the audit log, naming you and them.</li>
          <li>Guests only. Staff accounts are refused by the server.</li>
          <li>The session shows in that guest's own device list, and they can revoke it.</li>
        </ul>
      </Notice>

      <Search value={query} onChange={setQuery} placeholder="Name or email" />

      <Loaded query={guests}>
        {(page) =>
          page.users.length === 0 ? (
            <Nothing icon="user">Nobody matches that.</Nothing>
          ) : (
            <div className="rows">
              {page.users.map((guest) => (
                <div key={guest.id} className="row row--tall">
                  <Avatar name={guest.name} size={30} />

                  <span className="grow stack stack--tight">
                    <span className="small">{guest.name}</span>
                    <span className="fine faint">{guest.email}</span>
                  </span>

                  {guest.role !== "user" ? (
                    <State tone="neutral">Staff, refused</State>
                  ) : guest.banned_at ? (
                    <State tone="bad">Blocked</State>
                  ) : (
                    <Action
                      size="sm"
                      tone="quiet"
                      pending={become.pending}
                      pendingLabel="Switching"
                      onClick={async () => {
                        const sure = await confirm({
                          title: `Sign in as ${guest.name}?`,
                          body: "You will be signed out of your own account and this will be written to the audit log.",
                          confirmLabel: "Become them",
                          tone: "primary",
                        });
                        if (!sure) return;
                        await become.run(guest.id);
                        const error = become.readError();
                        if (error) toast.failed(error, "desk");
                      }}
                    >
                      Become them
                    </Action>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}
