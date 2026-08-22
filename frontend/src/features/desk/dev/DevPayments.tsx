import { useState } from "react";
import { api } from "~/lib/api";
import type { DevPaymentEvent, DevPaymentTrail } from "~/lib/api";
import { useMutation } from "~/lib/store";
import { money, stampLabel } from "~/lib/format";
import { Action } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Code } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Nothing, Section, State } from "../parts";

/**
 * One payment, and everything that ever happened to it.
 *
 * ── Why this screen is worth having ────────────────────────────────────────
 *
 * `payment_events` is append-only by design: nothing updates or deletes an
 * event, a correction is another row, and `payments.status` is a cache of the
 * last one. That is the right shape, and it has been readable only from psql.
 *
 * Which is a problem, because "the money left my account" is the highest-stakes
 * question this business can be asked, and it arrives by phone, at night, from
 * somebody holding an MTN confirmation. The honest answer needs the whole
 * chain: when we asked the wallet, what it said, whether a webhook arrived,
 * whether it was a redelivery. All of that is already recorded. None of it was
 * reachable.
 *
 * Looked up by the reference the customer was shown, because that is the string
 * they will read out.
 *
 * ── Mobile first ──────────────────────────────────────────────────────────
 *
 * The chain is a vertical timeline, which is the one shape that genuinely
 * suits a phone: it is already a list of things in order, and reading it top to
 * bottom is reading it in time order.
 */

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  completed: "good",
  paid: "good",
  pending: "warn",
  initiated: "warn",
  failed: "bad",
  expired: "bad",
  cancelled: "bad",
  refunded: "neutral",
};

export function DevPayments() {
  const [reference, setReference] = useState("");
  const [trail, setTrail] = useState<DevPaymentTrail | null>(null);
  const [missing, setMissing] = useState(false);

  const look = useMutation(async (needle: string) => {
    setMissing(false);
    setTrail(null);
    try {
      setTrail(await api.desk.dev.payment(needle));
    } catch (error) {
      /* A reference nobody recognises is the ordinary outcome of a mistyped
         code, not a fault worth a red box. */
      setMissing(true);
      throw error;
    }
  });

  return (
    <DeskPage title="Payments" hint="Look a reference up and read its whole history.">
      <form
        className="stack stack--snug"
        onSubmit={(event) => {
          event.preventDefault();
          const needle = reference.trim();
          if (needle) void look.run(needle);
        }}
      >
        <TextField
          label="Reference or order number"
          placeholder="CCM-PAY-… or TKA-…"
          value={reference}
          autoCapitalize="characters"
          onChange={(event) => setReference(event.target.value)}
        />
        <Action
          type="submit"
          tone="primary"
          block
          icon="search"
          pending={look.pending}
          pendingLabel="Looking"
          disabled={reference.trim().length === 0}
        >
          Find it
        </Action>
      </form>

      {missing && !look.pending ? (
        <Nothing icon="search">
          Nothing here by that reference. Check it against what the customer is reading out: the payment ones start
          CCM, the order ones start TKA.
        </Nothing>
      ) : null}

      {trail?.kind === "payment" ? <PaymentTrail payment={trail.payment} events={trail.events} /> : null}
      {trail?.kind === "takeaway" ? <OrderTrail order={trail.order} /> : null}
    </DeskPage>
  );
}

/** Reads a value the server sent as an untyped row, without pretending to know
    more about its shape than it does. */
function field(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === null || value === undefined || value === "") return "Not recorded";
  return String(value);
}

function num(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

/** The stored enum, as a person says it. The same names the printed receipt
    uses, so a customer reading one and a developer reading this are looking at
    the same words. */
function walletName(raw: string): string {
  if (raw === "mtn_momo") return "MTN Mobile Money";
  if (raw === "orange_money") return "Orange Money";
  if (raw === "cash") return "Cash at the counter";
  if (raw === "free") return "Covered by promo or gift card";
  return raw;
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className="row">
      <span className="grow label">{label}</span>
      {tone ? <State tone={tone}>{value}</State> : <span className="fine mono clip">{value}</span>}
    </div>
  );
}

function PaymentTrail({ payment, events }: { payment: Record<string, unknown>; events: DevPaymentEvent[] }) {
  const amount = num(payment, "amount_fcfa");
  const status = field(payment, "status");

  return (
    <>
      <Section title="The payment">
        <div className="rows rows--inset">
          <Line label="Status" value={status} tone={TONE[status] ?? "neutral"} />
          {amount !== null ? <Line label="Amount" value={`${money(amount)} FCFA`} /> : null}
          <Line label="Method" value={walletName(field(payment, "method"))} />
          <Line label="Wallet number" value={field(payment, "momo_phone")} />
          <Line label="Wallet transaction" value={field(payment, "momo_transaction_id")} />
          <Line label="Idempotency key" value={field(payment, "idempotency_key")} />
          <Line label="Started" value={stampLabel(field(payment, "created_at"))} />
        </div>
      </Section>

      <Section title="Whose it is">
        <div className="rows rows--inset">
          <Line label="Guest" value={field(payment, "user_name")} />
          <Line label="Email" value={field(payment, "user_email")} />
          {payment.booking_code ? <Line label="Booking" value={field(payment, "booking_code")} /> : null}
          {payment.booking_date ? (
            <Line label="Table for" value={`${field(payment, "booking_date")} ${field(payment, "booking_time")}`} />
          ) : null}
        </div>
      </Section>

      <Section
        title="Everything that happened"
        hint="Append-only. A correction is another row, never an edit."
      >
        {events.length === 0 ? (
          <Nothing icon="alert">
            No events at all, which should not happen: a payment row is written before the wallet is called, and the
            call itself writes the first event. Worth looking at.
          </Nothing>
        ) : (
          <ol className="dk-trail">
            {events.map((event) => (
              <li key={event.id} className="dk-trail__step" data-tone={TONE[event.status] ?? "neutral"}>
                <span className="dk-trail__dot" aria-hidden="true" />
                <span className="stack stack--tight grow">
                  <span className="bar bar--tight bar--wrap">
                    <span className="strong">{event.status}</span>
                    <span className="micro faint">via {event.source}</span>
                  </span>
                  <span className="micro faint">{stampLabel(event.created_at)}</span>
                  {event.detail ? <span className="fine muted">{event.detail}</span> : null}
                  {/* The unique index on this column is what makes a webhook
                      redelivery a no-op, so seeing it is seeing why a duplicate
                      did not charge anybody twice. */}
                  {event.provider_event_id ? (
                    <span className="micro mono faint clip">{event.provider_event_id}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function OrderTrail({ order }: { order: Record<string, unknown> }) {
  const total = num(order, "total_fcfa");
  const status = field(order, "payment_status");

  return (
    <>
      <Notice tone="info">
        That is a takeaway order. Those keep their money on the order itself rather than in the payments table, so there
        is no event chain to read.
      </Notice>

      <Section title="The order">
        <div className="rows rows--inset">
          <div className="row">
            <span className="grow label">Order</span>
            <Code value={field(order, "order_no")} size="sm" />
          </div>
          <Line label="Payment" value={status} tone={TONE[status] ?? "neutral"} />
          <Line label="Kitchen" value={field(order, "status")} />
          {total !== null ? <Line label="Total" value={`${money(total)} FCFA`} /> : null}
          <Line label="How" value={walletName(field(order, "payment_method"))} />
          <Line label="Wallet reference" value={field(order, "momo_reference")} />
          <Line label="Wallet transaction" value={field(order, "momo_transaction_id")} />
          <Line label="Paid" value={stampLabel(field(order, "paid_at"))} />
        </div>
      </Section>
    </>
  );
}
