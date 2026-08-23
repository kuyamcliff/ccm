import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { CRON_SECRET } from "../config.js";
import { runReminderSweep } from "../lib/reminderSweep.js";

export const cronRouter = Router();

/**
 * The reminder sweep.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `lib/notify.ts` has been a finished WhatsApp and SMS sender for months, with a
 * notifications table and normalised Cameroonian numbers, and exactly three
 * messages ever used it. Nothing was ever sent *ahead* of time, because there
 * was no scheduler anywhere in the backend.
 *
 * That gap is expensive. A deposit protects the money on a no-show; it does not
 * protect the table, and a table held for somebody who never arrives is a table
 * the queue outside could have had. Reminders are the most studied lever in this
 * industry and a 24 hour reminder alone moves no-shows substantially.
 *
 * ── Why a route and not setInterval ────────────────────────────────────────
 *
 * An in-process timer dies with the dyno, and doubles up the moment there is
 * more than one instance: every guest gets two texts. A route called by the
 * platform's own scheduler has neither problem, is visible when it fails, and
 * can be triggered by hand when somebody wants to check it works.
 *
 * ── Sending each reminder exactly once ─────────────────────────────────────
 *
 * There is no "reminded" column, and deliberately so: adding one would be a
 * second source of truth about something `notifications` already records. The
 * sweep asks that table directly. If a row exists for this template and this
 * reservation, the message went, and it does not go again. That holds however
 * often this is called, which matters because "call it more often to be safe" is
 * exactly what somebody will do.
 */

/** Compares in constant time, and survives a length mismatch without throwing. */
function secretMatches(given: string): boolean {
  if (!CRON_SECRET) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(CRON_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Called by the platform's scheduler, hourly.
 *
 * The windows are an hour wide and are matched to that cadence: a booking is
 * caught by exactly one run of each sweep. Running it more often than hourly is
 * harmless because of the `notifications` check, and running it less often means
 * some bookings fall between the windows and get no reminder at all.
 */
cronRouter.post("/reminders", async (req, res) => {
  const given = String(req.get("x-cron-secret") ?? "");
  if (!secretMatches(given)) {
    /* Says nothing about whether a secret is configured. */
    res.status(401).json({ error: "Not authorised." });
    return;
  }

  try {
    res.json({ ok: true, sent: await runReminderSweep() });
  } catch (err) {
    console.error("[cron] reminder sweep failed", err);
    res.status(500).json({ error: "The sweep failed." });
  }
});
