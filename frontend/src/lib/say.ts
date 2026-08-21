import { ApiError } from "./http";

/**
 * What a failure sounds like to a customer.
 *
 * The rule is simple and it is the whole point of this file: **the server's own
 * words never reach the screen.** The version before this one passed the raw
 * `error` string through unless it matched a blocklist of scary words, which
 * meant a customer could be shown "Request failed (500)." or "The owner has
 * restricted this action for your account." Those are true sentences written for
 * whoever is reading the logs. They are not sentences you say to somebody
 * standing outside a restaurant trying to pay for chicken.
 *
 * So every failure is translated here, from two things we can trust: the HTTP
 * status, and what the person was trying to do when it happened. Nothing else.
 *
 * Three exceptions, and they exist because the body carries a fact the browser
 * cannot reconstruct on its own. All three are read by the screen that needs
 * them, not by this file:
 *
 *   409 booking clash    `clash` + `alternatives` — which table went, and what
 *                        is still free. `lib/api/booking.ts:clashFromError`.
 *   402 late cancel      `requires_fee` + `fee_fcfa` — the actual amount.
 *   503 site closed      the owner's own wording, which lives in siteConfig and
 *                        is read from there rather than from the error.
 *
 * House rule, enforced in CI: no em dashes or en dashes anywhere a customer can
 * read. Not one of these strings contains one.
 */

/**
 * What the person was doing. Picking the right one is the difference between
 * "That did not work" and "We could not hold that table."
 */
export type Intent =
  | "signin"
  | "signout"
  | "join"
  | "reset"
  | "book"
  | "cancelBooking"
  | "order"
  | "pay"
  | "join-queue"
  | "review"
  | "message"
  | "upload"
  | "enquire"
  | "save"
  | "delete"
  | "load"
  | "desk";

/** The verb, as it appears mid-sentence: "We could not {verb} just now." */
const VERB: Record<Intent, string> = {
  signin: "sign you in",
  signout: "sign you out",
  join: "create your account",
  reset: "reset your password",
  book: "hold that table",
  cancelBooking: "cancel that booking",
  order: "place your order",
  pay: "take that payment",
  "join-queue": "add you to the queue",
  review: "post your review",
  message: "send your message",
  upload: "upload that photo",
  enquire: "send your enquiry",
  save: "save that",
  delete: "delete that",
  load: "load that",
  desk: "do that",
};

/**
 * Wording specific to one thing going wrong in one place, where the generic
 * sentence would be unhelpfully vague. Kept small on purpose: a table with an
 * entry for every intent and every status is a table nobody maintains.
 */
const SPECIFIC: Partial<Record<Intent, Partial<Record<number, string>>>> = {
  signin: {
    401: "That email and password do not match. Check them and try again.",
    403: "This account has been suspended. Get in touch and we will sort it out.",
    429: "Too many tries. Wait a moment before the next one.",
  },
  join: {
    409: "There is already an account with that email. Try signing in instead.",
    422: "Something in that form was not quite right. Check it and try again.",
    429: "That is a lot of new accounts from one place. Try again a bit later.",
  },
  reset: {
    400: "That code is wrong or has expired. Ask for a new one.",
    404: "That code is wrong or has expired. Ask for a new one.",
    429: "Too many tries. Wait a moment before the next one.",
  },
  book: {
    401: "You need to be signed in to hold a table.",
    409: "That table went while you were choosing. Pick another and we will hold it.",
    503: "Bookings are paused right now. Give us a call and we will find you a table.",
  },
  cancelBooking: {
    402: "That booking is close enough that a fee applies. The screen will show you how much.",
    404: "We cannot find that booking. It may already have been cancelled.",
  },
  order: {
    400: "Something on that order is no longer available. Check the basket and try again.",
    401: "You need to be signed in to order.",
    409: "Something on that order has just sold out. Take it off and try again.",
    503: "Takeaway is paused right now. Give us a call and we will see what we can do.",
  },
  pay: {
    400: "That number was not accepted. Check it and try again.",
    402: "The payment did not go through. Check your balance and try again.",
    404: "We cannot find that payment. Start it again from the order.",
    409: "That payment is already going through. Give it a moment.",
  },
  "join-queue": {
    503: "The queue is closed right now. Come by and ask at the counter.",
  },
  review: {
    409: "You have already left a review. You can edit the one you wrote.",
  },
  upload: {
    413: "That photo is too big. Try one under 6 MB.",
    415: "We cannot read that file. Send a JPEG, PNG or WebP.",
  },
  desk: {
    403: "Your account does not have access to that. The owner can grant it.",
  },
};

/** Sentences that hold whatever the person was doing. */
function generic(status: number, intent: Intent, retryAfter?: number): string {
  const verb = VERB[intent];

  switch (true) {
    /* The request never left the phone. */
    case status === 0:
      return "You are offline. Check your connection and try again.";

    case status === 401:
      return "You have been signed out. Sign in again and pick up where you left off.";

    case status === 403:
      return "You do not have access to that.";

    case status === 404:
      return "We could not find that. It may have moved or been removed.";

    case status === 408:
      return "That is taking too long. Check your connection and try again.";

    case status === 413:
      return "That is too big to send. Try something smaller.";

    case status === 422 || status === 400:
      return "Something in that was not quite right. Check it and try again.";

    case status === 429:
      return retryAfter && retryAfter > 0
        ? `That is a lot at once. Try again in ${waitFor(retryAfter)}.`
        : "That is a lot at once. Give it a moment and try again.";

    case status === 503:
      return "That part of the site is paused right now. Try again shortly.";

    case status >= 500:
      return `Something broke on our side, not yours. Give it a moment and try again.`;

    default:
      return `We could not ${verb} just now. Try again.`;
  }
}

/** "40 seconds", "2 minutes". Never "40s", and never a bare number. */
function waitFor(seconds: number): string {
  if (seconds < 60) {
    const rounded = Math.max(5, Math.ceil(seconds / 5) * 5);
    return `${rounded} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * The one function the rest of the app calls.
 *
 * Give it whatever was thrown and what the person was doing. It always returns
 * a sentence, because a screen that catches a failure and has nothing to show is
 * worse than a screen that shows a slightly generic apology.
 */
export function say(error: unknown, intent: Intent = "save"): string {
  if (!(error instanceof ApiError)) {
    /* Not from the network at all: a bug in our own code, or a browser refusing
       something. The customer cannot act on the difference, so they are told the
       same thing they would be told about a 500. */
    return "Something went wrong on this page. Reload and try again.";
  }

  const specific = SPECIFIC[intent]?.[error.status];
  if (specific) return specific;

  const sentence = generic(error.status, intent, error.retryAfter);

  /* A 500 is the one failure worth carrying a code for. The server logs the same
     code, so somebody ringing up with it can actually be found. */
  if (error.status >= 500 && error.status !== 503 && error.reference) {
    return `${sentence} If you get in touch, quote ${error.reference}.`;
  }

  return sentence;
}

/**
 * Whether a failure means "the site closed underneath you" rather than "that
 * did not work". The screen shows the owner's own closed-sign wording in that
 * case, which lives in siteConfig, not in the error.
 */
export function isPaused(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 503) return false;
  const body = error.body as { maintenance?: boolean; service_paused?: boolean; feature_disabled?: boolean } | undefined;
  return Boolean(body?.maintenance || body?.service_paused || body?.feature_disabled);
}

/** Whether retrying the exact same thing could plausibly work. Drives whether a
    screen offers a Try again button or sends the person somewhere else. */
export function worthRetrying(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 0 || error.status === 408) return true;
  if (error.status === 429) return true;
  return error.status >= 500;
}
