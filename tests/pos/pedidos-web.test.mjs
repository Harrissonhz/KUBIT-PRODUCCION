/* ============================================================
   tests/pos/pedidos-web.test.mjs — Kubit POS — T4: pedidos web
   ------------------------------------------------------------
   Prueba el codigo REAL de apps/pos:
     - js/compartido/database.js: DB.pedidosWeb (rpc y errores) y que
       cargarLinkTienda carga el aviso una sola vez
     - js/compartido/pedidos-web-aviso.js: menu, contador, aviso una vez por
       sesion, tarjeta del Panel; si falla no hace nada
     - js/paginas/pedidos-web.js: mensaje de WhatsApp, datos del cliente, render
     - specs/18-pos-pedidos-web.sql: reglas validadas como texto
   Se corre con node --test (como tests/store). Vitest solo toma *.test.js,
   por eso este archivo es .mjs. No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/pos/*.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const POS = path.join(REPO, 'apps', 'pos');
const leer = (rel) => fs.readFileSync(path.join(POS, rel), 'utf8');
const plano = (x) => JSON.parse(JSON.stringify(x));

/* ---------- DOM minimo ---------- */
function crearEl(tag, doc) {
  const el = {
    tagName: String(tag).toUpperCase(), id: '', className: '', href: '', src: '', textContent: '',
    attrs: {}, children: [], parentNode: null, _html: '', listeners: {}, onerror: null,
    classList: {
      add(...c) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); el.className = [...s].join(' '); },
      remove(...c) { el.className = el.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      contains(c) { return el.className.split(/\s+/).includes(c); },
      toggle(c, f) { if (f === undefined ? !el.classList.contains(c) : f) el.classList.add(c); else el.classList.remove(c); }
    },
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = String(v); },
    setAttribute(k, v) { el.attrs[k] = String(v); if (k === 'id') el.id = String(v); },
    getAttribute(k) { return k === 'src' ? el.src : (k in el.attrs ? el.attrs[k] : null); },
    appendChild(c) { c.parentNode = el; el.children.push(c); doc._registrar(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = el; const i = ref ? el.children.indexOf(ref) : -1;
      if (i < 0) el.children.push(c); else el.children.splice(i, 0, c); doc._registrar(c); return c;
    },
    remove() { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((x) => x !== el); doc._quitar(el); },
    addEventListener(t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); },
    removeEventListener() {},
    querySelector(sel) { return doc._buscar(sel, el); },
    querySelectorAll() { return []; },
    get firstChild() { return el.children[0] || null; },
    get nextSibling() { const p = el.parentNode; if (!p) return null; return p.children[p.children.indexOf(el) + 1] || null; },
    closest() { return null; }
  };
  return el;
}

function crearDoc(opts = {}) {
  const porId = {};
  const doc = {
    readyState: 'complete',
    _registrar(el) { if (el.id) porId[el.id] = el; },
    _quitar(el) { if (el.id && porId[el.id] === el) delete porId[el.id]; },
    _buscar(sel) {
      if (sel.includes('compartido/database.js')) return opts.scriptDb || null;
      if (sel.includes('panel.html')) return opts.dashboard || null;
      if (sel.includes('overflow-y-auto')) return null;
      return null;
    },
    listeners: {},
    createElement: (t) => crearEl(t, doc),
    getElementById: (id) => porId[id] || null,
    querySelector: (sel) => doc._buscar(sel),
    querySelectorAll: () => [],
    addEventListener(t, f) { (doc.listeners[t] = doc.listeners[t] || []).push(f); },
    removeEventListener() {}
  };
  doc.body = crearEl('body', doc);
  doc.head = crearEl('head', doc);
  doc.documentElement = crearEl('html', doc);
  return doc;
}

function registrar(doc, el, id) { el.id = id; doc._registrar(el); return el; }

function sesionStorage() {
  const d = {};
  return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } };
}

function contexto({ doc, rpc, pagina = 'ventas.html', usuario, sesion } = {}) {
  const rpcs = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Intl, JSON, Math, Date, Object, Array, String, Number, Promise, encodeURIComponent, setTimeout, clearTimeout,
    document: doc || crearDoc(),
    localStorage: sesionStorage(),
    sessionStorage: sesion || sesionStorage(),
    navigator: {},
    __rpcs: rpcs
  };
  ctx.window = ctx;
  ctx.window.location = { pathname: '/apps/pos/' + pagina, href: '' };
  ctx.__supabase = {
    get: async () => [], post: async () => [], patch: async () => [], delete: async () => null,
    getWithMeta: async () => ({ data: [], total: 0 }),
    rpc: async (fn, params) => { rpcs.push({ fn, params }); return rpc ? rpc(fn, params) : 0; }
  };
  if (usuario !== null) {
    const u = usuario || { id: 'u1', nombre: 'Admin', accessToken: 'tok', loginAt: '2026-11-08T10:00:00Z' };
    ctx.KubitAuth = { obtenerUsuario: () => u, cargarSesion() {}, aplicarRestriccionesUI() {}, manejarErrorAuth() { ctx.__redirigido = true; } };
  }
  vm.createContext(ctx);
  return ctx;
}
const cargar = (ctx, rel) => vm.runInContext(leer(rel), ctx, { filename: rel });
const espera = () => new Promise((r) => setImmediate(r));

/* ================= database.js ================= */
test('DB.pedidosWeb: contar, listar, detalle y cerrar llaman las funciones correctas', async () => {
  const ctx = contexto({ rpc: (fn) => (fn === 'pos_pedidos_web_contar' ? 3 : fn === 'pos_pedidos_web_listar' ? [{ id: 'p1' }] : { id: 'p1' }) });
  cargar(ctx, 'js/compartido/database.js');
  assert.equal(plano(await ctx.DB.pedidosWeb.contar()).data, 3);
  assert.deepEqual(plano(await ctx.DB.pedidosWeb.listar('gestionados')), { data: [{ id: 'p1' }], error: null });
  await ctx.DB.pedidosWeb.listar('cualquier-cosa');
  await ctx.DB.pedidosWeb.detalle('p1');
  await ctx.DB.pedidosWeb.cerrar('p1', 'venta', '  KBT-000123 ', '  lo pidio el viernes ');
  await ctx.DB.pedidosWeb.cerrar('p1', 'no_concretado', '', '');
  assert.deepEqual(plano(ctx.__rpcs.map((r) => [r.fn, r.params])), [
    ['pos_pedidos_web_contar', {}],
    ['pos_pedidos_web_listar', { p_vista: 'gestionados' }],
    ['pos_pedidos_web_listar', { p_vista: 'pendientes' }],
    ['pos_pedido_web_detalle', { p_pedido_id: 'p1' }],
    ['pos_pedido_web_cerrar', { p_pedido_id: 'p1', p_resultado: 'venta', p_numero_venta: 'KBT-000123', p_nota: 'lo pidio el viernes' }],
    ['pos_pedido_web_cerrar', { p_pedido_id: 'p1', p_resultado: 'no_concretado', p_numero_venta: null, p_nota: null }]
  ]);
});

test('DB.pedidosWeb: los errores [POS_xxx] llegan como mensaje limpio', async () => {
  const ctx = contexto({ rpc: () => { throw new Error('Supabase 400: {"code":"P0001","message":"[POS_VENTA] No existe una venta activa con el numero X1."}'); } });
  cargar(ctx, 'js/compartido/database.js');
  const r = plano(await ctx.DB.pedidosWeb.cerrar('p1', 'venta', 'X1', ''));
  assert.deepEqual(r, { data: null, error: 'No existe una venta activa con el numero X1.', codigo: 'POS_VENTA' });
});

test('DB.pedidosWeb: error tecnico da mensaje generico; 401 lleva al login', async () => {
  const ctx = contexto({ rpc: () => { throw new Error('Supabase 401: JWT expired'); } });
  cargar(ctx, 'js/compartido/database.js');
  const r = plano(await ctx.DB.pedidosWeb.listar('pendientes'));
  assert.equal(r.codigo, null);
  assert.match(r.error, /No se pudo completar/);
  assert.equal(ctx.__redirigido, true);
});

test('database.js: los metodos existentes de DB siguen expuestos', () => {
  const ctx = contexto();
  cargar(ctx, 'js/compartido/database.js');
  ['select', 'insert', 'update', 'softDelete', 'cacheClear', 'productos', 'categorias', 'clientes', 'proveedores', 'ventas', 'compras',
   'comprasDetalle', 'cajas', 'cajaApertura', 'metodosPago', 'canalesVenta', 'movimientosInventario', 'productosMultimedia',
   'facturacion', 'gastos', 'gastoCategorias', 'finanzasMensuales', 'configuracionEmpresa', 'roles', 'usuarios', 'cargarLinkTienda', 'pedidosWeb']
    .forEach((k) => assert.ok(ctx.DB[k], 'falta DB.' + k));
  assert.equal(typeof ctx.mostrarToast, 'function');
});

test('cargarLinkTienda carga pedidos-web-aviso.js una sola vez, con la ruta de database.js', () => {
  const scriptDb = { getAttribute: (k) => (k === 'src' ? 'js/compartido/database.js' : null) };
  const doc = crearDoc({ scriptDb });
  const ctx = contexto({ doc });
  cargar(ctx, 'js/compartido/database.js');
  ctx.DB.cargarLinkTienda();
  ctx.DB.cargarLinkTienda();
  const scripts = doc.body.children.filter((c) => c.tagName === 'SCRIPT');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'js/compartido/pedidos-web-aviso.js');
});

test('cargarLinkTienda no falla si la pagina no tiene el script de database.js', () => {
  const ctx = contexto();
  cargar(ctx, 'js/compartido/database.js');
  assert.doesNotThrow(() => ctx.DB.cargarLinkTienda());
});

/* ================= pedidos-web-aviso.js ================= */
function paginaConMenu(pagina = 'ventas.html', extra = {}) {
  const dashboard = crearEl('a', { _registrar() {}, _quitar() {}, _buscar() { return null; } });
  const doc = crearDoc({ dashboard });
  const sidebar = registrar(doc, doc.createElement('nav'), 'sidebar');
  const lista = doc.createElement('div');
  sidebar.appendChild(lista);
  dashboard.parentNode = null;
  lista.appendChild(dashboard);
  return { doc, sidebar, dashboard, ...extra, pagina };
}

test('Aviso: agrega "Pedidos web" al menu con el contador y muestra el aviso', async () => {
  const p = paginaConMenu();
  const ctx = contexto({ doc: p.doc, pagina: p.pagina, rpc: () => 2 });
  cargar(ctx, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  const link = p.doc.getElementById('link-pedidos-web');
  assert.ok(link, 'falta el enlace del menu');
  assert.equal(link.href, 'pedidos-web.html');
  assert.equal(p.dashboard.nextSibling, link, 'debe ir debajo de Dashboard');
  assert.match(link.innerHTML, /id="badge-pedidos-web"/);
  const modal = p.doc.getElementById('modal-aviso-pedidos-web');
  assert.ok(modal, 'falta el aviso');
  assert.match(modal.innerHTML, /Tienes <strong>2 pedidos web<\/strong>/);
  assert.match(modal.innerHTML, /href="pedidos-web.html"[^>]*>Ver pedidos/);
  assert.match(modal.innerHTML, /Ahora no/);
});

test('Aviso: una vez por inicio de sesion (no se repite al cambiar de pagina)', async () => {
  const sesion = sesionStorage();
  const a = paginaConMenu();
  const ctx1 = contexto({ doc: a.doc, rpc: () => 1, sesion });
  cargar(ctx1, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.ok(a.doc.getElementById('modal-aviso-pedidos-web'));
  const b = paginaConMenu('productos.html');
  const ctx2 = contexto({ doc: b.doc, pagina: 'productos.html', rpc: () => 1, sesion });
  cargar(ctx2, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(b.doc.getElementById('modal-aviso-pedidos-web'), null);
  assert.ok(b.doc.getElementById('link-pedidos-web'), 'el menu se sigue mostrando');
  // nuevo inicio de sesion (otro loginAt) -> vuelve a avisar
  const c = paginaConMenu();
  const ctx3 = contexto({ doc: c.doc, rpc: () => 1, sesion, usuario: { id: 'u1', accessToken: 't', loginAt: '2026-11-09T08:00:00Z' } });
  cargar(ctx3, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.ok(c.doc.getElementById('modal-aviso-pedidos-web'));
});

test('Aviso: sin pendientes no muestra aviso ni tarjeta', async () => {
  const p = paginaConMenu('panel.html');
  const ctx = contexto({ doc: p.doc, pagina: 'panel.html', rpc: () => 0 });
  cargar(ctx, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(p.doc.getElementById('modal-aviso-pedidos-web'), null);
  assert.equal(p.doc.getElementById('card-pedidos-web'), null);
  assert.ok(p.doc.getElementById('link-pedidos-web'));
});

test('Aviso: en la pagina de pedidos web no muestra el aviso y marca el menu como activo', async () => {
  const p = paginaConMenu('pedidos-web.html');
  const ctx = contexto({ doc: p.doc, pagina: 'pedidos-web.html', rpc: () => 4 });
  cargar(ctx, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(p.doc.getElementById('modal-aviso-pedidos-web'), null);
  assert.match(p.doc.getElementById('link-pedidos-web').className, /bg-slate-950/);
});

test('Aviso: tarjeta en el Panel con el numero de pendientes', async () => {
  const p = paginaConMenu('panel.html');
  const cont = p.doc.createElement('div');
  const encabezado = p.doc.createElement('div');
  const col = p.doc.createElement('div');
  cont.appendChild(encabezado); encabezado.appendChild(col);
  col.appendChild(registrar(p.doc, p.doc.createElement('p'), 'panel-subtitulo'));
  const ctx = contexto({ doc: p.doc, pagina: 'panel.html', rpc: () => 3 });
  cargar(ctx, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  const card = p.doc.getElementById('card-pedidos-web');
  assert.ok(card);
  assert.equal(encabezado.nextSibling, card);
  assert.match(card.innerHTML, />3<\/span>/);
});

test('Aviso: si la funcion falla, sin sesion o sin menu, no hace nada ni redirige', async () => {
  const p = paginaConMenu();
  const ctx = contexto({ doc: p.doc, rpc: () => { throw new Error('Supabase 401: JWT expired'); } });
  cargar(ctx, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(p.doc.getElementById('modal-aviso-pedidos-web'), null);
  assert.equal(ctx.__redirigido, undefined);

  const q = paginaConMenu();
  const ctx2 = contexto({ doc: q.doc, usuario: null });
  cargar(ctx2, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(ctx2.__rpcs.length, 0);
  assert.equal(q.doc.getElementById('link-pedidos-web'), null);

  const ctx3 = contexto({ rpc: () => 5 });   // pagina sin #sidebar (ej. impresion)
  cargar(ctx3, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(ctx3.__rpcs.length, 0);

  const ctx4 = contexto({ doc: paginaConMenu('login.html').doc, pagina: 'login.html', rpc: () => 5 });
  cargar(ctx4, 'js/compartido/pedidos-web-aviso.js');
  await espera();
  assert.equal(ctx4.__rpcs.length, 0);
});

test('Aviso: el archivo solo lee (no llama funciones que modifican)', () => {
  const src = leer('js/compartido/pedidos-web-aviso.js');
  assert.match(src, /rpc\('pos_pedidos_web_contar'/);
  assert.doesNotMatch(src, /pos_pedido_web_cerrar|\.post\(|\.patch\(|\.delete\(|DB\./);
});

/* ================= pedidos-web.js ================= */
const PEDIDO = {
  id: 'p1', numero_pedido: 'KBT-202611-000010', created_at: '2026-11-08T15:00:00Z', estado: 'PENDIENTE',
  subtotal: 300000, costo_envio: 0, total: 300000, medio_pago: 'transferencia',
  stock_insuficiente: true, aviso_stock: 'AL033 (pedido 20, disponible 1)',
  comprador: { nombre: 'Ana Maria Gomez', celular: '3001234567', email: null, direccion: 'Calle 1 # 2-3', ciudad: 'Itagui', departamento: 'Antioquia' },
  lineas: [{ codigo: 'AL033', nombre: 'Producto <b>X</b>', atributos: { Color: 'Rojo' }, cantidad: 20, precio_unitario: 15000, total: 300000, stock_actual: 1 }]
};
function pagina() {
  const ctx = contexto({ pagina: 'pedidos-web.html' });
  cargar(ctx, 'js/paginas/pedidos-web.js');
  return ctx.__pedidosWebPagina;
}

test('Pagina: mensaje de WhatsApp acordado y enlace al celular del cliente', () => {
  const P = pagina();
  assert.match(P.mensajeWhatsApp(PEDIDO), /^Hola Ana, te escribimos de OutletShop por tu pedido KBT-202611-000010 por \$\s?300\.000$/);
  const url = P.urlWhatsApp(PEDIDO);
  assert.ok(url.startsWith('https://wa.me/573001234567?text='));
  assert.equal(P.celularWhatsApp('300 123 4567'), '573001234567');
  assert.equal(P.celularWhatsApp('573001234567'), '573001234567');
  assert.equal(P.celularWhatsApp('123'), null);
});

test('Pagina: copiar datos del cliente (sin correo si no lo dio)', () => {
  const P = pagina();
  const t = P.datosCliente(PEDIDO);
  assert.match(t, /Nombre: Ana Maria Gomez/);
  assert.match(t, /Celular: 3001234567/);
  assert.doesNotMatch(t, /Correo/);
  assert.match(t, /Ciudad: Itagui, Antioquia/);
  assert.match(P.datosCliente({ ...PEDIDO, comprador: { ...PEDIDO.comprador, email: 'a@b.co' } }), /Correo: a@b\.co/);
});

test('Pagina: el pedido muestra comprador, productos, aviso de stock y botones; escapa HTML', () => {
  const P = pagina();
  const h = P.htmlPedido(PEDIDO, Date.parse('2026-11-08T17:00:00Z'));
  assert.match(h, /KBT-202611-000010/);
  assert.match(h, /hace 2 horas/);
  assert.match(h, /Ana Maria Gomez/);
  assert.match(h, /3001234567/);
  assert.match(h, /Stock insuficiente:<\/strong> AL033 \(pedido 20, disponible 1\)/);
  assert.match(h, /SKU: AL033/);
  assert.match(h, /Rojo/);
  assert.match(h, /Envio: Gratis/);
  assert.match(h, /Transferencia Bre-B/);
  assert.match(h, /Escribir por WhatsApp/);
  assert.match(h, /Copiar datos del cliente/);
  assert.match(h, /data-accion="cerrar"/);
  assert.doesNotMatch(h, /<b>X<\/b>/);
  assert.match(h, /&lt;b&gt;X&lt;\/b&gt;/);
});

test('Pagina: un pedido gestionado no muestra "Cerrar pedido" y si el resultado', () => {
  const P = pagina();
  const h = P.htmlPedido({ ...PEDIDO, estado: 'CONFIRMADO', gestionado_at: '2026-11-08T16:00:00Z', gestionado_por: 'Admin', numero_venta: 'KBT-000123', nota_gestion: 'pago ok', stock_insuficiente: false });
  assert.doesNotMatch(h, /data-accion="cerrar"/);
  assert.match(h, /Venta registrada/);
  assert.match(h, /KBT-000123/);
  assert.match(h, /pago ok/);
  assert.match(P.htmlPedido({ ...PEDIDO, estado: 'CANCELADO', gestionado_at: '2026-11-08T16:00:00Z' }), /No se concreto/);
});

test('Pagina: no crea ventas, clientes ni movimientos', () => {
  const src = leer('js/paginas/pedidos-web.js');
  assert.doesNotMatch(src, /DB\.(ventas|clientes|movimientosInventario|productos)\b|\.post\(|\.patch\(/);
});

test('pedidos-web.html: usa el layout del POS y carga los scripts en orden', () => {
  const h = leer('pedidos-web.html');
  const orden = ['js/config.js', 'js/supabase.js', 'js/compartido/database.js', 'js/compartido/auth.js', 'js/paginas/pedidos-web.js']
    .map((s) => h.indexOf('src="' + s + '"'));
  orden.forEach((i) => assert.ok(i > 0));
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
  ['id="sidebar"', 'id="link-tienda-virtual"', 'id="toast"', 'id="modal-cerrar"', 'name="cerrar-resultado"', 'value="venta"',
   'value="no_concretado"', 'id="cerrar-numero-venta"', 'id="cerrar-nota"', 'data-vista="pendientes"', 'data-vista="gestionados"']
    .forEach((x) => assert.ok(h.includes(x), 'falta ' + x));
  assert.doesNotMatch(h, /bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium transition-colors">.{0,200}Clientes/);
});

/* ================= SQL 18 ================= */
const SQL = fs.readFileSync(path.join(REPO, 'specs', '18-pos-pedidos-web.sql'), 'utf8');
const SQLC = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const cuerpo = (n) => {
  const i = SQL.indexOf('create or replace function public.' + n + '(');
  assert.ok(i >= 0, 'falta ' + n);
  return SQL.slice(i).match(/as \$f\$([\s\S]*?)\$f\$;/)[1];
};

test('SQL 18: solo agrega columnas y funciones; no cierra accesos ni toca inventario', () => {
  ['gestionado_at  timestamptz', 'gestionado_por uuid references public.pos_usuarios(id)', 'nota_gestion   text']
    .forEach((c) => assert.ok(SQLC.includes('add column if not exists ' + c), c));
  assert.doesNotMatch(SQLC, /drop policy|create policy|revoke [a-z, ]+ on public\.(st_|pos_)/i);
  assert.doesNotMatch(SQLC, /pos_productos_detalle\s+set|update public\.pos_|insert into public\.pos_|pos_movimientos/i);
  assert.match(SQLC, /^begin;/m);
  assert.match(SQLC, /^commit;/m);
});

test('SQL 18: las funciones exigen usuario activo del POS; anon no las ejecuta', () => {
  ['pos_pedidos_web_contar', 'pos_pedidos_web_listar', 'pos_pedido_web_detalle', 'pos_pedido_web_cerrar']
    .forEach((n) => assert.match(cuerpo(n), /pos_usuario_sesion\(\)/, n));
  const s = cuerpo('pos_usuario_sesion');
  assert.match(s, /auth\.uid\(\)/);
  assert.match(s, /coalesce\(u\.activo, true\) = true/);
  assert.match(SQLC, /revoke all on function public\.pos_usuario_sesion\(\) from public, anon, authenticated/);
  assert.match(SQLC, /revoke all on function public\.pos_pedido_web_json\(uuid\) from public, anon, authenticated/);
  assert.match(SQLC, /revoke all on function public\.pos_pedido_web_cerrar\(uuid, text, text, text\) from public, anon/);
  assert.match(SQLC, /grant execute on function public\.pos_pedido_web_cerrar\(uuid, text, text, text\) to authenticated/);
  assert.doesNotMatch(SQLC, /to anon/);
  (SQLC.match(/security definer\nset search_path = public, pg_temp/g) || []).length >= 6 || assert.fail('search_path');
});

test('SQL 18: cerrar -> venta=CONFIRMADO, no_concretado=CANCELADO, solo PENDIENTE, venta opcional validada', () => {
  const c = cuerpo('pos_pedido_web_cerrar');
  assert.match(c, /when 'venta'\s+then 'CONFIRMADO'/);
  assert.match(c, /when 'no_concretado' then 'CANCELADO'/);
  assert.match(c, /if v_pedido\.estado <> 'PENDIENTE' then/);
  assert.match(c, /for update/);
  assert.match(c, /from public\.pos_ventas v/);
  assert.match(c, /\[POS_VENTA\] No existe una venta activa/);
  assert.match(c, /ya esta enlazada al pedido/);
  assert.match(c, /char_length\(v_nota\) > 500/);
  assert.match(c, /gestionado_por = v_usuario/);
  assert.doesNotMatch(c, /motivo/i);
});

test('SQL 18: el JSON del pedido trae comprador desde st_direcciones y lineas con SKU y stock', () => {
  const j = cuerpo('pos_pedido_web_json');
  ['nombre_destinatario', 'd.telefono', 'd.email', 'd.direccion', 'd.ciudad', 'd.departamento', 'det.codigo_interno', 'det.stock_actual', "'stock_insuficiente'", "'medio_pago'"]
    .forEach((x) => assert.ok(j.includes(x), 'falta ' + x));
  assert.match(cuerpo('pos_pedidos_web_listar'), /interval '30 days'/);
});
