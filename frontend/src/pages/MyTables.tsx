import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Reservation } from "../api";
import { useAuth } from "../auth";
import { ConfirmModal } from "../components/ConfirmModal";
import { MomoPaymentModal } from "../components/MomoPaymentModal";
import { IconPlate } from "../components/Icons";
import { useT } from "../i18n/context";

type Pending = { reference: string; amount: number; phone: string; windowSeconds: number };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Human phrasing for how far off a booking is. */
function whenLabel(date: string, t: (key: string) => string): string {
  const today = todayLocal();
  if (date === today) return t("today");
  const diff = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000
  );
  if (diff === 1) return t("tomorrow");
  if (diff > 1 && diff < 7) return t("inDays").replace("{n}", String(diff));
  return longDate(date);
}

export function MyTables() {
  const t = useT("myTables");
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    if (!user) return;
    api.myReservations()
      .then((r) => setReservations(r.reservations))
      .catch((e) => setError(e instanceof Error ? e.message : t("errLoad")))
      .finally(() => setLoaded(true));
  }, [user?.id]);

  const today = todayLocal();
  const { upcoming, past } = useMemo(() => {
    const live = (r: Reservation) =>
      r.date >= today && r.status !== "cancelled" && r.status !== "completed";
    return {
      upcoming: reservations.filter(live).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      past: reservations.filter((r) => !live(r)),
    };
  }, [reservations, today]);

  async function doCancel(id: number) {
    setCancelId(null);
    setError("");
    try {
      await api.cancelReservation(id);
      setReservations((rs) => rs.map((r) => (r.id === id ? { ...r, status: "cancelled" as const } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errCancel"));
    }
  }

  async function doRemove(id: number) {
    setRemoveId(null);
    setError("");
    // Dropped from view straight away; the restaurant keeps the record.
    setReservations((rs) => rs.filter((r) => r.id !== id));
    try {
      await api.hideReservation(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errRemove"));
      api.myReservations().then((r) => setReservations(r.reservations)).catch(() => {});
    }
  }

  async function downloadPdf(r: Reservation) {
    setDownloadingId(r.id);
    setError("");
    try {
      const res = await api.downloadReceipt(r.id);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.ccm_code ?? `booking-${r.id}`}-receipt.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errDownload"));
    } finally {
      setDownloadingId(null);
    }
  }

  async function retryPayment(r: Reservation) {
    setPayingId(r.id);
    setError("");
    try {
      const pay = await api.initiatePayment(r.id, r.phone);
      if (pay.zero_cost) {
        navigate(`/reserve/confirmed?reference=${encodeURIComponent(pay.reference)}`);
        return;
      }
      setPending({
        reference: pay.reference,
        amount: pay.amount_fcfa,
        phone: pay.momo_phone ?? r.phone,
        windowSeconds: pay.expires_in_seconds ?? 180,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errPay"));
    } finally {
      setPayingId(null);
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <h1 className="page-title">{t("title")}</h1>
          <p className="notice"><Link to="/login">{t("signInPrompt")}</Link> {t("signInSuffix")}</p>
        </div>
      </section>
    );
  }

  const list = tab === "upcoming" ? upcoming : past;

  function statusPill(r: Reservation) {
    if (r.status === "cancelled") return <span className="mt-pill mt-pill-dead">{t("cancelled")}</span>;
    if (r.checked_in_at) return <span className="mt-pill mt-pill-ok">{t("checkedIn")}</span>;
    if (r.status === "completed") return <span className="mt-pill mt-pill-muted">{t("completed")}</span>;
    if (r.status === "pending_payment") return <span className="mt-pill mt-pill-warn">{t("awaitingPayment")}</span>;
    return <span className="mt-pill mt-pill-ok">{t("confirmed")}</span>;
  }

  return (
    <section className="section">
      <div className="mt-wrap">
        <header className="mt-head">
          <div>
            <p className="eyebrow">{t("myAccount")}</p>
            <h1 className="page-title" style={{ marginBottom: 0 }}>{t("title")}</h1>
          </div>
          <div className="mt-head-actions">
            <Link to="/account" className="btn btn-outline btn-sm">{t("accountSettings")}</Link>
            <Link to="/reserve" className="btn btn-amber btn-sm">{t("bookTable")}</Link>
          </div>
        </header>

        <div className="mt-stats">
          <div className="mt-stat">
            <span className="mt-stat-num mono">{upcoming.length}</span>
            <span className="mt-stat-label">{t("upcoming")}</span>
          </div>
          <div className="mt-stat">
            <span className="mt-stat-num mono">
              {reservations.filter((r) => r.checked_in_at || r.status === "completed").length}
            </span>
            <span className="mt-stat-label">{t("visits")}</span>
          </div>
          <div className="mt-stat">
            <span className="mt-stat-num mono">
              {reservations
                .reduce((sum, r) => sum + (r.payment_status === "paid" ? r.amount_fcfa ?? 0 : 0), 0)
                .toLocaleString()}
            </span>
            <span className="mt-stat-label">{t("depositsLabel")}</span>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="filter-chips mt-tabs">
          <button
            className={`filter-chip${tab === "upcoming" ? " active" : ""}`}
            onClick={() => setTab("upcoming")}
          >
            {t("upcoming")}{upcoming.length > 0 && ` (${upcoming.length})`}
          </button>
          <button
            className={`filter-chip${tab === "past" ? " active" : ""}`}
            onClick={() => setTab("past")}
          >
            {t("pastCancelled")}{past.length > 0 && ` (${past.length})`}
          </button>
        </div>

        {!loaded && <div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div>}

        {loaded && list.length === 0 && (
          <div className="empty-state">
            <p className="empty-mark" aria-hidden="true"><IconPlate size={30} /></p>
            <p>
              {tab === "upcoming" ? (
                <>{t("emptyUpcoming")} <Link to="/reserve">{t("emptyUpcomingLink")}</Link> {t("emptyUpcomingSuffix")}</>
              ) : (
                <>{t("emptyPast")}</>
              )}
            </p>
          </div>
        )}

        <div className="mt-grid">
          {list.map((r) => {
            const dead = r.status === "cancelled";
            const paid = r.payment_status === "paid";
            return (
              <article key={r.id} className={`mt-card${dead ? " is-dead" : ""}`}>
                <header className="mt-card-top">
                  <div>
                    <p className="mt-when">{dead ? longDate(r.date) : whenLabel(r.date, t)}</p>
                    <p className="mt-time mono">{r.time}</p>
                  </div>
                  {statusPill(r)}
                </header>

                <p className="mt-code mono">{r.ccm_code ?? `#${String(r.id).padStart(4, "0")}`}</p>

                <dl className="mt-rows">
                  <div><dt>{t("party")}</dt><dd>{r.party_size} {r.party_size === 1 ? t("guest") : t("guests")}</dd></div>
                  {r.table_label && (
                    <div>
                      <dt>{t("table")}</dt>
                      <dd>{r.table_label}{r.table_zone ? `, ${r.table_zone}` : ""}</dd>
                    </div>
                  )}
                  <div><dt>{t("phone")}</dt><dd className="mono">{r.phone}</dd></div>
                  <div>
                    <dt>{t("deposit")}</dt>
                    <dd className={paid ? "mt-paid" : undefined}>
                      {paid
                        ? `${(r.amount_fcfa ?? 0).toLocaleString()} FCFA ${t("paidSuffix")}`
                        : dead ? "" : t("notPaid")}
                      {paid && (r.discount_fcfa ?? 0) > 0 && (
                        <span className="mt-saved"> , {t("saved")} {(r.discount_fcfa ?? 0).toLocaleString()}</span>
                      )}
                    </dd>
                  </div>
                  {r.checked_in_at && (
                    <div>
                      <dt>{t("arrived")}</dt>
                      <dd className="mono">
                        {new Date(r.checked_in_at.replace(" ", "T") + "Z").toLocaleString("en-GB", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </dd>
                    </div>
                  )}
                  {dead && r.cancel_reason && (
                    <div><dt>{t("reason")}</dt><dd>{r.cancel_reason}</dd></div>
                  )}
                </dl>

                {r.note && <p className="mt-note">“{r.note}”</p>}

                <footer className="mt-actions">
                  {paid && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => downloadPdf(r)}
                      disabled={downloadingId === r.id}
                    >
                      {downloadingId === r.id ? t("preparing") : t("downloadPdf")}
                    </button>
                  )}
                  {r.status === "pending_payment" && (
                    <button
                      className="btn btn-amber btn-sm"
                      disabled={payingId === r.id}
                      onClick={() => retryPayment(r)}
                    >
                      {payingId === r.id ? t("starting") : t("payNow")}
                    </button>
                  )}
                  {(r.status === "confirmed" || r.status === "pending_payment") && !r.checked_in_at && (
                    <button className="btn btn-danger btn-sm" onClick={() => setCancelId(r.id)}>
                      {t("cancel")}
                    </button>
                  )}
                  {(dead || r.status === "completed") && (
                    <button className="btn btn-ghost mt-remove" onClick={() => setRemoveId(r.id)}>
                      {t("removeFromList")}
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      <ConfirmModal
        open={cancelId !== null}
        title={t("cancelTitle")}
        body={t("cancelBody")}
        confirmLabel={t("yesCancel")}
        confirmClass="btn-danger"
        onConfirm={() => { if (cancelId !== null) doCancel(cancelId); }}
        onCancel={() => setCancelId(null)}
      />

      <ConfirmModal
        open={removeId !== null}
        title={t("removeTitle")}
        body={t("removeBody")}
        confirmLabel={t("remove")}
        confirmClass="btn-danger"
        onConfirm={() => { if (removeId !== null) doRemove(removeId); }}
        onCancel={() => setRemoveId(null)}
      />

      <MomoPaymentModal
        reference={pending?.reference ?? null}
        amountFcfa={pending?.amount ?? 0}
        momoPhone={pending?.phone ?? ""}
        windowSeconds={pending?.windowSeconds ?? 180}
        onSuccess={(status) =>
          navigate(`/reserve/confirmed?reference=${encodeURIComponent(status.reference)}`)
        }
        onDismiss={() => setPending(null)}
      />
    </section>
  );
}
