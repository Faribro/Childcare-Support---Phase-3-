// Alliance Child Nutrition & Education Support - High Reliability Offline PWA Service Worker
const CACHE_NAME = 'alliance-pwa-v3.0.1';
const PRECACHE_URLS = [
  '/',
  '/app',
  '/assessment/new',
  '/assessment/sync',
  '/manifest.json',
  '/alliance-india-logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache partial error (ignored for non-blocking):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests (POST, PATCH, PUT, DELETE) - strictly network-only
  // POST /api/submissions and PATCH /api/submissions/:id are never intercepted or cached
  if (request.method !== 'GET') return;

  // 2. Skip cross-origin requests (e.g. CDNs, external analytics, Google scripts)
  if (url.origin !== self.location.origin) return;

  // 3. Skip all API routes - API calls must remain strictly network-only
  // Never intercept or cache /api/* requests or sensitive response bodies
  if (url.pathname.startsWith('/api/')) return;

  // 4. Handle navigation requests (HTML document requests)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Try matching cached response, ignoring query params (e.g. ?status=syncing&ref=...)
          const cachedResponse = await caches.match(request, { ignoreSearch: true });
          if (cachedResponse) return cachedResponse;

          // Route-specific cached shells
          if (url.pathname.startsWith('/assessment/sync')) {
            const syncShell = await caches.match('/assessment/sync');
            if (syncShell) return syncShell;
          }
          if (url.pathname.startsWith('/assessment/new')) {
            const newShell = await caches.match('/assessment/new');
            if (newShell) return newShell;
          }

          // Fallback app or home shell
          const fallbackApp = await caches.match('/app');
          if (fallbackApp) return fallbackApp;

          const fallbackHome = await caches.match('/');
          if (fallbackHome) return fallbackHome;

          // Guaranteed valid HTML offline Response (status 503)
          return new Response(
            '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Offline - Childcare Support</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>Offline</h1><p>You are currently offline. Saved records remain safely stored on this device.</p></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable (Offline)',
              headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
            }
          );
        })
    );
    return;
  }

  // 5. Handle static assets & other same-origin GET requests (Stale-While-Revalidate)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // If cached response exists, return it immediately and revalidate in background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
            }
          })
          .catch(() => {/* background fetch failure is ignored when cachedResponse is already served */});

        return cachedResponse;
      }

      // If not cached, fetch from network with guaranteed fallback Response on failure
      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          // If network fails and item is not in cache, check if route shell can satisfy it
          if (url.pathname.startsWith('/assessment/sync')) {
            const syncShell = await caches.match('/assessment/sync');
            if (syncShell) return syncShell;
          }

          // NEVER return undefined, null, or rejected promise. Always return a valid Response.
          return new Response('Resource offline or unavailable', {
            status: 503,
            statusText: 'Service Unavailable (Offline)',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
          });
        });
    })
  );
});
