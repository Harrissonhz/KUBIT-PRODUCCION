-- ============================================================
-- 01-schema.sql — Esquema completo de base de datos - Kubit SaaS
-- Motor: PostgreSQL 15+ (Supabase)
-- Convenciones:
--   - UUID v4 como PK (gen_random_uuid())
--   - timestamptz para timestamps
--   - Soft delete via deleted_at
--   - Auditoria via created_by / updated_by
--   - updated_at automatico via trigger
--   - CHECK constraints para campos de estado (sin ENUMs)
--   - RLS + Grants obligatorios (post May 30, 2026)
--   - Zona horaria: America/Bogota (UTC-5)
--     Configurada via ALTER DATABASE postgres SET timezone = 'America/Bogota'
--     Ver ScriptMigracionDB/13-migrate-timezone.sql
-- ============================================================

-- Extension requerida por la funcion slugify() en pos_productos
create extension if not exists unaccent;

-- ============================================================
-- 0. FUNCION TRIGGER PARA UPDATED_AT AUTOMATICO
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- FASE 1: MAESTROS SIN DEPENDENCIAS EXTERNAS
-- ============================================================

-- ============================================================
-- 1. pos_sucursales
-- ============================================================
create table public.pos_sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  ciudad text,
  departamento text,
  telefono text,
  email text,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create trigger trg_pos_sucursales_updated_at
  before update on public.pos_sucursales
  for each row execute function public.update_updated_at();

grant select on public.pos_sucursales to anon;
grant select, insert, update, delete on public.pos_sucursales to authenticated;
grant all on public.pos_sucursales to service_role;

alter table public.pos_sucursales enable row level security;

create policy "lectura publica"
  on public.pos_sucursales for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_sucursales for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 2. pos_metodos_pago
-- ============================================================
create table public.pos_metodos_pago (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create trigger trg_pos_metodos_pago_updated_at
  before update on public.pos_metodos_pago
  for each row execute function public.update_updated_at();

grant select on public.pos_metodos_pago to anon;
grant select, insert, update, delete on public.pos_metodos_pago to authenticated;
grant all on public.pos_metodos_pago to service_role;

alter table public.pos_metodos_pago enable row level security;

create policy "lectura publica"
  on public.pos_metodos_pago for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_metodos_pago for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 3. pos_gasto_categorias
-- ============================================================
create table public.pos_gasto_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create trigger trg_pos_gasto_categorias_updated_at
  before update on public.pos_gasto_categorias
  for each row execute function public.update_updated_at();

grant select on public.pos_gasto_categorias to anon;
grant select, insert, update, delete on public.pos_gasto_categorias to authenticated;
grant all on public.pos_gasto_categorias to service_role;

alter table public.pos_gasto_categorias enable row level security;

create policy "lectura publica"
  on public.pos_gasto_categorias for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_gasto_categorias for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 4. pos_roles
-- ============================================================
create table public.pos_roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_pos_roles_deleted_at on public.pos_roles(deleted_at);

create trigger trg_pos_roles_updated_at
  before update on public.pos_roles
  for each row execute function public.update_updated_at();

grant select on public.pos_roles to anon;
grant select, insert, update, delete on public.pos_roles to authenticated;
grant all on public.pos_roles to service_role;

alter table public.pos_roles enable row level security;

create policy "lectura publica"
  on public.pos_roles for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_roles for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 5. pos_permisos
-- ============================================================
create table public.pos_permisos (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  descripcion text,
  modulo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_pos_permisos_updated_at
  before update on public.pos_permisos
  for each row execute function public.update_updated_at();

grant select on public.pos_permisos to anon;
grant select, insert, update, delete on public.pos_permisos to authenticated;
grant all on public.pos_permisos to service_role;

alter table public.pos_permisos enable row level security;

create policy "lectura publica"
  on public.pos_permisos for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_permisos for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 6. pos_canales_venta
-- Catalogo de canales de venta (fisico, web, mercadolibre, etc.)
-- ============================================================
create table public.pos_canales_venta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null,
  descripcion text,
  comision_porcentaje numeric default 0,
  tipo text not null default 'propio',
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create unique index uk_pos_canales_venta_codigo on public.pos_canales_venta(codigo);

create trigger trg_pos_canales_venta_updated_at
  before update on public.pos_canales_venta
  for each row execute function public.update_updated_at();

grant select on public.pos_canales_venta to anon;
grant select, insert, update, delete on public.pos_canales_venta to authenticated;
grant all on public.pos_canales_venta to service_role;

alter table public.pos_canales_venta enable row level security;

create policy "lectura publica"
  on public.pos_canales_venta for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_canales_venta for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- FASE 2: DEPENDENCIAS DE FASE 1
-- ============================================================

-- ============================================================
-- 7. pos_cajas
-- ============================================================
create table public.pos_cajas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sucursal_id uuid not null references public.pos_sucursales(id),
  descripcion text,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create index idx_pos_cajas_sucursal_id on public.pos_cajas(sucursal_id);

create trigger trg_pos_cajas_updated_at
  before update on public.pos_cajas
  for each row execute function public.update_updated_at();

grant select on public.pos_cajas to anon;
grant select, insert, update, delete on public.pos_cajas to authenticated;
grant all on public.pos_cajas to service_role;

alter table public.pos_cajas enable row level security;

create policy "lectura publica"
  on public.pos_cajas for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_cajas for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 8. pos_rol_permisos
-- ============================================================
create table public.pos_rol_permisos (
  rol_id uuid not null references public.pos_roles(id),
  permiso_id uuid not null references public.pos_permisos(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (rol_id, permiso_id)
);

create index idx_pos_rol_permisos_permiso_id on public.pos_rol_permisos(permiso_id);

create trigger trg_pos_rol_permisos_updated_at
  before update on public.pos_rol_permisos
  for each row execute function public.update_updated_at();

grant select on public.pos_rol_permisos to anon;
grant select, insert, update, delete on public.pos_rol_permisos to authenticated;
grant all on public.pos_rol_permisos to service_role;

alter table public.pos_rol_permisos enable row level security;

create policy "lectura publica"
  on public.pos_rol_permisos for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_rol_permisos for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 9. pos_usuarios
-- Nota: created_by y updated_by se agregan despues via ALTER
-- ============================================================
create table public.pos_usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  usuario text not null,
  email text not null,
  telefono text,
  documento text,
  fecha_nacimiento date,
  direccion text,
  rol_id uuid not null references public.pos_roles(id),
  activo boolean default true,
  ultimo_acceso timestamptz,
  password_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_pos_usuarios_rol_id on public.pos_usuarios(rol_id);

create trigger trg_pos_usuarios_updated_at
  before update on public.pos_usuarios
  for each row execute function public.update_updated_at();

-- Agregar auto-referencias para created_by y updated_by
alter table public.pos_usuarios
  add column created_by uuid references public.pos_usuarios(id);

alter table public.pos_usuarios
  add column updated_by uuid references public.pos_usuarios(id);

create index idx_pos_usuarios_created_by on public.pos_usuarios(created_by);
create index idx_pos_usuarios_updated_by on public.pos_usuarios(updated_by);

grant select on public.pos_usuarios to anon;
grant select, insert, update, delete on public.pos_usuarios to authenticated;
grant all on public.pos_usuarios to service_role;

alter table public.pos_usuarios enable row level security;

create policy "lectura publica"
  on public.pos_usuarios for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_usuarios for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 10. pos_categorias
-- Nota: categoria_padre_id se agrega despues via ALTER (auto-referencia)
-- ============================================================
create table public.pos_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  color text,
  activa boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz,
  codigo text
);

alter table public.pos_categorias
  add column categoria_padre_id uuid references public.pos_categorias(id);

create index idx_pos_categorias_categoria_padre_id on public.pos_categorias(categoria_padre_id);
create index idx_pos_categorias_created_by on public.pos_categorias(created_by);
create index idx_pos_categorias_updated_by on public.pos_categorias(updated_by);

create trigger trg_pos_categorias_updated_at
  before update on public.pos_categorias
  for each row execute function public.update_updated_at();

grant select on public.pos_categorias to anon;
grant select, insert, update, delete on public.pos_categorias to authenticated;
grant all on public.pos_categorias to service_role;

alter table public.pos_categorias enable row level security;

create policy "lectura publica"
  on public.pos_categorias for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_categorias for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 11. pos_configuracion_empresa
-- ============================================================
create table public.pos_configuracion_empresa (
  id uuid primary key default gen_random_uuid(),
  nombre_empresa text not null,
  nit text not null,
  direccion text,
  telefono text,
  email text,
  sitio_web text,
  resolucion_dian text not null,
  rango_desde int,
  rango_hasta int,
  impuesto_default numeric,
  moneda text default 'COP',
  zona_horaria text default 'America/Bogota',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  fecha_vencimiento_resolucion date,
  prefijo_facturacion text,
  logo_url text,
  mensaje_legal text,
  store_url text,
  wms_url text,
  deleted_at timestamptz
);

create index idx_pos_configuracion_empresa_created_by on public.pos_configuracion_empresa(created_by);
create index idx_pos_configuracion_empresa_updated_by on public.pos_configuracion_empresa(updated_by);

create trigger trg_pos_configuracion_empresa_updated_at
  before update on public.pos_configuracion_empresa
  for each row execute function public.update_updated_at();

grant select on public.pos_configuracion_empresa to anon;
grant select, insert, update, delete on public.pos_configuracion_empresa to authenticated;
grant all on public.pos_configuracion_empresa to service_role;

alter table public.pos_configuracion_empresa enable row level security;

create policy "lectura publica"
  on public.pos_configuracion_empresa for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_configuracion_empresa for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- FASE 3: CATALOGO Y CLIENTES
-- ============================================================

-- ============================================================
-- 12. pos_clientes
-- ============================================================
create table public.pos_clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_id text not null,
  numero_id text not null,
  primer_nombre text not null,
  segundo_nombre text,
  primer_apellido text not null,
  segundo_apellido text,
  direccion text,
  ciudad text,
  departamento text,
  telefono text,
  celular text,
  email text,
  fecha_nacimiento date,
  genero text,
  activo boolean default true,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_clientes_created_by on public.pos_clientes(created_by);
create index idx_pos_clientes_updated_by on public.pos_clientes(updated_by);

create trigger trg_pos_clientes_updated_at
  before update on public.pos_clientes
  for each row execute function public.update_updated_at();

grant select on public.pos_clientes to anon;
grant select, insert, update, delete on public.pos_clientes to authenticated;
grant all on public.pos_clientes to service_role;

alter table public.pos_clientes enable row level security;

create policy "lectura publica"
  on public.pos_clientes for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_clientes for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 13. pos_proveedores
-- ============================================================
create table public.pos_proveedores (
  id uuid primary key default gen_random_uuid(),
  tipo_id text not null,
  numero_id text not null,
  razon_social text not null,
  nombre_comercial text,
  codigo text,
  categoria text,
  direccion text,
  ciudad text,
  departamento text,
  telefono text,
  celular text,
  email text,
  sitio_web text,
  persona_contacto text,
  terminos_pago text,
  limite_credito numeric,
  activo boolean default true,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_proveedores_created_by on public.pos_proveedores(created_by);
create index idx_pos_proveedores_updated_by on public.pos_proveedores(updated_by);

create trigger trg_pos_proveedores_updated_at
  before update on public.pos_proveedores
  for each row execute function public.update_updated_at();

grant select on public.pos_proveedores to anon;
grant select, insert, update, delete on public.pos_proveedores to authenticated;
grant all on public.pos_proveedores to service_role;

alter table public.pos_proveedores enable row level security;

create policy "lectura publica"
  on public.pos_proveedores for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_proveedores for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 14. pos_productos
-- ============================================================
create table public.pos_productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null,
  tipo_producto text,
  categoria_id uuid not null references public.pos_categorias(id),
  marca text,
  modelo text,
  descripcion text,
  tasa_impuesto numeric,
  activo boolean default true,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_productos_categoria_id on public.pos_productos(categoria_id);
create index idx_pos_productos_tags on public.pos_productos using gin(tags);
create unique index uk_pos_productos_slug on public.pos_productos(slug);
create index idx_pos_productos_created_by on public.pos_productos(created_by);
create index idx_pos_productos_updated_by on public.pos_productos(updated_by);

create trigger trg_pos_productos_updated_at
  before update on public.pos_productos
  for each row execute function public.update_updated_at();

grant select on public.pos_productos to anon;
grant select, insert, update, delete on public.pos_productos to authenticated;
grant all on public.pos_productos to service_role;

alter table public.pos_productos enable row level security;

create policy "lectura publica"
  on public.pos_productos for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_productos for all
  to authenticated
  using (true)
  with check (true);

-- Función slugify (usada por trigger y migraciones)
create or replace function public.slugify(texto text)
returns text as $$
begin
  return lower(
    regexp_replace(
      regexp_replace(
        public.unaccent(coalesce(texto, '')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  );
end;
$$ language plpgsql immutable;

-- Trigger: auto-generar slug unico al insertar o actualizar nombre
-- Si el slug ya existe, agrega sufijo numerico (-1, -2, etc.)
create or replace function public.set_slug()
returns trigger as $$
declare
  base_slug text;
  new_slug text;
  counter int := 0;
begin
  if TG_OP = 'insert' or new.nombre is distinct from old.nombre then
    base_slug := public.slugify(new.nombre);
    new_slug := base_slug;
    while exists (select 1 from public.pos_productos where slug = new_slug and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')) loop
      counter := counter + 1;
      new_slug := base_slug || '-' || counter;
    end loop;
    new.slug := new_slug;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_pos_productos_set_slug
  before insert or update of nombre on public.pos_productos
  for each row execute function public.set_slug();

-- ============================================================
-- 15. pos_productos_detalle
-- ============================================================
create table public.pos_productos_detalle (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.pos_productos(id),
  codigo_barras text,
  codigo_interno text,
  precio_compra numeric,
  precio_venta numeric,
  precio_original numeric,
  precio_mayorista numeric,
  margen_ganancia numeric,
  descuento_max numeric,
  stock_actual int default 0,
  stock_min int default 0,
  stock_max int default 0,
  peso numeric,
  dimensiones text,
  atributos jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_productos_detalle_producto_id on public.pos_productos_detalle(producto_id);
create index idx_pos_productos_detalle_created_by on public.pos_productos_detalle(created_by);
create index idx_pos_productos_detalle_updated_by on public.pos_productos_detalle(updated_by);

create trigger trg_pos_productos_detalle_updated_at
  before update on public.pos_productos_detalle
  for each row execute function public.update_updated_at();

grant select on public.pos_productos_detalle to anon;
grant select, insert, update, delete on public.pos_productos_detalle to authenticated;
grant all on public.pos_productos_detalle to service_role;

alter table public.pos_productos_detalle enable row level security;

create policy "lectura publica"
  on public.pos_productos_detalle for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_productos_detalle for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 16. pos_productos_multimedia
-- ============================================================
create table public.pos_productos_multimedia (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.pos_productos(id),
  producto_detalle_id uuid references public.pos_productos_detalle(id),
  url text not null,
  tipo text,
  orden int default 0,
  alt_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_productos_multimedia_producto_id on public.pos_productos_multimedia(producto_id);
create index idx_pos_productos_multimedia_producto_detalle_id on public.pos_productos_multimedia(producto_detalle_id);
create index idx_pos_productos_multimedia_created_by on public.pos_productos_multimedia(created_by);
create index idx_pos_productos_multimedia_updated_by on public.pos_productos_multimedia(updated_by);

create trigger trg_pos_productos_multimedia_updated_at
  before update on public.pos_productos_multimedia
  for each row execute function public.update_updated_at();

grant select on public.pos_productos_multimedia to anon;
grant select, insert, update, delete on public.pos_productos_multimedia to authenticated;
grant all on public.pos_productos_multimedia to service_role;

alter table public.pos_productos_multimedia enable row level security;

create policy "lectura publica"
  on public.pos_productos_multimedia for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_productos_multimedia for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- FASE 4: TRANSACCIONAL POS
-- ============================================================

-- ============================================================
-- 17. pos_caja_apertura
-- ============================================================
create table public.pos_caja_apertura (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.pos_cajas(id),
  cajero_id uuid not null references public.pos_usuarios(id),
  fecha_apertura timestamptz not null,
  fecha_cierre timestamptz,
  observaciones text,
  monto_inicial numeric not null,
  monto_final numeric,
  monto_esperado numeric,
  diferencia numeric,
  estado text default 'ABIERTA' check (estado in ('ABIERTA', 'CERRADA')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_caja_apertura_caja_id on public.pos_caja_apertura(caja_id);
create index idx_pos_caja_apertura_cajero_id on public.pos_caja_apertura(cajero_id);
create index idx_pos_caja_apertura_created_by on public.pos_caja_apertura(created_by);
create index idx_pos_caja_apertura_updated_by on public.pos_caja_apertura(updated_by);

create trigger trg_pos_caja_apertura_updated_at
  before update on public.pos_caja_apertura
  for each row execute function public.update_updated_at();

grant select on public.pos_caja_apertura to anon;
grant select, insert, update, delete on public.pos_caja_apertura to authenticated;
grant all on public.pos_caja_apertura to service_role;

alter table public.pos_caja_apertura enable row level security;

create policy "lectura publica"
  on public.pos_caja_apertura for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_caja_apertura for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 18. pos_compras
-- ============================================================
create table public.pos_compras (
  id uuid primary key default gen_random_uuid(),
  numero_orden int,
  proveedor_id uuid not null references public.pos_proveedores(id),
  usuario_id uuid not null references public.pos_usuarios(id),
  fecha_compra date,
  fecha_entrega date,
  estado text default 'PENDIENTE' check (estado in ('PENDIENTE', 'CONFIRMADA', 'RECIBIENDO', 'RECIBIDA', 'ANULADA')),
  subtotal numeric,
  impuesto numeric,
  descuento numeric,
  total numeric,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_compras_proveedor_id on public.pos_compras(proveedor_id);
create index idx_pos_compras_usuario_id on public.pos_compras(usuario_id);
create index idx_pos_compras_created_by on public.pos_compras(created_by);
create index idx_pos_compras_updated_by on public.pos_compras(updated_by);

create trigger trg_pos_compras_updated_at
  before update on public.pos_compras
  for each row execute function public.update_updated_at();

grant select on public.pos_compras to anon;
grant select, insert, update, delete on public.pos_compras to authenticated;
grant all on public.pos_compras to service_role;

alter table public.pos_compras enable row level security;

create policy "lectura publica"
  on public.pos_compras for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_compras for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 19. pos_compras_detalle
-- ============================================================
create table public.pos_compras_detalle (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.pos_compras(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  cantidad int not null,
  precio_unitario numeric,
  descuento numeric,
  tasa_impuesto numeric,
  subtotal numeric,
  impuesto numeric,
  total numeric,
  cantidad_recibida int not null default 0,
  estado_detalle text default 'PENDIENTE' check (estado_detalle in ('PENDIENTE', 'RECIBIDO')),
  created_at timestamptz default now(),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_compras_detalle_compra_id on public.pos_compras_detalle(compra_id);
create index idx_pos_compras_detalle_producto_detalle_id on public.pos_compras_detalle(producto_detalle_id);
create index idx_pos_compras_detalle_updated_by on public.pos_compras_detalle(updated_by);

grant select on public.pos_compras_detalle to anon;
grant select, insert, update, delete on public.pos_compras_detalle to authenticated;
grant all on public.pos_compras_detalle to service_role;

alter table public.pos_compras_detalle enable row level security;

create policy "lectura publica"
  on public.pos_compras_detalle for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_compras_detalle for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 20. pos_ventas
-- ============================================================
create table public.pos_ventas (
  id uuid primary key default gen_random_uuid(),
  numero_venta text,
  cliente_id uuid references public.pos_clientes(id),
  usuario_id uuid not null references public.pos_usuarios(id),
  canal_id uuid not null references public.pos_canales_venta(id),
  referencia_externa text,
  fecha_venta timestamptz not null,
  metodo_pago text,
  estado text default 'PENDIENTE' check (estado in ('PENDIENTE', 'CONFIRMADA', 'FACTURADA', 'ANULADA')),
  subtotal numeric,
  impuesto numeric,
  descuento numeric,
  total numeric,
  costo_cargo_venta numeric default 0,
  costo_impuestos numeric default 0,
  costo_envios numeric default 0,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_ventas_cliente_id on public.pos_ventas(cliente_id);
create index idx_pos_ventas_usuario_id on public.pos_ventas(usuario_id);
create index idx_pos_ventas_canal_id on public.pos_ventas(canal_id);
create index idx_pos_ventas_created_by on public.pos_ventas(created_by);
create index idx_pos_ventas_updated_by on public.pos_ventas(updated_by);

create trigger trg_pos_ventas_updated_at
  before update on public.pos_ventas
  for each row execute function public.update_updated_at();

grant select on public.pos_ventas to anon;
grant select, insert, update, delete on public.pos_ventas to authenticated;
grant all on public.pos_ventas to service_role;

alter table public.pos_ventas enable row level security;

create policy "lectura publica"
  on public.pos_ventas for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_ventas for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 21. pos_ventas_detalle
-- ============================================================
create table public.pos_ventas_detalle (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.pos_ventas(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  cantidad int not null,
  precio_unitario numeric,
  descuento numeric,
  tasa_impuesto numeric,
  subtotal numeric,
  impuesto numeric,
  total numeric,
  created_at timestamptz default now(),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_ventas_detalle_venta_id on public.pos_ventas_detalle(venta_id);
create index idx_pos_ventas_detalle_producto_detalle_id on public.pos_ventas_detalle(producto_detalle_id);
create index idx_pos_ventas_detalle_updated_by on public.pos_ventas_detalle(updated_by);

grant select on public.pos_ventas_detalle to anon;
grant select, insert, update, delete on public.pos_ventas_detalle to authenticated;
grant all on public.pos_ventas_detalle to service_role;

alter table public.pos_ventas_detalle enable row level security;

create policy "lectura publica"
  on public.pos_ventas_detalle for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_ventas_detalle for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 22. pos_facturacion
-- ============================================================
create table public.pos_facturacion (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.pos_ventas(id),
  tipo_comprobante text,
  serie text,
  numero text,
  fecha_emision date,
  moneda text default 'COP',
  condicion_venta text,
  dias_credito int,
  cliente_id uuid references public.pos_clientes(id),
  cliente_tipo_id text,
  cliente_numero_id text,
  cliente_nombre text,
  cliente_direccion text,
  cliente_email text,
  cliente_telefono text,
  subtotal numeric,
  impuesto numeric,
  total numeric,
  estado text default 'BORRADOR' check (estado in ('BORRADOR', 'EMITIDA', 'ACEPTADA', 'ANULADA', 'RECHAZADA')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_pos_facturacion_venta_id on public.pos_facturacion(venta_id);
create index idx_pos_facturacion_cliente_id on public.pos_facturacion(cliente_id);
create index idx_pos_facturacion_created_by on public.pos_facturacion(created_by);
create index idx_pos_facturacion_updated_by on public.pos_facturacion(updated_by);

create trigger trg_pos_facturacion_updated_at
  before update on public.pos_facturacion
  for each row execute function public.update_updated_at();

grant select on public.pos_facturacion to anon;
grant select, insert, update, delete on public.pos_facturacion to authenticated;
grant all on public.pos_facturacion to service_role;

alter table public.pos_facturacion enable row level security;

create policy "lectura publica"
  on public.pos_facturacion for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_facturacion for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 23. pos_movimientos_inventario
-- ============================================================
create table public.pos_movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  tipo_movimiento text not null check (tipo_movimiento in (
    'entrada_compra', 'salida_venta', 'ajuste_incremento', 'ajuste_decremento',
    'devolucion_compra', 'devolucion_venta', 'transferencia_salida',
    'transferencia_entrada', 'merma'
  )),
  cantidad int not null,
  motivo text,
  referencia text,
  notas text,
  fecha timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_pos_movimientos_inventario_producto_detalle_id on public.pos_movimientos_inventario(producto_detalle_id);
create index idx_pos_movimientos_inventario_created_by on public.pos_movimientos_inventario(created_by);

create trigger trg_pos_movimientos_inventario_updated_at
  before update on public.pos_movimientos_inventario
  for each row execute function public.update_updated_at();

grant select on public.pos_movimientos_inventario to anon;
grant select, insert, update, delete on public.pos_movimientos_inventario to authenticated;
grant all on public.pos_movimientos_inventario to service_role;

alter table public.pos_movimientos_inventario enable row level security;

create policy "lectura publica"
  on public.pos_movimientos_inventario for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_movimientos_inventario for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- FASE 5: FINANCIERO
-- ============================================================

-- ============================================================
-- 24. pos_finanzas_mensuales
-- ============================================================
create table public.pos_finanzas_mensuales (
  id uuid primary key default gen_random_uuid(),
  anio int not null,
  mes int not null check (mes between 1 and 12),
  ventas_brutas numeric,
  devoluciones numeric,
  descuentos numeric,
  ventas_netas numeric,
  costo_mercaderia_vendida numeric,
  gastos_operativos_total numeric,
  inversion_marketing numeric,
  otros_ingresos numeric,
  otros_gastos numeric,
  utilidad_bruta numeric,
  utilidad_neta numeric,
  roi_calculado numeric,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz,
  compras_total numeric,
  costos_comision_total numeric default 0
);

create unique index uk_pos_finanzas_mensuales_periodo on public.pos_finanzas_mensuales(anio, mes);
create index idx_pos_finanzas_mensuales_created_by on public.pos_finanzas_mensuales(created_by);
create index idx_pos_finanzas_mensuales_updated_by on public.pos_finanzas_mensuales(updated_by);

create trigger trg_pos_finanzas_mensuales_updated_at
  before update on public.pos_finanzas_mensuales
  for each row execute function public.update_updated_at();

grant select on public.pos_finanzas_mensuales to anon;
grant select, insert, update, delete on public.pos_finanzas_mensuales to authenticated;
grant all on public.pos_finanzas_mensuales to service_role;

alter table public.pos_finanzas_mensuales enable row level security;

create policy "lectura publica"
  on public.pos_finanzas_mensuales for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_finanzas_mensuales for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 25. pos_gastos_mensuales_detalle
-- ============================================================
create table public.pos_gastos_mensuales_detalle (
  id uuid primary key default gen_random_uuid(),
  anio int not null,
  mes int not null check (mes between 1 and 12),
  categoria_id uuid not null references public.pos_gasto_categorias(id),
  monto numeric,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz,
  venta_id uuid references public.pos_ventas(id)
);

create index idx_pos_gastos_mensuales_detalle_categoria_id on public.pos_gastos_mensuales_detalle(categoria_id);
create index idx_pos_gastos_mensuales_detalle_venta_id on public.pos_gastos_mensuales_detalle(venta_id);
create index idx_pos_gastos_mensuales_detalle_created_by on public.pos_gastos_mensuales_detalle(created_by);
create index idx_pos_gastos_mensuales_detalle_updated_by on public.pos_gastos_mensuales_detalle(updated_by);

create trigger trg_pos_gastos_mensuales_detalle_updated_at
  before update on public.pos_gastos_mensuales_detalle
  for each row execute function public.update_updated_at();

grant select on public.pos_gastos_mensuales_detalle to anon;
grant select, insert, update, delete on public.pos_gastos_mensuales_detalle to authenticated;
grant all on public.pos_gastos_mensuales_detalle to service_role;

alter table public.pos_gastos_mensuales_detalle enable row level security;

create policy "lectura publica"
  on public.pos_gastos_mensuales_detalle for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.pos_gastos_mensuales_detalle for all
  to authenticated
  using (true)
  with check (true);


-- ============================================================
-- FASE 6: MODULO STORE (10 tablas st_*)
-- ============================================================

-- ============================================================
-- 26. st_cupones
-- ============================================================
create table public.st_cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  tipo text not null check (tipo in ('porcentaje', 'monto_fijo', 'envio_gratis')),
  valor numeric not null,
  monto_minimo numeric,
  fecha_inicio date,
  fecha_fin date,
  usos_maximos int default 0,
  usos_actuales int default 0,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create trigger trg_st_cupones_updated_at
  before update on public.st_cupones
  for each row execute function public.update_updated_at();

grant select on public.st_cupones to anon;
grant select, insert, update, delete on public.st_cupones to authenticated;
grant all on public.st_cupones to service_role;

alter table public.st_cupones enable row level security;

create policy "lectura publica"
  on public.st_cupones for select
  to anon, authenticated
  using (true);

create policy "escritura authenticated"
  on public.st_cupones for all
  to authenticated
  using (true)
  with check (true);

create unique index uk_st_cupones_codigo on public.st_cupones(codigo);
create index idx_st_cupones_created_by on public.st_cupones(created_by);

-- ============================================================
-- 27. st_direcciones
-- ============================================================
create table public.st_direcciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.pos_clientes(id),
  tipo text default 'ambas' check (tipo in ('envio', 'facturacion', 'ambas')),
  nombre_destinatario text,
  telefono text,
  direccion text not null,
  ciudad text not null,
  departamento text not null,
  codigo_postal text,
  pais text default 'Colombia',
  instrucciones text,
  principal boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_direcciones_cliente_id on public.st_direcciones(cliente_id);

create trigger trg_st_direcciones_updated_at
  before update on public.st_direcciones
  for each row execute function public.update_updated_at();

grant select on public.st_direcciones to anon;
grant select, insert, update, delete on public.st_direcciones to authenticated;
grant all on public.st_direcciones to service_role;

alter table public.st_direcciones enable row level security;

create policy "clientes ven sus propias direcciones"
  on public.st_direcciones for select
  to authenticated
  using (cliente_id = auth.uid());

create policy "clientes insertan sus direcciones"
  on public.st_direcciones for insert
  to authenticated
  with check (cliente_id = auth.uid());

create policy "clientes actualizan sus direcciones"
  on public.st_direcciones for update
  to authenticated
  using (cliente_id = auth.uid())
  with check (cliente_id = auth.uid());

create policy "clientes eliminan sus direcciones"
  on public.st_direcciones for delete
  to authenticated
  using (cliente_id = auth.uid());

-- ============================================================
-- 28. st_carritos
-- ============================================================
create table public.st_carritos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.pos_clientes(id),
  session_id text,
  fecha_creacion timestamptz default now(),
  fecha_actualizacion timestamptz default now(),
  estado text default 'ACTIVO' check (estado in ('ACTIVO', 'CONVERTIDO', 'ABANDONADO')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_carritos_cliente_id on public.st_carritos(cliente_id);

create trigger trg_st_carritos_updated_at
  before update on public.st_carritos
  for each row execute function public.update_updated_at();

grant select on public.st_carritos to anon;
grant select, insert, update, delete on public.st_carritos to authenticated;
grant all on public.st_carritos to service_role;

alter table public.st_carritos enable row level security;

create policy "clientes ven sus carritos"
  on public.st_carritos for select
  to authenticated
  using (cliente_id = auth.uid());

create policy "clientes insertan carritos"
  on public.st_carritos for insert
  to authenticated
  with check (cliente_id = auth.uid());

create policy "clientes actualizan carritos"
  on public.st_carritos for update
  to authenticated
  using (cliente_id = auth.uid())
  with check (cliente_id = auth.uid());

create policy "clientes eliminan sus carritos"
  on public.st_carritos for delete
  to authenticated
  using (cliente_id = auth.uid());

-- ============================================================
-- 29. st_carritos_detalle
-- ============================================================
create table public.st_carritos_detalle (
  id uuid primary key default gen_random_uuid(),
  carrito_id uuid not null references public.st_carritos(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_carritos_detalle_carrito_id on public.st_carritos_detalle(carrito_id);
create index idx_st_carritos_detalle_producto_detalle_id on public.st_carritos_detalle(producto_detalle_id);

create trigger trg_st_carritos_detalle_updated_at
  before update on public.st_carritos_detalle
  for each row execute function public.update_updated_at();

grant select on public.st_carritos_detalle to anon;
grant select, insert, update, delete on public.st_carritos_detalle to authenticated;
grant all on public.st_carritos_detalle to service_role;

alter table public.st_carritos_detalle enable row level security;

create policy "clientes ven detalles de su carrito"
  on public.st_carritos_detalle for select
  to authenticated
  using (
    carrito_id in (
      select id from public.st_carritos where cliente_id = auth.uid()
    )
  );

create policy "clientes gestionan su carrito"
  on public.st_carritos_detalle for all
  to authenticated
  using (
    carrito_id in (
      select id from public.st_carritos where cliente_id = auth.uid()
    )
  )
  with check (
    carrito_id in (
      select id from public.st_carritos where cliente_id = auth.uid()
    )
  );

-- ============================================================
-- 30. st_pedidos
-- ============================================================
create table public.st_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_pedido text,
  cliente_id uuid not null references public.pos_clientes(id),
  canal_id uuid not null references public.pos_canales_venta(id),
  venta_id uuid references public.pos_ventas(id),
  direccion_envio_id uuid references public.st_direcciones(id),
  direccion_facturacion_id uuid references public.st_direcciones(id),
  fecha_pedido date not null,
  estado text default 'PENDIENTE' check (estado in (
    'PENDIENTE', 'PAGADO', 'CONFIRMADO', 'ENVIADO', 'ENTREGADO',
    'CANCELADO', 'DEVUELTO'
  )),
  subtotal numeric,
  descuento numeric,
  impuesto numeric,
  costo_envio numeric,
  total numeric,
  cupon_id uuid references public.st_cupones(id),
  metodo_pago_id uuid references public.pos_metodos_pago(id),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.pos_usuarios(id),
  updated_by uuid references public.pos_usuarios(id),
  deleted_at timestamptz
);

create index idx_st_pedidos_cliente_id on public.st_pedidos(cliente_id);
create index idx_st_pedidos_canal_id on public.st_pedidos(canal_id);
create index idx_st_pedidos_venta_id on public.st_pedidos(venta_id);
create index idx_st_pedidos_direccion_envio_id on public.st_pedidos(direccion_envio_id);
create index idx_st_pedidos_direccion_facturacion_id on public.st_pedidos(direccion_facturacion_id);
create index idx_st_pedidos_cupon_id on public.st_pedidos(cupon_id);
create index idx_st_pedidos_metodo_pago_id on public.st_pedidos(metodo_pago_id);
create index idx_st_pedidos_created_by on public.st_pedidos(created_by);
create index idx_st_pedidos_updated_by on public.st_pedidos(updated_by);

create trigger trg_st_pedidos_updated_at
  before update on public.st_pedidos
  for each row execute function public.update_updated_at();

grant select on public.st_pedidos to anon;
grant select, insert, update, delete on public.st_pedidos to authenticated;
grant all on public.st_pedidos to service_role;

alter table public.st_pedidos enable row level security;

create policy "clientes ven sus pedidos"
  on public.st_pedidos for select
  to authenticated
  using (cliente_id = auth.uid());

create policy "admins ven todos los pedidos"
  on public.st_pedidos for select
  to authenticated
  using (true);

create policy "clientes crean pedidos"
  on public.st_pedidos for insert
  to authenticated
  with check (cliente_id = auth.uid());

create policy "admins actualizan pedidos"
  on public.st_pedidos for update
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 31. st_pedidos_detalle
-- ============================================================
create table public.st_pedidos_detalle (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.st_pedidos(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric,
  descuento numeric,
  tasa_impuesto numeric,
  subtotal numeric,
  impuesto numeric,
  total numeric,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_pedidos_detalle_pedido_id on public.st_pedidos_detalle(pedido_id);
create index idx_st_pedidos_detalle_producto_detalle_id on public.st_pedidos_detalle(producto_detalle_id);

grant select on public.st_pedidos_detalle to anon;
grant select, insert, update, delete on public.st_pedidos_detalle to authenticated;
grant all on public.st_pedidos_detalle to service_role;

alter table public.st_pedidos_detalle enable row level security;

create policy "clientes ven detalle de sus pedidos"
  on public.st_pedidos_detalle for select
  to authenticated
  using (
    pedido_id in (
      select id from public.st_pedidos where cliente_id = auth.uid()
    )
  );

create policy "admins gestionan detalle de pedidos"
  on public.st_pedidos_detalle for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 32. st_envios
-- ============================================================
create table public.st_envios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.st_pedidos(id),
  direccion_id uuid references public.st_direcciones(id),
  transportadora text not null,
  numero_guia text not null,
  estado text default 'PREPARACION' check (estado in (
    'PREPARACION', 'DESPACHADO', 'EN_TRANSITO', 'ENTREGADO', 'FALLIDO'
  )),
  fecha_envio date,
  fecha_estimada_entrega date,
  fecha_entrega date,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_envios_pedido_id on public.st_envios(pedido_id);
create index idx_st_envios_direccion_id on public.st_envios(direccion_id);

create trigger trg_st_envios_updated_at
  before update on public.st_envios
  for each row execute function public.update_updated_at();

grant select on public.st_envios to anon;
grant select, insert, update, delete on public.st_envios to authenticated;
grant all on public.st_envios to service_role;

alter table public.st_envios enable row level security;

create policy "clientes ven envios de sus pedidos"
  on public.st_envios for select
  to authenticated
  using (
    pedido_id in (
      select id from public.st_pedidos where cliente_id = auth.uid()
    )
  );

create policy "admins gestionan envios"
  on public.st_envios for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 33. st_resenas
-- ============================================================
create table public.st_resenas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.pos_productos(id),
  producto_detalle_id uuid references public.pos_productos_detalle(id),
  cliente_id uuid not null references public.pos_clientes(id),
  pedido_id uuid not null references public.st_pedidos(id),
  calificacion int not null check (calificacion between 1 and 5),
  comentario text,
  aprobada boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_st_resenas_producto_id on public.st_resenas(producto_id);
create index idx_st_resenas_producto_detalle_id on public.st_resenas(producto_detalle_id);
create index idx_st_resenas_cliente_id on public.st_resenas(cliente_id);
create index idx_st_resenas_pedido_id on public.st_resenas(pedido_id);

create trigger trg_st_resenas_updated_at
  before update on public.st_resenas
  for each row execute function public.update_updated_at();

grant select on public.st_resenas to anon;
grant select, insert, update, delete on public.st_resenas to authenticated;
grant all on public.st_resenas to service_role;

alter table public.st_resenas enable row level security;

create policy "lectura publica de reseñas aprobadas"
  on public.st_resenas for select
  to anon
  using (aprobada = true);

create policy "clientes ven sus reseñas"
  on public.st_resenas for select
  to authenticated
  using (true);

create policy "clientes crean reseñas"
  on public.st_resenas for insert
  to authenticated
  with check (cliente_id = auth.uid());

create policy "clientes actualizan sus reseñas"
  on public.st_resenas for update
  to authenticated
  using (cliente_id = auth.uid())
  with check (cliente_id = auth.uid());

-- ============================================================
-- 34. st_pagos_online
-- ============================================================
create table public.st_pagos_online (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.st_pedidos(id),
  pasarela text not null,
  id_transaccion text not null,
  estado text default 'PENDIENTE' check (estado in (
    'PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO', 'FALLIDO'
  )),
  monto numeric not null,
  moneda text default 'COP',
  respuesta_pasarela jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_st_pagos_online_pedido_id on public.st_pagos_online(pedido_id);

create trigger trg_st_pagos_online_updated_at
  before update on public.st_pagos_online
  for each row execute function public.update_updated_at();

grant select on public.st_pagos_online to anon;
grant select, insert, update, delete on public.st_pagos_online to authenticated;
grant all on public.st_pagos_online to service_role;

alter table public.st_pagos_online enable row level security;

create policy "clientes ven pagos de sus pedidos"
  on public.st_pagos_online for select
  to authenticated
  using (
    pedido_id in (
      select id from public.st_pedidos where cliente_id = auth.uid()
    )
  );

create policy "admins gestionan pagos"
  on public.st_pagos_online for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 35. st_wishlist
-- ============================================================
create table public.st_wishlist (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.pos_clientes(id),
  producto_detalle_id uuid not null references public.pos_productos_detalle(id),
  fecha_agregado date default current_date,
  created_at timestamptz default now()
);

create unique index uk_st_wishlist_cliente_producto on public.st_wishlist(cliente_id, producto_detalle_id);
create index idx_st_wishlist_cliente_id on public.st_wishlist(cliente_id);
create index idx_st_wishlist_producto_detalle_id on public.st_wishlist(producto_detalle_id);

grant select on public.st_wishlist to anon;
grant select, insert, update, delete on public.st_wishlist to authenticated;
grant all on public.st_wishlist to service_role;

alter table public.st_wishlist enable row level security;

create policy "clientes ven su wishlist"
  on public.st_wishlist for select
  to authenticated
  using (cliente_id = auth.uid());

create policy "clientes gestionan su wishlist"
  on public.st_wishlist for all
  to authenticated
  using (cliente_id = auth.uid())
  with check (cliente_id = auth.uid());


-- ============================================================
-- DATOS SEMILLA: CANALES DE VENTA
-- ============================================================
insert into public.pos_canales_venta (nombre, codigo, descripcion, comision_porcentaje, tipo) values
  ('Fisico', 'fisico', 'Punto de venta presencial', 0, 'fisico'),
  ('Web', 'web', 'Tienda virtual propia', 0, 'web_propio'),
  ('MercadoLibre', 'mercadolibre', 'Integracion con MercadoLibre', 17, 'marketplace'),
  ('Exito.com', 'exito', 'Integracion con Exito.com', 15, 'marketplace'),
  ('Falabella.com', 'falabella', 'Integracion con Falabella.com', 15, 'marketplace')
on conflict (codigo) do nothing;

-- ============================================================
-- FIN DEL ESQUEMA
-- 35 tablas | 25 pos_* + 10 st_*
-- ============================================================
