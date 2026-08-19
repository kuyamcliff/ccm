export type LocaleCode = "en" | "fr";
export type BusinessMode = "open" | "busy" | "closed";
export type ServiceMode = "open" | "paused";

export type FeatureName =
  | "customerAccounts"
  | "ordering"
  | "booking"
  | "waitlist"
  | "reviews"
  | "gallery"
  | "offers"
  | "events"
  | "loyalty"
  | "giftCards"
  | "supportChat";

export type HomeSection =
  | "hero"
  | "featured"
  | "ways"
  | "offer"
  | "gallery"
  | "accountCta"
  | "reviews"
  | "location";

export interface LocalizedMessage { en: string; fr: string; }

/**
 * When a feature is allowed to be on, if the owner has said.
 *
 * Absolute instants, written as ISO 8601 in UTC. A schedule set from a phone
 * in Buea and read by a customer whose phone is set to London has to mean the
 * same moment to both of them, and only an absolute instant does.
 *
 * Either end may be null: a start with no end runs from then on, an end with
 * no start runs until then, and both null is no schedule at all.
 */
export interface FeatureWindow { startAt: string | null; endAt: string | null; }

export interface SiteConfig {
  version: 1;
  defaultLocale: LocaleCode;
  locales: Record<LocaleCode, boolean>;
  features: Record<FeatureName, boolean>;
  /** Optional windows narrowing when each feature is on. A feature with no
      entry here is governed by its switch alone. */
  schedules: Partial<Record<FeatureName, FeatureWindow>>;
  homepage: Record<HomeSection, boolean>;
  business: { mode: BusinessMode; message: LocalizedMessage };
  services: {
    ordering: { mode: ServiceMode; message: LocalizedMessage };
    booking: { mode: ServiceMode; message: LocalizedMessage };
    waitlist: { mode: ServiceMode; message: LocalizedMessage };
  };
  support: {
    enabled: boolean;
    staffed: boolean;
    responseMinutes: number;
    whatsapp: boolean;
    phone: boolean;
    afterHoursMessage: LocalizedMessage;
  };
  payments: { mtn: boolean; orange: boolean };
  announcement: { enabled: boolean; tone: "info" | "good" | "warn"; message: LocalizedMessage };
  /** The site closed to customers while the owner works on it. Staff always
      get through, so turning this on can never lock them out of turning it off. */
  maintenance: { enabled: boolean; message: LocalizedMessage };
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  version: 1,
  defaultLocale: "en",
  locales: { en: true, fr: true },
  features: {
    customerAccounts: true, ordering: true, booking: true, waitlist: true,
    reviews: true, gallery: true, offers: true, events: true,
    loyalty: true, giftCards: true, supportChat: true,
  },
  schedules: {},
  homepage: {
    hero: true, featured: true, ways: true, offer: true, gallery: true,
    accountCta: true, reviews: true, location: true,
  },
  business: {
    mode: "open",
    message: { en: "We're open and ready for you.", fr: "Nous sommes ouverts et prêts à vous accueillir." },
  },
  services: {
    ordering: { mode: "open", message: { en: "Takeaway is paused right now while we catch up.", fr: "Les commandes à emporter sont momentanément suspendues pendant que nous rattrapons le retard." } },
    booking: { mode: "open", message: { en: "Online bookings are paused right now.", fr: "Les réservations en ligne sont momentanément suspendues." } },
    waitlist: { mode: "open", message: { en: "The waitlist is paused right now.", fr: "La liste d'attente est momentanément suspendue." } },
  },
  support: {
    enabled: true, staffed: true, responseMinutes: 15, whatsapp: true, phone: true,
    afterHoursMessage: { en: "Nobody is at the desk right now. Leave a message and we'll get back to you.", fr: "Personne n'est disponible pour le moment. Laissez un message et nous vous répondrons." },
  },
  payments: { mtn: true, orange: true },
  announcement: { enabled: false, tone: "info", message: { en: "", fr: "" } },
  maintenance: {
    enabled: false,
    message: {
      en: "We are making some changes and will be back shortly. The grill is still on — call us if you need us.",
      fr: "Nous faisons quelques changements et revenons très vite. Le grill tourne toujours — appelez-nous si besoin.",
    },
  },
};

function localized(value: unknown, fallback: LocalizedMessage): LocalizedMessage {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { en: typeof obj.en === "string" ? obj.en : fallback.en, fr: typeof obj.fr === "string" ? obj.fr : fallback.fr };
}
function bool(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function mode<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseSiteConfig(raw?: string): SiteConfig {
  if (!raw) return structuredClone(DEFAULT_SITE_CONFIG);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const features = (parsed.features ?? {}) as Record<string, unknown>;
    const homepage = (parsed.homepage ?? {}) as Record<string, unknown>;
    const business = (parsed.business ?? {}) as Record<string, unknown>;
    const services = (parsed.services ?? {}) as Record<string, unknown>;
    const support = (parsed.support ?? {}) as Record<string, unknown>;
    const payments = (parsed.payments ?? {}) as Record<string, unknown>;
    const announcement = (parsed.announcement ?? {}) as Record<string, unknown>;
    const maintenance = (parsed.maintenance ?? {}) as Record<string, unknown>;
    const ordering = (services.ordering ?? {}) as Record<string, unknown>;
    const booking = (services.booking ?? {}) as Record<string, unknown>;
    const waitlist = (services.waitlist ?? {}) as Record<string, unknown>;
    const locales = (parsed.locales ?? {}) as Record<string, unknown>;
    return {
      version: 1,
      defaultLocale: parsed.defaultLocale === "fr" ? "fr" : "en",
      locales: { en: bool(locales.en, true), fr: bool(locales.fr, true) },
      features: {
        customerAccounts: bool(features.customerAccounts, DEFAULT_SITE_CONFIG.features.customerAccounts),
        ordering: bool(features.ordering, DEFAULT_SITE_CONFIG.features.ordering),
        booking: bool(features.booking, DEFAULT_SITE_CONFIG.features.booking),
        waitlist: bool(features.waitlist, DEFAULT_SITE_CONFIG.features.waitlist),
        reviews: bool(features.reviews, DEFAULT_SITE_CONFIG.features.reviews),
        gallery: bool(features.gallery, DEFAULT_SITE_CONFIG.features.gallery),
        offers: bool(features.offers, DEFAULT_SITE_CONFIG.features.offers),
        events: bool(features.events, DEFAULT_SITE_CONFIG.features.events),
        loyalty: bool(features.loyalty, DEFAULT_SITE_CONFIG.features.loyalty),
        giftCards: bool(features.giftCards, DEFAULT_SITE_CONFIG.features.giftCards),
        supportChat: bool(features.supportChat, DEFAULT_SITE_CONFIG.features.supportChat),
      },
      schedules: parseSchedules(parsed.schedules),
      homepage: {
        hero: bool(homepage.hero, true), featured: bool(homepage.featured, true), ways: bool(homepage.ways, true),
        offer: bool(homepage.offer, true), gallery: bool(homepage.gallery, true), accountCta: bool(homepage.accountCta, true),
        reviews: bool(homepage.reviews, true), location: bool(homepage.location, true),
      },
      business: {
        mode: mode(business.mode, ["open", "busy", "closed"] as const, "open"),
        message: localized(business.message, DEFAULT_SITE_CONFIG.business.message),
      },
      services: {
        ordering: { mode: mode(ordering.mode, ["open", "paused"] as const, "open"), message: localized(ordering.message, DEFAULT_SITE_CONFIG.services.ordering.message) },
        booking: { mode: mode(booking.mode, ["open", "paused"] as const, "open"), message: localized(booking.message, DEFAULT_SITE_CONFIG.services.booking.message) },
        waitlist: { mode: mode(waitlist.mode, ["open", "paused"] as const, "open"), message: localized(waitlist.message, DEFAULT_SITE_CONFIG.services.waitlist.message) },
      },
      support: {
        enabled: bool(support.enabled, true), staffed: bool(support.staffed, true),
        responseMinutes: typeof support.responseMinutes === "number" && Number.isFinite(support.responseMinutes) ? Math.max(1, Math.min(1440, Math.round(support.responseMinutes))) : 15,
        whatsapp: bool(support.whatsapp, true), phone: bool(support.phone, true),
        afterHoursMessage: localized(support.afterHoursMessage, DEFAULT_SITE_CONFIG.support.afterHoursMessage),
      },
      payments: { mtn: bool(payments.mtn, true), orange: bool(payments.orange, true) },
      announcement: {
        enabled: bool(announcement.enabled, false),
        tone: mode(announcement.tone, ["info", "good", "warn"] as const, "info"),
        message: localized(announcement.message, DEFAULT_SITE_CONFIG.announcement.message),
      },
      maintenance: {
        /* Only an explicit true closes the site. Anything else — a missing
           block, a stray string, a 1 — leaves it open, because a site that
           shuts itself over a malformed value is worse than one that stays up
           when it should not have. */
        enabled: bool(maintenance.enabled, false),
        message: localized(maintenance.message, DEFAULT_SITE_CONFIG.maintenance.message),
      },
    };
  } catch { return structuredClone(DEFAULT_SITE_CONFIG); }
}

/** Every feature name, so a schedule for something that is not a feature can be
    dropped rather than carried around. */
const FEATURE_NAMES: readonly FeatureName[] = [
  "customerAccounts", "ordering", "booking", "waitlist", "reviews", "gallery",
  "offers", "events", "loyalty", "giftCards", "supportChat",
];

/** An instant, or null if it is anything this cannot make sense of. */
function instant(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function parseSchedules(raw: unknown): Partial<Record<FeatureName, FeatureWindow>> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: Partial<Record<FeatureName, FeatureWindow>> = {};
  for (const name of FEATURE_NAMES) {
    const entry = source[name];
    if (!entry || typeof entry !== "object") continue;
    const { startAt, endAt } = entry as Record<string, unknown>;
    const start = instant(startAt);
    const end = instant(endAt);
    /* A window with neither end is not a window. Storing it would make the
       console show a schedule the owner never set. */
    if (start === null && end === null) continue;
    out[name] = { startAt: start, endAt: end };
  }
  return out;
}

/**
 * Whether `now` falls inside a window.
 *
 * The start is inclusive and the end is exclusive, which is what "from nine
 * until five" means to everybody who is not writing the code. A window whose
 * end is before its start can never be open, and says so rather than being
 * quietly reinterpreted — an owner who typed the dates the wrong way round
 * should see the feature off and go and fix it.
 */
export function windowIsOpen(window: FeatureWindow, now: Date): boolean {
  const at = now.getTime();
  if (Number.isNaN(at)) return false;
  const start = window.startAt === null ? null : Date.parse(window.startAt);
  const end = window.endAt === null ? null : Date.parse(window.endAt);
  if (start !== null && !Number.isNaN(start) && at < start) return false;
  if (end !== null && !Number.isNaN(end) && at >= end) return false;
  return true;
}

/**
 * Whether a feature is on right now: its switch, narrowed by its schedule.
 *
 * The switch is the primary control and the schedule can only take away, never
 * give: a feature switched off stays off inside its window. That way "why is
 * this on?" always has the same first answer, and an owner turning something
 * off in a hurry does not have to remember to clear a schedule too.
 */
export function featureIsOn(config: SiteConfig, name: FeatureName, now: Date = new Date()): boolean {
  if (!config.features[name]) return false;
  const window = config.schedules[name];
  return window ? windowIsOpen(window, now) : true;
}

/**
 * The features as they stand right now, schedules applied.
 *
 * Everything on the customer side already reads `features`, so handing back
 * the same shape means scheduling works everywhere at once rather than only
 * where somebody remembered to ask.
 */
export function resolveFeatures(config: SiteConfig, now: Date = new Date()): Record<FeatureName, boolean> {
  const out = {} as Record<FeatureName, boolean>;
  for (const name of FEATURE_NAMES) out[name] = featureIsOn(config, name, now);
  return out;
}

/**
 * The next moment a schedule changes something, or null if none ever will.
 *
 * A tab left open across a boundary would otherwise keep showing what was true
 * when the page loaded — which is the whole of the feature failing, quietly,
 * for exactly the people who left the site open waiting for it.
 */
export function nextFeatureBoundary(config: SiteConfig, now: Date = new Date()): Date | null {
  const at = now.getTime();
  let soonest: number | null = null;

  for (const name of FEATURE_NAMES) {
    const window = config.schedules[name];
    if (!window) continue;
    for (const edge of [window.startAt, window.endAt]) {
      if (edge === null) continue;
      const time = Date.parse(edge);
      if (Number.isNaN(time) || time <= at) continue;
      if (soonest === null || time < soonest) soonest = time;
    }
  }

  return soonest === null ? null : new Date(soonest);
}
