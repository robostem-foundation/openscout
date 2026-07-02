/* OpenScout service worker — dependency-free, hand-written.
 *
 * Strategy:
 *   - Navigations (HTML documents)  -> network-first, fall back to cached shell (offline support)
 *   - Static hashed assets (/assets, /icons, /fonts, manifest, images/fonts by extension)
 *                                    -> stale-while-revalidate (fast + self-updating)
 *   - Everything else (incl. /api/*) -> network only (never cached; VEX data must stay fresh)
 *
 * Notes:
 *   - Only GET requests are handled. Non-GET (POST/PUT/...) pass straight through.
 *   - Cross-origin requests are ignored so third-party / Vercel Analytics keep working.
 *   - Vite dev/HMR requests (?query module requests, @vite/client, @react-refresh) are
 *     explicitly bypassed so HMR keeps working when the SW is active in dev.
 */

const VERSION = "v1";
const SHELL_CACHE = `openscout-shell-${VERSION}`;
const ASSET_CACHE = `openscout-assets-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

// Cache the app shell entry on install so navigations work offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request("/", { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

// Drop caches from older versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isViteDevRequest(url) {
  // Vite serves ESM modules and its HMR client with query strings / special paths.
  return (
    url.pathname.startsWith("/@vite") ||
    url.pathname.startsWith("/@react-refresh") ||
    url.pathname.startsWith("/@fs") ||
    url.pathname.startsWith("/@id") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/") ||
    url.search.includes("import") ||
    url.search.includes("t=") // vite HMR cache-busting timestamp
  );
}

function isStaticAsset(url) {
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return true;
  }
  return /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; let everything else hit the network untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — always go to network so VEX data stays fresh.
  if (url.pathname.startsWith("/api/")) return;

  // Never intercept Vite dev/HMR module requests — keeps HMR working in dev.
  if (isViteDevRequest(url)) return;

  // Navigations (HTML): network-first, fall back to cached shell for offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the shell fresh for offline fallback.
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match("/", { ignoreSearch: true }).then(
            (cached) =>
              cached ||
              new Response("Offline", {
                status: 503,
                headers: { "content-type": "text/plain" },
              }),
          ),
        ),
    );
    return;
  }

  // Static hashed assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
    return;
  }

  // Everything else: network only (no caching).
});
