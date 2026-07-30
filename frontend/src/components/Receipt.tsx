import { useState } from "react";
import { api } from "../api";
import type { ReceiptData } from "../api";
import { useSettings } from "../settings";

function methodLabel(method: string): string {
  if (method === "mtn_momo") return "MTN Mobile Money";
  if (method === "orange_money") return "Orange Money";
  if (method === "free") return "Covered by promo / gift card";
  return method || "";
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

/**
 * The booking receipt, shown after payment and on the account page.
 *
 * Laid out like a real ticket: reference and status up top, the booking in the
 * middle, and a costed-out payment summary at the bottom so a guest can see
 * exactly what a promo or gift card took off.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const { address } = useSettings();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const paid = data.status === "paid";

  async function download() {
    if (!data.reservationId) return;
    setDownloading(true);
    setError("");
    try {
      const res = await api.downloadReceipt(data.reservationId);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.code}-receipt.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick so the download has taken hold of the blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the receipt.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className={`rcpt${paid ? " rcpt-paid" : ""}`}>
      <header className="rcpt-head">
        <div className="rcpt-brand">
          <p className="rcpt-brand-name">Cam Chop <em>Meat</em></p>
          <p className="rcpt-brand-sub">Charcoal grill · {address}</p>
        </div>
        <span className={`rcpt-status rcpt-status-${data.status}`}>
          {paid ? "Paid" : data.status === "failed" ? "Unpaid" : "Awaiting payment"}
        </span>
      </header>

      <div className="rcpt-code-band">
        <p className="rcpt-code-label">Booking reference</p>
        <p className="rcpt-code mono">{data.code}</p>
        <p className="rcpt-code-hint">Quote this at the door</p>
      </div>

      {/* Perforation between the ticket stub and the detail. */}
      <div className="rcpt-perf" aria-hidden="true"><span /><span /></div>

      <section className="rcpt-section">
        <h3 className="rcpt-section-title">Booking</h3>
        <dl className="rcpt-rows">
          <div><dt>Guest</dt><dd>{data.guestName}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(data.date)}</dd></div>
          <div><dt>Time</dt><dd className="mono">{data.time}</dd></div>
          <div><dt>Party</dt><dd>{data.partySize} {data.partySize === 1 ? "guest" : "guests"}</dd></div>
          {data.tableLabel && <div><dt>Table</dt><dd>{data.tableLabel}</dd></div>}
          {data.guestPhone && <div><dt>Phone</dt><dd className="mono">{data.guestPhone}</dd></div>}
        </dl>
        {data.note && <p className="rcpt-note">“{data.note}”</p>}
      </section>

      <section className="rcpt-section">
        <h3 className="rcpt-section-title">Payment</h3>
        <dl className="rcpt-money">
          <div>
            <dt>Table deposit</dt>
            <dd className="mono">{data.subtotalFcfa.toLocaleString()} FCFA</dd>
          </div>
          {data.discountFcfa > 0 && (
            <div className="rcpt-money-discount">
              <dt>Discount applied</dt>
              <dd className="mono">−{data.discountFcfa.toLocaleString()} FCFA</dd>
            </div>
          )}
          <div className="rcpt-money-total">
            <dt>{paid ? "Paid" : "Due"}</dt>
            <dd className="mono">{data.paidFcfa.toLocaleString()} FCFA</dd>
          </div>
        </dl>

        <dl className="rcpt-rows rcpt-rows-tight">
          <div><dt>Method</dt><dd>{methodLabel(data.method)}</dd></div>
          {data.momoPhone && <div><dt>Paid from</dt><dd className="mono">{data.momoPhone}</dd></div>}
          {data.reference && (
            <div><dt>Transaction</dt><dd className="mono rcpt-ref">{data.reference}</dd></div>
          )}
          {data.paidAt && (
            <div>
              <dt>Received</dt>
              <dd className="mono">
                {new Date(data.paidAt.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <footer className="rcpt-foot">
        <p className="rcpt-foot-line">
          The deposit comes off your bill. Arrive within 20 minutes of your slot or the table
          may be released.
        </p>
        <p className="rcpt-foot-address mono">{address}</p>

        {paid && data.reservationId != null && (
          <>
            <button className="btn btn-outline btn-sm rcpt-download" onClick={download} disabled={downloading}>
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </>
        )}
      </footer>
    </article>
  );
}
