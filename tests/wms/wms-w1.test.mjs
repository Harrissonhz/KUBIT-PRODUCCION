/* ============================================================
   tests/wms/wms-w1.test.mjs — Kubit-WMS — Fase W1 (anulacion de ventas, D2 + T-515)
   ------------------------------------------------------------
   Valida COMO TEXTO (no ejecuta SQL; la ejecucion real se prueba en Pruebas):
     - specs/19-wms-anulaciones.sql: solo reemplaza 5 objetos y respeta CR1
     - que lo que no cambia sea IDENTICO al 09 (se compara contra tu archivo real)
     - las reglas de la anulacion y de T-515
     - specs/19-wms-anulaciones-rollback.sql restaura exactamente el 09
     - los textos de Panel y Reconciliacion y la version de la cache del service worker
   Modulo ES. Sin dependencias (node:test). No toca la base de datos.
   Ejecutar desde la raiz del repo:
     node --test tests/wms/*.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const existe = (rel) => fs.existsSync(path.join(REPO, rel));

/* ---------- utilidades de texto SQL ---------- */
const sinComentarios = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const norm = (sql) => sinComentarios(sql).replace(/\s+/g, ' ').trim();

// create or replace function public.<nombre>( ... as $$ ... $$;   (texto completo)
const INICIO_CUERPO = /\bas\s+\$\$/;
function funcion(sql, nombre) {
  const i = sql.indexOf('create or replace function public.' + nombre + '(');
  assert.ok(i >= 0, 'no se encontro la funcion ' + nombre);
  const resto = sql.slice(i);
  const m = INICIO_CUERPO.exec(resto);
  assert.ok(m, 'la funcion ' + nombre + ' no tiene "as $$"');
  const fin = resto.indexOf('$$;', m.index + m[0].length);
  assert.ok(fin > 0, 'la funcion ' + nombre + ' no termina con $$;');
  return resto.slice(0, fin + 3);
}
const cuerpo = (f) => {
  const m = INICIO_CUERPO.exec(f);
  return f.slice(m.index + m[0].length, f.lastIndexOf('$$;'));
};
const firmaDe = (f) => norm(f.slice(0, INICIO_CUERPO.exec(f).index));

// create or replace view public.<nombre> as ... ;   (sin comentarios)
function vista(sql, nombre) {
  const sc = sinComentarios(sql);
  const i = sc.indexOf('create or replace view public.' + nombre + ' as');
  assert.ok(i >= 0, 'no se encontro la vista ' + nombre);
  const fin = sc.indexOf(';', i);
  return sc.slice(i, fin + 1);
}

const SQL19 = leer('specs/19-wms-anulaciones.sql');
const RB = leer('specs/19-wms-anulaciones-rollback.sql');
const SQL09 = existe('specs/09-wms-functions.sql') ? leer('specs/09-wms-functions.sql') : null;
const SQL08 = existe('specs/08-wms-schema.sql') ? leer('specs/08-wms-schema.sql') : null;
const SQL10 = existe('specs/10-wms-solo-lectura.sql') ? leer('specs/10-wms-solo-lectura.sql') : null;

const DEVOL = funcion(SQL19, '_wms_procesar_devolucion');
const SYNC19 = funcion(SQL19, 'wms_sincronizar');
const DESP19 = funcion(SQL19, 'wms_despachar');

/* ================= Forma del script ================= */
test('SQL 19: una sola transaccion y solo reemplaza objetos (sin tablas, columnas, politicas ni drops)', () => {
  const sc = sinComentarios(SQL19);
  assert.match(sc, /^begin;/m);
  assert.match(sc, /^commit;/m);
  assert.equal((sc.match(/create or replace function/g) || []).length, 3);
  assert.equal((sc.match(/create or replace view/g) || []).length, 2);
  assert.doesNotMatch(sc, /create table|alter table|create index|drop |truncate|create policy|\bgrant\b/i);
  assert.doesNotMatch(sc, /create function|create view/i);
});

test('SQL 19: NO modifica _wms_procesar_evento ni wms_inicializar (siguen como en el 09/10)', () => {
  assert.doesNotMatch(sinComentarios(SQL19), /function public\._wms_procesar_evento|function public\.wms_inicializar/);
});

test('SQL 19: CR1 - ninguna funcion nueva escribe ni bloquea filas de pos_* ni st_* (reglas A y B)', () => {
  [DEVOL, SYNC19, DESP19].forEach((f) => {
    const c = cuerpo(f);
    assert.doesNotMatch(c, /(insert\s+into|update|delete\s+from)\s+public\.(pos|st)_/i);
    assert.doesNotMatch(c, /from\s+public\.(pos|st)_[a-z_]+[^;]*for\s+update/i);
  });
});

test('SQL 19: la funcion nueva es interna (sin permisos para anon ni authenticated)', () => {
  assert.match(sinComentarios(SQL19), /revoke execute on function public\._wms_procesar_devolucion\(uuid, uuid\)\s+from public, anon, authenticated;/);
  assert.doesNotMatch(sinComentarios(SQL19), /to anon|to authenticated/i);
});

/* ================= Identico al 09 donde no cambia ================= */
test('wms_sincronizar: igual al 09 salvo la rama que llama a _wms_procesar_devolucion', () => {
  const llamada = 'perform public._wms_procesar_evento(e.pos_movimiento_id, v_usr);';
  const referencia = SQL09 ? funcion(SQL09, 'wms_sincronizar') : funcion(RB, 'wms_sincronizar');
  const esperado = norm(referencia).replace(
    norm(llamada),
    norm("if e.tipo_movimiento = 'devolucion_venta' then perform public._wms_procesar_devolucion(e.pos_movimiento_id, v_usr); else " + llamada + ' end if;'));
  assert.equal(norm(SYNC19), esperado);
});

test('wms_v_pos_pendientes: igual al 09 salvo devolucion_venta -> LIBERAR', () => {
  const referencia = SQL09 ? vista(SQL09, 'wms_v_pos_pendientes') : vista(RB, 'wms_v_pos_pendientes');
  const esperado = norm(referencia).replace("else 'NO_SOPORTADO'", "when 'devolucion_venta' then 'LIBERAR' else 'NO_SOPORTADO'");
  assert.equal(norm(vista(SQL19, 'wms_v_pos_pendientes')), esperado);
});

test('wms_despachar: misma firma y mismo mensaje final que el 09', () => {
  const ref = SQL09 ? funcion(SQL09, 'wms_despachar') : funcion(RB, 'wms_despachar');
  assert.equal(firmaDe(DESP19), firmaDe(ref));
  const msg = "raise exception 'WMS: la venta no tiene reservas pendientes (ya despachada o aun no sincronizada)';";
  assert.ok(norm(DESP19).includes(norm(msg)));
  assert.ok(norm(ref).includes(norm(msg)));
});

test('Las vistas nuevas conservan las columnas (mismo nombre y orden que el 09)', () => {
  const enOrden = (texto, fichas) => {
    let desde = 0;
    fichas.forEach((f) => {
      const i = texto.indexOf(f, desde);
      assert.ok(i >= 0, 'falta o esta fuera de orden: ' + f);
      desde = i + f.length;
    });
  };
  const pend = norm(vista(SQL19, 'wms_v_pos_pendientes'));
  enOrden(pend.slice(0, pend.indexOf(' from public.pos_movimientos_inventario')), [
    'as pos_movimiento_id', 'm.fecha', 'm.tipo_movimiento', 'm.producto_detalle_id', 'as cantidad', 'm.referencia', 'm.motivo', 'as accion_wms']);
  const desp = norm(vista(SQL19, 'wms_v_despacho_pendiente'));
  enOrden(desp.slice(0, desp.indexOf(' from ( select')), [
    'g.ref_pos_venta_id', 'v.numero_venta', 'v.fecha_venta', 'g.producto_detalle_id', 'pd.codigo_interno', 'as producto',
    'g.ubicacion_origen_id', 'as ruta', 'as cantidad']);
});

/* ================= Reglas de la bandeja y de despachar ================= */
test('wms_v_despacho_pendiente: reserva abierta = RESERVA - DESPACHO - LIBERACION por venta, producto y origen', () => {
  const v = norm(vista(SQL19, 'wms_v_despacho_pendiente'));
  assert.match(v, /w\.tipo_movimiento in \('RESERVA', 'DESPACHO', 'LIBERACION'\)/);
  assert.match(v, /sum\(case w\.tipo_movimiento when 'RESERVA' then w\.cantidad else -w\.cantidad end\)/);
  assert.match(v, /group by w\.ref_pos_venta_id, w\.producto_detalle_id, w\.ubicacion_origen_id/);
  assert.match(v, /having sum\(.*\) > 0/);
  assert.match(v, /w\.deleted_at is null/);
});

test('T-515: wms_despachar rechaza ventas anuladas o eliminadas ANTES de mover stock, con candado por venta', () => {
  const c = cuerpo(DESP19);
  const iLock = c.indexOf("pg_advisory_xact_lock(hashtext('wms_venta:'");
  const iAnulada = c.indexOf("'ANULADA'");
  const iMover = c.indexOf('_wms_stock_mover');
  assert.ok(iLock >= 0 && iAnulada > iLock && iMover > iAnulada, 'orden: candado, validacion, movimiento de stock');
  assert.match(c, /v_del is not null or coalesce\(v_est, ''\) = 'ANULADA'/);
  assert.match(c, /la venta esta anulada o eliminada en el POS\. No se despacha/);
  assert.match(c, /la venta no existe en el POS/);
  assert.doesNotMatch(c, /for\s+update/i);
});

test('wms_despachar: despacha toda la reserva abierta y deja trazabilidad', () => {
  const c = cuerpo(DESP19);
  assert.match(c, /having sum\(case g\.tipo_movimiento when 'RESERVA' then g\.cantidad else -g\.cantidad end\) > 0/);
  assert.match(c, /_wms_stock_mover\(r\.producto_detalle_id, r\.ubicacion_origen_id, 'RESERVADO', -r\.abierto, v_usr\)/);
  assert.match(c, /_wms_stock_mover\(r\.producto_detalle_id, null, 'DESPACHADO', r\.abierto, v_usr\)/);
  assert.match(c, /'DESPACHO', r\.abierto/);
  assert.match(c, /_wms_liberar_mono_sku\(r\.ubicacion_origen_id\)/);
});

/* ================= La devolucion (anulacion) ================= */
test('_wms_procesar_devolucion: candados, idempotencia y exclusion de digitales como en _wms_procesar_evento', () => {
  const c = cuerpo(DEVOL);
  const iEvento = c.indexOf("pg_advisory_xact_lock(hashtext('wms_evento:'");
  const iVenta = c.indexOf("pg_advisory_xact_lock(hashtext('wms_venta:'");
  assert.ok(iEvento >= 0 && iVenta > iEvento, 'candado por evento y despues por venta');
  assert.match(c, /ref_pos_movimiento_id = p_pos_mov\)\s*or exists \(select 1 from public\.wms_pos_linea_base where pos_movimiento_id = p_pos_mov\)/);
  assert.match(c, /_wms_es_digital\(m\.producto_detalle_id\)/);
  assert.match(c, /m\.tipo_movimiento <> 'devolucion_venta'/);
  assert.match(c, /v_cant := abs\(m\.cantidad\)/);
});

test('_wms_procesar_devolucion: espera a que la venta figure ANULADA y valida antes de mover stock', () => {
  const c = cuerpo(DEVOL);
  const iEspera = c.indexOf('ESPERA_ANULACION');
  const iSinHist = c.indexOf('SIN_HISTORIAL_WMS');
  const iRevision = c.indexOf('REQUIERE_REVISION');
  const iMover = c.indexOf('_wms_stock_mover');
  assert.ok(iEspera > 0 && iSinHist > iEspera && iRevision > iEspera, 'primero se espera la anulacion');
  assert.ok(Math.max(iSinHist, iRevision) < iMover, 'todas las validaciones van antes de mover stock');
  assert.match(c, /v_del is null and coalesce\(v_est, ''\) <> 'ANULADA'/);
  assert.match(c, /_wms_ref_venta\(m\.referencia, m\.motivo\)/);
});

test('_wms_procesar_devolucion: venta anterior al WMS o sin historial -> PENDIENTE, sin tocar el stock', () => {
  const c = cuerpo(DEVOL);
  assert.match(c, /if v_abierto \+ v_desp = 0 then[\s\S]*?tipo_movimiento in \('RESERVA', 'DESPACHO'\)[\s\S]*?raise exception 'REQUIERE_REVISION: la venta % ya no tiene[\s\S]*?raise exception 'SIN_HISTORIAL_WMS/);
  assert.match(c, /No se modifica el stock del WMS/);
  assert.match(c, /if v_cant > v_abierto \+ v_desp then\s+raise exception 'REQUIERE_REVISION/);
});

test('_wms_procesar_devolucion: primero libera la reserva (mismo contenedor o Sin ubicar), despues devuelve lo despachado', () => {
  const c = cuerpo(DEVOL);
  const iLiberar = c.indexOf("'LIBERACION'");
  const iDevolver = c.indexOf("_wms_stock_mover(m.producto_detalle_id, null, 'DESPACHADO', -v_rest, p_usr)");
  assert.ok(iLiberar > 0 && iDevolver > iLiberar, 'primero la reserva, despues lo despachado');
  // las DOS ramas escriben LIBERACION con su fase de origen y destino
  assert.match(c, /'LIBERACION', v_take, 'RESERVADO', 'SIN_UBICAR'/);
  assert.match(c, /'LIBERACION', v_take,\s+v_bodega, v_bodega, r\.ubicacion_origen_id, r\.ubicacion_origen_id,\s+'RESERVADO', 'UBICADO'/);
  assert.equal((c.match(/'LIBERACION', v_take/g) || []).length, 2);
  // reserva desde contenedor: RESERVADO -> UBICADO en el mismo contenedor
  assert.match(c, /_wms_stock_mover\(m\.producto_detalle_id, r\.ubicacion_origen_id, 'RESERVADO', -v_take, p_usr\)/);
  assert.match(c, /_wms_stock_mover\(m\.producto_detalle_id, r\.ubicacion_origen_id, 'UBICADO', v_take, p_usr\)/);
  // reserva desde Sin ubicar: RESERVADO -> SIN_UBICAR
  assert.match(c, /_wms_stock_mover\(m\.producto_detalle_id, null, 'RESERVADO', -v_take, p_usr\)/);
  assert.match(c, /_wms_stock_mover\(m\.producto_detalle_id, null, 'SIN_UBICAR', v_take, p_usr\)/);
  // lo despachado: DESPACHADO -> SIN_UBICAR con el patron del movimiento manual del 2026-10-16
  assert.match(c, /_wms_stock_mover\(m\.producto_detalle_id, null, 'SIN_UBICAR', v_rest, p_usr\)/);
  assert.match(c, /'ENTRADA', v_rest, 'DESPACHADO', 'SIN_UBICAR'/);
  assert.match(c, /Devolucion por anulacion de venta/);
});

test('_wms_procesar_devolucion: cada fila escrita lleva el movimiento POS y la venta (idempotencia y bandeja)', () => {
  const c = cuerpo(DEVOL);
  const inserts = c.match(/insert into public\.wms_movimientos[\s\S]*?\);/g) || [];
  assert.equal(inserts.length, 3, 'dos liberaciones (contenedor y sin ubicar) y una entrada');
  inserts.forEach((s) => {
    assert.match(s, /ref_pos_movimiento_id/);
    assert.match(s, /ref_pos_venta_id/);
    assert.match(s, /p_pos_mov, v_ref/);
  });
  // la liberacion desde contenedor conserva el origen para que la reserva abierta cuadre por origen
  assert.match(inserts[1], /ubicacion_origen_id/);
  assert.match(inserts[1], /r\.ubicacion_origen_id, r\.ubicacion_origen_id/);
});

test('La anulacion usa tipos de movimiento validos en el esquema (LIBERACION existe en el 08)', () => {
  if (!SQL08) return;   // el 08 no esta en este arbol de pruebas
  assert.match(SQL08, /'LIBERACION'/);
});

test('_wms_procesar_evento no se toca: sigue sin soportar devolucion_venta (por eso el 19 usa funcion aparte)', () => {
  if (!SQL10) return;
  assert.match(SQL10, /raise exception 'WMS: el tipo % aun no esta soportado'/);
  assert.doesNotMatch(SQL10, /devolucion_venta' then/);
});

/* ================= Rollback ================= */
test('Rollback: se detiene si ya hubo liberaciones y restaura las definiciones del 09', () => {
  assert.match(sinComentarios(RB), /tipo_movimiento = 'LIBERACION'/);
  assert.match(sinComentarios(RB), /raise exception 'ROLLBACK DETENIDO/);
  assert.match(sinComentarios(RB), /drop function if exists public\._wms_procesar_devolucion\(uuid, uuid\)/);
  // se restaura el sync ANTES de eliminar la funcion que ese sync llamaba
  assert.ok(RB.indexOf('function public.wms_sincronizar') < RB.indexOf('drop function if exists public._wms_procesar_devolucion'));
  if (!SQL09) return;
  assert.equal(norm(funcion(RB, 'wms_sincronizar')), norm(funcion(SQL09, 'wms_sincronizar')));
  assert.equal(norm(funcion(RB, 'wms_despachar')), norm(funcion(SQL09, 'wms_despachar')));
  assert.equal(norm(vista(RB, 'wms_v_pos_pendientes')), norm(vista(SQL09, 'wms_v_pos_pendientes')));
  assert.equal(norm(vista(RB, 'wms_v_despacho_pendiente')), norm(vista(SQL09, 'wms_v_despacho_pendiente')));
});

test('Verificacion: el conteo de funciones pasa de 19 a 20', () => {
  assert.match(SQL19, /C\) Funciones del WMS -> 20/);
  assert.match(RB, /Funciones del WMS -> 19/);
});

/* ================= Pantallas y service worker (despues de aplicar-w1.mjs) ================= */
test('Panel y Reconciliacion ya no dicen que las anulaciones estan pendientes', () => {
  const panel = leer('apps/wms/js/paginas/panel.js');
  const rec = leer('apps/wms/js/paginas/reconciliacion.js');
  assert.doesNotMatch(panel, /\(anulaciones, D2\)|anulaciones, decision D2/);
  assert.match(panel, /devoluciones al proveedor y transferencias del POS/);
  assert.doesNotMatch(rec, /pendiente D2|hoy no se iguala desde el WMS|Hoy el WMS no puede igualarse|\(anulaciones, D2\)/);
  assert.match(rec, /Las anulaciones de venta ya las procesa el WMS/);
  assert.match(rec, /esta diferencia es una alarma para revisar/);
});

test('Las pendientes por procesar siguen mostrandose con su motivo (accion LIBERAR no es NO_SOPORTADO)', () => {
  const panel = leer('apps/wms/js/paginas/panel.js');
  const rec = leer('apps/wms/js/paginas/reconciliacion.js');
  // lo que NO es NO_SOPORTADO se muestra como "por resolver" con el motivo de la sincronizacion
  assert.match(panel, /fallidos = filas\.filter\(function \(f\) \{ return f\.accion_wms !== 'NO_SOPORTADO'; \}\)/);
  assert.match(rec, /var noSop = o\.accion_wms === 'NO_SOPORTADO'/);
});

test('Service worker del WMS: la version de cache subio', () => {
  const m = leer('apps/wms/service-worker.js').match(/var CACHE = 'kubit-wms-(\d{8})-(\d{2})'/);
  assert.ok(m, 'formato kubit-wms-AAAAMMDD-NN');
  assert.ok(m[1] + m[2] > '2026102701', 'debe ser posterior a U2 (kubit-wms-20261027-01): ' + m[0]);
});
