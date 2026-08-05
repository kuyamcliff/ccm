import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import {
  APPROVAL_WINDOW_SECONDS,
  MomoError,
  explainFailure,
  getTransaction,
  momoConfigured,
  requestToPay,
  toMsisdn,
} from "../lib/momo.js";
import { redeemGiftCard, refundGiftCard } from "./giftcards.js";
import { evaluatePromo, releasePromoCode, usePromoCode } from "./promos.js";
import { rateLimit } from "../middleware/security.js";
import { getDepositFcfa } from "../lib/pricing.js";
import { notify } from "../lib/notify.js";
import { bookingConfirmed } from "../lib/messages.js";

export const paymentsRouter = Router();

type PaymentRow = {
  id: number;
  reservation_id: number;
  status: string;
  amount_fcfa: number;
  reference: string;
  promo_code: string | null;
  gift_card_code: string | null;
  discount_fcfa: number;
  redeemed_at: string | null;
  created_at: string;
};

/* ── Settlement ────────────────────────────────────────────────────────────
   Both the status poll and any later reconciliation can land on the same
   payment. The conditional UPDATE means only the first caller does the work.  */

async function settlePayment(paymentId: number, financialTransactionId?: string | null): Promise<boolean> {
  const won = await db
    .prepare(
      "UPDATE payments SET status = 'completed', updated_at = now_text() WHERE id = ? AND status != 'completed'"
    )
    .run(paymentId);

  if (won.changes !== 1) return false;

  if (financialTransactionId) {
    await db.prepare("UPDATE payments SET momo_transaction_id = ? WHERE id = ?").run(financialTransactionId, paymentId);
  }

  const row = (await db.prepare("SELECT reservation_id FROM payments WHERE id = ?").get(paymentId)) as
    | { reservation_id: number }
    | undefined;
  if (row?.reservation_id) {
    const confirmed = await db.prepare(
      "UPDATE reservations SET payment_status = 'paid', status = 'confirmed' WHERE id = ? AND status = 'pending_payment'"
    ).run(row.reservation_id);

    /* Tell the guest, but only on the transition — this function is reached
       from both the callback and the polling status check, and a booking
       should not be announced twice because the modal asked twice. */
    if (confirmed.changes === 1) await announceBooking(row.reservation_id);
  }
  return true;
}

/**
 * Texts the guest that their table is held.
 *
 * Awaited rather than left floating so a failure is recorded before the request
 * ends, and wrapped because `notify` is the last thing that should be able to
 * take down a payment that has already succeeded.
 */
async function announceBooking(reservationId: number): Promise<void> {
  try {
    const booking = (await db
      .prepare(
        `SELECT r.id, r.date, r.time, r.party_size, r.phone, r.ccm_code, r.user_id,
                r.items_total_fcfa, r.deposit_fcfa,
                t.label AS table_label, u.name AS user_name,
                p.amount_fcfa
         FROM reservations r
         LEFT JOIN restaurant_tables t ON r.table_id = t.id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed' AND p.type = 'reservation'
         WHERE r.id = ?`
      )
      .get(reservationId)) as
      | {
          date: string; time: string; party_size: number; phone: string; ccm_code: string | null;
          user_id: number; items_total_fcfa: number | null; deposit_fcfa: number | null;
          table_label: string | null; user_name: string | null; amount_fcfa: number | null;
        }
      | undefined;

    if (!booking?.phone || !booking.ccm_code) return;

    await notify({
      to: booking.phone,
      template: "booking_confirmed",
      userId: booking.user_id,
      reservationId,
      body: bookingConfirmed({
        name: booking.user_name ?? "",
        date: booking.date,
        time: booking.time,
        partySize: booking.party_size,
        tableLabel: booking.table_label,
        code: booking.ccm_code,
        paid: booking.amount_fcfa ?? 0,
        itemsTotal: booking.items_total_fcfa ?? 0,
      }),
    });
  } catch (err) {
    console.error("[payments] could not announce booking:", err instanceof Error ? err.message : err);
  }
}

/** Marks a payment failed and hands back any discount it was holding. */
async function failPayment(paymentId: number, reason?: string | null): Promise<void> {
  const lost = await db
    .prepare(
      "UPDATE payments SET status = 'failed', updated_at = now_text(), fail_reason = ? WHERE id = ? AND status = 'pending'"
    )
    .run(reason ?? null, paymentId);

  if (lost.changes !== 1) return;

  const row = (await db
    .prepare("SELECT promo_code, gift_card_code, discount_fcfa, redeemed_at FROM payments WHERE id = ?")
    .get(paymentId)) as PaymentRow | undefined;
  if (!row?.redeemed_at) return;

  if (row.promo_code) await releasePromoCode(row.promo_code);
  if (row.gift_card_code && row.discount_fcfa > 0) {
    await refundGiftCard(row.gift_card_code, row.discount_fcfa, { type: "payment_failed", id: paymentId });
  }
  await db.prepare("UPDATE payments SET redeemed_at = NULL WHERE id = ?").run(paymentId);
}

/** Seconds left in the customer's approval window for a pending payment. */
function secondsRemaining(createdAt: string): number {
  const started = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, APPROVAL_WINDOW_SECONDS - Math.floor((Date.now() - started) / 1000));
}

// ---------- routes ----------

paymentsRouter.use(requireAuth);

const initiateLimit = rateLimit("payment-initiate", {
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many payment attempts. Wait a few minutes and try again.",
  key: (req) => String(req.user?.id ?? "anon"),
});

/** Polled roughly every 3 seconds by the payment modal, so this sits high. */
const statusLimit = rateLimit("payment-status", {
  windowMs: 60 * 1000,
  max: 60,
  message: "Slow down.",
  key: (req) => String(req.user?.id ?? "anon"),
});

paymentsRouter.post("/initiate", initiateLimit, async (req, res) => {
  const reservationId = Number(req.body?.reservationId);
  const promoCode = String(req.body?.promoCode ?? "").trim().toUpperCase();
  const giftCardCode = String(req.body?.giftCardCode ?? "").trim().toUpperCase();

  if (!Number.isInteger(reservationId) || reservationId < 1) {
    res.status(400).json({ error: "Invalid reservation." });
    return;
  }

  const reservation = (await db
    .prepare(
      `SELECT r.id, r.user_id, r.payment_status, r.status, r.date, r.time, r.ccm_code, r.items_total_fcfa
       FROM reservations r WHERE r.id = ?`
    )
    .get(reservationId)) as
    | {
        id: number; user_id: number; payment_status: string; status: string;
        date: string; time: string; ccm_code: string | null; items_total_fcfa: number | null;
      }
    | undefined;

  if (!reservation || reservation.user_id !== req.user!.id) {
    res.status(404).json({ error: "Reservation not found." });
    return;
  }
  if (reservation.payment_status === "paid") {
    res.status(400).json({ error: "This reservation is already paid." });
    return;
  }
  if (reservation.status === "cancelled") {
    res.status(400).json({ error: "This reservation was cancelled." });
    return;
  }

  /* What this charge is for: the deposit that holds the table, plus whatever
     food and drink was ordered ahead with it. The deposit is read from settings
     at this moment and then frozen onto the reservation, so a price the owner
     changes next week never rewrites what this guest was actually asked for. */
  const depositFcfa = await getDepositFcfa();
  const itemsTotalFcfa = Math.max(0, reservation.items_total_fcfa ?? 0);
  const chargeable = depositFcfa + itemsTotalFcfa;
  await db.prepare("UPDATE reservations SET deposit_fcfa = ? WHERE id = ?").run(depositFcfa, reservationId);

  // Release any earlier attempt still holding discount value, so retrying
  // checkout cannot stack discounts.
  const stale = (await db
    .prepare("SELECT id FROM payments WHERE reservation_id = ? AND status = 'pending'")
    .all(reservationId)) as { id: number }[];
  for (const p of stale) await failPayment(p.id, "SUPERSEDED");

  // ── Claim the discounts ──
  let promoDiscount = 0;
  let claimedPromo: string | null = null;
  if (promoCode) {
    const verdict = await evaluatePromo(promoCode, chargeable);
    if (verdict.ok && (await usePromoCode(promoCode))) {
      promoDiscount = verdict.discount;
      claimedPromo = promoCode;
    }
  }

  let giftDiscount = 0;
  let claimedGift: string | null = null;
  const giftTarget = Math.max(0, chargeable - promoDiscount);
  if (giftCardCode && giftTarget > 0) {
    giftDiscount = await redeemGiftCard(giftCardCode, giftTarget, { type: "reservation", id: reservationId });
    if (giftDiscount > 0) claimedGift = giftCardCode;
  }

  const totalDiscount = promoDiscount + giftDiscount;
  const amountDue = Math.max(0, chargeable - totalDiscount);

  const releaseClaims = async () => {
    if (claimedPromo) await releasePromoCode(claimedPromo);
    if (claimedGift) await refundGiftCard(claimedGift, giftDiscount, { type: "validation_failed", id: reservationId });
  };

  // ── Fully covered by discount: nothing to charge ──
  if (amountDue === 0) {
    const reference = `CCM-${Date.now().toString(36).toUpperCase()}-FREE`;
    const info = await db
      .prepare(
        `INSERT INTO payments (reservation_id, amount_fcfa, momo_phone, status, reference, type, method,
                               promo_code, gift_card_code, discount_fcfa, redeemed_at)
         VALUES (?, 0, '', 'completed', ?, 'reservation', 'free', ?, ?, ?, now_text())`
      )
      .run(reservationId, reference, claimedPromo, claimedGift, totalDiscount);

    await db.prepare(
      "UPDATE reservations SET payment_status = 'paid', status = 'confirmed' WHERE id = ?"
    ).run(reservationId);

    res.status(201).json({
      payment_id: Number(info.lastInsertRowid),
      reference,
      status: "completed",
      amount_fcfa: 0,
      discount_fcfa: totalDiscount,
      method: "free",
      zero_cost: true,
    });
    return;
  }

  // ── Charge the balance over MoMo ──
  if (!momoConfigured()) {
    await releaseClaims();
    res.status(503).json({ error: "Mobile Money payments are not available right now. Please contact us." });
    return;
  }

  const msisdn = toMsisdn(String(req.body?.momoPhone ?? ""));
  if (!msisdn) {
    await releaseClaims();
    res.status(400).json({ error: "Enter a valid MTN number: 9 digits starting with 6." });
    return;
  }

  const externalId = reservation.ccm_code ?? `CCM-${reservationId}`;

  let momoReference: string;
  try {
    momoReference = await requestToPay({
      amount: amountDue,
      msisdn,
      externalId,
      payerMessage: `Cam Chop Meat table deposit`,
      payeeNote: `Booking ${externalId}`,
    });
  } catch (err) {
    await releaseClaims();
    if (err instanceof MomoError) {
      if (err.configuration) console.error("[momo] configuration problem:", err.message);
      res.status(err.configuration ? 503 : 400).json({
        error: err.configuration
          ? "Mobile Money is temporarily unavailable. Please try again shortly."
          : err.message,
      });
      return;
    }
    console.error("[momo] initiate failed:", err);
    res.status(502).json({ error: "Could not reach Mobile Money. Try again in a moment." });
    return;
  }

  const info = await db
    .prepare(
      `INSERT INTO payments (reservation_id, amount_fcfa, momo_phone, status, reference, type, method,
                             promo_code, gift_card_code, discount_fcfa, redeemed_at)
       VALUES (?, ?, ?, 'pending', ?, 'reservation', 'mtn_momo', ?, ?, ?, now_text())`
    )
    .run(reservationId, amountDue, `+${msisdn}`, momoReference, claimedPromo, claimedGift, totalDiscount);

  res.status(201).json({
    payment_id: Number(info.lastInsertRowid),
    reference: momoReference,
    status: "pending",
    amount_fcfa: amountDue,
    discount_fcfa: totalDiscount,
    method: "mtn_momo",
    momo_phone: `+${msisdn}`,
    expires_in_seconds: APPROVAL_WINDOW_SECONDS,
    zero_cost: false,
  });
});

/**
 * Polled by the payment modal while the customer approves on their handset.
 * Asks MoMo only while the payment is still pending, and gives up once the
 * approval window has run out.
 */
paymentsRouter.get("/:reference/status", statusLimit, async (req, res) => {
  const reference = String(req.params.reference ?? "");

  const row = (await db
    .prepare(
      `SELECT p.id, p.status, p.amount_fcfa, p.reference, p.method, p.discount_fcfa,
              p.created_at, p.fail_reason, r.user_id
       FROM payments p JOIN reservations r ON p.reservation_id = r.id
       WHERE p.reference = ?`
    )
    .get(reference)) as
    | (PaymentRow & { user_id: number; method: string; fail_reason: string | null })
    | undefined;

  if (!row || row.user_id !== req.user!.id) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }

  let status = row.status;
  let message: string | null = row.fail_reason ? explainFailure(row.fail_reason) : null;
  const remaining = secondsRemaining(row.created_at);

  if (status === "pending") {
    try {
      const trx = await getTransaction(reference);

      if (trx.status === "SUCCESSFUL") {
        await settlePayment(row.id, trx.financialTransactionId);
        status = "completed";
        message = null;
      } else if (trx.status === "FAILED") {
        await failPayment(row.id, trx.reason);
        status = "failed";
        message = explainFailure(trx.reason);
      } else if (remaining === 0) {
        // Still pending with no time left: MTN will expire it their side too.
        await failPayment(row.id, "EXPIRED");
        status = "failed";
        message = explainFailure("EXPIRED");
      }
    } catch (err) {
      // A failed status check is not a failed payment — report what we have
      // and let the next poll try again.
      if (!(err instanceof MomoError)) console.error("[momo] status check:", err);
    }
  }

  res.json({
    reference: row.reference,
    status,
    amount_fcfa: row.amount_fcfa,
    discount_fcfa: row.discount_fcfa,
    method: row.method,
    message,
    expires_in_seconds: status === "pending" ? remaining : 0,
  });
});

/** Everything the on-screen receipt renders, in one call. */
paymentsRouter.get("/:reference/receipt", async (req, res) => {
  const reference = String(req.params.reference ?? "");

  const row = (await db
    .prepare(
      `SELECT p.amount_fcfa, p.discount_fcfa, p.method, p.status AS pay_status,
              p.momo_phone, p.momo_transaction_id, p.reference, p.updated_at,
              r.id AS reservation_id, r.user_id, r.date, r.time, r.party_size,
              r.phone, r.note, r.ccm_code, r.payment_status,
              t.label AS table_label, u.name AS guest_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN users u ON r.user_id = u.id
       LEFT JOIN restaurant_tables t ON r.table_id = t.id
       WHERE p.reference = ?`
    )
    .get(reference)) as Record<string, unknown> | undefined;

  if (!row) { res.status(404).json({ error: "Receipt not found." }); return; }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin" || req.user!.role === "owner";
  if (row.user_id !== req.user!.id && !isAdmin) {
    res.status(403).json({ error: "Not your receipt." });
    return;
  }

  const paid = Number(row.amount_fcfa) || 0;
  const discount = Number(row.discount_fcfa) || 0;

  res.json({
    receipt: {
      code: row.ccm_code ?? `CCM-${String(row.reservation_id).padStart(5, "0")}`,
      guestName: row.guest_name,
      guestPhone: row.phone,
      date: row.date,
      time: row.time,
      partySize: row.party_size,
      tableLabel: row.table_label,
      note: row.note || null,
      // The deposit before any discount, so the saving is visible on the receipt.
      subtotalFcfa: paid + discount,
      discountFcfa: discount,
      paidFcfa: paid,
      method: row.method,
      momoPhone: row.momo_phone || null,
      reference: row.momo_transaction_id ?? row.reference,
      paidAt: row.pay_status === "completed" ? row.updated_at : null,
      status: row.pay_status === "completed" ? "paid" : row.pay_status === "failed" ? "failed" : "unpaid",
      reservationId: row.reservation_id,
    },
  });
});

/** Lets the customer abandon the attempt without waiting out the window. */
paymentsRouter.post("/:reference/cancel", async (req, res) => {
  const reference = String(req.params.reference ?? "");

  const row = (await db
    .prepare(
      `SELECT p.id, p.status, r.user_id FROM payments p
       JOIN reservations r ON p.reservation_id = r.id WHERE p.reference = ?`
    )
    .get(reference)) as { id: number; status: string; user_id: number } | undefined;

  if (!row || row.user_id !== req.user!.id) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }
  if (row.status !== "pending") {
    res.json({ ok: true, status: row.status });
    return;
  }

  // MoMo has no cancel endpoint; the prompt lapses on the handset. Releasing
  // our side immediately frees the promo use and gift card value.
  await failPayment(row.id, "ABANDONED");
  res.json({ ok: true, status: "failed" });
});

export { settlePayment, failPayment };
