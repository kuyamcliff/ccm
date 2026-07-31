import { useState } from "react";
import { api } from "~/lib/api";
import { dayLabel, timeLabel, todayISO } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, State, TableWrap, Toolbar } from "./parts";

const STATUSES = ["", "pending_payment", "confirmed", "completed", "cancelled"];

/**
 * Every booking, with the handful of things staff actually do to one: mark it
 * finished, cancel it with a reason the guest will see, or put back one that
 * was cancelled by mistake.
 */
export function Bookings() {
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();

  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const bookings = useResource(
    () => api.desk.bookings.list({ date: date || undefined, status: status || undefined, q: search || undefined }),
    [date, status, search]
  );

  async function setStatusOf(id: number, next: string) {
    try {
      await api.desk.bookings.setStatus(id, next);
      bookings.reload();
      toast.done("Booking updated.");
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <DeskPage title="Bookings">
      {confirmElement}

      <Toolbar>
        <label className="desk-field">
          <span className="label">Date</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="desk-field">
          <span className="label">Status</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value === "" ? "Any" : value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="desk-field desk-field--grow">
          <span className="label">Search</span>
          <input
            type="search"
            className="input"
            placeholder="Name, email, phone or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <Button tone="ghost" icon="refresh" onClick={bookings.reload}>
          Refresh
        </Button>
        {date ? (
          <Button tone="quiet" onClick={() => setDate("")}>
            Any date
          </Button>
        ) : null}
      </Toolbar>

      <Loaded resource={bookings}>
        {(rows) =>
          rows.length === 0 ? (
            <Nothing>No bookings match that.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Guest</th>
                  <th className="table__num">People</th>
                  <th>Table</th>
                  <th>Status</th>
                  <th>Deposit</th>
                  <th>Code</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      {dayLabel(booking.date)}
                      <span className="fine faint mono"> {timeLabel(booking.time)}</span>
                    </td>
                    <td>
                      {booking.user_name}
                      <span className="fine faint"> {booking.phone}</span>
                      {booking.note ? <p className="fine hot">{booking.note}</p> : null}
                    </td>
                    <td className="table__num">{booking.party_size}</td>
                    <td>{booking.table_label ?? "Any"}</td>
                    <td>
                      <State value={booking.checked_in_at ? "seated" : booking.status} />
                      {booking.cancel_reason ? <p className="fine faint">{booking.cancel_reason}</p> : null}
                    </td>
                    <td className="table__num">
                      {booking.amount_fcfa ? <Money value={booking.amount_fcfa} /> : <State value={booking.payment_status} />}
                    </td>
                    <td className="mono fine">{booking.ccm_code}</td>
                    <td>
                      <div className="table__actions">
                        {booking.status === "cancelled" ? (
                          <Button
                            size="sm"
                            tone="ghost"
                            icon="undo"
                            onClick={async () => {
                              try {
                                await api.desk.bookings.restore(booking.id);
                                bookings.reload();
                                toast.done("Booking restored.");
                              } catch (err) {
                                toast.failed(err);
                              }
                            }}
                          >
                            Restore
                          </Button>
                        ) : (
                          <>
                            {booking.status !== "completed" ? (
                              <Button size="sm" tone="ghost" onClick={() => setStatusOf(booking.id, "completed")}>
                                Finish
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              tone="danger"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: "Cancel this booking?",
                                  body: `${booking.user_name}, ${dayLabel(booking.date)} at ${timeLabel(booking.time)}. You can give a reason on the next screen.`,
                                  confirmLabel: "Continue",
                                });
                                if (!ok) return;
                                setReason("");
                                setCancelling(booking.id);
                              }}
                            >
                              Cancel
                            </Button>
                          </>
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

      <Sheet
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this booking"
        description="The reason is shown to the guest, so write it for them."
        footer={
          <>
            <Button tone="ghost" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              tone="danger"
              onClick={async () => {
                if (cancelling === null) return;
                try {
                  await api.desk.bookings.cancel(cancelling, reason.trim());
                  setCancelling(null);
                  bookings.reload();
                  toast.done("Booking cancelled.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Cancel the booking
            </Button>
          </>
        }
      >
        <TextField
          label="Reason"
          placeholder="Kitchen closed early, double booking, guest called"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </Sheet>
    </DeskPage>
  );
}
