import { useState } from "react";
import { Link } from "react-router-dom";
import { api, SLOTS } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { normalisePhone, timeLabel } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, IconButton, LinkButton } from "~/ui/Button";
import { PhoneField, SelectField, TextAreaField, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, SkeletonCards } from "~/ui/Feedback";
import { useBasket } from "~/state/basket";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { MomoDialog } from "~/features/pay/MomoDialog";

/**
 * The basket and checkout for takeaway orders.
 *
 * Prices shown here are only ever a preview: the server prices the order again
 * from the menu when it is placed, which is what stops a stale basket or an
 * edited request from buying a 4,500 FCFA chicken for 100. When the two
 * disagree, the server wins and the difference is shown before payment.
 */

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
  const [pickup, setPickup] = useState(SLOTS[8] ?? "13:00");
  const [note, setNote] = useState("");
  const [promo, setPromo] = useState("");
  const [gift, setGift] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const [placed, setPlaced] = useState<Placed | null>(null);
  const [paying, setPaying] = useState(false);
  const [collected, setCollected] = useState(false);

  const place = useAction(api.orders.place);

  if (menu.loading) return <div className="page section"><SkeletonCards count={2} height="8rem" /></div>;
  if (menu.error) return <div className="page section"><ErrorState error={menu.error} onRetry={menu.reload} /></div>;

  const { lines, subtotal, dropped } = basket.price(menu.data ?? []);

  /* Paid, or nothing left to pay. This is the code the counter asks for. */
  if (collected && placed) {
    return (
      <div className="page section stack stack--loose" style={{ maxWidth: "34rem" }}>
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">Order in</h1>
        </div>
        <div className="card stack">
          <span className="label">Show this at the counter</span>
          <p className="pass__code mono">{placed.order_no}</p>
          <p className="muted">
            Collect from {timeLabel(pickup)}. We start cooking closer to the time so it is hot when you arrive.
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
          Add what you want from the menu and pick a collection time here.
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

    basket.clear();
    setPlaced(result);
    if (result.payment_required) setPaying(true);
    else setCollected(true);
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Your basket</h1>
      </div>

      <div className="checkout">
        <section className="stack">
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
            <TextField
              label="Name for the order"
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              required
            />
            <PhoneField label="Phone number" value={phone} onChange={setPhone} required />
            <SelectField
              label="Pickup time"
              hint="Give us at least half an hour. Everything is cooked fresh when you order it."
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            >
              {SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </SelectField>
            <TextAreaField
              label="Anything to add"
              placeholder="Optional. Extra pepper, no onions, that sort of thing."
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {user ? (
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
                to use a promo code or gift card, and to keep your orders in one place.
              </p>
            )}
          </div>
        </section>

        {/* On a phone this sits under the basket; from 60rem it sticks to the
            side, where a long basket cannot push it off the screen. */}
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
            <hr />
            <div className="row row--between">
              <strong>To pay</strong>
              <strong className="checkout__total">
                <Money value={subtotal} />
              </strong>
            </div>
            <p className="fine faint">
              Paid ahead by MTN Mobile Money. Any promo or gift card is applied when the order is placed.
            </p>

            {problem ? <Notice tone="bad">{problem}</Notice> : null}

            <Button tone="primary" size="lg" block busy={place.busy} onClick={submit}>
              Place the order
            </Button>
          </div>
        </aside>
      </div>

      {placed ? (
        <MomoDialog
          open={paying}
          amountFcfa={placed.total_fcfa}
          title="Pay for your order"
          what={`Order ${placed.order_no}, collect at ${timeLabel(pickup)}`}
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
            toast.say(`Order ${placed.order_no} is saved. Pay for it in Mine so the kitchen can start.`);
            setCollected(true);
          }}
          onPaid={() => {
            setPaying(false);
            setCollected(true);
          }}
        />
      ) : null}
    </div>
  );
}
