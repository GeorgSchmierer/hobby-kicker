/**
 * Service Worker (Offline-Modus, TODO A5): legt die App auf dem Handy ab, damit sie auch ohne
 * Netz startet. Vorlage – scripts/build-web.mjs macht daraus dist/sw.js und setzt Version und
 * Dateiliste ein. Jede neue Version bekommt einen eigenen Speicher, alte werden gelöscht.
 *
 * - Seitenaufruf (index.html): erst Netz (höchstens 4 Sekunden), sonst die gespeicherte Seite
 * - Programmdateien, Bilder, Töne: aus dem Speicher (die Namen enthalten einen Fingerabdruck,
 *   eine neue Version hat also neue Namen)
 * - Supabase (andere Adresse), /version.json und /sw.js: nie aus dem Speicher
 */
/* global __FILES__ -- wird von scripts/build-web.mjs ersetzt */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `hobby-kicker-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 4000;

/** Umgeleitete Antworten (z. B. /index.html → /) dürfen nicht als Seite ausgeliefert werden */
async function clean(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        FILES.map(async (file) => {
          const response = await fetch(new Request(file, { cache: 'reload' }));
          if (!response.ok) throw new Error(`${file}: ${response.status}`);
          await cache.put(file, await clean(response));
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('hobby-kicker-') && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put('/', await clean(response.clone()));
    return response;
  } catch {
    return (await cache.match('/')) || (await cache.match('/index.html')) || Response.error();
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return;
  event.respondWith(request.mode === 'navigate' ? fromNetworkFirst(request) : fromCacheFirst(request));
});
