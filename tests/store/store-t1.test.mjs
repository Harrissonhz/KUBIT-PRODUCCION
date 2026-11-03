/* ============================================================
   tests/store/store-t1.test.mjs — Kubit Store — Fase T1
   ------------------------------------------------------------
   Verifica los cambios de T1 sobre el codigo real de apps/store:
     ST-01 el pedido guarda la variante elegida (detalleId)
     ST-02 el carrito trata cada variante como una linea
     ST-03 no se agrega una variante agotada ni el producto sin variante
     ST-25 grilla: "Elegir opcion" para productos con variantes
     ST-26 precio por variante
     ST-27 variantes eliminadas en el POS no se muestran
     ST-28 "Desde $X" cuando las variantes tienen precios distintos
   Actualizado en T2: el checkout ya no inserta en tablas; ST-01 se verifica por la
   llamada a la funcion st_crear_pedido (los items que envia el navegador).
   Modulo ES (el package.json del repo usa "type": "module").
   Sin dependencias: node:test y node:vm. No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t1.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { STORE, leer, plano, crearEntorno, cargar, filaCojin, carrito, llenarFormulario } from './_entorno.mjs';

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
  assert.equal(ctx.mapearProducto(filaCojin()).preciosDistintos, false);
  const fila = filaCojin();
  fila.detalles[0].precio_venta = 40000;
  const distintos = ctx.mapearProducto(fila);
  assert.equal(distintos.preciosDistintos, true);
  assert.equal(distintos.precioMin, 25000);
});

test('Regresion: producto sin variantes conserva detalleId, precio y stock', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/api/productos.js');
  const p = ctx.mapearProducto(filaCojin({ detalles: [{ id: 'det-unico', codigo_interno: 'AL036', atributos: {}, stock_actual: 6, precio_venta: 19900 }] }));
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
  assert.deepEqual(carrito(ctx).map((l) => [l.detalleId, l.codigo, l.cantidad]),
    [['det-muneco', 'SEG011', 1], ['det-reno', 'SEG011-Reno', 2]]);
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
  const inner = ctx.CardProducto(ctx.mapearProducto(filaCojin())).children[0];
  assert.match(inner.innerHTML, /Elegir opción/);
  inner._boton._disparar('click', { preventDefault() {}, stopPropagation() {} });
  assert.equal(ctx.window.location.href, 'producto.html?slug=funda-cojin-navidena');
  assert.equal(carrito(ctx).length, 0);
});

test('ST-28: tarjeta muestra "Desde" solo si los precios difieren', () => {
  const ctx = entornoTarjeta();
  assert.doesNotMatch(ctx.CardProducto(ctx.mapearProducto(filaCojin())).children[0].innerHTML, /Desde/);
  const fila = filaCojin();
  fila.detalles[0].precio_venta = 40000;
  assert.match(ctx.CardProducto(ctx.mapearProducto(fila)).children[0].innerHTML, /Desde/);
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

/* ================= checkout.js (ST-01) — verificado por la llamada a la funcion ================= */
async function confirmar(lineas) {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  llenarFormulario(ctx);
  await ctx.confirmarPedido(lineas);
  return ctx;
}

test('ST-01: el pedido envia el producto_detalle_id de cada variante', async () => {
  const ctx = await confirmar([
    { productoId: 'prod-cojin', detalleId: 'det-muneco', precio: 25000, cantidad: 1 },
    { productoId: 'prod-cojin', detalleId: 'det-reno', precio: 25000, cantidad: 2 }
  ]);
  assert.equal(ctx.__rpcs.length, 1, 'debe crear el pedido con una sola llamada');
  const items = plano(ctx.__rpcs[0].params.p_items);
  assert.deepEqual(items.map((d) => [d.producto_detalle_id, d.cantidad]), [['det-muneco', 1], ['det-reno', 2]]);
});

test('ST-01: con una linea sin variante no se crea nada', async () => {
  const ctx = await confirmar([
    { productoId: 'prod-cojin', detalleId: 'det-reno', precio: 25000, cantidad: 1 },
    { productoId: 'prod-viejo', precio: 10000, cantidad: 1 }
  ]);
  assert.equal(ctx.__rpcs.length, 0);
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
