-- ============================================================
-- 19-wms-anulaciones.sql — Kubit-WMS: anulacion de ventas (D2 + T-515)
-- Motor: PostgreSQL 15+ (Supabase)
-- Base: 08 -> 09 v2 -> 10 -> 11 -> 12  ·  Fase W1 (2026-11-11)
--
-- PROBLEMA:
--   El POS anula una venta devolviendo el stock con un movimiento
--   'devolucion_venta' y marcandola ANULADA. El WMS no procesaba ese tipo
--   (quedaba 'NO_SOPORTADO'): las unidades no volvian a la bodega del WMS y
--   aparecia una diferencia permanente con el POS (hoy: AL048, POS 35 · WMS 33).
--   Ademas, una venta reservada que se anulaba antes de despacharse dejaba
--   sus unidades bloqueadas en RESERVADO.
--
-- DECISIONES (usuario, 2026-11-11):
--   1. Venta ya DESPACHADA y luego anulada -> las unidades vuelven a
--      "Sin ubicar" (la mercancia regresa a la bodega; se ubica despues).
--   2. Venta RESERVADA (sin despachar) y anulada -> las unidades vuelven a su
--      contenedor de origen (o a "Sin ubicar" si salieron de ahi).
--   3. Venta anterior al WMS (sin reservas ni despachos aqui) -> NO se
--      modifica el stock del WMS: la devolucion queda PENDIENTE con su motivo.
--   4. T-515: wms_despachar rechaza en SQL una venta anulada o eliminada.
--   5. T-521 (igualar el WMS al POS en silencio) no se hace: Reconciliacion
--      sigue siendo la alarma.
--
-- QUE HACE (5 objetos; NO crea tablas ni columnas ni restricciones):
--   1. _wms_procesar_devolucion(uuid, uuid)  NUEVA, interna. Procesa UN
--      'devolucion_venta' del POS. Idempotente. Solo escribe wms_*.
--   2. wms_sincronizar(uuid)   Llama a la funcion anterior para las
--      devoluciones. El resto de los eventos sigue por _wms_procesar_evento
--      (que NO se modifica).
--   3. wms_v_pos_pendientes    devolucion_venta pasa de 'NO_SOPORTADO' a 'LIBERAR'.
--   4. wms_v_despacho_pendiente  la reserva abierta se calcula por venta,
--      producto y origen: RESERVA - DESPACHO - LIBERACION. Mismas columnas.
--   5. wms_despachar(uuid, uuid)  T-515 + calcula la reserva abierta igual que
--      la vista + candado por venta.
--
-- QUE NO HACE: no escribe ni bloquea filas de pos_* ni st_* (CR1); no toca
-- _wms_procesar_evento ni wms_inicializar; no cambia permisos de tablas.
--
-- COMO SE PROCESA UNA DEVOLUCION (por venta y producto):
--   - La venta debe figurar ANULADA (o eliminada) en el POS. Si aun no
--     (el POS devuelve el stock y recien despues la marca ANULADA), queda
--     PENDIENTE y se reintenta al sincronizar.
--   - Reserva abierta (RESERVA - DESPACHO - LIBERACION) -> se libera primero:
--       LIBERACION  RESERVADO -> UBICADO (mismo contenedor) o -> SIN_UBICAR.
--   - El resto sale de lo despachado (DESPACHO - devoluciones previas):
--       ENTRADA  DESPACHADO -> SIN_UBICAR  (mismo patron del movimiento
--       manual del 2026-10-16 para KBT-20261015-0001).
--   - Si la venta no tiene reservas ni despachos en el WMS, o la devolucion
--     es mayor que lo reservado + despachado -> PENDIENTE con motivo.
--   - Todo o nada por evento; los demas eventos de la sincronizacion siguen.
--
-- USO: ejecutar despues de 12-wms-permisos.sql. Primero en PRUEBAS.
--   Idempotente (create or replace). Verificacion al final del archivo.
--   Rollback: specs/19-wms-anulaciones-rollback.sql
-- ============================================================
begin;   -- todo o nada
-- ============================================================
-- 1. _wms_procesar_devolucion — UN devolucion_venta del POS
-- ============================================================
create or replace function public._wms_procesar_devolucion(p_pos_mov uuid, p_usr uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  r record;
  v_cant int;
  v_ref uuid;
  v_num text;
  v_est text;
  v_del timestamptz;
  v_abierto int;
  v_desp int;
  v_rest int;
  v_take int;
  v_bodega uuid;
begin
  -- Candado propio del WMS (no bloquea filas del POS)
  perform pg_advisory_xact_lock(hashtext('wms_evento:' || p_pos_mov::text));
  select * into m
    from public.pos_movimientos_inventario
   where id = p_pos_mov;
  if not found then
    raise exception 'WMS: el movimiento POS % no existe', p_pos_mov;
  end if;
  if m.tipo_movimiento <> 'devolucion_venta' then
    raise exception 'WMS: esta funcion solo procesa devolucion_venta (recibido %)', m.tipo_movimiento;
  end if;
  -- Idempotencia (D1)
  if exists (select 1 from public.wms_movimientos where ref_pos_movimiento_id = p_pos_mov)
     or exists (select 1 from public.wms_pos_linea_base where pos_movimiento_id = p_pos_mov) then
    return;
  end if;
  -- Productos digitales no se gestionan en el WMS (D5)
  if public._wms_es_digital(m.producto_detalle_id) then
    return;
  end if;
  v_cant := abs(m.cantidad);
  if v_cant = 0 then
    raise exception 'WMS: el movimiento POS tiene cantidad 0';
  end if;
  -- Venta de la devolucion (referencia = numero de venta o id; el numero tambien viene en el motivo)
  v_ref := public._wms_ref_venta(m.referencia, m.motivo);
  if v_ref is null then
    raise exception 'WMS: no se encontro la venta de la devolucion (referencia "%", motivo "%")',
      coalesce(m.referencia, 'vacia'), coalesce(m.motivo, 'vacio');
  end if;
  select v.numero_venta, v.estado, v.deleted_at into v_num, v_est, v_del
    from public.pos_ventas v
   where v.id = v_ref;
  -- El POS devuelve el stock y despues marca ANULADA: hasta entonces se espera
  if v_del is null and coalesce(v_est, '') <> 'ANULADA' then
    raise exception 'ESPERA_ANULACION: la venta % aun no figura anulada en el POS; se reintenta al sincronizar',
      coalesce(v_num, v_ref::text);
  end if;
  -- Candado por venta (el mismo de wms_despachar): no se libera mientras se despacha
  perform pg_advisory_xact_lock(hashtext('wms_venta:' || v_ref::text));
  -- Reserva abierta de la venta y el producto: RESERVA - DESPACHO - LIBERACION, por origen
  select coalesce(sum(t.abierto), 0)::int into v_abierto
    from (
      select sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end) as abierto
        from public.wms_movimientos g
       where g.ref_pos_venta_id = v_ref
         and g.producto_detalle_id = m.producto_detalle_id
         and g.tipo_movimiento in ('RESERVA', 'DESPACHO', 'LIBERACION')
         and g.deleted_at is null
       group by g.ubicacion_origen_id
      having sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end) > 0
    ) t;
  -- Despachado y aun no devuelto: DESPACHO - ENTRADA que sale de DESPACHADO
  select coalesce(sum(case d.tipo_movimiento when 'DESPACHO' then d.cantidad else -d.cantidad end), 0)::int
    into v_desp
    from public.wms_movimientos d
   where d.ref_pos_venta_id = v_ref
     and d.producto_detalle_id = m.producto_detalle_id
     and d.deleted_at is null
     and (d.tipo_movimiento = 'DESPACHO'
          or (d.tipo_movimiento = 'ENTRADA' and d.fase_origen = 'DESPACHADO'));
  v_desp := greatest(v_desp, 0);
  if v_abierto + v_desp = 0 then
    -- Con historial en el WMS, ya se devolvio todo; sin historial, la venta es anterior al WMS o su salida sigue pendiente
    if exists (select 1 from public.wms_movimientos x
                where x.ref_pos_venta_id = v_ref
                  and x.producto_detalle_id = m.producto_detalle_id
                  and x.tipo_movimiento in ('RESERVA', 'DESPACHO')
                  and x.deleted_at is null) then
      raise exception 'REQUIERE_REVISION: la venta % ya no tiene unidades reservadas ni despachadas de este producto en el WMS (ya se devolvieron). Revise la reconciliacion',
        coalesce(v_num, v_ref::text);
    end if;
    raise exception 'SIN_HISTORIAL_WMS: la venta % no tiene reservas ni despachos de este producto en el WMS (anterior al arranque del WMS, o su salida aun esta pendiente). No se modifica el stock del WMS',
      coalesce(v_num, v_ref::text);
  end if;
  if v_cant > v_abierto + v_desp then
    raise exception 'REQUIERE_REVISION: la devolucion es de % unidades y la venta % solo tiene % entre reservadas y despachadas en el WMS. Revise la reconciliacion',
      v_cant, coalesce(v_num, v_ref::text), v_abierto + v_desp;
  end if;
  v_rest := v_cant;
  -- 1) Primero se libera la reserva (la mercancia sigue en su contenedor)
  for r in
    select g.ubicacion_origen_id,
           sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end)::int as abierto
      from public.wms_movimientos g
     where g.ref_pos_venta_id = v_ref
       and g.producto_detalle_id = m.producto_detalle_id
       and g.tipo_movimiento in ('RESERVA', 'DESPACHO', 'LIBERACION')
       and g.deleted_at is null
     group by g.ubicacion_origen_id
    having sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end) > 0
     order by g.ubicacion_origen_id nulls last
  loop
    v_take := least(v_rest, r.abierto);
    if r.ubicacion_origen_id is null then
      -- Salio de SIN_UBICAR: vuelve a SIN_UBICAR
      perform public._wms_stock_mover(m.producto_detalle_id, null, 'RESERVADO', -v_take, p_usr);
      perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', v_take, p_usr);
      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
         ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
      values
        (m.producto_detalle_id, 'LIBERACION', v_take, 'RESERVADO', 'SIN_UBICAR',
         p_pos_mov, v_ref, 'Liberacion de reserva por anulacion de venta ' || coalesce(v_num, ''), p_usr);
    else
      -- Salio de un contenedor: vuelve al mismo contenedor
      select u.bodega_id into v_bodega
        from public.wms_ubicaciones u
       where u.id = r.ubicacion_origen_id;
      perform public._wms_stock_mover(m.producto_detalle_id, r.ubicacion_origen_id, 'RESERVADO', -v_take, p_usr);
      perform public._wms_stock_mover(m.producto_detalle_id, r.ubicacion_origen_id, 'UBICADO', v_take, p_usr);
      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad,
         bodega_origen_id, bodega_destino_id, ubicacion_origen_id, ubicacion_destino_id,
         fase_origen, fase_destino, ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
      values
        (m.producto_detalle_id, 'LIBERACION', v_take,
         v_bodega, v_bodega, r.ubicacion_origen_id, r.ubicacion_origen_id,
         'RESERVADO', 'UBICADO', p_pos_mov, v_ref,
         'Liberacion de reserva por anulacion de venta ' || coalesce(v_num, ''), p_usr);
    end if;
    v_rest := v_rest - v_take;
    exit when v_rest = 0;
  end loop;
  -- 2) El resto ya salio de la bodega: regresa a SIN_UBICAR (se ubica despues)
  if v_rest > 0 then
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'DESPACHADO', -v_rest, p_usr);
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', v_rest, p_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
       ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
    values
      (m.producto_detalle_id, 'ENTRADA', v_rest, 'DESPACHADO', 'SIN_UBICAR',
       p_pos_mov, v_ref, 'Devolucion por anulacion de venta ' || coalesce(v_num, ''), p_usr);
  end if;
end;
$$;
-- ============================================================
-- 2. wms_sincronizar — mismo cuerpo del 09; las devoluciones van a la funcion nueva
-- ============================================================
create or replace function public.wms_sincronizar(p_usuario uuid default null)
returns table (
  evento_id uuid,
  tipo_pos text,
  resultado text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_usr uuid := public._wms_usuario(p_usuario);
begin
  if not exists (select 1 from public.wms_pos_linea_base) then
    raise exception 'WMS: no inicializado. Ejecute primero wms_inicializar()';
  end if;
  for e in
    select pos_movimiento_id, tipo_movimiento
      from public.wms_v_pos_pendientes
     where accion_wms <> 'NO_SOPORTADO'
     order by fecha, pos_movimiento_id
  loop
    evento_id := e.pos_movimiento_id;
    tipo_pos := e.tipo_movimiento;
    begin
      if e.tipo_movimiento = 'devolucion_venta' then
        perform public._wms_procesar_devolucion(e.pos_movimiento_id, v_usr);
      else
        perform public._wms_procesar_evento(e.pos_movimiento_id, v_usr);
      end if;
      resultado := 'PROCESADO';
      detalle := null;
    exception when others then
      resultado := 'PENDIENTE';
      detalle := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;
-- ============================================================
-- 3. wms_v_pos_pendientes — la anulacion ya es soportada ('LIBERAR')
--    Mismas columnas y mismos filtros que el 09.
-- ============================================================
create or replace view public.wms_v_pos_pendientes as
select
  m.id                   as pos_movimiento_id,
  m.fecha,
  m.tipo_movimiento,
  m.producto_detalle_id,
  abs(m.cantidad)        as cantidad,
  m.referencia,
  m.motivo,
  case m.tipo_movimiento
    when 'entrada_compra'    then 'ENTRADA'
    when 'ajuste_incremento' then 'AJUSTE_MAS'
    when 'salida_venta'      then 'RESERVA'
    when 'ajuste_decremento' then 'AJUSTE_MENOS'
    when 'merma'             then 'BAJA'
    when 'devolucion_venta'  then 'LIBERAR'
    else 'NO_SOPORTADO'      -- ej. devolucion_compra, transferencias
  end                    as accion_wms
from public.pos_movimientos_inventario m
join public.pos_productos_detalle pd on pd.id = m.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
where m.deleted_at is null
  and p.tipo_producto is distinct from 'Digital'                     -- D5
  and coalesce(m.referencia, '') not like 'WMS%'                     -- anti-eco (D3)
  and not exists (select 1 from public.wms_movimientos w
                   where w.ref_pos_movimiento_id = m.id)             -- ya procesado (D1)
  and not exists (select 1 from public.wms_pos_linea_base b
                   where b.pos_movimiento_id = m.id);                -- anterior al arranque
-- ============================================================
-- 4. wms_v_despacho_pendiente — reserva abierta por venta, producto y origen
--    Reserva abierta = RESERVA - DESPACHO - LIBERACION. Mismas columnas del 09.
-- ============================================================
create or replace view public.wms_v_despacho_pendiente as
select
  g.ref_pos_venta_id,
  v.numero_venta,
  v.fecha_venta,
  g.producto_detalle_id,
  pd.codigo_interno,
  p.nombre                         as producto,
  g.ubicacion_origen_id,
  coalesce(r.ruta, 'SIN UBICAR')   as ruta,
  g.abierto                        as cantidad
from (
  select w.ref_pos_venta_id, w.producto_detalle_id, w.ubicacion_origen_id,
         sum(case w.tipo_movimiento when 'RESERVA' then w.cantidad else -w.cantidad end) as abierto
    from public.wms_movimientos w
   where w.tipo_movimiento in ('RESERVA', 'DESPACHO', 'LIBERACION')
     and w.deleted_at is null
   group by w.ref_pos_venta_id, w.producto_detalle_id, w.ubicacion_origen_id
  having sum(case w.tipo_movimiento when 'RESERVA' then w.cantidad else -w.cantidad end) > 0
) g
left join public.pos_ventas v on v.id = g.ref_pos_venta_id
join public.pos_productos_detalle pd on pd.id = g.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
left join public.wms_v_ubicaciones_ruta r on r.ubicacion_id = g.ubicacion_origen_id;
-- ============================================================
-- 5. wms_despachar — T-515: la venta debe seguir vigente en el POS
--    RESERVADO -> DESPACHADO para toda la reserva abierta de la venta.
--    Idempotente. Devuelve las unidades despachadas.
-- ============================================================
create or replace function public.wms_despachar(
  p_ref_pos_venta_id uuid,
  p_usuario uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  r record;
  v_est text;
  v_del timestamptz;
  v_bodega uuid;
  v_ref_mov uuid;
  v_total int := 0;
begin
  -- Candado por venta (el mismo que usa la anulacion): no se despacha mientras se libera
  perform pg_advisory_xact_lock(hashtext('wms_venta:' || p_ref_pos_venta_id::text));
  -- T-515: una venta anulada o eliminada en el POS no se despacha
  select v.estado, v.deleted_at into v_est, v_del
    from public.pos_ventas v
   where v.id = p_ref_pos_venta_id;
  if not found then
    raise exception 'WMS: la venta no existe en el POS. No se despacha';
  end if;
  if v_del is not null or coalesce(v_est, '') = 'ANULADA' then
    raise exception 'WMS: la venta esta anulada o eliminada en el POS. No se despacha';
  end if;
  for r in
    select g.producto_detalle_id, g.ubicacion_origen_id,
           sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end)::int as abierto
      from public.wms_movimientos g
     where g.ref_pos_venta_id = p_ref_pos_venta_id
       and g.tipo_movimiento in ('RESERVA', 'DESPACHO', 'LIBERACION')
       and g.deleted_at is null
     group by g.producto_detalle_id, g.ubicacion_origen_id
    having sum(case g.tipo_movimiento when 'RESERVA' then g.cantidad else -g.cantidad end) > 0
     order by g.producto_detalle_id, g.ubicacion_origen_id nulls last
  loop
    -- Datos de la reserva original (bodega y movimiento POS) para dejar trazabilidad
    select w.ref_pos_movimiento_id, w.bodega_origen_id into v_ref_mov, v_bodega
      from public.wms_movimientos w
     where w.tipo_movimiento = 'RESERVA'
       and w.ref_pos_venta_id = p_ref_pos_venta_id
       and w.producto_detalle_id = r.producto_detalle_id
       and w.ubicacion_origen_id is not distinct from r.ubicacion_origen_id
       and w.deleted_at is null
     order by w.fecha, w.id
     limit 1;
    perform public._wms_stock_mover(r.producto_detalle_id, r.ubicacion_origen_id, 'RESERVADO', -r.abierto, v_usr);
    perform public._wms_stock_mover(r.producto_detalle_id, null, 'DESPACHADO', r.abierto, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
    values
      (r.producto_detalle_id, 'DESPACHO', r.abierto,
       v_bodega, r.ubicacion_origen_id, 'RESERVADO', 'DESPACHADO',
       v_ref_mov, p_ref_pos_venta_id, 'Despacho de venta', v_usr);
    perform public._wms_liberar_mono_sku(r.ubicacion_origen_id);
    v_total := v_total + r.abierto;
  end loop;
  if v_total = 0 then
    raise exception 'WMS: la venta no tiene reservas pendientes (ya despachada o aun no sincronizada)';
  end if;
  return v_total;
end;
$$;
-- ============================================================
-- 6. PERMISOS
--    La funcion nueva es interna (_wms_*): nadie con sesion la ejecuta.
--    Las otras 4 piezas se reemplazaron con create or replace: conservan
--    los permisos que dejo el 12.
-- ============================================================
revoke execute on function public._wms_procesar_devolucion(uuid, uuid) from public, anon, authenticated;
commit;
-- ============================================================
-- VERIFICACION (ejecutar cada consulta por separado)
--
-- A) Ninguna funcion del WMS escribe en pos_* ni st_*  -> 0 filas
-- select p.proname
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
--   and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.(pos|st)_';
--
-- B) Ninguna funcion del WMS bloquea filas del POS o la Tienda -> 0 filas
-- select p.proname
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
--   and p.prosrc ~* 'from\s+public\.(pos|st)_[a-z_]+[^;]*for\s+update';
--
-- C) Funciones del WMS -> 20 (antes 19; se agrego _wms_procesar_devolucion)
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%');
--
-- D) La funcion nueva no la ejecuta nadie sin sesion ni con sesion -> 0 filas
-- select r.rolname from pg_roles r
-- where r.rolname in ('anon', 'authenticated')
--   and has_function_privilege(r.oid, 'public._wms_procesar_devolucion(uuid, uuid)'::regprocedure, 'execute');
--
-- E) Permisos del 12 intactos: repetir G, H, I y J de 12-wms-permisos.sql
--    (G=0, H=0, I=6 filas sin anon, J=0 filas).
--
-- F) La bandeja de despacho da lo mismo que antes (guardar el resultado ANTES y comparar):
-- select ref_pos_venta_id, producto_detalle_id, ubicacion_origen_id, cantidad
-- from public.wms_v_despacho_pendiente order by 1, 2, 3;
--
-- G) La anulacion ya no es 'NO_SOPORTADO' (debe aparecer como LIBERAR mientras no se sincronice)
-- select tipo_movimiento, accion_wms, count(*) from public.wms_v_pos_pendientes group by 1, 2 order by 1, 2;
--
-- H) Sincronizar procesa las devoluciones pendientes (en produccion: la de AL048, KBT-20261020-0004)
-- select * from public.wms_sincronizar();
--
-- I) Resultado esperado en produccion despues de H:
--    diferencia de AL048 = 0, "Sin ubicar" 312 -> 314, despachado 141 -> 139, pendientes del POS = 0
-- select * from public.wms_v_reconciliacion where diferencia <> 0;
-- select estado_fase, sum(cantidad) as unidades from public.wms_stock_ubicacion group by 1 order by 1;
-- select tipo_movimiento, count(*) from public.wms_v_pos_pendientes group by 1;
--
-- J) Linea de tiempo de una venta (cambiar el numero)
-- select w.fecha, w.tipo_movimiento, w.cantidad, w.fase_origen, w.fase_destino,
--        u.codigo as contenedor, w.motivo
-- from public.wms_movimientos w
-- join public.pos_ventas v on v.id = w.ref_pos_venta_id
-- left join public.wms_ubicaciones u on u.id = w.ubicacion_origen_id
-- where v.numero_venta = 'KBT-20261020-0004'
-- order by w.fecha, w.id;
-- ============================================================
-- FIN 19-wms-anulaciones.sql
-- ============================================================
