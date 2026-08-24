/**
 * Is the public site open to the world, and where does it live.
 *
 * ── Two questions that look like one ───────────────────────────────────────
 *
 * **Where the site lives** is decided by how somebody arrived. A path under
 * `/admin` is staff, and stays under `/admin` for the whole visit so every link
 * they follow and every refresh keeps working. Everything else is at the root.
 * That answer needs nothing from the server, which is the point: a router's
 * basename is fixed the moment React mounts, so anything it depends on has to
 * be knowable before the first line of the app runs.
 *
 * The prefix keeps working after launch, deliberately. It costs nothing, it is
 * already `noindex, nofollow` in `RouteMeta`, and it means the address staff
 * have had bookmarked since before opening night does not break on the morning
 * the site goes live.
 *
 * **Whether the world may see the site** is the switch on the developer panel,
 * and that one does come from the server, in `site_config_json`. It decides
 * whether somebody at the root gets the site or a holding page. Staff under the
 * prefix are not affected by it at all: that is how a site is worked on before
 * it opens, and how the owner reaches the switch to open it.
 *
 * ── Why the flag is also kept here ─────────────────────────────────────────
 *
 * A visitor to a live site should not see a flash of "coming soon" while the
 * settings are in flight, and a visitor to a dark one should not see a flash of
 * the restaurant. So the last known answer is kept in localStorage and used for
 * the first paint, then corrected the moment the real settings land.
 *
 * It is a single public boolean with nothing personal in it, which is why it
 * lives somewhere `clearBoot()` does not reach: unlike the boot payload it is
 * not one person's data, it is a fact about the site. It survives a sign-out,
 * which is right, because whether the restaurant is open to the public has
 * nothing to do with who is holding the phone.
 *
 * On a first-ever visit there is nothing to read, and rather than guess, the
 * app waits out the one request. Guessing is visible either way: guess live and
 * a stranger sees the site before it opens, guess dark and a customer is turned
 * away from a restaurant that is trading.
 */

/** Its own key, not part of the boot payload: see the note above. */
const KEY = "ccm.live.v1";

/** The prefix the site is also served under, for staff. */
export const PREVIEW_PREFIX = "/admin";

/** Whether this URL came in through the staff prefix. */
export function enteredViaPreview(pathname = window.location.pathname): boolean {
  return pathname === PREVIEW_PREFIX || pathname.startsWith(`${PREVIEW_PREFIX}/`);
}

/** True, false, or null when nothing has ever been recorded here. */
export function readLaunched(): boolean | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    /* Private browsing or storage switched off. Treated as a first visit, which
       means one short wait and nothing worse. */
    return null;
  }
}

export function writeLaunched(live: boolean): void {
  try {
    localStorage.setItem(KEY, live ? "1" : "0");
  } catch {
    /* The app works without this; it only ever saves a wait. */
  }
}

/**
 * Where the router should think it is.
 *
 * This follows how somebody arrived and nothing else, and the "nothing else"
 * is load-bearing. A router refuses to render anything at all when its basename
 * does not contain the current location, so answering `/admin` for a stranger
 * standing at `/` does not show them a holding page, it shows them nothing: a
 * blank screen, no error, no way to tell what went wrong.
 */
export function basenameFor(preview: boolean): string {
  return preview ? PREVIEW_PREFIX : "/";
}
