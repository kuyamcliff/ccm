import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";
import type { ReceiptData } from "../api";
import { Receipt } from "../components/Receipt";
import { useAuth } from "../auth";
import { useT } from "../i18n/context";

/**
 * Landing page for a completed booking. The payment itself is confirmed inside
 * the payment modal, so by the time anyone gets here the charge has settled,
 * this just fetches and shows the receipt.
 */
export function ReserveConfirmed() {
  const t = useT("confirmed");
  const [searchParams] = useSearchParams();
  const { loading: authLoading } = useAuth();

  const reference = searchParams.get("reference") ?? "";

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!reference) {
      setError(t("errNoRef"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    api
      .paymentReceipt(reference)
      .then((r) => { if (!cancelled) setReceipt(r.receipt); })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? t("errNotFound")
            : err instanceof Error ? err.message : t("errLoad")
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reference, authLoading]);

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow animate-up">
          {receipt?.status === "paid" ? t("confirmed") : t("yourBooking")}
        </p>
        <h1 className="page-title animate-up delay-1">
          {loading ? t("oneMoment") : receipt?.status === "paid" ? t("tableBooked") : t("bookingDetails")}
        </h1>

        {loading && (
          <div className="route-fallback">
            <span className="route-fallback-dot" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="animate-up delay-2">
            <p className="form-error" role="alert" style={{ marginBottom: "1.5rem" }}>{error}</p>
            <Link to="/my-tables" className="btn btn-amber">{t("goToMyTables")}</Link>
          </div>
        )}

        {receipt && (
          <div className="animate-up delay-2">
            <Receipt data={receipt} />

            <div className="rcpt-actions">
              <Link to="/my-tables" className="btn btn-amber">{t("myTables")}</Link>
              <Link to="/menu" className="btn btn-outline">{t("seeMenu")}</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
