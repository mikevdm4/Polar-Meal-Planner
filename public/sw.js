// A deliberately simple service worker: cache the app shell (HTML/JS/CSS)
// the first time it loads successfully, then serve from that cache if a
// later load happens with no network at all. This does NOT cache API
// calls to Supabase — those still need a real connection, and the app's
// own localStorage-first design already handles that gracefully.

const CACHE_NAME = "polar-endurance-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle same-origin GET requests for the app itself — never intercept
  // calls to Supabase or any other API, which must always hit the network.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cache.match(req).then((cached) => cached || cache.match("/index.html")))
    )
  );
});
