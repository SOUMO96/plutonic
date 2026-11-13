/// <reference lib="webworker" />
/**
 * PLUTONIC service worker (Workbox, injectManifest).
 *
 * Purpose: repeat visits start instantly from the device. It is deliberately small and strict.
 *
 *   NEVER cached (always straight to the network): anything under /api/, the admin pages, anything cross-origin (Supabase,
 *   Cashfree, fonts, NASA/ESO), any non-GET request, any request carrying an Authorization header, /media (the intro video),
 *   and this file and the manifest. These are matched by an explicit denylist registered FIRST.
 *
 *   Cached, and only these:
 *     - the app shell: index.html + the hashed JS/CSS in /assets (precache, versioned by content hash)
 *     - /images/* and /plutonic-logo*  (CacheFirst, expiring)
 *     - the HTML navigation request (NetworkFirst, 3 s timeout, falls back to the cached shell)
 *
 *   A response is only ever stored if it is a plain 200 from our own origin without Cache-Control no-store/private,
 *   without Set-Cookie and without WWW-Authenticate. There is no catch-all route: anything not listed above is not touched.
 *
 *   Updates: a new worker WAITS. The page shows "New version available - reload"; nothing reloads by itself.
 */
import { cacheNames, clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

/** Bump to retire every runtime cache at once. */
const VERSION = 'v1';
export const NAV_CACHE = `pl-nav-${VERSION}`;
export const IMG_CACHE = `pl-img-${VERSION}`;

/** Only plain, same-origin, successful, non-private responses may be stored. */
const storeableOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    const cc = response.headers.get('Cache-Control') ?? '';
    if (response.status !== 200 || response.type !== 'basic') return null;
    if (/no-store|private/i.test(cc)) return null;
    if (response.headers.has('Set-Cookie') || response.headers.has('WWW-Authenticate')) return null;
    return response;
  },
};

// 1) The denylist. Registered first, so it wins over everything below.
registerRoute(
  ({ request, url }) =>
    url.origin !== self.location.origin ||
    request.method !== 'GET' ||
    request.headers.has('Authorization') ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/admin' || url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/media/') ||
    url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest',
  new NetworkOnly(),
);

// 2) The HTML navigation. The app is a hash-router SPA, so every page is the same "/" document.
//    Network first so a new deploy shows up at once; if the network is slow (3 s) or down, use the cached shell.
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html'),
  new NetworkFirst({
    cacheName: NAV_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      storeableOnly,
      // One entry whatever the query string (sign-in links carry ?code=...), so nothing sensitive ever becomes a cache key.
      { cacheKeyWillBeUsed: async () => `${self.location.origin}/index.html` },
      new ExpirationPlugin({ maxEntries: 2 }),
    ],
  }),
);

// 3) Images and the logo.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith('/images/') || url.pathname.startsWith('/plutonic-logo')),
  new CacheFirst({
    cacheName: IMG_CACHE,
    plugins: [storeableOnly, new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true })],
  }),
);

// 4) The app shell, versioned by content hash. No directory-index magic: "/" is handled by the navigation route above.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: null, cleanURLs: false });

// Offline and nothing in the navigation cache yet: serve the precached shell.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') return (await matchPrecache('index.html')) ?? Response.error();
  return Response.error();
});

// A waiting worker only takes over when the page asks (the visitor pressed "Reload").
self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | undefined)?.type;
  if (type === 'SKIP_WAITING') void self.skipWaiting();
  // Sign-out: drop every runtime cache. (They hold no user data by design; this is belt and braces.)
  if (type === 'PURGE_USER_CACHES') event.waitUntil(Promise.all([caches.delete(NAV_CACHE), caches.delete(IMG_CACHE)]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set<string>([cacheNames.precache, NAV_CACHE, IMG_CACHE]);   // versioned names: anything else is an old version
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
  })());
});
clientsClaim();
