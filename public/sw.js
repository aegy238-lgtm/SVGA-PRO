// Service Worker for AHMED & CR8 SVGA · MotionTools PWA (Windows & Android)
const CACHE_NAME = 'ahmed-svga-motiontools-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
];

// Import Share Target handler for Android "Share to App"
try {
  importScripts('/sw-share-target.js');
} catch (e) {
  console.warn('[SW] Could not import /sw-share-target.js:', e);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn('[SW] Some static assets could not be pre-cached:', err);
        })
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME && key !== 'pwa-shared-media-v1') {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, API routes, offline dist bundler, or WebSockets
  if (event.request.method !== 'GET') return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/__offline_dist__/') ||
    url.pathname.startsWith('/socket.io/')
  ) {
    return;
  }

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigations so users always get fresh app updates
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/index.html');
        if (cached) return cached;
        return caches.match('/');
      })
    );
    return;
  }

  // Stale-while-revalidate for static assets & icons
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
