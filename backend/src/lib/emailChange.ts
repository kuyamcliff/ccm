import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "../db.js";

/*
 * Changing the email on an account, proven by a code sent to the address you
 * are changing it *to*.
 *
 * The current password already proves this is the account holder, at the
 * point they ask for the change. What it cannot prove is that they typed the
 * new address correctly, or that it is an inbox they actually control — and
 * getting that wrong quietly locks them out of password reset, the one
 * recovery path that depends on the email being right. The code closes that
 * gap the same way password reset itself does: short life, a hard cap on
 * wrong guesses, one live code per account at a time.
 */

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export interface IssuedEmailChange {
  code: string;
  expiresAt: string;
}

function hashCode(userId: number, code: string): string {
  return createHash("sha256").update(`email-change:${userId}:${code}`).digest("hex");
}

function sqlTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/** Starts a change, cancelling any earlier unused one so only the most recent
    email — and the address it names — is live. */
export async function issueEmailChangeCode(userId: number, newEmail: string): Promise<IssuedEmailChange> {
  await db.prepare("UPDATE email_changes SET used_at = now_text() WHERE user_id = ? AND used_at IS NULL").run(userId);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = sqlTimestamp(new Date(Date.now() + CODE_TTL_MINUTES * 60_000));

  await db
    .prepare(
      `INSERT INTO email_changes (user_id, new_email, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, newEmail, hashCode(userId, code), expiresAt);

  return { code, expiresAt };
}

export type VerifyEmailChangeResult =
  | { ok: true; newEmail: string }
  | { ok: false; reason: "no_code" | "expired" | "locked" | "wrong"; attemptsLeft?: number };

/** Checks a code against the account's pending change, and hands back the
    address it was for — the caller applies it, this module only proves the
    code was right. */
export async function verifyEmailChangeCode(userId: number, code: string): Promise<VerifyEmailChangeResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "wrong" };

  const row = (await db
    .prepare(
      `SELECT id, new_email, token_hash, attempts, expires_at FROM email_changes
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId)) as unknown as
    | { id: number; new_email: string; token_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!row) return { ok: false, reason: "no_code" };

  const expired =
    ((await db.prepare("SELECT (expires_at <= now_text()) AS gone FROM email_changes WHERE id = ?").get(row.id)) as unknown as {
      gone: boolean;
    }).gone === true;
  if (expired) {
    await db.prepare("UPDATE email_changes SET used_at = now_text() WHERE id = ?").run(row.id);
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db.prepare("UPDATE email_changes SET used_at = now_text() WHERE id = ?").run(row.id);
    return { ok: false, reason: "locked" };
  }

  const expected = Buffer.from(row.token_hash, "hex");
  const supplied = Buffer.from(hashCode(userId, code), "hex");
  const match = expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!match) {
    const attempts = row.attempts + 1;
    await db.prepare("UPDATE email_changes SET attempts = ? WHERE id = ?").run(attempts, row.id);
    if (attempts >= MAX_ATTEMPTS) {
      await db.prepare("UPDATE email_changes SET used_at = now_text() WHERE id = ?").run(row.id);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "wrong", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  await db.prepare("UPDATE email_changes SET used_at = now_text() WHERE id = ?").run(row.id);
  return { ok: true, newEmail: row.new_email };
}

/** Clears rows that can never be used again, so the table does not grow
    forever — the same housekeeping password_resets already does. */
export async function purgeExpiredEmailChanges() {
  await db
    .prepare(
      "DELETE FROM email_changes WHERE used_at IS NOT NULL OR expires_at <= to_char(now() AT TIME ZONE 'utc' - interval '7 days', 'YYYY-MM-DD HH24:MI:SS')"
    )
    .run();
}
