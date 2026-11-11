-- ============================================================
-- 19-wms-anulaciones-rollback.sql — Deshace 19-wms-anulaciones.sql
-- Restaura las definiciones del 09 (v2) de: wms_sincronizar, wms_v_pos_pendientes,
-- wms_v_despacho_pendiente y wms_despachar, y elimina _wms_procesar_devolucion.
--
-- CUANDO USARLO: solo si el script 19 causo un problema y todavia NO se proceso
-- ninguna anulacion con el (no hay filas LIBERACION). El bloque de seguridad de
-- abajo detiene el rollback si ya las hay: con las definiciones del 09, una reserva
-- ya liberada reapareceria en la bandeja como "por despachar" (aunque sin stock
-- reservado) y la anulacion volveria a quedar 'NO_SOPORTADO'.
--
-- Las devoluciones ya procesadas por el 19 (movimientos ENTRADA y LIBERACION con
-- ref_pos_movimiento_id) siguen contando como procesadas: no se reprocesan.
--
-- Antes de usarlo en produccion conviene guardar las definiciones actuales:
--   select pg_get_functiondef('public.wms_despachar(uuid,uuid)'::regprocedure);
--   select pg_get_functiondef('public.wms_sincronizar(uuid)'::regprocedure);
--   select pg_get_viewdef('public.wms_v_pos_pendientes'::regclass, true);
--   select pg_get_viewdef('public.wms_v_despacho_pendiente'::regclass, true);
-- ============================================================
begin;   -- todo o nada
-- Seguridad: no deshacer si ya hubo liberaciones de reserva
do $$
begin
  if exists (select 1 from public.wms_movimientos where tipo_movimiento = 'LIBERACION') then
    raise exception 'ROLLBACK DETENIDO: ya hay movimientos LIBERACION. Revise con el equipo antes de volver a las definiciones del 09';
  end if;
end $$;
-- ------------------------------------------------------------
-- wms_sincronizar (09 v2, seccion 3.2)
-- ------------------------------------------------------------
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
      perform public._wms_procesar_evento(e.pos_movimiento_id, v_usr);
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
-- ------------------------------------------------------------
-- wms_v_pos_pendientes (09 v2, seccion 2.1)
-- ------------------------------------------------------------
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
    else 'NO_SOPORTADO'      -- ej. devolucion_venta (anulacion, D2)
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
-- ------------------------------------------------------------
-- wms_v_despacho_pendiente (09 v2, seccion 2.4)
-- ------------------------------------------------------------
create or replace view public.wms_v_despacho_pendiente as
select
  w.ref_pos_venta_id,
  v.numero_venta,
  v.fecha_venta,
  w.producto_detalle_id,
  pd.codigo_interno,
  p.nombre                         as producto,
  w.ubicacion_origen_id,
  coalesce(r.ruta, 'SIN UBICAR')   as ruta,
  sum(w.cantidad)                  as cantidad
from public.wms_movimientos w
left join public.pos_ventas v on v.id = w.ref_pos_venta_id
join public.pos_productos_detalle pd on pd.id = w.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
left join public.wms_v_ubicaciones_ruta r on r.ubicacion_id = w.ubicacion_origen_id
where w.tipo_movimiento = 'RESERVA'
  and w.deleted_at is null
  and not exists (
    select 1 from public.wms_movimientos d
     where d.tipo_movimiento = 'DESPACHO'
       and d.ref_pos_movimiento_id = w.ref_pos_movimiento_id
       and d.ubicacion_origen_id is not distinct from w.ubicacion_origen_id
       and d.deleted_at is null
  )
group by w.ref_pos_venta_id, v.numero_venta, v.fecha_venta, w.producto_detalle_id,
         pd.codigo_interno, p.nombre, w.ubicacion_origen_id, r.ruta;
-- ------------------------------------------------------------
-- wms_despachar (09 v2, seccion 3.5)
-- ------------------------------------------------------------
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
  v_total int := 0;
begin
  for r in
    select w.producto_detalle_id, w.ubicacion_origen_id, w.bodega_origen_id,
           w.cantidad, w.ref_pos_movimiento_id
      from public.wms_movimientos w
     where w.tipo_movimiento = 'RESERVA'
       and w.ref_pos_venta_id = p_ref_pos_venta_id
       and w.deleted_at is null
       and not exists (
         select 1 from public.wms_movimientos d
          where d.tipo_movimiento = 'DESPACHO'
            and d.ref_pos_movimiento_id = w.ref_pos_movimiento_id
            and d.ubicacion_origen_id is not distinct from w.ubicacion_origen_id
            and d.deleted_at is null
       )
     for update of w
  loop
    perform public._wms_stock_mover(r.producto_detalle_id, r.ubicacion_origen_id, 'RESERVADO', -r.cantidad, v_usr);
    perform public._wms_stock_mover(r.producto_detalle_id, null, 'DESPACHADO', r.cantidad, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
    values
      (r.producto_detalle_id, 'DESPACHO', r.cantidad,
       r.bodega_origen_id, r.ubicacion_origen_id, 'RESERVADO', 'DESPACHADO',
       r.ref_pos_movimiento_id, p_ref_pos_venta_id, 'Despacho de venta', v_usr);
    perform public._wms_liberar_mono_sku(r.ubicacion_origen_id);
    v_total := v_total + r.cantidad;
  end loop;
  if v_total = 0 then
    raise exception 'WMS: la venta no tiene reservas pendientes (ya despachada o aun no sincronizada)';
  end if;
  return v_total;
end;
$$;
-- ------------------------------------------------------------
-- Eliminar la funcion nueva (ya nadie la llama)
-- ------------------------------------------------------------
drop function if exists public._wms_procesar_devolucion(uuid, uuid);
commit;
-- ============================================================
-- VERIFICACION
--   Funciones del WMS -> 19 (se elimino la nueva):
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%');
--   Repetir G, H, I y J de 12-wms-permisos.sql.
-- ============================================================
-- FIN 19-wms-anulaciones-rollback.sql
-- ============================================================
