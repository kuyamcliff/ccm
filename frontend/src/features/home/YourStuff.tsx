import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { dayLabel, parseLines, timeLabel, todayISO } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Badge, Money } from "~/ui/Bits";
import { LinkButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { Skeleton } from "~/ui/Feedback";

/**
 * What a signed-in customer has on right now, at the top of the home page.
 *
 * A visitor who is already a customer does not need the sales pitch again;
 * they need the one thing they came back to check. So this answers "when am I
 * coming in" and "is my food ready" before anything else on the page, and says
 * nothing at all when there is nothing to say.
 *
 * Only mounted for a signed-in visitor, so a stranger never pays for these
 * two requests.
 */

/** Live means: still going to happen, or still being cooked. */
function nextBooking(bookings: Booking[]): Booking | null {
  const today = todayISO();
  return (
    [...bookings]
      .filter((b) => (b.status === "confirmed" || b.status === "pending_payment") && b.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0] ?? null
  );
}

function liveOrder(orders: TakeawayOrder[]): TakeawayOrder | null {
  return orders.find((o) => o.status === "pending" || o.status === "confirmed" || o.status === "ready") ?? null;
}

const ORDER_SAYS: Record<string, { label: string; tone: "warn" | "hot" | "good" }> = {
  pending: { label: "Sent to the kitchen", tone: "warn" },
  confirmed: { label: "Being cooked", tone: "hot" },
  ready: { label: "Ready to collect", tone: "good" },
};

export function YourStuff({ name }: { name: string }) {
  const bookings = useResource(() => api.booking.mine(), []);
  const orders = useResource(() => api.orders.mine(), []);

  const loading = bookings.loading || orders.loading;
  const booking = nextBooking(bookings.data ?? []);
  const order = liveOrder(orders.data ?? []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = name.split(/\s+/)[0] ?? name;

  return (
    <section className="mine-strip">
      <div className="page">
        <div className="row row--between row--wrap" style={{ marginBottom: "var(--s-4)" }}>
          <h1 className="display display--lg">
            {greeting}, {firstName}
          </h1>
          <LinkButton to="/mine" tone="quiet" iconEnd="arrow-right">
            Everything of mine
          </LinkButton>
        </div>

        {loading ? (
          <div className="mine-strip__grid">
            <Skeleton height="7rem" radius="var(--r-lg)" />
            <Skeleton height="7rem" radius="var(--r-lg)" />
          </div>
        ) : !booking && !order ? (
          /* Nothing on. Say so plainly and offer the two things they can do. */
          <div className="card stack">
            <p className="muted">You have no table booked and nothing waiting at the counter.</p>
            <div className="row row--wrap">
              <LinkButton to="/book" tone="primary" icon="calendar">
                Book a table
              </LinkButton>
              <LinkButton to="/order" tone="ghost" icon="bag">
                Order takeaway
              </LinkButton>
            </div>
          </div>
        ) : (
          <div className="mine-strip__grid">
            {booking ? (
              <Link to="/mine" className="card card--action stack stack--tight">
                <div className="row row--between">
                  <span className="label">Your next table</span>
                  {booking.status === "pending_payment" ? (
                    <Badge tone="warn">Deposit due</Badge>
                  ) : (
                    <Badge tone="good">Confirmed</Badge>
                  )}
                </div>
                <p className="mine-strip__headline">
                  {dayLabel(booking.date)} at {timeLabel(booking.time)}
                </p>
                <p className="fine muted">
                  {booking.party_size} {booking.party_size === 1 ? "person" : "people"}
                  {booking.table_label ? `, table ${booking.table_label}` : ""}
                </p>
                {booking.ccm_code && booking.status === "confirmed" ? (
                  <p className="mono mine-strip__code">{booking.ccm_code}</p>
                ) : (
                  <p className="fine hot">
                    <Icon name="alert" size={14} /> Pay the deposit to hold it
                  </p>
                )}
              </Link>
            ) : null}

            {order ? (
              <Link to="/mine" className="card card--action stack stack--tight">
                <div className="row row--between">
                  <span className="label">Your order</span>
                  <Badge tone={ORDER_SAYS[order.status]?.tone ?? "neutral"}>
                    {ORDER_SAYS[order.status]?.label ?? order.status}
                  </Badge>
                </div>
                <p className="mine-strip__headline">Collect at {timeLabel(order.pickup_time)}</p>
                <p className="fine muted">
                  {parseLines(order.items_json)
                    .map((line) => `${line.qty} ${line.name}`)
                    .join(", ")}
                </p>
                <p className="row row--between">
                  <span className="mono mine-strip__code">{order.order_no}</span>
                  <Money value={order.total_fcfa} />
                </p>
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
