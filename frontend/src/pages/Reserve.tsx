import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { PhoneInput, toInternational } from "../components/PhoneInput";
import type { RestaurantTable } from "../api";
import { useAuth } from "../auth";
import { TableMap } from "../components/TableMap";
import { MomoPaymentModal } from "../components/MomoPaymentModal";
import { useT } from "../i18n/context";

const SLOTS: string[] = [];
for (let h = 9; h <= 21; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StepProgress({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="step-progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const cls = n < step ? "done" : n === step ? "active" : "";
        return (
          <div key={n} className="step-prog-item">
            <span className={`step-prog-num ${cls}`}>{n < step ? "✓" : n}</span>
            <span className="step-prog-label">{label}</span>
            {i < steps.length - 1 && <span className="step-prog-line" />}
          </div>
        );
      })}
    </div>
  );
}

export function Reserve() {
  const t = useT("reserve");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const stepLabels = [t("stepDateTime"), t("stepTable"), t("stepDetails"), t("stepPayment")];

  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [payPhone, setPayPhone] = useState("");

  const [promoCode, setPromoCode] = useState("");
  const [promoInfo, setPromoInfo] = useState<{ discount_fcfa: number; description: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);

  const [giftCode, setGiftCode] = useState("");
  const [giftInfo, setGiftInfo] = useState<{ remaining_value_fcfa: number } | null>(null);
  const [giftError, setGiftError] = useState("");
  const [giftApplying, setGiftApplying] = useState(false);

  /** Set once a MoMo prompt is out with the customer. Drives the modal. */
  const [pending, setPending] = useState<{
    reference: string;
    amount: number;
    phone: string;
    windowSeconds: number;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const DEPOSIT = 2500;
  const promoDiscount = promoInfo?.discount_fcfa ?? 0;
  const giftCredit = giftInfo ? Math.min(giftInfo.remaining_value_fcfa, DEPOSIT - promoDiscount) : 0;
  const amountDue = Math.max(0, DEPOSIT - promoDiscount - giftCredit);

  async function applyPromo() {
    setPromoError("");
    setPromoInfo(null);
    if (!promoCode.trim()) return;
    setPromoApplying(true);
    try {
      const r = await api.validatePromo(promoCode.trim(), DEPOSIT);
      setPromoInfo({ discount_fcfa: r.discount_fcfa, description: r.description });
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : t("errPromo"));
    } finally {
      setPromoApplying(false);
    }
  }

  async function applyGift() {
    setGiftError("");
    setGiftInfo(null);
    if (!giftCode.trim()) return;
    setGiftApplying(true);
    try {
      const r = await api.validateGiftCard(giftCode.trim());
      setGiftInfo({ remaining_value_fcfa: r.remaining_value_fcfa });
    } catch (err) {
      setGiftError(err instanceof Error ? err.message : t("errGift"));
    } finally {
      setGiftApplying(false);
    }
  }

  useEffect(() => {
    if (user) setPhone("");
  }, [user?.id]);

  async function loadTables() {
    setTablesLoading(true);
    setError("");
    try {
      const r = await api.tables(date, time);
      setTables(r.tables);
    } catch {
      setTables([]);
    } finally {
      setTablesLoading(false);
    }
  }

  async function goToStep2() {
    setStep(2);
    await loadTables();
  }

  async function goToStep4(e: FormEvent) {
    e.preventDefault();
    setStep(4);
  }

  async function submitReservation(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // The field holds nine local digits; the API stores the full number.
      const resv = await api.createReservation({
        date, time, partySize, phone: toInternational(phone), note, tableId: selectedTable,
      });
      const pay = await api.initiatePayment(
        resv.reservation.id,
        amountDue > 0 ? `+237${payPhone}` : "",
        promoInfo ? promoCode : undefined,
        giftInfo ? giftCode : undefined
      );

      if (pay.zero_cost) {
        // Nothing to charge — go straight to the receipt.
        navigate(`/reserve/confirmed?reference=${encodeURIComponent(pay.reference)}`);
        return;
      }

      // The prompt is now on the customer's handset; the modal takes over.
      setPending({
        reference: pay.reference,
        amount: pay.amount_fcfa,
        phone: pay.momo_phone ?? `+237${payPhone}`,
        windowSeconds: pay.expires_in_seconds ?? 180,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="section-inner narrow center">
          <p style={{ color: "var(--text-muted)" }}>{t("oneMoment")}</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section">
        <div className="section-inner narrow">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-title">{t("title")}</h1>
          <div className="ticket">
            <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>
              {t("needAccount")}
            </p>
            <div className="hero-actions">
              <Link className="btn btn-amber" to="/register">{t("createAccount")}</Link>
              <Link className="btn btn-outline" to="/login">{t("signIn")}</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-title">{t("title")}</h1>
        <StepProgress step={step} steps={stepLabels} />

        {step === 1 && (
          <div className="form-card animate-fade">
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", marginBottom: "1.25rem" }}>{t("whenComing")}</h2>
            <div className="form">
              <div className="form-row two">
                <label>
                  {t("date")}
                  <input type="date" required min={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  {t("time")}
                  <select value={time} onChange={(e) => setTime(e.target.value)}>
                    {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label>
                {t("partySize")}
                <input type="number" min={1} max={20} required value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
              </label>
              <button className="btn btn-amber btn-big" onClick={goToStep2}>
                {t("checkAvailability")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade">
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>{t("pickYourTable")}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              {t("partyOf").replace("{date}", date).replace("{time}", time).replace("{size}", String(partySize))}
            </p>
            {tablesLoading && <p style={{ color: "var(--text-muted)" }}>{t("loadingTables")}</p>}
            {!tablesLoading && tables.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>{t("noTableMap")}</p>
            )}
            {!tablesLoading && tables.length > 0 && (
              <TableMap tables={tables} selected={selectedTable} onSelect={setSelectedTable} partySize={partySize} />
            )}
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
              <button className="btn btn-outline" onClick={() => setStep(1)}>{t("back")}</button>
              <button className="btn btn-amber" onClick={() => setStep(3)}>
                {selectedTable ? t("continueBtn") : t("continueNoSelect")}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form className="form form-card animate-fade" onSubmit={goToStep4}>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", marginBottom: "0.25rem" }}>{t("yourDetails")}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
              {t("bookingAs")} <strong>{user.name}</strong>
            </p>
            <PhoneInput
              label={t("phoneLabel")}
              value={phone}
              onChange={setPhone}
              required
            />
            <label>
              {t("specialRequests")} <span className="optional">{t("optional")}</span>
              <textarea rows={3} maxLength={300} placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            {/* ── Discount codes ── */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", margin: 0 }}>{t("promoOrGift")}</p>

              <div>
                <div className="input-with-btn">
                  <input
                    className="form-input"
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoInfo(null); setPromoError(""); }}
                    placeholder={t("promoPlaceholder")}
                    style={{ textTransform: "uppercase" }}
                  />
                  <button type="button" className="btn btn-sm btn-outline" onClick={applyPromo} disabled={!promoCode.trim() || promoApplying}>
                    {promoApplying ? "..." : t("apply")}
                  </button>
                </div>
                {promoError && <p className="form-error" style={{ marginTop: "0.3rem", fontSize: "0.8rem" }}>{promoError}</p>}
                {promoInfo && <p style={{ fontSize: "0.8rem", color: "var(--green)", marginTop: "0.3rem" }}>✓ {t("promoOff").replace("{desc}", promoInfo.description).replace("{amount}", promoInfo.discount_fcfa.toLocaleString())}</p>}
              </div>

              <div>
                <div className="input-with-btn">
                  <input
                    className="form-input"
                    value={giftCode}
                    onChange={(e) => { setGiftCode(e.target.value.toUpperCase()); setGiftInfo(null); setGiftError(""); }}
                    placeholder={t("giftPlaceholder")}
                    style={{ textTransform: "uppercase" }}
                  />
                  <button type="button" className="btn btn-sm btn-outline" onClick={applyGift} disabled={!giftCode.trim() || giftApplying}>
                    {giftApplying ? "..." : t("check")}
                  </button>
                </div>
                {giftError && <p className="form-error" style={{ marginTop: "0.3rem", fontSize: "0.8rem" }}>{giftError}</p>}
                {giftInfo && <p style={{ fontSize: "0.8rem", color: "var(--green)", marginTop: "0.3rem" }}>✓ {t("giftBalance").replace("{amount}", giftInfo.remaining_value_fcfa.toLocaleString())}</p>}
              </div>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            <div style={{ display: "flex", gap: "1rem" }}>
              <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>{t("back")}</button>
              <button type="submit" className="btn btn-amber">{t("continueBtn")}</button>
            </div>
          </form>
        )}

        {step === 4 && (
          <form className="animate-fade" onSubmit={submitReservation}>
            <div className="payment-box">
              <h2 style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                {amountDue === 0 ? t("confirmTable") : t("payToConfirm")}
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
                {t("payHeader").replace("{date}", date).replace("{time}", time).replace("{size}", String(partySize)).replace("{name}", user.name)}
              </p>

              {/* Deposit breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.25rem" }}>
                <div className="receipt-row">
                  <span style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("deposit")}</span>
                  <span style={{ fontSize: "0.88rem" }}>{DEPOSIT.toLocaleString()} FCFA</span>
                </div>
                {promoDiscount > 0 && (
                  <div className="receipt-row">
                    <span style={{ color: "var(--amber)", fontSize: "0.88rem" }}>{t("promoLine").replace("{desc}", promoInfo?.description ?? "")}</span>
                    <span style={{ color: "var(--amber)", fontSize: "0.88rem" }}>− {promoDiscount.toLocaleString()} FCFA</span>
                  </div>
                )}
                {giftCredit > 0 && (
                  <div className="receipt-row">
                    <span style={{ color: "var(--amber)", fontSize: "0.88rem" }}>{t("giftCardLine")}</span>
                    <span style={{ color: "var(--amber)", fontSize: "0.88rem" }}>− {giftCredit.toLocaleString()} FCFA</span>
                  </div>
                )}
                <div className="receipt-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.2rem" }}>
                  <span style={{ fontWeight: 700 }}>{t("amountDue")}</span>
                  <span style={{ fontWeight: 700, color: amountDue === 0 ? "var(--green)" : "var(--text)" }}>
                    {amountDue === 0 ? t("free") : `${amountDue.toLocaleString()} FCFA`}
                  </span>
                </div>
              </div>

              {amountDue === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  {t("coveredBody")}
                </p>
              ) : (
                <>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1rem" }}>
                    {(promoDiscount > 0 || giftCredit > 0)
                      ? t("remainingBalance")
                      : t("depositBody")}
                  </p>

                  <div className="momo-brand-row">
                    <span className="momo-brand-mark" aria-hidden="true">MoMo</span>
                    <div>
                      <p className="momo-brand-name">{t("momoName")}</p>
                      <p className="momo-brand-hint">{t("momoHint")}</p>
                    </div>
                  </div>

                  <div className="form" style={{ marginTop: "1rem" }}>
                    <label>
                      {t("momoNumber")}
                      <div className="prefix-input-wrap">
                        <span className="prefix-label">+237</span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          required
                          placeholder="6XXXXXXXX"
                          value={payPhone}
                          maxLength={9}
                          onChange={(e) => setPayPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                        />
                      </div>
                    </label>
                    <p className="form-fine">{t("momoFinePrint")}</p>
                  </div>
                </>
              )}
            </div>

            {error && <p className="form-error" role="alert" style={{ marginTop: "1rem" }}>{error}</p>}

            <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-outline" onClick={() => setStep(3)}>{t("back")}</button>
              <button
                type="submit"
                className="btn btn-amber btn-big"
                disabled={busy || (amountDue > 0 && payPhone.length !== 9)}
              >
                {busy
                  ? t("sendingPrompt")
                  : amountDue === 0
                    ? t("confirmBooking")
                    : t("payAmount").replace("{amount}", amountDue.toLocaleString())}
              </button>
            </div>
          </form>
        )}
      </div>

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
