const CACHE = 'blitz-v61';
const ASSETS = [
  './',
  './css/styles.css',
  './js/utils.js',
  './js/state.js',
  './js/timer.js',
  './js/entries.js',
  './js/overview.js',
  './js/stammdaten.js',
  './js/export.js',
  './js/sync.js',
  './js/admin.js',
  './js/pin.js',
  './js/quick-entry.js',
  './js/modals.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => {
        self.clients.matchAll({ type: 'window' }).then(clients =>
          clients.forEach(c => c.postMessage({ type: 'UPDATE_AVAILABLE' }))
        );
        return self.clients.claim();
      })
  );
});

// Network-First: immer zuerst vom Netz laden, nur bei Offline den Cache nutzen
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
