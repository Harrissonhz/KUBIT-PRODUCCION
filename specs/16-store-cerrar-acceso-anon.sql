-- ============================================================
-- 16-store-cerrar-acceso-anon.sql — Kubit Store T2 (cerrar acceso anonimo)
-- Fecha: 2026-10-30 · Hallazgos: ST-05, ST-24
-- ------------------------------------------------------------
-- QUE HACE: quita al rol anon (llave publica) todo acceso directo a
--   st_pedidos, st_pedidos_detalle y st_direcciones (politicas y permisos).
--   La tienda crea pedidos SOLO con public.st_crear_pedido (script 15).
--
-- NO TOCA pos_clientes: su politica de lectura publica (RA-01) y la de
--   insercion anonima "anon crean clientes" (RA-04) siguen igual. El POS esta
--   estable y no se modifica; la insercion anonima se evaluara despues.
--
-- REQUISITOS ANTES DE EJECUTAR (si no, la tienda deja de crear pedidos):
--   1. Script 15 ejecutado en ESTE proyecto de Supabase.
--   2. Frontend T2 publicado y probado (checkout con la llamada st_crear_pedido).
--   3. Ejecutar primero en QA (gbjtdjbopwgbknklwldq); luego en produccion.
--
-- Los usuarios del POS (authenticated) NO se afectan: conservan sus politicas
-- ("admins ven todos los pedidos", "admins actualizan pedidos", etc.).
-- Idempotente: se puede volver a ejecutar.
-- ============================================================

begin;

-- st_pedidos
drop policy if exists "anon ven pedidos"   on public.st_pedidos;
drop policy if exists "anon crean pedidos" on public.st_pedidos;
revoke all on public.st_pedidos from anon;

-- st_pedidos_detalle
drop policy if exists "anon ven detalle de pedidos"   on public.st_pedidos_detalle;
drop policy if exists "anon crean detalle de pedidos" on public.st_pedidos_detalle;
revoke all on public.st_pedidos_detalle from anon;

-- st_direcciones
drop policy if exists "anon ven direcciones"   on public.st_direcciones;
drop policy if exists "anon crean direcciones" on public.st_direcciones;
revoke all on public.st_direcciones from anon;

-- RLS activo en las tres tablas (defensa en profundidad)
alter table public.st_pedidos         enable row level security;
alter table public.st_pedidos_detalle enable row level security;
alter table public.st_direcciones     enable row level security;

commit;

-- ------------------------------------------------------------
-- VERIFICACION (por separado, solo lectura)
--   -- 1) No debe quedar ninguna politica anon en las tres tablas (0 filas):
--   select tablename, policyname, roles, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('st_pedidos','st_pedidos_detalle','st_direcciones')
--      and 'anon' = any(roles);
--   -- 2) anon sin permisos sobre las tres tablas (0 filas):
--   select table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee = 'anon'
--      and table_name in ('st_pedidos','st_pedidos_detalle','st_direcciones');
--   -- 3) pos_clientes sigue igual (RA-01 y RA-04): deben verse "lectura publica" y "anon crean clientes".
--   select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'pos_clientes' order by cmd;
--
-- ROLLBACK (solo si hay que reabrir el acceso anonimo de emergencia; es lo que hacia el script 03 original):
--   grant select, insert on public.st_pedidos         to anon;
--   grant select, insert on public.st_pedidos_detalle to anon;
--   grant select, insert on public.st_direcciones     to anon;
--   create policy "anon ven pedidos"   on public.st_pedidos for select to anon using (true);
--   create policy "anon crean pedidos" on public.st_pedidos for insert to anon with check (true);
--   create policy "anon ven detalle de pedidos"   on public.st_pedidos_detalle for select to anon using (true);
--   create policy "anon crean detalle de pedidos" on public.st_pedidos_detalle for insert to anon with check (true);
--   create policy "anon ven direcciones"   on public.st_direcciones for select to anon using (true);
--   create policy "anon crean direcciones" on public.st_direcciones for insert to anon with check (true);
-- ------------------------------------------------------------
