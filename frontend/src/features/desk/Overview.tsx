import { api } from "~/lib/api";
import { useQuery, usePoll } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, timeLabel } from "~/lib/format";
import { Icon } from "~/ui/Icon";
import { LinkButton } from "~/ui/Button";
import { DeskPage, Loaded, Nothing, StatTile, Stats, State } from "./parts";
import { useSession } from "~/state/session";

/**
 * Tonight, at a glance.
 *
 * The screen somebody leaves open on a tablet by the till, so it refreshes
 * itself every minute and never puts a skeleton over numbers that are already
 * on screen.
 *
 * What is on it is what somebody standing at the counter needs to know without
 * asking: how many tables are booked, what is on the grill, and whether anything
 * is waiting for money. Everything else is one tap away in the rail.
 */
export function Overview() {
  const { user, can } = useSession();

  const stats = useQuery(K.desk.stats, () => api.desk.stats(), { staleMs: 30_000 });
  const bookings = useQuery(K.desk.bookings, () => api.desk.bookings.list(), {
    enabled: can("bookings"),
    staleMs: 30_000,
  });
  const orders = useQuery(K.desk.orders, () => api.desk.orders.list(), {
    enabled: can("takeaway"),
    staleMs: 20_000,
  });

  usePoll(() => {
    stats.reload();
    bookings.reload();
    orders.reload();
  }, 60_000);

  const today = new Date().toISOString().slice(0, 10);
  const tonight = (bookings.data ?? [])
    .filter((booking) => booking.date === today && booking.status !== "cancelled")
    .sort((a, b) => a.time.localeCompare(b.time));

  const cooking = (orders.data ?? []).filter((order) => order.status === "pending" || order.status === "confirmed");
  const ready = (orders.data ?? []).filter((order) => order.status === "ready");

  const firstName = user?.name.trim().split(/\s+/)[0] ?? "";

  return (
    <DeskPage title={`Evening${firstName ? `, ${firstName}` : ""}`} hint="Refreshes itself every minute.">
      <Loaded query={stats}>
        {(data) => (
          <Stats>
            <StatTile label="Tables today" value={data.todayReservations} />
            <StatTile label="On the grill" value={cooking.length} note={ready.length > 0 ? `${ready.length} ready` : undefined} />
            <StatTile label="Waiting on money" value={data.pendingPayments} />
            <StatTile label="Taken, all time" value={`${money(data.totalRevenue)} FCFA`} />
          </Stats>
        )}
      </Loaded>

      {can("bookings") ? (
        <section className="dk-section">
          <div className="bar bar--between">
            <h2 className="head">Tonight's tables</h2>
            <LinkButton to="/desk/bookings" tone="quiet" size="sm" iconEnd="arrow-right">
              All bookings
            </LinkButton>
          </div>

          {tonight.length === 0 ? (
            <Nothing icon="calendar">Nothing booked for today yet.</Nothing>
          ) : (
            <div className="rows">
              {tonight.slice(0, 8).map((booking) => (
                <div key={booking.id} className="row">
                  <span className="dk-time">{timeLabel(booking.time)}</span>
                  <span className="grow stack stack--tight">
                    <span className="small">{booking.user_name}</span>
                    <span className="fine faint">
                      {booking.party_size} covers
                      {booking.table_label ? ` · table ${booking.table_label}` : ""}
                    </span>
                  </span>
                  {booking.checked_in_at ? (
                    <State tone="good">In</State>
                  ) : booking.status === "pending_payment" ? (
                    <State tone="warn">Unpaid</State>
                  ) : (
                    <State>Booked</State>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {can("takeaway") ? (
        <section className="dk-section">
          <div className="bar bar--between">
            <h2 className="head">The board</h2>
            <LinkButton to="/desk/orders" tone="quiet" size="sm" iconEnd="arrow-right">
              All orders
            </LinkButton>
          </div>

          {cooking.length === 0 && ready.length === 0 ? (
            <Nothing icon="bag">Nothing on the board.</Nothing>
          ) : (
            <div className="rows">
              {[...ready, ...cooking].slice(0, 8).map((order) => (
                <div key={order.id} className="row">
                  <Icon name="bag" size={16} className="row__lead" />
                  <span className="grow stack stack--tight">
                    <span className="small">{order.name}</span>
                    <span className="fine faint">
                      {order.order_no} · for {order.pickup_time}
                    </span>
                  </span>
                  <State tone={order.status === "ready" ? "good" : "warn"}>
                    {order.status === "ready" ? "Ready" : "Cooking"}
                  </State>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </DeskPage>
  );
}
