-- ============================================================
-- 03-seed-store-grants.sql — Grants y RLS del guest checkout
-- Ejecutar DESPUES de 01-schema.sql (tablas deben existir)
-- Idempotente: usa IF NOT EXISTS / IF EXISTS
-- ------------------------------------------------------------
-- ACTUALIZADO 2026-10-30 (Store T2, hallazgos ST-05 y ST-24):
--   Antes este script abria st_pedidos, st_pedidos_detalle y st_direcciones al
--   rol anon (lectura e insercion directas). Eso permitia leer todos los pedidos
--   y crearlos con el precio que quisiera el navegador. YA NO:
--     - La tienda crea pedidos solo con public.st_crear_pedido
--       (specs/15-store-pedido-seguro.sql).
--     - specs/16-store-cerrar-acceso-anon.sql cierra el acceso anon a esas tablas.
--   Este script ya NO reabre ese acceso; si se vuelve a ejecutar, lo deja cerrado.
--
-- ORDEN en un proyecto nuevo: 01-schema -> 03 (este) -> 15 -> 16.
-- No se reejecuta en produccion: sirve para documentar y para ambientes nuevos.
-- ============================================================

-- ============================================================
-- pos_clientes: SELECT + INSERT para anon  (SIN CAMBIOS en T2)
--   Lectura publica = riesgo aceptado RA-01.
--   Insercion anonima = riesgo aceptado RA-04 (la tienda ya no la usa desde T2;
--   se quitara despues de verificar que el POS no depende de ella).
-- ============================================================
grant select, insert on public.pos_clientes to anon;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anon crean clientes' and tablename = 'pos_clientes') then
    create policy "anon crean clientes"
      on public.pos_clientes for insert to anon with check (true);
  end if;
end $$;

-- ============================================================
-- st_direcciones, st_pedidos, st_pedidos_detalle: SIN acceso para anon (T2)
-- ============================================================
drop policy if exists "anon ven direcciones"   on public.st_direcciones;
drop policy if exists "anon crean direcciones" on public.st_direcciones;
revoke all on public.st_direcciones from anon;

drop policy if exists "anon ven pedidos"   on public.st_pedidos;
drop policy if exists "anon crean pedidos" on public.st_pedidos;
revoke all on public.st_pedidos from anon;

drop policy if exists "anon ven detalle de pedidos"   on public.st_pedidos_detalle;
drop policy if exists "anon crean detalle de pedidos" on public.st_pedidos_detalle;
revoke all on public.st_pedidos_detalle from anon;

-- ============================================================
-- NOTAS:
-- Historico: las policies SELECT de anon existian porque PostgREST usa
-- "Prefer: return=representation" en POST, que hace un SELECT implicito del
-- registro insertado. Desde T2 ya no hay POST directo a estas tablas: la tienda
-- llama al RPC st_crear_pedido (security definer), que inserta con permisos del
-- propietario y devuelve solo el numero, el total y las lineas del pedido.
-- ============================================================
