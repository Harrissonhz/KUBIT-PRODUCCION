/**
 * service-worker.js — Kubit-WMS
 * Mismo patron que apps/pos/service-worker.js.
 * IMPORTANTE: ASSETS solo debe listar archivos que EXISTEN; si falta uno,
 * cache.addAll() falla y el service worker no se instala.
 * Cada paso que agregue o cambie archivos debe sumarlos aqui y subir la version.
 */
var CACHE = 'kubit-wms-20261027-01'; // Bump: YYYYMMDD-NN (incrementar NN por cada deploy del mismo dia)
var ES_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
var ASSETS = [
  'index.html',
  'login.html',
  'buscar.html',
  'ubicar.html',
  'despachar.html',
  'traslados.html',
  'panel.html',
  'ajustes.html',
  'inventario.html',
  'reconciliacion.html',
  'config.html',
  'css/estilo.css',
  'css/wms.css',
  'js/config.js',
  'js/supabase.js',
  'js/compartido/database.js',
  'js/compartido/auth.js',
  'js/compartido/layout.js',
  'js/compartido/fecha.js',
  'js/compartido/ubicacion-vista.js',
  'js/paginas/login.js',
  'js/paginas/buscar.js',
  'js/paginas/ubicar.js',
  'js/paginas/despachar.js',
  'js/paginas/traslados.js',
  'js/paginas/panel.js',
  'js/paginas/ajustes.js',
  'js/paginas/inventario.js',
  'js/paginas/reconciliacion.js',
  'js/paginas/config.js',
  'img/icon.svg',
  'img/icon-192x192.png',
  'manifest.json',
];
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll().then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage({ accion: 'recargar' });
        });
      });
    })
  );
});
self.addEventListener('fetch', function (e) {
  if (ES_LOCAL) { return; }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (r) {
      if (r && !r.redirected) return r;
      return fetch(e.request, { redirect: 'follow' });
    }).catch(function () {
      return fetch(e.request, { redirect: 'follow' });
    })
  );
});
