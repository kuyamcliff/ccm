import { useState } from "react";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { dayLabel, parseLines, stampLabel, timeLabel } from "~/lib/format";
import { type Resource, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Badge, Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, SkeletonCards } from "~/ui/Feedback";
import { Icon } from "~/ui/Icon";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { BookingPass } from "./BookingPass";
import { MomoDialog } from "~/features/pay/MomoDialog";

/**
 * Everything the signed-in guest has going on: tables they hold, and orders
 * waiting at the counter. Deliberately one page — from a guest's side these
 * are the same question, "what have I got with you people".
 */

const ORDER_STATUS: Record<TakeawayOrder["status"], { label: string; tone: "neutral" | "good" | "warn" | "bad" | "hot" }> = {
  pending: { label: "Sent", tone: "warn" },
  confirmed: { label: "Accepted", tone: "hot" },
  ready: { label: "Ready to collect", tone: "good" },
  picked_up: { label: "Collected", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Bookings({ bookings }: { bookings: Resource<Booking[]> }) {
  const { depositFcfa } = useVenue();
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [payFor, setPayFor] = useState<Booking | null>(null);

  async function cancel(booking: Booking) {
    const ok = await confirm({
      title: "Cancel this table?",
      body: `${dayLabel(booking.date)} at ${timeLabel(booking.time)}. If you have paid a deposit more than an hour ahead, it comes back to you.`,
      confirmLabel: "Cancel it",
    });
    if (!ok) return;

    try {
      const result = await api.booking.cancel(booking.id);
      if ("requires_fee" in result) {
        toast.failed(new Error(`Cancelling this late keeps a ${result.fee_fcfa.toLocaleString("en-US")} FCFA fee. Call us instead.`));
        return;
      }
      toast.done("Table released.");
      bookings.reload();
    } catch (err) {
      toast.failed(err);
    }
  }

  async function hide(booking: Booking) {
    try {
      await api.booking.hide(booking.id);
      bookings.set((current) => (current ?? []).filter((row) => row.id !== booking.id));
    } catch (err) {
      toast.failed(err);
    }
  }

  async function receipt(booking: Booking) {
    try {
      downloadBlob(await api.me.bookingReceiptFile(booking.id), `${booking.ccm_code ?? booking.id}.pdf`);
    } catch (err) {
      toast.failed(err, "That receipt is not ready yet.");
    }
  }

  if (bookings.loading) return <SkeletonCards count={2} height="14rem" />;
  if (bookings.error) return <ErrorState error={bookings.error} onRetry={bookings.reload} />;

  const rows = bookings.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="No tables booked"
        action={
          <LinkButton to="/book" tone="primary">
            Book one
          </LinkButton>
        }
      >
        When you book, it shows up here with the code for the door.
      </EmptyState>
    );
  }

  return (
    <div className="stack stack--loose">
      {confirmElement}
      {rows.map((booking) => (
        <BookingPass
          key={booking.id}
          booking={booking}
          actions={
            <>
              {booking.status === "pending_payment" ? (
                <Button tone="primary" size="sm" icon="wallet" onClick={() => setPayFor(booking)}>
                  Pay the deposit
                </Button>
              ) : null}
              {booking.payment_status === "paid" ? (
                <Button size="sm" tone="ghost" icon="download" onClick={() => receipt(booking)}>
                  Receipt
                </Button>
              ) : null}
              {booking.status === "confirmed" || booking.status === "pending_payment" ? (
                <Button size="sm" tone="danger" onClick={() => cancel(booking)}>
                  Cancel
                </Button>
              ) : (
                <Button size="sm" tone="quiet" onClick={() => hide(booking)}>
                  Remove from list
                </Button>
              )}
            </>
          }
        />
      ))}

      {payFor ? (
        <MomoDialog
          open
          amountFcfa={depositFcfa}
          title="Pay the deposit"
          what={`${dayLabel(payFor.date)} at ${timeLabel(payFor.time)}`}
          driver={{
            allowDiscounts: true,
            start: (input) =>
              api.booking
                .payDeposit({
                  reservationId: payFor.id,
                  momoPhone: input.momoPhone,
                  promoCode: input.promoCode,
                  giftCardCode: input.giftCardCode,
                })
                .then((prompt) => ({
                  reference: prompt.reference,
                  amount_fcfa: prompt.amount_fcfa,
                  zero_cost: prompt.zero_cost,
                  expires_in_seconds: prompt.expires_in_seconds,
                })),
            poll: api.booking.paymentStatus,
            abandon: api.booking.abandonPayment,
          }}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null);
            toast.done("Deposit received. Your table is confirmed.");
            bookings.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function Orders({ orders }: { orders: Resource<TakeawayOrder[]> }) {
  const toast = useToast();
  const [payFor, setPayFor] = useState<TakeawayOrder | null>(null);

  if (orders.loading) return <SkeletonCards count={2} height="10rem" />;
  if (orders.error) return <ErrorState error={orders.error} onRetry={orders.reload} />;

  const rows = orders.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="bag"
        title="No orders yet"
        action={
          <LinkButton to="/order" tone="primary">
            Order something
          </LinkButton>
        }
      >
        Order ahead and collect it without queueing.
      </EmptyState>
    );
  }

  return (
    <div className="stack">
      {rows.map((order) => {
        const status = ORDER_STATUS[order.status];
        const lines = parseLines(order.items_json);
        const unpaid = order.payment_status !== "paid" && order.status !== "cancelled";

        return (
          <article key={order.id} className="card stack">
            <div className="row row--between row--wrap">
              <div>
                <p className="label">Order</p>
                <p className="mono pass__code">{order.order_no}</p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>

            <ul className="lines">
              {lines.map((line, index) => (
                <li key={`${line.name}-${index}`}>
                  <span className="mono lines__qty">{line.qty}</span>
                  <span>{line.name}</span>
                  <Money value={line.price * line.qty} className="push" />
                </li>
              ))}
            </ul>

            <div className="row row--between">
              <span className="muted">Collect at {timeLabel(order.pickup_time)}</span>
              <strong>
                <Money value={order.total_fcfa} />
              </strong>
            </div>

            {unpaid ? (
              <Notice tone="warn">
                This order is not paid yet, so the kitchen has not started on it.
              </Notice>
            ) : null}

            <div className="row row--wrap">
              {unpaid ? (
                <Button tone="primary" size="sm" icon="wallet" onClick={() => setPayFor(order)}>
                  Pay now
                </Button>
              ) : (
                <Button
                  size="sm"
                  tone="ghost"
                  icon="download"
                  onClick={async () => {
                    try {
                      downloadBlob(await api.me.orderReceiptFile(order.order_no), `${order.order_no}.pdf`);
                    } catch (err) {
                      toast.failed(err);
                    }
                  }}
                >
                  Receipt
                </Button>
              )}
              <span className="fine faint push">Ordered {stampLabel(order.created_at)}</span>
            </div>
          </article>
        );
      })}

      {payFor ? (
        <MomoDialog
          open
          amountFcfa={payFor.total_fcfa}
          title="Pay for your order"
          what={`Order ${payFor.order_no}, collect at ${timeLabel(payFor.pickup_time)}`}
          driver={{
            start: (input) =>
              api.orders.pay(payFor.order_no, input.momoPhone).then((prompt) => ({
                reference: prompt.reference,
                amount_fcfa: prompt.amount_fcfa,
                expires_in_seconds: prompt.expires_in_seconds,
              })),
            poll: api.orders.paymentStatus,
            abandon: api.orders.abandonPayment,
          }}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null);
            toast.done("Paid. We will start on it.");
            orders.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** Held tables and orders still worth the guest's attention — what a tab
    count should draw the eye to, not everything that has ever happened. */
function activeBookingCount(rows: Booking[] | null): number {
  return (rows ?? []).filter((b) => b.status === "confirmed" || b.status === "pending_payment").length;
}
function activeOrderCount(rows: TakeawayOrder[] | null): number {
  return (rows ?? []).filter((o) => o.status !== "cancelled" && o.status !== "picked_up").length;
}

export function MinePage() {
  const [tab, setTab] = useState<"tables" | "orders">("tables");
  const bookings = useResource(() => api.booking.mine(), []);
  const orders = useResource(() => api.orders.mine(), []);

  const tableCount = activeBookingCount(bookings.data);
  const orderCount = activeOrderCount(orders.data);

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Mine</h1>
      </div>

      <div className="tabs" role="tablist" aria-label="What you have with us">
        <button type="button" role="tab" className="tab" aria-selected={tab === "tables"} onClick={() => setTab("tables")}>
          <Icon name="calendar" size={16} />
          Tables
          {tableCount > 0 ? <span className="tab__count">{tableCount}</span> : null}
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>
          <Icon name="bag" size={16} />
          Takeaway orders
          {orderCount > 0 ? <span className="tab__count">{orderCount}</span> : null}
        </button>
      </div>

      <div style={{ marginTop: "var(--s-5)" }}>
        {tab === "tables" ? <Bookings bookings={bookings} /> : <Orders orders={orders} />}
      </div>
    </div>
  );
}

/** Re-exported so the booking flow can show the same error wording. */
export function bookingError(err: unknown): string {
  return err instanceof ApiError ? err.message : "That did not work.";
}
