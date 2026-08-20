/**
 * What is still only in English.
 *
 * The application's own wording lives in the customer app and its two
 * languages are kept level by the type system and a test. This is about the
 * other half — everything the owner types themselves: the message on the
 * closed sign, the reason takeaway is paused, the announcement bar, the terms
 * and the privacy page. Nothing checks those, and the usual result is a site
 * that switches to French and then says half of itself in English.
 *
 * So this counts them, and says which ones and where to fix each.
 */

export type TranslationStatus =
  /** The French box is empty. */
  | "missing"
  /** The French box holds the English text, word for word. */
  | "copied"
  /** Translated. */
  | "done";

export interface TranslationEntry {
  /** Stable across runs, so the console can key a list on it. */
  id: string;
  /** What this piece of text is, in words the owner would recognise. */
  label: string;
  /** The screen they change it on. */
  where: string;
  status: TranslationStatus;
  /** The English, so the report can show what needs saying in French. */
  english: string;
}

export interface TranslationReport {
  /** How many pieces of owner-entered text have any English at all. */
  total: number;
  done: number;
  /** Everything still wanting attention, worst first. */
  outstanding: TranslationEntry[];
}

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/** Same words, ignoring case and spacing — which is what a paste looks like. */
function sameWords(a: string, b: string): boolean {
  const flatten = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return flatten(a) === flatten(b);
}

/**
 * Judges one pair.
 *
 * Returns null when there is no English either: an empty announcement is not
 * an untranslated announcement, and counting it would make the report nag
 * about something the owner deliberately left off.
 */
export function assessPair(
  id: string,
  label: string,
  where: string,
  english: unknown,
  french: unknown
): TranslationEntry | null {
  if (blank(english)) return null;
  const en = String(english);

  if (blank(french)) return { id, label, where, status: "missing", english: en };
  const fr = String(french);
  if (sameWords(en, fr)) return { id, label, where, status: "copied", english: en };
  return { id, label, where, status: "done", english: en };
}

/** Missing first: an empty box is worse than one somebody pasted into. */
const SEVERITY: Record<TranslationStatus, number> = { missing: 0, copied: 1, done: 2 };

export function buildReport(entries: readonly (TranslationEntry | null)[]): TranslationReport {
  const real = entries.filter((entry): entry is TranslationEntry => entry !== null);
  const outstanding = real
    .filter((entry) => entry.status !== "done")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.label.localeCompare(b.label));

  return {
    total: real.length,
    done: real.filter((entry) => entry.status === "done").length,
    outstanding,
  };
}

/** A `{ en, fr }` block from the site config, however mangled. */
function pair(raw: unknown): { en: unknown; fr: unknown } {
  if (!raw || typeof raw !== "object") return { en: undefined, fr: undefined };
  const record = raw as Record<string, unknown>;
  return { en: record.en, fr: record.fr };
}

function section(raw: unknown, key: string): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  return (raw as Record<string, unknown>)[key];
}

/* A type alias rather than an interface so a row straight out of the database
   can be asserted into it, the same way every other query here does. */
export type LegalPageRow = {
  slug: string;
  title: string;
  title_fr: string | null;
  body: string;
  body_fr: string | null;
};

/**
 * The whole report, from the raw config blob and the legal pages.
 *
 * Takes the config as already-parsed JSON rather than text so the caller owns
 * the one decision about what to do with a blob that will not parse.
 */
export function assessOwnerContent(
  config: Record<string, unknown>,
  legalPages: readonly LegalPageRow[]
): TranslationReport {
  const SITE = "Site control";
  const LEGAL = "Terms and privacy";

  const business = pair(section(section(config, "business"), "message"));
  const announcement = pair(section(section(config, "announcement"), "message"));
  const support = pair(section(section(config, "support"), "afterHoursMessage"));
  const services = section(config, "services");

  const serviceEntries = (["ordering", "booking", "waitlist"] as const).map((name) => {
    const message = pair(section(section(services, name), "message"));
    const label =
      name === "ordering" ? "Takeaway paused message" : name === "booking" ? "Booking paused message" : "Waitlist paused message";
    return assessPair(`services.${name}`, label, SITE, message.en, message.fr);
  });

  const legalEntries = legalPages.flatMap((page) => [
    assessPair(`legal.${page.slug}.title`, `${page.slug} — title`, LEGAL, page.title, page.title_fr),
    assessPair(`legal.${page.slug}.body`, `${page.slug} — page text`, LEGAL, page.body, page.body_fr),
  ]);

  return buildReport([
    assessPair("business.message", "Live restaurant state message", SITE, business.en, business.fr),
    assessPair("announcement.message", "Announcement bar", SITE, announcement.en, announcement.fr),
    assessPair("support.afterHoursMessage", "Support after-hours message", SITE, support.en, support.fr),
    ...serviceEntries,
    ...legalEntries,
  ]);
}
