/*
 * Service worker, sixth generation.
 *
 * ── The rules ──────────────────────────────────────────────────────────────
 *
 *   navigation      network first; the cached shell answers only when offline
 *   /assets/*       cache first (Vite puts a content hash in the filename)
 *   /uploads/*      cache first (the API addresses these by content hash too)
 *   read-only /api  stale while revalidate, for the handful listed in API_SWR
 *   everything else network only, never touched
 *
 * ── Why v6 exists ──────────────────────────────────────────────────────────
 *
 * v5 was correct and is kept almost intact. What is new is the small set of API
 * reads that are now served from cache while being refreshed in the background:
 * the boot payload, the menu, the highlights and the settings. Those four are
 * what a cold visit waits on, and all four are safe to show for a second or two
 * while the fresh copy lands.
 *
 * Nothing else under /api is cached, and that is a hard line rather than an
 * oversight. A payment status, a booking, an order, anything under /desk: those
 * must never be answered from disk. A stale "payment pending" is somebody paying
 * twice.
 *
 * ── The poison guard, kept verbatim from v5 ────────────────────────────────
 *
 * v4 could poison itself into a permanently blank page, and did.
 *
 * Every deploy gives the bundles new hashed names, so the previous deploy's
 * `/assets/index-OLD.js` stops existing. The host's SPA rewrite answered that
 * missing file with `index.html` (200 OK, `text/html`) rather than a 404.
 * `cacheFirst` saw a perfectly good 200 and stored that HTML *under the
 * JavaScript URL*, in a cache built to be held for a year.
 *
 * From then on the browser asked for a module, was handed a page, refused to run
 * it, and React never mounted: the boot splash forever, on every reload, because
 * the bad answer came off disk and the network was never consulted again.
 * Reloading could not clear it. That is the worst class of bug this file can
 * produce, one the visitor has no way out of.
 *
 * The host now returns a real 404 for a missing asset, so the poison is not
 * offered any more. This file does not trust that: `looksMistyped` refuses to
 * store, or to serve, HTML sitting where a script or a stylesheet belongs.
 */

const VERSION = "v6";
const SHELL = `ccm-shell-${VERSION}`;
const ASSETS = `ccm-assets-${VERSION}`;
const DATA = `ccm-data-${VERSION}`;
const OFFLINE_URL = "/";

/**
 * The only API reads that may be served from disk.
 *
 * Every one of them is public, anonymous, changes rarely, and is safe to show a
 * few seconds out of date. Adding anything to this list that is per-person or
 * that carries money is a bug, not a tuning decision.
 *
 * `/api/bootstrap` is deliberately **not** here, even though it is the one
 * request the app opens with and caching it looks like the obvious win. Its body
 * carries `user`, so a copy of it on disk outlives a sign-out: the cookie goes,
 * but this cache would still hand the next load the previous person's name and
 * signed-in state until the revalidation landed. The app caches that payload
 * itself in localStorage, where `clearBoot()` can and does wipe it the moment
 * the session changes hands. A cache the app cannot reach into is the wrong
 * place for anything with a person's name in it.
 */
const API_SWR = ["/api/menu", "/api/popular", "/api/site-settings", "/api/offers"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, ASSETS, DATA]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

/**
 * A response that is HTML sitting where code belongs.
 *
 * This is the whole v4 disaster in one function. Never store one of these, and
 * never serve one.
 */
function looksMistyped(request, response) {
  if (!response) return false;
  const destination = request.destination;
  if (destination !== "script" && destination !== "style") return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit && !looksMistyped(request, hit)) return hit;

  /* Either nothing stored, or something poisoned is. Both mean go to the
     network, and in the second case overwrite what is there. */
  const fresh = await fetch(request);
  if (fresh.ok && !looksMistyped(request, fresh)) {
    cache.put(request, fresh.clone()).catch(() => {});
  }
  return fresh;
}

/**
 * Answer from disk immediately, then quietly replace what is on disk.
 *
 * The revalidation is deliberately not awaited: the point is that the page gets
 * an answer in single-digit milliseconds. The fresh copy is for the next load,
 * and the app's own query layer is separately refetching for this one.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);

  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);

  if (hit) {
    refresh.catch(() => {});
    return hit;
  }

  const fresh = await refresh;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ error: "Offline." }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Only ever GET. A cached POST is a second order, a second payment, or a
     second booking. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* A navigation: the page itself. Network first, because a stale shell means a
     stale set of asset hashes, and the cached copy is only there so that a
     visitor with no signal sees the site rather than the browser's dinosaur. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(SHELL)
            .then((cache) => cache.put(OFFLINE_URL, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  /* Uploaded photographs. Addressed by a hash of their own content, so a given
     URL is the same bytes forever and caching it for good is safe. This is what
     makes a second visit show its pictures instantly. */
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (API_SWR.some((path) => url.pathname === path)) {
    event.respondWith(staleWhileRevalidate(request, DATA));
    return;
  }

  /* Everything else, including the whole of the rest of /api, goes to the
     network untouched. */
});
