import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import type { DeskOrder } from "~/lib/api";
import { useMutation, useQuery, usePoll, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money, parseLines, phoneLabel, timeAgo } from "~/lib/format";
import { Action, Button } from "~/ui/Button";
import { Segmented } from "~/ui/Field";
import { useConfirm } from "~/ui/Sheet";
import { Code } from "~/ui/Bits";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Nothing, State } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The kitchen board.
 *
 * Not a table. This is the one console screen somebody reads from two feet away
 * with their hands full, so it is a column of large cards with one obvious
 * button each, and the button says the next thing that happens rather than the
 * state it moves to.
 *
 * It polls every twenty seconds. An order placed on a phone outside has to
 * appear here without anybody refreshing anything.
 *
 * ── Cash on collection ─────────────────────────────────────────────────────
 *
 * An order paid at the counter arrives here unpaid and stays unpaid until
 * somebody takes the money. That is what the amount-owed line and the "Took the
 * money" button are for, and why the collect button warns before handing over
 * food that has not been paid for.
 */

type Lane = "live" | "ready" | "done";

const NEXT: Record<string, { status: string; label: string; pending: string } | undefined> = {
  pending: { status: "confirmed", label: "On the fire", pending: "Saving" },
  confirmed: { status: "ready", label: "Ready", pending: "Saving" },
  ready: { status: "picked_up", label: "Collected", pending: "Saving" },
};

export function Orders() {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [lane, setLane] = useState<Lane>("live");

  const orders = useQuery(K.desk.orders, () => api.desk.orders.list(), { staleMs: 15_000 });
  usePoll(() => orders.reload(), 20_000);

  const advance = useMutation(async (input: { id: number; status: string }) => {
    await api.desk.orders.setStatus(input.id, input.status);
    invalidate("desk.orders*");
    orders.reload();
  });

  const markPaid = useMutation(async (id: number) => {
    await api.desk.orders.markPaid(id);
    invalidate("desk.orders*");
    orders.reload();
    toast.done("Marked as paid.");
  });

  const shown = useMemo(() => {
    const all = orders.data ?? [];
    if (lane === "live") return all.filter((order) => order.status === "pending" || order.status === "confirmed");
    if (lane === "ready") return all.filter((order) => order.status === "ready");
    return all.filter((order) => order.status === "picked_up" || order.status === "cancelled");
  }, [orders.data, lane]);

  const counts = useMemo(() => {
    const all = orders.data ?? [];
    return {
      live: all.filter((order) => order.status === "pending" || order.status === "confirmed").length,
      ready: all.filter((order) => order.status === "ready").length,
    };
  }, [orders.data]);

  return (
    <DeskPage title="Orders" hint="Prepaid and cash. Polls itself every twenty seconds.">
      <Segmented
        value={lane}
        onChange={setLane}
        label="Which orders"
        options={[
          { value: "live", label: counts.live > 0 ? `Cooking (${counts.live})` : "Cooking" },
          { value: "ready", label: counts.ready > 0 ? `Ready (${counts.ready})` : "Ready" },
          { value: "done", label: "Done" },
        ]}
      />

      <Loaded query={orders}>
        {() =>
          shown.length === 0 ? (
            <Nothing icon="bag">Nothing on this lane.</Nothing>
          ) : (
            <div className="dk-board">
              {shown.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  advancing={advance.pending}
                  paying={markPaid.pending}
                  onAdvance={async (status) => {
                    const unpaid = order.payment_status !== "paid";
                    /* Handing over food that has not been paid for is a real
                       loss, so it asks once rather than silently allowing it. */
                    if (status === "picked_up" && unpaid) {
                      const sure = await confirm({
                        title: "This order is not paid",
                        body: `${money(order.total_fcfa)} FCFA is still owed. Hand it over anyway?`,
                        confirmLabel: "Hand it over",
                        cancelLabel: "Not yet",
                        tone: "primary",
                      });
                      if (!sure) return;
                    }
                    await advance.run({ id: order.id, status });
                    const error = advance.readError();
                    if (error) toast.failed(error, "desk");
                  }}
                  onMarkPaid={async () => {
                    await markPaid.run(order.id);
                    const error = markPaid.readError();
                    if (error) toast.failed(error, "desk");
                  }}
                />
              ))}
            </div>
          )
        }
      </Loaded>

      {element}
    </DeskPage>
  );
}

function OrderCard({
  order,
  advancing,
  paying,
  onAdvance,
  onMarkPaid,
}: {
  order: DeskOrder;
  advancing: boolean;
  paying: boolean;
  onAdvance: (status: string) => void;
  onMarkPaid: () => void;
}) {
  const lines = parseLines(order.items_json);
  const next = NEXT[order.status];
  const unpaid = order.payment_status !== "paid";

  return (
    <article className="dk-order" data-ready={order.status === "ready" ? "true" : undefined}>
      <div className="bar bar--between">
        <Code value={order.order_no} size="sm" />
        <span className="fine faint">for {order.pickup_time}</span>
      </div>

      <div className="bar bar--between bar--top">
        <span className="stack stack--tight">
          <span className="title">{order.name}</span>
          <span className="fine faint">{order.phone ? phoneLabel(order.phone) : ""}</span>
        </span>
        <span className="stack stack--tight right">
          <span className="strong">{money(order.total_fcfa)} FCFA</span>
          {unpaid ? <State tone="warn">Owes it</State> : <State tone="good">Paid</State>}
        </span>
      </div>

      <ul className="dk-order__lines">
        {lines.map((line, index) => (
          <li key={`${line.name}-${index}`}>
            <span className="dk-order__qty">{line.qty}</span>
            {line.name}
          </li>
        ))}
      </ul>

      {order.note ? (
        <p className="dk-order__note fine">
          <Icon name="info" size={13} /> {order.note}
        </p>
      ) : null}

      <div className="bar bar--tight">
        {unpaid && order.status !== "cancelled" ? (
          <Action
            size="sm"
            tone="ghost"
            icon="cash"
            block
            pending={paying}
            pendingLabel="Saving"
            onClick={onMarkPaid}
          >
            Took the money
          </Action>
        ) : null}

        {next ? (
          <Action
            size="sm"
            tone="primary"
            block
            pending={advancing}
            pendingLabel={next.pending}
            onClick={() => onAdvance(next.status)}
          >
            {next.label}
          </Action>
        ) : (
          <Button size="sm" tone="quiet" block disabled>
            {order.status === "cancelled" ? "Cancelled" : "Collected"}
          </Button>
        )}
      </div>

      <span className="micro faint">{timeAgo(order.created_at)}</span>
    </article>
  );
}
