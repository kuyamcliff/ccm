import { db } from "../db.js";
import { failPayment } from "../routes/payments.js";

/**
 * Closing an account, from either direction: the guest doing it themselves or
 * an admin doing it for them.
 *
 * This was `DELETE FROM users WHERE id = ?` in both places, and that was wrong
 * twice over.
 *
 * It did not work. `reservations.user_id` cascades from `users`, but
 * `payments.reservation_id` does not cascade from `reservations`, so deleting
 * anybody who had ever paid hit a foreign key violation and returned a 500.
 * Every guest who had actually used the restaurant was unable to close their
 * account, and the console could not close it for them.
 *
 * And where it did work, it worked too well. A guest who had never paid lost
 * their bookings and their points ledger, and any Mobile Money prompt still
 * live on their handset was left running — approve it a minute later and the
 * money moves against a booking that no longer exists.
 *
 * So the order is: settle what is in flight, release what is being held, take
 * away what is personal, and leave a shell nobody can sign into holding the
 * rows the restaurant needs for its own books. A customer asking to be
 * forgotten is not asking the restaurant to forget what it was paid.
 */
export async function closeAccount(userId: number): Promise<void> {
  /* Anything still in flight, first and before anything else is touched.
     `failPayment` is also what hands back a promo use and any gift card value
     the attempt was holding, which a plain delete stranded. */
  const live = (await db
    .prepare(
      `SELECT p.id FROM payments p JOIN reservations r ON p.reservation_id = r.id
       WHERE r.user_id = ? AND p.status IN ('pending', 'initiated')`
    )
    .all(userId)) as { id: number }[];
  for (const p of live) await failPayment(p.id, "ACCOUNT_CLOSED", { source: "customer" });

  /* A table held for somebody who is not coming. Cancelled rather than
     deleted, so the evening's history still shows what was booked. */
  await db
    .prepare(
      `UPDATE reservations SET status = 'cancelled'
       WHERE user_id = ? AND status NOT IN ('cancelled', 'finished')`
    )
    .run(userId);

  // Their own words leave with them. The restaurant's records do not.
  await db.prepare("DELETE FROM review_votes WHERE user_id = ?").run(userId);
  await db.prepare("DELETE FROM review_replies WHERE user_id = ?").run(userId);
  await db.prepare("DELETE FROM reviews WHERE user_id = ?").run(userId);
  await db.prepare("DELETE FROM user_passkeys WHERE user_id = ?").run(userId);

  /* Empty the row. The address has to stay unique and must never collide with
     a real one, so it moves to a domain that cannot exist — which also frees
     the original address, should they ever come back. Bumping
     `session_version` kills every token already issued. */
  await db
    .prepare(
      `UPDATE users
       SET name = 'Deleted guest', email = ?, password_hash = '',
           totp_enabled = 0, totp_secret = NULL, deleted_at = now_text(),
           session_version = session_version + 1
       WHERE id = ?`
    )
    .run(`deleted-${userId}@deleted.invalid`, userId);
}
