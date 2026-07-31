import { api } from "~/lib/api";
import { phoneLabel, timeAgo } from "~/lib/format";
import { usePoll, useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, State, TableWrap, Toolbar } from "./parts";

/**
 * The waiting list.
 *
 * Ordered by how long people have been standing there, which is the only order
 * that matters when the room is full. Waiting entries stay at the top; anything
 * settled drops below.
 */
export function Queue() {
  const entries = useResource(() => api.desk.waitlist.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  usePoll(entries.reload, 45_000);

  async function set(id: number, status: string, said: string) {
    try {
      await api.desk.waitlist.setStatus(id, status);
      entries.reload();
      toast.done(said);
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <DeskPage title="Queue" lead="Everyone waiting for a table tonight.">
      {confirmElement}

      <Toolbar>
        <Button tone="ghost" icon="refresh" onClick={entries.reload}>
          Refresh
        </Button>
        <Button
          tone="danger"
          className="push"
          onClick={async () => {
            const ok = await confirm({
              title: "Clear the queue?",
              body: "Everyone still waiting comes off the list. Do this at closing, not during service.",
              confirmLabel: "Clear it",
            });
            if (!ok) return;
            try {
              await api.desk.waitlist.clear();
              entries.reload();
              toast.done("Queue cleared.");
            } catch (err) {
              toast.failed(err);
            }
          }}
        >
          Clear the queue
        </Button>
      </Toolbar>

      <Loaded resource={entries}>
        {(rows) => {
          const waiting = rows.filter((entry) => entry.status === "waiting" || entry.status === "notified");
          const rest = rows.filter((entry) => entry.status !== "waiting" && entry.status !== "notified");
          const ordered = [...waiting, ...rest];

          if (ordered.length === 0) return <Nothing>Nobody waiting.</Nothing>;

          return (
            <TableWrap>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th className="table__num">People</th>
                  <th>Waiting</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ordered.map((entry, index) => (
                  <tr key={entry.id}>
                    <td className="mono">{entry.status === "waiting" || entry.status === "notified" ? index + 1 : "—"}</td>
                    <td>
                      {entry.name}
                      <span className="fine faint"> {phoneLabel(entry.phone)}</span>
                      {entry.note ? <p className="fine hot">{entry.note}</p> : null}
                    </td>
                    <td className="table__num">{entry.party_size}</td>
                    <td className="fine">{timeAgo(entry.joined_at)}</td>
                    <td>
                      <State value={entry.status} />
                    </td>
                    <td>
                      <div className="table__actions">
                        {entry.status === "waiting" ? (
                          <Button size="sm" tone="ghost" icon="phone" onClick={() => set(entry.id, "notified", "Marked as called.")}>
                            Called them
                          </Button>
                        ) : null}
                        {entry.status === "waiting" || entry.status === "notified" ? (
                          <>
                            <Button size="sm" tone="primary" onClick={() => set(entry.id, "seated", "Seated.")}>
                              Seated
                            </Button>
                            <Button size="sm" tone="danger" onClick={() => set(entry.id, "no_show", "Marked as no show.")}>
                              No show
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          );
        }}
      </Loaded>
    </DeskPage>
  );
}
