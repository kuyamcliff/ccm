/*
 * Service worker, fifth generation.
 *
 * It replaces the worker the previous site installed — same URL, so every
 * browser that still holds the old one picks this up and, because of
 * skipWaiting + clients.claim below, hands over immediately instead of waiting
 * for every tab to close. The activate step deletes any cache this version does
 * not own, which is what clears the old site's cached HTML.
 *
 * Rules:
 *   navigation  → network first; the cached shell answers only when offline
 *   /assets/*   → cache first (Vite puts a content hash in the filename)
 *   /uploads/*  → cache first (the API addresses these by content hash too)
 *   /api/*      → never touched
 *
 * ── Why v5 exists ────────────────────────────────────────────────────────────
 *
 * v4 could poison itself into a permanently blank page, and did.
 *
 * Every deploy gives the bundles new hashed names, so the previous deploy's
 * `/assets/index-OLD.js` stops existing. The host's SPA rewrite answered that
 * missing file with `index.html` — 200 OK, `text/html` — rather than a 404.
 * `cacheFirst` saw a perfectly good 200 and stored that HTML *under the
 * JavaScript URL*, in a cache built to be held for a year.
 *
 * From then on the browser asked for a module, was handed a page, refused to
 * run it, and React never mounted: the boot splash forever, on every reload,
 * because the bad answer was being served from disk and the network was never
 * consulted again. Reloading could not clear it. That is the worst class of bug
 * this file can produce — one the visitor has no way out of.
 *
 * The host now returns a real 404 for a missing asset, so the poison is not
 * offered any more. This file no longer trusts that: `looksMistyped` refuses to
 * store, or to serve, HTML sitting where a script or a stylesheet belongs, so
 * the same mistake from any future host config cannot take the site down again.
 */

const VERSION = "v5";
const SHELL = `ccm-shell-${VERSION}`;
const ASSETS = `ccm-assets-${VERSION}`;
const OFFLINE_URL = "/";

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
  const keep = new Set([SHELL, ASSETS]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/** Lets a freshly deployed page take over without a manual reload. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

/**
 * A response that cannot be what the URL asked for.
 *
 * A request for `.js` or `.css` answered with an HTML document is always a
 * server falling back to the SPA shell for a file it could not find. It is a
 * 200, so nothing else here would question it — and caching it is what turned a
 * missing file into a site that would not start. Never stored, never served.
 */
function looksMistyped(request, response) {
  const path = new URL(request.url).pathname;
  if (!/\.(js|mjs|css)$/.test(path)) return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  const hit = await cache.match(request);
  if (hit) {
    // An entry poisoned by an older version of this worker: drop it and go to
    // the network, so one bad deploy cannot outlive itself.
    if (!looksMistyped(request, hit)) return hit;
    await cache.delete(request);
  }

  const response = await fetch(request);
  if (response.ok && !looksMistyped(request, response)) cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      cache.put(OFFLINE_URL, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
