import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../../api";
import type { VerifyResult } from "../../api";
import { QrScanner } from "../../components/QrScanner";
import { useLanguage } from "../../i18n/context";

/** Outcomes that mean "let them in". Everything else needs a human decision. */
const ADMIT = new Set(["valid"]);

const OUTCOME_COPY: Record<string, { labelKey: string; tone: "ok" | "warn" | "bad" }> = {
  valid:        { labelKey: "outcomeValid",       tone: "ok" },
  unpaid:       { labelKey: "outcomeUnpaid",       tone: "warn" },
  not_yet:      { labelKey: "outcomeNotYet",       tone: "warn" },
  expired:      { labelKey: "outcomeExpired",      tone: "warn" },
  already_used: { labelKey: "outcomeAlreadyUsed",  tone: "warn" },
  not_ready:    { labelKey: "outcomeNotReady",     tone: "warn" },
  cancelled:    { labelKey: "outcomeCancelled",    tone: "bad" },
  not_found:    { labelKey: "outcomeNotFound",     tone: "bad" },
  forged:       { labelKey: "outcomeForged",       tone: "bad" },
  unreadable:   { labelKey: "outcomeUnreadable",   tone: "bad" },
};

export default function AdminVerify() {
  const { t } = useLanguage();
  const tv = (key: string) => t("adminVerify", key);
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
      setCameraError(err instanceof Error ? err.message : tv("errVerify"));
    } finally {
      setBusy(false);
    }
  }, [tv]);

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      showResult(await api.verifyBooking({ code: code.trim() }));
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : tv("errVerify"));
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
      setCameraError(err instanceof Error ? err.message : tv("errCheckIn"));
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
      setCameraError(err instanceof Error ? err.message : tv("errCollect"));
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

  const copy = result ? OUTCOME_COPY[result.outcome] ?? { labelKey: "", tone: "bad" as const } : null;
  const copyLabel = copy ? (copy.labelKey ? tv(copy.labelKey) : result?.outcome ?? "") : "";

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{tv("title")}</h1>
          <p className="admin-page-sub">{tv("subtitle")}</p>
        </div>
        <button
          className={`btn btn-sm ${scannerOn ? "btn-outline" : "btn-primary"}`}
          onClick={() => { setScannerOn((v) => !v); setCameraError(""); }}
        >
          {scannerOn ? tv("stopCamera") : tv("scanWithCamera")}
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
            <label className="vfy-manual-label" htmlFor="vfy-code">{tv("reference")}</label>
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
                {busy ? "..." : tv("check")}
              </button>
            </div>
            <p className="hint">{tv("dashesOptional")}</p>
          </form>

          {cameraError && <p className="form-error" role="alert">{cameraError}</p>}
        </div>

        <div className="vfy-result-col">
          {!result && (
            <div className="vfy-placeholder">
              <p>{tv("nothingChecked")}</p>
            </div>
          )}

          {result && copy && (
            <div className={`vfy-result vfy-${copy.tone}`} role="status" aria-live="polite">
              <div className="vfy-result-head">
                <span className="vfy-badge">{copyLabel}</span>
                <span className="vfy-source">{result.source === "scan" ? tv("scanned") : tv("typed")}</span>
              </div>

              <p className="vfy-message">{result.message}</p>

              {result.booking && (
                <dl className="vfy-rows">
                  <div><dt>{tv("reference")}</dt><dd className="mono">{result.booking.code}</dd></div>
                  <div><dt>{tv("colGuest")}</dt><dd>{result.booking.guest_name}</dd></div>
                  <div><dt>{tv("colDate")}</dt><dd className="mono">{result.booking.date}</dd></div>
                  <div><dt>{tv("colTime")}</dt><dd className="mono">{result.booking.time}</dd></div>
                  <div><dt>{tv("colParty")}</dt><dd>{result.booking.party_size}</dd></div>
                  {result.booking.table_label && (
                    <div><dt>{tv("colTable")}</dt><dd>{result.booking.table_label}</dd></div>
                  )}
                  <div><dt>{tv("colPhone")}</dt><dd className="mono">{result.booking.phone}</dd></div>
                  <div>
                    <dt>{tv("colDeposit")}</dt>
                    <dd>
                      {result.booking.payment_status === "paid"
                        ? `${tv("paid")}${result.booking.amount_fcfa ? `, ${result.booking.amount_fcfa.toLocaleString()} FCFA` : ""}`
                        : tv("notPaid")}
                    </dd>
                  </div>
                  {result.booking.checked_in_at && (
                    <div>
                      <dt>{tv("checkedInLabel")}</dt>
                      <dd>
                        {new Date(result.booking.checked_in_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                        {result.booking.checked_in_by ? `, ${result.booking.checked_in_by}` : ""}
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
                    <div><dt>{tv("colCode")}</dt><dd className="mono">{result.order.code}</dd></div>
                    <div><dt>{tv("colCustomer")}</dt><dd>{result.order.customer_name}</dd></div>
                    <div><dt>{tv("colCollectAt")}</dt><dd className="mono">{result.order.pickup_time}</dd></div>
                    <div><dt>{tv("colPhone")}</dt><dd className="mono">{result.order.phone}</dd></div>
                    <div>
                      <dt>{tv("colPayment")}</dt>
                      <dd>
                        {result.order.payment_status === "paid"
                          ? `${tv("paid")}, ${result.order.total_fcfa.toLocaleString()} FCFA`
                          : tv("notPaid")}
                      </dd>
                    </div>
                    <div><dt>{tv("colKitchen")}</dt><dd>{result.order.status.replace("_", " ")}</dd></div>
                    {result.order.collected_at && (
                      <div>
                        <dt>{tv("colCollected")}</dt>
                        <dd>
                          {new Date(result.order.collected_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                          {result.order.collected_by ? `, ${result.order.collected_by}` : ""}
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
                    {busy ? tv("savingEllipsis") : tv("checkInParty")}
                  </button>
                )}
                {result.order && !result.order.collected_at && !collected
                  && result.outcome !== "cancelled" && result.outcome !== "unpaid" && (
                  <button className="btn btn-primary" onClick={collect} disabled={busy}>
                    {busy ? tv("saving") : tv("markCollected")}
                  </button>
                )}
                {collected && <p className="vfy-checked">{tv("handedOver")}</p>}
                {checkedIn && <p className="vfy-checked">{tv("checkedInDone")}</p>}
                <button className="btn btn-outline" onClick={clear}>
                  {scannerOn ? tv("scanNext") : tv("clear")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
