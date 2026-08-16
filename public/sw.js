const BASE_PATH = self.location.pathname
  .replace(/\/sw\.js$/, "")
  .replace(/\/$/, "");
const ROOT = `${BASE_PATH}/`;
const CACHE_PREFIX = "voxel-rally-";
const CACHE_VERSION = "v12";
const CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = [ROOT, `${BASE_PATH}/manifest.json`, `${BASE_PATH}/favicon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const acceptsHtml = event.request.headers.get("accept")?.includes("text/html") ?? false;
  if (event.request.mode === "navigate" || acceptsHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) void caches.open(CACHE).then((cache) => cache.put(ROOT, response.clone()));
          return response;
        })
        .catch(() => caches.match(ROOT)),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ??
      fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(ROOT)),
    ),
  );
});
