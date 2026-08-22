import { useState } from "react";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { useMutation, useQuery, usePoll, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { dayLabel, money, parseLines, timeLabel, todayISO } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Action, Button, IconButton, LinkButton } from "~/ui/Button";
import { Segmented } from "~/ui/Field";
import { Badge, Code, Money } from "~/ui/Bits";
import { EmptyState, ErrorState, SkeletonRows } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { PaySheet, type PaymentDriver } from "~/features/pay/PaySheet";
import { BookingPass } from "./BookingPass";
import { ReceiptSheet } from "./ReceiptSheet";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

/**
 * Everything this person has going on with the restaurant.
 *
 * Two tabs, because tables and orders are different objects with different
 * lifecycles and merging them into one feed makes both harder to scan.
 *
 * The orders tab polls while an order is live, because "is it ready yet" is the
 * one question this screen exists to answer and the answer changes without the
 * person doing anything.
 */

type Tab = "tables" | "orders";

/** Whether a booking is for today, which is the only day "I am here" makes
    sense on. */
function isToday(date: string): boolean {
  return date === todayISO();
}

/** Statuses where the kitchen is still going to do something. */
const LIVE = new Set(["awaiting_payment", "pending", "confirmed", "ready"]);

/**
 * The late cancellation fee, if this failure is one.
 *
 * Returns null for anything else, so an ordinary failure falls through to the
 * usual handling rather than being mistaken for a quote.
 */
function feeFromError(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const body = error.body as { requires_fee?: boolean; fee_fcfa?: number } | undefined;
  if (!body?.requires_fee || typeof body.fee_fcfa !== "number") return null;
  return body.fee_fcfa;
}

export function MinePage() {
  const { c } = useCopy();
  const [tab, setTab] = useState<Tab>("tables");

  return (
    <div className="page section stack">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.mine.title}</h1>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        label={c.mine.title}
        options={[
          { value: "tables", label: c.mine.tables, icon: "calendar" },
          { value: "orders", label: c.mine.orders, icon: "bag" },
        ]}
      />

      {/*
        * The way on from here, on both tabs.
        *
        * It used to appear only when the list was empty, which is exactly
        * backwards: somebody with no bookings is not the person most likely to
        * make one. The person looking at last week's table is. Quiet rather
        * than red, because the list below is what this screen is for.
        */}
      {tab === "tables" ? (
        <LinkButton to="/book" tone="quiet" size="sm" block icon="calendar">
          {c.mine.bookAnother}
        </LinkButton>
      ) : (
        <LinkButton to="/menu" tone="quiet" size="sm" block icon="list">
          {c.mine.orderAgain}
        </LinkButton>
      )}

      {tab === "tables" ? <Tables /> : <Orders />}
    </div>
  );
}

/* ── Tables ─────────────────────────────────────────────────────────────────*/

function Tables() {
  const { c, fill } = useCopy();

  const toast = useToast();
  const { confirm, element } = useConfirm();

  const { data, loading, error, reload } = useQuery(K.myBookings, () => api.booking.mine(), { staleMs: 30_000 });

  const [receipt, setReceipt] = useState<Booking | null>(null);

  /*
   * Telling the restaurant you have arrived.
   *
   * Until now the only way a table became "arrived" was somebody on the door
   * scanning the code, which misses every party that walks past a busy doorway
   * and sits down. The console polls, so this puts the table in front of staff
   * within the minute.
   */
  const arrive = useMutation(async (booking: Booking) => {
    const result = await api.booking.arrived(booking.id);
    invalidate(K.myBookings);
    reload();
    toast.done(result.already ? c.mine.arrivedAlready : c.mine.arrivedDone);
  });

  const cancel = useMutation(async (booking: Booking) => {
    try {
      await api.booking.cancel(booking.id);
    } catch (error) {
      /*
       * A 402 here is a quote, not a refusal.
       *
       * Inside the last hour of a paid booking the server answers with the fee
       * instead of cancelling, so the guest decides with the number in front of
       * them rather than finding out afterwards. This is one of only two places
       * in the product where the server's body carries a fact the browser cannot
       * work out for itself, so it is read rather than translated by `lib/say`.
       */
      const fee = feeFromError(error);
      if (fee === null) throw error;

      const sure = await confirm({
        title: c.mine.feeTitle,
        body: fill(c.mine.feeBody, { amount: money(fee) }),
        confirmLabel: c.mine.cancelBooking,
        cancelLabel: "Keep it",
      });
      if (!sure) return;

      /* Saying yes to the number they were just shown. */
      await api.booking.cancel(booking.id, true);
    }

    invalidate(K.myBookings);
    reload();
    toast.done(c.mine.cancelled);
  });

  if (error) return <ErrorState error={error} intent="load" onRetry={reload} />;
  if (loading) return <SkeletonRows count={3} />;

  const bookings = data ?? [];
  const now = new Date();
  const upcoming = bookings.filter(
    (booking) => booking.status !== "cancelled" && new Date(`${booking.date}T${booking.time}`) >= now
  );
  const past = bookings.filter(
    (booking) => booking.status === "cancelled" || new Date(`${booking.date}T${booking.time}`) < now
  );

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title={c.mine.noTables}
        body={c.mine.noTablesBody}
        action={
          <LinkButton to="/book" tone="primary" size="sm" icon="calendar">
            {c.home.holdTable}
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="stack stack--loose">
      {upcoming.length > 0 ? (
        <section className="stack">
          <h2 className="label">{c.mine.upcoming}</h2>
          {upcoming.map((booking) => (
            <div key={booking.id} className="stack stack--snug">
              <BookingPass booking={booking} />
              <div className="bar bar--tight">
                {/* Only once the table is actually held, and only on the day.
                    An "I am here" button on a table booked for next Friday is
                    a button that can only be pressed by mistake. */}
                {booking.status === "confirmed" && !booking.checked_in_at && isToday(booking.date) ? (
                  <Action
                    tone="primary"
                    size="sm"
                    block
                    icon="check"
                    pending={arrive.pendingFor(booking.id)}
                    pendingLabel={c.pending.saving}
                    onClick={async () => {
                      await arrive.run(booking);
                      const failure = arrive.readError();
                      if (failure) toast.failed(failure, "load");
                    }}
                  >
                    {c.mine.arrived}
                  </Action>
                ) : null}
                <Button tone="quiet" size="sm" block icon="receipt" onClick={() => setReceipt(booking)}>
                  {c.mine.viewReceipt}
                </Button>
              </div>

              {booking.status !== "cancelled" ? (
                <Action
                  tone="quiet"
                  size="sm"
                  block
                  pending={cancel.pendingFor(booking.id)}
                  pendingLabel={c.pending.cancelling}
                  onClick={async () => {
                    const sure = await confirm({
                      title: c.mine.cancelConfirm,
                      body: c.mine.cancelBody,
                      confirmLabel: c.mine.cancelBooking,
                      cancelLabel: "Keep it",
                    });
                    if (!sure) return;
                    await cancel.run(booking);
                    const failure = cancel.readError();
                    if (failure) toast.failed(failure, "cancelBooking");
                  }}
                >
                  {c.mine.cancelBooking}
                </Action>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="stack stack--snug">
          <h2 className="label">{c.mine.past}</h2>
          <div className="rows">
            {past.map((booking) => (
              <div key={booking.id} className="row">
                <Icon name="calendar" size={17} className="row__lead" />
                <span className="grow stack stack--tight">
                  <span className="small">
                    {dayLabel(booking.date)}, {timeLabel(booking.time)}
                  </span>
                  {booking.table_label ? <span className="fine faint">Table {booking.table_label}</span> : null}
                </span>
                <Badge tone={booking.status === "cancelled" ? "bad" : "neutral"}>
                  {c.mine.bookingStatus[booking.status]}
                </Badge>
                {/* Any booking, however old. There is no window on this: the
                    receipt for a table somebody sat at in March is still their
                    receipt. */}
                <IconButton
                  name="receipt"
                  tone="ghost"
                  size="sm"
                  label={`${c.mine.viewReceipt}, ${dayLabel(booking.date)}`}
                  onClick={() => setReceipt(booking)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ReceiptSheet source={receipt ? { kind: "booking", booking: receipt } : null} onClose={() => setReceipt(null)} />

      {element}
    </div>
  );
}

/* ── Orders ─────────────────────────────────────────────────────────────────*/

function Orders() {
  const { c } = useCopy();
  const toast = useToast();
  const { data, loading, error, reload } = useQuery(K.myOrders, () => api.orders.mine(), { staleMs: 20_000 });

  const [receipt, setReceipt] = useState<TakeawayOrder | null>(null);

  /*
   * The order being paid for, if any.
   *
   * One sheet for the whole list rather than one per row: only one order can be
   * being paid for at a time, and mounting a payment sheet per row would mean
   * several idempotency keys alive at once.
   */
  const [paying, setPaying] = useState<TakeawayOrder | null>(null);

  /* The same driver the checkout uses, pointed at whichever order is open. */
  const driver: PaymentDriver = {
    allowDiscounts: false,
    start: ({ momoPhone, wallet, idempotencyKey }) =>
      api.orders.pay(paying!.order_no, momoPhone, wallet, idempotencyKey).then((result) => ({
        reference: result.reference,
        amount_fcfa: result.amount_fcfa,
        expires_in_seconds: result.expires_in_seconds,
        payment_url: result.payment_url,
      })),
    poll: (reference) => api.orders.paymentStatus(reference),
    abandon: (reference) => api.orders.abandonPayment(reference),
  };

  /*
   * The guest closes their own order.
   *
   * The last column of the kitchen board used to be somebody's job, and on a
   * busy night it is the tap that does not happen: orders pile up on "ready"
   * long after they have been handed over. The person who knows is the person
   * holding the food.
   */
  const collect = useMutation(async (order: TakeawayOrder) => {
    const result = await api.orders.collected(order.id);
    invalidate(K.myOrders);
    reload();
    if (!result.already) toast.done(c.mine.collectedDone);
  });

  const orders = data ?? [];
  const live = orders.filter((order) => LIVE.has(order.status));

  /* Only while something is actually cooking. A finished list does not need
     refreshing every twenty seconds, and a phone in a pocket does not need to be
     asking. */
  usePoll(() => reload(), live.length > 0 ? 20_000 : null);

  if (error) return <ErrorState error={error} intent="load" onRetry={reload} />;
  if (loading) return <SkeletonRows count={3} />;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon="bag"
        title={c.mine.noOrders}
        body={c.mine.noOrdersBody}
        action={
          <LinkButton to="/menu" tone="primary" size="sm" icon="list">
            {c.order.goToMenu}
          </LinkButton>
        }
      />
    );
  }

  const done = orders.filter((order) => !LIVE.has(order.status));

  return (
    <div className="stack stack--loose">
      {live.length > 0 ? (
        <section className="stack">
          <h2 className="label">{c.mine.upcoming}</h2>
          {live.map((order) => (
            <LiveOrder
              key={order.id}
              order={order}
              collecting={collect.pending}
              onCollect={async () => {
                await collect.run(order);
                const failure = collect.readError();
                if (failure) toast.failed(failure, "load");
              }}
              onReceipt={() => setReceipt(order)}
              onPay={() => setPaying(order)}
            />
          ))}
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="stack stack--snug">
          <h2 className="label">{c.mine.past}</h2>
          <div className="rows">
            {done.map((order) => (
              <div key={order.id} className="row">
                <Icon name="bag" size={17} className="row__lead" />
                <span className="grow stack stack--tight">
                  <span className="small clip">
                    {parseLines(order.items_json)
                      .map((line) => `${line.qty} ${line.name}`)
                      .join(", ")}
                  </span>
                  <span className="fine faint">{order.order_no}</span>
                </span>
                <Money value={order.total_fcfa} size="fine" />
                <IconButton
                  name="receipt"
                  tone="ghost"
                  size="sm"
                  label={`${c.mine.viewReceipt}, ${order.order_no}`}
                  onClick={() => setReceipt(order)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ReceiptSheet source={receipt ? { kind: "order", order: receipt } : null} onClose={() => setReceipt(null)} />

      {paying ? (
        <PaySheet
          open
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            invalidate(K.myOrders);
            reload();
          }}
          amountFcfa={paying.total_fcfa}
          title={c.pay.title}
          what={paying.order_no}
          driver={driver}
        />
      ) : null}
    </div>
  );
}

/**
 * One order that has not been collected yet.
 *
 * The status is a stepped track rather than a word, because "with the kitchen"
 * and "on the fire" mean nothing on their own: what somebody wants to know is
 * how many steps are left before they can walk over.
 */
function LiveOrder({
  order,
  collecting,
  onCollect,
  onReceipt,
  onPay,
}: {
  order: TakeawayOrder;
  collecting: boolean;
  onCollect: () => void;
  onReceipt: () => void;
  onPay: () => void;
}) {
  const { c } = useCopy();
  const stages: TakeawayOrder["status"][] = ["pending", "confirmed", "ready", "picked_up"];
  /* -1, not 0, for a status that is not on the track at all. `awaiting_payment`
     comes before the first step, and clamping it to zero lit "with the kitchen"
     on an order nobody has been paid for and nobody has started cooking. */
  const reached = stages.indexOf(order.status);

  /*
   * Money still owed on this order, whichever way it got here.
   *
   * Two ways an order arrives unpaid, and the screen used to handle neither.
   *
   * `awaiting_payment` is somebody who closed the wallet sheet halfway. The
   * checkout's own parting message tells them to come here and settle it, and
   * this was the row it meant, but the old `unpaid` deliberately excluded that
   * status, so the one order that most needed a Pay button was the one that
   * could never show one.
   *
   * A `cash` order is the other: chosen to pay at the counter, and perfectly
   * entitled to change its mind and pay from the phone before collecting.
   *
   * Either way what matters is the same thing, so it is one question now: is
   * there money on this order that has not been taken?
   */
  const owes = order.payment_status !== "paid" && order.total_fcfa > 0 && order.status !== "cancelled";
  const cashAtCounter = owes && order.status !== "awaiting_payment";

  return (
    <div className="carry order-live">
      <div className="bar bar--between">
        <span className="label">{c.yours.liveOrder}</span>
        <Badge tone={order.status === "ready" ? "good" : "neutral"}>{c.mine.orderStatus[order.status]}</Badge>
      </div>

      <Code value={order.order_no} size="md" />

      <ol className="track" aria-label={c.mine.orderStatus[order.status]}>
        {stages.map((stage, index) => (
          <li key={stage} className="track__step" data-state={index <= reached ? "done" : undefined}>
            <span className="track__dot" aria-hidden="true" />
            <span className="micro">{c.mine.orderStatus[stage]}</span>
          </li>
        ))}
      </ol>

      <p className="fine muted clip-2">
        {parseLines(order.items_json)
          .map((line) => `${line.qty} ${line.name}`)
          .join(", ")}
      </p>

      <div className="bar bar--between">
        <span className="fine faint">
          {c.order.pickupTime}: {order.pickup_time}
        </span>
        <Money value={order.total_fcfa} size="fine" />
      </div>

      {cashAtCounter ? <Badge tone="warn">{c.order.payCash}</Badge> : null}

      {/* Red, because it is the thing to press: this order is not paid for and
          nothing else on the row moves until it is. */}
      {owes ? (
        <Button tone="primary" size="sm" block icon="wallet" onClick={onPay}>
          {c.pay.send}
        </Button>
      ) : null}

      <div className="bar bar--tight">
        {/* Only from "ready". An order cannot be collected before it has been
            made, and skipping the board to the end would take a live order off
            the kitchen's screen while it was still on the fire. */}
        {order.status === "ready" ? (
          <Action
            tone="primary"
            size="sm"
            block
            icon="check"
            pending={collecting}
            pendingLabel={c.pending.saving}
            onClick={onCollect}
          >
            {c.mine.collected}
          </Action>
        ) : null}
        <Button tone="quiet" size="sm" block icon="receipt" onClick={onReceipt}>
          {c.mine.viewReceipt}
        </Button>
      </div>
    </div>
  );
}
