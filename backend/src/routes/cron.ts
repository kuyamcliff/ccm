import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "../db.js";
import { CRON_SECRET, FRONTEND_URL } from "../config.js";
import { notify } from "../lib/notify.js";
import { bookingReminder } from "../lib/messages.js";

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

interface DueBooking {
  id: number;
  user_id: number | null;
  date: string;
  time: string;
  party_size: number;
  phone: string | null;
  ccm_code: string | null;
  table_label: string | null;
  guest_name: string;
}

/**
 * Bookings sitting inside a window, that have not had this reminder yet.
 *
 * The window is expressed against `date` and `time` as the text they are stored
 * as, joined into a timestamp for the comparison. `notifications` is left joined
 * on the template so an already-reminded booking drops out in the same query
 * rather than in a second round trip per booking.
 */
async function due(template: string, fromMinutes: number, toMinutes: number): Promise<DueBooking[]> {
  return (await db
    .prepare(
      `SELECT r.id, r.user_id, r.date, r.time, r.party_size, r.phone, r.ccm_code,
              t.label AS table_label, u.name AS guest_name
         FROM reservations r
         LEFT JOIN restaurant_tables t ON t.id = r.table_id
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.status = 'confirmed'
          AND r.phone IS NOT NULL
          AND (r.date || ' ' || r.time || ':00')::timestamp
              BETWEEN (now() AT TIME ZONE 'UTC') + (? || ' minutes')::interval
                  AND (now() AT TIME ZONE 'UTC') + (? || ' minutes')::interval
          AND NOT EXISTS (
                SELECT 1 FROM notifications n
                 WHERE n.reservation_id = r.id
                   AND n.template = ?
                   AND n.status IN ('sent', 'logged')
              )`
    )
    .all(String(fromMinutes), String(toMinutes), template)) as unknown as DueBooking[];
}

async function send(bookings: DueBooking[], template: string, soon: boolean) {
  let sent = 0;

  for (const booking of bookings) {
    if (!booking.phone) continue;

    const body = bookingReminder({
      name: (booking.guest_name || "Hello").split(/\s+/)[0] ?? "Hello",
      date: booking.date,
      time: booking.time,
      partySize: booking.party_size,
      tableLabel: booking.table_label,
      code: booking.ccm_code ?? "",
      soon,
      /* Straight to their own bookings, where cancelling is one tap. */
      manageUrl: `${FRONTEND_URL}/mine`,
    });

    const result = await notify({
      to: booking.phone,
      template,
      body,
      userId: booking.user_id,
      reservationId: booking.id,
    });

    if (result.status === "sent" || result.status === "logged") sent += 1;
  }

  return sent;
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
    const dayBefore = await due("booking_reminder_24h", 23 * 60, 24 * 60);
    const soonAfter = await due("booking_reminder_3h", 2 * 60, 3 * 60);

    const [tomorrow, shortly] = await Promise.all([
      send(dayBefore, "booking_reminder_24h", false),
      send(soonAfter, "booking_reminder_3h", true),
    ]);

    res.json({ ok: true, sent: { day_before: tomorrow, three_hours: shortly } });
  } catch (err) {
    console.error("[cron] reminder sweep failed", err);
    res.status(500).json({ error: "The sweep failed." });
  }
});
