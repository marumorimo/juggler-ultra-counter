'use strict';

// Bump this on every deploy so old caches get cleaned up in activate().
const CACHE_VERSION = 'juggler-counter-v1';

const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// App shell (this origin): cache-first, so the counter opens instantly even with
// no signal — a network hit only happens once, to populate the cache.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// Third-party assets (Tailwind CDN script, Google Fonts): stale-while-revalidate,
// so a cached copy renders immediately while a fresh one loads in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      // cross-origin, no-cors requests resolve as opaque (status 0) — still cacheable.
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkFetch) || Promise.reject(new Error('offline and not cached'));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isSameOrigin = new URL(request.url).origin === self.location.origin;
  event.respondWith(isSameOrigin ? cacheFirst(request) : staleWhileRevalidate(request));
});
