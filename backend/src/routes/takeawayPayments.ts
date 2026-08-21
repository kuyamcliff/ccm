import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { awardPoints } from "./loyalty.js";
import { rateLimit } from "../middleware/security.js";
import { APPROVAL_WINDOW_SECONDS, walletFor } from "../lib/wallets.js";
import type { WalletId } from "../lib/wallets.js";
import { startOrangePayment } from "../lib/orange.js";
import { releaseTakeawayPaymentValue } from "../lib/takeawayPayment.js";

export const takeawayPaymentsRouter = Router();
function secondsRemaining(createdAt: string | null): number { if (!createdAt) return 0; const started = new Date(createdAt.replace(" ", "T") + "Z").getTime(); if (!Number.isFinite(started)) return 0; return Math.max(0, APPROVAL_WINDOW_SECONDS - Math.floor((Date.now() - started) / 1000)); }
async function paymentFlags(): Promise<{ mtn: boolean; orange: boolean }> { const row = (await db.prepare("SELECT value FROM site_settings WHERE key = 'site_config_json'").get()) as { value: string } | undefined; try { const parsed = row?.value ? JSON.parse(row.value) as { payments?: { mtn?: unknown; orange?: unknown } } : {}; return { mtn: parsed.payments?.mtn !== false, orange: parsed.payments?.orange !== false }; } catch { return { mtn: true, orange: true }; } }
const payLimit = rateLimit("takeaway-pay", { windowMs: 10 * 60 * 1000, max: 12, key: (req) => String(req.user?.id ?? req.ip) });
const statusLimit = rateLimit("takeaway-pay-status", { windowMs: 60 * 1000, max: 60, key: (req) => String(req.user?.id ?? req.ip) });

takeawayPaymentsRouter.post("/:orderNo/pay", payLimit, async (req, res) => {
  const orderNo = String(req.params.orderNo ?? "").trim(); const idempotencyKey = String(req.get("idempotency-key") ?? "").trim().slice(0, 100); const walletId = req.body?.wallet as WalletId | undefined; const phone = String(req.body?.momoPhone ?? "");
  if (!orderNo) { res.status(400).json({ error: "Missing order." }); return; }
  if (!idempotencyKey) { res.status(400).json({ error: "Please try the payment again from the checkout screen." }); return; }
  if (walletId !== "mtn_momo" && walletId !== "orange_money") { res.status(400).json({ error: "Choose MTN Mobile Money or Orange Money." }); return; }
  const flags = await paymentFlags();
  if ((walletId === "mtn_momo" && !flags.mtn) || (walletId === "orange_money" && !flags.orange)) { res.status(503).json({ error: `${walletId === "mtn_momo" ? "MTN Mobile Money" : "Orange Money"} is temporarily unavailable.` }); return; }
  const order = (await db.prepare("SELECT id, order_no, total_fcfa, payment_status, status, user_id FROM takeaway_orders WHERE order_no = ?").get(orderNo)) as { id: number; order_no: string; total_fcfa: number; payment_status: string; status: string; user_id: number | null } | undefined;
  if (!order) { res.status(404).json({ error: "Order not found." }); return; }
  if (!order.user_id || !req.user || order.user_id !== req.user.id) { res.status(404).json({ error: "Order not found." }); return; }
  if (order.payment_status === "paid") { res.status(400).json({ error: "That order is already paid." }); return; }
  if (order.status === "cancelled") { res.status(400).json({ error: "That order was cancelled." }); return; }
  if (order.total_fcfa <= 0) { res.status(400).json({ error: "There is nothing to pay on that order." }); return; }

  const existing = (await db.prepare("SELECT momo_reference, momo_phone, payment_status, pay_requested_at FROM takeaway_orders WHERE idempotency_key = ? AND user_id = ?").get(idempotencyKey, req.user.id)) as { momo_reference: string | null; momo_phone: string | null; payment_status: string; pay_requested_at: string | null } | undefined;
  if (existing?.momo_reference) { res.status(200).json({ reference: existing.momo_reference, order_no: order.order_no, amount_fcfa: order.total_fcfa, momo_phone: existing.momo_phone, expires_in_seconds: secondsRemaining(existing.pay_requested_at), status: existing.payment_status === "paid" ? "completed" : "pending", payment_url: null }); return; }

  const wallet = walletFor(walletId);
  if (!wallet || !wallet.configured()) { res.status(503).json({ error: `${walletId === "mtn_momo" ? "MTN Mobile Money" : "Orange Money"} is not available right now.` }); return; }
  const msisdn = wallet.toMsisdn(phone);
  if (!msisdn) { res.status(400).json({ error: walletId === "orange_money" ? "Enter a valid Orange Money Cameroon number, starting with 69 or 655 to 659." : "Enter a valid 9 digit MTN number starting with 6." }); return; }

  const reference = `CCM-${randomUUID()}`;
  try { await db.prepare("UPDATE takeaway_orders SET momo_reference = ?, momo_phone = ?, payment_method = ?, payment_status = 'pending', pay_requested_at = now_text(), fail_reason = NULL, idempotency_key = ? WHERE id = ? AND user_id = ?").run(reference, `+${msisdn}`, walletId, idempotencyKey, order.id, req.user.id); }
  catch (err) {
    if (err && typeof err === "object" && "code" in err && String((err as { code: unknown }).code) === "23505") { const winner = (await db.prepare("SELECT momo_reference, momo_phone, payment_status, pay_requested_at FROM takeaway_orders WHERE idempotency_key = ? AND user_id = ?").get(idempotencyKey, req.user.id)) as { momo_reference: string | null; momo_phone: string | null; payment_status: string; pay_requested_at: string | null } | undefined; if (winner?.momo_reference) { res.status(200).json({ reference: winner.momo_reference, order_no: order.order_no, amount_fcfa: order.total_fcfa, momo_phone: winner.momo_phone, expires_in_seconds: secondsRemaining(winner.pay_requested_at), status: "pending", payment_url: null }); return; } }
    throw err;
  }

  let paymentUrl: string | null = null;
  try { const input = { amount: order.total_fcfa, msisdn, reference, externalId: order.order_no, payerMessage: "Cam Chop Meat takeaway", payeeNote: `Order ${order.order_no}` }; if (walletId === "orange_money") paymentUrl = (await startOrangePayment(input)).paymentUrl; else await wallet.charge(input); }
  catch (err) { await releaseTakeawayPaymentValue(order.id, "takeaway_payment_provider_failed"); const message = err instanceof Error ? err.message : "Could not start the payment."; res.status(502).json({ error: message }); return; }
  res.status(201).json({ reference, order_no: order.order_no, amount_fcfa: order.total_fcfa, momo_phone: `+${msisdn}`, expires_in_seconds: APPROVAL_WINDOW_SECONDS, status: "pending", payment_url: paymentUrl });
});

takeawayPaymentsRouter.get("/pay/:reference/status", statusLimit, async (req, res) => {
  const reference = String(req.params.reference ?? "");
  const order = (await db.prepare("SELECT id, order_no, total_fcfa, payment_status, momo_reference, payment_method, pay_requested_at, fail_reason, momo_transaction_id, user_id, status FROM takeaway_orders WHERE momo_reference = ?").get(reference)) as { id: number; order_no: string; total_fcfa: number; payment_status: string; momo_reference: string | null; payment_method: WalletId | null; pay_requested_at: string | null; fail_reason: string | null; momo_transaction_id: string | null; user_id: number | null; status: string } | undefined;
  if (!order) { res.status(404).json({ error: "Payment not found." }); return; }
  if (!req.user || order.user_id !== req.user.id) { res.status(404).json({ error: "Payment not found." }); return; }
  let status: "pending" | "completed" | "failed" = order.payment_status === "paid" ? "completed" : order.payment_status === "failed" ? "failed" : "pending"; let message: string | null = order.fail_reason ? order.fail_reason : null; const remaining = secondsRemaining(order.pay_requested_at);
  if (status === "pending" && order.payment_method && order.momo_reference) {
    const wallet = walletFor(order.payment_method);
    if (wallet) { try { const trx = await wallet.getTransaction(order.momo_reference); if (trx.status === "SUCCESSFUL") { const settled = await db.prepare("UPDATE takeaway_orders SET payment_status = 'paid', paid_at = now_text(), momo_transaction_id = ?, status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END WHERE id = ? AND payment_status != 'paid'").run(trx.providerTransactionId, order.id); if (settled.changes === 1 && order.user_id) await awardPoints(order.user_id, order.total_fcfa, "Takeaway order", "takeaway", order.id); status = "completed"; message = null; } else if (trx.status === "FAILED" || remaining === 0) { await releaseTakeawayPaymentValue(order.id, trx.status === "FAILED" ? "takeaway_payment_failed" : "takeaway_payment_expired"); status = "failed"; message = wallet.explainFailure(trx.reason); } } catch {} }
  }
  res.json({ reference, status, amount_fcfa: order.total_fcfa, discount_fcfa: 0, method: order.payment_method ?? "mtn_momo", message, expires_in_seconds: status === "pending" ? remaining : 0 });
});

takeawayPaymentsRouter.post("/pay/:reference/cancel", async (req, res) => {
  const reference = String(req.params.reference ?? ""); const row = (await db.prepare("SELECT id, user_id FROM takeaway_orders WHERE momo_reference = ?").get(reference)) as { id: number; user_id: number | null } | undefined;
  if (!row || !req.user || row.user_id !== req.user.id) { res.status(404).json({ error: "Payment not found." }); return; }
  const current = (await db.prepare("SELECT payment_status FROM takeaway_orders WHERE id = ?").get(row.id)) as { payment_status: string } | undefined;
  if (!current || current.payment_status !== "pending") { res.json({ ok: true, released: false }); return; }
  await releaseTakeawayPaymentValue(row.id, "takeaway_payment_abandoned");
  res.json({ ok: true, released: true });
});
