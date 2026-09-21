// Service worker: the app shell — markup, styles, every module, the vendored lit-html, the WASM
// solver and the published catalogue — is cached on install, so the simulator boots and runs with
// no network at all. The cache is named by the deployed version; pages.yml stamps the git SHA in,
// a fresh install gets a fresh cache, and the old one is dropped once the new worker takes over.
//
// Strategy by request:
//   navigations            → the cached index.html (the app routes by hash), network if uncached
//   catalogue/…            → network first so a newly published profile shows up, cache if offline
//   anything else same-origin → cache first, network on a miss (and remembered)
//   cross-origin (fonts)   → cache first with a background refresh; a miss falls back to the browser's own fonts

const VERSION = 'ebd0ab5'.startsWith('__') ? 'dev' : 'ebd0ab5';
const CACHE = `brew-simulator-${VERSION}`;

// Every file the app needs before it has drawn anything. Relative to this worker's scope.
// web/test/sw.mjs checks this list against the files on disk, both ways.
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'src/main.js',
  'src/store.js',
  'src/ui.js',
  'src/info.js',
  'src/engine.js',
  'src/worker.js',
  'src/frame.js',
  'src/draw.js',
  'src/catalogue.js',
  'src/profiles.js',
  'src/screens/quick.js',
  'src/screens/setup.js',
  'src/screens/simulate.js',
  'src/screens/recipe-search.js',
  'src/screens/log.js',
  'src/screens/calibrate.js',
  'src/screens/bench.js',
  'src/screens/workspaces.js',
  'src/screens/experiments.js',
  'src/screens/profiles.js',
  'vendor/lit-html/lit-html.js',
  'vendor/lit-html/directive.js',
  'vendor/lit-html/directive-helpers.js',
  'vendor/lit-html/directives/live.js',
  'vendor/lit-html/directives/unsafe-html.js',
  'vendor/lit-html/directives/unsafe-svg.js',
  'pkg/brew_wasm.js',
  'pkg/brew_wasm_bg.wasm',
];

const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(scoped));
    // The catalogue is data the backend grows, so its file list comes from its own index rather
    // than from this file. Best effort: a missing catalogue must not stop the app installing.
    try {
      const res = await fetch(scoped('catalogue/index.json'), { cache: 'no-cache' });
      if (res.ok) {
        const index = await res.clone().json();
        await cache.put(scoped('catalogue/index.json'), res);
        await cache.addAll((index.profiles || []).map((p) => scoped(`catalogue/${p.path}`)));
      }
    } catch (e) { /* offline at install; the catalogue is fetched when it can be */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('brew-simulator-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const inScope = sameOrigin && req.url.startsWith(self.registration.scope);

  if (req.mode === 'navigate' && inScope) {
    event.respondWith(cacheFirst(scoped('index.html'), req));
    return;
  }
  if (inScope && url.pathname.includes('/catalogue/')) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (sameOrigin) {
    event.respondWith(cacheFirst(req, req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(key, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(key, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}
