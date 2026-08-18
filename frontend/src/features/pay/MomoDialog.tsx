import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { MomoStatus } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { phoneLabel, normalisePhone } from "~/lib/format";
import { pointsOffer } from "~/lib/loyalty";
import { useResource } from "~/lib/useResource";
import { useSession } from "~/state/session";
import { useVenue } from "~/state/venue";
import { Button } from "~/ui/Button";
import { PhoneField, Switch, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Money } from "~/ui/Bits";
import { Notice } from "~/ui/Feedback";
import { Sheet } from "~/ui/Sheet";

type WalletId = "mtn_momo" | "orange_money";
type Phase = "form" | "waiting" | "paid" | "failed";

export interface PaymentDriver {
  start: (input: { momoPhone: string; wallet: WalletId; promoCode?: string; giftCardCode?: string; usePoints?: boolean; idempotencyKey: string }) => Promise<{
    reference: string; amount_fcfa: number; zero_cost?: boolean; expires_in_seconds?: number; payment_url?: string | null;
  }>;
  poll: (reference: string) => Promise<MomoStatus>;
  abandon: (reference: string) => Promise<unknown>;
  allowDiscounts?: boolean;
}

interface Props { open: boolean; onClose: () => void; onPaid: () => void; amountFcfa: number; title: string; what: string; driver: PaymentDriver; }
const POLL_MS = 3000;
const wallets: { id: WalletId; label: string; hint: string }[] = [
  { id: "mtn_momo", label: "MTN Mobile Money", hint: "Approve the prompt on your MTN handset." },
  { id: "orange_money", label: "Orange Money", hint: "Continue to Orange Money to approve the payment." },
];
function validWalletPhone(wallet: WalletId, raw: string): boolean {
  const digits = normalisePhone(raw).replace(/^237/, "");
  if (digits.length !== 9) return false;
  return wallet === "mtn_momo" ? digits.startsWith("6") : /^(69\d{7}|65[5-9]\d{6})$/.test(digits);
}

export function MomoDialog({ open, onClose, onPaid, amountFcfa, title, what, driver }: Props) {
  const { user } = useSession();
  const { siteConfig } = useVenue();
  const [phase, setPhase] = useState<Phase>("form");
  const [wallet, setWallet] = useState<WalletId>(siteConfig.payments.mtn ? "mtn_momo" : "orange_money");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");
  const [gift, setGift] = useState("");
  const [usePoints, setUsePoints] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [charged, setCharged] = useState(amountFcfa);
  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; tick?: ReturnType<typeof setInterval> }>({});
  const attemptKey = useRef<string | null>(null);

  const available = wallets.filter((item) => siteConfig.payments[item.id === "mtn_momo" ? "mtn" : "orange"]);
  const canSpendPoints = Boolean(user) && Boolean(driver.allowDiscounts);
  const loyalty = useResource(() => (canSpendPoints && open ? api.me.loyalty() : Promise.resolve(null)), [canSpendPoints, open]);
  const offer = pointsOffer(loyalty.data, amountFcfa);

  useEffect(() => {
    if (available.length && !available.some((item) => item.id === wallet)) setWallet(available[0].id);
  }, [available.length, siteConfig.payments.mtn, siteConfig.payments.orange, wallet]);

  const stopTimers = useCallback(() => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.tick) clearInterval(timers.current.tick);
    timers.current = {};
  }, []);
  useEffect(() => stopTimers, [stopTimers]);

  useEffect(() => {
    if (open) {
      setPhase("form"); setError(null); setReference(null); setPaymentUrl(null); setCharged(amountFcfa);
      setWallet(siteConfig.payments.mtn ? "mtn_momo" : "orange_money"); attemptKey.current = null;
    } else stopTimers();
  }, [open, amountFcfa, siteConfig.payments.mtn, siteConfig.payments.orange, stopTimers]);

  const settle = useCallback((status: MomoStatus) => {
    stopTimers();
    if (status.status === "completed") { setPhase("paid"); return; }
    setPhase("failed"); setError(status.message ?? "The payment did not go through.");
  }, [stopTimers]);

  const watch = useCallback((ref: string, expiresIn: number) => {
    setReference(ref); setPhase("waiting"); setSecondsLeft(expiresIn);
    timers.current.tick = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) { stopTimers(); setPhase("failed"); setError("The payment window expired before it was approved. You can start a new attempt."); return 0; }
        return current - 1;
      });
    }, 1000);
    timers.current.poll = setInterval(() => {
      driver.poll(ref).then((status) => { if (status.status !== "pending") settle(status); }).catch(() => {});
    }, POLL_MS);
  }, [driver, settle, stopTimers]);

  async function begin() {
    if (!validWalletPhone(wallet, phone)) {
      setError(wallet === "orange_money" ? "Enter a valid Orange Money Cameroon number, starting with 69 or 655–659." : "Enter a valid 9 digit MTN number starting with 6.");
      return;
    }
    if (!attemptKey.current) attemptKey.current = crypto.randomUUID();
    setBusy(true); setError(null);
    try {
      const result = await driver.start({ momoPhone: normalisePhone(phone), wallet, promoCode: promo.trim() || undefined, giftCardCode: gift.trim() || undefined, usePoints: Boolean(offer) && usePoints, idempotencyKey: attemptKey.current });
      setCharged(result.amount_fcfa);
      if (result.zero_cost || result.amount_fcfa === 0) { setPhase("paid"); return; }
      setPaymentUrl(result.payment_url ?? null); watch(result.reference, result.expires_in_seconds ?? 90);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That could not be started. Try again.");
    } finally { setBusy(false); }
  }

  async function giveUp() {
    stopTimers();
    if (reference) { try { await driver.abandon(reference); } catch {} }
    onClose();
  }

  return (
    <Sheet open={open} onClose={phase === "waiting" ? giveUp : phase === "paid" ? onPaid : onClose} busy={busy} title={phase === "paid" ? "Paid" : title} description={phase === "paid" ? undefined : what}
      footer={
        phase === "form" ? <><Button tone="ghost" onClick={onClose}>Not now</Button><Button tone="primary" busy={busy} onClick={() => void begin()} icon="wallet">Pay {Math.max(0, amountFcfa - (offer && usePoints ? offer.value : 0)).toLocaleString()} FCFA</Button></>
        : phase === "waiting" ? <div className="stack stack--tight" style={{ width: "100%" }}>{wallet === "orange_money" && paymentUrl ? <a className="btn btn--primary btn--block" href={paymentUrl} target="_blank" rel="noopener noreferrer">Continue to Orange Money</a> : null}<Button tone="ghost" block onClick={() => void giveUp()}>Cancel this payment</Button></div>
        : phase === "paid" ? <Button tone="primary" block onClick={onPaid} icon="check">Done</Button>
        : <><Button tone="ghost" onClick={onClose}>Close</Button><Button tone="primary" onClick={() => { attemptKey.current = null; setPhase("form"); }} icon="refresh">Try again</Button></>
      }
    >
      {phase === "form" ? (
        <div className="stack stack--loose">
          {available.length === 0 ? <Notice tone="warn" title="Mobile Money is unavailable">Neither MTN Mobile Money nor Orange Money is enabled right now. Please contact the restaurant.</Notice> : <>
            <div className="pay-total"><span className="label">Amount</span><Money value={Math.max(0, amountFcfa - (offer && usePoints ? offer.value : 0))} className="pay-total__value" /></div>
            <div className="stack stack--tight"><span className="field__label">Choose how to pay</span><div className="wallet-choices" role="radiogroup" aria-label="Payment method">
              {available.map((item) => <button type="button" key={item.id} className={`wallet-choice${wallet === item.id ? " wallet-choice--active" : ""}`} role="radio" aria-checked={wallet === item.id} onClick={() => { setWallet(item.id); setError(null); }}><span className="wallet-choice__mark">{wallet === item.id ? "✓" : ""}</span><span className="wallet-choice__copy"><strong>{item.label}</strong><span>{item.hint}</span></span></button>)}
            </div></div>
            <PhoneField label={`${wallet === "orange_money" ? "Orange Money" : "MTN Mobile Money"} number`} hint={wallet === "orange_money" ? "Use your Orange Cameroon number." : "The prompt goes to this MTN handset."} value={phone} onChange={(value) => { setPhone(value); setError(null); }} required />
            {offer ? <Switch checked={usePoints} onChange={setUsePoints} label={<>Use {offer.points} points, <Money value={offer.value} /> off</>} /> : null}
            {driver.allowDiscounts ? <><TextField label="Promo code" placeholder="Optional" value={promo} autoCapitalize="characters" onChange={(e) => setPromo(e.target.value)} /><TextField label="Gift card" placeholder="Optional" value={gift} autoCapitalize="characters" onChange={(e) => setGift(e.target.value)} /></> : null}
            <p className="fine faint">{wallet === "orange_money" ? "Orange Money opens in a new tab. Your booking/order stays safe while you approve the payment." : "Nothing leaves your MTN account until you approve the prompt with your PIN."}</p>
            {error ? <Notice tone="bad">{error}</Notice> : null}
          </>}
        </div>
      ) : phase === "waiting" ? <div className="pay-wait"><span className="pay-wait__ring" aria-hidden="true"><Icon name="phone" size={26} /></span><p className="pay-wait__lead">{wallet === "orange_money" ? "Continue your Orange Money payment" : "Check your phone"}</p><p className="muted">{wallet === "orange_money" ? "Use the Orange Money page to approve the payment, then come back here. The status updates automatically." : <>A prompt for <Money value={charged} /> has gone to {phoneLabel(phone)}. Enter your Mobile Money PIN there to approve it.</>}</p><p className="pay-wait__clock mono" role="timer" aria-live="off">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p><p className="fine faint">Keep this page open. It updates by itself once the payment is confirmed.</p></div>
      : phase === "paid" ? <div className="pay-wait"><span className="pay-wait__ring pay-wait__ring--good" aria-hidden="true"><Icon name="check" size={26} /></span><p className="pay-wait__lead">{charged > 0 ? <><Money value={charged} /> received</> : "Covered in full"}</p><p className="muted">{what}</p></div>
      : <Notice tone="bad" title="Not paid">{error ?? "The payment did not complete."}</Notice>}
    </Sheet>
  );
}
