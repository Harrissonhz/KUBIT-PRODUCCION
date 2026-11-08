/* ============================================================
   tests/store/store-t3a.test.mjs — Kubit Store — Fase T3a
   ------------------------------------------------------------
     ST-12 "Preguntar por WhatsApp" en la ficha con producto, variante, SKU y enlace
     ST-13 paginacion estable: las paginas de una visita no repiten ni ocultan productos
   Modulo ES. Sin dependencias (node:test y node:vm). No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t3a.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leer, plano, crearEntorno, cargar, filaCojin } from './_entorno.mjs';

/* ---------- sessionStorage simulado (compartible entre "cargas de pagina") ---------- */
function crearSesion() {
  const datos = {};
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; }
  };
}

function catalogo(n) {
  const filas = [];
  for (let i = 1; i <= n; i++) {
    const id = 'p' + String(i).padStart(3, '0');
    filas.push({
      id, nombre: 'Producto ' + i, slug: 'producto-' + i, descripcion: 'Desc.', tipo_producto: 'Fisico',
      tags: [], categoria: { nombre: i % 2 ? 'Hogar' : 'Mascotas' }, multimedia: [],
      detalles: [{ id: 'd' + id, codigo_interno: 'SKU' + i, stock_actual: 3, precio_venta: 10000 + i }]
    });
  }
  return filas;
}

/** Simula una carga de pagina: contexto nuevo, misma sesion del navegador */
async function cargarPagina(sesion, filas, pagina, porPagina = 20, filtros = {}) {
  const ctx = crearEntorno({ get: () => filas });
  ctx.sessionStorage = sesion;
  cargar(ctx, 'js/api/productos.js');
  const r = await ctx.StoreAPI.productos.obtenerPaginados(pagina, porPagina, filtros);
  return plano(r);
}

/* ================= ST-13: paginacion estable ================= */
test('ST-13: en una visita, las paginas cubren todo el catalogo sin repetir', async () => {
  const sesion = crearSesion();
  const filas = catalogo(45);
  const ids = [];
  for (let p = 1; p <= 3; p++) {
    const r = await cargarPagina(sesion, filas, p);
    assert.equal(r.total, 45);
    assert.equal(r.totalPaginas, 3);
    ids.push(...r.productos.map((x) => x.id));
  }
  assert.equal(ids.length, 45);
  assert.equal(new Set(ids).size, 45, 'ningun producto se repite');
});

test('ST-13: volver a la misma pagina en la visita muestra los mismos productos', async () => {
  const sesion = crearSesion();
  const filas = catalogo(45);
  const a = await cargarPagina(sesion, filas, 2);
  const b = await cargarPagina(sesion, filas, 2);
  assert.deepEqual(b.productos.map((x) => x.id), a.productos.map((x) => x.id));
});

test('ST-13: el orden no depende del orden en que llegan los datos', async () => {
  const sesion = crearSesion();
  const filas = catalogo(45);
  const a = await cargarPagina(sesion, filas, 1);
  const b = await cargarPagina(sesion, filas.slice().reverse(), 1);
  assert.deepEqual(b.productos.map((x) => x.id), a.productos.map((x) => x.id));
});

test('ST-13: en otra visita el orden cambia (sigue siendo aleatorio)', async () => {
  const filas = catalogo(45);
  const a = await cargarPagina(crearSesion(), filas, 1);
  let distinto = false;
  for (let i = 0; i < 5 && !distinto; i++) {
    const b = await cargarPagina(crearSesion(), filas, 1);
    distinto = b.productos.map((x) => x.id).join() !== a.productos.map((x) => x.id).join();
  }
  assert.ok(distinto);
});

test('ST-13: con filtro de categoria tampoco se repiten productos', async () => {
  const sesion = crearSesion();
  const filas = catalogo(45);
  const ids = [];
  for (let p = 1; p <= 3; p++) {
    const r = await cargarPagina(sesion, filas, p, 10, { categoria: 'hogar' });
    ids.push(...r.productos.map((x) => x.id));
  }
  assert.equal(ids.length, 23);
  assert.equal(new Set(ids).size, 23);
});

test('ST-13: si sessionStorage no esta disponible, la pagina igual carga', async () => {
  const sesion = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  const r = await cargarPagina(sesion, catalogo(45), 1);
  assert.equal(r.productos.length, 20);
});

test('ST-13: solo la paginacion usa el orden de sesion (destacados y relacionados siguen igual)', () => {
  const src = leer('js/api/productos.js');
  assert.equal((src.match(/= _ordenSesion\(productos\)/g) || []).length, 1);
  assert.match(src, /function _shuffleArray\(/);
});

/* ================= ST-12: Preguntar por WhatsApp ================= */
function entornoFicha() {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js', 'js/api/productos.js', 'js/paginas/producto.js');
  return ctx;
}
const URL_FICHA = 'https://tienda.test/producto.html?slug=funda-cojin-navidena';

test('ST-12: el mensaje lleva producto, opcion, SKU, precio y enlace de la variante elegida', () => {
  const ctx = entornoFicha();
  const p = ctx.mapearProducto(filaCojin());
  const m = ctx.mensajeWhatsAppProducto(p, 'det-reno', URL_FICHA);
  assert.match(m, /^Hola, me interesa este producto:/);
  assert.match(m, /Funda Cojín Navideña/);
  assert.match(m, /Opción: Reno/);
  assert.match(m, /SKU: SEG011-Reno/);
  assert.match(m, /Precio: .*25\.000/);
  assert.ok(m.endsWith(URL_FICHA));
});

test('ST-12: al cambiar de variante cambian la opcion y el SKU', () => {
  const ctx = entornoFicha();
  const p = ctx.mapearProducto(filaCojin());
  const m = ctx.mensajeWhatsAppProducto(p, 'det-muneco', URL_FICHA);
  assert.match(m, /Opción: Muñeco Nieve/);
  assert.match(m, /SKU: SEG011\n/);
});

test('ST-12: producto sin variantes lleva su SKU y no dice "Opción"', () => {
  const ctx = entornoFicha();
  const p = ctx.mapearProducto(filaCojin({ detalles: [{ id: 'det-unico', codigo_interno: 'AL036', stock_actual: 6, precio_venta: 19900 }] }));
  const m = ctx.mensajeWhatsAppProducto(p, null, URL_FICHA);
  assert.doesNotMatch(m, /Opción/);
  assert.match(m, /SKU: AL036/);
  assert.match(m, /19\.900/);
});

test('ST-12: con variantes agotadas (ninguna elegida) no inventa SKU ni precio', () => {
  const ctx = entornoFicha();
  const fila = filaCojin();
  fila.detalles.forEach((d) => { d.stock_actual = 0; });
  fila.detalles[0].precio_venta = 40000;
  const m = ctx.mensajeWhatsAppProducto(ctx.mapearProducto(fila), null, URL_FICHA);
  assert.doesNotMatch(m, /SKU|Precio|Opción/);
  assert.match(m, /Funda Cojín/);
});

test('ST-12: el enlace va al WhatsApp de la tienda con el mensaje codificado', () => {
  const ctx = entornoFicha();
  const p = ctx.mapearProducto(filaCojin());
  const url = ctx.urlWhatsAppProducto(p, 'det-reno', URL_FICHA);
  assert.ok(url.startsWith('https://wa.me/573054476133?text='));
  assert.equal(decodeURIComponent(url.split('?text=')[1]), ctx.mensajeWhatsAppProducto(p, 'det-reno', URL_FICHA));
});

test('ST-12: la ficha tiene el boton y lo actualiza al elegir variante; no crea pedidos', () => {
  const html = leer('producto.html');
  assert.match(html, /id="btn-whatsapp-producto"/);
  assert.match(html, /Preguntar por WhatsApp/);
  const src = leer('js/paginas/producto.js');
  assert.match(src, /actualizarWhatsApp\(seleccionada\)/);
  assert.match(src, /actualizarWhatsApp\(null\)/);
  assert.doesNotMatch(src, /st_crear_pedido|__supabase\.rpc/);
});

test('Cache: el service worker subio de version para T3a', () => {
  const m = leer('service-worker.js').match(/var CACHE = 'outletshop-(\d{8})-(\d{2})'/);
  assert.ok(m);
  assert.ok(m[1] + m[2] > '2026103001', 'debe ser posterior a T2 (outletshop-20261030-01): ' + m[0]);
});

test('ST-12: el boton de la ficha usa el logo completo de WhatsApp (globo y telefono, verde oficial)', () => {
  const html = leer('producto.html');
  const m = html.match(/<a id="btn-whatsapp-producto"[\s\S]*?<\/a>/);
  assert.ok(m, 'no se encontro el boton');
  assert.match(m[0], /m-5\.421 7\.403/, 'falta el globo del logo');
  assert.match(m[0], /M17\.472 14\.382/, 'falta el telefono del logo');
  assert.match(m[0], /fill="#25D366"/i);
});
