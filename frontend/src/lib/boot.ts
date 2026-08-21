import type { BootPayload } from "./api/public";
import { K } from "./keys";

/**
 * The first frame.
 *
 * This module is read **before React renders**, synchronously, from
 * `main.tsx`. Everything in it exists to answer one question: what can this
 * page put on the screen in the time before the network answers?
 *
 * ── The cache ──────────────────────────────────────────────────────────────
 *
 * The previous visit's bootstrap payload is kept in localStorage. On a return
 * visit the app renders it immediately, with real dish names, real prices, the
 * real address and the right signed-in state, and revalidates behind the screen.
 * A skeleton on a second visit is an admission that the app forgot everything it
 * already knew.
 *
 * Stale data is served knowingly, and the staleness is bounded: past
 * `MAX_AGE_MS` the payload is dropped rather than shown, because a price or a
 * closed sign from four days ago is worse than a moment of waiting.
 *
 * ── The image preload ──────────────────────────────────────────────────────
 *
 * The hero photographs are the slowest thing on the page and their URLs used to
 * be unknowable until three round trips had finished. They are in the cached
 * payload, so `preloadHero` puts a `<link rel=preload as=image>` in the head
 * straight away and the download starts while the JavaScript bundle is still
 * being parsed. That is the single largest saving available without touching how
 * the images themselves are stored.
 *
 * ── Why not sessionStorage or a cookie ─────────────────────────────────────
 *
 * sessionStorage dies with the tab, and the common case here is somebody
 * following a TikTok link, leaving, and coming back tomorrow. A cookie would be
 * sent on every single request to the API, which is bytes on a metered
 * connection for something only this browser ever reads.
 */

/** Bumped when the payload shape changes in a way an old copy would break. */
const KEY = "ccm.boot.v5";

/**
 * How old a cached payload may be and still be painted.
 *
 * Twelve hours: long enough that somebody coming back the next evening still
 * gets an instant page, short enough that they are never shown yesterday's
 * closed sign or a price that has since changed. The fresh copy lands a moment
 * later either way; this only governs the very first frame.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Stored {
  at: number;
  payload: BootPayload;
}

let memory: BootPayload | null = null;

/**
 * The cached payload, or null.
 *
 * Safe to call before React mounts and safe to call repeatedly: the parse
 * happens once and is held in a module variable afterwards.
 */
export function readBoot(): BootPayload | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Stored;
    if (typeof stored?.at !== "number" || !stored.payload) return null;
    if (Date.now() - stored.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }

    memory = stored.payload;
    return memory;
  } catch {
    /* A payload written by an older build, private browsing, or storage that is
       switched off entirely. All three mean the same thing: start cold. */
    return null;
  }
}

export function writeBoot(payload: BootPayload) {
  memory = payload;
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), payload } satisfies Stored));
  } catch {
    /* Full, or refused. The app works without this; it is only ever a head
       start, never the source of truth. */
  }
}

/**
 * Forgets everything.
 *
 * Called on sign in and on sign out. One guest's cached page must never paint
 * for the next person to pick up the phone, and the payload carries their name
 * and their signed-in state.
 */
export function clearBoot() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing stored to clear. */
  }
}

/**
 * Starts the hero photograph downloading now.
 *
 * `fetchpriority="high"` matters more than the preload itself: without it the
 * browser treats an image the same as everything else it has been asked for, and
 * on a slow connection the hero queues behind the JavaScript. With it, the photo
 * and the bundle race, which is what we want, because neither is useful without
 * the other.
 *
 * Only the first frame. Preloading all three would have them competing for the
 * same narrow pipe and the one actually on screen would arrive last.
 */
export function preloadHero(payload: BootPayload | null) {
  const first = payload?.topItems?.find((item) => item.image_url)?.image_url;
  if (!first) return;
  if (document.querySelector(`link[rel="preload"][href="${CSS.escape(first)}"]`)) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = first;
  link.fetchPriority = "high";
  document.head.appendChild(link);
}

/** The query keys the boot payload satisfies, so `lib/store` can be seeded with
    them and the screens that ask for them never make a second request. Aliased
    from `lib/keys` rather than spelled again: two spellings of one key is two
    cache entries and two requests. */
export const BOOT_KEYS = {
  settings: K.settings,
  highlights: K.highlights,
} as const;
