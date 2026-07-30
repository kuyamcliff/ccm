/*
 * The previous worker answered every GET from the cache and never refreshed it,
 * so once a visitor had loaded the site they kept the same HTML forever — and
 * after a deploy that HTML pointed at script filenames no longer on the server,
 * leaving them on a blank page until they cleared storage.
 *
 * Strategy now:
 *   navigation   → network first, cached copy only as an offline fallback
 *   /assets/*    → cache first (filenames carry a content hash)
 *   /uploads/*   → cache first (content-addressed on the server)
 *   /api/*       → never cached
 */

const VERSION = "v3";
const SHELL_CACHE = `camchop-shell-${VERSION}`;
const ASSET_CACHE = `camchop-assets-${VERSION}`;
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Lets a waiting worker take over immediately when the page asks it to. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/uploads/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // HTML: always try the network so a new deploy is picked up on next load.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_URL, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Hashed assets never change under the same URL, so the cache is authoritative.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else: fresh if possible, cached if the network is unavailable.
  event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c ?? Response.error())));
});
