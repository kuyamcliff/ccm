import { useState } from "react";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { dayLabel, money, parseLines, timeLabel } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { Code, Money } from "~/ui/Bits";
import { Sheet } from "~/ui/Sheet";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * A receipt, on screen.
 *
 * Two problems this solves at once.
 *
 * The first is that a receipt used to be something you could only download.
 * Tapping it handed you a PDF, which on an Android phone means leaving the site
 * for a viewer and finding your way back. Most of the time somebody wants to
 * *look* at what they paid, not to keep a file, so looking is the default and
 * the file is one more tap for the times it is really wanted.
 *
 * The second is size. A receipt drawn in full on the visits list took most of a
 * screen each, so three past orders were three screens of scrolling. Everything
 * on the list is a row now, and the whole receipt lives in here.
 *
 * Deliberately not a fetch. Every figure below is already in the booking or the
 * order that the list is holding, so opening a receipt costs nothing and works
 * with no signal. The PDF is the only thing that goes to the network, and only
 * when asked for.
 */

type Source =
  | { kind: "booking"; booking: Booking }
  | { kind: "order"; order: TakeawayOrder };

export function ReceiptSheet({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const { c } = useCopy();
  const { address, phone } = useVenue();
  const [saving, setSaving] = useState(false);

  if (!source) return null;

  const save = async () => {
    setSaving(true);
    try {
      const blob =
        source.kind === "booking"
          ? await api.me.bookingReceiptFile(source.booking.id)
          : await api.me.orderReceiptFile(source.order.order_no);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        source.kind === "booking"
          ? `cam-chop-meat-${source.booking.ccm_code ?? source.booking.id}.pdf`
          : `cam-chop-meat-${source.order.order_no}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* The file is a nicety. What is on screen behind this is the receipt. */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={c.mine.receipt}
      footer={
        <div className="bar bar--tight">
          <Button tone="quiet" block onClick={onClose}>
            {c.mine.close}
          </Button>
          <Action tone="primary" block icon="download" pending={saving} pendingLabel={c.pending.saving} onClick={save}>
            {c.mine.download}
          </Action>
        </div>
      }
    >
      <div className="receipt">
        <div className="receipt__head">
          <span className="label">Cam Chop Meat</span>
          {address ? <span className="fine faint">{address}</span> : null}
          {phone ? <span className="fine faint">{phone}</span> : null}
        </div>

        {source.kind === "booking" ? <BookingBody booking={source.booking} /> : <OrderBody order={source.order} />}
      </div>
    </Sheet>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="grow label">{label}</span>
      <span className="fine">{value}</span>
    </div>
  );
}

function BookingBody({ booking }: { booking: Booking }) {
  const { c, fill } = useCopy();
  const items = parseLines(booking.items_json ?? null);

  return (
    <>
      {booking.ccm_code ? (
        <div className="receipt__code">
          <Code value={booking.ccm_code} size="md" />
        </div>
      ) : null}

      <div className="rows rows--inset">
        <Line label={c.book.stepWhen} value={`${dayLabel(booking.date)}, ${timeLabel(booking.time)}`} />
        <Line
          label={c.book.stepWho}
          value={booking.party_size === 1 ? c.book.partyOne : fill(c.book.partyMany, { n: booking.party_size })}
        />
        {/* Every table the booking holds, not just the lead one. A party across
            three tables that saw one on its receipt would rightly wonder what
            it had paid for. */}
        {booking.table_labels || booking.table_label ? (
          <Line label={c.book.stepWhere} value={booking.table_labels || booking.table_label || ""} />
        ) : null}
        <Line label={c.mine.status} value={c.mine.bookingStatus[booking.status]} />
      </div>

      {items.length > 0 ? (
        <div className="rows rows--inset">
          {items.map((line, index) => (
            <div key={`${line.name}-${index}`} className="row">
              <span className="grow fine">
                {line.qty} {line.name}
              </span>
              <Money value={line.price * line.qty} size="fine" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="rows rows--inset">
        {booking.deposit_fcfa != null ? <Line label={c.mine.deposit} value={money(booking.deposit_fcfa)} /> : null}
        {booking.amount_fcfa != null ? <Line label={c.mine.paid} value={money(booking.amount_fcfa)} /> : null}
        {booking.cancellation_fee_fcfa > 0 ? (
          <Line label={c.mine.fee} value={money(booking.cancellation_fee_fcfa)} />
        ) : null}
      </div>
    </>
  );
}

function OrderBody({ order }: { order: TakeawayOrder }) {
  const { c } = useCopy();
  const items = parseLines(order.items_json);

  return (
    <>
      <div className="receipt__code">
        <Code value={order.order_no} size="md" />
      </div>

      <div className="rows rows--inset">
        {items.map((line, index) => (
          <div key={`${line.name}-${index}`} className="row">
            <span className="grow fine">
              {line.qty} {line.name}
            </span>
            <Money value={line.price * line.qty} size="fine" />
          </div>
        ))}
      </div>

      <div className="rows rows--inset">
        {order.discount_fcfa > 0 ? <Line label={c.order.discount} value={`-${money(order.discount_fcfa)}`} /> : null}
        <Line label={c.common.total} value={money(order.total_fcfa)} />
        <Line label={c.mine.status} value={c.mine.orderStatus[order.status]} />
        <Line label={c.order.pickupTime} value={order.pickup_time} />
      </div>
    </>
  );
}
