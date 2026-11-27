const CACHE_VERSION = 'paris-subway-3d-__BUILD_HASH__';
const APP_SHELL = ['/', '/paris', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Realtime API relays must always prefer network and never break offline
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ feedHealthy: false, serviceActive: true, offlineFallback: true }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )
    );
    return;
  }

  // Never intercept Range requests (206 Partial Content, e.g. PMTiles) — Safari iOS
  // Service Workers do not support caching 206 responses and can break Range headers.
  if (req.headers.has('range') || url.pathname.endsWith('.pmtiles')) return;

  // Heavy static transit datasets & GLB train models: stale-while-revalidate for tunnel resilience.
  // Hashed Vite /assets/* rely on immutable HTTP caching so old JS/CSS chunks don't accumulate here.
  const isDataOrAsset =
    url.pathname.startsWith('/data/') ||
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/icons/');

  if (isDataOrAsset) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        if (cached) {
          void networkPromise;
          return cached;
        }
        const net = await networkPromise;
        return net || new Response('', { status: 504 });
      })
    );
    return;
  }

  // Navigation & HTML shell: network-first with cached SPA shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = (await caches.match(req)) || (await caches.match('/paris')) || (await caches.match('/'));
          return cached || new Response('Hors ligne', { status: 503 });
        })
    );
  }
});
