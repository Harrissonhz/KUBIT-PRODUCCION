/* ============================================================
   tests/store/store-t5a.test.mjs — Kubit Store — Fase T5a
   ------------------------------------------------------------
     ST-16 busqueda: sin tildes, por palabras, con SKU, marca y etiquetas, por relevancia
     ST-32 el buscador funciona desde cualquier pagina y muestra lo buscado
     ST-20 service worker: la red primero para HTML/JS/CSS, sin versiones viejas
     ST-21 iconos PNG (manifiesto y apple-touch-icon)
   Modulo ES. Sin dependencias (node:test y node:vm). No toca la base de datos ni la red.
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t5a.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { STORE, leer, plano, crearEntorno, cargar, filaCojin } from './_entorno.mjs';

/* ================= ST-16: busqueda ================= */
function crearSesion() {
  const datos = {};
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; }
  };
}

function fila(id, nombre, { sku, skus, descripcion = '', marca = null, tags = [], categoria = 'Hogar', tipo = 'Fisico' } = {}) {
  const codigos = skus || [sku || 'SKU-' + id];
  return {
    id, nombre, slug: 's-' + id, descripcion, tipo_producto: tipo, tags, marca, categoria: { nombre: categoria }, multimedia: [],
    detalles: codigos.map((c, i) => ({
      id: 'd-' + id + '-' + i, codigo_interno: c, atributos: codigos.length > 1 ? { Opcion: 'Op ' + (i + 1) } : {},
      stock_actual: 3, precio_venta: 10000
    }))
  };
}

const CATALOGO = [
  fila('a1', 'Soporte AL119 universal para celular', { sku: 'XX001' }),
  fila('a2', 'Taladro inalámbrico', { sku: 'AL119' }),
  fila('a3', 'Cuna para bebé', { sku: 'BB010' }),
  filaCojin(),   // nombre "Funda Cojín Navideña Felpa (Reno / Muñeco Nieve)"; SKU SEG011 y SEG011-Reno
  fila('a5', 'Audífonos Bluetooth', { sku: 'AU200', marca: 'Samsung', tags: ['tecnologia', 'destacado'] }),
  fila('a6', 'Cobija térmica', { sku: 'CB300', descripcion: 'Ideal para bebes. Muy suave.' }),
  fila('a7', 'Lámpara LED', { sku: 'AL-1190' }),
  fila('a8', 'Mantel navideño', { sku: 'SEG0115' })
];

/** Una "visita": mismo contexto y misma sesion; devuelve helpers para pedir resultados */
function visita(filas = CATALOGO, sesion = crearSesion()) {
  const ctx = crearEntorno({ get: () => filas });
  ctx.sessionStorage = sesion;
  cargar(ctx, 'js/api/productos.js');
  const api = ctx.StoreAPI.productos;
  return {
    api,
    ids: async (query, extra = {}) => plano((await api.obtenerPaginados(1, 100, { query, ...extra })).productos.map((p) => p.id)),
    pagina: async (n, porPagina, filtros) => plano(await api.obtenerPaginados(n, porPagina, filtros))
  };
}

test('ST-16: ignora tildes y mayusculas ("bebe" encuentra "bebé"); el nombre pesa mas que la descripcion', async () => {
  const v = visita();
  assert.deepEqual(await v.ids('bebe'), ['a3', 'a6']);
  assert.deepEqual(await v.ids('BEBÉ'), ['a3', 'a6']);
  assert.deepEqual(await v.ids('inalambrico'), ['a2']);
});

test('ST-16: busca por el SKU de cualquier variante', async () => {
  const v = visita();
  assert.deepEqual(await v.ids('SEG011-Reno'), ['prod-cojin']);
  assert.deepEqual(await v.ids('seg011 reno'), ['prod-cojin']);   // sin el guion
  assert.deepEqual(await v.ids('seg-011'), ['prod-cojin', 'a8']);          // con guion, aunque el SKU no lo tenga
  assert.deepEqual(await v.ids('segoll'), []);
});

test('ST-16: relevancia: SKU exacto, luego SKU que empieza igual, luego el nombre', async () => {
  const v = visita();
  assert.deepEqual(await v.ids('seg011'), ['prod-cojin', 'a8']);          // exacto, luego "SEG0115"
  assert.deepEqual(await v.ids('al119'), ['a2', 'a7', 'a1']);             // exacto, "AL-1190" (prefijo), nombre que lo contiene
  assert.deepEqual(await v.ids('AL-119'), ['a2', 'a7', 'a1']);
});

test('ST-16: varias palabras, en cualquier orden y todas obligatorias', async () => {
  const v = visita();
  assert.deepEqual(await v.ids('reno cojin'), ['prod-cojin']);
  assert.deepEqual(await v.ids('cojin zapato'), []);
  assert.deepEqual(await v.ids('  funda   navidena  '), ['prod-cojin']);
});

test('ST-16: busca por marca y por etiquetas, pero no por la etiqueta "destacado"', async () => {
  const v = visita();
  assert.deepEqual(await v.ids('samsung'), ['a5']);
  assert.deepEqual(await v.ids('SAMSUNG'), ['a5']);
  assert.deepEqual(await v.ids('tecnologia'), ['a5']);
  assert.deepEqual(await v.ids('destacado'), []);
});

test('ST-16: consulta vacia o solo espacios no filtra; caracteres especiales no fallan', async () => {
  const v = visita();
  const todos = (await v.pagina(1, 100, {})).total;
  assert.equal(todos, CATALOGO.length);
  assert.equal((await v.pagina(1, 100, { query: '   ' })).total, todos);
  assert.equal((await v.api.buscar('')).length, todos);
  assert.deepEqual(await v.ids('(reno'), ['prod-cojin']);
  for (const raro of ['[', 'a+b', '.*', '\\', '??', '%', '<b>']) {
    assert.deepEqual(await v.ids(raro), [], 'consulta: ' + raro);
  }
});

test('ST-16: sin consulta el orden es exactamente el de T3a (no cambia nada)', async () => {
  const sesion = crearSesion();
  const a = await visita(CATALOGO, sesion).ids(undefined);
  const b = await visita(CATALOGO, sesion).ids('');
  const c = await visita(CATALOGO, sesion).ids('   ');
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
});

test('ST-16: buscar() y la pagina de resultados dan el mismo orden', async () => {
  const v = visita();
  for (const q of ['bebe', 'al119', 'navidena', 'a']) {
    const deBuscar = plano((await v.api.buscar(q)).map((p) => p.id));
    assert.deepEqual(deBuscar, await v.ids(q), 'consulta: ' + q);
  }
});

test('ST-16: la paginacion de una busqueda es estable y no repite ni oculta resultados', async () => {
  const filas = [];
  for (let i = 1; i <= 45; i++) filas.push(fila('p' + String(i).padStart(3, '0'), 'Producto ' + i, { sku: 'SKU' + i }));
  filas.push(fila('exacto', 'Otra cosa', { sku: 'PRODUCTO' }));      // SKU exacto: siempre primero
  filas.push(fila('ajeno1', 'Cuna'), fila('ajeno2', 'Silla'));
  const sesion = crearSesion();
  const ids = [];
  for (let p = 1; p <= 3; p++) {
    const r = await visita(filas, sesion).pagina(p, 20, { query: 'producto' });
    assert.equal(r.total, 46);
    assert.equal(r.totalPaginas, 3);
    ids.push(...r.productos.map((x) => x.id));
  }
  assert.equal(ids.length, 46);
  assert.equal(new Set(ids).size, 46, 'ningun resultado se repite');
  assert.equal(ids[0], 'exacto', 'el SKU exacto va primero en la pagina 1');
  assert.ok(!ids.includes('ajeno1') && !ids.includes('ajeno2'));
  const otra = await visita(filas, sesion).pagina(2, 20, { query: 'producto' });
  assert.deepEqual(otra.productos.map((x) => x.id), ids.slice(20, 40), 'volver a la pagina 2 muestra lo mismo');
});

test('ST-16: la busqueda respeta el filtro de categoria', async () => {
  const filas = [fila('h1', 'Cojin azul', { categoria: 'Hogar' }), fila('m1', 'Cojin para perro', { categoria: 'Mascotas' })];
  const v = visita(filas);
  assert.deepEqual(await v.ids('cojin', { categoria: 'mascotas' }), ['m1']);
  assert.deepEqual((await v.ids('cojin')).sort(), ['h1', 'm1']);
});

test('ST-16: los productos digitales siguen fuera de los resultados (salvo en cursos virtuales)', async () => {
  const filas = [fila('f1', 'Curso de excel', { tipo: 'Fisico' }), fila('d1', 'Curso de word', { tipo: 'Digital', categoria: 'Cursos virtuales' })];
  const v = visita(filas);
  assert.deepEqual(await v.ids('curso'), ['f1']);
  assert.deepEqual(await v.ids('curso', { categoria: 'cursos-virtuales' }), ['d1']);
});

test('ST-16: el codigo ya no usa la busqueda antigua (solo el nombre y la descripcion, con tildes)', () => {
  const src = leer('js/api/productos.js');
  assert.doesNotMatch(src, /\.toLowerCase\(\)\.indexOf\(t\) !== -1/);
  assert.match(src, /_filtrarPorBusqueda\(productos, filtros\.query\)/);
  assert.match(src, /_ordenarPorRelevancia\(productos, filtros && filtros\.query\)/);
  // T3a sigue igual: una sola llamada a _ordenSesion(productos) en la paginacion
  assert.equal((src.match(/= _ordenSesion\(productos\)/g) || []).length, 1);
});

/* ================= ST-32: buscador de la barra ================= */
function navbar(search = '') {
  const ctx = crearEntorno();
  ctx.window.location.search = search;
  const base = ctx.document.getElementById;
  ctx.document.getElementById = (id) => {      // el DOM simulado no trae classList.toggle
    const el = base(id);
    if (!el.classList.toggle) el.classList.toggle = () => {};
    return el;
  };
  cargar(ctx, 'js/compartido/navbar-store.js');
  ctx.__docListeners.DOMContentLoaded.forEach((f) => f());
  return ctx;
}
const teclear = (ctx, id, valor, tecla = 'Enter') => {
  ctx.document.getElementById(id)._disparar('keydown', { key: tecla, target: { value: valor } });
  return ctx.window.location.href;
};

test('ST-32: Enter en el buscador de escritorio va a index.html?q=... (desde cualquier pagina)', () => {
  const ctx = navbar();
  assert.equal(teclear(ctx, 'buscador', '  bebé  '), 'index.html?q=' + encodeURIComponent('bebé'));
});

test('ST-32: Enter en el buscador movil hace lo mismo', () => {
  const ctx = navbar();
  assert.equal(teclear(ctx, 'buscador-movil', 'seg011-reno'), 'index.html?q=seg011-reno');
});

test('ST-32: sin texto, o con otra tecla, no navega', () => {
  const ctx = navbar();
  assert.equal(teclear(ctx, 'buscador', '   '), '');
  assert.equal(teclear(ctx, 'buscador', 'bebe', 'Escape'), '');
  assert.equal(teclear(ctx, 'buscador-movil', '', 'Enter'), '');
});

test('ST-32: el buscador muestra lo que se busco (?q=...)', () => {
  const ctx = navbar('?q=cojin%20reno&pagina=2');
  assert.equal(ctx.document.getElementById('buscador').value, 'cojin reno');
  assert.equal(ctx.document.getElementById('buscador-movil').value, 'cojin reno');
  const sin = navbar('?categoria=hogar');
  assert.equal(sin.document.getElementById('buscador').value, '');
});

test('ST-32: ya no redirige a una URL relativa que se quedaba en la misma pagina', () => {
  assert.doesNotMatch(leer('js/compartido/navbar-store.js'), /href = `\?q=/);
});

/* ================= ST-20: service worker ================= */
function crearSW({ hostname = 'tienda.test', clientes = [], previo = [], red = null } = {}) {
  const origen = 'https://' + hostname;
  const manejadores = {};
  const almacenes = new Map();
  previo.forEach((n) => almacenes.set(n, new Map()));
  const pedidos = [];
  const estado = { omitido: false, reclamado: false };
  const resp = (cuerpo, extra = {}) => {
    const r = { ok: true, status: 200, type: 'basic', redirected: false, cuerpo, ...extra };
    r.clone = () => resp(cuerpo, extra);
    return r;
  };
  const absoluta = (u) => (typeof u === 'string' ? new URL(u, origen + '/').href : u.url);
  const fetchFalso = async (req) => {
    const u = absoluta(req);
    pedidos.push(u);
    return red ? red(u) : resp('red:' + u);
  };
  const abrir = (nombre) => { if (!almacenes.has(nombre)) almacenes.set(nombre, new Map()); return almacenes.get(nombre); };
  const caches = {
    open: async (nombre) => {
      const m = abrir(nombre);
      return {
        put: async (k, r) => { m.set(absoluta(k), r); },
        add: async (k) => {
          const u = absoluta(k);
          const r = await fetchFalso(u);
          if (!r.ok) throw new TypeError('respuesta ' + r.status);
          m.set(u, r);
        }
      };
    },
    keys: async () => [...almacenes.keys()],
    delete: async (n) => almacenes.delete(n),
    match: async (k) => {
      const u = absoluta(k);
      for (const m of almacenes.values()) if (m.has(u)) return m.get(u);
      return undefined;
    }
  };
  const yo = {
    location: { hostname, origin: origen },
    addEventListener: (tipo, f) => { manejadores[tipo] = f; },
    skipWaiting: () => { estado.omitido = true; },
    clients: { claim: async () => { estado.reclamado = true; }, matchAll: async () => clientes }
  };
  const ctx = { self: yo, caches, fetch: fetchFalso, URL, console };
  vm.createContext(ctx);
  vm.runInContext(leer('service-worker.js'), ctx, { filename: 'service-worker.js' });
  const evento = (tipo, extra = {}) => {
    const ev = { waitUntil(p) { ev.p = p; }, respondWith(p) { ev.p = p; ev.manejado = true; }, ...extra };
    manejadores[tipo](ev);
    return ev;
  };
  return {
    ctx, almacenes, pedidos, estado, resp, origen, absoluta,
    instalar: async () => { await evento('install').p; },
    activar: async () => { await evento('activate').p; },
    pedir: (ruta, req = {}) => evento('fetch', { request: { url: absoluta(ruta), method: 'GET', mode: 'cors', destination: '', ...req } }),
    guardar: (ruta, cuerpo, extra) => { abrir(ctx.CACHE).set(absoluta(ruta), resp(cuerpo, extra)); }
  };
}
const asentar = () => new Promise((r) => setImmediate(r));

test('SW: instalar guarda cada archivo por separado; un archivo que falla no impide guardar los demas', async () => {
  const sw = crearSW({ red: async (u) => { if (u.endsWith('/img/icon2.svg')) throw new TypeError('Failed to fetch'); return sw.resp('red:' + u); } });
  await sw.instalar();
  const esperados = plano(sw.ctx.ASSETS).filter((a) => a !== 'img/icon2.svg').map((a) => sw.origen + '/' + a).sort();
  assert.deepEqual([...sw.almacenes.get(sw.ctx.CACHE).keys()].sort(), esperados);
  assert.equal(sw.estado.omitido, true, 'skipWaiting');
});

test('SW: las paginas salen de la red y la copia guardada no lleva la consulta ?q=', async () => {
  const sw = crearSW();
  const ev = sw.pedir('index.html?q=cojin&pagina=2', { mode: 'navigate', destination: 'document' });
  assert.equal(ev.manejado, true);
  assert.equal((await ev.p).cuerpo, 'red:' + sw.origen + '/index.html?q=cojin&pagina=2');
  await asentar();
  assert.ok(sw.almacenes.get(sw.ctx.CACHE).has(sw.origen + '/index.html'));
  assert.equal(sw.almacenes.get(sw.ctx.CACHE).size, 1);
});

test('SW: HTML, JS, CSS y manifiesto: la red gana sobre la copia guardada (no sirve versiones viejas)', async () => {
  for (const ruta of ['index.html', 'js/api/productos.js', 'css/estilo.css', 'manifest.json']) {
    const sw = crearSW();
    sw.guardar(ruta, 'VIEJO');
    const r = await sw.pedir(ruta).p;
    assert.equal(r.cuerpo, 'red:' + sw.origen + '/' + ruta, ruta);
    await asentar();
    assert.equal(sw.almacenes.get(sw.ctx.CACHE).get(sw.origen + '/' + ruta).cuerpo, 'red:' + sw.origen + '/' + ruta, 'la copia se actualiza: ' + ruta);
  }
});

test('SW: sin conexion usa la copia guardada ("/" equivale a index.html)', async () => {
  const sw = crearSW({ red: async () => { throw new TypeError('Failed to fetch'); } });
  sw.guardar('index.html', 'COPIA-INDEX');
  sw.guardar('js/api/productos.js', 'COPIA-JS');
  assert.equal((await sw.pedir('/', { mode: 'navigate', destination: 'document' }).p).cuerpo, 'COPIA-INDEX');
  assert.equal((await sw.pedir('index.html?q=bebe', { mode: 'navigate' }).p).cuerpo, 'COPIA-INDEX');
  assert.equal((await sw.pedir('js/api/productos.js').p).cuerpo, 'COPIA-JS');
});

test('SW: sin conexion y sin copia falla (no inventa una pagina)', async () => {
  const sw = crearSW({ red: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(sw.pedir('producto.html', { mode: 'navigate' }).p, /Sin conexion y sin copia/);
});

test('SW: una copia guardada con redireccion no se usa', async () => {
  const sw = crearSW({ red: async () => { throw new TypeError('Failed to fetch'); } });
  sw.guardar('index.html', 'REDIRIGIDA', { redirected: true });
  await assert.rejects(sw.pedir('index.html', { mode: 'navigate' }).p, /Sin conexion/);
});

test('SW: una respuesta con error del servidor no se guarda', async () => {
  const sw = crearSW({ red: async () => sw.resp('error', { ok: false, status: 500 }) });
  const r = await sw.pedir('index.html', { mode: 'navigate' }).p;
  assert.equal(r.status, 500);
  await asentar();
  assert.equal(sw.almacenes.has(sw.ctx.CACHE) ? sw.almacenes.get(sw.ctx.CACHE).size : 0, 0);
});

test('SW: las imagenes locales salen primero de la copia guardada y se guardan al verlas', async () => {
  const sw = crearSW();
  sw.guardar('img/icon-192.png', 'PNG-GUARDADO');
  assert.equal((await sw.pedir('img/icon-192.png', { destination: 'image' }).p).cuerpo, 'PNG-GUARDADO');
  assert.equal(sw.pedidos.length, 0, 'no fue a la red');
  assert.equal((await sw.pedir('img/nueva.png', { destination: 'image' }).p).cuerpo, 'red:' + sw.origen + '/img/nueva.png');
  await asentar();
  await sw.pedir('img/nueva.png', { destination: 'image' }).p;
  assert.equal(sw.pedidos.filter((u) => u.endsWith('/img/nueva.png')).length, 1, 'la segunda vez sale de la copia');
});

test('SW: no toca POST ni otros sitios (Supabase, WhatsApp, CDN, Mercado Pago)', () => {
  const sw = crearSW();
  assert.equal(sw.pedir('index.html', { method: 'POST' }).manejado, undefined);
  for (const u of ['https://gbjtdjbopwgbknklwldq.supabase.co/rest/v1/pos_productos?select=*', 'https://wa.me/573054476133',
    'https://cdn.tailwindcss.com/', 'https://link.mercadopago.com.co/adsacademy', 'https://fonts.googleapis.com/css2?family=Poppins']) {
    assert.equal(sw.pedir(u).manejado, undefined, u);
  }
  assert.equal(sw.pedidos.length, 0);
});

test('SW: en localhost no precarga ni intercepta (para probar con http-server)', async () => {
  const sw = crearSW({ hostname: 'localhost' });
  await sw.instalar();
  assert.equal(sw.almacenes.size, 0);
  assert.equal(sw.pedir('index.html', { mode: 'navigate' }).manejado, undefined);
  assert.equal(sw.estado.omitido, true);
});

test('SW: primera visita: activa sin recargar las paginas abiertas', async () => {
  const mensajes = [];
  const sw = crearSW({ clientes: [{ url: 'https://tienda.test/index.html', postMessage: (m) => mensajes.push(m) }] });
  await sw.instalar();
  await sw.activar();
  assert.equal(sw.estado.reclamado, true);
  assert.deepEqual(mensajes, []);
});

test('SW: al actualizar borra la cache vieja y recarga las paginas abiertas, menos el checkout', async () => {
  const ventana = (ruta) => { const m = []; return { url: 'https://tienda.test/' + ruta, mensajes: m, postMessage: (x) => m.push(x) }; };
  const inicio = ventana('index.html?q=bebe'); const carrito = ventana('carrito.html');
  const checkout = ventana('checkout.html'); const checkoutConConsulta = ventana('checkout.html?x=1');
  const sw = crearSW({ previo: ['outletshop-20261108-02'], clientes: [inicio, carrito, checkout, checkoutConConsulta] });
  await sw.instalar();
  await sw.activar();
  assert.equal(sw.almacenes.has('outletshop-20261108-02'), false, 'cache anterior borrada');
  assert.ok(sw.almacenes.has(sw.ctx.CACHE));
  assert.deepEqual(plano(inicio.mensajes), [{ accion: 'recargar' }]);
  assert.deepEqual(plano(carrito.mensajes), [{ accion: 'recargar' }]);
  assert.deepEqual(checkout.mensajes, [], 'el checkout no se recarga');
  assert.deepEqual(checkoutConConsulta.mensajes, []);
});

test('SW: la lista precargada incluye colombia.js y los iconos PNG, sin repetidos, y todo existe en disco', () => {
  const assets = plano(crearSW().ctx.ASSETS);
  ['js/compartido/colombia.js', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png', 'manifest.json']
    .forEach((a) => assert.ok(assets.includes(a), 'falta ' + a));
  assert.equal(new Set(assets).size, assets.length);
  assets.forEach((a) => assert.ok(fs.existsSync(path.join(STORE, a)), 'no existe en apps/store: ' + a));
});

test('SW: la version de cache subio para T5a', () => {
  const m = leer('service-worker.js').match(/var CACHE = 'outletshop-(\d{8})-(\d{2})'/);
  assert.ok(m, 'formato outletshop-AAAAMMDD-NN');
  assert.ok(m[1] + m[2] > '2026110802', 'debe ser posterior a T3b (outletshop-20261108-02): ' + m[0]);
});

/* ================= ST-21: iconos y manifiesto ================= */
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function dimensionesPng(rel) {
  const b = fs.readFileSync(path.join(STORE, rel));
  assert.ok(b.subarray(0, 8).equals(FIRMA_PNG), rel + ' no es un PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('ST-21: el manifiesto tiene PNG de 192, 512 y un maskable de 512 (sin mezclar "any maskable")', () => {
  const m = JSON.parse(leer('manifest.json'));
  assert.equal(m.name, 'OutletShop');
  assert.equal(m.start_url, 'index.html');
  assert.equal(m.theme_color, '#020617');
  const icono = (src) => m.icons.find((i) => i.src === src);
  assert.deepEqual(plano(icono('img/icon-192.png')), { src: 'img/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' });
  assert.deepEqual(plano(icono('img/icon-512.png')), { src: 'img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' });
  assert.deepEqual(plano(icono('img/icon-maskable-512.png')), { src: 'img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  m.icons.forEach((i) => assert.notEqual(i.purpose, 'any maskable'));
});

test('ST-21: cada icono del manifiesto existe y mide lo que declara', () => {
  const m = JSON.parse(leer('manifest.json'));
  m.icons.forEach((i) => {
    assert.ok(fs.existsSync(path.join(STORE, i.src)), 'no existe ' + i.src);
    if (i.type === 'image/png') {
      const [ancho, alto] = dimensionesPng(i.src);
      assert.equal(ancho + 'x' + alto, i.sizes, i.src);
    }
  });
});

test('ST-21: apple-touch-icon.png mide 180x180', () => {
  assert.deepEqual(dimensionesPng('img/apple-touch-icon.png'), [180, 180]);
});

test('ST-21: todas las paginas usan el PNG como apple-touch-icon (iPhone no lee el SVG)', () => {
  const paginas = ['index.html', 'producto.html', 'carrito.html', 'checkout.html', 'sobre-nosotros.html',
    'terminos-condiciones.html', 'politica-privacidad.html', 'preguntas-frecuentes.html'];
  assert.ok(fs.existsSync(path.join(STORE, 'index.html')));
  paginas.filter((p) => fs.existsSync(path.join(STORE, p))).forEach((p) => {
    const m = leer(p).match(/<link rel="apple-touch-icon" href="([^"]+)"/);
    if (m) assert.equal(m[1], 'img/apple-touch-icon.png', p);
  });
  assert.match(leer('index.html'), /<link rel="apple-touch-icon" href="img\/apple-touch-icon\.png">/);
  assert.match(leer('index.html'), /<link rel="icon" type="image\/svg\+xml" href="img\/icon\.svg">/);
});
