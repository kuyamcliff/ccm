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

export interface SiteConfig {
  version: 1;
  defaultLocale: LocaleCode;
  locales: Record<LocaleCode, boolean>;
  features: Record<FeatureName, boolean>;
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
    };
  } catch { return structuredClone(DEFAULT_SITE_CONFIG); }
}
