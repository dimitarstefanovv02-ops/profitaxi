// ProfiTaxi – service worker: приложението се отваря и без интернет.
const VERSION = 'profitaxi-v59';
const SHELL = [
  '/app', '/app.html', '/css/app.css', '/css/skins.css', '/js/skin.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/favicon-64.png',
  '/js/app.js', '/js/util.js', '/js/store.js', '/js/sync.js', '/js/schema.js', '/js/config.js', '/js/calc.js', '/js/ui.js', '/js/constants.js',
  '/js/views/auth.js', '/js/views/onboarding.js', '/js/views/home.js', '/js/views/shift.js', '/js/views/shifts.js',
  '/js/views/stats.js', '/js/views/costs.js', '/js/views/profile.js', '/js/views/carSettings.js', '/js/views/cityPicker.js',
  '/js/views/reservations.js', '/js/views/invite.js', '/js/views/categories.js', '/js/views/shiftResult.js', '/js/views/calendar.js', '/js/tour.js', '/js/views/money.js', '/js/views/me.js',
  '/js/quotes.js', '/js/notify.js', '/js/brand.js', '/js/views/ideas.js', '/js/views/help.js', '/js/views/guide.js', '/js/views/vehicle.js', '/js/arrange.js', '/js/quick.js', '/js/picker.js', '/js/kb.js', '/js/tips.js', '/js/driverpush.js', '/js/passkey.js', '/js/voice.js', '/js/speech.js', '/js/views/search.js',
  '/app/onetaxi', '/css/one.css', '/manifest-one.webmanifest', '/icons/one-192.png', '/icons/one-favicon-64.png', '/icons/one-red.svg', '/icons/one-lockup.svg', '/icons/one-lockup-dark.svg', '/icons/icon.svg',
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
  }).catch(() => caches.match(req).then((r) => r || caches.match((p => p.startsWith('/admin') ? '/admin.html' : (p.startsWith('/app/onetaxi') || p.startsWith('/onetaxi')) ? '/app/onetaxi' : '/app.html')(new URL(req.url).pathname)))));
});

// Известие от сървъра (админ: нов шофьор, въпрос)
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'ProfiTaxi', { body: d.body || '', tag: d.tag, icon: '/icons/admin-192.png', badge: '/icons/admin-192.png', data: { url: d.url || '/admin' } }));
});

// Натискане на известие отваря приложението на страница Разходи
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/app#/costs';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
