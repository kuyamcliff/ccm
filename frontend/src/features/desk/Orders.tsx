import { useState } from "react";
import { api } from "~/lib/api";
import type { OrderStatus } from "~/lib/api";
import { parseLines, phoneLabel, stampLabel, timeLabel } from "~/lib/format";
import { usePoll, useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { Money } from "~/ui/Bits";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, State, Toolbar } from "./parts";

/**
 * The kitchen board for takeaway orders.
 *
 * Cards rather than a table: this screen gets read across a room, and the next
 * action on an order is a single button rather than a menu of them. An order
 * that has not been paid for is never in the queue to be cooked, so it is shown
 * apart and cannot be advanced.
 */

/** What the button says, and what it moves the order to. */
const NEXT: Partial<Record<OrderStatus, { label: string; to: OrderStatus }>> = {
  pending: { label: "Start it", to: "confirmed" },
  confirmed: { label: "Mark ready", to: "ready" },
  ready: { label: "Handed over", to: "picked_up" },
};

const FILTERS: { value: OrderStatus | "live"; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "pending", label: "New" },
  { value: "confirmed", label: "Cooking" },
  { value: "ready", label: "Ready" },
  { value: "picked_up", label: "Collected" },
  { value: "cancelled", label: "Cancelled" },
];

export function Orders() {
  const orders = useResource(() => api.desk.orders.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const [filter, setFilter] = useState<OrderStatus | "live">("live");

  usePoll(orders.reload, 45_000);

  async function move(id: number, status: OrderStatus, label: string) {
    try {
      await api.desk.orders.setStatus(id, status);
      orders.reload();
      toast.done(label);
    } catch (err) {
      toast.failed(err);
    }
  }

  return (
    <DeskPage title="Takeaway" lead="New orders appear here on their own.">
      {confirmElement}

      <Toolbar>
        <div className="chip-rail">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button tone="ghost" icon="refresh" onClick={orders.reload}>
          Refresh
        </Button>
      </Toolbar>

      <Loaded resource={orders} skeletonHeight="9rem">
        {(rows) => {
          const shown = rows.filter((order) =>
            filter === "live" ? order.status === "pending" || order.status === "confirmed" || order.status === "ready" : order.status === filter
          );

          if (shown.length === 0) return <Nothing>Nothing here.</Nothing>;

          return (
            <div className="order-board">
              {shown.map((order) => {
                const lines = parseLines(order.items_json);
                const paid = order.payment_status === "paid";
                const next = paid ? NEXT[order.status] : undefined;

                return (
                  <article key={order.id} className={`card stack order-card${paid ? "" : " card--hot"}`}>
                    <div className="row row--between">
                      <span className="mono order-card__no">{order.order_no}</span>
                      <State value={order.status} />
                    </div>

                    <div className="row row--between">
                      <span className="order-card__time mono">{timeLabel(order.pickup_time)}</span>
                      <State value={order.payment_status ?? "unpaid"} />
                    </div>

                    <ul className="lines">
                      {lines.map((line, index) => (
                        <li key={index}>
                          <span className="mono lines__qty">{line.qty}</span>
                          <span>{line.name}</span>
                        </li>
                      ))}
                    </ul>

                    {order.note ? <p className="fine hot">{order.note}</p> : null}

                    <div className="row row--between fine">
                      <span>
                        {order.name}
                        <span className="faint"> {phoneLabel(order.phone)}</span>
                      </span>
                      <Money value={order.total_fcfa} />
                    </div>

                    <p className="fine faint">Ordered {stampLabel(order.created_at)}</p>

                    <div className="row row--wrap">
                      {next ? (
                        <Button size="sm" tone="primary" onClick={() => move(order.id, next.to, next.label)}>
                          {next.label}
                        </Button>
                      ) : !paid ? (
                        <span className="fine faint">Waiting on payment. Nothing to cook yet.</span>
                      ) : null}

                      {order.status !== "cancelled" && order.status !== "picked_up" ? (
                        <Button
                          size="sm"
                          tone="danger"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Cancel order ${order.order_no}?`,
                              body: "If it has been paid for, refund it through mobile money yourself.",
                              confirmLabel: "Cancel it",
                            });
                            if (ok) await move(order.id, "cancelled", "Order cancelled.");
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        }}
      </Loaded>
    </DeskPage>
  );
}
