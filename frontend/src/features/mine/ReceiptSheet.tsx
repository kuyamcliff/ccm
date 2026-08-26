import { useState } from "react";
import type { ReactNode } from "react";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { dayLabel, parseLines, phoneLabel, stampLabel, timeLabel } from "~/lib/format";
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

/**
 * A figure on the receipt, in the same hand as the item lines above it.
 *
 * The money rows used to be plain text through `money()`, so a receipt read
 * "2,000" for the deposit and "7,000 FCFA" for the chicken two rows higher.
 * One of them was a currency and the other was a number, on the same sheet.
 */
function MoneyLine({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="row">
      <span className="grow label">{label}</span>
      <span className="fine">
        {negative ? "-" : null}
        <Money value={value} size="fine" />
      </span>
    </div>
  );
}

/** A section of the receipt, under its own quiet heading. */
function Part({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="stack stack--tight">
      {title ? <span className="label faint">{title}</span> : null}
      <div className="rows rows--inset">{children}</div>
    </div>
  );
}

/**
 * How the money arrived, in the wallet's own name.
 *
 * Taken from the same strings the checkout offers, so a guest reads back
 * exactly what they tapped rather than the column value the database stores.
 */
function methodLabel(method: string | null | undefined, c: ReturnType<typeof useCopy>["c"]): string {
  if (method === "mtn_momo") return c.order.payMtn;
  if (method === "orange_money") return c.order.payOrange;
  if (method === "cash") return c.order.payCash;
  if (method === "free") return c.pay.nothingToPay;
  return c.mine.methodUnknown;
}

/**
 * How the tables read on a receipt.
 *
 * `table_labels` is every table the booking holds and `table_label` is the lead
 * one, which is what older bookings have and nothing else. The zone is only
 * worth its width when there is one table to place: across three of them it is
 * repeated noise.
 */
function tablesOn(booking: Booking): { many: boolean; value: string } | null {
  const all = (booking.table_labels ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (all.length > 1) return { many: true, value: all.map((entry) => `Table ${entry}`).join(" + ") };
  const one = all[0] ?? booking.table_label;
  if (!one) return null;
  return { many: false, value: `Table ${one}${booking.table_zone ? `, ${booking.table_zone}` : ""}` };
}

function BookingBody({ booking }: { booking: Booking }) {
  const { c, fill } = useCopy();
  const items = parseLines(booking.items_json ?? null);
  const tables = tablesOn(booking);

  /* What the food came to. The booking carries the server's own figure; adding
     the lines up is the fallback for a row written before that column was. */
  const foodTotal =
    booking.items_total_fcfa ?? items.reduce((sum, line) => sum + line.price * line.qty, 0);

  return (
    <>
      {booking.ccm_code ? (
        <div className="receipt__code">
          <Code value={booking.ccm_code} size="md" />
        </div>
      ) : null}

      <Part>
        <Line label={c.book.stepWhen} value={`${dayLabel(booking.date)}, ${timeLabel(booking.time)}`} />
        <Line
          label={c.book.stepWho}
          value={booking.party_size === 1 ? c.book.partyOne : fill(c.book.partyMany, { n: booking.party_size })}
        />
        {/* Every table the booking holds, not just the lead one. A party across
            three tables that saw one on its receipt would rightly wonder what
            it had paid for. */}
        {tables ? (
          <Line label={tables.many ? c.mine.tablesHeld : c.mine.table} value={tables.value} />
        ) : null}
        <Line label={c.mine.status} value={c.mine.bookingStatus[booking.status]} />
        {booking.checked_in_at ? <Line label={c.mine.checkedIn} value={stampLabel(booking.checked_in_at)} /> : null}
        {booking.phone ? <Line label={c.mine.contact} value={phoneLabel(booking.phone)} /> : null}
        <Line label={c.mine.booked} value={stampLabel(booking.created_at)} />
      </Part>

      {/* Food ordered with the table, itemised and totalled. It used to be a
          bare list of lines with no heading and no sum, which on a receipt is
          the one thing a list of prices has to have. */}
      {items.length > 0 ? (
        <Part title={c.mine.orderedAhead}>
          {items.map((line, index) => (
            <div key={`${line.name}-${index}`} className="row">
              <span className="grow fine">
                {line.qty} {line.name}
              </span>
              <Money value={line.price * line.qty} size="fine" />
            </div>
          ))}
          <MoneyLine label={c.mine.food} value={foodTotal} />
        </Part>
      ) : null}

      <Part>
        {booking.deposit_fcfa != null ? <MoneyLine label={c.mine.deposit} value={booking.deposit_fcfa} /> : null}
        {items.length > 0 ? <MoneyLine label={c.mine.food} value={foodTotal} /> : null}
        {booking.discount_fcfa ? <MoneyLine label={c.order.discount} value={booking.discount_fcfa} negative /> : null}
        {booking.amount_fcfa != null ? <MoneyLine label={c.mine.paid} value={booking.amount_fcfa} /> : null}
        {booking.amount_fcfa != null ? <Line label={c.mine.method} value={methodLabel(booking.pay_method, c)} /> : null}
        {booking.cancellation_fee_fcfa > 0 ? (
          <MoneyLine label={c.mine.fee} value={booking.cancellation_fee_fcfa} />
        ) : null}
      </Part>

      {booking.note ? <p className="fine muted">{`${c.mine.yourNote}: ${booking.note}`}</p> : null}
    </>
  );
}

function OrderBody({ order }: { order: TakeawayOrder }) {
  const { c } = useCopy();
  const items = parseLines(order.items_json);
  const subtotal = items.reduce((sum, line) => sum + line.price * line.qty, 0);

  return (
    <>
      <div className="receipt__code">
        <Code value={order.order_no} size="md" />
      </div>

      <Part title={c.mine.orderedAhead}>
        {items.map((line, index) => (
          <div key={`${line.name}-${index}`} className="row">
            <span className="grow fine">
              {line.qty} {line.name}
            </span>
            <Money value={line.price * line.qty} size="fine" />
          </div>
        ))}
        {order.discount_fcfa > 0 ? <MoneyLine label={c.order.subtotal} value={subtotal} /> : null}
      </Part>

      <Part>
        {order.discount_fcfa > 0 ? <MoneyLine label={c.order.discount} value={order.discount_fcfa} negative /> : null}
        <MoneyLine label={c.common.total} value={order.total_fcfa} />
        <Line label={c.mine.status} value={c.mine.orderStatus[order.status]} />
        <Line label={c.order.pickupTime} value={order.pickup_time} />
        {order.phone ? <Line label={c.mine.contact} value={phoneLabel(order.phone)} /> : null}
        {order.collected_at ? <Line label={c.mine.collectedAt} value={stampLabel(order.collected_at)} /> : null}
        <Line label={c.mine.placed} value={stampLabel(order.created_at)} />
      </Part>

      {order.note ? <p className="fine muted">{`${c.mine.yourNote}: ${order.note}`}</p> : null}
    </>
  );
}
