/* ============================================================
   tests/store/store-t1.test.js — Kubit Store — Fase T1
   ------------------------------------------------------------
   Verifica los cambios de T1 sobre el codigo real de apps/store:
     ST-01 el pedido guarda la variante elegida (detalleId)
     ST-02 el carrito trata cada variante como una linea
     ST-03 no se agrega una variante agotada ni el producto sin variante
     ST-25 grilla: "Elegir opcion" para productos con variantes
     ST-26 precio por variante
     ST-27 variantes eliminadas en el POS no se muestran
     ST-28 "Desde $X" cuando las variantes tienen precios distintos
   Sin dependencias: usa node:test y node:vm (Node 18+).
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t1.test.js
   No toca la base de datos (Supabase se simula).
   ============================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STORE = path.join(__dirname, '..', '..', 'apps', 'store');
const leer = (rel) => fs.readFileSync(path.join(STORE, rel), 'utf8');

/* ---------- DOM y navegador simulados (lo minimo que usa la tienda) ---------- */
function crearElemento(id) {
  const listeners = {};
  const el = {
    id, value: '', checked: true, disabled: false, textContent: '', placeholder: '',
    className: '', dataset: {}, children: [], _html: '',
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    _disparar(tipo, ev) { (listeners[tipo] || []).forEach((fn) => fn(ev)); },
    querySelector() { return el._boton || (el._boton = crearElemento('btn')); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute(n) { return el['_attr_' + n] || null; },
    remove() {}
  };
  return el;
}

function crearEntorno(opciones = {}) {
  const almacen = {};
  const elementos = {};
  const modales = [];
  const posts = [];
  const sandbox = {
    console,
    Intl, JSON, Math, Date, Object, Array, String, Number, Promise, URLSearchParams, encodeURIComponent,
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; }
    },
    document: {
      getElementById: (id) => elementos[id] || (elementos[id] = crearElemento(id)),
      createElement: () => crearElemento('nuevo'),
      querySelector: (sel) => (sel.includes('pago') ? { value: opciones.pago || 'contraentrega' } : null),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    Modal: (m) => { modales.push(m); },
    actualizarBadgeCarrito: () => {},
    __modales: modales,
    __posts: posts,
    __almacen: almacen,
    __elementos: elementos
  };
  sandbox.window = sandbox;
  sandbox.window.location = { href: '', search: '' };
  sandbox.__supabase = {
    get: async (url) => {
      if (url.startsWith('pos_canales_venta')) return [{ id: 'canal-web' }];
      if (url.startsWith('pos_clientes')) return [{ id: 'cliente-1' }];
      if (url.startsWith('pos_productos_detalle')) return [{ id: 'PRIMER-SKU-DEL-PRODUCTO' }];
      return [];
    },
    post: async (tabla, datos) => {
      posts.push({ tabla, datos });
      if (tabla === 'st_pedidos_detalle') return datos;
      return [{ id: tabla + '-1' }];
    }
  };
  vm.createContext(sandbox);
  return sandbox;
}

function cargar(ctx, ...archivos) {
  archivos.forEach((rel) => vm.runInContext(leer(rel), ctx, { filename: rel }));
}

/* ---------- Datos de prueba: Funda Cojin Navidena (2 variantes) ---------- */
function filaCojin(extra = {}) {
  return Object.assign({
    id: 'prod-cojin',
    nombre: 'Funda Cojín Navideña Felpa (Reno / Muñeco Nieve)',
    slug: 'funda-cojin-navidena',
    descripcion: 'Funda para cojín navideña.',
    tipo_producto: 'Fisico',
    tags: [],
    categoria: { nombre: 'Hogar' },
    multimedia: [],
    detalles: [
      { id: 'det-muneco', codigo_interno: 'SEG011', atributos: { 'Diseño': 'Muñeco Nieve' }, stock_actual: 2, precio_venta: 25000, precio_original: null },
      { id: 'det-reno', codigo_interno: 'SEG011-Reno', atributos: { 'Diseño': 'Reno' }, stock_actual: 2, precio_venta: 25000, precio_original: null }
    ]
  }, extra);
}
// Objetos creados dentro de vm se comparan como JSON (otro contexto)
const plano = (x) => JSON.parse(JSON.stringify(x));
const carrito = (ctx) => JSON.parse(ctx.localStorage.getItem('kubit_carrito') || '[]');

/* ================= productos.js (ST-26, ST-27, ST-28) ================= */
test('ST-26: cada variante trae su propio precio', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/api/productos.js');
  const fila = filaCojin();
  fila.detalles[1].precio_venta = 30000;
  const p = ctx.mapearProducto(fila);
  assert.equal(p.variantes.length, 2);
  assert.equal(p.variantes[0].precio, 25000);
  assert.equal(p.variantes[1].precio, 30000);
});

test('ST-27: variantes eliminadas en el POS no se muestran', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/api/productos.js');
  const fila = filaCojin();
  fila.detalles.push({ id: 'det-borrada', codigo_interno: 'SEG011-X', atributos: { 'Diseño': 'X' }, stock_actual: 5, precio_venta: 1000, deleted_at: '2026-10-01T00:00:00Z' });
  const p = ctx.mapearProducto(fila);
  assert.deepEqual(plano(p.variantes.map((v) => v.id)), ['det-muneco', 'det-reno']);
});

test('ST-28: precioMin y preciosDistintos', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/api/productos.js');
  const iguales = ctx.mapearProducto(filaCojin());
  assert.equal(iguales.preciosDistintos, false);
  const fila = filaCojin();
  fila.detalles[0].precio_venta = 40000;
  const distintos = ctx.mapearProducto(fila);
  assert.equal(distintos.preciosDistintos, true);
  assert.equal(distintos.precioMin, 25000);
});

test('Regresion: producto sin variantes conserva detalleId, precio y stock', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/api/productos.js');
  const fila = filaCojin({ detalles: [{ id: 'det-unico', codigo_interno: 'AL036', atributos: {}, stock_actual: 6, precio_venta: 19900 }] });
  const p = ctx.mapearProducto(fila);
  assert.equal(p.variantes.length, 0);
  assert.equal(p.detalleId, 'det-unico');
  assert.equal(p.precio, 19900);
  assert.equal(p.stock, 6);
});

/* ================= card-producto.js (ST-02, ST-03, ST-25, ST-28) ================= */
function entornoTarjeta() {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js', 'js/api/productos.js', 'js/compartido/card-producto.js');
  return ctx;
}

test('ST-02: dos variantes del mismo producto quedan en dos lineas', () => {
  const ctx = entornoTarjeta();
  const p = ctx.mapearProducto(filaCojin());
  ctx.agregarAlCarrito(p, { detalleId: 'det-muneco' });
  ctx.agregarAlCarrito(p, { detalleId: 'det-reno' });
  ctx.agregarAlCarrito(p, { detalleId: 'det-reno' });
  const c = carrito(ctx);
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((l) => [l.detalleId, l.codigo, l.cantidad]), [['det-muneco', 'SEG011', 1], ['det-reno', 'SEG011-Reno', 2]]);
});

test('ST-26: el carrito guarda el precio de la variante elegida', () => {
  const ctx = entornoTarjeta();
  const fila = filaCojin();
  fila.detalles[1].precio_venta = 30000;
  ctx.agregarAlCarrito(ctx.mapearProducto(fila), { detalleId: 'det-reno' });
  assert.equal(carrito(ctx)[0].precio, 30000);
});

test('ST-03: con variantes, sin elegir opcion no se agrega nada', () => {
  const ctx = entornoTarjeta();
  ctx.agregarAlCarrito(ctx.mapearProducto(filaCojin()));
  assert.equal(carrito(ctx).length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Elige una opción');
});

test('ST-03: una variante agotada no se agrega', () => {
  const ctx = entornoTarjeta();
  const fila = filaCojin();
  fila.detalles[1].stock_actual = 0;
  ctx.agregarAlCarrito(ctx.mapearProducto(fila), { detalleId: 'det-reno' });
  assert.equal(carrito(ctx).length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Opción agotada');
});

test('Regresion: producto sin variantes se agrega directo', () => {
  const ctx = entornoTarjeta();
  const p = ctx.mapearProducto(filaCojin({ detalles: [{ id: 'det-unico', codigo_interno: 'AL036', stock_actual: 6, precio_venta: 19900 }] }));
  ctx.agregarAlCarrito(p);
  ctx.agregarAlCarrito(p);
  assert.deepEqual(carrito(ctx).map((l) => [l.detalleId, l.precio, l.cantidad]), [['det-unico', 19900, 2]]);
});

test('Regresion: producto agotado no se agrega', () => {
  const ctx = entornoTarjeta();
  const p = ctx.mapearProducto(filaCojin({ detalles: [{ id: 'det-unico', codigo_interno: 'AL036', stock_actual: 0, precio_venta: 19900 }] }));
  ctx.agregarAlCarrito(p);
  assert.equal(carrito(ctx).length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Producto agotado');
});

test('ST-25: tarjeta con variantes muestra "Elegir opción" y lleva a la ficha', () => {
  const ctx = entornoTarjeta();
  const card = ctx.CardProducto(ctx.mapearProducto(filaCojin()));
  const inner = card.children[0];
  assert.match(inner.innerHTML, /Elegir opción/);
  inner._boton._disparar('click', { preventDefault() {}, stopPropagation() {} });
  assert.equal(ctx.window.location.href, 'producto.html?slug=funda-cojin-navidena');
  assert.equal(carrito(ctx).length, 0);
});

test('ST-28: tarjeta muestra "Desde" solo si los precios difieren', () => {
  const ctx = entornoTarjeta();
  const iguales = ctx.CardProducto(ctx.mapearProducto(filaCojin())).children[0].innerHTML;
  assert.doesNotMatch(iguales, /Desde/);
  const fila = filaCojin();
  fila.detalles[0].precio_venta = 40000;
  const distintos = ctx.CardProducto(ctx.mapearProducto(fila)).children[0].innerHTML;
  assert.match(distintos, /Desde/);
});

/* ================= carrito.js (ST-02) ================= */
function entornoCarrito(lineas) {
  const ctx = crearEntorno();
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(lineas));
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/carrito.js');
  return ctx;
}

test('ST-02: normalizarCarrito descarta lineas sin variante y une repetidas', () => {
  const ctx = entornoCarrito([]);
  const r = ctx.normalizarCarrito([
    { productoId: 'p1', nombre: 'Viejo sin variante', cantidad: 1 },
    { productoId: 'p2', detalleId: 'd2', cantidad: 1 },
    { productoId: 'p2', detalleId: 'd2', cantidad: 2 },
    { productoId: 'p2', detalleId: 'd3', cantidad: '0' }
  ]);
  assert.equal(r.descartados, 1);
  assert.deepEqual(plano(r.items.map((l) => [l.detalleId, l.cantidad])), [['d2', 3], ['d3', 1]]);
});

test('ST-02: botones +, - y eliminar actuan sobre la variante de su fila', () => {
  const ctx = entornoCarrito([
    { productoId: 'prod-cojin', detalleId: 'det-muneco', precio: 25000, cantidad: 1 },
    { productoId: 'prod-cojin', detalleId: 'det-reno', precio: 25000, cantidad: 1 }
  ]);
  const contenedor = ctx.document.getElementById('carrito-items');
  const clic = (clase, detalleId) => {
    const fila = { getAttribute: () => detalleId };
    const btn = { classList: { contains: (c) => c === clase }, closest: (s) => (s === 'button' ? btn : fila) };
    contenedor._disparar('click', { target: { closest: (s) => (s === 'button' ? btn : fila) } });
  };
  clic('btn-sumar', 'det-reno');
  assert.deepEqual(carrito(ctx).map((l) => l.cantidad), [1, 2]);
  clic('btn-restar', 'det-reno');
  assert.deepEqual(carrito(ctx).map((l) => l.cantidad), [1, 1]);
  clic('btn-eliminar', 'det-reno');
  assert.deepEqual(carrito(ctx).map((l) => l.detalleId), ['det-muneco']);
});

/* ================= checkout.js (ST-01) ================= */
async function confirmar(lineas) {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  const campos = { 'checkout-nombre': 'Cliente Prueba', 'checkout-email': 'prueba@correo.com', 'checkout-telefono': '3001234567',
    'checkout-direccion': 'Calle 1', 'checkout-ciudad': 'Itagüí', 'checkout-departamento': 'Antioquia' };
  Object.keys(campos).forEach((id) => { ctx.document.getElementById(id).value = campos[id]; });
  await ctx.confirmarPedido(lineas);
  return ctx;
}

test('ST-01: el detalle del pedido guarda el detalleId de cada variante', async () => {
  const ctx = await confirmar([
    { productoId: 'prod-cojin', detalleId: 'det-muneco', precio: 25000, cantidad: 1 },
    { productoId: 'prod-cojin', detalleId: 'det-reno', precio: 25000, cantidad: 2 }
  ]);
  const det = ctx.__posts.find((p) => p.tabla === 'st_pedidos_detalle');
  assert.ok(det, 'debe crear el detalle del pedido');
  assert.deepEqual(plano(det.datos.map((d) => [d.producto_detalle_id, d.cantidad])), [['det-muneco', 1], ['det-reno', 2]]);
});

test('ST-01: con una linea sin variante no se crea nada', async () => {
  const ctx = await confirmar([
    { productoId: 'prod-cojin', detalleId: 'det-reno', precio: 25000, cantidad: 1 },
    { productoId: 'prod-viejo', precio: 10000, cantidad: 1 }
  ]);
  assert.equal(ctx.__posts.length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Actualiza tu carrito');
});

test('ST-01: checkout ya no consulta el primer SKU del producto', () => {
  assert.doesNotMatch(leer('js/paginas/checkout.js'), /pos_productos_detalle\?producto_id=eq\./);
});

/* ================= producto.js y service-worker.js ================= */
test('ST-03: la ficha nunca agrega el producto sin variante', () => {
  const src = leer('js/paginas/producto.js');
  assert.match(src, /agregarAlCarrito\(producto, \{ detalleId: seleccionada \}\)/);
  assert.doesNotMatch(src, /if \(agotado\) \{ agregarAlCarrito\(producto\)/);
  assert.match(src, /disabled aria-disabled="true"/);
});

test('Cache: el service worker de la tienda cambio de version', () => {
  const m = leer('service-worker.js').match(/var CACHE = 'outletshop-(\d{8})-(\d{2})'/);
  assert.ok(m, 'formato outletshop-AAAAMMDD-NN');
  assert.ok(m[1] > '20260619', 'la version debe ser posterior a 20260619');
});

test('Sintaxis: todos los JS de la tienda compilan', () => {
  const pendientes = [STORE];
  while (pendientes.length) {
    const dir = pendientes.pop();
    for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, n.name);
      if (n.isDirectory()) pendientes.push(ruta);
      else if (n.name.endsWith('.js')) {
        assert.doesNotThrow(() => new vm.Script(fs.readFileSync(ruta, 'utf8'), { filename: ruta }), ruta);
      }
    }
  }
});
