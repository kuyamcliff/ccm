/**
 * Builds a calendar event a phone will actually accept.
 *
 * RFC 5545 is fussy in ways that fail silently: a bare newline, an unescaped
 * comma, or a line over 75 octets and the file either imports wrong or is
 * rejected outright, with no message the guest could act on. So everything
 * here is deliberate rather than convenient — CRLF endings, escaped text,
 * folded lines, and times written in UTC with an explicit Z.
 *
 * Deliberately free of any database import: the shape of a calendar event is
 * worth being able to test on its own.
 */

/**
 * The restaurant's clock, as an offset from UTC.
 *
 * Bookings are stored as a plain date and a plain time — "2027-03-14",
 * "19:30" — meaning half past seven in Buea. A calendar file has to say when
 * that is in absolute terms, or a guest whose phone is set to another country
 * gets an alarm at the wrong hour.
 *
 * Cameroon is UTC+1 all year and has never observed daylight saving, so one
 * constant is the whole truth here rather than a simplification. If the
 * restaurant ever opens somewhere that does move its clocks, this becomes a
 * real timezone lookup and a VTIMEZONE block, not a different number.
 */
const VENUE_UTC_OFFSET_MINUTES = 60;

/** The longest a line may be before it has to be folded, in octets. */
const MAX_OCTETS = 75;

export interface CalendarEvent {
  /** Stable for the life of the booking, so a re-import replaces rather than
      duplicates. Must be unique across everything the guest's calendar holds. */
  uid: string;
  /** Venue-local date, YYYY-MM-DD. */
  date: string;
  /** Venue-local start, HH:MM. */
  time: string;
  /** How long to block out. */
  durationMinutes: number;
  summary: string;
  description: string;
  location: string;
  /** Bumped when the booking changes, so calendars know which copy is newer. */
  sequence?: number;
  /** "tentative" for a table that is not held yet, so the guest's calendar
      does not promise something the restaurant has not. */
  status?: "confirmed" | "tentative";
  /** When this file was produced. Defaults to now. */
  stamp?: Date;
}

export class CalendarEventError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Escapes the four characters RFC 5545 gives meaning to inside a text value.
 *
 * Order matters: backslashes first, or the backslashes this very function adds
 * would be escaped again on the next pass.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a line to 75 octets, continuing with a leading space.
 *
 * Counted in octets rather than characters because the limit is a byte limit
 * and a guest's note can hold anything — "Anniversaire de Noël" is more bytes
 * than it is letters. Splitting mid-character would corrupt it, so this walks
 * whole code points and never breaks one in half.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let current = "";
  let currentOctets = 0;
  // A continuation line starts with a space, which costs one of its 75 octets.
  let limit = MAX_OCTETS;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentOctets + size > limit) {
      parts.push(current);
      current = "";
      currentOctets = 0;
      limit = MAX_OCTETS - 1;
    }
    current += char;
    currentOctets += size;
  }
  if (current !== "") parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** A Date as RFC 5545 wants it: 20270314T183000Z. */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Venue-local date and time, as the instant it names. */
export function venueTimeToUtc(date: string, time: string): Date {
  if (!DATE_RE.test(date)) throw new CalendarEventError(`Not a date: ${date}`);
  if (!TIME_RE.test(time)) throw new CalendarEventError(`Not a time: ${time}`);

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31) throw new CalendarEventError(`Not a date: ${date}`);
  if (hour! > 23 || minute! > 59) throw new CalendarEventError(`Not a time: ${time}`);

  const asUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  const instant = new Date(asUtc - VENUE_UTC_OFFSET_MINUTES * 60_000);
  if (Number.isNaN(instant.getTime())) throw new CalendarEventError(`Not a date and time: ${date} ${time}`);
  return instant;
}

/**
 * One event, as a complete .ics file.
 *
 * A single VEVENT rather than a feed: the guest is adding this booking, not
 * subscribing to the restaurant. PUBLISH rather than REQUEST for the same
 * reason — nothing here is an invitation that expects an answer, and marking
 * it as one makes some clients ask the guest to accept or decline their own
 * booking.
 */
export function buildCalendarEvent(event: CalendarEvent): string {
  if (!Number.isFinite(event.durationMinutes) || event.durationMinutes <= 0) {
    throw new CalendarEventError("An event needs a positive duration.");
  }

  const start = venueTimeToUtc(event.date, event.time);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  const stamp = event.stamp ?? new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cam Chop Meat//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `SEQUENCE:${Math.max(0, Math.trunc(event.sequence ?? 0))}`,
    `DTSTAMP:${utcStamp(stamp)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    `STATUS:${event.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    /* An hour's warning is the useful one for a table: long enough to set off,
       short enough that it is not noise. Calendars that ignore alarms in an
       imported file simply drop this block. */
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Your table is in an hour",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  /* CRLF throughout, and a trailing one: a file ending without it is the
     single most common reason an otherwise valid .ics is refused. */
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
