/* Family Planner Service Worker — Privacy-Safe Network-First PWA */

const CACHE_VERSION = "family-planner-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept non-GET requests (POST/PATCH/PUT/DELETE mutations)
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never cache API endpoints so auth, invites, meds, tasks, and wall stay live
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // Document navigations: always go straight to the network (never cache private
  // per-user SSR HTML, invite previews, or medication state) and fall back to /offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const staticCache = await caches.open(STATIC_CACHE);
        const offlinePage = await staticCache.match("/offline");
        if (offlinePage) return offlinePage;

        return new Response(
          "You appear to be offline. Please reconnect to use Family Planner.",
          { status: 503, headers: { "Content-Type": "text/plain" } }
        );
      })
    );
    return;
  }

  // Static Next.js assets, icons, manifest, and fonts: Cache-First with network fill
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Background refresh for fonts/manifest; hashed _next/static files are immutable
          if (!url.pathname.startsWith("/_next/static/")) {
            fetch(request)
              .then((res) => {
                if (res && res.ok) cache.put(request, res.clone());
              })
              .catch(() => {});
          }
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && (response.ok || response.type === "opaque")) {
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response("", { status: 504 });
        }
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/?tab=wall";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              client.navigate(targetUrl).catch(() => {});
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
