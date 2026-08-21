/**
 * What each page calls itself, in one table.
 *
 * Every route shared a single title, a single description, and a canonical
 * link pointing at the homepage. To a search engine that reads as one page
 * duplicated fifteen times: the menu could not rank for "grilled goat Buea"
 * because as far as Google was concerned there was no menu page, only another
 * copy of the front door.
 *
 * A table rather than a hook called from each page, because the failure mode
 * of the per-page version is a page that quietly forgets to call it, and the
 * symptom of that is invisible until somebody checks a search result months
 * later. Here, a route with no entry is obvious in one screen.
 *
 * This runs in the browser, which is fine for Google — it renders JavaScript
 * before indexing. It is not fine for the crawlers behind WhatsApp, TikTok and
 * Facebook, which read the HTML as served and never run a line of script.
 * Everything those need is static in `index.html`, and that is why the sharing
 * card lives there and not here.
 */

export const SITE_URL = "https://camchopmeat.com";

const SUFFIX = "Cam Chop Meat, Buea";

interface Meta {
  title: string;
  description: string;
}

/** Keyed by pathname. `/` is the homepage; everything else is exact. */
const ROUTES: Record<string, Meta> = {
  "/": {
    title: `${SUFFIX} | Fresh grilled chicken, goat and pork`,
    description:
      "Fresh grilled chicken, goat and pork over the fire in Buea. See the menu and prices in FCFA, order takeaway with Mobile Money, or book a table. Razel Street, opposite P and T school.",
  },
  "/menu": {
    title: `Menu and prices | ${SUFFIX}`,
    description:
      "Everything off the grill today, with prices in FCFA. Chicken, goat, pork, fish and sides, plus what is sold by weight at the counter.",
  },
  "/book": {
    title: `Book a table | ${SUFFIX}`,
    description:
      "Reserve a table in Buea in about a minute. Pick your time, choose where you sit, and order food to be ready when you arrive.",
  },
  "/order": {
    title: `Order takeaway | ${SUFFIX}`,
    description:
      "Order ahead and collect. Pay with MTN Mobile Money or Orange Money, and we start cooking so it is hot when you get here.",
  },
  "/story": {
    title: `Our story | ${SUFFIX}`,
    description: "Who cooks here, what goes on the fire, and why the place looks the way it does.",
  },
  "/find": {
    title: `Find us in Buea | Cam Chop Meat`,
    description:
      "Razel Street, opposite the P and T school, Buea. Opening hours, our phone number, and directions to the door.",
  },
  "/reviews": {
    title: `Reviews | ${SUFFIX}`,
    description: "What guests say about the food and the room, in their own words.",
  },
  "/gallery": {
    title: `Photos | ${SUFFIX}`,
    description: "The grill, the plates and the room, photographed here rather than bought from a stock library.",
  },
  "/events": {
    title: `Private events | ${SUFFIX}`,
    description: "Book the place out for a birthday, a send-off or a work do. Tell us the date and we will come back to you.",
  },
  "/waitlist": {
    title: `Join the queue | ${SUFFIX}`,
    description: "Full tonight? Put your name down from your phone and we will text you when a table is ready.",
  },
  "/offers": {
    title: `Offers this week | ${SUFFIX}`,
    description: "What is running right now, and until when.",
  },
  "/help": {
    title: `Help and contact | ${SUFFIX}`,
    description: "Message us about a booking, an order or anything else, or find the phone number.",
  },
  "/terms": { title: `Terms | ${SUFFIX}`, description: "The terms you agree to when you book or order here." },
  "/privacy": { title: `Privacy | ${SUFFIX}`, description: "What we keep about you, why, and how to have it removed." },
  "/signin": { title: `Sign in | ${SUFFIX}`, description: "Sign in to manage your bookings and orders." },
  "/join": { title: `Create an account | ${SUFFIX}`, description: "Create an account to change or cancel a booking yourself." },
};

/** Pages behind a sign-in, and anything else search should never index. */
const PRIVATE_PREFIXES = ["/desk", "/mine", "/account", "/reset"];

/**
 * What each console screen calls itself in the browser tab.
 *
 * Keyed by the path segment after `/desk`, so a route added without an entry
 * here falls back to plain "Desk" rather than to something misleading.
 */
const DESK_SCREENS: Record<string, string> = {
  "": "Overview",
  door: "Door",
  bookings: "Bookings",
  orders: "Orders",
  queue: "Queue",
  floor: "Floor",
  menu: "Menu",
  offers: "Offers",
  gallery: "Photos",
  reviews: "Reviews",
  events: "Events",
  money: "Payments",
  promos: "Promo codes",
  cards: "Gift cards",
  inbox: "Messages",
  guests: "Guests",
  reminders: "Reminders",
  insights: "Insights",
  settings: "Details",
  "site-control": "Site control",
  translations: "Translations",
  legal: "Terms and privacy",
  log: "Audit log",
  access: "Staff access",
  dev: "System",
  "dev/errors": "Errors",
  "dev/flags": "Flags",
  "dev/data": "Database",
  "dev/impersonate": "Impersonate",
};

function deskTitle(path: string): string | null {
  if (path !== "/desk" && !path.startsWith("/desk/")) return null;
  const screen = path.slice("/desk".length).replace(/^\//, "");
  const name = DESK_SCREENS[screen];
  return name ? `${name} | Desk` : "Desk";
}

export interface ResolvedMeta extends Meta {
  /** The address this page should be indexed under, or null when it should
   *  not be indexed at all. */
  canonical: string | null;
  noindex: boolean;
}

export function metaForPath(pathname: string): ResolvedMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return {
      /*
       * The console names the screen it is on.
       *
       * Everything private used to share one title, which meant a member of
       * staff with the bookings, the kitchen board and the floor plan open in
       * three tabs saw "Your account" on all three and had to click each one to
       * find out which was which. Still noindex, still no description: this is
       * for the person reading the tab strip, not for a search engine.
       */
      title: deskTitle(path) ?? `Your account | ${SUFFIX}`,
      description: "",
      canonical: null,
      noindex: true,
    };
  }

  const hit = ROUTES[path];
  if (hit) return { ...hit, canonical: `${SITE_URL}${path === "/" ? "/" : path}`, noindex: false };

  /* An address nobody wrote. It gets the 404 page, and telling search engines
     to index it would be inviting them to keep a list of our typos. */
  return {
    title: `Page not found | ${SUFFIX}`,
    description: "",
    canonical: null,
    noindex: true,
  };
}
