import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { dayLabel, timeLabel, todayISO } from "~/lib/format";
import { usePoll, useResource } from "~/lib/useResource";
import { Money } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { useVenue } from "~/state/venue";
import { DeskPage, Loaded, Nothing, Stat, State, TableWrap } from "./parts";

export function Overview() {
  const stats = useResource(() => api.desk.stats(), []);
  const today = useResource(() => api.desk.bookings.list({ date: todayISO() }), []);
  const orders = useResource(() => api.desk.orders.list(), []);
  const messages = useResource(() => api.deskSupport.threads({ status: "open" }), []);
  const { siteConfig } = useVenue();

  usePoll(() => { stats.reload(); today.reload(); orders.reload(); messages.reload(); }, 60_000);

  const live = (today.data ?? []).filter((booking) => booking.status !== "cancelled");
  const covers = live.reduce((sum, booking) => sum + booking.party_size, 0);
  const waiting = (orders.data ?? []).filter((order) => order.status === "pending" || order.status === "confirmed");
  const unpaid = stats.data?.pendingPayments ?? 0;
  const openThreads = messages.data?.threads?.length ?? 0;
  const pausedServices = [siteConfig.features.ordering && siteConfig.services.ordering.mode === "paused", siteConfig.features.booking && siteConfig.services.booking.mode === "paused", siteConfig.features.waitlist && siteConfig.services.waitlist.mode === "paused"].filter(Boolean).length;

  return (
    <DeskPage title="Tonight" lead="The things most likely to need your attention are at the top. Everything refreshes automatically.">
      <div className="stat-grid">
        <Stat label="Booked today" value={live.length} icon="calendar" hint={`${covers} covers`} />
        <Stat label="Orders to make" value={waiting.length} icon="bag" />
        <Stat label="Deposits unpaid" value={unpaid} icon="wallet" hint="Tables held but not paid for" />
        <Stat label="Taken all time" value={stats.data?.totalRevenue ?? 0} money icon="chart" />
      </div>

      {(unpaid > 0 || openThreads > 0 || pausedServices > 0 || siteConfig.business.mode !== "open") ? (
        <section className="desk-section stack">
          <div className="row row--between"><h2 className="card__title">Needs attention</h2><span className="fine faint">Live status</span></div>
          {unpaid > 0 ? <Link to="/desk/money" className="card card--action"><strong>{unpaid} payment{unpaid === 1 ? "" : "s"} waiting</strong><span className="fine muted" style={{ display: "block", marginTop: "0.25rem" }}>Tables are being held while customers finish paying.</span></Link> : null}
          {openThreads > 0 ? <Link to="/desk/inbox" className="card card--action"><strong>{openThreads} open support conversation{openThreads === 1 ? "" : "s"}</strong><span className="fine muted" style={{ display: "block", marginTop: "0.25rem" }}>Guests are waiting for a response.</span></Link> : null}
          {pausedServices > 0 ? <Link to="/desk/site-control" className="card card--action"><strong>{pausedServices} online service{pausedServices === 1 ? " is" : "s are"} paused</strong><span className="fine muted" style={{ display: "block", marginTop: "0.25rem" }}>Review takeaway, bookings or waitlist availability.</span></Link> : null}
          {siteConfig.business.mode !== "open" ? <Link to="/desk/site-control" className="card card--action"><strong>Website says: {siteConfig.business.mode === "busy" ? "Busy right now" : "Closed"}</strong><span className="fine muted" style={{ display: "block", marginTop: "0.25rem" }}>Check the customer-facing message before opening the doors.</span></Link> : null}
        </section>
      ) : <Notice tone="good" title="Nothing urgent">Bookings, orders, payments and support are all clear right now.</Notice>}

      <section className="desk-section">
        <div className="row row--between"><h2 className="card__title">Today's tables</h2><Link to="/desk/bookings" className="btn btn--quiet btn--sm">All bookings</Link></div>
        <Loaded resource={today}>{(rows) => {
          const liveToday = rows.filter((booking) => booking.status !== "cancelled");
          if (liveToday.length === 0) return <Nothing>Nothing booked for today yet.</Nothing>;
          return <TableWrap><thead><tr><th>Time</th><th>Guest</th><th>People</th><th>Table</th><th>Status</th><th>Code</th></tr></thead><tbody>{[...liveToday].sort((a, b) => a.time.localeCompare(b.time)).map((booking) => <tr key={booking.id}><td className="mono">{timeLabel(booking.time)}</td><td>{booking.user_name}<span className="fine faint"> {booking.phone}</span></td><td className="table__num">{booking.party_size}</td><td>{booking.table_label ?? "Any"}</td><td><State value={booking.checked_in_at ? "seated" : booking.status} /></td><td className="mono fine">{booking.ccm_code}</td></tr>)}</tbody></TableWrap>;
        }}</Loaded>
      </section>

      <section className="desk-section">
        <div className="row row--between"><h2 className="card__title">Takeaway orders</h2><Link to="/desk/orders" className="btn btn--quiet btn--sm">All orders</Link></div>
        <Loaded resource={orders}>{() => waiting.length === 0 ? <Nothing>Nothing waiting to be made.</Nothing> : <TableWrap><thead><tr><th>Pickup</th><th>Order</th><th>Name</th><th>Paid</th><th className="table__num">Total</th></tr></thead><tbody>{waiting.map((order) => <tr key={order.id}><td className="mono">{timeLabel(order.pickup_time)}</td><td className="mono fine">{order.order_no}</td><td>{order.name}<span className="fine faint"> {dayLabel(order.created_at.slice(0, 10))}</span></td><td><State value={order.payment_status ?? "unpaid"} /></td><td className="table__num"><Money value={order.total_fcfa} /></td></tr>)}</tbody></TableWrap>}</Loaded>
      </section>
    </DeskPage>
  );
}
