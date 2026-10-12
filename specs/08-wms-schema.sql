-- ============================================================
-- 08-wms-schema.sql — Esquema del modulo WMS - Kubit SaaS
-- Motor: PostgreSQL 15+ (Supabase)
-- Base spec: specs/07-wms-spec.md (v6)
--
-- Convenciones (heredadas de 01-schema.sql / AGENTS.md — No Reabrir):
--   - UUID v4 como PK (gen_random_uuid())
--   - timestamptz para timestamps
--   - Soft delete via deleted_at
--   - Auditoria via created_by / updated_by -> pos_usuarios(id)
--   - updated_at automatico via trigger update_updated_at()
--   - CHECK constraints para campos de estado (sin ENUMs)
--   - RLS + Grants obligatorios
--   - Zona horaria: America/Bogota (UTC-5)
--
-- Dependencias (deben existir previamente, creadas por 01-schema.sql):
--   - public.pos_usuarios(id)            -> auditoria
--   - public.pos_productos_detalle(id)   -> SKU/variante (el WMS NUNCA crea productos)
--   - public.update_updated_at()         -> funcion trigger
--
-- USO: ejecutar DESPUES de 01-schema.sql .. 04-rpcs-ventas.sql
-- Es idempotente (create table if not exists / drop policy if exists).
-- ============================================================


-- ============================================================
-- 1. wms_bodegas
-- Bodegas fisicas. MVP: 1=Hogar/Limpieza, 2=Mini Cuarto Util, 3=Cuarto Util Grande
-- ============================================================
create table if not exists public.wms_bodegas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  descripcion text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create unique index if not exists uk_wms_bodegas_codigo on public.wms_bodegas(codigo);
create index if not exists idx_wms_bodegas_created_by on public.wms_bodegas(created_by);
create index if not exists idx_wms_bodegas_updated_by on public.wms_bodegas(updated_by);

drop trigger if exists trg_wms_bodegas_updated_at on public.wms_bodegas;
create trigger trg_wms_bodegas_updated_at
  before update on public.wms_bodegas
  for each row execute function public.update_updated_at();

grant select on public.wms_bodegas to anon;
grant select, insert, update, delete on public.wms_bodegas to authenticated;
grant all on public.wms_bodegas to service_role;
alter table public.wms_bodegas enable row level security;
drop policy if exists "lectura publica" on public.wms_bodegas;
create policy "lectura publica"
  on public.wms_bodegas for select
  to anon, authenticated
  using (true);
drop policy if exists "escritura authenticated" on public.wms_bodegas;
create policy "escritura authenticated"
  on public.wms_bodegas for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- 2. wms_ubicaciones
-- Arbol de contenedores auto-referenciado (parent_id).
--   Estanteria -> Entrepano -> Caja        (mono-SKU)
--   Canastilla -> Bolsa (mono-SKU) / Suelto (multi-SKU)
-- codigo = 5 digitos numericos B CC PP (ver 07-wms-spec.md seccion 15)
-- NOTA: 'tipo' es la fuente de verdad; el rango del codigo es solo ayuda visual.
-- ============================================================
create table if not exists public.wms_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  bodega_id uuid not null references public.wms_bodegas(id),
  parent_id uuid references public.wms_ubicaciones(id),
  tipo text not null check (tipo in (
    'ESTANTERIA', 'ENTREPANO', 'CAJA', 'CANASTILLA', 'BOLSA', 'SUELTO'
  )),
  codigo text not null,
  nombre text,
  es_hoja boolean not null default false,
  mono_sku boolean not null default false,
  producto_detalle_id uuid references public.pos_productos_detalle(id),
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create unique index if not exists uk_wms_ubicaciones_codigo on public.wms_ubicaciones(codigo);
create index if not exists idx_wms_ubicaciones_bodega_id on public.wms_ubicaciones(bodega_id);
create index if not exists idx_wms_ubicaciones_parent_id on public.wms_ubicaciones(parent_id);
create index if not exists idx_wms_ubicaciones_producto_detalle_id on public.wms_ubicaciones(producto_detalle_id);
create index if not exists idx_wms_ubicaciones_created_by on public.wms_ubicaciones(created_by);
create index if not exists idx_wms_ubicaciones_updated_by on public.wms_ubicaciones(updated_by);

drop trigger if exists trg_wms_ubicaciones_updated_at on public.wms_ubicaciones;
create trigger trg_wms_ubicaciones_updated_at
  before update on public.wms_ubicaciones
  for each row execute function public.update_updated_at();

grant select on public.wms_ubicaciones to anon;
grant select, insert, update, delete on public.wms_ubicaciones to authenticated;
grant all on public.wms_ubicaciones to service_role;
alter table public.wms_ubicaciones enable row level security;
drop policy if exists "lectura publica" on public.wms_ubicaciones;
create policy "lectura publica"
  on public.wms_ubicaciones for select
  to anon, authenticated
  using (true);
drop policy if exists "escritura authenticated" on public.wms_ubicaciones;
create policy "escritura authenticated"
  on public.wms_ubicaciones for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- 3. wms_stock_ubicacion  — NUCLEO
-- Stock fisico por contenedor y estado.
-- SIN_UBICAR es un estado LOGICO: ubicacion_id / bodega_id quedan NULL.
-- Invariante: SUM(cantidad) WHERE estado_fase IN (SIN_UBICAR, UBICADO)
--             == pos_productos_detalle.stock_actual
-- ============================================================
create table if not exists public.wms_stock_ubicacion (
  id uuid primary key default gen_random_uuid(),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  ubicacion_id uuid references public.wms_ubicaciones(id),
  bodega_id uuid references public.wms_bodegas(id),
  estado_fase text not null default 'SIN_UBICAR' check (estado_fase in (
    'SIN_UBICAR', 'UBICADO', 'RESERVADO', 'DESPACHADO', 'BAJA'
  )),
  cantidad int not null default 0 check (cantidad >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz,
  -- Coherencia: SIN_UBICAR nunca tiene contenedor fisico asignado
  constraint chk_wms_stock_sin_ubicar
    check (estado_fase <> 'SIN_UBICAR' or ubicacion_id is null)
);

create index if not exists idx_wms_stock_producto_detalle_id on public.wms_stock_ubicacion(producto_detalle_id);
create index if not exists idx_wms_stock_ubicacion_id on public.wms_stock_ubicacion(ubicacion_id);
create index if not exists idx_wms_stock_bodega_id on public.wms_stock_ubicacion(bodega_id);
create index if not exists idx_wms_stock_estado_fase on public.wms_stock_ubicacion(estado_fase);
create index if not exists idx_wms_stock_created_by on public.wms_stock_ubicacion(created_by);
create index if not exists idx_wms_stock_updated_by on public.wms_stock_ubicacion(updated_by);
-- Indice compuesto para el calculo del invariante de reconciliacion
create index if not exists idx_wms_stock_recon on public.wms_stock_ubicacion(producto_detalle_id, estado_fase);

drop trigger if exists trg_wms_stock_ubicacion_updated_at on public.wms_stock_ubicacion;
create trigger trg_wms_stock_ubicacion_updated_at
  before update on public.wms_stock_ubicacion
  for each row execute function public.update_updated_at();

grant select on public.wms_stock_ubicacion to anon;
grant select, insert, update, delete on public.wms_stock_ubicacion to authenticated;
grant all on public.wms_stock_ubicacion to service_role;
alter table public.wms_stock_ubicacion enable row level security;
drop policy if exists "lectura publica" on public.wms_stock_ubicacion;
create policy "lectura publica"
  on public.wms_stock_ubicacion for select
  to anon, authenticated
  using (true);
drop policy if exists "escritura authenticated" on public.wms_stock_ubicacion;
create policy "escritura authenticated"
  on public.wms_stock_ubicacion for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- 4. wms_movimientos  — Bitacora (ledger) de movimientos fisicos
-- ref_pos_compra_id / ref_pos_venta_id controlan la IDEMPOTENCIA
-- con el POS (sincronizacion por lectura bajo demanda).
-- ============================================================
create table if not exists public.wms_movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  tipo_movimiento text not null check (tipo_movimiento in (
    'ENTRADA', 'UBICACION', 'TRASLADO', 'RESERVA',
    'DESPACHO', 'AJUSTE', 'BAJA', 'LIBERACION'
  )),
  cantidad int not null check (cantidad <> 0),
  bodega_origen_id uuid references public.wms_bodegas(id),
  bodega_destino_id uuid references public.wms_bodegas(id),
  ubicacion_origen_id uuid references public.wms_ubicaciones(id),
  ubicacion_destino_id uuid references public.wms_ubicaciones(id),
  fase_origen text,
  fase_destino text,
  ref_pos_movimiento_id uuid,   -- pos_movimientos_inventario.id (FK logica)
  ref_pos_compra_id uuid,       -- pos_compras.id
  ref_pos_venta_id uuid,        -- pos_ventas.id
  motivo text,
  notas text,
  fecha timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists idx_wms_mov_producto_detalle_id on public.wms_movimientos(producto_detalle_id);
create index if not exists idx_wms_mov_tipo on public.wms_movimientos(tipo_movimiento);
create index if not exists idx_wms_mov_bodega_origen_id on public.wms_movimientos(bodega_origen_id);
create index if not exists idx_wms_mov_bodega_destino_id on public.wms_movimientos(bodega_destino_id);
create index if not exists idx_wms_mov_ubicacion_origen_id on public.wms_movimientos(ubicacion_origen_id);
create index if not exists idx_wms_mov_ubicacion_destino_id on public.wms_movimientos(ubicacion_destino_id);
create index if not exists idx_wms_mov_created_by on public.wms_movimientos(created_by);
-- Indices para el control de idempotencia con el POS
create index if not exists idx_wms_mov_ref_pos_compra on public.wms_movimientos(ref_pos_compra_id);
create index if not exists idx_wms_mov_ref_pos_venta on public.wms_movimientos(ref_pos_venta_id);

drop trigger if exists trg_wms_movimientos_updated_at on public.wms_movimientos;
create trigger trg_wms_movimientos_updated_at
  before update on public.wms_movimientos
  for each row execute function public.update_updated_at();

grant select on public.wms_movimientos to anon;
grant select, insert, update, delete on public.wms_movimientos to authenticated;
grant all on public.wms_movimientos to service_role;
alter table public.wms_movimientos enable row level security;
drop policy if exists "lectura publica" on public.wms_movimientos;
create policy "lectura publica"
  on public.wms_movimientos for select
  to anon, authenticated
  using (true);
drop policy if exists "escritura authenticated" on public.wms_movimientos;
create policy "escritura authenticated"
  on public.wms_movimientos for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- 5. wms_conteos  — Inventario general / conteo ciclico
-- El ajuste NO requiere aprobacion (uso personal, decision 7 del spec).
-- diferencia es columna generada: cantidad_fisica - cantidad_sistema
-- ============================================================
create table if not exists public.wms_conteos (
  id uuid primary key default gen_random_uuid(),
  sesion_inventario_id uuid,
  ubicacion_id uuid references public.wms_ubicaciones(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  cantidad_sistema int not null default 0,
  cantidad_fisica int not null default 0,
  diferencia int generated always as (cantidad_fisica - cantidad_sistema) stored,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'AJUSTADO')),
  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index if not exists idx_wms_conteos_sesion on public.wms_conteos(sesion_inventario_id);
create index if not exists idx_wms_conteos_ubicacion_id on public.wms_conteos(ubicacion_id);
create index if not exists idx_wms_conteos_producto_detalle_id on public.wms_conteos(producto_detalle_id);
create index if not exists idx_wms_conteos_created_by on public.wms_conteos(created_by);

drop trigger if exists trg_wms_conteos_updated_at on public.wms_conteos;
create trigger trg_wms_conteos_updated_at
  before update on public.wms_conteos
  for each row execute function public.update_updated_at();

grant select on public.wms_conteos to anon;
grant select, insert, update, delete on public.wms_conteos to authenticated;
grant all on public.wms_conteos to service_role;
alter table public.wms_conteos enable row level security;
drop policy if exists "lectura publica" on public.wms_conteos;
create policy "lectura publica"
  on public.wms_conteos for select
  to anon, authenticated
  using (true);
drop policy if exists "escritura authenticated" on public.wms_conteos;
create policy "escritura authenticated"
  on public.wms_conteos for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- 6. SEED — Las 3 bodegas del MVP
-- Idempotente via el unique index de codigo.
-- ============================================================
insert into public.wms_bodegas (codigo, nombre, descripcion) values
  ('1', 'Bodega Hogar/Limpieza', 'Espacio del apartamento; solo inventario de venta (se ignoran productos personales de limpieza).'),
  ('2', 'Mini Cuarto Util',      'Sector pequeno del apartamento.'),
  ('3', 'Cuarto Util Grande',    'Cuarto util recien comprado, con mas espacio, para crecimiento.')
on conflict (codigo) do nothing;


-- ============================================================
-- 7. VISTA wms_v_reconciliacion
-- Compara el stock fisico disponible (SIN_UBICAR + UBICADO) contra
-- pos_productos_detalle.stock_actual. Alimenta el panel de reconciliacion.
-- diferencia <> 0 indica descuadre a resolver.
-- ============================================================
create or replace view public.wms_v_reconciliacion as
select
  pd.id                                       as producto_detalle_id,
  pd.codigo_interno,
  pd.stock_actual                             as stock_pos,
  coalesce(w.stock_wms, 0)                    as stock_wms,
  pd.stock_actual - coalesce(w.stock_wms, 0)  as diferencia
from public.pos_productos_detalle pd
left join (
  select producto_detalle_id, sum(cantidad) as stock_wms
  from public.wms_stock_ubicacion
  where estado_fase in ('SIN_UBICAR', 'UBICADO')
    and deleted_at is null
  group by producto_detalle_id
) w on w.producto_detalle_id = pd.id
where pd.deleted_at is null;

grant select on public.wms_v_reconciliacion to anon;
grant select on public.wms_v_reconciliacion to authenticated;
grant select on public.wms_v_reconciliacion to service_role;


-- ============================================================
-- VERIFICACION
--   select codigo, nombre from public.wms_bodegas order by codigo;
--   select count(*) from public.wms_v_reconciliacion;
-- ============================================================
-- FIN 08-wms-schema.sql
-- Siguiente: 09-wms-functions.sql (RPCs atomicas: wms_recibir, wms_ubicar,
-- wms_reservar, wms_despachar, wms_liberar, wms_trasladar, wms_ajustar, wms_dar_baja)
-- ============================================================
