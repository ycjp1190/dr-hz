const CACHE_NAME = "dr-hz-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const NETWORK_FIRST_PATHS = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/sw.js"
]);

function normalizePath(url) {
  const parsed = new URL(url);
  return parsed.pathname.endsWith("/") ? "/" : parsed.pathname;
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  const responseCopy = networkResponse.clone();
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, responseCopy);
  return networkResponse;
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request, { cache: "no-store" });
    const responseCopy = networkResponse.clone();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, responseCopy);
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    if (request.mode === "navigate") {
      return caches.match("./index.html");
    }

    throw new Error("No cached response available.");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const path = normalizePath(event.request.url);
  const useNetworkFirst = event.request.mode === "navigate" || NETWORK_FIRST_PATHS.has(path);
  event.respondWith(useNetworkFirst ? networkFirst(event.request) : cacheFirst(event.request));
});
