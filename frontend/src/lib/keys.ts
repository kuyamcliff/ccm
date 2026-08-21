/**
 * Every cache key in the product, in one place.
 *
 * The query cache in `lib/store` is keyed by string, which is what lets two
 * screens asking for the same thing share one request. That only works if they
 * spell it the same way, and a typo is not a type error: it is a second cache
 * entry and a second request, which is exactly the bug the cache exists to
 * prevent, now invisible.
 *
 * So the strings live here and nowhere else. The prefixes also matter, because
 * `invalidate("desk.bookings*")` is how a console screen says "the bookings
 * changed" without knowing every filter somebody has open.
 */
export const K = {
  /* Public reads. All safe to persist and to show a moment out of date. */
  settings: "site.settings",
  highlights: "site.highlights",
  menu: "site.menu",
  offers: "site.offers",
  gallery: "site.gallery",
  reviews: "site.reviews",
  waitlist: "site.waitlist",
  legal: (slug: string) => `site.legal.${slug}`,

  /* Signed in. Never persisted: these belong to one person and the cache is
     dropped whole when the session changes hands. */
  myBookings: "me.bookings",
  myOrders: "me.orders",
  myLoyalty: "me.loyalty",
  myReceipts: "me.receipts",
  mySessions: "me.sessions",
  myPasskeys: "me.passkeys",
  myTwoFactor: "me.2fa",
  wallets: "me.wallets",

  /* Booking, which depends on what has been chosen so far. */
  tables: (date: string, time: string) => `book.tables.${date}.${time}`,

  /* The console. Prefixed so a whole area can be invalidated at once. */
  desk: {
    stats: "desk.stats",
    analytics: "desk.analytics",
    bookings: "desk.bookings",
    orders: "desk.orders",
    queue: "desk.queue",
    tables: "desk.tables",
    fixtures: "desk.fixtures",
    menu: "desk.menu",
    offers: "desk.offers",
    gallery: "desk.gallery",
    reviews: "desk.reviews",
    events: "desk.events",
    payments: "desk.payments",
    receipts: "desk.receipts",
    promos: "desk.promos",
    cards: "desk.cards",
    threads: "desk.threads",
    thread: (id: number) => `desk.thread.${id}`,
    users: (query: string, page: number) => `desk.users.${query}.${page}`,
    audit: (query: string, page: number) => `desk.audit.${query}.${page}`,
    access: "desk.access",
    legal: "desk.legal",
    translations: "desk.translations",
    notifications: "desk.notifications",
  },

  /* The developer tier. */
  dev: {
    health: "dev.health",
    errors: "dev.errors",
    flags: "dev.flags",
    database: "dev.database",
  },
} as const;
