-- ============================================================
-- 11-wms-conteo-sobrante.sql — Kubit-WMS: cerrar el sobrante de un conteo
-- Motor: PostgreSQL 15+ (Supabase)
-- Base: 09-wms-functions.sql (v2) + 10-wms-solo-lectura.sql · Paso C2 (2026-10-05)
--
-- CONTEXTO (CR1 y CR3):
--   wms_registrar_conteo NO crea el sobrante: el conteo queda ABIERTO con la
--   observacion "Sobrante de N unidad(es): registrar ajuste + en el POS...".
--   Faltaba como cerrarlo. Esta funcion lo cierra de dos formas:
--
--   UBICAR    : el usuario ya registro el ajuste + en el POS y se sincronizo
--               (las N unidades llegaron a SIN_UBICAR). Se mueven a la
--               ubicacion del conteo y el conteo pasa a AJUSTADO.
--   DESCARTAR : el sobrante fue un error de conteo. El conteo pasa a
--               AJUSTADO sin mover stock.
--
-- REGLA CR1: solo escribe en tablas wms_* (wms_stock_ubicacion,
-- wms_movimientos, wms_conteos). No lee ni bloquea filas del POS
-- (salvo la lectura de tipo_producto en _wms_validar_fisico).
--
-- USO: ejecutar despues del 10. Orden obligatorio: 08 -> 09 -> 10 -> 11.
-- Idempotente (create or replace). Verificacion al final.
-- ============================================================

begin;   -- todo o nada

create or replace function public.wms_cerrar_sobrante(
  p_conteo_id uuid,
  p_accion text,                 -- 'UBICAR' | 'DESCARTAR'
  p_usuario uuid default null
) returns int                    -- unidades ubicadas (0 si se descarta)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_accion text := upper(trim(coalesce(p_accion, '')));
  c public.wms_conteos;
  v_u public.wms_ubicaciones;
  v_codigo text;
  v_sobrante int;
  v_pool int;
begin
  if v_accion not in ('UBICAR', 'DESCARTAR') then
    raise exception 'WMS: accion invalida (use UBICAR o DESCARTAR)';
  end if;

  select * into c
    from public.wms_conteos
   where id = p_conteo_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'WMS: el conteo % no existe', p_conteo_id;
  end if;
  if c.estado <> 'ABIERTO' then
    raise exception 'WMS: el conteo ya esta cerrado';
  end if;

  -- El sobrante lo escribe wms_registrar_conteo (10) al inicio de la observacion
  v_sobrante := substring(coalesce(c.observaciones, '') from '^Sobrante de ([0-9]+)')::int;
  if v_sobrante is null or v_sobrante <= 0 then
    raise exception 'WMS: el conteo no tiene un sobrante pendiente';
  end if;

  -- ---------------- DESCARTAR ----------------
  if v_accion = 'DESCARTAR' then
    update public.wms_conteos
       set estado = 'AJUSTADO',
           observaciones = 'Descartado (error de conteo). ' || c.observaciones
     where id = c.id;
    return 0;
  end if;

  -- ---------------- UBICAR ----------------
  perform public._wms_validar_fisico(c.producto_detalle_id);

  select coalesce(sum(cantidad), 0) into v_pool
    from public.wms_stock_ubicacion
   where producto_detalle_id = c.producto_detalle_id
     and estado_fase = 'SIN_UBICAR'
     and deleted_at is null;

  if v_pool < v_sobrante then
    raise exception 'WMS: aun no llega el ajuste + del POS (hay % sin ubicar y el sobrante es %). Registralo en el POS y vuelve a intentar', v_pool, v_sobrante;
  end if;

  select codigo into v_codigo
    from public.wms_ubicaciones
   where id = c.ubicacion_id;

  v_u := public._wms_ubicacion_por_codigo(v_codigo);           -- existe, activa y aloja stock
  perform public._wms_validar_mono_sku(v_u.id, c.producto_detalle_id);

  perform public._wms_stock_mover(c.producto_detalle_id, null, 'SIN_UBICAR', -v_sobrante, v_usr);
  perform public._wms_stock_mover(c.producto_detalle_id, v_u.id, 'UBICADO', v_sobrante, v_usr);

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad,
     bodega_destino_id, ubicacion_destino_id, fase_origen, fase_destino,
     motivo, created_by)
  values
    (c.producto_detalle_id, 'UBICACION', v_sobrante,
     v_u.bodega_id, v_u.id, 'SIN_UBICAR', 'UBICADO',
     'Inventario general - sobrante ubicado', v_usr);

  update public.wms_conteos
     set estado = 'AJUSTADO',
         observaciones = 'Ubicado tras ajuste + en el POS. ' || c.observaciones
   where id = c.id;

  return v_sobrante;
end;
$$;

revoke execute on function public.wms_cerrar_sobrante(uuid, text, uuid) from public, anon;
grant execute on function public.wms_cerrar_sobrante(uuid, text, uuid) to authenticated, service_role;

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
-- C) Funciones del WMS -> 19 (11 _wms_ + 8 wms_)
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%');
-- ============================================================
-- FIN 11-wms-conteo-sobrante.sql
-- ============================================================
