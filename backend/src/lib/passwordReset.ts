import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "../db.js";

/*
 * Password reset by emailed 6-digit code.
 *
 * A 6-digit code is only a million possibilities, so the security here does not
 * come from the code's length. It comes from three limits working together:
 * a short life, a hard cap on wrong guesses, and rate limiting on the route.
 * Remove any one of them and the code becomes guessable.
 */

/** Short, because the code is sitting in an inbox the whole time it is alive. */
export const CODE_TTL_MINUTES = 15;

/** Wrong guesses allowed before the code is destroyed and a new one is needed. */
export const MAX_ATTEMPTS = 5;

export interface IssuedCode {
  /** The plain code. Emailed once, never stored, not recoverable afterwards. */
  code: string;
  expiresAt: string;
}

function hashCode(userId: number, code: string): string {
  // The user id is mixed in so an identical code for two different accounts
  // does not produce the same hash.
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function sqlTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Creates a code for a user, cancelling any earlier unused one so only the most
 * recent email works.
 */
export async function issueCode(userId: number): Promise<IssuedCode> {
  await db.prepare(
    "UPDATE password_resets SET used_at = now_text() WHERE user_id = ? AND used_at IS NULL"
  ).run(userId);

  // randomInt is drawn from the CSPRNG, unlike Math.random.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = sqlTimestamp(new Date(Date.now() + CODE_TTL_MINUTES * 60_000));

  await db.prepare(
    `INSERT INTO password_resets (user_id, token_hash, issued_by, channel, expires_at)
     VALUES (?, ?, NULL, 'email', ?)`
  ).run(userId, hashCode(userId, code), expiresAt);

  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; resetId: number }
  | { ok: false; reason: "no_code" | "expired" | "locked" | "wrong"; attemptsLeft?: number };

/**
 * Checks a code against the account's active reset.
 *
 * A wrong guess is counted; once the cap is reached the code is burned so the
 * attacker has to trigger a new email (which is itself rate limited) to keep
 * going.
 */
export async function verifyCode(userId: number, code: string): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "wrong" };

  const row = (await db
    .prepare(
      `SELECT id, token_hash, attempts, expires_at FROM password_resets
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId)) as unknown as
    | { id: number; token_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!row) return { ok: false, reason: "no_code" };

  const expired = ((await db
    .prepare("SELECT (expires_at <= now_text()) AS gone FROM password_resets WHERE id = ?")
    .get(row.id)) as unknown as { gone: boolean }).gone === true;
  if (expired) {
    await db.prepare("UPDATE password_resets SET used_at = now_text() WHERE id = ?").run(row.id);
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.prepare("UPDATE password_resets SET used_at = now_text() WHERE id = ?").run(row.id);
    return { ok: false, reason: "locked" };
  }

  const expected = Buffer.from(row.token_hash, "hex");
  const supplied = Buffer.from(hashCode(userId, code), "hex");
  const match = expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!match) {
    const attempts = row.attempts + 1;
    await db.prepare("UPDATE password_resets SET attempts = ? WHERE id = ?").run(attempts, row.id);
    if (attempts >= MAX_ATTEMPTS) {
      await db.prepare("UPDATE password_resets SET used_at = now_text() WHERE id = ?").run(row.id);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  return { ok: true, resetId: row.id };
}

export async function consumeReset(id: number) {
  await db.prepare("UPDATE password_resets SET used_at = now_text() WHERE id = ?").run(id);
}

/** Clears rows that can never be used again, so the table does not grow forever. */
export async function purgeExpiredResets() {
  await db.prepare(
    "DELETE FROM password_resets WHERE used_at IS NOT NULL OR expires_at <= to_char(now() AT TIME ZONE 'utc' - interval '7 days', 'YYYY-MM-DD HH24:MI:SS')"
  ).run();
}
