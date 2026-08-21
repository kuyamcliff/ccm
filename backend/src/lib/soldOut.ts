/**
 * When a sold-out dish comes back.
 *
 * Pure arithmetic, no database. That is what lets it be tested without one,
 * following the same split as `lib/loyalty.ts` and `routes/loyalty.ts`: the sums
 * live somewhere a unit test can reach them, and the SQL lives next to the SQL.
 * The sweep that uses this is in `lib/menuSweep.ts`.
 */

/**
 * When a dish marked sold out now should come back.
 *
 * ── Timezones, explicitly ──────────────────────────────────────────────────
 *
 * Everything in this database is UTC text, and this process runs on a host whose
 * local timezone is not Buea's and is not guaranteed to be anything in
 * particular. So the arithmetic is done in UTC and the restaurant's offset is
 * applied by hand.
 *
 * Cameroon is UTC+1 all year. There is no daylight saving to track, which is
 * what makes a fixed offset safe here where it would not be elsewhere.
 *
 * Deliberately generous rather than exact: a dish coming back an hour late is
 * recoverable, a dish coming back while the kitchen still has none of it is a
 * customer paying for something that does not exist.
 */
const WAT_OFFSET_HOURS = 1;
const OPENS_AT_LOCAL_HOUR = 12;

export function nextOpening(now = new Date()): string {
  /* Midday in Buea, expressed in UTC. */
  const openingUtcHour = OPENS_AT_LOCAL_HOUR - WAT_OFFSET_HOURS;

  const opening = new Date(now);
  opening.setUTCHours(openingUtcHour, 0, 0, 0);
  if (opening <= now) opening.setUTCDate(opening.getUTCDate() + 1);

  return opening.toISOString().replace("T", " ").slice(0, 19);
}
