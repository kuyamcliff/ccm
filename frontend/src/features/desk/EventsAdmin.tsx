import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { dayLabel, phoneLabel, timeAgo, timeLabel } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Nothing, State, TableWrap } from "./parts";
import { useToast } from "~/state/toast";

/**
 * Enquiries about booking the place out.
 *
 * These are conversations, not bookings, so the screen's job is to make sure
 * none of them is forgotten. Pending ones sort to the top and the contact
 * details are tappable, because the next step is almost always a phone call.
 */

const TYPE_WORD: Record<string, string> = {
  birthday: "Birthday",
  corporate: "Work do",
  private_dining: "Private dining",
  wedding: "Wedding",
  other: "Other",
};

export function EventsAdmin() {
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const events = useQuery(K.desk.events, () => api.desk.events.list(), { staleMs: 60_000 });

  const setStatus = useMutation(async (input: { id: number; status: "pending" | "confirmed" | "cancelled" }) => {
    await api.desk.events.setStatus(input.id, input.status);
    invalidate("desk.events*");
    events.reload();
    toast.done("Saved.");
  });

  const remove = useMutation(async (id: number) => {
    await api.desk.events.remove(id);
    invalidate("desk.events*");
    events.reload();
    toast.done("Deleted.");
  });

  const sorted = [...(events.data ?? [])].sort((a, b) => {
    /* Anything still pending first: those are the ones somebody has to act on. */
    if (a.status !== b.status) return a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0;
    return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
  });

  return (
    <DeskPage title="Events" hint="Enquiries about booking the whole place out.">
      <Loaded query={events}>
        {() =>
          sorted.length === 0 ? (
            <Nothing icon="sparkle">No enquiries.</Nothing>
          ) : (
            <TableWrap label="Event enquiries">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Who</th>
                  <th>People</th>
                  <th>Note</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((enquiry) => (
                  <tr key={enquiry.id}>
                    <td className="nowrap">
                      <span className="strong">{dayLabel(enquiry.date)}</span>
                      <span className="fine faint"> {timeLabel(enquiry.time)}</span>
                    </td>
                    <td>{TYPE_WORD[enquiry.event_type] ?? enquiry.event_type}</td>
                    <td>
                      <span className="dk-cell">
                        <span>{enquiry.name}</span>
                        <span className="fine">
                          <a href={`tel:+237${enquiry.phone}`}>{phoneLabel(enquiry.phone)}</a>
                        </span>
                        <span className="fine faint">
                          <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
                        </span>
                      </span>
                    </td>
                    <td>{enquiry.guest_count}</td>
                    <td className="dk-wrapcell">{enquiry.note || <span className="faint">None</span>}</td>
                    <td>
                      <State
                        tone={
                          enquiry.status === "confirmed" ? "good" : enquiry.status === "cancelled" ? "bad" : "warn"
                        }
                      >
                        {enquiry.status === "pending" ? "New" : enquiry.status === "confirmed" ? "On" : "Off"}
                      </State>
                      <span className="micro faint"> {timeAgo(enquiry.created_at)}</span>
                    </td>
                    <td>
                      <div className="bar bar--tight nowrap">
                        {enquiry.status !== "confirmed" ? (
                          <Action
                            size="sm"
                            tone="ghost"
                            pending={setStatus.pending}
                            pendingLabel="Saving"
                            onClick={() => void setStatus.run({ id: enquiry.id, status: "confirmed" })}
                          >
                            Confirm
                          </Action>
                        ) : null}
                        {enquiry.status !== "cancelled" ? (
                          <Action
                            size="sm"
                            tone="quiet"
                            pending={setStatus.pending}
                            pendingLabel="Saving"
                            onClick={() => void setStatus.run({ id: enquiry.id, status: "cancelled" })}
                          >
                            Decline
                          </Action>
                        ) : (
                          <Button
                            size="sm"
                            tone="quiet"
                            onClick={async () => {
                              const sure = await confirm({
                                title: `Delete ${enquiry.name}'s enquiry?`,
                                confirmLabel: "Delete it",
                              });
                              if (!sure) return;
                              await remove.run(enquiry.id);
                            }}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}
