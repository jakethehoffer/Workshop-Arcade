// Workshop Arcade service worker.
//
// Strategy: a tiny offline-capable shell for the catalog, plus a runtime
// stale-while-revalidate cache for same-origin GETs. Game files are only
// cached after the player navigates to them at least once, so the install
// step stays small and predictable.
//
// Navigations that fail (no network, cache miss for the requested URL,
// catalog shell missing) fall through to the dedicated `offline.html`
// page so visitors always land somewhere branded with a "Back to catalog"
// link. `404.html` is pre-cached opportunistically for the same reason.
//
// Cache key includes a version stamp so a deploy that ships a changed
// shell file invalidates the old cache via `activate` cleanup.

const VERSION = 'wa-v8-2026-05-22';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Match the desktop branch of index.html's aboveFoldCoverCount(). The
// SW doesn't know the visitor's viewport at install time, so we hedge
// toward the desktop max — mobile visitors will see at most 6 covers
// pre-cached instead of 3, which is wasted bandwidth ONCE on first
// install but pays for itself the moment they scroll past the fold or
// share the install with a desktop session.
const COVER_PREFETCH_COUNT = 6;

// Resolve scope-relative paths so the SW works at any deploy prefix
// (GitHub Pages serves this site under /Workshop-Arcade/).
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const OFFLINE_URL = new URL('offline.html', scopeUrl).toString();
const NOT_FOUND_URL = new URL('404.html', scopeUrl).toString();
const MANIFEST_URL = new URL('websites/manifest.json', scopeUrl).toString();
const shellAssets = [
  '',
  'websites/manifest.json',
  'covers/app-icon.svg',
  'app.webmanifest',
  'offline.html',
  '404.html',
].map((relative) => new URL(relative, scopeUrl).toString());

async function cachePut(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response && response.ok) {
      await cache.put(url, response.clone());
    }
  } catch {
    // Network unavailable during install; runtime cache will fill in later.
  }
}

// Read the manifest and pick the cover URLs for the newest
// COVER_PREFETCH_COUNT games (which is what index.html shows
// above the fold in its default "newest first" sort). The SW
// fetches manifest.json itself rather than waiting for the page to
// hand it over, because install runs in a worker context with no
// access to the document.
async function newestCoverUrls() {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'reload' });
    if (!response || !response.ok) return [];
    const manifest = await response.json();
    if (!Array.isArray(manifest)) return [];
    const sorted = [...manifest].sort((a, b) => String(b?.addedAt || '').localeCompare(String(a?.addedAt || '')));
    return sorted
      .slice(0, COVER_PREFETCH_COUNT)
      .map((game) => game?.cover)
      .filter((cover) => typeof cover === 'string' && cover.length > 0)
      .map((cover) => new URL(cover, scopeUrl).toString());
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Use individual put() calls so one missing asset cannot fail the install.
    await Promise.all(shellAssets.map((url) => cachePut(cache, url)));
    // Pre-cache the newest catalog covers so returning visitors get
    // instant above-the-fold paint with zero cover network fetches.
    // Failure is non-fatal — the runtime stale-while-revalidate cache
    // picks them up on first paint as a fallback.
    const coverUrls = await newestCoverUrls();
    await Promise.all(coverUrls.map((url) => cachePut(cache, url)));
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

  // Navigations: prefer the network so the user gets the freshest catalog
  // (or game page) when online. Offline, fall back to the cached copy of
  // the requested URL, then to the catalog shell, then to a branded
  // offline.html page rather than a raw 503.
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
        const offlineMatch = await caches.match(OFFLINE_URL);
        if (offlineMatch) return offlineMatch;
        return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
    return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});

// Keep the constants reachable from check-pwa.mjs's static contract check.
// They are documented references for tooling, not runtime exports.
self.WORKSHOP_ARCADE_SW_FALLBACKS = { OFFLINE_URL, NOT_FOUND_URL };
