const CACHE_PREFIX = 'monster-construction-';
const CACHE_VERSION = '1.35.3';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SCOPE_URL = new URL('./', self.registration.scope);
const INDEX_URL = new URL('./index.html', SCOPE_URL).toString();

const PRECACHE_URLS = [
  /* PWA_PRECACHE_START */
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/data/master-data.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-icon-512.png',
  './assets/icons/apple-touch-icon.png'
  /* PWA_PRECACHE_END */
];

function scopedUrl(pathname) {
  return new URL(pathname, SCOPE_URL).toString();
}

async function installAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PRECACHE_URLS.map(scopedUrl));
  await self.skipWaiting();
}

async function removeOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)));
  await self.clients.claim();
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(INDEX_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(INDEX_URL)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  const versioned = url.searchParams.has('v');
  const cached = await cache.match(request, { ignoreSearch: !versioned });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    if (versioned) {
      const unversioned = new URL(url.pathname, SCOPE_URL).toString();
      return (await cache.match(unversioned)) ?? Response.error();
    }
    return Response.error();
  }
}

async function networkWithCacheFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(installAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOldCaches());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.origin === self.location.origin && url.href.startsWith(SCOPE_URL.href)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith(networkWithCacheFallback(request));
  }
});
