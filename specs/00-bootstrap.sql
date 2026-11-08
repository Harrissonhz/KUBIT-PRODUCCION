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
-- Contenido: Grants del rol anon para la tienda.
--            Desde T2 (2026-11-03): pos_clientes con SELECT + INSERT
--            (RA-01 y RA-04) y SIN acceso anon a st_direcciones,
--            st_pedidos ni st_pedidos_detalle (la tienda crea pedidos
--            con la funcion st_crear_pedido, PASO 7).
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
-- PASO 5: URL del WMS en la configuracion del POS (Fase 44)
-- Archivo: 13-pos-wms-url.sql
-- Contenido: columna wms_url en pos_configuracion_empresa
--            (ya incluida en 01-schema.sql; idempotente)
-- ============================================================
-- >> Ejecutar 13-pos-wms-url.sql a continuacion


-- ============================================================
-- PASO 6: Tienda T2 — pedido seguro
-- Archivo: 15-store-pedido-seguro.sql
-- Contenido: funcion st_crear_pedido (v1), secuencia
--            st_pedidos_numero_seq, indice unico de numero_pedido,
--            columna st_direcciones.email
-- Requisito: un unico cliente CONSUMIDOR Ecommerce
--            (pos_clientes, numero_id 222222222222) y un unico canal 'web'
-- ============================================================
-- >> Ejecutar 15-store-pedido-seguro.sql a continuacion


-- ============================================================
-- PASO 7: Tienda T2 — cerrar acceso anonimo
-- Archivo: 16-store-cerrar-acceso-anon.sql
-- Contenido: sin politicas ni permisos anon en st_pedidos,
--            st_pedidos_detalle y st_direcciones
-- ATENCION: en un ambiente con la tienda ya publicada, ejecutarlo
--            SOLO despues de publicar el checkout que usa st_crear_pedido
-- ============================================================
-- >> Ejecutar 16-store-cerrar-acceso-anon.sql a continuacion


-- ============================================================
-- PASO 8: Tienda T3b — checkout coherente
-- Archivo: 17-store-checkout-coherente.sql
-- Contenido: st_configuracion, st_tarifas_envio, st_destinos_envio,
--            st_pedidos.medio_pago_web, funciones st_cfg,
--            st_normalizar_texto, st_zona_envio, st_config_tienda,
--            st_cotizar_envio y st_crear_pedido v2 (misma firma)
-- ATENCION: carga tarifas, llave Bre-B, titular y link de pago DE
--            PRUEBA. En produccion ejecutar en la misma sesion los
--            UPDATE con los valores reales (al pie del script).
--            Si el script se vuelve a ejecutar, no sobrescribe valores.
-- ============================================================
-- >> Ejecutar 17-store-checkout-coherente.sql a continuacion
--    Verificacion: select public.st_config_tienda();
--                  select public.st_cotizar_envio('Antioquia','Itagui');


-- ============================================================
-- FIN: Base de datos 100% operativa
-- Siguiente paso: Poblar datos desde plan de migracion
--   ArchivosInformativos/MigracionDB/01-plan-migracion.md
-- NOTA TEMPLATE: Al clonar Kubit para un nuevo cliente, copiar
-- 01-schema.sql + 02-seed-permisos.sql + 03-seed-store-grants.sql
-- + 04-rpcs-ventas.sql + 13 + 15 + 16 + 17 (en ese orden).
-- Olvidar 04 rompe ventas. Olvidar 15 o 17 rompe el checkout de la tienda.
-- ============================================================
