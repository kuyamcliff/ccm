/*
 * What the restaurant actually says to a guest.
 *
 * Every outgoing message is written here rather than at the point it is sent,
 * so the voice stays one voice and so the owner can be shown the exact wording
 * without reading through the payment code. It is the site's voice: plain and
 * direct, no flourishes, and the word is "takeaway", never "collection".
 *
 * Keep them short. These are read on a lock screen, and an SMS is billed by the
 * segment.
 */

const VENUE = "Cam Chop Meat";

export function money(fcfa: number): string {
  return `${Math.round(fcfa).toLocaleString("en-US")} FCFA`;
}

/** "Sat 14 Jun" — enough to be sure, short enough for one line. */
export function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface BookingFacts {
  name: string;
  date: string;
  time: string;
  partySize: number;
  tableLabel?: string | null;
  code: string;
  /** What they have already paid. */
  paid: number;
  /** Food and drink ordered ahead, if any. */
  itemsTotal?: number;
}

export function bookingConfirmed(facts: BookingFacts): string {
  const where = facts.tableLabel ? `table ${facts.tableLabel}` : "a table";
  const lines = [
    `${VENUE}: your ${where} is held for ${shortDate(facts.date)} at ${facts.time}, ${facts.partySize} people.`,
    `Show this code at the door: ${facts.code}.`,
  ];
  if (facts.itemsTotal && facts.itemsTotal > 0) {
    lines.push(`Your food and drinks are ordered and paid for.`);
  }
  lines.push(`Paid ${money(facts.paid)}, which comes off your bill.`);
  return lines.join(" ");
}

export function bookingCancelled(facts: { date: string; time: string; refunded: boolean }): string {
  const tail = facts.refunded
    ? "Your deposit is on its way back."
    : "Your deposit is not refunded this close to the time.";
  return `${VENUE}: your table for ${shortDate(facts.date)} at ${facts.time} is cancelled. ${tail}`;
}

export function takeawayReady(code: string): string {
  return `${VENUE}: your takeaway is ready. Show ${code} at the counter.`;
}

export function waitlistReady(name: string): string {
  const who = name.trim() ? `${name.trim()}, ` : "";
  return `${VENUE}: ${who}your table is ready. Come to the counter and we will seat you.`;
}
