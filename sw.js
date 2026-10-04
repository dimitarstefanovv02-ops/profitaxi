// ProfiTaxi – service worker: приложението се отваря и без интернет.
const VERSION = 'profitaxi-v1';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/util.js', '/js/store.js', '/js/calc.js', '/js/ui.js', '/js/constants.js',
  '/js/views/auth.js', '/js/views/onboarding.js', '/js/views/home.js', '/js/views/shift.js', '/js/views/shifts.js',
  '/js/views/stats.js', '/js/views/costs.js', '/js/views/profile.js', '/js/views/carSettings.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Мрежата е с предимство (за да идват обновленията), кешът е резервен вариант.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html'))));
});
