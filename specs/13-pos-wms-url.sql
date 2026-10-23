-- ============================================================
-- 13-pos-wms-url.sql — Fase 44: URL del WMS en la configuracion de la empresa
-- Motor: PostgreSQL 15+ (Supabase)
--
-- Agrega pos_configuracion_empresa.wms_url, que el POS usa para el enlace
-- "WMS" del menu lateral (debajo de "Tienda Virtual").
--
-- Cuando aplicarlo: en QA y en produccion, ANTES de publicar el codigo de la
-- Fase 44 en ese ambiente. configuracion.js envia wms_url al guardar; sin la
-- columna, guardar la Configuracion falla.
--
-- Es idempotente (se puede ejecutar mas de una vez). Los grants y las politicas
-- RLS de la tabla ya cubren la columna nueva.
-- El esquema completo (specs/01-schema.sql) ya incluye esta columna.
-- ============================================================

alter table public.pos_configuracion_empresa
  add column if not exists wms_url text;

comment on column public.pos_configuracion_empresa.wms_url is
  'URL del WMS (apps/wms) para el enlace del menu del POS. Cada ambiente guarda la suya; vacia = el enlace se oculta.';

-- Refresca el cache de esquema de la API (PostgREST) para que reconozca la columna
notify pgrst, 'reload schema';

-- Verificacion: debe devolver 1 fila -> wms_url | text | YES | (sin default)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pos_configuracion_empresa'
  and column_name = 'wms_url';

-- Opcional: cargar la URL desde SQL (tambien se puede escribir en
-- Configuracion > Datos de la Empresa > "URL WMS (Bodega)"):
-- update public.pos_configuracion_empresa
--    set wms_url = 'https://<tu-wms>.vercel.app/login.html'
--  where deleted_at is null;
