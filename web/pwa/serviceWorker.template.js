// The service worker: a script the browser runs apart from any page, which can
// answer the page's requests itself. This is what lets one-phone mode open with no
// signal at all. offlineShell.ts fills in the two placeholders at build time.
//
// It never touches the game's WebSocket. Service workers do not see those, so the
// online game behaves exactly as it does without this file.

const CACHE = "__CACHE_NAME__";
const FILES = __PRECACHE_FILES__;
const FONT_CACHE = "pg-fonts";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// How long to wait for the network before settling for the saved copy of the page.
// Bad signal is worse than none: a request can hang for a long time before failing.
const PAGE_TIMEOUT_MS = 3000;

// Save everything the app needs before this version takes over.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// Drop the files of older versions. Their names contain a hash, so they would
// otherwise pile up forever. Fonts are kept, because they do not change.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE && n !== FONT_CACHE).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(fromCacheThenSave(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // A page: try for the newest one, so an update reaches people straight away, but
  // any URL can fall back to the saved app, which then routes itself.
  if (request.mode === "navigate") {
    event.respondWith(pageWithFallback(request));
    return;
  }

  // Everything else has its content's hash in its name, so a saved copy is never
  // out of date. ignoreVary matters: a server may answer "Vary: Origin", and the
  // page asks for its scripts with an Origin header that the install step's requests
  // did not have, so a strict lookup would miss every file and load a blank page.
  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});

async function pageWithFallback(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), PAGE_TIMEOUT_MS)),
    ]);
    if (response.ok) return response;
  } catch {
    // Offline, or too slow. Fall through to the saved copy.
  }
  const saved = await caches.match("/index.html", { ignoreVary: true });
  return saved ?? fetch(request);
}

async function fromCacheThenSave(request) {
  const hit = await caches.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  // An opaque response (status 0) is a font fetched without CORS, and is still good.
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(FONT_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
