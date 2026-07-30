import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";
import type { ReceiptData } from "../api";
import { Receipt } from "../components/Receipt";
import { useAuth } from "../auth";

/**
 * Landing page for a completed booking. The payment itself is confirmed inside
 * the payment modal, so by the time anyone gets here the charge has settled —
 * this just fetches and shows the receipt.
 */
export function ReserveConfirmed() {
  const [searchParams] = useSearchParams();
  const { loading: authLoading } = useAuth();

  const reference = searchParams.get("reference") ?? "";

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!reference) {
      setError("No booking reference in the link. Your bookings are listed under My Tables.");
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
            ? "We could not find that booking. Check My Tables."
            : err instanceof Error ? err.message : "Could not load your receipt."
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reference, authLoading]);

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow animate-up">
          {receipt?.status === "paid" ? "Confirmed" : "Your booking"}
        </p>
        <h1 className="page-title animate-up delay-1">
          {loading ? "One moment…" : receipt?.status === "paid" ? "Table booked." : "Booking details"}
        </h1>

        {loading && (
          <div className="route-fallback">
            <span className="route-fallback-dot" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="animate-up delay-2">
            <p className="form-error" role="alert" style={{ marginBottom: "1.5rem" }}>{error}</p>
            <Link to="/my-tables" className="btn btn-amber">Go to My Tables</Link>
          </div>
        )}

        {receipt && (
          <div className="animate-up delay-2">
            <Receipt data={receipt} />

            <div className="rcpt-actions">
              <Link to="/my-tables" className="btn btn-amber">My Tables</Link>
              <Link to="/menu" className="btn btn-outline">See the menu</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
