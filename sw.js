const VERSION = "v8";
const APP_CACHE = `arafiles-app-${VERSION}`;
const RUNTIME_CACHE = `arafiles-runtime-${VERSION}`;

const SCOPE = self.registration.scope; // .../Arafiles/
const toAbs = (p) => new URL(p, SCOPE).toString();

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png"
].map(toAbs);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== APP_CACHE && k !== RUNTIME_CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

async function cacheFirst(req){
  const cached = await caches.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  if (res) {
    const c = await caches.open(RUNTIME_CACHE);
    c.put(req, res.clone()).catch(()=>{});
  }
  return res;
}

async function staleWhileRevalidate(req){
  const c = await caches.open(RUNTIME_CACHE);
  const cached = await c.match(req);

  const fetchPromise = fetch(req).then(res => {
    if (res) c.put(req, res.clone()).catch(()=>{});
    return res;
  }).catch(()=>null);

  return cached || (await fetchPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // navigation fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch { return (await caches.match(toAbs("./index.html"))) || new Response("Offline", {status:200}); }
    })());
    return;
  }

  const scopePath = new URL(SCOPE).pathname;
  const isInAppScope = (url.origin === self.location.origin && url.pathname.startsWith(scopePath));

  if (isInAppScope) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // CDN runtime cache (fonts/libs)
  if (
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});