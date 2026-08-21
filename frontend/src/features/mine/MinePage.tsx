import { useState } from "react";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { useMutation, useQuery, usePoll, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { dayLabel, money, parseLines, timeLabel } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { Action, LinkButton } from "~/ui/Button";
import { Segmented } from "~/ui/Field";
import { Badge, Code, Money } from "~/ui/Bits";
import { EmptyState, ErrorState, SkeletonRows } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { BookingPass } from "./BookingPass";
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
              {booking.status !== "cancelled" ? (
                <Action
                  tone="quiet"
                  size="sm"
                  block
                  pending={cancel.pending}
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
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {element}
    </div>
  );
}

/* ── Orders ─────────────────────────────────────────────────────────────────*/

function Orders() {
  const { c } = useCopy();
  const { data, loading, error, reload } = useQuery(K.myOrders, () => api.orders.mine(), { staleMs: 20_000 });

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
            <LiveOrder key={order.id} order={order} />
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
              </div>
            ))}
          </div>
        </section>
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
function LiveOrder({ order }: { order: TakeawayOrder }) {
  const { c } = useCopy();
  const stages: TakeawayOrder["status"][] = ["pending", "confirmed", "ready", "picked_up"];
  const reached = Math.max(0, stages.indexOf(order.status));
  const unpaid = order.payment_status !== "paid" && order.status !== "awaiting_payment";

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

      {unpaid ? <Badge tone="warn">{c.order.payCash}</Badge> : null}
    </div>
  );
}
