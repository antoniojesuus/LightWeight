/* LightWeight Service Worker.
 *
 * Estrategia:
 *  - App shell (/, /static/*, /icons/*, /manifest) -> cache-first, fallback a red.
 *  - GET /api/* -> network-first, fallback a caché (solo lectura offline).
 *  - POST/PATCH/DELETE /api/* -> solo red (sin escritura offline).
 *  - Navegaciones -> network-first, fallback a "/" cacheado (shell offline).
 *  - CDN (tailwind, chart.js) -> stale-while-revalidate (opaco, no bloquea).
 */

const CACHE_STATIC = "lightweight-static-v9";
const CACHE_API = "lightweight-api-v1";
const CACHE_CDN = "lightweight-cdn-v1";

const PRECACHE = [
  "/",
  "/static/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[SW] precache falló (normal si / aún no sirve):", err))
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_STATIC, CACHE_API, CACHE_CDN]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isCdn(url) {
  return url.origin !== self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutaciones: van directo a red

  const url = new URL(request.url);

  // 1. API GET -> network-first con fallback a caché
  if (isApi(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_API).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 2. CDN (tailwind, chart.js, fuentes) -> stale-while-revalidate
  if (isCdn(url) && (url.protocol === "https:")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const net = fetch(request)
          .then((res) => {
            // solo cachea respuestas válidas u opacas
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(CACHE_CDN).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // 3. Navegación (html) -> network-first, fallback a "/" (shell offline)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // 4. Estáticos propios -> cache-first, fallback a red y cachear
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
