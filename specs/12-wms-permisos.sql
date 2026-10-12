-- ============================================================
-- 12-wms-permisos.sql — Kubit-WMS: cierre de permisos (R-P3)
-- Motor: PostgreSQL 15+ (Supabase)
-- Base: 08 → 09 v2 → 10 → 11 · Plan de produccion v5 (2026-10-06)
--
-- PROBLEMA (R-P3):
--   1. El 08 (y los privilegios por defecto de Supabase) dejan que el rol
--      `anon` -la llave publica que usa la Tienda Virtual- LEA las tablas y
--      vistas wms_* (bodegas, ubicaciones, stock, movimientos).
--   2. Cualquier usuario autenticado puede escribir DIRECTO en
--      wms_stock_ubicacion, wms_movimientos y wms_conteos, saltandose las
--      funciones que validan el stock.
--
-- QUE HACE (solo sobre objetos wms_* / _wms_*):
--   1. Quita TODO permiso del rol anon sobre tablas y vistas wms_*.
--   2. Tablas de stock (wms_stock_ubicacion, wms_movimientos, wms_conteos,
--      wms_pos_linea_base): el rol authenticated queda en SOLO LECTURA.
--      Las escrituras siguen funcionando porque las hacen las funciones
--      (security definer, duenas de las tablas).
--   3. Maestros (wms_bodegas, wms_ubicaciones): se mantiene la escritura de
--      authenticated (decision C1); se quita la lectura publica.
--   4. Funciones: nadie sin sesion puede ejecutarlas; las internas _wms_*
--      tampoco los usuarios autenticados.
--
-- NO TOCA: tablas pos_* ni st_*, sus politicas ni sus permisos; los
-- privilegios por defecto del esquema (afectarian tablas futuras del POS);
-- datos; funciones; vistas (solo sus permisos).
--
-- USO: ejecutar despues del 11. Orden: 08 → 09 → 10 → 11 → 12.
-- Idempotente. Verificacion al final.
-- IMPACTO EN LA APP: ninguno para usuarios con sesion. diagnostico.html
-- deja de leer wms_bodegas sin sesion (version nueva lee la configuracion
-- de la empresa y comprueba que el WMS NO sea legible sin sesion).
-- ============================================================

begin;   -- todo o nada


-- ------------------------------------------------------------
-- 1. Rol anon: sin acceso a ninguna tabla ni vista wms_*
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname like 'wms\_%'
       and c.relkind in ('r', 'v')            -- tablas y vistas
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;


-- ------------------------------------------------------------
-- 2. Maestros (C1): lectura y escritura solo con sesion
--    Se elimina la politica que incluia a anon. "escritura authenticated"
--    (FOR ALL, solo authenticated) se conserva y cubre la lectura.
-- ------------------------------------------------------------
drop policy if exists "lectura publica" on public.wms_bodegas;
drop policy if exists "lectura publica" on public.wms_ubicaciones;


-- ------------------------------------------------------------
-- 3. Tablas de stock: authenticated solo lee; escriben las funciones
-- ------------------------------------------------------------
-- wms_stock_ubicacion
drop policy if exists "lectura publica"         on public.wms_stock_ubicacion;
drop policy if exists "escritura authenticated" on public.wms_stock_ubicacion;
drop policy if exists "lectura authenticated"   on public.wms_stock_ubicacion;
create policy "lectura authenticated" on public.wms_stock_ubicacion
  for select to authenticated using (true);
revoke all on public.wms_stock_ubicacion from authenticated;
grant select on public.wms_stock_ubicacion to authenticated;

-- wms_movimientos
drop policy if exists "lectura publica"         on public.wms_movimientos;
drop policy if exists "escritura authenticated" on public.wms_movimientos;
drop policy if exists "lectura authenticated"   on public.wms_movimientos;
create policy "lectura authenticated" on public.wms_movimientos
  for select to authenticated using (true);
revoke all on public.wms_movimientos from authenticated;
grant select on public.wms_movimientos to authenticated;

-- wms_conteos
drop policy if exists "lectura publica"         on public.wms_conteos;
drop policy if exists "escritura authenticated" on public.wms_conteos;
drop policy if exists "lectura authenticated"   on public.wms_conteos;
create policy "lectura authenticated" on public.wms_conteos
  for select to authenticated using (true);
revoke all on public.wms_conteos from authenticated;
grant select on public.wms_conteos to authenticated;

-- wms_pos_linea_base (ya tenia solo lectura; se limpia el permiso)
revoke all on public.wms_pos_linea_base from authenticated;
grant select on public.wms_pos_linea_base to authenticated;


-- ------------------------------------------------------------
-- 4. Vistas: solo lectura para authenticated
-- ------------------------------------------------------------
revoke all on public.wms_v_reconciliacion     from authenticated;
revoke all on public.wms_v_pos_pendientes     from authenticated;
revoke all on public.wms_v_ubicaciones_ruta   from authenticated;
revoke all on public.wms_v_stock_detalle      from authenticated;
revoke all on public.wms_v_despacho_pendiente from authenticated;
grant select on public.wms_v_reconciliacion     to authenticated;
grant select on public.wms_v_pos_pendientes     to authenticated;
grant select on public.wms_v_ubicaciones_ruta   to authenticated;
grant select on public.wms_v_stock_detalle      to authenticated;
grant select on public.wms_v_despacho_pendiente to authenticated;


-- ------------------------------------------------------------
-- 5. Funciones: sin ejecucion publica ni anonima;
--    las internas _wms_* tampoco para authenticated
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  loop
    execute format('revoke execute on function %s from public, anon', r.firma);
    if r.proname like '\_wms\_%' then
      execute format('revoke execute on function %s from authenticated', r.firma);
    end if;
  end loop;
end $$;

commit;


-- ============================================================
-- VERIFICACION V-12 (ejecutar cada consulta por separado)
--
-- G) Permisos del rol anon sobre wms_*  -> 0 filas
-- select table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'anon' and table_schema = 'public' and table_name like 'wms\_%';
--
-- H) Escrituras de authenticated en tablas de stock y vistas -> 0 filas
-- select table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'authenticated' and table_schema = 'public'
--   and (table_name in ('wms_stock_ubicacion','wms_movimientos','wms_conteos','wms_pos_linea_base')
--        or table_name like 'wms\_v\_%')
--   and privilege_type <> 'SELECT';
--
-- I) Politicas del WMS -> 6 filas, ninguna con anon:
--    wms_bodegas/escritura authenticated (ALL), wms_ubicaciones/escritura authenticated (ALL),
--    wms_conteos, wms_movimientos, wms_pos_linea_base, wms_stock_ubicacion: lectura authenticated (SELECT)
-- select tablename, policyname, roles, cmd
-- from pg_policies where schemaname = 'public' and tablename like 'wms\_%'
-- order by 1, 2;
--
-- J) Funciones del WMS ejecutables sin sesion -> 0 filas
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
--   and has_function_privilege('anon', p.oid, 'execute');
--
-- Y repetir A = 0, B = 0, C = 19 (el 12 no crea ni borra funciones).
-- ============================================================
-- FIN 12-wms-permisos.sql
-- ============================================================
