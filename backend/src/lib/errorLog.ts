/**
 * The last few hundred failures, in memory.
 *
 * ── What this is for ───────────────────────────────────────────────────────
 *
 * Every 500 hands the customer a short code and logs the same code beside the
 * stack, so "it said CCM-7F42" is enough to find the exact failure. That only
 * works if somebody can get at the logs. On a hosted platform, at eight in the
 * evening, from a phone, they cannot. This keeps the recent ones somewhere the
 * developer screen can read them.
 *
 * ── Why in memory, and what that costs ─────────────────────────────────────
 *
 * Deliberately not a database table. Writing a row on every failure means the
 * error path now depends on the database, and the most common reason for a burst
 * of 500s is the database. An error logger that fails when things are broken is
 * an error logger for the times you do not need one.
 *
 * The cost is real and worth stating plainly, because the screen that reads this
 * says it out loud: this is per-instance and it does not survive a restart. It
 * answers "what just went wrong", not "what went wrong last Tuesday".
 *
 * ── What is deliberately not kept ──────────────────────────────────────────
 *
 * No request bodies, no headers, no cookies, no query strings. A booking payload
 * has somebody's phone number in it and a login body has their password; putting
 * either into a buffer that a screen renders would be inventing a place for
 * personal data to leak from. The method, the path, the message and the stack
 * are enough to find a bug.
 */

export interface LoggedError {
  reference: string;
  at: string;
  method: string;
  /** The route pattern where Express knows it, or the raw path. Never includes
      a query string: those carry search terms and tokens. */
  path: string;
  status: number;
  message: string;
  stack: string | null;
}

/** Enough to cover a bad evening, small enough to be free. */
const LIMIT = 200;

const entries: LoggedError[] = [];

export function recordError(input: Omit<LoggedError, "at">): void {
  entries.unshift({ ...input, at: new Date().toISOString() });
  if (entries.length > LIMIT) entries.length = LIMIT;
}

/** Newest first. Returns a copy so a caller cannot mutate the buffer. */
export function recentErrors(limit = 50): LoggedError[] {
  return entries.slice(0, Math.min(limit, LIMIT));
}

export function errorCount(): number {
  return entries.length;
}

/** For the test suite, and for a developer who has read them and wants a clean
    slate before reproducing something. */
export function clearErrors(): void {
  entries.length = 0;
}
