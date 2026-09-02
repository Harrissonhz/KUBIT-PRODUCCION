-- ============================================================
-- 04-rpcs-ventas.sql — RPCs criticos para el POS (ventas)
-- ============================================================
-- PROBLEMA QUE RESUELVE:
--   apps/pos/js/paginas/ventas.js:635            → rpc('generar_consecutivo', {p_entidad:'VENTA', p_prefijo:'KBT'})
--   apps/pos/js/paginas/ventas-rapido.js:449     → mismo contrato
--   apps/pos/js/compartido/database.js:1277      → rpc('actualizar_finanzas_mensuales', {p_anio,p_mes,...})
--   Sin estas funciones Supabase responde 404 PGRST202 y bloquea ventas.
--
-- HISTORIA:
--   El schema base (01-schema.sql, 35 tablas) nunca las versiono.
--   Se detecto en cliente NexoraShop (2026-05) y en HSM_FamilySportMALO
--   donde se parcheo como FASE 7. Este archivo es el parche canonico
--   para el TEMPLATE — debe copiarse a cada nuevo cliente.
--
-- USO:
--   Ejecutar DESPUES de 01-schema.sql y 03-seed-store-grants.sql.
--   Es idempotente (create table if not exists / create or replace function).
--   Incluirlo en 00-bootstrap.sql PASO 4 para fresh deploy.
--
-- CONTRATO FRONTEND (no cambiar sin actualizar JS):
--   generar_consecutivo({p_entidad:'VENTA', p_prefijo:'KBT'}) → "KBT-2026-00001"
--   actualizar_finanzas_mensuales({p_anio,p_mes,p_venta_bruta,p_descuento,p_costo_comision,p_costo_mercaderia}) → void
-- ============================================================

-- ============================================================
-- 1. Tabla pos_consecutivos (backing de generar_consecutivo)
-- ============================================================
create table if not exists public.pos_consecutivos (
  entidad text not null,
  anio int not null,
  ultimo bigint not null default 0,
  primary key (entidad, anio)
);

grant select, insert, update, delete on public.pos_consecutivos to authenticated;
grant all on public.pos_consecutivos to service_role;

alter table public.pos_consecutivos enable row level security;

drop policy if exists "lectura authenticated" on public.pos_consecutivos;
create policy "lectura authenticated"
  on public.pos_consecutivos for select
  to authenticated
  using (true);

drop policy if exists "escritura authenticated" on public.pos_consecutivos;
create policy "escritura authenticated"
  on public.pos_consecutivos for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 2. RPC generar_consecutivo(p_entidad, p_prefijo) returns text
-- ============================================================
create or replace function public.generar_consecutivo(
  p_entidad text,
  p_prefijo text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio int := extract(year from now());
  v_ultimo bigint;
begin
  insert into public.pos_consecutivos (entidad, anio, ultimo)
  values (p_entidad, v_anio, 1)
  on conflict (entidad, anio)
  do update set ultimo = public.pos_consecutivos.ultimo + 1
  returning ultimo into v_ultimo;

  return p_prefijo || '-' || v_anio || '-' || lpad(v_ultimo::text, 5, '0');
end;
$$;

grant execute on function public.generar_consecutivo(text, text) to authenticated;
grant execute on function public.generar_consecutivo(text, text) to service_role;

comment on function public.generar_consecutivo(text, text) is 'RPC critica POS: generar_consecutivo({p_entidad:''VENTA'', p_prefijo:''KBT''}) → numero_venta.';

-- ============================================================
-- 3. RPC actualizar_finanzas_mensuales(...) returns void
-- ============================================================
create or replace function public.actualizar_finanzas_mensuales(
  p_anio int,
  p_mes int,
  p_venta_bruta numeric,
  p_descuento numeric,
  p_costo_comision numeric,
  p_costo_mercaderia numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pos_finanzas_mensuales (
    anio, mes, ventas_brutas, descuentos, ventas_netas,
    costos_comision_total, costo_mercaderia_vendida
  ) values (
    p_anio, p_mes, p_venta_bruta, p_descuento,
    p_venta_bruta - p_descuento,
    p_costo_comision, p_costo_mercaderia
  )
  on conflict (anio, mes) do update set
    ventas_brutas = public.pos_finanzas_mensuales.ventas_brutas + excluded.ventas_brutas,
    descuentos    = public.pos_finanzas_mensuales.descuentos + excluded.descuentos,
    costos_comision_total = public.pos_finanzas_mensuales.costos_comision_total + excluded.costos_comision_total,
    costo_mercaderia_vendida = public.pos_finanzas_mensuales.costo_mercaderia_vendida + excluded.costo_mercaderia_vendida,
    ventas_netas  = (public.pos_finanzas_mensuales.ventas_brutas + excluded.ventas_brutas)
                  - (public.pos_finanzas_mensuales.descuentos + excluded.descuentos)
                  - coalesce(public.pos_finanzas_mensuales.devoluciones, 0),
    updated_at    = now();

  update public.pos_finanzas_mensuales
     set utilidad_bruta = ventas_netas - costo_mercaderia_vendida,
         utilidad_neta  = ventas_netas - costo_mercaderia_vendida
                        - coalesce(gastos_operativos_total, 0)
                        - costos_comision_total
                        - coalesce(otros_gastos, 0)
   where anio = p_anio and mes = p_mes;
end;
$$;

grant execute on function public.actualizar_finanzas_mensuales(int, int, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.actualizar_finanzas_mensuales(int, int, numeric, numeric, numeric, numeric) to service_role;

comment on function public.actualizar_finanzas_mensuales(int, int, numeric, numeric, numeric, numeric) is 'RPC critica POS: acumula venta en pos_finanzas_mensuales por (anio,mes). Soporta negativos para anulacion.';

-- Verificacion: select public.generar_consecutivo('VENTA','KBT');
