import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { normalisePhone } from "~/lib/format";
import { say } from "~/lib/say";
import { Icon } from "~/ui/Icon";
import { Img } from "~/ui/Img";
import { Action, LinkButton } from "~/ui/Button";
import { TextField, TextAreaField, SelectField, PhoneField, Counter } from "~/ui/Field";
import { Money, Code, Badge } from "~/ui/Bits";
import { EmptyState, Notice, SkeletonRows } from "~/ui/Feedback";
import { usePress } from "~/ui/press";
import { PaySheet, type PaymentDriver } from "~/features/pay/PaySheet";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * The takeaway basket, and paying for it.
 *
 * ── Cash on collection ─────────────────────────────────────────────────────
 *
 * New in v5, and it changes who can order. Mobile Money was the only way to pay,
 * which quietly excluded anybody without a wallet, anybody whose wallet was
 * empty at eight in the evening, and anybody who simply does not want to pay a
 * restaurant they have not eaten at yet before they have seen the food.
 *
 * A cash order is placed exactly like a paid one and then left unpaid: the
 * kitchen sees it, the customer gets the same code, and the counter takes the
 * money when they arrive. The console's Orders board has a "Mark paid" for it.
 *
 * Prices are never trusted from here. The basket stores ids and quantities only,
 * they are priced against the live menu for display, and the server prices the
 * whole order again when it is placed.
 */

/** Half-hourly, from now until closing. The server validates this again. */
function pickupSlots(): string[] {
  const slots: string[] = [];
  const now = new Date();
  /* Twenty minutes' head start: the grill needs it, and offering a slot that has
     already passed is offering something nobody can have. */
  const start = new Date(now.getTime() + 20 * 60 * 1000);
  const cursor = new Date(start);
  cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 60, 0, 0);

  while (cursor.getHours() < 23) {
    slots.push(`${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`);
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return slots;
}

type Method = "mtn_momo" | "orange_money" | "cash";

export function OrderPage() {
  const { c } = useCopy();
  const { siteConfig } = useVenue();
  const { user } = useSession();
  const basket = useBasket();
  const navigate = useNavigate();

  const menu = useQuery(K.menu, () => api.site.menu(), { persist: true });

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<Method>(siteConfig.payments.mtn ? "mtn_momo" : "orange_money");

  const slots = useMemo(() => pickupSlots(), []);
  const [pickup, setPickup] = useState(slots[0] ?? "19:00");

  /** The placed order, once it exists. Paying happens against this. */
  const [placed, setPlaced] = useState<{ orderNo: string; total: number; payable: boolean } | null>(null);
  const [paying, setPaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const priced = useMemo(() => basket.price(menu.data ?? []), [basket, menu.data]);

  const cashAllowed = siteConfig.payments.cash !== false;
  const walletAllowed = siteConfig.payments.mtn || siteConfig.payments.orange;

  const place = useMutation(async () => {
    setProblem(null);
    const result = await api.orders.place({
      name: name.trim(),
      phone: normalisePhone(phone),
      pickup_time: pickup,
      items: priced.lines.map((line) => ({ id: line.id, qty: line.qty })),
      note: note.trim() || undefined,
      payment_method: method === "cash" ? "cash" : undefined,
    });

    basket.clear();
    invalidate(K.myOrders);

    /* The server has the last word on whether there is anything to charge: a
       promo or gift card can cover the whole order, in which case there is no
       payment sheet to open even for a wallet order. */
    const payable = result.payment_required;
    setPlaced({ orderNo: result.order_no, total: result.total_fcfa, payable });
    if (payable) setPaying(true);
  });

  /* ── Placed ───────────────────────────────────────────────────────────────*/
  if (placed && !paying) {
    return (
      <div className="page section stack">
        <header className="stack stack--tight">
          <h1 className="display display--xl">{c.order.placed}</h1>
          <p className="lead">{placed.payable ? c.order.lead : c.order.payCashNote}</p>
        </header>

        {/* A carried surface: this is the thing they hold up at the counter. */}
        <div className="carry order__code">
          <p className="label">{c.order.yourCode}</p>
          <Code value={placed.orderNo} size="lg" />
          <p className="fine muted">{c.order.codeHint}</p>
          <div className="bar bar--between order__codefoot">
            <span className="label">{c.common.total}</span>
            <Money value={placed.total} />
          </div>
          {!placed.payable ? <Badge tone="warn">{c.order.payCash}</Badge> : null}
        </div>

        <div className="bar bar--wrap">
          <LinkButton to="/mine" tone="primary" size="sm" icon="ticket">
            {c.yours.trackOrder}
          </LinkButton>
          <LinkButton to="/menu" tone="ghost" size="sm">
            {c.nav.menu}
          </LinkButton>
        </div>
      </div>
    );
  }

  /* ── Empty ────────────────────────────────────────────────────────────────*/
  if (menu.loading) {
    return (
      <div className="page section">
        <SkeletonRows count={4} />
      </div>
    );
  }

  if (priced.lines.length === 0) {
    return (
      <div className="page section">
        <EmptyState
          icon="basket"
          title={c.order.empty}
          body={c.order.emptyBody}
          action={
            <LinkButton to="/menu" tone="primary" size="sm" icon="list">
              {c.order.goToMenu}
            </LinkButton>
          }
        />
      </div>
    );
  }

  const ready = name.trim().length > 1 && normalisePhone(phone).length === 9 && priced.lines.length > 0;

  const driver: PaymentDriver = {
    allowDiscounts: true,
    start: ({ momoPhone, wallet, idempotencyKey }) =>
      api.orders.pay(placed!.orderNo, momoPhone, wallet, idempotencyKey).then((result) => ({
        reference: result.reference,
        amount_fcfa: result.amount_fcfa,
        expires_in_seconds: result.expires_in_seconds,
        payment_url: result.payment_url,
      })),
    poll: (reference) => api.orders.paymentStatus(reference),
    abandon: (reference) => api.orders.abandonPayment(reference),
  };

  return (
    <div className="page section stack order">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.order.title}</h1>
        <p className="lead">{c.order.lead}</p>
      </header>

      {priced.dropped > 0 ? (
        <Notice tone="warn">
          {priced.dropped === 1
            ? "One thing in your basket is no longer on the menu, so we took it out."
            : `${priced.dropped} things in your basket are no longer on the menu, so we took them out.`}
        </Notice>
      ) : null}

      {/* ── The lines ────────────────────────────────────────────────────────*/}
      <div className="rows rows--inset order__lines">
        {priced.lines.map((line) => (
          <div key={line.id} className="row">
            <Img src={line.item.image_url} alt="" ratio={1} radius="var(--r-sm)" className="order__thumb" />
            <div className="grow stack stack--tight">
              <span className="head clip">{line.item.name}</span>
              <Money value={line.item.price_fcfa ?? 0} size="fine" />
            </div>
            <Counter
              value={line.qty}
              onChange={(next) => basket.setQty(line.id, next)}
              min={0}
              max={20}
              label={line.item.name}
            />
            <Money value={line.lineTotal} size="fine" />
          </div>
        ))}
      </div>

      <div className="rows order__totals">
        <div className="row">
          <span className="grow label">{c.order.subtotal}</span>
          <Money value={priced.subtotal} />
        </div>
      </div>

      <p className="fine faint">
        Promo codes, gift cards and points are applied at the payment step, once we know what you owe.
      </p>

      {/* ── Details ──────────────────────────────────────────────────────────*/}
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await place.run();
          const error = place.readError();
          if (error) setProblem(say(error, "order"));
        }}
      >
        <h2 className="head">{c.order.yourDetails}</h2>

        <TextField
          label={c.order.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />

        <PhoneField label={c.order.phone} hint={c.order.phoneHint} value={phone} onChange={setPhone} required />

        <SelectField
          label={c.order.pickupTime}
          hint={c.order.pickupHint}
          value={pickup}
          onChange={(event) => setPickup(event.target.value)}
        >
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label={c.order.note}
          placeholder={c.order.notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={300}
        />

        {/* ── How to pay ─────────────────────────────────────────────────────*/}
        <h2 className="head">{c.order.payHow}</h2>
        {/*
          * Three names and nothing under them.
          *
          * Each row used to carry a line explaining what would happen: a PIN
          * prompt arriving on the handset, Orange Money opening to approve it.
          * Everybody choosing between these two does this several times a week,
          * and describing it back to them is three lines of the screen spent
          * saying nothing they did not know before they arrived.
          */}
        <div className="rows rows--inset methods" role="radiogroup" aria-label={c.order.payHow}>
          {siteConfig.payments.mtn ? (
            <MethodRow
              on={method === "mtn_momo"}
              onSelect={() => setMethod("mtn_momo")}
              icon="wallet"
              label={c.order.payMtn}
            />
          ) : null}
          {siteConfig.payments.orange ? (
            <MethodRow
              on={method === "orange_money"}
              onSelect={() => setMethod("orange_money")}
              icon="wallet"
              label={c.order.payOrange}
            />
          ) : null}
          {cashAllowed ? (
            <MethodRow
              on={method === "cash"}
              onSelect={() => setMethod("cash")}
              icon="cash"
              label={c.order.payCash}
            />
          ) : null}
        </div>

        {!walletAllowed && !cashAllowed ? (
          <Notice tone="warn" title="Ordering is off">
            No payment method is switched on. Give the restaurant a call.
          </Notice>
        ) : null}

        {problem ? <Notice tone="bad">{problem}</Notice> : null}

        <div className="order__pay">
          <div className="bar bar--between">
            <span className="label">{c.common.total}</span>
            <Money value={priced.subtotal} size="big" />
          </div>
          <Action
            type="submit"
            tone="primary"
            block
            size="lg"
            pending={place.pending}
            pendingLabel={c.pending.ordering}
            disabled={!ready || (!walletAllowed && !cashAllowed)}
          >
            {method === "cash" ? c.order.placeOrder : c.order.payNow}
          </Action>
          {/* The total is on the line above this one, in the largest figure on
              the screen. Saying it again in words underneath the button, as a
              sentence about approving a prompt, was the amount twice and the
              explanation nobody needed. */}
        </div>
      </form>

      {placed && paying ? (
        <PaySheet
          open
          onClose={() => {
            setPaying(false);
          }}
          onPaid={() => {
            setPaying(false);
            invalidate(K.myOrders);
            navigate("/mine", { replace: true });
          }}
          amountFcfa={placed.total}
          title={c.pay.title}
          what={`${c.order.title}, ${placed.orderNo}`}
          driver={driver}
        />
      ) : null}
    </div>
  );
}

function MethodRow({
  on,
  onSelect,
  icon,
  label,
}: {
  on: boolean;
  onSelect: () => void;
  icon: "wallet" | "cash";
  label: string;
}) {
  const press = usePress();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className="row method"
      data-on={on ? "true" : undefined}
      onClick={onSelect}
      {...press.pressProps}
    >
      <span className="method__mark" aria-hidden="true">
        {on ? <Icon name="check" size={13} /> : null}
      </span>
      <Icon name={icon} size={18} className="row__lead" />
      <span className="grow head">{label}</span>
    </button>
  );
}
