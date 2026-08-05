import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin, requireScope } from "../auth.js";
import { audit } from "../lib/audit.js";
import { rateLimit } from "../middleware/security.js";
import { notify } from "../lib/notify.js";
import { takeawayReady } from "../lib/messages.js";
import {
  APPROVAL_WINDOW_SECONDS,
  MomoError,
  explainFailure,
  getTransaction,
  momoConfigured,
  requestToPay,
  toMsisdn,
} from "../lib/momo.js";
import { evaluatePromo, releasePromoCode, usePromoCode } from "./promos.js";
import { redeemGiftCard, refundGiftCard } from "./giftcards.js";
import { generateOrderCode } from "../lib/bookingCode.js";

export const takeawayRouter = Router();

type MenuItem = { id: number; name: string; price_fcfa: number | null };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_LINES = 40;

/** The order endpoint is public, so it needs its own ceiling. */
const orderLimit = rateLimit("takeaway-order", {
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many orders from this device. Wait a few minutes and try again.",
});

takeawayRouter.post("/", orderLimit, async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const pickup_time = String(req.body?.pickup_time ?? "").trim();
  const note = String(req.body?.note ?? "").trim().slice(0, 300);
  const rawItems: unknown = req.body?.items;
  const promoCode = req.body?.promo_code ? String(req.body.promo_code).trim().toUpperCase() : null;
  const giftCode = req.body?.gift_card_code ? String(req.body.gift_card_code).trim().toUpperCase() : null;
  const userId = req.user?.id ?? null;

  if (name.length < 2 || name.length > 60) { res.status(400).json({ error: "Enter a name we can call out." }); return; }
  if (!/^[+\d\s-]{8,20}$/.test(phone)) { res.status(400).json({ error: "Enter a phone number we can reach you on." }); return; }
  if (!TIME_RE.test(pickup_time)) { res.status(400).json({ error: "Pick a valid pickup time." }); return; }
  if (!Array.isArray(rawItems) || rawItems.length === 0) { res.status(400).json({ error: "Add at least one item." }); return; }
  if (rawItems.length > MAX_LINES) { res.status(400).json({ error: "That is too many separate items for one order." }); return; }

  // Discount codes carry real value, so they are only honoured for a signed-in
  // customer. Without this the public endpoint could drain any gift card.
  if ((promoCode || giftCode) && !userId) {
    res.status(401).json({ error: "Sign in to use a promo code or gift card." });
    return;
  }

  // Prices always come from the database, never from the request body.
  const menuItems = (await db
    .prepare("SELECT id, name, price_fcfa FROM menu_items WHERE is_active = 1 AND price_fcfa IS NOT NULL")
    .all()) as MenuItem[];
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));

  let subtotal = 0;
  const lines: { id: number; name: string; price: number; qty: number }[] = [];
  for (const item of rawItems as { id: unknown; qty: unknown }[]) {
    const m = menuMap.get(Number(item.id));
    if (!m || !m.price_fcfa) { res.status(400).json({ error: "One of those items is no longer available." }); return; }
    const qty = Math.max(1, Math.min(20, Math.floor(Number(item.qty)) || 1));
    subtotal += m.price_fcfa * qty;
    lines.push({ id: m.id, name: m.name, price: m.price_fcfa, qty });
  }

  let appliedPromo: string | null = null;
  let appliedGift: string | null = null;

  // Promo eligibility is checked (but not yet consumed) before the gift card
  // is touched, so a gift card failure below cannot leave a promo use spent
  // on an order that was never actually created.
  let promoDiscount = 0;
  if (promoCode) {
    const verdict = await evaluatePromo(promoCode, subtotal);
    if (!verdict.ok) { res.status(verdict.status).json({ error: verdict.error }); return; }
    promoDiscount = verdict.discount;
  }

  let giftTaken = 0;
  if (giftCode) {
    const remaining = Math.max(0, subtotal - promoDiscount);
    if (remaining <= 0) {
      res.status(400).json({ error: "There is nothing left to pay once the promo code is applied, so the gift card was not used." });
      return;
    }
    giftTaken = await redeemGiftCard(giftCode, remaining, { type: "takeaway", id: "pending" });
    if (giftTaken <= 0) {
      res.status(400).json({ error: "That gift card could not be used. Check the code and that it still has a balance." });
      return;
    }
    appliedGift = giftCode;
  }

  if (promoCode) {
    if (!(await usePromoCode(promoCode))) {
      if (giftTaken > 0) await refundGiftCard(giftCode!, giftTaken, { type: "takeaway_promo_conflict", id: "pending" });
      res.status(410).json({ error: "This code has reached its usage limit." });
      return;
    }
    appliedPromo = promoCode;
  }

  const discount = promoDiscount + giftTaken;

  const total = Math.max(0, subtotal - discount);

  /* Takeaway is prepaid. The order is written now so there is something for
     the payment to attach to, but it sits outside the kitchen queue until the
     money lands — `awaiting_payment` is deliberately not one of the statuses
     the kitchen board shows. An order fully covered by a promo or gift card
     has nothing left to charge, so it is confirmed immediately. */
  const settled = total <= 0;
  const orderNo = await generateOrderCode();

  const info = await db
    .prepare(
      `INSERT INTO takeaway_orders (user_id, name, phone, items_json, total_fcfa, pickup_time, note,
                                    promo_code, gift_card_code, discount_fcfa, order_no, status, payment_status, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId, name, phone, JSON.stringify(lines), total, pickup_time, note,
      appliedPromo, appliedGift, discount, orderNo,
      settled ? "pending" : "awaiting_payment",
      settled ? "paid" : "unpaid",
      settled ? new Date().toISOString().replace("T", " ").slice(0, 19) : null
    );

  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    order_no: orderNo,
    subtotal,
    discount_fcfa: discount,
    total_fcfa: total,
    payment_required: !settled,
    status: settled ? "pending" : "awaiting_payment",
  });
});

/* ── Paying for a takeaway order by MoMo ─────────────────────────────────
   Optional: an order can equally be settled at the counter. Payment state
   lives on the order rather than in `payments`, which is keyed to a booking. */

const payLimit = rateLimit("takeaway-pay", {
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many payment attempts. Wait a few minutes and try again.",
});

type OrderPayRow = {
  id: number;
  order_no: string;
  total_fcfa: number;
  payment_status: string;
  momo_reference: string | null;
  pay_requested_at: string | null;
  fail_reason: string | null;
  momo_transaction_id: string | null;
};

function secondsRemaining(startedAt: string | null): number {
  if (!startedAt) return 0;
  const started = new Date(startedAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, APPROVAL_WINDOW_SECONDS - Math.floor((Date.now() - started) / 1000));
}

takeawayRouter.post("/:orderNo/pay", payLimit, async (req, res) => {
  const orderNo = String(req.params.orderNo ?? "");

  const order = (await db
    .prepare(
      "SELECT id, order_no, total_fcfa, payment_status, status FROM takeaway_orders WHERE order_no = ?"
    )
    .get(orderNo)) as (OrderPayRow & { status: string }) | undefined;

  if (!order) { res.status(404).json({ error: "Order not found." }); return; }
  if (order.payment_status === "paid") { res.status(400).json({ error: "That order is already paid." }); return; }
  if (order.status === "cancelled") { res.status(400).json({ error: "That order was cancelled." }); return; }
  if (order.total_fcfa <= 0) { res.status(400).json({ error: "There is nothing to pay on that order." }); return; }

  if (!momoConfigured()) {
    res.status(503).json({ error: "Mobile Money is not available right now. Pay at the counter instead." });
    return;
  }

  const msisdn = toMsisdn(String(req.body?.momoPhone ?? ""));
  if (!msisdn) {
    res.status(400).json({ error: "Enter a valid MTN number: 9 digits starting with 6." });
    return;
  }

  let reference: string;
  try {
    reference = await requestToPay({
      amount: order.total_fcfa,
      msisdn,
      externalId: order.order_no,
      payerMessage: "Cam Chop Meat takeaway",
      payeeNote: `Order ${order.order_no}`,
    });
  } catch (err) {
    if (err instanceof MomoError) {
      if (err.configuration) console.error("[momo] takeaway config problem:", err.message);
      res.status(err.configuration ? 503 : 400).json({
        error: err.configuration
          ? "Mobile Money is temporarily unavailable. Pay at the counter instead."
          : err.message,
      });
      return;
    }
    console.error("[momo] takeaway initiate failed:", err);
    res.status(502).json({ error: "Could not reach Mobile Money. Try again in a moment." });
    return;
  }

  await db.prepare(
    `UPDATE takeaway_orders
     SET momo_reference = ?, momo_phone = ?, payment_status = 'pending',
         pay_requested_at = now_text(), fail_reason = NULL
     WHERE id = ?`
  ).run(reference, `+${msisdn}`, order.id);

  res.status(201).json({
    reference,
    order_no: order.order_no,
    amount_fcfa: order.total_fcfa,
    momo_phone: `+${msisdn}`,
    expires_in_seconds: APPROVAL_WINDOW_SECONDS,
    status: "pending",
  });
});

takeawayRouter.get("/pay/:reference/status", async (req, res) => {
  const reference = String(req.params.reference ?? "");

  const order = (await db
    .prepare(
      `SELECT id, order_no, total_fcfa, payment_status, momo_reference, pay_requested_at,
              fail_reason, momo_transaction_id
       FROM takeaway_orders WHERE momo_reference = ?`
    )
    .get(reference)) as OrderPayRow | undefined;

  if (!order) { res.status(404).json({ error: "Payment not found." }); return; }

  let status = order.payment_status === "pending" ? "pending" : order.payment_status === "paid" ? "completed" : order.payment_status;
  let message: string | null = order.fail_reason ? explainFailure(order.fail_reason) : null;
  const remaining = secondsRemaining(order.pay_requested_at);

  if (order.payment_status === "pending") {
    try {
      const trx = await getTransaction(reference);

      if (trx.status === "SUCCESSFUL") {
        // Conditional so a second poll cannot re-stamp an already-paid order.
        // Payment is also what admits the order to the kitchen queue: until
        // now its status was `awaiting_payment` and no board showed it.
        await db.prepare(
          `UPDATE takeaway_orders
           SET payment_status = 'paid',
               paid_at = now_text(),
               momo_transaction_id = ?,
               status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END
           WHERE id = ? AND payment_status != 'paid'`
        ).run(trx.financialTransactionId, order.id);
        status = "completed";
        message = null;
      } else if (trx.status === "FAILED" || remaining === 0) {
        const reason = trx.status === "FAILED" ? trx.reason : "EXPIRED";
        await db.prepare(
          "UPDATE takeaway_orders SET payment_status = 'failed', fail_reason = ? WHERE id = ? AND payment_status = 'pending'"
        ).run(reason, order.id);
        status = "failed";
        message = explainFailure(reason);
      }
    } catch (err) {
      if (!(err instanceof MomoError)) console.error("[momo] takeaway status:", err);
    }
  }

  res.json({
    reference,
    status,
    amount_fcfa: order.total_fcfa,
    discount_fcfa: 0,
    method: "mtn_momo",
    message,
    expires_in_seconds: status === "pending" ? remaining : 0,
  });
});

takeawayRouter.post("/pay/:reference/cancel", async (req, res) => {
  const reference = String(req.params.reference ?? "");
  const info = await db
    .prepare(
      "UPDATE takeaway_orders SET payment_status = 'unpaid', fail_reason = 'ABANDONED' WHERE momo_reference = ? AND payment_status = 'pending'"
    )
    .run(reference);
  res.json({ ok: true, released: info.changes > 0 });
});

takeawayRouter.get("/my-orders", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) { res.json({ orders: [] }); return; }
  const orders = await db
    .prepare(
      `SELECT id, order_no, name, items_json, total_fcfa, discount_fcfa, pickup_time, status,
              payment_status, paid_at, collected_at, created_at
       FROM takeaway_orders
       WHERE user_id = ? AND status != 'awaiting_payment'
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(userId);
  res.json({ orders });
});

// ── Admin ────────────────────────────────────────────────

takeawayRouter.get("/", requireAdmin, requireScope("takeaway"), async (_req, res) => {
  /* Orders abandoned at the payment step are excluded. They are not orders
     the kitchen can act on, and showing them would bury the real queue under
     everyone who changed their mind at the MoMo prompt. */
  const orders = await db
    .prepare(
      `SELECT t.*, u.name AS user_name
       FROM takeaway_orders t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.status != 'awaiting_payment'
       ORDER BY t.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ orders });
});

takeawayRouter.patch("/:id/status", requireAdmin, requireScope("takeaway"), async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad order id." }); return; }
  if (!["pending", "confirmed", "ready", "picked_up", "cancelled"].includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }

  const order = (await db
    .prepare("SELECT id, order_no, status, phone, user_id, promo_code, gift_card_code, discount_fcfa FROM takeaway_orders WHERE id = ?")
    .get(id)) as
    | {
        id: number; order_no: string; status: string; phone: string | null; user_id: number | null;
        promo_code: string | null; gift_card_code: string | null; discount_fcfa: number;
      }
    | undefined;
  if (!order) { res.status(404).json({ error: "Order not found." }); return; }
  if (order.status === status) { res.json({ ok: true }); return; }

  await db.prepare("UPDATE takeaway_orders SET status = ? WHERE id = ?").run(status, id);

  /* The kitchen marking an order ready is the moment somebody should be told to
     come and get it — until now that was a shout across the room. */
  if (status === "ready" && order.phone) {
    await notify({
      to: order.phone,
      template: "takeaway_ready",
      userId: order.user_id,
      body: takeawayReady(order.order_no),
    });
  }

  // Cancelling gives the customer their promo use and gift card value back.
  if (status === "cancelled" && order.status !== "cancelled") {
    if (order.promo_code) await releasePromoCode(order.promo_code);
    if (order.gift_card_code && order.discount_fcfa > 0) {
      await refundGiftCard(order.gift_card_code, order.discount_fcfa, { type: "takeaway_cancelled", id: order.id });
    }
  }

  audit(req, {
    action: "takeaway.status",
    targetType: "takeaway_order",
    targetId: order.order_no,
    detail: `${order.status} → ${status}`,
  });
  res.json({ ok: true });
});
