var CACHE = 'outletshop-20261028-01'; // Bump: YYYYMMDD-NN (incrementar NN por cada deploy del mismo dia)

var ASSETS = [
  'index.html',
  'producto.html',
  'carrito.html',
  'checkout.html',
  'sobre-nosotros.html',
  'terminos-condiciones.html',
  'politica-privacidad.html',
  'preguntas-frecuentes.html',
  'css/estilo.css',
  'js/api/supabase-client.js',
  'js/api/productos.js',
  'js/api/categorias.js',
  'js/compartido/utils.js',
  'js/compartido/modal.js',
  'js/compartido/card-producto.js',
  'js/compartido/navbar-store.js',
  'js/compartido/footer-store.js',
  'js/paginas/inicio.js',
  'js/paginas/producto.js',
  'js/paginas/carrito.js',
  'js/paginas/checkout.js',
  'img/LogoTodasPublicaciones.jpg',
  'img/icon.svg',
  'img/icon2.svg',
  'manifest.json'
];

var ES_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', function (e) {
  if (!ES_LOCAL) {
    e.waitUntil(
      caches.open(CACHE).then(function (cache) {
        return cache.addAll(ASSETS);
      }).catch(function () { })
    );
  }
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
  if (ES_LOCAL) {
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (r) {
      if (r && !r.redirected) return r;
      return fetch(e.request, { redirect: 'follow' });
    }).catch(function () {
      return fetch(e.request, { redirect: 'follow' });
    })
  );
});
