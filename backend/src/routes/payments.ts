import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { MomoError } from "../lib/momo.js";
import { startOrangePayment } from "../lib/orange.js";
import { APPROVAL_WINDOW_SECONDS, WALLETS, availableWallets, walletFor } from "../lib/wallets.js";
import type { Wallet, WalletId } from "../lib/wallets.js";
import * as ledger from "../lib/paymentLedger.js";
import { redeemGiftCard, refundGiftCard } from "./giftcards.js";
import { evaluatePromo, releasePromoCode, usePromoCode } from "./promos.js";
import { refundPoints, spendPoints } from "./loyalty.js";
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

async function settlePayment(
  paymentId: number,
  financialTransactionId?: string | null,
  trail: { source: ledger.LedgerSource; providerEventId?: string | null } = { source: "poll" }
): Promise<boolean> {
  const won = await db
    .prepare(
      "UPDATE payments SET status = 'completed', updated_at = now_text() WHERE id = ? AND status != 'completed'"
    )
    .run(paymentId);

  if (won.changes !== 1) return false;

  if (financialTransactionId) {
    await db.prepare("UPDATE payments SET momo_transaction_id = ? WHERE id = ?").run(financialTransactionId, paymentId);
  }

  /* Appended only on the transition the conditional UPDATE above actually won,
     so the ledger records one settlement no matter how many pollers and
     webhooks arrive at the same conclusion at the same moment. */
  await ledger.record({
    paymentId,
    status: "completed",
    source: trail.source,
    providerEventId: trail.providerEventId,
    detail: financialTransactionId ?? null,
  });

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
async function failPayment(
  paymentId: number,
  reason?: string | null,
  trail: { source: ledger.LedgerSource; providerEventId?: string | null } = { source: "poll" }
): Promise<void> {
  const lost = await db
    .prepare(
      "UPDATE payments SET status = 'failed', updated_at = now_text(), fail_reason = ? WHERE id = ? AND status = 'pending'"
    )
    .run(reason ?? null, paymentId);

  if (lost.changes !== 1) return;

  await ledger.record({
    paymentId,
    status: "failed",
    source: trail.source,
    providerEventId: trail.providerEventId,
    detail: reason ?? null,
  });

  const row = (await db
    .prepare(
      /* LEFT, not an inner join. The guest is only needed to hand points back;
         a payment whose booking somehow cannot be resolved must still return
         the promo use and the gift card value it was holding, which an inner
         join would have quietly stopped doing. */
      `SELECT p.promo_code, p.gift_card_code, p.discount_fcfa, p.gift_fcfa, p.points_spent,
              p.redeemed_at, r.user_id
       FROM payments p LEFT JOIN reservations r ON p.reservation_id = r.id
       WHERE p.id = ?`
    )
    .get(paymentId)) as
    | (PaymentRow & { gift_fcfa: number | null; points_spent: number; user_id: number | null })
    | undefined;
  if (!row?.redeemed_at) return;

  if (row.promo_code) await releasePromoCode(row.promo_code);
  /* Only what the card itself covered. `discount_fcfa` is every discount added
     together, and handing all of it back to the card credited it with the promo
     code's value too. See the `gift_fcfa` note in migrate-schema.ts. */
  const giftPortion = row.gift_fcfa ?? row.discount_fcfa;
  if (row.gift_card_code && giftPortion > 0) {
    await refundGiftCard(row.gift_card_code, giftPortion, { type: "payment_failed", id: paymentId });
  }
  if (row.points_spent > 0) {
    await refundPoints(row.user_id, row.points_spent, { type: "payment_failed", id: paymentId });
  }
  /* Clearing `redeemed_at` is the single-shot guard for all three: this whole
     block is skipped on any later call, so a webhook redelivered after the
     modal already gave up cannot hand the same value back twice. */
  await db.prepare("UPDATE payments SET redeemed_at = NULL, points_spent = 0 WHERE id = ?").run(paymentId);
}

/** Seconds left in the customer's approval window for a pending payment. */
function secondsRemaining(createdAt: string): number {
  const started = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, APPROVAL_WINDOW_SECONDS - Math.floor((Date.now() - started) / 1000));
}

// ---------- routes ----------

/*
 * Where the wallet tells us the money moved.
 *
 * Deliberately above `requireAuth`: the caller is MTN or Orange, not a signed
 * in guest, so there is no cookie and never will be. That makes this the only
 * route on the site where an anonymous request can mark a booking paid, and
 * the whole of its defence is the signature — being reachable only from "the
 * payment provider's network" is not a thing the internet can promise.
 *
 * Three rules, in order:
 *   verify the signature, or record nothing;
 *   refuse an event id already in the ledger, because wallets retry until they
 *   get a 2xx and a retry is not a second payment;
 *   answer 200 to anything genuine, including a duplicate, so the wallet stops
 *   retrying rather than escalating a delivery we have already handled.
 */
/* Generous, because a busy night is a lot of genuine deliveries and a wallet
   that gets throttled will retry. Tight enough that somebody grinding at the
   signature check is not doing it for free. Keyed per provider rather than per
   IP, since a wallet's callbacks arrive from addresses we do not control. */
const webhookLimit = rateLimit("payment-webhook", {
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many webhook deliveries.",
  key: (req) => String(req.params?.provider ?? "unknown"),
});

paymentsRouter.post("/webhook/:provider", webhookLimit, async (req, res) => {
  const wallet = walletFor(req.params.provider);
  if (!wallet) {
    res.status(404).json({ error: "Unknown payment provider." });
    return;
  }

  const event = wallet.verifyWebhook(req);
  if (!event) {
    /* Deliberately terse. A caller who cannot sign a request is told nothing
       about why, since the difference between "no secret configured", "bad
       signature" and "malformed body" is only useful to somebody guessing. */
    console.warn(`[${wallet.id}] rejected an unverified webhook delivery`);
    res.status(401).json({ error: "Signature rejected." });
    return;
  }

  if (await ledger.alreadySeen(event.eventId)) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  const row = (await db
    .prepare("SELECT id, status FROM payments WHERE reference = ?")
    .get(event.reference)) as { id: number; status: string } | undefined;

  /* A signed event for a payment we have no record of. 200 anyway: retrying
     will not conjure the row, and a wallet that keeps redelivering forever is
     noise on top of a problem that needs a person. */
  if (!row) {
    console.error(`[${wallet.id}] webhook for unknown reference ${event.reference}`);
    res.json({ ok: true, unknown: true });
    return;
  }

  const trail = { source: "webhook" as const, providerEventId: event.eventId };

  if (event.status === "SUCCESSFUL") {
    await settlePayment(row.id, event.providerTransactionId, trail);
  } else {
    await failPayment(row.id, event.reason ?? "FAILED", trail);
  }

  res.json({ ok: true });
});

paymentsRouter.use(requireAuth);

/** Which wallets checkout may offer. Read by the payment screen so a wallet
 *  without credentials is never shown rather than failing when tapped. */
paymentsRouter.get("/wallets", (_req, res) => {
  res.json({ wallets: availableWallets() });
});

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

/**
 * The response a completed attempt produced, rebuilt from the row.
 *
 * A replayed request has to be answered with what the first one said, not with
 * a fresh attempt, so the client that never saw the original response is told
 * about the payment it already started rather than starting another.
 */
function describePayment(row: {
  id: number; reference: string; status: string; amount_fcfa: number;
  discount_fcfa: number; points_spent: number; method: string; momo_phone: string; created_at: string;
}) {
  return {
    payment_id: row.id,
    reference: row.reference,
    status: row.status === "initiated" ? "pending" : row.status,
    amount_fcfa: row.amount_fcfa,
    discount_fcfa: row.discount_fcfa,
    points_spent: row.points_spent,
    method: row.method,
    momo_phone: row.momo_phone || null,
    expires_in_seconds: row.status === "pending" ? secondsRemaining(row.created_at) : 0,
    zero_cost: row.amount_fcfa === 0,
  };
}

paymentsRouter.post("/initiate", initiateLimit, async (req, res) => {
  const reservationId = Number(req.body?.reservationId);
  const promoCode = String(req.body?.promoCode ?? "").trim().toUpperCase();
  const giftCardCode = String(req.body?.giftCardCode ?? "").trim().toUpperCase();
  const usePoints = req.body?.usePoints === true;

  if (!Number.isInteger(reservationId) || reservationId < 1) {
    res.status(400).json({ error: "Invalid reservation." });
    return;
  }

  /*
   * The idempotency key, generated by the browser before the first attempt and
   * resent unchanged with every retry of it.
   *
   * This is the difference between a customer on a weak connection retrying a
   * request and a customer being charged twice. The phone that sends the
   * request, loses the response, and sends it again is indistinguishable here
   * from one asking to pay a second time — unless it says which of the two it
   * meant, which is all this header is.
   */
  /* A client that does not send one still gets served, with a key minted here.
     That gives it no protection against its own retries — exactly the position
     everything was in before this existed — but it is better than a checkout
     that returns 400. The frontend and the API deploy separately and a service
     worker can hold an old build for a while, so for a window after this ships
     there are real customers running a frontend that has never heard of this
     header. Refusing them would be an outage in the one place that takes
     money. Tighten to a hard 400 once the old builds have aged out. */
  const idempotencyKey =
    String(req.get("idempotency-key") ?? "").trim().slice(0, 100) || `legacy-${randomUUID()}`;

  const replay = (await db
    .prepare(
      `SELECT p.id, p.reference, p.status, p.amount_fcfa, p.discount_fcfa, p.points_spent,
              p.method, p.momo_phone, p.created_at, r.user_id
       FROM payments p JOIN reservations r ON p.reservation_id = r.id
       WHERE p.idempotency_key = ?`
    )
    .get(idempotencyKey)) as
    | (Parameters<typeof describePayment>[0] & { user_id: number })
    | undefined;

  if (replay) {
    // Somebody else's key. Answered as if it simply is not there.
    if (replay.user_id !== req.user!.id) {
      res.status(404).json({ error: "Reservation not found." });
      return;
    }
    res.status(200).json({ ...describePayment(replay), replayed: true });
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

  /* Points before the gift card, so a card is only drawn down for what is still
     owed once everything free has been used. Value on a card was paid for by
     somebody; points were not. */
  let pointsSpent = 0;
  let pointsDiscount = 0;
  if (usePoints) {
    const spend = await spendPoints(req.user!.id, Math.max(0, chargeable - promoDiscount), {
      type: "reservation",
      id: reservationId,
    });
    pointsSpent = spend.points;
    pointsDiscount = spend.value_fcfa;
  }

  let giftDiscount = 0;
  let claimedGift: string | null = null;
  const giftTarget = Math.max(0, chargeable - promoDiscount - pointsDiscount);
  if (giftCardCode && giftTarget > 0) {
    giftDiscount = await redeemGiftCard(giftCardCode, giftTarget, { type: "reservation", id: reservationId });
    if (giftDiscount > 0) claimedGift = giftCardCode;
  }

  const totalDiscount = promoDiscount + pointsDiscount + giftDiscount;
  const amountDue = Math.max(0, chargeable - totalDiscount);

  const releaseClaims = async () => {
    if (claimedPromo) await releasePromoCode(claimedPromo);
    if (claimedGift) await refundGiftCard(claimedGift, giftDiscount, { type: "validation_failed", id: reservationId });
    if (pointsSpent > 0) await refundPoints(req.user!.id, pointsSpent, { type: "validation_failed", id: reservationId });
  };

  // ── Fully covered by discount: nothing to charge ──
  if (amountDue === 0) {
    const reference = `CCM-${randomUUID()}`;
    const info = await db
      .prepare(
        `INSERT INTO payments (reservation_id, amount_fcfa, momo_phone, status, reference, type, method,
                               promo_code, gift_card_code, discount_fcfa, gift_fcfa, points_spent,
                               redeemed_at, idempotency_key)
         VALUES (?, 0, '', 'completed', ?, 'reservation', 'free', ?, ?, ?, ?, ?, now_text(), ?)`
      )
      .run(reservationId, reference, claimedPromo, claimedGift, totalDiscount, giftDiscount, pointsSpent, idempotencyKey);

    const paymentId = Number(info.lastInsertRowid);
    await ledger.record({ paymentId, status: "completed", source: "checkout", detail: "covered by discount" });

    await db.prepare(
      "UPDATE reservations SET payment_status = 'paid', status = 'confirmed' WHERE id = ?"
    ).run(reservationId);

    res.status(201).json({
      payment_id: paymentId,
      reference,
      status: "completed",
      amount_fcfa: 0,
      discount_fcfa: totalDiscount,
      points_spent: pointsSpent,
      method: "free",
      zero_cost: true,
    });
    return;
  }

  // ── Charge the balance to a mobile wallet ──
  const wallet: Wallet | null = walletFor(req.body?.wallet) ?? WALLETS.mtn_momo;

  if (!wallet.configured()) {
    await releaseClaims();
    res.status(503).json({ error: `${wallet.label} payments are not available right now. Please contact us.` });
    return;
  }

  const msisdn = wallet.toMsisdn(String(req.body?.momoPhone ?? req.body?.phone ?? ""));
  if (!msisdn) {
    await releaseClaims();
    res.status(400).json({ error: `Enter a valid ${wallet.network} number: 9 digits starting with 6.` });
    return;
  }

  const externalId = reservation.ccm_code ?? `CCM-${reservationId}`;

  /*
   * The intent goes in the ledger before the wallet is called, not after.
   *
   * If the order were the other way round — charge, then write the row — a
   * process that died in between would leave a customer debited with nothing
   * here to show for it, and no reference to reconcile against. Written first,
   * the worst case is a row marked `initiated` that never went anywhere, which
   * is visible, reconcilable and costs nobody money.
   *
   * The reference is generated here for the same reason: the wallet needs to
   * be given a key it can recognise on a retry, and it cannot be given one we
   * have not stored.
   */
  const reference = `CCM-${randomUUID()}`;

  let paymentId: number;
  try {
    const info = await db
      .prepare(
        `INSERT INTO payments (reservation_id, amount_fcfa, momo_phone, status, reference, type, method,
                               promo_code, gift_card_code, discount_fcfa, gift_fcfa, points_spent,
                               redeemed_at, idempotency_key)
         VALUES (?, ?, ?, 'initiated', ?, 'reservation', ?, ?, ?, ?, ?, ?, now_text(), ?)`
      )
      .run(
        reservationId, amountDue, `+${msisdn}`, reference, wallet.id,
        claimedPromo, claimedGift, totalDiscount, giftDiscount, pointsSpent, idempotencyKey
      );
    paymentId = Number(info.lastInsertRowid);
  } catch (err) {
    /* Two retries of the same request raced and the other one won the unique
       index. That is the mechanism working: hand back its payment rather than
       starting a second charge. */
    if (err && typeof err === "object" && "code" in err && String((err as { code: unknown }).code) === "23505") {
      await releaseClaims();
      const winner = (await db
        .prepare(
          `SELECT id, reference, status, amount_fcfa, discount_fcfa, points_spent, method,
                  momo_phone, created_at
           FROM payments WHERE idempotency_key = ?`
        )
        .get(idempotencyKey)) as Parameters<typeof describePayment>[0] | undefined;
      if (winner) {
        res.status(200).json({ ...describePayment(winner), replayed: true });
        return;
      }
    }
    throw err;
  }

  await ledger.record({ paymentId, status: "initiated", source: "checkout", detail: `${wallet.id} ${amountDue}` });

  const charge = {
    amount: amountDue,
    msisdn,
    reference,
    externalId,
    payerMessage: "Cam Chop Meat table deposit",
    payeeNote: `Booking ${externalId}`,
  };

  /* Orange hands back a URL the customer has to open; MTN pushes a prompt to
     the handset and there is nothing to open. The one extra field is the whole
     difference at this layer. */
  let paymentUrl: string | null = null;

  try {
    if (wallet.id === "orange_money") {
      paymentUrl = (await startOrangePayment(charge)).paymentUrl;
    } else {
      await wallet.charge(charge);
    }
  } catch (err) {
    await releaseClaims();
    /* The row is still `initiated` here, which `failPayment` deliberately will
       not act on, so the discounts have just been handed back by
       `releaseClaims` and nothing else will. Clearing the record of them is
       what stops a later reconciliation returning the same value again. */
    await db
      .prepare("UPDATE payments SET redeemed_at = NULL, points_spent = 0 WHERE id = ?")
      .run(paymentId);
    await failPayment(paymentId, "PROVIDER_REFUSED", { source: "checkout" });

    const configuration = err instanceof MomoError ? err.configuration : false;
    const message = err instanceof Error ? err.message : "";
    if (configuration) console.error(`[${wallet.id}] configuration problem:`, message);
    else console.error(`[${wallet.id}] initiate failed:`, err);

    res.status(configuration ? 503 : 400).json({
      error: configuration
        ? `${wallet.label} is temporarily unavailable. Please try again shortly.`
        : message || "Could not start that payment. Try again in a moment.",
    });
    return;
  }

  await db
    .prepare("UPDATE payments SET status = 'pending', updated_at = now_text() WHERE id = ? AND status = 'initiated'")
    .run(paymentId);
  await ledger.record({ paymentId, status: "pending", source: "checkout", detail: reference });

  res.status(201).json({
    payment_id: paymentId,
    reference,
    status: "pending",
    amount_fcfa: amountDue,
    discount_fcfa: totalDiscount,
    points_spent: pointsSpent,
    method: wallet.id,
    momo_phone: `+${msisdn}`,
    payment_url: paymentUrl,
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

  /* Which wallet took this payment. `free` rows never had one, and a row
     written before wallets existed is MTN by definition. */
  const wallet = walletFor(row.method);

  let status = row.status;
  let message: string | null =
    row.fail_reason && wallet ? wallet.explainFailure(row.fail_reason) : null;
  const remaining = secondsRemaining(row.created_at);

  if (wallet && (status === "pending" || status === "initiated")) {
    try {
      const trx = await wallet.getTransaction(reference);

      if (trx.status === "SUCCESSFUL") {
        await settlePayment(row.id, trx.providerTransactionId, { source: "poll" });
        status = "completed";
        message = null;
      } else if (trx.status === "FAILED") {
        await failPayment(row.id, trx.reason, { source: "poll" });
        status = "failed";
        message = wallet.explainFailure(trx.reason);
      } else if (remaining === 0) {
        // Still pending with no time left: the wallet will expire it too.
        await failPayment(row.id, "EXPIRED", { source: "poll" });
        status = "failed";
        message = wallet.explainFailure("EXPIRED");
      }
    } catch (err) {
      // A failed status check is not a failed payment — report what we have
      // and let the next poll try again.
      if (!(err instanceof MomoError)) console.error(`[${row.method}] status check:`, err);
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
