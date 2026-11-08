/* ============================================================
   tests/pos/pedidos-web-ui.test.mjs — Kubit POS — T4: ajustes de la tarjeta
   ------------------------------------------------------------
   - Cada pedido es una tarjeta colapsable (<details>) CERRADA por defecto,
     en "Por gestionar" y en "Gestionados".
   - El encabezado (summary) muestra numero, cliente, total, medio y avisos.
   - Cantidad, precio y total tienen color de texto para modo claro y oscuro.
   Ejecutar desde la raiz del repo:  node --test tests/pos/*.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO = path.join(__dirname, '..', '..', 'apps', 'pos', 'js', 'paginas', 'pedidos-web.js');

function pagina() {
  const ctx = {
    console, Intl, JSON, Math, Date, Object, Array, String, Number, Promise, encodeURIComponent,
    document: { documentElement: {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, navigator: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ARCHIVO, 'utf8'), ctx, { filename: 'pedidos-web.js' });
  return ctx.__pedidosWebPagina;
}

const PEDIDO = {
  id: 'p1', numero_pedido: 'KBT-202611-000003', created_at: '2026-11-03T15:31:00Z', estado: 'PENDIENTE',
  subtotal: 113000, costo_envio: 9900, total: 122900, medio_pago: 'transferencia', stock_insuficiente: false,
  comprador: { nombre: 'Harrisson Zapata', celular: '3052487883', email: 'a@b.co', direccion: 'Calle 34 #64-45', ciudad: 'Itagui', departamento: 'Antioquia' },
  lineas: [{ codigo: 'AL026', nombre: 'Trituradora', cantidad: 1, precio_unitario: 30000, total: 30000, stock_actual: 6 }]
};

const filas = (h) => h.match(/<tbody>[\s\S]*<\/tbody>/)[0];
const resumen = (h) => h.match(/<summary[\s\S]*?<\/summary>/)[0];

test('Tarjeta colapsable y cerrada por defecto (pendiente)', () => {
  const h = pagina().htmlPedido(PEDIDO, Date.parse('2026-11-08T15:31:00Z'));
  assert.match(h, /^<details class="grupo-card /);
  assert.doesNotMatch(h.match(/^<details[^>]*>/)[0], /\bopen\b/);
  assert.match(h, /<\/details>$/);
});

test('Tarjeta colapsable y cerrada por defecto (gestionado)', () => {
  const h = pagina().htmlPedido({ ...PEDIDO, estado: 'CANCELADO', gestionado_at: '2026-11-08T16:00:00Z' });
  assert.doesNotMatch(h.match(/^<details[^>]*>/)[0], /\bopen\b/);
  assert.match(resumen(h), /No se concreto/);
});

test('El encabezado muestra numero, antiguedad, cliente, ciudad, total, medio y chevron', () => {
  const s = resumen(pagina().htmlPedido(PEDIDO, Date.parse('2026-11-08T15:31:00Z')));
  ['KBT-202611-000003', 'hace 5 dias', 'Harrisson Zapata', 'Itagui', '122.900', 'Transferencia Bre-B', 'class="chevron'].forEach((x) => assert.ok(s.includes(x), 'falta ' + x));
  assert.doesNotMatch(s, /Escribir por WhatsApp|data-accion/);
});

test('El aviso de stock tambien se ve con la tarjeta cerrada', () => {
  const s = resumen(pagina().htmlPedido({ ...PEDIDO, stock_insuficiente: true, aviso_stock: 'AL026 (pedido 9, disponible 6)' }));
  assert.match(s, /Stock insuficiente/);
});

test('Al expandir: comprador, productos y botones siguen en el detalle', () => {
  const h = pagina().htmlPedido(PEDIDO);
  const det = h.slice(h.indexOf('</summary>'));
  ['3052487883', 'Calle 34 #64-45', 'SKU: AL026', 'Escribir por WhatsApp', 'Copiar datos del cliente', 'data-accion="cerrar"'].forEach((x) => assert.ok(det.includes(x), 'falta ' + x));
});

test('Cantidad, precio y total tienen color para modo claro y oscuro', () => {
  const t = filas(pagina().htmlPedido(PEDIDO));
  const celdas = [...t.matchAll(/<td class="([^"]*)">/g)].map((m) => m[1]);
  assert.equal(celdas.length, 4);
  celdas.slice(1).forEach((c) => assert.match(c, /text-slate-(700|900) dark:text-(slate-200|white)/, 'sin color: ' + c));
});
