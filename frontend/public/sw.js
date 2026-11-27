/* NarcoTrace service worker: fast repeat visits and a readable offline screen.
 *
 * - Built code and icons: cache first (file names change when the code changes).
 * - Public pages and the public access grid: network first, falling back to the last copy.
 * - Enforcement pages and data are never stored on the device, and neither are tips or searches.
 * - Map tiles from other servers are left to the browser (their usage policies do not allow bulk caching).
 */
const VERSION = "nt-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE = "/offline.html";

self.addEventListener("install", event => {
  // The offline screen and icons are essential; the public pages are a bonus if they load.
  event.waitUntil(caches.open(STATIC).then(async c => {
    await c.addAll([OFFLINE, "/icons/icon-192.png", "/icons/favicon-32.png", "/manifest.webmanifest"]);
    const pages = await caches.open(PAGES);
    await Promise.all(["/", "/public"].map(u => fetch(u).then(r => r.ok && pages.put(u, r)).catch(() => {})));
  }));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const NEVER = [/^\/enforcement/, /^\/api\/tips/, /^\/api\/places/];
const PUBLIC_PAGES = [/^\/$/, /^\/public/];
const PUBLIC_DATA = [/^\/api\/recovery\/cells/];

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (request.mode === "navigate" ? caches.match(OFFLINE) : Response.error());
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (NEVER.some(r => r.test(path))) {
    if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/") || path.startsWith("/geo/") || path === OFFLINE) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && PUBLIC_PAGES.some(r => r.test(path))) {
    event.respondWith(networkFirst(request, PAGES));
  } else if (PUBLIC_DATA.some(r => r.test(path))) {
    event.respondWith(networkFirst(request, PAGES));
  }
});
