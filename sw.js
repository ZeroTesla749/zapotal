// ============================================================
// SERVICE WORKER – LOGÍSTICA ZAPOTAL
// Archivo: pwa/sw.js
// ============================================================

const CACHE_NAME = 'logistica-zapotal-v1';
const ASSETS_ESTATICOS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Instalación: cachear assets estáticos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Interceptar fetch: Cache-First para assets, Network-First para API
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Apps Script → solo red (nunca cachear)
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(
        JSON.stringify({ codigo: 503, mensaje: 'Sin conexión. Datos en cola offline.' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    ));
    return;
  }

  // Assets estáticos → Cache-First
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copia));
        return resp;
      })
    ).catch(() => caches.match('/index.html'))
  );
});
