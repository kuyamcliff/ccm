import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../api";
import type { VerifyResult } from "../../api";
import { QrScanner } from "../../components/QrScanner";

/** Outcomes that mean "let them in". Everything else needs a human decision. */
const ADMIT = new Set(["valid"]);

const OUTCOME_COPY: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  valid:        { label: "Valid",             tone: "ok" },
  unpaid:       { label: "Deposit unpaid",    tone: "warn" },
  not_yet:      { label: "Wrong day",         tone: "warn" },
  expired:      { label: "Expired",           tone: "warn" },
  already_used: { label: "Already used",      tone: "warn" },
  not_ready:    { label: "Not ready yet",     tone: "warn" },
  cancelled:    { label: "Cancelled",         tone: "bad" },
  not_found:    { label: "Not found",         tone: "bad" },
  forged:       { label: "Not genuine",       tone: "bad" },
  unreadable:   { label: "Unreadable",        tone: "bad" },
};

export default function AdminVerify() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scannerOn, setScannerOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [collected, setCollected] = useState(false);

  // Stops one QR in view from firing a request on every animation frame.
  const lastScanRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const showResult = (r: VerifyResult) => {
    setResult(r);
    setCheckedIn(false);
    setCollected(false);
    // Short vibration as tactile confirmation — staff are often not looking
    // at the screen while they aim the camera.
    if (navigator.vibrate) navigator.vibrate(ADMIT.has(r.outcome) ? 40 : [40, 60, 40]);
  };

  const handleDecode = useCallback(async (text: string) => {
    const now = Date.now();
    if (text === lastScanRef.current.text && now - lastScanRef.current.at < 4000) return;
    lastScanRef.current = { text, at: now };

    setBusy(true);
    try {
      showResult(await api.verifyBooking({ token: text }));
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      showResult(await api.verifyBooking({ code: code.trim() }));
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    if (!result?.booking) return;
    setBusy(true);
    try {
      await api.checkInBooking(result.booking.id);
      setCheckedIn(true);
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Could not check in.");
    } finally {
      setBusy(false);
    }
  }

  /** Hands over a paid takeaway order. */
  async function collect() {
    if (!result?.order) return;
    setBusy(true);
    try {
      await api.collectOrder(result.order.id);
      setCollected(true);
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Could not record that collection.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setResult(null);
    setCode("");
    setCheckedIn(false);
    setCollected(false);
    setCameraError("");
    lastScanRef.current = { text: "", at: 0 };
  }

  const copy = result ? OUTCOME_COPY[result.outcome] ?? { label: result.outcome, tone: "bad" as const } : null;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Verify</h1>
          <p className="admin-page-sub">Table bookings and collection orders. Scan the QR, or type the code.</p>
        </div>
        <button
          className={`btn btn-sm ${scannerOn ? "btn-outline" : "btn-primary"}`}
          onClick={() => { setScannerOn((v) => !v); setCameraError(""); }}
        >
          {scannerOn ? "Stop camera" : "Scan with camera"}
        </button>
      </div>

      <div className="vfy-layout">
        <div className="vfy-input-col">
          {scannerOn && (
            <QrScanner
              active={!result && !busy}
              onDecode={handleDecode}
              onError={setCameraError}
            />
          )}

          <form className="vfy-manual" onSubmit={submitCode}>
            <label className="vfy-manual-label" htmlFor="vfy-code">Reference</label>
            <div className="input-with-btn">
              <input
                id="vfy-code"
                className="form-input mono vfy-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CCM-XXXX-XXXX or TKA-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button className="btn btn-primary btn-sm" disabled={busy || !code.trim()}>
                {busy ? "…" : "Check"}
              </button>
            </div>
            <p className="hint">The dashes are optional.</p>
          </form>

          {cameraError && <p className="form-error" role="alert">{cameraError}</p>}
        </div>

        <div className="vfy-result-col">
          {!result && (
            <div className="vfy-placeholder">
              <p>Nothing checked yet.</p>
            </div>
          )}

          {result && copy && (
            <div className={`vfy-result vfy-${copy.tone}`} role="status" aria-live="polite">
              <div className="vfy-result-head">
                <span className="vfy-badge">{copy.label}</span>
                <span className="vfy-source">{result.source === "scan" ? "Scanned" : "Typed"}</span>
              </div>

              <p className="vfy-message">{result.message}</p>

              {result.booking && (
                <dl className="vfy-rows">
                  <div><dt>Reference</dt><dd className="mono">{result.booking.code}</dd></div>
                  <div><dt>Guest</dt><dd>{result.booking.guest_name}</dd></div>
                  <div><dt>Date</dt><dd className="mono">{result.booking.date}</dd></div>
                  <div><dt>Time</dt><dd className="mono">{result.booking.time}</dd></div>
                  <div><dt>Party</dt><dd>{result.booking.party_size}</dd></div>
                  {result.booking.table_label && (
                    <div><dt>Table</dt><dd>{result.booking.table_label}</dd></div>
                  )}
                  <div><dt>Phone</dt><dd className="mono">{result.booking.phone}</dd></div>
                  <div>
                    <dt>Deposit</dt>
                    <dd>
                      {result.booking.payment_status === "paid"
                        ? `Paid${result.booking.amount_fcfa ? ` · ${result.booking.amount_fcfa.toLocaleString()} FCFA` : ""}`
                        : "Not paid"}
                    </dd>
                  </div>
                  {result.booking.checked_in_at && (
                    <div>
                      <dt>Checked in</dt>
                      <dd>
                        {new Date(result.booking.checked_in_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                        {result.booking.checked_in_by ? ` · ${result.booking.checked_in_by}` : ""}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {/* Collection order. The item list is the point here: staff need
                  to know what to hand over, not just that the code is good. */}
              {result.order && (
                <>
                  <dl className="vfy-rows">
                    <div><dt>Code</dt><dd className="mono">{result.order.code}</dd></div>
                    <div><dt>Customer</dt><dd>{result.order.customer_name}</dd></div>
                    <div><dt>Collect at</dt><dd className="mono">{result.order.pickup_time}</dd></div>
                    <div><dt>Phone</dt><dd className="mono">{result.order.phone}</dd></div>
                    <div>
                      <dt>Payment</dt>
                      <dd>
                        {result.order.payment_status === "paid"
                          ? `Paid · ${result.order.total_fcfa.toLocaleString()} FCFA`
                          : "Not paid"}
                      </dd>
                    </div>
                    <div><dt>Kitchen</dt><dd>{result.order.status.replace("_", " ")}</dd></div>
                    {result.order.collected_at && (
                      <div>
                        <dt>Collected</dt>
                        <dd>
                          {new Date(result.order.collected_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                          {result.order.collected_by ? ` · ${result.order.collected_by}` : ""}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {result.order.items.length > 0 && (
                    <ul className="vfy-items">
                      {result.order.items.map((line, i) => (
                        <li key={i}>
                          <span className="vfy-item-qty mono">{line.qty}</span>
                          <span className="vfy-item-name">{line.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {result.order.note && <p className="vfy-note">“{result.order.note}”</p>}
                </>
              )}

              {result.booking?.note && <p className="vfy-note">“{result.booking.note}”</p>}

              <div className="vfy-actions">
                {result.booking && !result.booking.checked_in_at && !checkedIn && result.outcome !== "cancelled" && (
                  <button className="btn btn-primary" onClick={checkIn} disabled={busy}>
                    {busy ? "Saving…" : "Check in party"}
                  </button>
                )}
                {result.order && !result.order.collected_at && !collected
                  && result.outcome !== "cancelled" && result.outcome !== "unpaid" && (
                  <button className="btn btn-primary" onClick={collect} disabled={busy}>
                    {busy ? "Saving" : "Mark collected"}
                  </button>
                )}
                {collected && <p className="vfy-checked">Handed over.</p>}
                {checkedIn && <p className="vfy-checked">Checked in.</p>}
                <button className="btn btn-outline" onClick={clear}>
                  {scannerOn ? "Scan next" : "Clear"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
