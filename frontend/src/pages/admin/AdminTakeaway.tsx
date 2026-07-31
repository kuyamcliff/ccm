import { useEffect, useMemo, useState } from "react";
import { api, TakeawayOrder } from "../../api";
import { useLanguage } from "../../i18n/context";

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

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "statusNew",
  confirmed: "statusCooking",
  ready: "statusReady",
  picked_up: "statusCollected",
  cancelled: "statusCancelled",
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

const NEXT_LABEL_KEYS: Record<string, string> = {
  pending: "nextStartCooking",
  confirmed: "nextMarkReady",
  ready: "nextMarkCollected",
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
  const { t, lang } = useLanguage();
  const tk = (key: string) => t("adminTakeaway", key);
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
      setError(e instanceof Error ? e.message : tk("errUpdate"));
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
        label: tk(STATUS_LABEL_KEYS[lane]),
        orders: matching
          .filter((o) => o.status === lane)
          .sort((a, b) => a.pickup_time.localeCompare(b.pickup_time)),
      })),
    [matching, lang]
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
          {tk("collectAt").replace("{time}", order.pickup_time).replace("{phone}", order.phone)}
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
          <span className="tka-paid">{tk("paid")}</span>
        </footer>

        <div className="tka-actions">
          {next && (
            <button
              className="btn btn-sm btn-amber"
              disabled={busy === order.id}
              onClick={() => void setStatus(order.id, next)}
            >
              {busy === order.id ? tk("saving") : tk(NEXT_LABEL_KEYS[order.status])}
            </button>
          )}
          <button
            className="btn btn-sm btn-ghost"
            disabled={busy === order.id}
            onClick={() => void setStatus(order.id, "cancelled")}
          >
            {tk("cancel")}
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="admin-page tka">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{tk("title")}</h1>
          <p className="admin-page-sub mono">
            {tk("subtitle")
              .replace("{n}", String(lanes.reduce((n, l) => n + l.orders.length, 0)))
              .replace("{total}", takings.toLocaleString())}
          </p>
        </div>
        <input
          className="tka-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tk("searchPlaceholder")}
          aria-label={tk("searchLabel")}
        />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="empty-admin">{tk("loading")}</p>}

      {!loading && (
        <div className="tka-lanes">
          {lanes.map((lane) => (
            <section key={lane.key} className="tka-lane">
              <h2 className="tka-lane-head">
                <span>{lane.label}</span>
                <span className="tka-lane-count mono">{lane.orders.length}</span>
              </h2>
              <div className="tka-lane-body">
                {lane.orders.length === 0 && <p className="tka-lane-empty">{tk("nothingHere")}</p>}
                {lane.orders.map(card)}
              </div>
            </section>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="tka-done">
          <button type="button" className="tka-done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {(showDone ? tk("hideFinished") : tk("showFinished")).replace("{n}", String(done.length))}
          </button>

          {showDone && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{tk("colCode")}</th>
                    <th>{tk("colCustomer")}</th>
                    <th>{tk("colCollect")}</th>
                    <th>{tk("colTotal")}</th>
                    <th>{tk("colStatus")}</th>
                    <th>{tk("colPlaced")}</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((o) => (
                    <tr key={o.id}>
                      <td className="mono" data-label={tk("colCode")}>{o.order_no}</td>
                      <td data-label={tk("colCustomer")}>{o.name}</td>
                      <td className="mono" data-label={tk("colCollect")}>{o.pickup_time}</td>
                      <td className="mono" data-label={tk("colTotal")}>{(o.total_fcfa ?? 0).toLocaleString()}</td>
                      <td data-label={tk("colStatus")}>{tk(STATUS_LABEL_KEYS[o.status] ?? "statusNew")}</td>
                      <td className="mono" data-label={tk("colPlaced")}>{formatTime(o.created_at)}</td>
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
