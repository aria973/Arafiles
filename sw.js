/* Offline-first Service Worker for GitHub Pages subfolder (/Arafiles/)
   - Precache app shell (local files)
   - Runtime cache CDN fonts/libs (google fonts, cdnjs, etc.)
   - Navigation fallback to cached index.html when offline
*/

const VERSION = "v6";
const APP_CACHE = `arafiles-app-${VERSION}`;
const RUNTIME_CACHE = `arafiles-runtime-${VERSION}`;

// Build URLs relative to the SW scope (e.g. https://.../Arafiles/)
const SCOPE = self.registration.scope; // ends with /Arafiles/
const toAbs = (p) => new URL(p, SCOPE).toString();

// Local app shell (MUST exist in your repo)
const APP_SHELL = [
  "./",               // /Arafiles/
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png"
].map(toAbs);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== APP_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// Helpers
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  // cache only successful GET
  if (res && res.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone()).catch(()=>{});
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((res) => {
    // cache even opaque (fonts/css from google) - ok for offline reuse
    if (res) cache.put(request, res.clone()).catch(()=>{});
    return res;
  }).catch(() => null);

  return cached || (await fetchPromise) || Response.error();
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try{
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(()=>{});
    return res;
  }catch(e){
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // 1) Handle navigation (page loads) => offline fallback to cached index.html
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try{
        // network first for html so updates arrive when online
        const res = await fetch(req);
        const cache = await caches.open(APP_CACHE);
        cache.put(toAbs("./index.html"), res.clone()).catch(()=>{});
        return res;
      }catch(e){
        const cachedIndex = await caches.match(toAbs("./index.html"));
        return cachedIndex || caches.match(toAbs("./")) || new Response("Offline", { status: 200 });
      }
    })());
    return;
  }

  // 2) Same-origin local files: cache-first (fast + offline)
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL(SCOPE).pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 3) CDN / cross-origin assets: stale-while-revalidate (best offline feel)
  // Examples: fonts.googleapis.com, fonts.gstatic.com, cdnjs.cloudflare.com
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("cloudflare.com")
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 4) Default: network-first with cache fallback
  event.respondWith(networkFirst(req));
});