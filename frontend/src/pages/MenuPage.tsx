import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { MenuItem } from "../api";
import { PhoneInput, toInternational } from "../components/PhoneInput";
import { useAuth } from "../auth";
import { MomoPaymentModal } from "../components/MomoPaymentModal";
import { IconBag, IconCheck, IconMinus, IconPlus } from "../components/Icons";
import { useT } from "../i18n/context";

type CartLine = { item: MenuItem; qty: number };

const PICKUP_SLOTS: string[] = [];
for (let h = 9; h <= 21; h++) {
  PICKUP_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  PICKUP_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

interface PlacedOrder {
  order_no: string;
  subtotal: number;
  discount_fcfa: number;
  total_fcfa: number;
  /** False when a promo or gift card already covered the whole order. */
  payment_required?: boolean;
}

/**
 * The menu and the ordering flow in one page.
 *
 * These used to be two pages listing the same food, which meant two places to
 * keep in step and a customer deciding upfront whether they were "browsing" or
 * "ordering". Now the board is the shop: add from any row, pay or settle at
 * the counter.
 */
export function MenuPage() {
  const t = useT("menu");
  const { user } = useAuth();

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Map<number, CartLine>>(new Map());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [step, setStep] = useState<"menu" | "checkout" | "pay" | "done">("menu");
  const [cartOpen, setCartOpen] = useState(false);

  const [form, setForm] = useState({ name: "", phone: "", pickup_time: "", note: "", promo_code: "", gift_card_code: "" });
  const [promoInfo, setPromoInfo] = useState<{ discount_fcfa: number; description: string } | null>(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [giftInfo, setGiftInfo] = useState<{ remaining_value_fcfa: number } | null>(null);
  const [giftMsg, setGiftMsg] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [payPhone, setPayPhone] = useState("");
  const [pending, setPending] = useState<{ reference: string; amount: number; phone: string; windowSeconds: number } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.menu()
      .then((d) => setMenu(d.menu.filter((m) => m.is_active)))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (user?.name && !form.name) setForm((f) => ({ ...f, name: user.name }));
  }, [user?.name]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menu.map((m) => m.category)))],
    [menu]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(
      (m) =>
        (category === "All" || m.category === category) &&
        (!q || m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q))
    );
  }, [menu, search, category]);

  /** Grouped so the board reads by section rather than as one long list. */
  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const lines = useMemo(() => Array.from(cart.values()), [cart]);
  const subtotal = useMemo(() => lines.reduce((s, c) => s + (c.item.price_fcfa ?? 0) * c.qty, 0), [lines]);
  const itemCount = useMemo(() => lines.reduce((s, c) => s + c.qty, 0), [lines]);

  const promoDiscount = promoInfo?.discount_fcfa ?? 0;
  const giftCredit = giftInfo ? Math.min(giftInfo.remaining_value_fcfa, Math.max(0, subtotal - promoDiscount)) : 0;
  const discount = promoDiscount + giftCredit;
  const total = Math.max(0, subtotal - discount);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }

  function setQty(item: MenuItem, delta: number) {
    setCart((prev) => {
      const next = new Map(prev);
      const cur = next.get(item.id);
      const qty = (cur?.qty ?? 0) + delta;
      if (qty <= 0) next.delete(item.id);
      else next.set(item.id, { item, qty: Math.min(20, qty) });
      return next;
    });
  }

  function add(item: MenuItem) {
    setQty(item, 1);
    flash(t("enteredBag").replace("{name}", item.name));
  }

  /** The add / quantity control. Shared by the feature cards and the dense rows
      so the two section styles cannot drift apart. */
  function itemAction(item: MenuItem) {
    if (item.price_fcfa === null) return <span className="mnu-item-ask">{t("askCounter")}</span>;
    const line = cart.get(item.id);
    if (line) {
      return (
        <div className="mnu-qty">
          <button type="button" onClick={() => setQty(item, -1)} aria-label={`Remove one ${item.name}`}>
            <IconMinus size={15} />
          </button>
          <span className="mono">{line.qty}</span>
          <button type="button" onClick={() => setQty(item, 1)} aria-label={`Add one ${item.name}`}>
            <IconPlus size={15} />
          </button>
        </div>
      );
    }
    return (
      <button type="button" className="mnu-add" onClick={() => add(item)}>
        <IconPlus size={15} />
        <span>{t("add")}</span>
      </button>
    );
  }

  const setField =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function applyPromo() {
    setPromoMsg("");
    setPromoInfo(null);
    if (!form.promo_code.trim()) return;
    try {
      const r = await api.validatePromo(form.promo_code.trim(), subtotal);
      setPromoInfo({ discount_fcfa: r.discount_fcfa, description: r.description });
    } catch (err) {
      setPromoMsg(err instanceof Error ? err.message : t("errPromo"));
    }
  }

  async function applyGift() {
    setGiftMsg("");
    setGiftInfo(null);
    if (!form.gift_card_code.trim()) return;
    try {
      const r = await api.validateGiftCard(form.gift_card_code.trim());
      setGiftInfo({ remaining_value_fcfa: r.remaining_value_fcfa });
    } catch (err) {
      setGiftMsg(err instanceof Error ? err.message : t("errGift"));
    }
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.placeOrder({
        name: form.name,
        phone: toInternational(form.phone),
        pickup_time: form.pickup_time,
        items: lines.map((c) => ({ id: c.item.id, qty: c.qty })),
        note: form.note,
        promo_code: promoInfo ? form.promo_code : undefined,
        gift_card_code: giftInfo ? form.gift_card_code : undefined,
      });
      setOrder(res);
      /* Takeaway is prepaid, so placing the order does not finish it — the
         customer goes straight to payment. The only order that skips this is
         one a promo or gift card already covered in full. */
      const needsPayment = res.payment_required ?? res.total_fcfa > 0;
      if (needsPayment) {
        setStep("pay");
      } else {
        setStep("done");
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errPlaceOrder"));
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadReceipt() {
    if (!order) return;
    setError("");
    try {
      const res = await api.downloadTakeawayReceipt(order.order_no);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.order_no}-receipt.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick so the download has already started.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError(t("errReceipt"));
    }
  }

  async function startPayment() {
    if (!order) return;
    setError("");
    try {
      const pay = await api.payTakeaway(order.order_no, `+237${payPhone}`);
      setPending({
        reference: pay.reference,
        amount: pay.amount_fcfa,
        phone: pay.momo_phone,
        windowSeconds: pay.expires_in_seconds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errPay"));
    }
  }

  function startOver() {
    setCart(new Map());
    setOrder(null);
    setPayPhone("");
    setPromoInfo(null);
    setGiftInfo(null);
    setForm({ name: user?.name ?? "", phone: "", pickup_time: "", note: "", promo_code: "", gift_card_code: "" });
    setStep("menu");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /* ── Pay for the order ───────────────────────────────────────────── */
  if (step === "pay" && order) {
    return (
      <div className="mnu">
        <div className="mnu-inner mnu-done">
          <p className="mnu-step mono">{t("step2of2")}</p>
          <h1 className="mnu-done-title">{t("payTitle")}</h1>
          <p className="mnu-done-sub">
            {t("payLede")}
          </p>

          <div className="mnu-ticket">
            <p className="mnu-ticket-label">{t("orderNumber")}</p>
            <p className="mnu-ticket-no mono">{order.order_no}</p>

            <dl className="mnu-ticket-rows">
              <div><dt>{t("collectAt")}</dt><dd className="mono">{form.pickup_time}</dd></div>
              <div><dt>{t("name")}</dt><dd>{form.name}</dd></div>
              <div><dt>{t("subtotal")}</dt><dd className="mono">{order.subtotal.toLocaleString()} FCFA</dd></div>
              {order.discount_fcfa > 0 && (
                <div className="is-saving">
                  <dt>{t("discount")}</dt>
                  <dd className="mono">-{order.discount_fcfa.toLocaleString()} FCFA</dd>
                </div>
              )}
              <div className="is-total">
                <dt>{t("toPay")}</dt>
                <dd className="mono">{order.total_fcfa.toLocaleString()} FCFA</dd>
              </div>
            </dl>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="mnu-pay-block">
            <PhoneInput
              label={t("momoLabel")}
              value={payPhone}
              onChange={setPayPhone}
            />
            <button className="btn btn-amber" onClick={startPayment} disabled={payPhone.length !== 9}>
              {t("payButton").replace("{amount}", order.total_fcfa.toLocaleString())}
            </button>
          </div>

          <button className="btn btn-ghost mnu-abandon" onClick={startOver}>
            {t("cancelOrder")}
          </button>
        </div>

        <MomoPaymentModal
          reference={pending?.reference ?? null}
          amountFcfa={pending?.amount ?? 0}
          momoPhone={pending?.phone ?? ""}
          windowSeconds={pending?.windowSeconds ?? 180}
          onSuccess={() => { setPending(null); setStep("done"); }}
          onDismiss={() => setPending(null)}
        />
      </div>
    );
  }

  /* ── Paid ────────────────────────────────────────────────────────── */
  if (step === "done" && order) {
    return (
      <div className="mnu">
        <div className="mnu-inner mnu-done">
          <span className="mnu-done-mark paid" aria-hidden="true">
            <IconCheck size={30} />
          </span>

          <h1 className="mnu-done-title">{t("doneTitle")}</h1>
          <p className="mnu-done-sub">
            {t("doneLede")}
          </p>

          <div className="mnu-ticket">
            <p className="mnu-ticket-label">{t("collectionCode")}</p>
            <p className="mnu-ticket-no mono">{order.order_no}</p>

            <dl className="mnu-ticket-rows">
              <div><dt>{t("collectAt")}</dt><dd className="mono">{form.pickup_time}</dd></div>
              <div><dt>{t("name")}</dt><dd>{form.name}</dd></div>
              <div><dt>{t("subtotal")}</dt><dd className="mono">{order.subtotal.toLocaleString()} FCFA</dd></div>
              {order.discount_fcfa > 0 && (
                <div className="is-saving">
                  <dt>{t("discount")}</dt>
                  <dd className="mono">-{order.discount_fcfa.toLocaleString()} FCFA</dd>
                </div>
              )}
              <div className="is-total">
                <dt>{t("paid")}</dt>
                <dd className="mono">{order.total_fcfa.toLocaleString()} FCFA</dd>
              </div>
            </dl>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="mnu-done-actions">
            <button className="btn btn-amber" onClick={downloadReceipt}>{t("downloadReceipt")}</button>
            <button className="btn btn-outline" onClick={startOver}>{t("orderAgain")}</button>
            <Link to="/" className="btn btn-ghost">{t("backToHome")}</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Checkout ────────────────────────────────────────────────────── */
  if (step === "checkout") {
    return (
      <div className="mnu">
        <div className="mnu-inner">
          <button className="mnu-back" onClick={() => setStep("menu")}>{t("backToFood")}</button>
          <h1 className="mnu-title">{t("checkoutTitle")}</h1>

          <div className="mnu-checkout">
            <form className="mnu-form" onSubmit={placeOrder}>
              <section className="mnu-card">
                <h2 className="mnu-card-title">{t("whoCollect")}</h2>
                <div className="mnu-grid-2">
                  <label className="mnu-field">
                    {t("name")}
                    <input value={form.name} onChange={setField("name")} required minLength={2} maxLength={60} placeholder={t("name")} />
                  </label>
                  <PhoneInput
                    label={t("phone")}
                    value={form.phone}
                    onChange={(digits) => setForm((f) => ({ ...f, phone: digits }))}
                    required
                  />
                </div>
                <label className="mnu-field">
                  {t("pickupTime")}
                  <select value={form.pickup_time} onChange={setField("pickup_time")} required>
                    <option value="">{t("chooseTime")}</option>
                    {PICKUP_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </label>
                <label className="mnu-field">
                  {t("notes")} <span className="optional">{t("optional")}</span>
                  <textarea value={form.note} onChange={setField("note")} rows={3} maxLength={300} placeholder={t("notePlaceholder")} />
                </label>
              </section>

              <section className="mnu-card">
                <h2 className="mnu-card-title">{t("discounts")}</h2>
                {!user && <p className="hint"><Link to="/login">{t("signInPrompt")}</Link> {t("signInSuffix")}</p>}
                <label className="mnu-field">
                  {t("promoCode")}
                  <div className="input-with-btn">
                    <input value={form.promo_code} onChange={setField("promo_code")} placeholder="WEEKEND10" disabled={!user} style={{ textTransform: "uppercase" }} />
                    <button type="button" className="btn btn-outline btn-sm" onClick={applyPromo} disabled={!user || !form.promo_code.trim()}>{t("applyPromo")}</button>
                  </div>
                  {promoMsg && <span className="form-error">{promoMsg}</span>}
                  {promoInfo && <span className="mnu-ok">{promoInfo.description} {t("promoSaved").replace("{amount}", promoInfo.discount_fcfa.toLocaleString())}</span>}
                </label>
                <label className="mnu-field">
                  {t("giftCard")}
                  <div className="input-with-btn">
                    <input value={form.gift_card_code} onChange={setField("gift_card_code")} placeholder="GIFT-XXXX-XXXX" disabled={!user} style={{ textTransform: "uppercase" }} />
                    <button type="button" className="btn btn-outline btn-sm" onClick={applyGift} disabled={!user || !form.gift_card_code.trim()}>{t("checkGift")}</button>
                  </div>
                  {giftMsg && <span className="form-error">{giftMsg}</span>}
                  {giftInfo && <span className="mnu-ok">{t("giftLeft").replace("{amount}", giftInfo.remaining_value_fcfa.toLocaleString())}</span>}
                </label>
              </section>

              {error && <p className="form-error" role="alert">{error}</p>}
            </form>

            <aside className="mnu-summary">
              <h2 className="mnu-card-title">{t("yourOrder")}</h2>
              <ul className="mnu-summary-lines">
                {lines.map(({ item, qty }) => (
                  <li key={item.id}>
                    <span className="mnu-summary-name">{item.name} <span className="mnu-summary-qty">x {qty}</span></span>
                    <span className="mono">{((item.price_fcfa ?? 0) * qty).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <dl className="mnu-totals">
                <div><dt>{t("subtotal")}</dt><dd className="mono">{subtotal.toLocaleString()} FCFA</dd></div>
                {discount > 0 && (
                  <div className="is-saving"><dt>{t("discount")}</dt><dd className="mono">-{discount.toLocaleString()} FCFA</dd></div>
                )}
                <div className="is-total"><dt>{t("total")}</dt><dd className="mono">{total.toLocaleString()} FCFA</dd></div>
              </dl>
              <button className="btn btn-amber mnu-place" onClick={placeOrder} disabled={submitting || lines.length === 0}>
                {submitting ? t("sending") : t("continueToPayment")}
              </button>
              <p className="hint">{t("payNextScreen")}</p>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  /* ── The board ───────────────────────────────────────────────────── */
  return (
    <div className="mnu">
      {/* Title and search share a row so the board starts near the top of the
          screen. Stacked, they cost two full bands of empty width before a
          single dish appears. */}
      <div className="mnu-bar">
        <div className="mnu-inner mnu-bar-inner">
          <div className="mnu-bar-top">
            <h1 className="mnu-title-sm">{t("ourMenu")}</h1>
            <input
              className="mnu-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
            />
          </div>
          <nav className="mnu-cats" aria-label={t("categoriesLabel")}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`mnu-cat${category === c ? " active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mnu-inner mnu-layout">
        <div className="mnu-board">
          {loading && <div className="route-fallback"><span className="route-fallback-dot" aria-hidden="true" /></div>}
          {!loading && filtered.length === 0 && <p className="mnu-empty">{t("noMatch")}</p>}

          {grouped.map(([cat, items]) => (
            <section key={cat} className="mnu-section">
              <h2 className="mnu-section-title">
                <span>{cat}</span>
                <span className="mnu-section-rule" aria-hidden="true" />
                <span className="mnu-section-count mono">{items.length}</span>
              </h2>

              {/* One card system for every section — grill, sides, drinks —
                  so a photographed section and an unphotographed one read as
                  the same menu rather than two different widgets. */}
              <ul className="mnu-dish-grid">
                {items.map((item) => (
                  <li key={item.id} className={`mnu-dish${cart.get(item.id) ? " in-cart" : ""}`}>
                    {item.image_url ? (
                      <img className="mnu-dish-media" src={item.image_url} alt="" loading="lazy" decoding="async" width={320} height={240} />
                    ) : (
                      <span className="mnu-dish-media mnu-dish-media-placeholder" aria-hidden="true">
                        {item.name.charAt(0).toUpperCase()}
                      </span>
                    )}

                    <div className="mnu-dish-body">
                      <div className="mnu-dish-head">
                        <h3 className="mnu-item-name">{item.name}</h3>
                        <span className="mnu-item-price mono">
                          {item.price_label ?? `${(item.price_fcfa ?? 0).toLocaleString()}`}
                          {item.price_fcfa !== null && <span className="mnu-item-cur"> FCFA</span>}
                        </span>
                      </div>
                      {item.description && <p className="mnu-item-desc">{item.description}</p>}
                      <div className="mnu-dish-action">{itemAction(item)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Desktop cart rail. The docked bar below replaces it on narrow screens. */}
        <aside className="mnu-cart">
          <h2 className="mnu-card-title">{t("yourBag")}</h2>
          {lines.length === 0 ? (
            <p className="mnu-cart-empty">{t("bagEmpty")}</p>
          ) : (
            <>
              <ul className="mnu-summary-lines">
                {lines.map(({ item, qty }) => (
                  <li key={item.id}>
                    <span className="mnu-summary-name">{item.name} <span className="mnu-summary-qty">x {qty}</span></span>
                    <span className="mono">{((item.price_fcfa ?? 0) * qty).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <dl className="mnu-totals">
                <div className="is-total"><dt>{t("subtotal")}</dt><dd className="mono">{subtotal.toLocaleString()} FCFA</dd></div>
              </dl>
              <button className="btn btn-amber mnu-place" onClick={() => setStep("checkout")}>
                {t("checkout")}
              </button>
            </>
          )}
          <p className="hint mnu-cart-note">
            {t("preferSitDown")} <Link to="/reserve">{t("bookTable")}</Link>.
          </p>
        </aside>
      </div>

      {/* Docked bar, phones and tablets */}
      {itemCount > 0 && (
        <div className="mnu-dock">
          <button type="button" className="mnu-dock-info" onClick={() => setCartOpen((v) => !v)} aria-expanded={cartOpen}>
            <span className="mnu-dock-count">{itemCount}</span>
            <span><IconBag size={16} /> {t("viewBag")}</span>
          </button>
          <span className="mnu-dock-total mono">{subtotal.toLocaleString()} FCFA</span>
          <button type="button" className="btn btn-amber btn-sm" onClick={() => { setCartOpen(false); setStep("checkout"); }}>
            {t("checkout")}
          </button>
        </div>
      )}

      {cartOpen && itemCount > 0 && (
        <div className="mnu-dock-sheet">
          <div className="mnu-dock-sheet-head">
            <h2 className="mnu-card-title">{t("yourBag")}</h2>
            <button type="button" className="btn-ghost" onClick={() => setCartOpen(false)}>{t("close")}</button>
          </div>
          <ul className="mnu-summary-lines">
            {lines.map(({ item, qty }) => (
              <li key={item.id}>
                <span className="mnu-summary-name">{item.name} <span className="mnu-summary-qty">x {qty}</span></span>
                <span className="mnu-qty compact">
                  <button type="button" onClick={() => setQty(item, -1)} aria-label={`Remove one ${item.name}`}><IconMinus size={13} /></button>
                  <span className="mono">{qty}</span>
                  <button type="button" onClick={() => setQty(item, 1)} aria-label={`Add one ${item.name}`}><IconPlus size={13} /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && <div className="toast toast-ok" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
