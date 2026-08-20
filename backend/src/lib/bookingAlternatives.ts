import { db } from "../db.js";
import { ALTERNATIVE_LIMIT, nearbySlots } from "./bookingSlots.js";

/**
 * What to offer somebody whose slot was taken a second before they tapped pay.
 *
 * A bare "that table is already reserved" sends the guest back to the floor
 * plan to work out for themselves what is left, on a phone, having already
 * filled in four steps. These are the two answers they were about to go
 * looking for: the same table at a time close to the one they wanted, and the
 * tables that are still free at the time they wanted.
 *
 * Everything here is advisory. It is read after the booking lock has been
 * released, so a suggestion can go stale between being offered and being
 * tapped — the guest simply gets the same refusal again, with fresh
 * suggestions. Holding the lock to make these exact would serialise every
 * booking in the restaurant behind one guest who picked a busy table.
 */

/* A type alias rather than an interface so a row straight out of the database
   can be asserted into it, the same way every other query in this codebase
   does — an interface has no implicit index signature and would need the
   `as unknown as` double hop to say exactly the same thing. */
export type AlternativeTable = {
  id: number;
  label: string;
  zone: string;
  capacity: number;
};

export interface BookingAlternatives {
  /** Slots near the one they asked for, same day. */
  times: string[];
  /** Tables still free at the slot they asked for, small enough to suit them. */
  tables: AlternativeTable[];
}

type LiveBookingRow = { time: string };

/** The one condition that means a slot is really spoken for. Kept in one place
    because the same 30-minute grace appears in the clash check, the floor plan
    and here, and they must never drift apart. */
const LIVE_BOOKING = `(status = 'confirmed'
   OR (status = 'pending_payment' AND created_at > now_text_offset(interval '-30 minutes')))`;

/** Times on `date` already spoken for at a given table. */
async function takenTimesForTable(tableId: number, date: string): Promise<Set<string>> {
  const rows = (await db
    .prepare(`SELECT time FROM reservations WHERE table_id = ? AND date = ? AND ${LIVE_BOOKING}`)
    .all(tableId, date)) as LiveBookingRow[];
  return new Set(rows.map((r) => r.time));
}

/** Times on `date` this guest is already expected at. */
async function takenTimesForGuest(userId: number, date: string): Promise<Set<string>> {
  const rows = (await db
    .prepare(`SELECT time FROM reservations WHERE user_id = ? AND date = ? AND ${LIVE_BOOKING}`)
    .all(userId, date)) as LiveBookingRow[];
  return new Set(rows.map((r) => r.time));
}

/** Tables free at exactly this slot that seat the party. */
async function freeTablesAt(date: string, time: string, partySize: number): Promise<AlternativeTable[]> {
  return (await db
    .prepare(
      `SELECT id, label, zone, capacity FROM restaurant_tables
       WHERE active = 1 AND capacity >= ?
         AND id NOT IN (
           SELECT table_id FROM reservations
           WHERE date = ? AND time = ? AND table_id IS NOT NULL AND ${LIVE_BOOKING}
         )
       ORDER BY capacity ASC, id ASC
       LIMIT ?`
    )
    .all(partySize, date, time, ALTERNATIVE_LIMIT)) as AlternativeTable[];
}

/**
 * Suggestions for a guest whose chosen table was taken.
 *
 * Never throws: a booking that has already been refused must not turn into a
 * 500 because the suggestion query had a bad day. An empty result just means
 * the guest sees the refusal on its own, which is where we were before.
 */
export async function alternativesForTakenTable(
  tableId: number,
  date: string,
  time: string,
  partySize: number,
  slots: readonly string[],
  earliest: string | null
): Promise<BookingAlternatives> {
  try {
    const [taken, tables] = await Promise.all([
      takenTimesForTable(tableId, date),
      freeTablesAt(date, time, partySize),
    ]);
    return { times: nearbySlots(slots, time, taken, earliest), tables };
  } catch (err) {
    console.error("[alternatives] could not suggest anything for a taken table", err);
    return { times: [], tables: [] };
  }
}

/**
 * Suggestions for a guest who already has a table at this exact slot.
 *
 * Offering them another table at the same time would be offering them a second
 * booking for one visit, so this is times only — the times they are still free.
 */
export async function alternativesForDoubleBooking(
  userId: number,
  date: string,
  time: string,
  slots: readonly string[],
  earliest: string | null
): Promise<BookingAlternatives> {
  try {
    const taken = await takenTimesForGuest(userId, date);
    return { times: nearbySlots(slots, time, taken, earliest), tables: [] };
  } catch (err) {
    console.error("[alternatives] could not suggest anything for a double booking", err);
    return { times: [], tables: [] };
  }
}
