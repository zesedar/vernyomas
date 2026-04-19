// Tensio Service Worker
// Frissítéshez: emeld a VERSION-t, és frissítsd a version.json-t is ugyanerre.
const VERSION = '1.0.1';
const CACHE = `tensio-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).catch(()=>{})
  );
  // Nem hívunk skipWaiting-et — a user döntsön, mikor aktiválja a frissítést.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// A version.json-t és sw.js-t MINDIG frissen, a többi asset cache-first.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isVersionFile = url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json');
  const isSwFile = url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js');

  if (isVersionFile || isSwFile) {
    // Network-first: mindig friss
    e.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first minden másra
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('jsdelivr') || req.url.includes('fonts'))) {
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// Üzenet a kliensből: aktiváld az új SW-t
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) {
      if ('focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
