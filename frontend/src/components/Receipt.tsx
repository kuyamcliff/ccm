import { useState } from "react";
import { api } from "../api";
import type { ReceiptData } from "../api";
import { useSettings } from "../settings";
import { useLanguage } from "../i18n/context";
import type { Lang } from "../i18n/translations";

function methodLabel(method: string, tr: (key: string) => string): string {
  if (method === "mtn_momo") return tr("methodMomo");
  if (method === "orange_money") return tr("methodOrange");
  if (method === "free") return tr("methodFree");
  return method || "";
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
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
  const { lang, t } = useLanguage();
  const tr = (key: string) => t("receipt", key);
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
      setError(err instanceof Error ? err.message : tr("errDownload"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className={`rcpt${paid ? " rcpt-paid" : ""}`}>
      <header className="rcpt-head">
        <div className="rcpt-brand">
          <p className="rcpt-brand-name">Cam Chop <em>Meat</em></p>
          <p className="rcpt-brand-sub">{tr("charcoalGrill")} · {address}</p>
        </div>
        <span className={`rcpt-status rcpt-status-${data.status}`}>
          {paid ? tr("statusPaid") : data.status === "failed" ? tr("statusUnpaid") : tr("statusAwaiting")}
        </span>
      </header>

      <div className="rcpt-code-band">
        <p className="rcpt-code-label">{tr("bookingRef")}</p>
        <p className="rcpt-code mono">{data.code}</p>
        <p className="rcpt-code-hint">{tr("quoteAtDoor")}</p>
      </div>

      {/* Perforation between the ticket stub and the detail. */}
      <div className="rcpt-perf" aria-hidden="true"><span /><span /></div>

      <section className="rcpt-section">
        <h3 className="rcpt-section-title">{tr("booking")}</h3>
        <dl className="rcpt-rows">
          <div><dt>{tr("guest")}</dt><dd>{data.guestName}</dd></div>
          <div><dt>{tr("date")}</dt><dd>{formatDate(data.date, lang)}</dd></div>
          <div><dt>{tr("time")}</dt><dd className="mono">{data.time}</dd></div>
          <div><dt>{tr("party")}</dt><dd>{data.partySize} {data.partySize === 1 ? tr("guestSingular") : tr("guestPlural")}</dd></div>
          {data.tableLabel && <div><dt>{tr("table")}</dt><dd>{data.tableLabel}</dd></div>}
          {data.guestPhone && <div><dt>{tr("phone")}</dt><dd className="mono">{data.guestPhone}</dd></div>}
        </dl>
        {data.note && <p className="rcpt-note">“{data.note}”</p>}
      </section>

      <section className="rcpt-section">
        <h3 className="rcpt-section-title">{tr("payment")}</h3>
        <dl className="rcpt-money">
          <div>
            <dt>{tr("tableDeposit")}</dt>
            <dd className="mono">{data.subtotalFcfa.toLocaleString()} FCFA</dd>
          </div>
          {data.discountFcfa > 0 && (
            <div className="rcpt-money-discount">
              <dt>{tr("discountApplied")}</dt>
              <dd className="mono">−{data.discountFcfa.toLocaleString()} FCFA</dd>
            </div>
          )}
          <div className="rcpt-money-total">
            <dt>{paid ? tr("paidLabel") : tr("dueLabel")}</dt>
            <dd className="mono">{data.paidFcfa.toLocaleString()} FCFA</dd>
          </div>
        </dl>

        <dl className="rcpt-rows rcpt-rows-tight">
          <div><dt>{tr("method")}</dt><dd>{methodLabel(data.method, tr)}</dd></div>
          {data.momoPhone && <div><dt>{tr("paidFrom")}</dt><dd className="mono">{data.momoPhone}</dd></div>}
          {data.reference && (
            <div><dt>{tr("transaction")}</dt><dd className="mono rcpt-ref">{data.reference}</dd></div>
          )}
          {data.paidAt && (
            <div>
              <dt>{tr("received")}</dt>
              <dd className="mono">
                {new Date(data.paidAt.replace(" ", "T") + "Z").toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <footer className="rcpt-foot">
        <p className="rcpt-foot-line">{tr("footLine")}</p>
        <p className="rcpt-foot-address mono">{address}</p>

        {paid && data.reservationId != null && (
          <>
            <button className="btn btn-outline btn-sm rcpt-download" onClick={download} disabled={downloading}>
              {downloading ? tr("preparing") : tr("download")}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </>
        )}
      </footer>
    </article>
  );
}
