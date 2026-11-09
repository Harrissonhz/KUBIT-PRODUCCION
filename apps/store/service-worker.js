// service-worker.js — Kubit Store
// T5a (ST-20): ya no sirve versiones viejas.
//   - HTML, JS, CSS y manifiesto: primero la RED; la copia guardada solo si no hay conexion.
//   - Imagenes y demas archivos locales: primero la copia guardada (cambian poco).
//   - Solo peticiones GET del mismo sitio: Supabase, Mercado Pago, WhatsApp, fuentes y CDN pasan
//     directo, sin guardarse.
//   - La precarga guarda cada archivo por separado: si uno falla, los demas igual quedan guardados.
//   - Al actualizarse, recarga las paginas abiertas solo si ya habia una version anterior
//     (no en la primera visita) y nunca la del checkout, para no interrumpir un pedido.
var CACHE = 'outletshop-20261109-01'; // Bump: YYYYMMDD-NN (incrementar NN por cada deploy del mismo dia)
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
  'js/compartido/colombia.js',
  'js/paginas/inicio.js',
  'js/paginas/producto.js',
  'js/paginas/carrito.js',
  'js/paginas/checkout.js',
  'img/LogoTodasPublicaciones.jpg',
  'img/icon.svg',
  'img/icon2.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/icon-maskable-512.png',
  'img/apple-touch-icon.png',
  'manifest.json'
];
var ES_LOCAL = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// Clave unica por pagina o archivo: sin ?consulta (la tienda es la misma pagina para cualquier
// ?q=, ?categoria= o ?pagina=) y "/" equivale a index.html
function claveCache(url) {
  var ruta = url.pathname;
  if (ruta.charAt(ruta.length - 1) === '/') ruta += 'index.html';
  return url.origin + ruta;
}

// Copia guardada, ignorando respuestas con redireccion (el navegador no las acepta como respuesta)
function enCache(url) {
  return caches.match(claveCache(url)).then(function (r) {
    return r && !r.redirected ? r : undefined;
  });
}

function guardar(url, resp) {
  if (resp && resp.ok && resp.type === 'basic' && !resp.redirected) {
    var copia = resp.clone();
    caches.open(CACHE).then(function (c) { return c.put(claveCache(url), copia); }).catch(function () { });
  }
}

function esCodigo(req, url) {
  if (req.mode === 'navigate' || req.destination === 'document') return true;
  return url.pathname.charAt(url.pathname.length - 1) === '/' || /\.(?:html|js|css|json)$/i.test(url.pathname);
}

function redPrimero(req, url) {
  return fetch(req).then(function (resp) {
    guardar(url, resp);
    return resp;
  }).catch(function () {
    return enCache(url).then(function (r) {
      if (r) return r;
      throw new Error('Sin conexion y sin copia guardada de ' + url.pathname);
    });
  });
}

function cachePrimero(req, url) {
  return enCache(url).then(function (r) {
    if (r) return r;
    return fetch(req).then(function (resp) {
      guardar(url, resp);
      return resp;
    });
  });
}

function precargar(cache) {
  return Promise.all(ASSETS.map(function (archivo) {
    return cache.add(archivo).catch(function () { });
  }));
}

function avisarRecarga() {
  return self.clients.matchAll({ type: 'window' }).then(function (clientes) {
    clientes.forEach(function (cliente) {
      if (/\/checkout\.html(?:[?#]|$)/.test(cliente.url)) return;
      cliente.postMessage({ accion: 'recargar' });
    });
  });
}

self.addEventListener('install', function (e) {
  if (!ES_LOCAL) {
    e.waitUntil(caches.open(CACHE).then(precargar).catch(function () { }));
  }
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nombres) {
      var habiaVersionAnterior = nombres.some(function (n) { return n !== CACHE; });
      return Promise.all(
        nombres.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); })
      ).then(function () {
        return self.clients.claim();
      }).then(function () {
        return habiaVersionAnterior ? avisarRecarga() : undefined;
      });
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (ES_LOCAL) {
    return;
  }
  var req = e.request;
  if (req.method !== 'GET') {
    return;
  }
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  e.respondWith(esCodigo(req, url) ? redPrimero(req, url) : cachePrimero(req, url));
});
