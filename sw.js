// Service worker: precache the whole app so it runs offline (as in ../scalear).
//
// On deploy, VERSION becomes the commit hash, and every src/ URL below (and in index.html and the
// modules' imports) gets the same ?v=<hash>. See .github/workflows/pages.yml. So each deploy changes
// this file: the browser installs the new worker, which downloads that version's files into a fresh
// cache, and the page offers to reload. Locally (VERSION 'dev') everything comes from the network
// first and the cache is only for offline.
const VERSION = 'dev';
const CACHE = 'mlog-' + VERSION;

// Every file the site publishes. The deploy fails if one is missing here.
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/styles.css',
  'src/main.js',
  'src/version.js',
  'src/store.js',
  'src/backup.js',
  'src/dates.js',
  'src/dom.js',
  'src/presets.js',
  'src/instIcons.js',
  'src/entries.js',
  'src/links.js',
  'src/home.js',
  'src/chart.js',
  'src/editor.js',
  'src/settings.js',
  'src/i18n.js',
  'src/lang/en.js',
  'src/lang/cs.js',
  'fonts/Silkscreen-Regular.woff2',
  'fonts/ScalearPixelCE.ttf',
  'img/icon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/maskable-512.png',
  'img/apple-touch-icon.png',
];

// cache: 'reload' skips the HTTP cache, so no stale copy ends up in the new cache.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

// Other apps on the same origin (juhyxx.github.io) have their own caches; only ours are removed.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mlog-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const DEV = VERSION === 'dev';
const cached = (req, options) => caches.open(CACHE).then(c => c.match(req, options));

function fromNetwork(req) {
  // locally, ask the server every time, so the browser's HTTP cache never mixes old and new files
  // (a navigation can't be copied with new options, so the page is fetched by its URL)
  const fresh = !DEV ? req : req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' });
  return fetch(fresh).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
}

// Navigations fall back to the cached shell so deep links (and shared links, ?url=…) work offline.
const offline = req => cached(req, { ignoreSearch: true })
  .then(hit => hit || (req.mode === 'navigate' ? cached('index.html') : Response.error()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (DEV) {
    e.respondWith(fromNetwork(req).catch(() => offline(req)));
    return;
  }
  e.respondWith(
    cached(req, { ignoreSearch: true }).then(hit => hit || fromNetwork(req).catch(() => offline(req))),
  );
});
