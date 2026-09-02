-- ============================================================
-- 00-bootstrap.sql — Orquestador de Base de Datos Kubit
-- Uso: Ejecucion completa para fresh deploy
--       1. Abrir en Supabase SQL Editor
--       2. Ejecutar bloque por bloque en orden
--       3. DB lista para recibir datos
-- ============================================================

-- ============================================================
-- PASO 0: Extensiones requeridas
-- Archivo: 01-schema.sql (dependencia: unaccent para slugify)
-- ============================================================
create extension if not exists unaccent;

-- ============================================================
-- PASO 1: Schema completo (DDL)
-- Archivo: 01-schema.sql
-- Contenido: 35 tablas (25 pos_* + 10 st_*)
--            Funcion update_updated_at()
--            Funcion slugify() con trigger
--            Indices, RLS policies, Grants base
--            Seed: pos_canales_venta (5 registros)
-- ============================================================
-- >> Ejecutar 01-schema.sql a continuacion


-- ============================================================
-- PASO 2: Seeds de configuracion del sistema
-- Archivo: 02-seed-permisos.sql
-- Contenido: pos_roles (Administrador, Vendedor)
--            pos_permisos (claves del sistema)
--            pos_rol_permisos (vinculacion)
-- ============================================================
-- >> Ejecutar 02-seed-permisos.sql a continuacion


-- ============================================================
-- PASO 3: Grants y RLS para Store checkout anonimo
-- Archivo: 03-seed-store-grants.sql
-- Contenido: Grants INSERT+SELECT para rol anon
--            RLS policies en pos_clientes, st_direcciones,
--            st_pedidos, st_pedidos_detalle
-- ============================================================
-- >> Ejecutar 03-seed-store-grants.sql a continuacion


-- ============================================================
-- PASO 4: RPCs criticos para POS (ventas) — OBLIGATORIO
-- Archivo: 04-rpcs-ventas.sql
-- Contenido: tabla pos_consecutivos + RPC generar_consecutivo(text,text)
--            + RPC actualizar_finanzas_mensuales(int,int,numeric,numeric,numeric,numeric)
--            Grants execute para authenticated/service_role, RLS
-- Importancia: SIN ESTE PASO ventas.js:635 falla con 404 PGRST202
--            "Could not find function generar_consecutivo" y bloquea
--            TODAS las ventas POS. Patch agregado tras bug NexoraShop (2026-05).
--            Es idempotente y debe ejecutarse SIEMPRE en fresh deploy.
-- ============================================================
-- >> Ejecutar 04-rpcs-ventas.sql a continuacion
--    Verificacion: select public.generar_consecutivo('VENTA','KBT');


-- ============================================================
-- FIN: Base de datos 100% operativa
-- Siguiente paso: Poblar datos desde plan de migracion
--   ArchivosInformativos/MigracionDB/01-plan-migracion.md
-- NOTA TEMPLATE: Al clonar Kubit para un nuevo cliente, copiar
-- 01-schema.sql + 02-seed-permisos.sql + 03-seed-store-grants.sql
-- + 04-rpcs-ventas.sql. Olvidar 04 rompe ventas.
-- ============================================================
