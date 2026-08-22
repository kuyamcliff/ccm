import { db } from "../db.js";
import { FRONTEND_URL } from "../config.js";
import { notify } from "./notify.js";
import { bookingReminder } from "./messages.js";

/**
 * The reminder sweep itself, away from the route that triggers it.
 *
 * Pulled out of `routes/cron.ts` because there are now two callers with two
 * different reasons to exist, and neither should own the other's code:
 *
 *   - the platform's scheduler, hourly, proving itself with a shared secret;
 *   - a developer in the console, pressing a button, proving themselves with a
 *     session.
 *
 * That second caller is the point. Reminders are the one feature here that
 * nobody can tell is working by looking at the site: they either go out at
 * three in the morning or they silently do not. Being able to run the sweep by
 * hand and read back exactly what it sent is the difference between a feature
 * that is deployed and a feature that is known to work.
 *
 * The windows and the deduplication are unchanged, and they are what make a
 * manual run safe: a booking already reminded is dropped by the query itself,
 * so pressing the button twice sends nothing the second time.
 */

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
 * Runs both windows and reports what went.
 *
 * Returns counts rather than logging them, so the caller decides what to do
 * with the answer: the cron route puts it in a JSON body nobody reads, and the
 * console puts it on a screen somebody is watching.
 */
export async function runReminderSweep(): Promise<{ day_before: number; three_hours: number }> {
  const dayBefore = await due("booking_reminder_24h", 23 * 60, 24 * 60);
  const soonAfter = await due("booking_reminder_3h", 2 * 60, 3 * 60);

  const [day_before, three_hours] = await Promise.all([
    send(dayBefore, "booking_reminder_24h", false),
    send(soonAfter, "booking_reminder_3h", true),
  ]);

  return { day_before, three_hours };
}
