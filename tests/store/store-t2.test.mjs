/* ============================================================
   tests/store/store-t2.test.mjs — Kubit Store — Fase T2 (pedido seguro)
   ------------------------------------------------------------
   Verifica los cambios de T2 sobre el codigo real de apps/store y sobre los scripts SQL:
     ST-04 pedido en una sola llamada (st_crear_pedido); el navegador no envia precios
     ST-05 el acceso anonimo directo a pedidos/detalle/direcciones queda cerrado (SQL)
     ST-07 numero de pedido por secuencia (sin Math.random)
     ST-08 celular obligatorio y valido, correo opcional, sin clientes ni NIT inventados
     Precio vigente: carrito y checkout vuelven a leer el precio del POS al abrirse
   Decisiones: el pedido no mueve inventario ni rechaza por stock (RA-05); el POS no se toca (RA-04).
   Los scripts SQL NO se ejecutan aqui: se validan como texto. La prueba real se hace en QA.
   Modulo ES. Sin dependencias (node:test y node:vm). No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t2.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leer, leerRepo, plano, crearEntorno, cargar, carrito, llenarFormulario } from './_entorno.mjs';

const LINEAS = [
  { productoId: 'prod-cojin', detalleId: 'det-muneco', nombre: 'Funda Cojín', variante: 'Muñeco Nieve', precio: 25000, cantidad: 1 },
  { productoId: 'prod-cojin', detalleId: 'det-reno', nombre: 'Funda Cojín', variante: 'Reno', precio: 25000, cantidad: 2 }
];

function entornoCheckout(opciones) {
  const ctx = crearEntorno(opciones);
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  return ctx;
}

async function confirmar(lineas, formulario, opciones) {
  const ctx = entornoCheckout(opciones);
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(lineas));
  llenarFormulario(ctx, formulario);
  await ctx.confirmarPedido(lineas);
  return ctx;
}

/* ================= ST-04: una sola llamada, sin precios del navegador ================= */
test('ST-04: el pedido se crea con UNA llamada a st_crear_pedido y sin insertar en tablas', async () => {
  const ctx = await confirmar(LINEAS);
  assert.equal(ctx.__rpcs.length, 1);
  assert.equal(ctx.__rpcs[0].nombre, 'st_crear_pedido');
  assert.equal(ctx.__posts.length, 0, 'no debe hacer POST directo a ninguna tabla');
  assert.equal(ctx.__gets.length, 0, 'no debe consultar clientes, canales ni productos al confirmar');
});

test('ST-04: el navegador solo envia datos del comprador, medio de pago y (variante, cantidad)', async () => {
  const ctx = await confirmar(LINEAS);
  const p = plano(ctx.__rpcs[0].params);
  assert.deepEqual(Object.keys(p).sort(),
    ['p_celular', 'p_ciudad', 'p_departamento', 'p_direccion', 'p_email', 'p_items', 'p_metodo_pago', 'p_nombre']);
  p.p_items.forEach((it) => assert.deepEqual(Object.keys(it).sort(), ['cantidad', 'producto_detalle_id']));
});

test('ST-04: un precio manipulado en el carrito no cambia lo que se envia', async () => {
  const manipulado = LINEAS.map((l) => ({ ...l, precio: 1 }));
  const normal = await confirmar(LINEAS);
  const barato = await confirmar(manipulado);
  assert.deepEqual(plano(barato.__rpcs[0].params), plano(normal.__rpcs[0].params));
});

test('ST-04: el pedido enviado agrupa variante y cantidad', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-nombre': 'Ana Gómez' });
  const p = plano(ctx.__rpcs[0].params);
  assert.equal(p.p_nombre, 'Ana Gómez');
  assert.deepEqual(p.p_items.map((i) => [i.producto_detalle_id, i.cantidad]), [['det-muneco', 1], ['det-reno', 2]]);
  assert.equal(p.p_metodo_pago, 'contraentrega');
});

/* ================= Confirmacion: numero y total vienen de la base de datos ================= */
test('Confirmacion: muestra el numero y el total que devolvio la base y vacia el carrito', async () => {
  const ctx = await confirmar(LINEAS, {}, {
    rpc: () => ({ numero_pedido: 'KBT-202611-000042', total: 123456, costo_envio: 9900, total_items: 3, lineas: [] })
  });
  assert.deepEqual(carrito(ctx), []);
  const m = ctx.__modales.at(-1);
  assert.equal(m.titulo, 'Pedido recibido');
  assert.match(m.contenido, /KBT-202611-000042/);
  assert.match(m.contenido, /123\.456/);
});

test('Confirmacion: no promete correo; indica que se contactara por WhatsApp', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-email': 'prueba@correo.com' });
  const m = ctx.__modales.at(-1).contenido;
  assert.match(m, /WhatsApp/);
  assert.doesNotMatch(m, /Te enviaremos la confirmacion a/i);
  assert.doesNotMatch(m, /prueba@correo\.com/);
});

/* ================= Errores: mensaje limpio, sin detalle tecnico, carrito intacto ================= */
test('Error de la funcion: muestra solo el mensaje en espanol y conserva el carrito', async () => {
  const err = new Error('Supabase RPC 400: ' + JSON.stringify({
    code: 'P0001', details: null, hint: null,
    message: '[ST_ITEMS] Uno de los productos de tu carrito ya no está disponible. Actualiza tu carrito.'
  }));
  const ctx = await confirmar(LINEAS, {}, { rpc: () => { throw err; } });
  const m = ctx.__modales.at(-1);
  assert.equal(m.titulo, 'No se pudo procesar');
  assert.match(m.contenido, /ya no está disponible/);
  assert.doesNotMatch(m.contenido, /Supabase|P0001|ST_ITEMS/);
  assert.equal(carrito(ctx).length, 2, 'el carrito no se borra si falla el pedido');
});

test('Error tecnico: mensaje generico, sin filtrar detalles al cliente', async () => {
  const ctx = await confirmar(LINEAS, {}, { rpc: () => { throw new Error('Supabase RPC 500: relation "x" does not exist'); } });
  const m = ctx.__modales.at(-1).contenido;
  assert.match(m, /No pudimos registrar tu pedido/);
  assert.doesNotMatch(m, /relation|Supabase|does not exist/);
  assert.match(m, /wa\.me\/573054476133/);
});

test('mensajeErrorPedido separa el codigo [ST_xxx] del mensaje', () => {
  const ctx = entornoCheckout();
  const r = plano(ctx.mensajeErrorPedido(new Error('Supabase RPC 400: {"code":"P0001","message":"[ST_CELULAR] Ingresa un celular válido."}')));
  assert.deepEqual(r, { codigo: 'ST_CELULAR', texto: 'Ingresa un celular válido.' });
  assert.equal(plano(ctx.mensajeErrorPedido(new Error('fallo de red'))).codigo, null);
});

/* ================= ST-08: celular obligatorio y valido, correo opcional ================= */
test('ST-08: normalizarCelular acepta celulares colombianos de 10 digitos', () => {
  const ctx = entornoCheckout();
  assert.equal(ctx.normalizarCelular('3001234567'), '3001234567');
  assert.equal(ctx.normalizarCelular('300 123 4567'), '3001234567');
  assert.equal(ctx.normalizarCelular('+57 300 123 4567'), '3001234567');
  assert.equal(ctx.normalizarCelular('573001234567'), '3001234567');
  assert.equal(ctx.normalizarCelular('(300) 123-4567'), '3001234567');
  ['2001234567', '300123456', '30012345678', '', 'abcdefghij', '1234567', null].forEach((malo) =>
    assert.equal(ctx.normalizarCelular(malo), null, 'debe rechazar: ' + malo));
});

test('ST-08: sin celular no se crea el pedido', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-telefono': '' });
  assert.equal(ctx.__rpcs.length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Campos obligatorios');
  assert.match(ctx.__modales.at(-1).contenido, /Celular/);
});

test('ST-08: un celular invalido no crea el pedido', async () => {
  for (const malo of ['2001234567', '30012345', 'no tengo']) {
    const ctx = await confirmar(LINEAS, { 'checkout-telefono': malo });
    assert.equal(ctx.__rpcs.length, 0, 'celular: ' + malo);
  }
});

test('ST-08: el celular se envia normalizado (10 digitos)', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-telefono': '+57 300 123 4567' });
  assert.equal(ctx.__rpcs[0].params.p_celular, '3001234567');
});

test('ST-08: el correo es opcional', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-email': '' });
  assert.equal(ctx.__rpcs.length, 1);
  assert.equal(ctx.__rpcs[0].params.p_email, null);
});

test('ST-08: si se escribe un correo, debe ser valido', async () => {
  const ctx = await confirmar(LINEAS, { 'checkout-email': 'esto-no-es-un-correo' });
  assert.equal(ctx.__rpcs.length, 0);
  assert.match(ctx.__modales.at(-1).contenido, /Correo/);
});

test('ST-08/ST-07: checkout.js ya no crea clientes, NIT ni numeros al azar', () => {
  const src = leer('js/paginas/checkout.js');
  assert.doesNotMatch(src, /__supabase\.post\(/);
  assert.doesNotMatch(src, /pos_clientes|st_direcciones|st_pedidos|pos_canales_venta/);
  assert.doesNotMatch(src, /Math\.random|tipo_id|numero_id|'NIT'/);
});

/* ================= Precio vigente del POS (carrito y checkout) ================= */
test('Precios: refrescarPreciosCarrito actualiza precios, conserva cantidades y retira lo que ya no existe', async () => {
  const ctx = crearEntorno({
    get: () => [{ id: 'det-muneco', precio_venta: 24000, precio_original: 30000 }]
  });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(LINEAS));
  cargar(ctx, 'js/compartido/utils.js');
  const r = plano(await ctx.refrescarPreciosCarrito());
  assert.equal(r.huboCambios, true);
  assert.equal(r.cambios.length, 1);
  assert.deepEqual([r.cambios[0].anterior, r.cambios[0].actual], [25000, 24000]);
  assert.equal(r.retirados.length, 1);
  const c = carrito(ctx);
  assert.deepEqual(c.map((l) => [l.detalleId, l.precio, l.precio_original, l.cantidad]), [['det-muneco', 24000, 30000, 1]]);
});

test('Precios: la consulta solo lee precios (no pide stock) de las variantes del carrito', async () => {
  const ctx = crearEntorno({ get: () => [] });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(LINEAS));
  cargar(ctx, 'js/compartido/utils.js');
  await ctx.refrescarPreciosCarrito();
  assert.equal(ctx.__gets.length, 1);
  assert.match(ctx.__gets[0], /^pos_productos_detalle\?select=id,precio_venta,precio_original&deleted_at=is\.null&id=in\.\(det-muneco,det-reno\)$/);
  assert.doesNotMatch(ctx.__gets[0], /stock/);
});

test('Precios: si la consulta falla, el carrito queda exactamente como estaba', async () => {
  const ctx = crearEntorno({ get: () => { throw new Error('sin red'); } });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(LINEAS));
  const antes = ctx.localStorage.getItem('kubit_carrito');
  cargar(ctx, 'js/compartido/utils.js');
  const r = plano(await ctx.refrescarPreciosCarrito());
  assert.equal(r.error, true);
  assert.equal(r.huboCambios, false);
  assert.equal(ctx.localStorage.getItem('kubit_carrito'), antes);
});

test('Precios: sin cambios no se avisa ni se modifica nada', async () => {
  const ctx = crearEntorno({
    get: () => [{ id: 'det-muneco', precio_venta: 25000, precio_original: null }, { id: 'det-reno', precio_venta: 25000, precio_original: null }]
  });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(LINEAS));
  cargar(ctx, 'js/compartido/utils.js');
  const r = plano(await ctx.refrescarPreciosCarrito());
  assert.equal(r.huboCambios, false);
  ctx.avisoCambiosCarrito(r);
  assert.equal(ctx.__modales.length, 0);
});

test('Precios: al abrir el checkout se actualiza el resumen y se avisa al cliente', async () => {
  const ctx = crearEntorno({ get: () => [{ id: 'det-muneco', precio_venta: 24900, precio_original: null }] });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify([LINEAS[0]]));
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  await ctx.__docListeners.DOMContentLoaded[0]();
  assert.equal(carrito(ctx)[0].precio, 24900);
  assert.match(ctx.document.getElementById('checkout-subtotal').textContent, /24\.900/);
  assert.equal(ctx.__modales.at(-1).titulo, 'Actualizamos tu carrito');
  assert.match(ctx.__modales.at(-1).contenido, /24\.900/);
});

test('Precios: al abrir el carrito se actualizan los precios y se avisa al cliente', async () => {
  const ctx = crearEntorno({ get: () => [{ id: 'det-muneco', precio_venta: 24900, precio_original: null }] });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify([LINEAS[0]]));
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/carrito.js');
  await ctx.__docListeners.DOMContentLoaded[0]();
  assert.equal(carrito(ctx)[0].precio, 24900);
  assert.equal(ctx.__modales.at(-1).titulo, 'Actualizamos tu carrito');
});

/* ================= checkout.html ================= */
test('checkout.html: celular (WhatsApp) obligatorio, correo opcional, sin promesa de correo', () => {
  const html = leer('checkout.html');
  assert.match(html, /Celular \(WhatsApp\)/);
  assert.match(html, /Email <span[^>]*>\(opcional\)/);
  assert.doesNotMatch(html, /Recibirás confirmación por email/);
  assert.match(html, /Te contactaremos por WhatsApp/);
  assert.doesNotMatch(html, /id="checkout-cedula"|name="cedula"/i, 'no se pide cedula (decision 2026-10-29)');
  assert.match(html, /js\/compartido\/utils\.js/);
});

test('carrito.js y checkout.js usan el precio vigente del POS', () => {
  assert.match(leer('js/paginas/carrito.js'), /refrescarPreciosCarrito\(\)/);
  assert.match(leer('js/paginas/checkout.js'), /refrescarPreciosCarrito\(\)/);
});

test('Cache: el service worker subio de version para T2', () => {
  const m = leer('service-worker.js').match(/var CACHE = 'outletshop-(\d{8})-(\d{2})'/);
  assert.ok(m, 'formato outletshop-AAAAMMDD-NN');
  assert.ok(m[1] >= '20261030', 'la version debe ser de T2 (20261030) o posterior: ' + m[0]);
});

/* ================= SQL (se valida como texto; la ejecucion real es en QA) ================= */
const sinComentarios = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const SQL15 = leerRepo('specs/15-store-pedido-seguro.sql');
const SQL16 = leerRepo('specs/16-store-cerrar-acceso-anon.sql');
const SQL03 = leerRepo('specs/03-seed-store-grants.sql').replace(/\r\n/g, '\n');
const cuerpoFuncion = () => {
  const m = SQL15.match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(m, 'no se encontro el cuerpo de st_crear_pedido');
  return m[1];
};

test('SQL 15: funcion SECURITY DEFINER con search_path fijo y permiso solo de ejecucion', () => {
  const sql = sinComentarios(SQL15);
  assert.match(sql, /create or replace function public\.st_crear_pedido\(/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public, pg_temp/);
  assert.match(sql, /revoke all on function public\.st_crear_pedido\(.*\) from public;/);
  assert.match(sql, /grant execute on function public\.st_crear_pedido\(.*\) to anon, authenticated;/);
});

test('SQL 15: del navegador solo lee producto_detalle_id y cantidad (nunca precio ni total)', () => {
  const cuerpo = cuerpoFuncion();
  const campos = [...cuerpo.matchAll(/(?:e\.value|v_elem)\s*->>?\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(campos.length > 0);
  campos.forEach((c) => assert.ok(['producto_detalle_id', 'cantidad'].includes(c), 'campo inesperado: ' + c));
  assert.match(cuerpo, /d\.precio_venta/);
});

test('SQL 15: la numeracion usa la secuencia y hay indice unico (ST-07)', () => {
  const sql = sinComentarios(SQL15);
  assert.match(sql, /create sequence if not exists public\.st_pedidos_numero_seq/);
  assert.match(sql, /create unique index if not exists ux_st_pedidos_numero_pedido\s+on public\.st_pedidos \(numero_pedido\)/);
  assert.match(sql, /nextval\('public\.st_pedidos_numero_seq'\)/);
  assert.doesNotMatch(sql, /random\(\)/);
});

test('SQL 15: usa el cliente CONSUMIDOR Ecommerce (CC 222222222222) y exige exactamente uno; no crea clientes', () => {
  const cuerpo = cuerpoFuncion();
  assert.match(cuerpo, /222222222222/);
  assert.match(cuerpo, /'CONSUMIDOR'/);
  assert.match(cuerpo, /'ECOMMERCE'/);
  assert.match(cuerpo, /cardinality\(v_cliente_ids\), 0\) <> 1/);
  assert.match(cuerpo, /cardinality\(v_canal_ids\), 0\) <> 1/);
  assert.doesNotMatch(cuerpo, /insert into public\.pos_clientes|update public\.pos_clientes/i);
});

test('SQL 15: no mueve inventario ni rechaza por stock; solo deja aviso en notas (RA-05)', () => {
  const cuerpo = cuerpoFuncion();
  assert.doesNotMatch(cuerpo, /update public\.pos_productos_detalle|insert into public\.pos_movimientos|pos_ventas/i);
  assert.match(cuerpo, /Stock insuficiente: /);
  const errores = [...cuerpo.matchAll(/raise exception '([^']*)'/g)].map((m) => m[1]);
  assert.ok(errores.length > 5);
  errores.forEach((e) => assert.doesNotMatch(e, /stock|existencias|unidades disponibles/i, 'un error por stock contradice RA-05: ' + e));
});

test('SQL 15: valida celular colombiano, correo opcional y limites del carrito', () => {
  const cuerpo = cuerpoFuncion();
  assert.match(cuerpo, /\^3\[0-9\]\{9\}\$/);
  assert.match(cuerpo, /v_email := nullif\(/);
  assert.match(cuerpo, /jsonb_array_length\(p_items\) > 30/);
  assert.match(cuerpo, /v_recientes >= 5/);
});

test('SQL 15: agrega st_direcciones.email y es idempotente', () => {
  const sql = sinComentarios(SQL15);
  assert.match(sql, /alter table public\.st_direcciones add column if not exists email text/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test('SQL 15: no cierra ningun acceso (el cierre es el script 16, despues de publicar el frontend)', () => {
  const sql = sinComentarios(SQL15);
  assert.doesNotMatch(sql, /drop policy|revoke .* from anon/i);
});

test('SQL 16: cierra el acceso anonimo a pedidos, detalle y direcciones y NO toca pos_clientes (RA-04)', () => {
  const sql = sinComentarios(SQL16);
  const policies = [...sql.matchAll(/drop policy if exists "([^"]+)"\s+on public\.(\w+);/g)].map((m) => m[2] + ':' + m[1]).sort();
  assert.deepEqual(policies, [
    'st_direcciones:anon crean direcciones', 'st_direcciones:anon ven direcciones',
    'st_pedidos:anon crean pedidos', 'st_pedidos:anon ven pedidos',
    'st_pedidos_detalle:anon crean detalle de pedidos', 'st_pedidos_detalle:anon ven detalle de pedidos'
  ].sort());
  ['st_pedidos', 'st_pedidos_detalle', 'st_direcciones'].forEach((t) =>
    assert.match(sql, new RegExp('revoke all on public\\.' + t + ' from anon;')));
  assert.doesNotMatch(sql, /pos_clientes/);
});

test('SQL 03: el seed ya no reabre el acceso anonimo a pedidos, detalle y direcciones', () => {
  const sql = sinComentarios(SQL03);
  assert.doesNotMatch(sql, /grant\s+[a-z, ]+\s+on\s+public\.st_(pedidos|pedidos_detalle|direcciones)\s+to\s+anon/i);
  assert.doesNotMatch(sql, /create policy "anon (ven|crean) (pedidos|detalle de pedidos|direcciones)"/i);
  // pos_clientes queda como estaba (RA-01 / RA-04)
  assert.match(sql, /grant select, insert on public\.pos_clientes to anon;/);
  assert.match(sql, /create policy "anon crean clientes"/);
});
