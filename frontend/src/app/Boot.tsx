import { useEffect, useRef } from "react";
import { api } from "~/lib/api";
import { BOOT_KEYS, preloadHero, readBoot, writeBoot } from "~/lib/boot";
import { seed } from "~/lib/store";
import { useSession } from "~/state/session";

/**
 * The one request the app opens with.
 *
 * Renders nothing. It sits inside the providers, fires `/api/bootstrap` once,
 * and hands the result to the three places that were each making their own
 * request for it before: the session, the site settings, and the home page's
 * highlights.
 *
 * ── The order this happens in ──────────────────────────────────────────────
 *
 * 1. `main.tsx`, before React exists, reads the cached payload from the last
 *    visit and puts a high-priority `<link rel=preload>` on the first hero
 *    photograph. The image starts downloading while the bundle is still parsing.
 * 2. The providers seed themselves from that same cached payload, so the first
 *    frame has the real address, the real hours, and the right signed-in state.
 * 3. This component fetches the live payload and seeds everything again.
 *
 * On a first-ever visit steps 1 and 2 do nothing and the app waits on one
 * request instead of three. On every visit after that, there is nothing to wait
 * for at all.
 *
 * ── Why the fetch is not in an ordinary query ──────────────────────────────
 *
 * Because it feeds the session, and the session is what the query layer's cache
 * is keyed against. Running it as a `useQuery` inside a provider that the query
 * cache depends on is a knot; this way the dependency runs one direction only.
 */
export function Boot() {
  const { settle } = useSession();
  const started = useRef(false);

  useEffect(() => {
    /*
     * Once per mounted app, and no cancellation.
     *
     * These two guards used to be three lines apart and cancelled each other
     * out. `started` stops a second request; a `cancelled` flag in the cleanup
     * stopped a late response being used. Under StrictMode, which mounts every
     * effect twice in development, that combination meant:
     *
     *   1. first mount fires the request,
     *   2. StrictMode unmounts, and the cleanup sets `cancelled`,
     *   3. the remount finds `started` already true and does nothing,
     *   4. the response arrives to a closure that has been told to ignore it.
     *
     * So the payload was fetched, and then thrown away. Nothing settled the
     * session, nothing wrote the boot cache, and the whole app rendered as if
     * nobody was signed in however many times you signed in. Anything watching
     * the session for a change of hands — `state/basket.tsx` watches it to empty
     * one person's basket when another signs in — saw the account it knew about
     * replaced by nobody, and did what it is supposed to do.
     *
     * There is nothing to cancel. Everything below writes to caches and to a
     * provider that outlives this component, so a late response is not a leak,
     * it is just late. `started` alone is the whole guard.
     */
    if (started.current) return;
    started.current = true;

    api.site
      .boot()
      .then((payload) => {
        writeBoot(payload);
        /* For this visit rather than the next one: if the cached payload was
           empty or its first photograph has since changed, this is the earliest
           the right one can be started. */
        preloadHero(payload);

        seed(BOOT_KEYS.settings, payload.settings, { persist: true });
        seed(
          BOOT_KEYS.highlights,
          { topItems: payload.topItems, topReview: payload.topReview },
          { persist: true }
        );

        settle(payload.user);
      })
      .catch(() => {
        /*
         * The network is down, or the API is.
         *
         * If there is a cached payload the app is already rendering it and the
         * right thing to do is nothing: the person gets yesterday's menu and a
         * working page instead of an error. If there is not, `settle(null)` at
         * least releases the guards so they can show a sign-in screen rather
         * than a skeleton that never resolves.
         */
        if (readBoot() === null) settle(null);
      });
  }, [settle]);

  return null;
}
