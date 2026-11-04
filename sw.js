// Network-first: always fresh when online, cached shell when offline.
const CACHE = 'home-app-v15';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'store.js', 'parse.js', 'config.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'images/house-off.jpg', 'images/house-on.jpg', 'images/rooms-off.jpg', 'images/rooms-on.jpg',
  'images/plant-0.jpg', 'images/plant-1.jpg', 'images/plant-2.jpg', 'images/plant-3.jpg', 'images/plant-4.jpg', 'images/plant-5.jpg',
  'images/scale-0.jpg', 'images/scale-l1.jpg', 'images/scale-l2.jpg', 'images/scale-r1.jpg', 'images/scale-r2.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // past the browser's 10-minute copy, or updates arrive late
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Notifications from the Supabase function: { title, body, tab }.
self.addEventListener('push', (e) => {
  const { title = 'הבית שלנו', body = '', tab } = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { tab }, lang: 'he', dir: 'rtl' }));
});

// Tapping one opens the app, or brings it forward if it's already open.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => all[0]?.focus() ?? self.clients.openWindow('./'))
  );
});
