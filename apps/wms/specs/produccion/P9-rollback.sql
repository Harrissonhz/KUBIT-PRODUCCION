-- ============================================================
-- P9-rollback.sql — Kubit-WMS · Volver atras en PRODUCCION (version 2)
-- Plan: apps/wms/specs/despliegue-produccion.md (v6) · Guia: seccion R
--
-- QUE HACE: elimina SOLO los objetos del WMS (vistas wms_v_*, funciones
-- wms_* / _wms_*, tablas wms_*), con sus politicas, permisos e indices.
-- NO TOCA: ninguna tabla, dato, funcion, politica ni permiso de pos_* o st_*.
--
-- SEGURIDAD:
--   - Una sola transaccion: si algo falla, no se borra nada.
--   - Sin CASCADE: si algo ajeno al WMS dependiera de un objeto wms_*,
--     el borrado falla y se revierte todo (no arrastra objetos del POS).
--   - Al final verifica que no quede ningun objeto wms_*.
--
-- DONDE: SQL Editor del proyecto donde se desplego (confirmar la URL).
-- Se puede ejecutar aunque el despliegue haya quedado a medias.
-- ============================================================

begin;

-- 1. Vistas (en orden de dependencia)
drop view if exists public.wms_v_despacho_pendiente;
drop view if exists public.wms_v_stock_detalle;
drop view if exists public.wms_v_ubicaciones_ruta;
drop view if exists public.wms_v_pos_pendientes;
drop view if exists public.wms_v_reconciliacion;

-- 2. Funciones wms_* y _wms_* (todas las firmas)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  loop
    execute format('drop function %s', r.firma);
  end loop;
end $$;

-- 3. Tablas (hijas primero; sin CASCADE)
drop table if exists public.wms_conteos;
drop table if exists public.wms_movimientos;
drop table if exists public.wms_stock_ubicacion;
drop table if exists public.wms_pos_linea_base;
drop table if exists public.wms_ubicaciones;
drop table if exists public.wms_bodegas;

-- 4. Verificacion: si queda algun objeto wms_*, se revierte todo
do $$
declare v_restantes int;
begin
  select count(*) into v_restantes from (
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'wms\_%'
    union all
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  ) x;
  if v_restantes > 0 then
    raise exception 'ROLLBACK INCOMPLETO: quedan % objetos wms_*. No se aplico ningun cambio.', v_restantes;
  end if;
end $$;

commit;

-- ============================================================
-- DESPUES DEL ROLLBACK (cada consulta por separado)
-- 1) Nada del WMS (0 filas):
--    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname like 'wms\_%';
-- 2) FOTO del POS: identica a la tomada en P1.2 de la guia.
-- ============================================================
