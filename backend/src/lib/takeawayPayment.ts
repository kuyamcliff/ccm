import { db } from "../db.js";
import { releasePromoCode } from "../routes/promos.js";
import { refundGiftCard } from "../routes/giftcards.js";
import { refundPoints } from "../routes/loyalty.js";

/** Returns promo, gift-card and loyalty value held by an unpaid takeaway order. */
export async function releaseTakeawayPaymentValue(orderId: number, reason: string): Promise<void> {
  const row = (await db.prepare(
    `SELECT promo_code, gift_card_code, gift_fcfa, points_spent, redeemed_at, user_id, discount_fcfa
     FROM takeaway_orders WHERE id = ?`
  ).get(orderId)) as
    | { promo_code: string | null; gift_card_code: string | null; gift_fcfa: number | null; points_spent: number; redeemed_at?: string | null; user_id: number | null; discount_fcfa: number }
    | undefined;

  if (!row) return;

  if (row.promo_code) {
    await releasePromoCode(row.promo_code);
  }

  const giftPortion = row.gift_fcfa ?? row.discount_fcfa;
  if (row.gift_card_code && giftPortion > 0) {
    await refundGiftCard(row.gift_card_code, giftPortion, { type: reason, id: orderId });
  }

  if (row.points_spent > 0) {
    const returned = await refundPoints(row.user_id, row.points_spent, { type: reason, id: orderId });
    if (returned > 0) {
      await db.prepare("UPDATE takeaway_orders SET points_spent = 0 WHERE id = ?").run(orderId);
    }
  }

  await db.prepare(
    "UPDATE takeaway_orders SET payment_status = 'failed', fail_reason = ?, momo_reference = NULL, payment_method = NULL, pay_requested_at = NULL, idempotency_key = NULL WHERE id = ?"
  ).run(reason, orderId);
}
