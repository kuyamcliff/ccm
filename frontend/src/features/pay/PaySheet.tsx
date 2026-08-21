import { useCallback, useEffect, useRef, useState } from "react";
import type { MomoStatus } from "~/lib/api";
import { normalisePhone, phoneLabel } from "~/lib/format";
import { pointsOffer } from "~/lib/loyalty";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { say } from "~/lib/say";
import { api } from "~/lib/api";
import { Action, AnchorButton, Button } from "~/ui/Button";
import { PhoneField, Switch, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Money } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { Sheet } from "~/ui/Sheet";
import { usePress } from "~/ui/press";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { useCopy } from "~/state/locale";

/**
 * Taking a Mobile Money payment.
 *
 * Shared by the booking deposit and the takeaway checkout, which differ in which
 * endpoints they call and in nothing else, so the difference is a `driver`
 * rather than two copies of this screen.
 *
 * ── The three rules this file must not break ───────────────────────────────
 *
 * These are the money rules from `context.md`, and every one of them is load
 * bearing:
 *
 * **1. One idempotency key per attempt, resent unchanged on every retry.**
 * `attemptKey` is a ref, minted on the first press and kept. If the request
 * times out and the person presses again, the same key goes back, and the server
 * returns the original payment instead of charging a second time. The key is
 * cleared in exactly one place: the explicit "Try again" after a failure, which
 * is a genuinely new attempt. Minting it per call would make every retry a fresh
 * charge, which is the bug this pattern exists to prevent.
 *
 * **2. Nothing is abandoned silently.** Closing the sheet mid-payment calls
 * `driver.abandon`, which releases the promo use, the gift card value and the
 * points the attempt was holding.
 *
 * **3. The wallets behave differently and the screen says so.** MTN pushes a PIN
 * prompt to the handset and there is nothing to open, so we poll. Orange returns
 * a URL the customer has to visit. Showing the same "check your phone" for both
 * leaves Orange customers waiting for a prompt that is never coming.
 */

type WalletId = "mtn_momo" | "orange_money";
type Phase = "form" | "waiting" | "paid" | "failed";

export interface PaymentDriver {
  start: (input: {
    momoPhone: string;
    wallet: WalletId;
    promoCode?: string;
    giftCardCode?: string;
    usePoints?: boolean;
    idempotencyKey: string;
  }) => Promise<{
    reference: string;
    amount_fcfa: number;
    zero_cost?: boolean;
    expires_in_seconds?: number;
    payment_url?: string | null;
  }>;
  poll: (reference: string) => Promise<MomoStatus>;
  abandon: (reference: string) => Promise<unknown>;
  /** Whether promo codes, gift cards and points apply here. */
  allowDiscounts?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  amountFcfa: number;
  title: string;
  /** What is being paid for, in a few words: "Table for 4, Friday at 19:00". */
  what: string;
  driver: PaymentDriver;
}

const POLL_MS = 3000;

/**
 * Cameroonian wallet numbers, per network.
 *
 * MTN is any nine digits starting 6. Orange is narrower: 69, or 655 to 659.
 * Checking here rather than letting the server do it saves somebody a failed
 * payment attempt and the wait that goes with it.
 */
function validWalletPhone(wallet: WalletId, raw: string): boolean {
  const digits = normalisePhone(raw).replace(/^237/, "");
  if (digits.length !== 9) return false;
  return wallet === "mtn_momo" ? digits.startsWith("6") : /^(69\d{7}|65[5-9]\d{6})$/.test(digits);
}

export function PaySheet({ open, onClose, onPaid, amountFcfa, title, what, driver }: Props) {
  const { user } = useSession();
  const { siteConfig } = useVenue();
  const { c, fill } = useCopy();

  const [phase, setPhase] = useState<Phase>("form");
  const [wallet, setWallet] = useState<WalletId>(siteConfig.payments.mtn ? "mtn_momo" : "orange_money");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");
  const [gift, setGift] = useState("");
  const [usePoints, setUsePoints] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [charged, setCharged] = useState(amountFcfa);

  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; tick?: ReturnType<typeof setInterval> }>({});

  /** See rule 1 at the top of this file. Do not move this into `begin`. */
  const attemptKey = useRef<string | null>(null);

  const available = ([{ id: "mtn_momo" as const }, { id: "orange_money" as const }] as const).filter((item) =>
    item.id === "mtn_momo" ? siteConfig.payments.mtn : siteConfig.payments.orange
  );

  const canSpendPoints = Boolean(user) && Boolean(driver.allowDiscounts);
  const loyalty = useQuery(K.myLoyalty, () => api.me.loyalty(), { enabled: canSpendPoints && open });
  const offer = pointsOffer(loyalty.data ?? null, amountFcfa);

  const stopTimers = useCallback(() => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = {};
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  /* A wallet the owner has just switched off must not stay selected. */
  useEffect(() => {
    const first = available[0];
    if (first && !available.some((item) => item.id === wallet)) setWallet(first.id);
  }, [available, wallet]);

  useEffect(() => {
    if (!open) {
      stopTimers();
      return;
    }
    setPhase("form");
    setProblem(null);
    setReference(null);
    setPaymentUrl(null);
    setCharged(amountFcfa);
    attemptKey.current = null;
  }, [open, amountFcfa, stopTimers]);

  const settle = useCallback(
    (status: MomoStatus) => {
      stopTimers();
      if (status.status === "completed") {
        setPhase("paid");
        return;
      }
      setPhase("failed");
      /* The wallet's own reason, when it gave one: "insufficient balance" is
         genuinely useful and is not our server talking about itself. */
      setProblem(status.message ?? c.pay.failed);
    },
    [c.pay.failed, stopTimers]
  );

  const watch = useCallback(
    (ref: string, expiresIn: number) => {
      setReference(ref);
      setPhase("waiting");
      setSecondsLeft(expiresIn);

      timers.current.tick = setInterval(() => {
        setSecondsLeft((current) => {
          if (current > 1) return current - 1;
          stopTimers();
          setPhase("failed");
          setProblem("The payment window closed before it was approved. You can start again.");
          return 0;
        });
      }, 1000);

      timers.current.poll = setInterval(() => {
        driver
          .poll(ref)
          .then((status) => {
            if (status.status !== "pending") settle(status);
          })
          .catch(() => {
            /* A dropped poll is not a failed payment. The next one in three
               seconds will ask again, and the expiry clock is the backstop. */
          });
      }, POLL_MS);
    },
    [driver, settle, stopTimers]
  );

  async function begin() {
    if (available.length === 0) {
      setProblem("Mobile Money is not available right now. Give us a call and we will sort it out.");
      return;
    }
    if (!validWalletPhone(wallet, phone)) {
      setProblem(wallet === "orange_money" ? c.pay.orangeHint : c.pay.mtnHint);
      return;
    }

    const idempotencyKey = attemptKey.current ?? crypto.randomUUID();
    attemptKey.current = idempotencyKey;

    setBusy(true);
    setProblem(null);
    try {
      const result = await driver.start({
        momoPhone: normalisePhone(phone),
        wallet,
        promoCode: promo.trim() || undefined,
        giftCardCode: gift.trim() || undefined,
        usePoints: Boolean(offer) && usePoints,
        idempotencyKey,
      });

      setCharged(result.amount_fcfa);

      /* Discounts covered the whole thing. There is no wallet call to wait for. */
      if (result.zero_cost || result.amount_fcfa === 0) {
        setPhase("paid");
        return;
      }

      setPaymentUrl(result.payment_url ?? null);
      watch(result.reference, result.expires_in_seconds ?? 90);
    } catch (error) {
      setProblem(say(error, "pay"));
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    stopTimers();
    if (reference) {
      try {
        await driver.abandon(reference);
      } catch {
        /* Best effort. The server expires an abandoned attempt on its own. */
      }
    }
    onClose();
  }

  const payable = Math.max(0, amountFcfa - (offer && usePoints ? offer.value : 0));

  return (
    <Sheet
      open={open}
      onClose={phase === "waiting" ? giveUp : phase === "paid" ? onPaid : onClose}
      title={phase === "paid" ? c.pay.done : title}
      /* Mid-payment the sheet cannot be dragged away or dismissed by tapping the
         scrim: losing this screen while a prompt is on somebody's handset means
         losing the reference that tracks it. */
      sticky={phase === "waiting"}
      footer={
        phase === "form" ? (
          <>
            <Button tone="quiet" onClick={onClose}>
              {c.common.cancel}
            </Button>
            <Action
              tone="primary"
              icon="wallet"
              pending={busy}
              pendingLabel={c.pending.paying}
              disabled={available.length === 0}
              onClick={() => void begin()}
            >
              {c.pay.send}
            </Action>
          </>
        ) : phase === "waiting" ? (
          <div className="stack stack--tight full">
            {wallet === "orange_money" && paymentUrl ? (
              <AnchorButton href={paymentUrl} tone="primary" block newTab icon="external">
                {c.pay.openOrange}
              </AnchorButton>
            ) : null}
            <Button tone="quiet" block onClick={() => void giveUp()}>
              {c.common.cancel}
            </Button>
          </div>
        ) : phase === "paid" ? (
          <Button tone="primary" block icon="check" onClick={onPaid}>
            {c.common.done}
          </Button>
        ) : (
          <>
            <Button tone="quiet" onClick={onClose}>
              {c.common.close}
            </Button>
            <Button
              tone="primary"
              icon="refresh"
              onClick={() => {
                /* A genuinely new attempt, so a new key. This is the only place
                   the key is cleared. */
                attemptKey.current = null;
                setPhase("form");
                setProblem(null);
              }}
            >
              {c.pay.tryAgain}
            </Button>
          </>
        )
      }
    >
      {phase === "form" ? (
        <div className="stack">
          {available.length === 0 ? (
            <Notice tone="warn" title="Mobile Money is off">
              Neither MTN nor Orange Money is switched on right now. Give the restaurant a call.
            </Notice>
          ) : (
            <>
              <div className="pay__total">
                <span className="label">{c.pay.amount}</span>
                <Money value={payable} size="big" />
                <span className="fine faint">{what}</span>
              </div>

              {/*
                * MTN and Orange, side by side, before anything else.
                *
                * Shown whenever there is more than one, which in practice is
                * always: choosing who you are paying with is the first thing
                * anybody does at a till, and it used to be buried below the
                * amount with a sentence under each explaining how mobile money
                * works. Everybody here already knows how mobile money works.
                * The logo and the name are the whole choice.
                */}
              {available.length > 1 ? (
                <div className="wallets" role="radiogroup" aria-label={c.pay.wallet}>
                  {available.map((item) => (
                    <WalletChoice
                      key={item.id}
                      id={item.id}
                      selected={wallet === item.id}
                      onSelect={() => {
                        setWallet(item.id);
                        setProblem(null);
                      }}
                      label={item.id === "mtn_momo" ? c.order.payMtn : c.order.payOrange}
                    />
                  ))}
                </div>
              ) : null}

              <PhoneField
                label={c.pay.momoPhone}
                value={phone}
                onChange={(value) => {
                  setPhone(value);
                  setProblem(null);
                }}
                required
              />

              {offer ? (
                <Switch
                  checked={usePoints}
                  onChange={setUsePoints}
                  label={fill(c.order.pointsWorth, { n: offer.points, value: offer.value.toLocaleString("en-US") })}
                  hint={c.order.pointsUse}
                />
              ) : null}

              {driver.allowDiscounts ? (
                <>
                  <TextField
                    label={c.order.promo}
                    placeholder="Optional"
                    value={promo}
                    autoCapitalize="characters"
                    onChange={(event) => setPromo(event.target.value)}
                  />
                  <TextField
                    label={c.order.giftCard}
                    placeholder="Optional"
                    value={gift}
                    autoCapitalize="characters"
                    onChange={(event) => setGift(event.target.value)}
                  />
                </>
              ) : null}

              {problem ? <Notice tone="bad">{problem}</Notice> : null}
            </>
          )}
        </div>
      ) : phase === "waiting" ? (
        <div className="pay__wait">
          <span className="pay__ring" aria-hidden="true">
            <Icon name="phone" size={24} />
          </span>
          <p className="title">{wallet === "orange_money" ? c.pay.openOrange : c.pay.checkPhone}</p>
          <p className="lead center">
            {wallet === "orange_money" ? (
              c.pay.openOrangeBody
            ) : (
              <>
                A prompt for <Money value={charged} size="fine" /> has gone to {phoneLabel(phone)}. Enter your Mobile
                Money PIN there to approve it.
              </>
            )}
          </p>
          <p
            className="pay__clock"
            role="timer"
            aria-label={fill(c.pay.expiresIn, {
              time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`,
            })}
          >
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <p className="fine faint center">
            Keep this page open. It updates by itself the moment the payment lands.
          </p>
        </div>
      ) : phase === "paid" ? (
        <div className="pay__wait">
          <span className="pay__ring pay__ring--good" aria-hidden="true">
            <Icon name="check" size={24} />
          </span>
          <p className="title">{charged > 0 ? c.pay.done : c.pay.nothingToPay}</p>
          <p className="lead center">{what}</p>
        </div>
      ) : (
        <Notice tone="bad" title={c.pay.failed}>
          {problem ?? c.pay.failedBody}
        </Notice>
      )}
    </Sheet>
  );
}

/**
 * One wallet, as a thing to tap.
 *
 * The name and a tick, and nothing under it. The explanatory line that used to
 * sit here told a Cameroonian customer that mobile money sends a PIN prompt to
 * their phone, which is a sentence about something they do several times a week.
 */
function WalletChoice({
  id,
  selected,
  onSelect,
  label,
}: {
  id: WalletId;
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  const press = usePress();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="wallet"
      data-wallet={id}
      data-on={selected ? "true" : undefined}
      onClick={onSelect}
      {...press.pressProps}
    >
      <span className="wallet__mark" aria-hidden="true">
        {selected ? <Icon name="check" size={13} /> : null}
      </span>
      <span className="wallet__text head">{label}</span>
    </button>
  );
}
