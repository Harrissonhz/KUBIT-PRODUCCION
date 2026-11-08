/* ============================================================
   tests/store/store-t3b.test.mjs — Kubit Store — Fase T3b (checkout coherente)
   ------------------------------------------------------------
     ST-09 envio por zona (st_cotizar_envio), gratis desde el umbral, dias de entrega
     ST-10 tres medios de pago reales en st_pedidos.medio_pago_web (pos_metodos_pago no se toca)
     ST-11 confirmacion con instrucciones de pago y "Confirmar por WhatsApp";
           sin instrucciones de pago si hay stock insuficiente (RA-05)
     Pedido minimo, textos legales y preguntas frecuentes coherentes con el checkout
   El SQL NO se ejecuta aqui: se valida como texto. La prueba real se hace en QA.
   Modulo ES. Sin dependencias (node:test y node:vm). No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/store/store-t3b.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { leer, leerRepo, plano, crearEntorno, cargar, carrito, llenarFormulario } from './_entorno.mjs';

const CFG = { envio_gratis_desde: 80000, pedido_minimo: 15000, whatsapp: '573054476133' };
const ZONA_LOCAL = { codigo: 'local', nombre: 'Valle de Aburra', valor: 8000, dias_min: 1, dias_max: 2, envio_gratis_desde: 80000 };
const LINEA = (precio, cantidad = 1, id = 'det-a') => ({ productoId: 'p-' + id, detalleId: id, nombre: 'Producto ' + id, precio, cantidad });

function rpcFalso(extra = {}) {
  return (nombre, params) => {
    if (nombre === 'st_config_tienda') return extra.config !== undefined ? extra.config : CFG;
    if (nombre === 'st_cotizar_envio') return extra.zona !== undefined ? extra.zona : ZONA_LOCAL;
    if (nombre === 'st_crear_pedido') return extra.pedido;
    return null;
  };
}

async function abrirCheckout(lineas, extra = {}) {
  const ctx = crearEntorno({ rpc: rpcFalso(extra), get: () => lineas.map((l) => ({ id: l.detalleId, precio_venta: l.precio, precio_original: null })) });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(lineas));
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  await ctx.__docListeners.DOMContentLoaded[0]();
  return ctx;
}
const $ = (ctx, id) => ctx.document.getElementById(id);

/* ================= utils.js ================= */
test('utils: obtenerConfigTienda lee st_config_tienda y la pide una sola vez', async () => {
  const ctx = crearEntorno({ rpc: rpcFalso({ config: { envio_gratis_desde: 90000, pedido_minimo: 20000, whatsapp: '573001112233' } }) });
  cargar(ctx, 'js/compartido/utils.js');
  const a = plano(await ctx.obtenerConfigTienda());
  await ctx.obtenerConfigTienda();
  assert.deepEqual(a, { envio_gratis_desde: 90000, pedido_minimo: 20000, whatsapp: '573001112233' });
  assert.equal(ctx.__rpcs.filter((r) => r.nombre === 'st_config_tienda').length, 1);
});

test('utils: si la configuracion falla se usan los valores por defecto (80.000 y 15.000)', async () => {
  const ctx = crearEntorno({ rpc: () => { throw new Error('sin red'); } });
  cargar(ctx, 'js/compartido/utils.js');
  assert.deepEqual(plano(await ctx.obtenerConfigTienda()), CFG);
});

test('utils: barra de envio gratis', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js');
  assert.match(ctx.htmlBarraEnvioGratis(50000, 80000), /Te faltan <strong>\$\s?30\.000<\/strong> para envío gratis/);
  assert.match(ctx.htmlBarraEnvioGratis(80000, 80000), /Tu envío es gratis/);
  assert.equal(ctx.htmlBarraEnvioGratis(50000, null), '');
});

test('utils: texto de dias de entrega', () => {
  const ctx = crearEntorno();
  cargar(ctx, 'js/compartido/utils.js');
  assert.equal(ctx.textoDiasEntrega(2, 3), 'Llega en 2–3 días hábiles');
  assert.equal(ctx.textoDiasEntrega(1, 1), 'Llega en 1 día hábil');
  assert.equal(ctx.textoDiasEntrega(null, null), '');
});

/* ================= ST-09: envio en el checkout ================= */
test('ST-09: sin ciudad el envio dice "Elige tu ciudad" y el total no lo suma', async () => {
  const ctx = await abrirCheckout([LINEA(30000)]);
  assert.equal($(ctx, 'checkout-envio').textContent, 'Elige tu ciudad');
  assert.match($(ctx, 'checkout-total').textContent, /30\.000 \+ envío/);
});

test('ST-09: al elegir la ciudad se cotiza la zona y se suma al total con los dias', async () => {
  const ctx = await abrirCheckout([LINEA(30000)]);
  llenarFormulario(ctx);
  await ctx.cotizarEnvio();
  const r = ctx.__rpcs.find((x) => x.nombre === 'st_cotizar_envio');
  assert.deepEqual(plano(r.params), { p_departamento: 'Antioquia', p_ciudad: 'Itagüí' });
  assert.match($(ctx, 'checkout-envio').textContent, /8\.000/);
  assert.match($(ctx, 'checkout-total').textContent, /38\.000/);
  assert.equal($(ctx, 'checkout-envio-dias').textContent, 'Llega en 1–2 días hábiles');
  assert.match($(ctx, 'checkout-envio-gratis').innerHTML, /Te faltan .*50\.000/);
});

test('ST-09: desde $80.000 en productos el envio es gratis', async () => {
  const ctx = await abrirCheckout([LINEA(40000, 2)]);
  llenarFormulario(ctx);
  await ctx.cotizarEnvio();
  assert.equal($(ctx, 'checkout-envio').textContent, 'Gratis');
  assert.match($(ctx, 'checkout-total').textContent, /80\.000$/);
  assert.match($(ctx, 'checkout-envio-gratis').innerHTML, /Tu envío es gratis/);
});

test('ST-09: si la cotizacion falla no se inventa un valor', async () => {
  const ctx = await abrirCheckout([LINEA(30000)], { zona: null });
  llenarFormulario(ctx);
  await ctx.cotizarEnvio();
  assert.equal($(ctx, 'checkout-envio').textContent, 'Elige tu ciudad');
});

test('ST-09: checkout.js ya no tiene el envio fijo de $9.900', () => {
  const src = leer('js/paginas/checkout.js');
  assert.doesNotMatch(src, /COSTO_ENVIO|9900/);
  assert.doesNotMatch(leer('checkout.html'), /\$9,900/);
});

/* ================= Pedido minimo ================= */
test('Minimo: con menos de $15.000 en productos no se crea el pedido', async () => {
  const ctx = await abrirCheckout([LINEA(10000)]);
  llenarFormulario(ctx);
  assert.match($(ctx, 'checkout-minimo').textContent, /El pedido mínimo es .*15\.000 \(sin contar el envío\)/);
  await ctx.confirmarPedido(ctx.obtenerCarritoCheckout());
  assert.equal(ctx.__rpcs.filter((r) => r.nombre === 'st_crear_pedido').length, 0);
  assert.equal(ctx.__modales.at(-1).titulo, 'Pedido mínimo');
});

test('Minimo: con $15.000 o mas el pedido si se envia', async () => {
  const ctx = await abrirCheckout([LINEA(15000)], { pedido: { numero_pedido: 'KBT-202611-000009', total: 23000, costo_envio: 8000, total_items: 1, medio_pago: 'contraentrega' } });
  llenarFormulario(ctx);
  await ctx.confirmarPedido(ctx.obtenerCarritoCheckout());
  assert.equal(ctx.__rpcs.filter((r) => r.nombre === 'st_crear_pedido').length, 1);
});

/* ================= ST-10 / ST-11: medios de pago y confirmacion ================= */
async function confirmarCon(pedido, pago = 'transferencia') {
  const ctx = crearEntorno({ pago, rpc: rpcFalso({ pedido }) });
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  const lineas = [LINEA(30000)];
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(lineas));
  llenarFormulario(ctx);
  await ctx.confirmarPedido(lineas);
  return ctx;
}
const BASE = { numero_pedido: 'KBT-202611-000010', subtotal: 30000, costo_envio: 8000, total: 38000, total_items: 1, dias_min: 1, dias_max: 2, whatsapp: '573054476133' };

test('ST-10: el checkout envia el medio elegido (mercado_pago) sin cambiar la firma', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'mercado_pago', pago: { tipo: 'mercado_pago', link: 'https://mp.test/link' } }, 'mercado_pago');
  const p = plano(ctx.__rpcs.find((r) => r.nombre === 'st_crear_pedido').params);
  assert.equal(p.p_metodo_pago, 'mercado_pago');
  assert.deepEqual(Object.keys(p).sort(), ['p_celular', 'p_ciudad', 'p_departamento', 'p_direccion', 'p_email', 'p_items', 'p_metodo_pago', 'p_nombre']);
});

test('ST-11: transferencia muestra la llave con "Copiar", el titular, el valor y la referencia', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'transferencia', pago: { tipo: 'transferencia', llave: 'MILLAVE123', titular: 'OUTLET SHOP', qr_url: null } });
  const m = ctx.__modales.at(-1);
  assert.equal(m.titulo, 'Pedido recibido');
  assert.match(m.contenido, /MILLAVE123/);
  assert.match(m.contenido, /data-copiar="MILLAVE123"/);
  assert.match(m.contenido, /verás el nombre: <strong>OUTLET SHOP/);
  assert.match(m.contenido, /38\.000/);
  assert.match(m.contenido, /KBT-202611-000010/);
  assert.doesNotMatch(m.contenido, /<img/, 'sin QR configurado no se muestra imagen');
  assert.match(m.contenido, /Llega en 1–2 días hábiles/);
});

test('ST-11: transferencia con QR configurado muestra la imagen', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'transferencia', pago: { tipo: 'transferencia', llave: 'MILLAVE123', titular: 'X', qr_url: 'https://t.test/qr.png' } });
  assert.match(ctx.__modales.at(-1).contenido, /<img src="https:\/\/t\.test\/qr\.png"/);
});

test('ST-11: Mercado Pago muestra "Paga exactamente" y el boton al link (en otra pestana)', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'mercado_pago', pago: { tipo: 'mercado_pago', link: 'https://mp.test/link' } }, 'mercado_pago');
  const c = ctx.__modales.at(-1).contenido;
  assert.match(c, /Paga exactamente <strong>\$\s?38\.000/);
  assert.match(c, /href="https:\/\/mp\.test\/link" target="_blank"[^>]*>Pagar con Mercado Pago/);
});

test('ST-11: contraentrega no muestra llave ni link', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'contraentrega', pago: null }, 'contraentrega');
  const c = ctx.__modales.at(-1).contenido;
  assert.match(c, /en efectivo al recibir/);
  assert.doesNotMatch(c, /data-copiar|Pagar con Mercado Pago/);
});

test('ST-11 / RA-05: con stock insuficiente NO se muestran instrucciones de pago', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'transferencia', stock_insuficiente: true, pago: { tipo: 'transferencia', llave: 'MILLAVE123' } });
  const c = ctx.__modales.at(-1).contenido;
  assert.match(c, /Te confirmaremos disponibilidad por WhatsApp antes del pago/);
  assert.doesNotMatch(c, /MILLAVE123|data-copiar|Pagar con Mercado Pago/);
});

test('ST-11: "Confirmar por WhatsApp" lleva el numero y el total del pedido', async () => {
  const ctx = await confirmarCon({ ...BASE, medio_pago: 'contraentrega' }, 'contraentrega');
  const c = ctx.__modales.at(-1).contenido;
  const m = c.match(/href="https:\/\/wa\.me\/573054476133\?text=([^"]+)"[^>]*>Confirmar por WhatsApp/);
  assert.ok(m, 'falta el boton Confirmar por WhatsApp');
  assert.match(decodeURIComponent(m[1]), /^Hola, acabo de hacer el pedido KBT-202611-000010 por \$\s?38\.000\.$/);
});

test('ST-11: envio gratis se indica en la confirmacion', async () => {
  const ctx = await confirmarCon({ ...BASE, costo_envio: 0, total: 30000, envio_gratis: true, medio_pago: 'contraentrega' }, 'contraentrega');
  assert.match(ctx.__modales.at(-1).contenido, /envío gratis/);
});

test('ST-11: el boton Copiar copia la llave al portapapeles', async () => {
  const ctx = crearEntorno();
  let copiado = null;
  ctx.navigator = { clipboard: { writeText: async (t) => { copiado = t; } } };
  ctx.setTimeout = () => {};
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/checkout.js');
  const btn = { textContent: 'Copiar', getAttribute: () => 'MILLAVE123' };
  ctx.__docListeners.click[0]({ target: { closest: (s) => (s === '[data-copiar]' ? btn : null) } });
  await new Promise((r) => setImmediate(r));
  assert.equal(copiado, 'MILLAVE123');
  assert.equal(btn.textContent, '¡Copiada!');
});

test('ST-10: checkout.html tiene los 3 medios reales y ya no "tarjeta" suelto', () => {
  const html = leer('checkout.html');
  const valores = [...html.matchAll(/name="pago"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(valores, ['transferencia', 'mercado_pago', 'contraentrega']);
  assert.match(html, /Transferencia Bre-B/);
  assert.match(html, /Tarjeta débito\/crédito/);
  assert.match(html, /Vía Mercado Pago/);
  assert.doesNotMatch(html, /Visa, Mastercard, American Express|Bancolombia, Nequi, Davivienda/);
  ['checkout-envio-dias', 'checkout-envio-gratis', 'checkout-minimo'].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
});

/* ================= Carrito ================= */
async function abrirCarrito(lineas) {
  const ctx = crearEntorno({ rpc: rpcFalso(), get: () => lineas.map((l) => ({ id: l.detalleId, precio_venta: l.precio, precio_original: null })) });
  ctx.localStorage.setItem('kubit_carrito', JSON.stringify(lineas));
  cargar(ctx, 'js/compartido/utils.js', 'js/paginas/carrito.js');
  await ctx.__docListeners.DOMContentLoaded[0]();
  return ctx;
}

test('Carrito: barra de envio gratis y aviso de minimo', async () => {
  const ctx = await abrirCarrito([LINEA(10000)]);
  assert.match($(ctx, 'resumen-envio-gratis').innerHTML, /Te faltan .*70\.000/);
  assert.match($(ctx, 'resumen-minimo').textContent, /El pedido mínimo es .*15\.000/);
  assert.equal($(ctx, 'resumen-envio').textContent, 'Según destino');
});

test('Carrito: desde $80.000 dice envio gratis y no hay aviso de minimo', async () => {
  const ctx = await abrirCarrito([LINEA(50000, 2)]);
  assert.equal($(ctx, 'resumen-envio').textContent, 'Gratis');
  assert.match($(ctx, 'resumen-envio-gratis').innerHTML, /Tu envío es gratis/);
  assert.equal($(ctx, 'resumen-minimo').textContent, '');
});

test('Carrito: carrito.html ya no dice "Por calcular"', () => {
  const html = leer('carrito.html');
  assert.doesNotMatch(html, /Por calcular/);
  ['resumen-envio', 'resumen-envio-gratis', 'resumen-minimo'].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
});

/* ================= Textos legales ================= */
test('Terminos: compra sin registro, minimo $15.000 sin envio, envio gratis $80.000 y medios reales', () => {
  const html = leer('terminos-condiciones.html');
  assert.doesNotMatch(html, /requisito esencial registrarse|clave secreta/);
  assert.match(html, /Compra sin Registro/);
  assert.match(html, /\$15\.000 COP\) en productos, sin contar el valor del envio/);
  assert.match(html, /\$80\.000 COP\) tienen envio gratis/);
  assert.match(html, /transferencia Bre-B, tarjeta debito o credito a traves del link de pago de Mercado Pago, y pago contraentrega/);
  assert.doesNotMatch(html, /al correo electronico registrado/);
});

test('Preguntas frecuentes: medios reales, envio gratis $80.000, guia por WhatsApp', () => {
  const html = leer('preguntas-frecuentes.html');
  assert.doesNotMatch(html, /otros metodos electronicos|cierto valor|por correo electronico y WhatsApp/);
  assert.match(html, /transferencia Bre-B/);
  assert.match(html, /\$80\.000 o mas, el envio es gratis/);
  assert.match(html, /pedido minimo es de \$15\.000/);
});

test('Cache: el service worker subio de version para T3b', () => {
  const m = leer('service-worker.js').match(/var CACHE = 'outletshop-(\d{8})-(\d{2})'/);
  assert.ok(m);
  assert.ok(m[1] + m[2] > '2026110801', 'debe ser posterior a T3a (outletshop-20261108-01): ' + m[0]);
});

/* ================= SQL 17 (se valida como texto) ================= */
const SQL = leerRepo('specs/17-store-checkout-coherente.sql');
const sinComentarios = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const SQLC = sinComentarios(SQL);
const cuerpo = (nombre) => {
  const i = SQL.indexOf('create or replace function public.' + nombre + '(');
  assert.ok(i >= 0, 'falta la funcion ' + nombre);
  const resto = SQL.slice(i);
  const m = resto.match(/as (\$[a-z]*\$)([\s\S]*?)\1;/);
  return sinComentarios(m[2]);
};

test('SQL 17: crea configuracion, zonas y destinos, sin sobrescribir valores existentes', () => {
  ['st_configuracion', 'st_tarifas_envio', 'st_destinos_envio'].forEach((t) => {
    assert.match(SQLC, new RegExp('create table if not exists public\\.' + t + ' \\('));
    assert.match(SQLC, new RegExp('alter table public\\.' + t + '\\s+enable row level security'));
    assert.match(SQLC, new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated'));
  });
  assert.equal((SQLC.match(/on conflict \(clave\) do nothing/g) || []).length, 1);
  assert.equal((SQLC.match(/on conflict \(codigo\) do nothing/g) || []).length, 1);
  ['envio_gratis_desde', 'pedido_minimo', 'bre_b_llave', 'bre_b_titular', 'bre_b_qr_url', 'mercado_pago_link', 'whatsapp', 'envio_zona_defecto']
    .forEach((k) => assert.match(SQLC, new RegExp("\\('" + k + "',")));
  assert.match(SQLC, /\('envio_gratis_desde',\s+'80000'/);
  assert.match(SQLC, /\('pedido_minimo',\s+'15000'/);
});

test('SQL 17: 5 zonas de prueba con valor y dias', () => {
  const zonas = [...SQLC.matchAll(/\('(local|antioquia|nacional_principal|nacional|especial)',\s+'[^']+',\s+(\d+), (\d+), (\d+), \d\)/g)];
  assert.deepEqual(zonas.map((z) => [z[1], +z[2], +z[3], +z[4]]), [
    ['local', 8000, 1, 2], ['antioquia', 12000, 2, 3], ['nacional_principal', 15000, 3, 4], ['nacional', 18000, 3, 6], ['especial', 35000, 5, 10]]);
});

test('SQL 17: los destinos usan departamentos que existen en colombia.js', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(leer('js/compartido/colombia.js'), ctx);
  const deptos = Object.keys(vm.runInContext('COLOMBIA', ctx));
  const filas = [...SQLC.matchAll(/\('(local|antioquia|nacional_principal|especial)', '([^']+)', (null|'[^']+')\)/g)];
  assert.ok(filas.length >= 25);
  filas.forEach((f) => assert.ok(deptos.includes(f[2]), 'departamento desconocido: ' + f[2]));
  const local = filas.filter((f) => f[1] === 'local').map((f) => f[2] + '/' + f[3]);
  assert.ok(local.includes("Antioquia/'Itagui'"));
  assert.ok(local.every((x) => x.startsWith('Antioquia/')), 'la zona local solo es de Antioquia (Barbosa de Santander NO)');
  ['San Andres y Providencia', 'Amazonas', 'Guainia', 'Vaupes', 'Vichada', 'Putumayo'].forEach((d) =>
    assert.ok(filas.some((f) => f[1] === 'especial' && f[2] === d && f[3] === 'null'), 'falta zona especial ' + d));
});

test('SQL 17: la zona prioriza ciudad sobre departamento y compara sin tildes', () => {
  const z = cuerpo('st_zona_envio');
  assert.match(z, /order by \(d\.ciudad is null\)/);
  assert.match(z, /st_normalizar_texto\(d\.departamento\) = public\.st_normalizar_texto\(p_departamento\)/);
  assert.match(z, /st_cfg\('envio_zona_defecto'\)/);
  assert.match(cuerpo('st_normalizar_texto'), /translate\(/);
});

test('SQL 17: funciones internas no las ejecuta anon; las publicas no exponen la llave', () => {
  assert.match(SQLC, /revoke all on function public\.st_cfg\(text\) from public, anon, authenticated/);
  assert.match(SQLC, /revoke all on function public\.st_zona_envio\(text, text\) from public, anon, authenticated/);
  assert.match(SQLC, /grant execute on function public\.st_config_tienda\(\) to anon, authenticated/);
  assert.match(SQLC, /grant execute on function public\.st_cotizar_envio\(text, text\) to anon, authenticated/);
  assert.doesNotMatch(cuerpo('st_config_tienda') + cuerpo('st_cotizar_envio'), /bre_b|mercado_pago/);
});

test('SQL 17: st_crear_pedido conserva la firma de T2 y sus permisos', () => {
  assert.match(SQLC, /create or replace function public\.st_crear_pedido\(\s*p_nombre\s+text,\s*p_celular\s+text,\s*p_email\s+text,\s*p_direccion\s+text,\s*p_ciudad\s+text,\s*p_departamento\s+text,\s*p_metodo_pago\s+text,\s*p_items\s+jsonb\s*\)/);
  assert.match(SQLC, /grant execute on function public\.st_crear_pedido\(text,text,text,text,text,text,text,jsonb\) to anon, authenticated/);
  assert.match(SQLC, /security definer\nset search_path = public, pg_temp/);
});

test('SQL 17: envio por zona, gratis sobre el subtotal y pedido minimo', () => {
  const c = cuerpo('st_crear_pedido');
  assert.doesNotMatch(c, /c_envio|9900/);
  assert.match(c, /v_zona := public\.st_zona_envio\(v_depto, v_ciudad\)/);
  assert.match(c, /v_gratis := v_umbral is not null and v_subtotal >= v_umbral/);
  assert.match(c, /if v_subtotal < v_minimo then\s+raise exception '\[ST_MINIMO\]/);
  assert.match(c, /v_total\s+:= v_subtotal \+ v_envio/);
});

test('SQL 17: medio de pago en medio_pago_web; tarjeta pasa a mercado_pago; no usa pos_metodos_pago', () => {
  const c = cuerpo('st_crear_pedido');
  assert.match(c, /when 'tarjeta'\s+then 'mercado_pago'/);
  assert.match(c, /medio_pago_web, notas\)/);
  assert.doesNotMatch(c, /pos_metodos_pago|metodo_pago_id/);
  assert.match(SQLC, /add column if not exists medio_pago_web text/);
  assert.match(SQLC, /medio_pago_web in \('transferencia', 'mercado_pago', 'contraentrega'\)/);
});

test('SQL 17: sin instrucciones de pago con stock insuficiente; no rechaza por stock ni mueve inventario', () => {
  const c = cuerpo('st_crear_pedido');
  assert.match(c, /v_pago := null;\s+if v_aviso_stock = '' then/);
  assert.match(c, /'stock_insuficiente', v_aviso_stock <> ''/);
  assert.match(c, /Stock insuficiente: /);
  assert.doesNotMatch(c, /update public\.pos_productos_detalle|pos_movimientos|pos_ventas/i);
  [...c.matchAll(/raise exception '([^']*)'/g)].forEach((m) => assert.doesNotMatch(m[1], /stock|existencias/i));
});

test('SQL 17: no cierra accesos ni toca politicas existentes', () => {
  assert.doesNotMatch(SQLC, /drop policy|revoke [a-z, ]+ on public\.st_pedidos/i);
  assert.match(SQLC, /^begin;/m);
  assert.match(SQLC, /^commit;/m);
});
