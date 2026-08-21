import { api } from "~/lib/api";
import type { Booking } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { dayLabel, timeLabel, parseLines } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { LinkButton, PressableLink } from "~/ui/Button";
import { Badge, Code, Money } from "~/ui/Bits";
import { Skeleton } from "~/ui/Feedback";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * What replaces the hero once somebody has signed in.
 *
 * A returning customer does not need to be sold the restaurant again. What they
 * want is the two facts they came back for: when their table is, and where their
 * order has got to. Both, if they have both, and a way in if they have neither.
 *
 * Rows on the page, not cards. The pass and the receipt are the only things in
 * this product that get a raised surface, and neither of them is here: this is a
 * summary that links to them.
 */

function greeting(c: ReturnType<typeof useCopy>["c"]): string {
  const hour = new Date().getHours();
  if (hour < 12) return c.yours.greetingMorning;
  if (hour < 17) return c.yours.greetingAfternoon;
  return c.yours.greeting;
}

/** The first booking that has not happened yet and has not been cancelled. */
function nextBooking(bookings: Booking[]): Booking | null {
  const now = new Date();
  return (
    bookings
      .filter((booking) => booking.status === "confirmed" || booking.status === "pending_payment")
      .filter((booking) => new Date(`${booking.date}T${booking.time}`) >= now)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0] ?? null
  );
}

/** An order that is still going to become food. Anything collected or cancelled
    belongs in the history on My visits, not on the front page. */
const LIVE_ORDER_STATUSES = new Set(["awaiting_payment", "pending", "confirmed", "ready"]);

export function YourStuff({ name }: { name: string }) {
  const { c, fill } = useCopy();
  const { siteConfig } = useVenue();

  const bookings = useQuery(K.myBookings, () => api.booking.mine(), { staleMs: 60_000 });
  const orders = useQuery(K.myOrders, () => api.orders.mine(), { staleMs: 30_000 });

  const table = nextBooking(bookings.data ?? []);
  const order = (orders.data ?? []).find((entry) => LIVE_ORDER_STATUSES.has(entry.status)) ?? null;

  const loading = bookings.loading || orders.loading;
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <section className="yours page section">
      <h1 className="display display--xl yours__hello">
        {greeting(c)}, {firstName}.
      </h1>

      {loading ? (
        <div className="rows">
          <div className="row row--tall">
            <Skeleton height="2.25rem" width="2.25rem" radius="var(--r-sm)" />
            <div className="grow stack stack--tight">
              <Skeleton height="0.85rem" width="45%" />
              <Skeleton height="0.75rem" width="30%" />
            </div>
          </div>
        </div>
      ) : (
        <div className="rows">
          {/* ── The next table ─────────────────────────────────────────────*/}
          {table ? (
            <PressableLink to="/mine" className="row row--tall">
              <span className="yours__icon" aria-hidden="true">
                <Icon name="calendar" size={18} />
              </span>
              <span className="grow stack stack--tight">
                <span className="label">{c.yours.nextTable}</span>
                <span className="title">
                  {dayLabel(table.date)}, {timeLabel(table.time)}
                </span>
                <span className="fine muted">
                  {table.table_label ? `Table ${table.table_label} · ` : ""}
                  {table.party_size === 1 ? c.book.partyOne : fill(c.book.partyMany, { n: table.party_size })}
                </span>
              </span>
              <span className="bar bar--tight">
                {table.status === "pending_payment" ? (
                  <Badge tone="warn">{c.mine.bookingStatus.pending_payment}</Badge>
                ) : table.ccm_code ? (
                  <Code value={table.ccm_code} size="sm" />
                ) : null}
                <Icon name="chevron-right" size={16} className="faint" />
              </span>
            </PressableLink>
          ) : siteConfig.features.booking ? (
            <PressableLink to="/book" className="row row--tall">
              <span className="yours__icon yours__icon--quiet" aria-hidden="true">
                <Icon name="calendar" size={18} />
              </span>
              <span className="grow stack stack--tight">
                <span className="head">{c.yours.noTable}</span>
                <span className="fine muted">{c.yours.noTableBody}</span>
              </span>
              <Icon name="chevron-right" size={16} className="faint" />
            </PressableLink>
          ) : null}

          {/* ── The live order ─────────────────────────────────────────────*/}
          {order ? (
            <PressableLink to="/mine" className="row row--tall">
              <span className="yours__icon" aria-hidden="true">
                <Icon name="bag" size={18} />
              </span>
              <span className="grow stack stack--tight">
                <span className="label">{c.yours.liveOrder}</span>
                <span className="title">{c.mine.orderStatus[order.status]}</span>
                <span className="fine muted clip">
                  {parseLines(order.items_json)
                    .map((line) => `${line.qty} ${line.name}`)
                    .join(", ")}
                </span>
              </span>
              <span className="bar bar--tight">
                <Money value={order.total_fcfa} size="fine" />
                <Icon name="chevron-right" size={16} className="faint" />
              </span>
            </PressableLink>
          ) : null}
        </div>
      )}

      <div className="bar bar--wrap yours__actions">
        <LinkButton to="/menu" tone="primary" size="sm" icon="list">
          {c.home.seeMenu}
        </LinkButton>
        <LinkButton to="/mine" tone="ghost" size="sm">
          {c.yours.seeAllVisits}
        </LinkButton>
      </div>
    </section>
  );
}
