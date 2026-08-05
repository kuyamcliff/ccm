/**
 * Turning stored values into something a person reads.
 *
 * The server stores dates as "YYYY-MM-DD" and timestamps as
 * "YYYY-MM-DD HH:MM:SS" in UTC, with no zone marker. Parsing those with the
 * Date constructor is where timezone bugs come from, so every conversion in
 * the product goes through this file.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A stored timestamp, read as the UTC it actually is. */
export function parseStamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-08-04" → a Date at local midnight, which is what a calendar means. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** "Tue 4 Aug" — short enough for a chip, clear enough for a confirmation. */
export function shortDate(value: string): string {
  const date = parseDay(value);
  if (!date) return value;
  return `${DAYS[date.getDay()]!.slice(0, 3)} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function longDate(value: string): string {
  const date = parseDay(value);
  if (!date) return value;
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Today and tomorrow are named, because that is how people say them. */
export function relativeDay(value: string): string | null {
  const today = todayISO();
  if (value === today) return "Today";
  if (value === toISODate(addDays(new Date(), 1))) return "Tomorrow";
  if (value === toISODate(addDays(new Date(), -1))) return "Yesterday";
  return null;
}

export function dayLabel(value: string): string {
  return relativeDay(value) ?? shortDate(value);
}

/** "18:30" stays 24-hour: it is what the clock on the wall says here. */
export function timeLabel(value: string): string {
  return value.slice(0, 5);
}

export function stampLabel(value: string | null | undefined): string {
  const date = parseStamp(value);
  /* No timestamp is not the same as a broken one, and neither is a dash a
     word. Anything reading this out loud gets something it can say. */
  if (!date) return "Not yet";
  const day = toISODate(date);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${dayLabel(day)}, ${time}`;
}

/** "3 minutes ago". Falls back to a date once it stops being useful. */
export function timeAgo(value: string | null | undefined): string {
  const date = parseStamp(value);
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 6) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return stampLabel(value);
}

/**
 * Whether a slot has already gone, and only ever for today.
 *
 * A booking form that offers half past six at seven o'clock is one somebody
 * fills in and then gets turned away over, so the times that have passed are
 * never listed.
 */
export function isPastSlot(date: string, slot: string): boolean {
  if (date !== todayISO()) return false;
  const now = new Date();
  const [hour, minute] = slot.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0) <= now.getHours() * 60 + now.getMinutes();
}

export function money(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Cameroonian numbers, written the way they are read: 6 XX XX XX XX.
 * Anything that does not look like one is left exactly as typed.
 */
export function phoneLabel(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("237") ? digits.slice(3) : digits;
  if (local.length !== 9) return raw;
  return `${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
}

/** Strips everything but digits and normalises to the 6XXXXXXXX the API wants. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("237") ? digits.slice(3) : digits;
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Dietary tags arrive as a JSON string; a malformed one must not break a page. */
export function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

/** Order lines are stored as JSON too, and come from the same place. */
export function parseLines(value: string | null | undefined): { name: string; qty: number; price: number }[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((line) => {
      if (!line || typeof line !== "object") return [];
      const record = line as Record<string, unknown>;
      return [
        {
          name: String(record.name ?? "Item"),
          qty: Number(record.qty ?? 1),
          price: Number(record.price ?? 0),
        },
      ];
    });
  } catch {
    return [];
  }
}

export function pluralise(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
