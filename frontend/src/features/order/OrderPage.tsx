import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { money, normalisePhone, timeLabel, todayISO } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, IconButton, LinkButton } from "~/ui/Button";
import { PhoneField, TextAreaField, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, SkeletonCards } from "~/ui/Feedback";
import { SlotPicker, firstBookableSlot } from "~/ui/SlotPicker";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { MomoDialog } from "~/features/pay/MomoDialog";

/**
 * The basket and the checkout for takeaway orders.
 *
 * Prices shown here are only ever a preview: the server prices the order again
 * from the menu when it is placed, which is what stops a stale basket or an
 * edited request from buying a 4,500 FCFA chicken for 100. When the two
 * disagree the server wins, and the difference is shown before anything is
 * paid.
 *
 * One decision shapes the whole screen. There is no separate review step: the
 * lines, the details and the total are on one page, and the button at the
 * bottom of it is the payment. A second confirmation screen on a phone is one
 * more thing to lose on a dropped connection.
 */

/** What the grill needs between an order landing and somebody arriving. */
const PICKUP_LEAD_MINUTES = 30;

interface Placed {
  order_no: string;
  total_fcfa: number;
  discount_fcfa: number;
  payment_required: boolean;
}

export function OrderPage() {
  const { user } = useSession();
  const basket = useBasket();
  const toast = useToast();
  const menu = useResource(() => api.site.menu(), []);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  /* Collection is today, and the kitchen wants half an hour. Start on the
     first slot that actually satisfies both rather than on a fixed one that
     may already have gone. */
  const today = todayISO();
  const [pickup, setPickup] = useState<string | null>(() => firstBookableSlot(today, PICKUP_LEAD_MINUTES));
  const [note, setNote] = useState("");
  const [promo, setPromo] = useState("");
  const [gift, setGift] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const [placed, setPlaced] = useState<Placed | null>(null);
  /* Snapshotted as the order goes out, because the basket is emptied the
     moment it does and the confirmation still has to say what was bought. */
  const [ordered, setOrdered] = useState<{ name: string; qty: number; total: number }[]>([]);
  const [paying, setPaying] = useState(false);
  const [collected, setCollected] = useState(false);

  const place = useAction(api.orders.place);

  if (menu.loading) {
    return (
      <div className="page section">
        <SkeletonCards count={3} height="6rem" />
      </div>
    );
  }

  if (menu.error) {
    return (
      <div className="page section">
        <ErrorState error={menu.error} onRetry={menu.reload} />
      </div>
    );
  }

  const { lines, subtotal, dropped } = basket.price(menu.data ?? []);

  /* Paid, or nothing left to pay. This is the code the counter asks for. */
  if (collected && placed) {
    return (
      <div className="page section stack stack--loose" style={{ maxWidth: "34rem" }}>
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Order in</h1>
        </div>

        <div className="pass">
          <header className="pass__head">
            <span className="badge badge--good">Sent to the kitchen</span>
            <span className="pass__table">
              Collect at <strong>{pickup ? timeLabel(pickup) : "the time you chose"}</strong>
            </span>
          </header>

          <div className="pass__tear" aria-hidden="true">
            <span />
            <span />
          </div>

          <footer className="pass__foot">
            <div>
              <span className="label">Show this at the counter</span>
              <p className="pass__code mono">{placed.order_no}</p>
            </div>
          </footer>

          {/* What was actually bought. A code on its own is a promise nobody
              can check; the counter and the customer should be reading the
              same list. */}
          {ordered.length > 0 ? (
            <div className="stack stack--tight">
              <span className="label">Your order</span>
              <ul className="lines">
                {ordered.map((line) => (
                  <li key={line.name}>
                    <span className="mono lines__qty">{line.qty}</span>
                    <span>{line.name}</span>
                    <Money value={line.total} className="push" />
                  </li>
                ))}
              </ul>
              <div className="row row--between total-row">
                <strong>Paid</strong>
                <strong>
                  <Money value={placed.total_fcfa} />
                </strong>
              </div>
            </div>
          ) : null}

          <p className="fine muted">
            We start cooking closer to the time so it is hot when you arrive. Your code and this list are also saved in
            Mine.
          </p>
        </div>

        <div className="row row--wrap">
          <LinkButton to="/mine" tone="primary" iconEnd="arrow-right">
            See my orders
          </LinkButton>
          <LinkButton to="/menu" tone="ghost">
            Order more
          </LinkButton>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="page section">
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Your basket</h1>
        </div>
        <EmptyState
          icon="basket"
          title="Nothing in it yet"
          action={
            <LinkButton to="/menu" tone="primary">
              Go to the menu
            </LinkButton>
          }
        >
          Add what you want from the menu, then pick a collection time here.
        </EmptyState>
      </div>
    );
  }

  async function submit() {
    setProblem(null);
    const digits = normalisePhone(phone);
    if (name.trim().length < 2) {
      setProblem("Enter the name we should call out.");
      return;
    }
    if (digits.length < 8) {
      setProblem("Enter a phone number we can reach you on.");
      return;
    }
    if (!pickup) {
      setProblem("Pick a collection time.");
      return;
    }

    const result = await place.run({
      name: name.trim(),
      phone: digits,
      pickup_time: pickup,
      items: lines.map((line) => ({ id: line.id, qty: line.qty })),
      note: note.trim() || undefined,
      promo_code: user && promo.trim() ? promo.trim() : undefined,
      gift_card_code: user && gift.trim() ? gift.trim() : undefined,
    });

    if (!result) {
      const failure = place.readError();
      setProblem(failure instanceof ApiError ? failure.message : "That order could not be sent.");
      return;
    }

    setOrdered(lines.map((line) => ({ name: line.item.name, qty: line.qty, total: line.lineTotal })));
    setPlaced(result);
    if (result.payment_required) {
      setPaying(true);
    } else {
      // Nothing left to charge: a promo or a gift card covered it, so the
      // order is settled and the items are genuinely spoken for.
      basket.clear();
      setCollected(true);
    }
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Your basket</h1>
      </div>

      <div className="checkout">
        <section className="stack stack--loose">
          {dropped > 0 ? (
            <Notice tone="warn">
              {dropped === 1 ? "An item" : `${dropped} items`} came off the menu since you added it, so it is no longer
              in the basket.
            </Notice>
          ) : null}

          <ul className="basket">
            {lines.map((line) => (
              <li key={line.id} className="basket__line">
                <Photo className="basket__photo" src={line.item.image_url} alt="" />

                <div className="basket__body">
                  <p className="basket__name">{line.item.name}</p>
                  <p className="fine faint">
                    <Money value={line.item.price_fcfa ?? 0} /> each
                  </p>
                </div>

                <div className="counter" role="group" aria-label={`Quantity, ${line.item.name}`}>
                  <button
                    type="button"
                    className="counter__btn"
                    onClick={() => basket.setQty(line.id, line.qty - 1)}
                    aria-label={`One fewer ${line.item.name}`}
                  >
                    <Icon name="minus" size={16} />
                  </button>
                  <span className="counter__value">{line.qty}</span>
                  <button
                    type="button"
                    className="counter__btn"
                    onClick={() => basket.setQty(line.id, line.qty + 1)}
                    disabled={line.qty >= 20}
                    aria-label={`One more ${line.item.name}`}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </div>

                <Money value={line.lineTotal} className="basket__total" />

                <IconButton
                  name="trash"
                  label={`Remove ${line.item.name}`}
                  size="sm"
                  onClick={() => basket.remove(line.id)}
                />
              </li>
            ))}
          </ul>

          <div className="stack" style={{ maxWidth: "32rem" }}>
            <h2 className="display display--lg">Who is collecting</h2>

            <TextField
              label="Name for the order"
              hint="What we call out at the counter."
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              required
            />
            <PhoneField
              label="Phone number"
              hint="We call this number if there is a question about your order."
              value={phone}
              onChange={setPhone}
              required
            />
            {/*
              The same picker the booking flow uses, not a native select. A
              select holding twenty eight times is a spinning wheel on a phone
              that you cannot scan, and it happily offered a slot that had
              already gone.
            */}
            <div className="field">
              <span className="field__label">Collection time</span>
              <span className="field__hint">
                Give us at least half an hour. Everything is grilled fresh when you order it.
              </span>
              <SlotPicker
                date={today}
                value={pickup}
                onChange={setPickup}
                leadMinutes={PICKUP_LEAD_MINUTES}
                emptyMessage={
                  <Notice tone="warn">
                    The kitchen has closed for today. Come back tomorrow, or call us to ask.
                  </Notice>
                }
              />
            </div>
            <TextAreaField
              label="Anything to add"
              placeholder="Optional. Extra pepper, no onions, that sort of thing."
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {user ? (
              <div className="grid--two">
                <TextField
                  label="Promo code"
                  placeholder="Optional"
                  value={promo}
                  autoCapitalize="characters"
                  onChange={(e) => setPromo(e.target.value)}
                />
                <TextField
                  label="Gift card"
                  placeholder="Optional"
                  value={gift}
                  autoCapitalize="characters"
                  onChange={(e) => setGift(e.target.value)}
                />
              </div>
            ) : (
              <p className="fine faint">
                <Link to="/signin" state={{ from: "/order" }}>
                  Sign in
                </Link>{" "}
                to use a promo code or a gift card, and to keep your orders in one place.
              </p>
            )}
          </div>
        </section>

        {/*
          On a phone this sits under the details and the real action is the bar
          fixed to the bottom of the screen. From 60rem it becomes a column
          that sticks beside the basket, where a long list cannot push it out
          of reach.
        */}
        <aside className="checkout__side">
          <div className="card stack">
            <div className="row row--between">
              <span className="muted">Subtotal</span>
              <Money value={subtotal} />
            </div>
            <div className="row row--between">
              <span className="muted">Takeaway</span>
              <span className="fine">Free</span>
            </div>
            <div className="row row--between total-row">
              <strong>To pay</strong>
              <strong className="checkout__total">
                <Money value={subtotal} />
              </strong>
            </div>
            <p className="fine faint">
              Paid with MTN Mobile Money. Any promo code or gift card comes off when the order is placed.
            </p>

            {problem ? <Notice tone="bad">{problem}</Notice> : null}

            <Button
              tone="primary"
              size="lg"
              block
              className="checkout__pay"
              busy={place.busy}
              onClick={submit}
              icon="wallet"
            >
              Pay Now
            </Button>
          </div>
        </aside>
      </div>

      {/*
        The bar. On a phone the total and the payment button follow the page
        down, so the amount and the way to settle it are always one thumb reach
        away no matter how long the basket runs.
      */}
      <div className="basket-bar basket-bar--phone">
        <div className="page row row--between">
          <span className="stack stack--tight">
            <span className="label">To pay</span>
            <strong className="basket-bar__total">{money(subtotal)} FCFA</strong>
          </span>
          <Button tone="primary" busy={place.busy} onClick={submit} icon="wallet">
            Pay Now
          </Button>
        </div>
      </div>

      {placed ? (
        <MomoDialog
          open={paying}
          amountFcfa={placed.total_fcfa}
          title="Pay for your order"
          what={`Order ${placed.order_no}, collect at ${pickup ? timeLabel(pickup) : ""}`.trim()}
          driver={{
            start: (input) =>
              api.orders.pay(placed.order_no, input.momoPhone).then((prompt) => ({
                reference: prompt.reference,
                amount_fcfa: prompt.amount_fcfa,
                expires_in_seconds: prompt.expires_in_seconds,
              })),
            poll: api.orders.paymentStatus,
            abandon: api.orders.abandonPayment,
          }}
          onClose={() => {
            setPaying(false);
            // The order exists on the server whether or not this payment
            // attempt succeeded, so the basket items are spoken for either
            // way. Clearing here, and not before the dialog opened, is what
            // stops a failed or abandoned payment from silently emptying the
            // basket with nothing to show for it.
            basket.clear();
            toast.say(`Order ${placed.order_no} is saved. Pay for it in Mine so the kitchen can start.`);
            setCollected(true);
          }}
          onPaid={() => {
            setPaying(false);
            basket.clear();
            setCollected(true);
          }}
        />
      ) : null}
    </div>
  );
}
