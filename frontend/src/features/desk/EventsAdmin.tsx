import { api } from "~/lib/api";
import { longDate, phoneLabel, stampLabel, timeLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, State, TableWrap } from "./parts";

const TYPES: Record<string, string> = {
  birthday: "Birthday",
  corporate: "Company",
  private_dining: "Private dining",
  wedding: "Wedding",
  other: "Other",
};

/**
 * Enquiries about booking the place out.
 *
 * These are conversations, not bookings, so the only states are pending,
 * confirmed and cancelled, and the contact details are the point of the screen.
 */
export function EventsAdmin() {
  const events = useResource(() => api.desk.events.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  async function set(id: number, status: "pending" | "confirmed" | "cancelled", said: string) {
    try {
      await api.desk.events.setStatus(id, status);
      events.reload();
      toast.done(said);
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <DeskPage title="Events" lead="Parties, company nights and anything that takes the whole place.">
      {confirmElement}

      <Loaded resource={events}>
        {(rows) =>
          rows.length === 0 ? (
            <Nothing>No enquiries yet.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Occasion</th>
                  <th className="table__num">Guests</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td>
                      {longDate(event.date)}
                      <span className="fine faint mono"> {timeLabel(event.time)}</span>
                    </td>
                    <td>
                      <strong>{event.name}</strong>
                      <p className="fine faint">
                        <a href={`mailto:${event.email}`}>{event.email}</a> {phoneLabel(event.phone)}
                      </p>
                      {event.note ? <p className="fine">{event.note}</p> : null}
                    </td>
                    <td>{TYPES[event.event_type] ?? event.event_type}</td>
                    <td className="table__num">{event.guest_count}</td>
                    <td>
                      <State value={event.status} />
                    </td>
                    <td className="fine faint">{stampLabel(event.created_at)}</td>
                    <td>
                      <div className="table__actions">
                        {event.status !== "confirmed" ? (
                          <Button size="sm" tone="primary" onClick={() => set(event.id, "confirmed", "Confirmed.")}>
                            Confirm
                          </Button>
                        ) : null}
                        {event.status !== "cancelled" ? (
                          <Button size="sm" tone="danger" onClick={() => set(event.id, "cancelled", "Cancelled.")}>
                            Turn down
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          tone="quiet"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Delete this enquiry?",
                              body: "The contact details go with it.",
                              confirmLabel: "Delete",
                            });
                            if (!ok) return;
                            try {
                              await api.desk.events.remove(event.id);
                              events.reload();
                              toast.done("Deleted.");
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>
    </DeskPage>
  );
}
