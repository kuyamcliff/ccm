import { useCallback, useEffect, useRef, useState } from "react";
import type { MomoStatus } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { normalisePhone, phoneLabel } from "~/lib/format";
import { Button } from "~/ui/Button";
import { PhoneField, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Money } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { Sheet } from "~/ui/Sheet";

/**
 * Paying by MTN Mobile Money.
 *
 * The shape of this payment is unusual and the interface has to be honest
 * about it: pressing the button does not take money, it pushes a prompt to the
 * customer's handset, and nothing happens until they enter their PIN there. So
 * the sheet spends most of its life waiting, and its real job is to say plainly
 * what the customer should be looking at, which is their phone and not this
 * screen, and how long they have to do it.
 *
 * Used by both a table deposit and a takeaway order. The two differ only in
 * which pair of functions they hand in.
 */

export interface PaymentDriver {
  /** Pushes the prompt. Resolves with the reference to poll and the amount. */
  start: (input: {
    momoPhone: string;
    promoCode?: string;
    giftCardCode?: string;
    /** Identifies one attempt across every retry of it. */
    idempotencyKey: string;
  }) => Promise<{
    reference: string;
    amount_fcfa: number;
    /** Present when a discount covered the whole amount and nothing is owed. */
    zero_cost?: boolean;
    expires_in_seconds?: number;
  }>;
  poll: (reference: string) => Promise<MomoStatus>;
  abandon: (reference: string) => Promise<unknown>;
  /** Lets the caller offer discount fields. Bookings do; orders take them at
      the point the order is placed instead. */
  allowDiscounts?: boolean;
}

type Phase = "form" | "waiting" | "paid" | "failed";

interface Props {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  amountFcfa: number;
  title: string;
  what: string;
  driver: PaymentDriver;
}

const POLL_MS = 3000;

export function MomoDialog({ open, onClose, onPaid, amountFcfa, title, what, driver }: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");
  const [gift, setGift] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [charged, setCharged] = useState(amountFcfa);

  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; tick?: ReturnType<typeof setInterval> }>({});

  /* The current attempt's idempotency key. Cleared when an attempt finishes
     for good, so a guest who genuinely wants to try again after a decline gets
     a new charge rather than being handed back the declined one. */
  const attemptKey = useRef<string | null>(null);

  const stopTimers = useCallback(() => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = {};
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  // Reopening after a failure should start from a clean form, not from the
  // wreckage of the previous attempt.
  useEffect(() => {
    if (open) {
      setPhase("form");
      setError(null);
      setReference(null);
      setCharged(amountFcfa);
      attemptKey.current = null;
    } else {
      stopTimers();
    }
  }, [open, amountFcfa, stopTimers]);

  const settle = useCallback(
    (status: MomoStatus) => {
      stopTimers();
      if (status.status === "completed") {
        setPhase("paid");
        return;
      }
      setPhase("failed");
      setError(status.message ?? "The payment did not go through.");
    },
    [stopTimers]
  );

  const watch = useCallback(
    (ref: string, expiresIn: number) => {
      setReference(ref);
      setPhase("waiting");
      setSecondsLeft(expiresIn);

      timers.current.tick = setInterval(() => {
        setSecondsLeft((current) => {
          if (current <= 1) {
            stopTimers();
            setPhase("failed");
            setError("The prompt expired before it was approved. You can try again.");
            return 0;
          }
          return current - 1;
        });
      }, 1000);

      timers.current.poll = setInterval(() => {
        driver
          .poll(ref)
          .then((status) => {
            if (status.status !== "pending") settle(status);
          })
          .catch(() => {
            /* A dropped poll is not a failed payment. The next tick asks again,
               and the countdown still bounds the wait. */
          });
      }, POLL_MS);
    },
    [driver, settle, stopTimers]
  );

  async function begin() {
    const digits = normalisePhone(phone);
    if (digits.length !== 9 || !digits.startsWith("6")) {
      setError("Enter the 9 digit MTN number to charge, starting with 6.");
      return;
    }

    /*
     * One key per attempt, minted here and kept until the attempt resolves.
     *
     * The case this exists for: the request goes out, the money is taken, and
     * the reply never comes back over a weak connection. The guest sees an
     * error, taps Pay again, and without this the server has no way to tell
     * that from a request to pay a second time. Held in a ref rather than
     * state so pressing the button twice quickly cannot mint two keys between
     * renders.
     */
    if (!attemptKey.current) attemptKey.current = crypto.randomUUID();

    setBusy(true);
    setError(null);
    try {
      const result = await driver.start({
        momoPhone: digits,
        promoCode: promo.trim() || undefined,
        giftCardCode: gift.trim() || undefined,
        idempotencyKey: attemptKey.current,
      });
      setCharged(result.amount_fcfa);

      if (result.zero_cost || result.amount_fcfa === 0) {
        // A promo or a gift card covered it. Nothing was pushed to the handset.
        setPhase("paid");
        return;
      }
      watch(result.reference, result.expires_in_seconds ?? 90);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That could not be started. Try again.");
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
        /* The server expires it on its own soon enough. */
      }
    }
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={phase === "waiting" ? giveUp : phase === "paid" ? onPaid : onClose}
      busy={busy}
      title={phase === "paid" ? "Paid" : title}
      description={phase === "paid" ? undefined : what}
      footer={
        phase === "form" ? (
          <>
            <Button tone="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button tone="primary" busy={busy} onClick={begin} icon="wallet">
              Pay Now
            </Button>
          </>
        ) : phase === "waiting" ? (
          <Button tone="ghost" block onClick={giveUp}>
            Cancel this payment
          </Button>
        ) : phase === "paid" ? (
          <Button tone="primary" block onClick={onPaid} icon="check">
            Done
          </Button>
        ) : (
          <>
            <Button tone="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              tone="primary"
              onClick={() => {
                /* This attempt is over and was not paid, so the next one is a
                   new charge rather than a replay of the declined one. */
                attemptKey.current = null;
                setPhase("form");
              }}
              icon="refresh"
            >
              Try again
            </Button>
          </>
        )
      }
    >
      {phase === "form" ? (
        <>
          <div className="pay-total">
            <span className="label">Amount</span>
            <Money value={amountFcfa} className="pay-total__value" />
          </div>

          <PhoneField
            label="MTN Mobile Money number"
            hint="The prompt goes to this handset. It has to be an MTN number."
            value={phone}
            onChange={setPhone}
            required
          />

          {driver.allowDiscounts ? (
            <>
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
            </>
          ) : null}

          <p className="fine faint">
            Nothing leaves your account until you approve the prompt with your PIN.
          </p>

          {error ? <Notice tone="bad">{error}</Notice> : null}
        </>
      ) : phase === "waiting" ? (
        <div className="pay-wait">
          <span className="pay-wait__ring" aria-hidden="true">
            <Icon name="phone" size={26} />
          </span>
          <p className="pay-wait__lead">Check your phone</p>
          <p className="muted">
            A prompt for <Money value={charged} /> has gone to {phoneLabel(phone)}. Enter your Mobile Money PIN there to
            approve it.
          </p>
          <p className="pay-wait__clock mono" role="timer" aria-live="off">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <p className="fine faint">Keep this page open. It updates by itself once you approve.</p>
        </div>
      ) : phase === "paid" ? (
        <div className="pay-wait">
          <span className="pay-wait__ring pay-wait__ring--good" aria-hidden="true">
            <Icon name="check" size={26} />
          </span>
          <p className="pay-wait__lead">
            {charged > 0 ? (
              <>
                <Money value={charged} /> received
              </>
            ) : (
              "Covered in full"
            )}
          </p>
          <p className="muted">{what}</p>
        </div>
      ) : (
        <Notice tone="bad" title="Not paid">
          {error ?? "The payment did not complete."}
        </Notice>
      )}
    </Sheet>
  );
}
