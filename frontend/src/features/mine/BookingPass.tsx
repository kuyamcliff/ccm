import type { ReactNode } from "react";
import type { Booking } from "~/lib/api";
import { longDate, timeLabel } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Money } from "~/ui/Bits";

/**
 * A booking, as the guest holds it.
 *
 * The thing that actually matters at the door is the code, so it is the
 * largest element on the card and set in mono where every character is
 * unambiguous — somebody is going to read it out over a phone. The QR that
 * goes with it lives on the PDF receipt, which is signed by the server; there
 * is no point drawing an unsigned one here.
 */

const STATUS: Record<Booking["status"], { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "good" },
  pending_payment: { label: "Awaiting deposit", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "bad" },
  completed: { label: "Done", tone: "neutral" },
};

export function BookingPass({
  booking,
  actions,
  compact,
}: {
  booking: Booking;
  actions?: ReactNode;
  /** The tighter cut used for the guest's own list, where several passes sit
      one under the other and the full ticket size is more than the page needs. */
  compact?: boolean;
}) {
  const status = STATUS[booking.status];
  const dead = booking.status === "cancelled";

  return (
    <article className={`pass${dead ? " pass--void" : ""}${compact ? " pass--compact" : ""}`}>
      <header className="pass__head">
        <span className={`badge badge--${status.tone}`}>{status.label}</span>
        {booking.table_label ? (
          <span className="pass__table">
            Table <strong>{booking.table_label}</strong>
          </span>
        ) : (
          <span className="pass__table faint">Table on arrival</span>
        )}
      </header>

      <p className="pass__when display display--lg">{longDate(booking.date)}</p>

      <div className="pass__facts">
        <div>
          <span className="label">Time</span>
          <p className="mono pass__big">{timeLabel(booking.time)}</p>
        </div>
        <div>
          <span className="label">People</span>
          <p className="mono pass__big">{booking.party_size}</p>
        </div>
        {booking.amount_fcfa ? (
          <div>
            <span className="label">Deposit paid</span>
            <p className="pass__big">
              <Money value={booking.amount_fcfa} />
            </p>
          </div>
        ) : null}
      </div>

      {booking.note ? (
        <p className="pass__note fine">
          <Icon name="info" size={15} />
          {booking.note}
        </p>
      ) : null}

      {/* The perforation. Below it is the part the door cares about. */}
      <div className="pass__tear" aria-hidden="true">
        <span />
        <span />
      </div>

      <footer className="pass__foot">
        <div>
          <span className="label">Show this code</span>
          <p className="pass__code mono">{booking.ccm_code ?? `#${String(booking.id).padStart(4, "0")}`}</p>
        </div>
        {booking.checked_in_at ? (
          <span className="badge badge--good">Checked in</span>
        ) : booking.cancel_reason ? (
          <span className="fine faint">{booking.cancel_reason}</span>
        ) : null}
      </footer>

      {actions ? <div className="pass__actions">{actions}</div> : null}
    </article>
  );
}
