import { useEffect, useMemo, useState } from "react";
import { api, TakeawayOrder } from "../../api";

/**
 * The collection board.
 *
 * Takeaway is prepaid, so every order that reaches this screen is already
 * paid for — the queue is a kitchen worklist, not an invoice ledger. It is
 * laid out as lanes in the order work actually moves: new, cooking, ready,
 * then gone. The single most useful action on a card is the one that advances
 * it to the next lane, so that is the primary button and everything else is
 * secondary.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "New",
  confirmed: "Cooking",
  ready: "Ready",
  picked_up: "Collected",
  cancelled: "Cancelled",
};

/** Lanes, in the order the work moves. */
const LANES = ["pending", "confirmed", "ready"] as const;

const NEXT_STATUS: Record<string, string | null> = {
  pending: "confirmed",
  confirmed: "ready",
  ready: "picked_up",
  picked_up: null,
  cancelled: null,
};

const NEXT_LABEL: Record<string, string> = {
  pending: "Start cooking",
  confirmed: "Mark ready",
  ready: "Mark collected",
};

type Order = TakeawayOrder & {
  user_name: string | null;
  payment_status?: string;
  collected_at?: string | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Minutes since the order was placed, for the ageing indicator. */
function ageMinutes(iso: string): number {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
}

function parseItems(json: string): { name: string; qty: number; price: number }[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AdminTakeaway() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    api.admin.takeaway()
      .then((d) => { setOrders(d.orders as Order[]); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => {
    void load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(id: number, status: string) {
    setBusy(id);
    setError("");
    try {
      await api.admin.updateTakeawayStatus(id, status);
      setOrders((os) => os.map((o) => (o.id === id ? { ...o, status: status as Order["status"] } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that order.");
    } finally {
      setBusy(null);
    }
  }

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.order_no?.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q) ||
        o.phone.includes(q)
    );
  }, [orders, query]);

  const lanes = useMemo(
    () =>
      LANES.map((lane) => ({
        key: lane,
        label: STATUS_LABELS[lane],
        orders: matching
          .filter((o) => o.status === lane)
          .sort((a, b) => a.pickup_time.localeCompare(b.pickup_time)),
      })),
    [matching]
  );

  const done = useMemo(
    () => matching.filter((o) => o.status === "picked_up" || o.status === "cancelled"),
    [matching]
  );

  const takings = useMemo(
    () => orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + (o.total_fcfa ?? 0), 0),
    [orders]
  );

  function card(order: Order) {
    const items = parseItems(order.items_json);
    const age = ageMinutes(order.created_at);
    const next = NEXT_STATUS[order.status];
    // A ticket sitting more than twenty minutes in the kitchen needs a nudge.
    const late = age > 20 && (order.status === "pending" || order.status === "confirmed");

    return (
      <article key={order.id} className={`tka-card${late ? " is-late" : ""}`}>
        <header className="tka-card-head">
          <span className="tka-code mono">{order.order_no}</span>
          <span className={`tka-age mono${late ? " late" : ""}`}>{age}m</span>
        </header>

        <p className="tka-customer">{order.name}</p>
        <p className="tka-meta mono">
          Collect {order.pickup_time} · {order.phone}
        </p>

        <ul className="tka-items">
          {items.map((line, i) => (
            <li key={i}>
              <span className="tka-item-qty mono">{line.qty}</span>
              <span className="tka-item-name">{line.name}</span>
            </li>
          ))}
        </ul>

        {order.note && <p className="tka-note">“{order.note}”</p>}

        <footer className="tka-card-foot">
          <span className="tka-total mono">{(order.total_fcfa ?? 0).toLocaleString()} FCFA</span>
          <span className="tka-paid">Paid</span>
        </footer>

        <div className="tka-actions">
          {next && (
            <button
              className="btn btn-sm btn-amber"
              disabled={busy === order.id}
              onClick={() => void setStatus(order.id, next)}
            >
              {busy === order.id ? "Saving" : NEXT_LABEL[order.status]}
            </button>
          )}
          <button
            className="btn btn-sm btn-ghost"
            disabled={busy === order.id}
            onClick={() => void setStatus(order.id, "cancelled")}
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="admin-page tka">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Collection orders</h1>
          <p className="admin-page-sub mono">
            {lanes.reduce((n, l) => n + l.orders.length, 0)} in the kitchen · {takings.toLocaleString()} FCFA taken
          </p>
        </div>
        <input
          className="tka-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Code, name or phone"
          aria-label="Search orders"
        />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="empty-admin">Loading</p>}

      {!loading && (
        <div className="tka-lanes">
          {lanes.map((lane) => (
            <section key={lane.key} className="tka-lane">
              <h2 className="tka-lane-head">
                <span>{lane.label}</span>
                <span className="tka-lane-count mono">{lane.orders.length}</span>
              </h2>
              <div className="tka-lane-body">
                {lane.orders.length === 0 && <p className="tka-lane-empty">Nothing here.</p>}
                {lane.orders.map(card)}
              </div>
            </section>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="tka-done">
          <button type="button" className="tka-done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {showDone ? "Hide" : "Show"} finished orders ({done.length})
          </button>

          {showDone && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Customer</th>
                    <th>Collect</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.order_no}</td>
                      <td>{o.name}</td>
                      <td className="mono">{o.pickup_time}</td>
                      <td className="mono">{(o.total_fcfa ?? 0).toLocaleString()}</td>
                      <td>{STATUS_LABELS[o.status] ?? o.status}</td>
                      <td className="mono">{formatTime(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
