import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { dayLabel, timeLabel, todayISO } from "~/lib/format";
import { usePoll, useResource } from "~/lib/useResource";
import { Money } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, Stat, State, TableWrap } from "./parts";

/**
 * What is happening right now.
 *
 * Written for a glance from behind the counter, so it answers three questions
 * and nothing else: who is coming tonight, what has not been paid, and what is
 * waiting to be collected. Everything refreshes on its own, because nobody is
 * going to stand there pressing reload.
 */
export function Overview() {
  const stats = useResource(() => api.desk.stats(), []);
  const today = useResource(() => api.desk.bookings.list({ date: todayISO() }), []);
  const orders = useResource(() => api.desk.orders.list(), []);

  usePoll(() => {
    stats.reload();
    today.reload();
    orders.reload();
  }, 60_000);

  const live = (today.data ?? []).filter((booking) => booking.status !== "cancelled");
  const covers = live.reduce((sum, booking) => sum + booking.party_size, 0);
  const waiting = (orders.data ?? []).filter((order) => order.status === "pending" || order.status === "confirmed");

  return (
    <DeskPage title="Tonight" lead="Refreshes by itself every minute.">
      <div className="stat-grid">
        <Stat label="Booked today" value={live.length} icon="calendar" hint={`${covers} covers`} />
        <Stat label="Orders to make" value={waiting.length} icon="bag" />
        <Stat
          label="Deposits unpaid"
          value={stats.data?.pendingPayments ?? 0}
          icon="wallet"
          hint="Tables held but not paid for"
        />
        <Stat label="Taken all time" value={stats.data?.totalRevenue ?? 0} money icon="chart" />
      </div>

      <section className="desk-section">
        <div className="row row--between">
          <h2 className="card__title">Today's tables</h2>
          <Link to="/desk/bookings" className="btn btn--quiet btn--sm">
            All bookings
          </Link>
        </div>

        <Loaded resource={today}>
          {(rows) => {
            const live = rows.filter((booking) => booking.status !== "cancelled");
            if (live.length === 0) return <Nothing>Nothing booked for today yet.</Nothing>;
            return (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Guest</th>
                    <th>People</th>
                    <th>Table</th>
                    <th>Status</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {[...live]
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((booking) => (
                      <tr key={booking.id}>
                        <td className="mono">{timeLabel(booking.time)}</td>
                        <td>
                          {booking.user_name}
                          <span className="fine faint"> {booking.phone}</span>
                        </td>
                        <td className="table__num">{booking.party_size}</td>
                        <td>{booking.table_label ?? "Any"}</td>
                        <td>
                          <State value={booking.checked_in_at ? "seated" : booking.status} />
                        </td>
                        <td className="mono fine">{booking.ccm_code}</td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            );
          }}
        </Loaded>
      </section>

      <section className="desk-section">
        <div className="row row--between">
          <h2 className="card__title">Takeaway orders</h2>
          <Link to="/desk/orders" className="btn btn--quiet btn--sm">
            All orders
          </Link>
        </div>

        <Loaded resource={orders}>
          {() =>
            waiting.length === 0 ? (
              <Nothing>Nothing waiting to be made.</Nothing>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Pickup</th>
                    <th>Order</th>
                    <th>Name</th>
                    <th>Paid</th>
                    <th className="table__num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((order) => (
                    <tr key={order.id}>
                      <td className="mono">{timeLabel(order.pickup_time)}</td>
                      <td className="mono fine">{order.order_no}</td>
                      <td>
                        {order.name}
                        <span className="fine faint"> {dayLabel(order.created_at.slice(0, 10))}</span>
                      </td>
                      <td>
                        <State value={order.payment_status ?? "unpaid"} />
                      </td>
                      <td className="table__num">
                        <Money value={order.total_fcfa} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )
          }
        </Loaded>
      </section>
    </DeskPage>
  );
}
