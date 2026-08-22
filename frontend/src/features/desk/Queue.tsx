import { api } from "~/lib/api";
import { useMutation, useQuery, usePoll, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { phoneLabel, timeAgo } from "~/lib/format";
import { Action } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Nothing, State } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The walk-in queue on a full night.
 *
 * Three buttons per row and they are the three things that happen: tell them a
 * table is free, sit them down, or take them off because they left.
 *
 * "Tell them" sends the message the backend already has a template for, so the
 * guest gets a text rather than somebody shouting a name across a car park. It
 * is the first button because it is the one that has to happen before the other
 * two are true.
 */

const WAITING = new Set(["waiting", "notified"]);

export function Queue() {
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const queue = useQuery(K.desk.queue, () => api.desk.waitlist.list(), { staleMs: 15_000 });
  usePoll(() => queue.reload(), 30_000);

  const setStatus = useMutation(async (input: { id: number; status: string; said: string }) => {
    await api.desk.waitlist.setStatus(input.id, input.status);
    invalidate("desk.queue*");
    queue.reload();
    toast.done(input.said);
  });

  const clear = useMutation(async () => {
    await api.desk.waitlist.clear();
    invalidate("desk.queue*");
    queue.reload();
    toast.done("Queue cleared.");
  });

  const entries = queue.data ?? [];
  const waiting = entries.filter((entry) => WAITING.has(entry.status));
  const gone = entries.filter((entry) => !WAITING.has(entry.status));

  return (
    <DeskPage
      title="Queue"
      hint="Who is waiting, and how long they have been."
      actions={
        waiting.length === 0 && gone.length > 0 ? (
          <Action
            size="sm"
            tone="quiet"
            icon="trash"
            pending={clear.pending}
            pendingLabel="Clearing"
            onClick={async () => {
              const sure = await confirm({
                title: "Clear the queue?",
                body: "Everybody already seated or gone comes off the list. Anybody still waiting stays.",
                confirmLabel: "Clear it",
              });
              if (!sure) return;
              await clear.run();
            }}
          >
            Clear
          </Action>
        ) : null
      }
    >
      <Loaded query={queue}>
        {() => (
          <>
            {waiting.length === 0 ? (
              <Nothing icon="users">Nobody waiting. Good night so far.</Nothing>
            ) : (
              <div className="rows">
                {waiting.map((entry, index) => (
                  <div key={entry.id} className="row row--tall">
                    <span className="dk-queueno">{index + 1}</span>

                    <span className="grow stack stack--tight">
                      <span className="small strong">{entry.name}</span>
                      <span className="fine faint">
                        {entry.party_size} people · {phoneLabel(entry.phone)} · waiting {timeAgo(entry.joined_at)}
                      </span>
                      {entry.note ? (
                        <span className="fine">
                          <Icon name="info" size={12} /> {entry.note}
                        </span>
                      ) : null}
                    </span>

                    {entry.status === "notified" ? <State tone="warn">Told</State> : null}

                    <div className="bar bar--tight nowrap">
                      {entry.status === "waiting" ? (
                        <Action
                          size="sm"
                          tone="primary"
                          pending={setStatus.pendingFor(entry.id)}
                          pendingLabel="Sending"
                          onClick={() =>
                            void setStatus.run({ id: entry.id, status: "notified", said: "Told them." })
                          }
                        >
                          Tell them
                        </Action>
                      ) : null}
                      <Action
                        size="sm"
                        tone="ghost"
                        pending={setStatus.pendingFor(entry.id)}
                        pendingLabel="Saving"
                        onClick={() => void setStatus.run({ id: entry.id, status: "seated", said: "Seated." })}
                      >
                        Seated
                      </Action>
                      <Action
                        size="sm"
                        tone="quiet"
                        pending={setStatus.pendingFor(entry.id)}
                        pendingLabel="Saving"
                        onClick={async () => {
                          const sure = await confirm({
                            title: `Take ${entry.name} off the list?`,
                            body: "Use this when somebody has left without eating.",
                            confirmLabel: "Take them off",
                          });
                          if (!sure) return;
                          await setStatus.run({ id: entry.id, status: "no_show", said: "Taken off." });
                        }}
                      >
                        Gone
                      </Action>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {gone.length > 0 ? (
              <section className="dk-section">
                <h2 className="head">Earlier tonight</h2>
                <div className="rows">
                  {gone.map((entry) => (
                    <div key={entry.id} className="row">
                      <span className="grow stack stack--tight">
                        <span className="small">{entry.name}</span>
                        <span className="fine faint">{entry.party_size} people</span>
                      </span>
                      <State tone={entry.status === "seated" ? "good" : "neutral"}>
                        {entry.status === "seated" ? "Seated" : entry.status === "no_show" ? "Left" : entry.status}
                      </State>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </Loaded>

      {element}
    </DeskPage>
  );
}
