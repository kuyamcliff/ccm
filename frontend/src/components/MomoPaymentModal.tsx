import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import type { MomoStatus } from "../api";
import { useLanguage } from "../i18n/context";

interface Props {
  /** Reference returned by initiatePayment. Null closes the modal. */
  reference: string | null;
  amountFcfa: number;
  momoPhone: string;
  /** Seconds the customer has to approve, from the server. */
  windowSeconds: number;
  onSuccess: (status: MomoStatus) => void;
  onDismiss: () => void;
  /**
   * Bookings and takeaway orders track payment separately, so each supplies its
   * own polling pair. Defaults to the reservation endpoints.
   */
  pollStatus?: (reference: string) => Promise<MomoStatus>;
  cancelPayment?: (reference: string) => Promise<unknown>;
}

const POLL_INTERVAL_MS = 3000;

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Shown while the customer approves a Mobile Money charge on their handset.
 *
 * MTN pushes a PIN prompt when the payment is requested. Nothing is taken until
 * they enter their PIN, so this waits, counts the window down, and polls until
 * MoMo reports one way or the other.
 */
export function MomoPaymentModal({
  reference,
  amountFcfa,
  momoPhone,
  windowSeconds,
  onSuccess,
  onDismiss,
  pollStatus = api.paymentStatus,
  cancelPayment = api.cancelPayment,
}: Props) {
  const { t } = useLanguage();
  const tp = (key: string) => t("momoPayment", key);
  const tpRef = useRef(tp);
  tpRef.current = tp;

  const [phase, setPhase] = useState<"waiting" | "success" | "failed">("waiting");
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(windowSeconds);
  const [cancelling, setCancelling] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  // Guards against a poll that resolves after the modal has already closed.
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
    setPhase("waiting");
    setMessage(null);
    setRemaining(windowSeconds);
  }, [reference, windowSeconds]);

  /* Countdown. Driven off a deadline rather than by decrementing, so a tab that
     gets throttled in the background still shows the true time left. */
  useEffect(() => {
    if (!reference || phase !== "waiting") return;
    const deadline = Date.now() + remaining * 1000;
    const tick = setInterval(() => {
      setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(tick);
    // Restarting on every `remaining` change would reset the deadline, so this
    // deliberately only re-runs when the payment or phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, phase]);

  /* Poll MoMo through our server until the payment resolves. */
  useEffect(() => {
    if (!reference || phase !== "waiting") return;
    let stopped = false;

    async function poll() {
      try {
        const status = await pollStatus(reference!);
        if (stopped || settledRef.current) return;

        if (typeof status.expires_in_seconds === "number" && status.status === "pending") {
          setRemaining(status.expires_in_seconds);
        }

        if (status.status === "completed") {
          settledRef.current = true;
          setPhase("success");
          // Let the success state land before handing off to the receipt.
          setTimeout(() => onSuccess(status), 1200);
        } else if (status.status === "failed") {
          settledRef.current = true;
          setPhase("failed");
          setMessage(status.message ?? tpRef.current("errGenericFail"));
        }
      } catch (err) {
        // A dropped poll is not a failed payment; the next one will catch up.
        if (err instanceof ApiError && err.status === 404) {
          settledRef.current = true;
          setPhase("failed");
          setMessage(tpRef.current("errLostTrack"));
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [reference, phase, onSuccess, pollStatus]);

  const dismiss = useCallback(async () => {
    if (phase === "waiting" && reference) {
      // Release the promo or gift-card value the attempt was holding.
      setCancelling(true);
      try { await cancelPayment(reference); } catch { /* best effort */ }
      setCancelling(false);
    }
    onDismiss();
  }, [phase, reference, onDismiss, cancelPayment]);

  /* Scroll lock and focus. Escape is deliberately not wired to close while
     waiting, a stray keypress should not abandon a payment in flight. */
  useEffect(() => {
    if (!reference) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      boxRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    return () => {
      document.body.style.overflow = previous;
      cancelAnimationFrame(frame);
    };
  }, [reference]);

  if (!reference) return null;

  const expired = remaining === 0 && phase === "waiting";

  return (
    <div className="pay-backdrop" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <div className="pay-sheet" ref={boxRef}>
        {phase === "waiting" && (
          <>
            <div className={`pay-orbit${expired ? " stalled" : ""}`} aria-hidden="true">
              <span className="pay-orbit-ring" />
              <span className="pay-orbit-ring delay" />
              <span className="pay-orbit-core">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2.5" />
                  <path d="M11 18h2" />
                </svg>
              </span>
            </div>

            <h2 id="pay-title" className="pay-title">{tp("checkPhone")}</h2>

            <p className="pay-amount">
              {amountFcfa.toLocaleString()} <span>FCFA</span>
            </p>
            <p className="pay-target">{tp("chargedTo").replace("{phone}", momoPhone)}</p>

            {/* Each <li> holds exactly one child element: the list is a grid,
                and bare text runs beside an inline tag would each become their
                own grid item and break the row apart. */}
            <ol className="pay-steps">
              <li><span>{tp("step1")}</span></li>
              <li><span>{tp("step2")}</span></li>
              <li>
                <span>
                  {tp("step3Pre")} <strong className="mono">*126#</strong> {tp("step3Post")}
                </span>
              </li>
            </ol>

            <div className={`pay-timer${remaining <= 30 ? " urgent" : ""}`} role="timer" aria-live="off">
              {expired ? (
                <span>{tp("timeUp")}</span>
              ) : (
                <>
                  <span className="pay-timer-clock mono">{formatClock(remaining)}</span>
                  <span>{tp("left")}</span>
                </>
              )}
            </div>

            <p className="pay-reassure">{tp("reassure")}</p>

            <button type="button" className="btn btn-outline pay-cancel" onClick={dismiss} disabled={cancelling}>
              {cancelling ? tp("cancelling") : tp("cancelPayment")}
            </button>
          </>
        )}

        {phase === "success" && (
          <div className="pay-result" role="status">
            <span className="pay-tick" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12.5 5.5 5.5L20 7" />
              </svg>
            </span>
            <h2 className="pay-title">{tp("paymentSuccessful")}</h2>
            <p className="pay-result-body">
              {tp("receivedBringing").replace("{amount}", amountFcfa.toLocaleString())}
            </p>
          </div>
        )}

        {phase === "failed" && (
          <div className="pay-result" role="alert">
            <span className="pay-cross" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
            <h2 className="pay-title">{tp("paymentNotCompleted")}</h2>
            <p className="pay-result-body">{message}</p>
            <p className="pay-reassure">{tp("notCharged")}</p>
            <button type="button" className="btn btn-amber pay-cancel" onClick={onDismiss}>
              {tp("tryAgain")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
