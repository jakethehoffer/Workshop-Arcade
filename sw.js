// Workshop Arcade service worker.
//
// Strategy: a tiny offline-capable shell for the catalog, plus a runtime
// stale-while-revalidate cache for same-origin GETs. Game files are only
// cached after the player navigates to them at least once, so the install
// step stays small and predictable.
//
// Cache key includes a version stamp so a deploy that ships a changed
// shell file invalidates the old cache via `activate` cleanup.

const VERSION = 'wa-v1-2026-05-17';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Resolve scope-relative paths so the SW works at any deploy prefix
// (GitHub Pages serves this site under /Workshop-Arcade/).
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const shellAssets = [
  '',
  'websites/manifest.json',
  'covers/app-icon.svg',
  'app.webmanifest',
].map((relative) => new URL(relative, scopeUrl).toString());

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Use individual put() calls so one missing asset cannot fail the install.
    await Promise.all(shellAssets.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Network unavailable during install; runtime cache will fill in later.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name !== SHELL_CACHE && name !== RUNTIME_CACHE) {
        return caches.delete(name);
      }
      return undefined;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin) return;
  if (!url.pathname.startsWith(scopePath)) return;

  // Navigations: serve the catalog shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        const shellMatch = await caches.match(new URL('', scopeUrl).toString());
        if (shellMatch) return shellMatch;
        return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Static assets: cache-first with stale-while-revalidate refresh.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request).then((response) => {
      if (response && response.ok && response.type === 'basic') {
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) return cached;
    const network = await fetchPromise;
    if (network) return network;
    return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});
