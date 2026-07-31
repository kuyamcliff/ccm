/*
 * Service worker, fourth generation.
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
 */

const VERSION = "v4";
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

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
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
