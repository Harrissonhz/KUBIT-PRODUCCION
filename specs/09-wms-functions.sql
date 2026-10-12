-- ============================================================
-- 09-wms-functions.sql — Funciones (RPC) atomicas del modulo WMS  (v2)
-- Motor: PostgreSQL 15+ (Supabase)
-- Base spec: specs/07-wms-spec.md (v6)   |   Esquema: specs/08-wms-schema.sql
--
-- DECISIONES APLICADAS (confirmadas con el usuario):
--   D1. El WMS lee UN solo registro de eventos: pos_movimientos_inventario.
--       Su id es la clave anti-duplicados (wms_movimientos.ref_pos_movimiento_id).
--   D2. ANULACION / EDICION de ventas: FUERA de este archivo (se hara despues).
--       Esos eventos quedan como 'NO_SOPORTADO'.
--   D3. Anti-eco: lo que el WMS inserta en el POS (ajustes, merma) queda con
--       ref_pos_movimiento_id y referencia = 'WMS' -> nunca se relee.
--   D4. Las ventas de la Tienda Virtual entran por el mismo flujo (salida_venta).
--
-- CAMBIOS v2 (segun pruebas en ambiente de pruebas, 2026-09-29):
--   D5. Productos DIGITALES (pos_productos.tipo_producto = 'Digital') quedan
--       FUERA del WMS: no se cargan, no se sincronizan, no se reconcilian.
--       tipo_producto NULL o 'Fisico' se tratan como fisicos.
--   D6. Referencias reales del POS:
--       - salida_venta: referencia = numero de venta (ej. 'V-20251216-0074').
--         En ventas nuevas la referencia llega NULL y el numero viene en el
--         motivo ('Venta #KBT-2026-00001'). Se resuelven ambos casos.
--       - entrada_compra: referencia = 'OC-<numero_orden>' (ej. 'OC-76').
--
-- CONVENCIONES (iguales a 04-rpcs-ventas.sql):
--   security definer + set search_path = public
--   grant execute solo a authenticated y service_role (nunca anon)
--   Funciones internas con prefijo _wms_ (no expuestas a la app)
--
-- CANTIDADES: en wms_movimientos la cantidad SIEMPRE es positiva; la
-- direccion la indican fase_origen / fase_destino.
--
-- ORDEN DE USO (instalacion nueva):
--   1. Ejecutar este archivo (despues de 08-wms-schema.sql).
--   2. Ejecutar UNA sola vez:  select * from public.wms_inicializar();
--   3. Desde la app: wms_sincronizar() al abrir las bandejas.
--
-- Idempotente: create or replace / if not exists.
-- ============================================================


-- ============================================================
-- SECCION 0. COMPLEMENTOS DE ESQUEMA
-- ============================================================

-- 0.1 Linea base de la sincronizacion: movimientos POS anteriores al
-- arranque del WMS (su efecto ya esta en el stock cargado como SIN_UBICAR).
create table if not exists public.wms_pos_linea_base (
  pos_movimiento_id uuid primary key,
  registrado_at timestamptz default now()
);
grant select on public.wms_pos_linea_base to authenticated;
grant all on public.wms_pos_linea_base to service_role;
alter table public.wms_pos_linea_base enable row level security;
drop policy if exists "lectura authenticated" on public.wms_pos_linea_base;
create policy "lectura authenticated"
  on public.wms_pos_linea_base for select
  to authenticated
  using (true);

-- 0.2 Indice para la clave anti-duplicados (D1)
create index if not exists idx_wms_mov_ref_pos_movimiento
  on public.wms_movimientos(ref_pos_movimiento_id);

-- 0.3 Una sola fila de stock por (SKU, ubicacion, estado).
create unique index if not exists uk_wms_stock_clave
  on public.wms_stock_ubicacion (
    producto_detalle_id,
    coalesce(ubicacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    estado_fase
  )
  where deleted_at is null;

-- 0.4 Limpieza de objetos de la v1 que cambiaron de firma o de columnas.
-- "create or replace view" no permite cambiar el orden ni el nombre de las
-- columnas, por eso las vistas de apoyo se eliminan y se recrean abajo.
-- Orden: primero las que dependen de wms_v_ubicaciones_ruta.
drop view if exists public.wms_v_despacho_pendiente;
drop view if exists public.wms_v_stock_detalle;
drop view if exists public.wms_v_ubicaciones_ruta;
drop view if exists public.wms_v_pos_pendientes;
drop function if exists public._wms_ref_venta(text);
drop function if exists public.wms_inicializar(uuid);


-- ============================================================
-- SECCION 1. FUNCIONES INTERNAS (_wms_*)
-- ============================================================

-- 1.1 Usuario de auditoria (recibido o de la sesion), solo si existe en pos_usuarios
create or replace function public._wms_usuario(p_usuario uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from public.pos_usuarios u
   where u.id = coalesce(p_usuario, auth.uid())
     and u.deleted_at is null
$$;

-- 1.2 Texto -> uuid si es valido; si no, NULL
create or replace function public._wms_uuid_o_null(p_texto text)
returns uuid
language sql
immutable
as $$
  select case
    when p_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p_texto::uuid
  end
$$;

-- 1.3 ¿El SKU es un producto digital? (D5)
create or replace function public._wms_es_digital(p_sku uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.pos_productos_detalle pd
      join public.pos_productos p on p.id = pd.producto_id
     where pd.id = p_sku
       and p.tipo_producto = 'Digital'
  )
$$;

-- 1.4 Bloquea operaciones del WMS sobre productos digitales (D5)
create or replace function public._wms_validar_fisico(p_sku uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public._wms_es_digital(p_sku) then
    raise exception 'WMS: el producto es digital y no se gestiona en el WMS';
  end if;
end;
$$;

-- 1.5 Resuelve la venta de un movimiento POS (D6).
-- Orden: referencia como uuid -> referencia como numero_venta ->
-- numero tomado del motivo ('Venta #KBT-2026-00001').
-- Si hubiera numeros repetidos, prefiere la venta no anulada mas reciente.
create or replace function public._wms_ref_venta(p_referencia text, p_motivo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select v.id from public.pos_ventas v
      where v.id = public._wms_uuid_o_null(p_referencia)),
    (select v.id from public.pos_ventas v
      where v.numero_venta = trim(p_referencia)
        and v.deleted_at is null
      order by (v.estado = 'ANULADA'), v.created_at desc
      limit 1),
    (select v.id from public.pos_ventas v
      where v.numero_venta = trim(substring(p_motivo from '#\s*(\S+)'))
        and v.deleted_at is null
      order by (v.estado = 'ANULADA'), v.created_at desc
      limit 1)
  )
$$;

-- 1.6 Resuelve la compra de un movimiento POS (D6): uuid o 'OC-<numero_orden>'.
-- numero_orden es correlativo por anio: se toma la orden mas reciente creada
-- antes del movimiento. Solo es trazabilidad: si no la encuentra, NULL.
create or replace function public._wms_ref_compra(p_referencia text, p_fecha timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.id from public.pos_compras c
      where c.id = public._wms_uuid_o_null(p_referencia)),
    (select c.id from public.pos_compras c
      where c.numero_orden = (substring(p_referencia from '^\s*OC-(\d+)\s*$'))::int
        and c.deleted_at is null
        and c.created_at <= coalesce(p_fecha, now())
      order by c.created_at desc
      limit 1)
  )
$$;

-- 1.7 Suma/resta cantidad a la fila (SKU, ubicacion, estado).
-- Nunca deja cantidad negativa: si no alcanza, error (se revierte todo).
create or replace function public._wms_stock_mover(
  p_sku uuid,
  p_ubicacion uuid,
  p_fase text,
  p_delta int,
  p_usr uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cant int;
  v_bodega uuid;
begin
  if p_delta is null or p_delta = 0 then
    return;
  end if;

  if p_ubicacion is not null then
    select bodega_id into v_bodega
      from public.wms_ubicaciones
     where id = p_ubicacion;
  end if;

  select s.id, s.cantidad into v_id, v_cant
    from public.wms_stock_ubicacion s
   where s.producto_detalle_id = p_sku
     and s.ubicacion_id is not distinct from p_ubicacion
     and s.estado_fase = p_fase
     and s.deleted_at is null
   for update;

  if v_id is null then
    if p_delta < 0 then
      raise exception 'WMS: stock insuficiente en % (disponible 0, requerido %)', p_fase, -p_delta;
    end if;
    insert into public.wms_stock_ubicacion
      (producto_detalle_id, ubicacion_id, bodega_id, estado_fase, cantidad, created_by, updated_by)
    values
      (p_sku, p_ubicacion, v_bodega, p_fase, p_delta, p_usr, p_usr);
  else
    if v_cant + p_delta < 0 then
      raise exception 'WMS: stock insuficiente en % (disponible %, requerido %)', p_fase, v_cant, -p_delta;
    end if;
    update public.wms_stock_ubicacion
       set cantidad = v_cant + p_delta,
           updated_by = p_usr
     where id = v_id;
  end if;
end;
$$;

-- 1.8 Busca una ubicacion por su codigo de 5 digitos y valida que exista,
-- este activa y pueda alojar stock (es_hoja).
create or replace function public._wms_ubicacion_por_codigo(p_codigo text)
returns public.wms_ubicaciones
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_u public.wms_ubicaciones;
begin
  select * into v_u
    from public.wms_ubicaciones
   where codigo = trim(p_codigo)
     and deleted_at is null;

  if not found then
    raise exception 'WMS: la ubicacion % no existe', p_codigo;
  end if;
  if not coalesce(v_u.activo, false) then
    raise exception 'WMS: la ubicacion % esta inactiva', p_codigo;
  end if;
  if not v_u.es_hoja then
    raise exception 'WMS: la ubicacion % (%) no aloja stock. Use una caja, bolsa o zona suelta', p_codigo, v_u.tipo;
  end if;

  return v_u;
end;
$$;

-- 1.9 Regla mono-SKU (CAJA / BOLSA): un solo producto por contenedor.
create or replace function public._wms_validar_mono_sku(p_ubicacion uuid, p_sku uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.wms_ubicaciones;
begin
  select * into v_u
    from public.wms_ubicaciones
   where id = p_ubicacion
   for update;

  if not v_u.mono_sku then
    return;
  end if;

  if v_u.producto_detalle_id is not null and v_u.producto_detalle_id <> p_sku then
    raise exception 'WMS: la ubicacion % es mono-SKU y ya esta asignada a otro producto', v_u.codigo;
  end if;

  if exists (
    select 1 from public.wms_stock_ubicacion
     where ubicacion_id = p_ubicacion
       and producto_detalle_id <> p_sku
       and estado_fase in ('UBICADO', 'RESERVADO')
       and cantidad > 0
       and deleted_at is null
  ) then
    raise exception 'WMS: la ubicacion % es mono-SKU y contiene otro producto', v_u.codigo;
  end if;

  if v_u.producto_detalle_id is null then
    update public.wms_ubicaciones
       set producto_detalle_id = p_sku
     where id = p_ubicacion;
  end if;
end;
$$;

-- 1.10 Libera el SKU asignado a un contenedor mono-SKU cuando queda vacio
create or replace function public._wms_liberar_mono_sku(p_ubicacion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ubicacion is null then
    return;
  end if;

  update public.wms_ubicaciones u
     set producto_detalle_id = null
   where u.id = p_ubicacion
     and u.mono_sku
     and not exists (
       select 1 from public.wms_stock_ubicacion s
        where s.ubicacion_id = p_ubicacion
          and s.estado_fase in ('UBICADO', 'RESERVADO')
          and s.cantidad > 0
          and s.deleted_at is null
     );
end;
$$;

-- 1.11 Propaga un ajuste/merma originado en el WMS hacia el POS.
-- Devuelve el id del movimiento POS (se guarda como ref -> anti-eco, D3).
create or replace function public._wms_ajuste_pos(
  p_sku uuid,
  p_delta int,
  p_tipo text,          -- 'ajuste_incremento' | 'ajuste_decremento' | 'merma'
  p_motivo text,
  p_usr uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
  v_id uuid;
begin
  select stock_actual into v_stock
    from public.pos_productos_detalle
   where id = p_sku
   for update;

  if not found then
    raise exception 'WMS: el producto % no existe en el POS', p_sku;
  end if;

  if coalesce(v_stock, 0) + p_delta < 0 then
    raise exception 'WMS: el ajuste dejaria stock negativo en el POS (actual %, ajuste %)', v_stock, p_delta;
  end if;

  update public.pos_productos_detalle
     set stock_actual = coalesce(stock_actual, 0) + p_delta,
         updated_by = p_usr
   where id = p_sku;

  insert into public.pos_movimientos_inventario
    (producto_detalle_id, tipo_movimiento, cantidad, motivo, referencia, notas, created_by)
  values
    (p_sku, p_tipo, abs(p_delta), p_motivo, 'WMS', 'Generado por Kubit-WMS', p_usr)
  returning id into v_id;

  return v_id;
end;
$$;

-- 1.12 Procesa UN evento del POS. Idempotente.
--   entrada_compra     -> ENTRADA  : +SIN_UBICAR
--   ajuste_incremento  -> AJUSTE   : +SIN_UBICAR
--   salida_venta       -> RESERVA  : UBICADO/SIN_UBICAR -> RESERVADO (todo o nada)
--   ajuste_decremento  -> AJUSTE   : -SIN_UBICAR (si no alcanza: requiere contenedor)
--   merma              -> BAJA     : SIN_UBICAR -> BAJA (si no alcanza: requiere contenedor)
create or replace function public._wms_procesar_evento(p_pos_mov uuid, p_usr uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  r record;
  v_cant int;
  v_ref uuid;
  v_disp int;
  v_rest int;
  v_take int;
begin
  select * into m
    from public.pos_movimientos_inventario
   where id = p_pos_mov
   for update;

  if not found then
    raise exception 'WMS: el movimiento POS % no existe', p_pos_mov;
  end if;

  -- Idempotencia (D1)
  if exists (select 1 from public.wms_movimientos where ref_pos_movimiento_id = p_pos_mov)
     or exists (select 1 from public.wms_pos_linea_base where pos_movimiento_id = p_pos_mov) then
    return;
  end if;

  -- Productos digitales no se gestionan en el WMS (D5)
  if public._wms_es_digital(m.producto_detalle_id) then
    return;
  end if;

  v_cant := abs(m.cantidad);
  if v_cant = 0 then
    raise exception 'WMS: el movimiento POS tiene cantidad 0';
  end if;

  -- ---------------- ENTRADAS ----------------
  if m.tipo_movimiento in ('entrada_compra', 'ajuste_incremento') then
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', v_cant, p_usr);

    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad, fase_destino,
       ref_pos_movimiento_id, ref_pos_compra_id, motivo, created_by)
    values
      (m.producto_detalle_id,
       case when m.tipo_movimiento = 'entrada_compra' then 'ENTRADA' else 'AJUSTE' end,
       v_cant, 'SIN_UBICAR',
       p_pos_mov,
       case when m.tipo_movimiento = 'entrada_compra'
            then public._wms_ref_compra(m.referencia, m.fecha) end,
       'POS: ' || m.tipo_movimiento, p_usr);

  -- ---------------- VENTA -> RESERVA ----------------
  elsif m.tipo_movimiento = 'salida_venta' then
    -- Sin venta identificada no se puede despachar -> queda PENDIENTE (D6)
    v_ref := public._wms_ref_venta(m.referencia, m.motivo);
    if v_ref is null then
      raise exception 'WMS: no se encontro la venta (referencia "%", motivo "%")',
        coalesce(m.referencia, 'vacia'), coalesce(m.motivo, 'vacio');
    end if;

    select coalesce(sum(cantidad), 0) into v_disp
      from public.wms_stock_ubicacion
     where producto_detalle_id = m.producto_detalle_id
       and estado_fase in ('UBICADO', 'SIN_UBICAR')
       and deleted_at is null;

    if v_disp < v_cant then
      raise exception 'WMS: stock insuficiente para reservar (disponible %, requerido %). Revise la reconciliacion', v_disp, v_cant;
    end if;

    v_rest := v_cant;

    -- Primero lo UBICADO; contenedores con menos unidades primero (para vaciarlos)
    for r in
      select ubicacion_id, bodega_id, cantidad
        from public.wms_stock_ubicacion
       where producto_detalle_id = m.producto_detalle_id
         and estado_fase = 'UBICADO'
         and cantidad > 0
         and deleted_at is null
       order by cantidad asc
    loop
      v_take := least(v_rest, r.cantidad);

      perform public._wms_stock_mover(m.producto_detalle_id, r.ubicacion_id, 'UBICADO', -v_take, p_usr);
      perform public._wms_stock_mover(m.producto_detalle_id, r.ubicacion_id, 'RESERVADO', v_take, p_usr);

      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad,
         bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
         ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
      values
        (m.producto_detalle_id, 'RESERVA', v_take,
         r.bodega_id, r.ubicacion_id, 'UBICADO', 'RESERVADO',
         p_pos_mov, v_ref, 'POS: salida_venta', p_usr);

      v_rest := v_rest - v_take;
      exit when v_rest = 0;
    end loop;

    -- El resto sale de SIN_UBICAR (se despacha sin ubicacion)
    if v_rest > 0 then
      perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', -v_rest, p_usr);
      perform public._wms_stock_mover(m.producto_detalle_id, null, 'RESERVADO', v_rest, p_usr);

      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
         ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
      values
        (m.producto_detalle_id, 'RESERVA', v_rest, 'SIN_UBICAR', 'RESERVADO',
         p_pos_mov, v_ref, 'POS: salida_venta', p_usr);
    end if;

  -- ---------------- SALIDAS POR AJUSTE / MERMA DEL POS ----------------
  elsif m.tipo_movimiento in ('ajuste_decremento', 'merma') then
    select coalesce(sum(cantidad), 0) into v_disp
      from public.wms_stock_ubicacion
     where producto_detalle_id = m.producto_detalle_id
       and estado_fase = 'SIN_UBICAR'
       and deleted_at is null;

    if v_disp < v_cant then
      raise exception 'REQUIERE_CONTENEDOR: solo hay % sin ubicar y se requieren %. Resuelva con wms_resolver_decremento()', v_disp, v_cant;
    end if;

    perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', -v_cant, p_usr);
    if m.tipo_movimiento = 'merma' then
      perform public._wms_stock_mover(m.producto_detalle_id, null, 'BAJA', v_cant, p_usr);
    end if;

    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
       ref_pos_movimiento_id, motivo, created_by)
    values
      (m.producto_detalle_id,
       case when m.tipo_movimiento = 'merma' then 'BAJA' else 'AJUSTE' end,
       v_cant, 'SIN_UBICAR',
       case when m.tipo_movimiento = 'merma' then 'BAJA' end,
       p_pos_mov, 'POS: ' || m.tipo_movimiento, p_usr);

  else
    raise exception 'WMS: el tipo % aun no esta soportado', m.tipo_movimiento;
  end if;
end;
$$;


-- ============================================================
-- SECCION 2. VISTAS DE APOYO
-- ============================================================

-- 2.0 Reconciliacion WMS vs POS — REEMPLAZA la definida en 08-wms-schema.sql
-- para excluir productos digitales (D5). Mismas columnas.
create or replace view public.wms_v_reconciliacion as
select
  pd.id                                       as producto_detalle_id,
  pd.codigo_interno,
  pd.stock_actual                             as stock_pos,
  coalesce(w.stock_wms, 0)                    as stock_wms,
  pd.stock_actual - coalesce(w.stock_wms, 0)  as diferencia
from public.pos_productos_detalle pd
join public.pos_productos p on p.id = pd.producto_id
left join (
  select producto_detalle_id, sum(cantidad) as stock_wms
  from public.wms_stock_ubicacion
  where estado_fase in ('SIN_UBICAR', 'UBICADO')
    and deleted_at is null
  group by producto_detalle_id
) w on w.producto_detalle_id = pd.id
where pd.deleted_at is null
  and p.tipo_producto is distinct from 'Digital';

-- 2.1 Eventos del POS pendientes de procesar en el WMS
create or replace view public.wms_v_pos_pendientes as
select
  m.id                   as pos_movimiento_id,
  m.fecha,
  m.tipo_movimiento,
  m.producto_detalle_id,
  abs(m.cantidad)        as cantidad,
  m.referencia,
  m.motivo,
  case m.tipo_movimiento
    when 'entrada_compra'    then 'ENTRADA'
    when 'ajuste_incremento' then 'AJUSTE_MAS'
    when 'salida_venta'      then 'RESERVA'
    when 'ajuste_decremento' then 'AJUSTE_MENOS'
    when 'merma'             then 'BAJA'
    else 'NO_SOPORTADO'      -- ej. devolucion_venta (anulacion, D2)
  end                    as accion_wms
from public.pos_movimientos_inventario m
join public.pos_productos_detalle pd on pd.id = m.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
where m.deleted_at is null
  and p.tipo_producto is distinct from 'Digital'                     -- D5
  and coalesce(m.referencia, '') not like 'WMS%'                     -- anti-eco (D3)
  and not exists (select 1 from public.wms_movimientos w
                   where w.ref_pos_movimiento_id = m.id)             -- ya procesado (D1)
  and not exists (select 1 from public.wms_pos_linea_base b
                   where b.pos_movimiento_id = m.id);                -- anterior al arranque

-- 2.2 Ruta completa de cada ubicacion
create or replace view public.wms_v_ubicaciones_ruta as
with recursive arbol as (
  select u.id, u.bodega_id, u.codigo, u.tipo,
         initcap(u.tipo) || ' ' || u.codigo as ruta
    from public.wms_ubicaciones u
   where u.parent_id is null
     and u.deleted_at is null
  union all
  select h.id, h.bodega_id, h.codigo, h.tipo,
         a.ruta || ' › ' || initcap(h.tipo) || ' ' || h.codigo
    from public.wms_ubicaciones h
    join arbol a on h.parent_id = a.id
   where h.deleted_at is null
)
select
  a.id            as ubicacion_id,
  a.codigo,
  a.tipo,
  b.codigo        as bodega_codigo,
  b.nombre        as bodega,
  b.nombre || ' › ' || a.ruta as ruta
from arbol a
join public.wms_bodegas b on b.id = a.bodega_id;

-- 2.3 Buscar producto: donde esta cada SKU, en que estado y cuanto
create or replace view public.wms_v_stock_detalle as
select
  s.producto_detalle_id,
  pd.codigo_interno,
  p.nombre                         as producto,
  s.estado_fase,
  s.cantidad,
  s.ubicacion_id,
  coalesce(r.ruta, 'SIN UBICAR')   as ruta
from public.wms_stock_ubicacion s
join public.pos_productos_detalle pd on pd.id = s.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
left join public.wms_v_ubicaciones_ruta r on r.ubicacion_id = s.ubicacion_id
where s.deleted_at is null
  and s.cantidad > 0
  and s.estado_fase in ('SIN_UBICAR', 'UBICADO', 'RESERVADO');

-- 2.4 Bandeja "Pendiente por despachar": reservas sin despacho, por venta
create or replace view public.wms_v_despacho_pendiente as
select
  w.ref_pos_venta_id,
  v.numero_venta,
  v.fecha_venta,
  w.producto_detalle_id,
  pd.codigo_interno,
  p.nombre                         as producto,
  w.ubicacion_origen_id,
  coalesce(r.ruta, 'SIN UBICAR')   as ruta,
  sum(w.cantidad)                  as cantidad
from public.wms_movimientos w
left join public.pos_ventas v on v.id = w.ref_pos_venta_id
join public.pos_productos_detalle pd on pd.id = w.producto_detalle_id
join public.pos_productos p on p.id = pd.producto_id
left join public.wms_v_ubicaciones_ruta r on r.ubicacion_id = w.ubicacion_origen_id
where w.tipo_movimiento = 'RESERVA'
  and w.deleted_at is null
  and not exists (
    select 1 from public.wms_movimientos d
     where d.tipo_movimiento = 'DESPACHO'
       and d.ref_pos_movimiento_id = w.ref_pos_movimiento_id
       and d.ubicacion_origen_id is not distinct from w.ubicacion_origen_id
       and d.deleted_at is null
  )
group by w.ref_pos_venta_id, v.numero_venta, v.fecha_venta, w.producto_detalle_id,
         pd.codigo_interno, p.nombre, w.ubicacion_origen_id, r.ruta;

grant select on public.wms_v_reconciliacion     to anon, authenticated, service_role;
grant select on public.wms_v_pos_pendientes     to authenticated, service_role;
grant select on public.wms_v_ubicaciones_ruta   to authenticated, service_role;
grant select on public.wms_v_stock_detalle      to authenticated, service_role;
grant select on public.wms_v_despacho_pendiente to authenticated, service_role;


-- ============================================================
-- SECCION 3. FUNCIONES PUBLICAS (RPC que llama la app)
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 wms_inicializar() — SE EJECUTA UNA SOLA VEZ
-- Carga el stock_actual de productos FISICOS como SIN_UBICAR y registra
-- todos los movimientos POS existentes como linea base.
-- ------------------------------------------------------------
create or replace function public.wms_inicializar(p_usuario uuid default null)
returns table (
  skus_cargados int,
  unidades_cargadas bigint,
  eventos_linea_base int,
  skus_stock_negativo int,
  skus_digitales_excluidos int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
begin
  if exists (select 1 from public.wms_stock_ubicacion)
     or exists (select 1 from public.wms_pos_linea_base) then
    raise exception 'WMS: ya fue inicializado. Esta funcion solo se ejecuta una vez';
  end if;

  insert into public.wms_pos_linea_base (pos_movimiento_id)
  select id from public.pos_movimientos_inventario;
  get diagnostics eventos_linea_base = row_count;

  insert into public.wms_stock_ubicacion
    (producto_detalle_id, estado_fase, cantidad, created_by, updated_by)
  select pd.id, 'SIN_UBICAR', pd.stock_actual, v_usr, v_usr
    from public.pos_productos_detalle pd
    join public.pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null
     and pd.stock_actual > 0
     and p.tipo_producto is distinct from 'Digital';
  get diagnostics skus_cargados = row_count;

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad, fase_destino, motivo, created_by)
  select pd.id, 'ENTRADA', pd.stock_actual, 'SIN_UBICAR', 'Inicializacion WMS (stock POS)', v_usr
    from public.pos_productos_detalle pd
    join public.pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null
     and pd.stock_actual > 0
     and p.tipo_producto is distinct from 'Digital';

  select coalesce(sum(pd.stock_actual), 0) into unidades_cargadas
    from public.pos_productos_detalle pd
    join public.pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null
     and pd.stock_actual > 0
     and p.tipo_producto is distinct from 'Digital';

  select count(*) into skus_stock_negativo
    from public.pos_productos_detalle pd
    join public.pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null
     and pd.stock_actual < 0
     and p.tipo_producto is distinct from 'Digital';

  select count(*) into skus_digitales_excluidos
    from public.pos_productos_detalle pd
    join public.pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null
     and p.tipo_producto = 'Digital';

  return next;
end;
$$;

-- ------------------------------------------------------------
-- 3.2 wms_sincronizar() — se llama al abrir las bandejas
-- Cada evento es atomico: si uno falla, se revierte solo ese y queda
-- PENDIENTE con el motivo; los demas continuan.
-- ------------------------------------------------------------
create or replace function public.wms_sincronizar(p_usuario uuid default null)
returns table (
  evento_id uuid,
  tipo_pos text,
  resultado text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_usr uuid := public._wms_usuario(p_usuario);
begin
  if not exists (select 1 from public.wms_pos_linea_base) then
    raise exception 'WMS: no inicializado. Ejecute primero wms_inicializar()';
  end if;

  for e in
    select pos_movimiento_id, tipo_movimiento
      from public.wms_v_pos_pendientes
     where accion_wms <> 'NO_SOPORTADO'
     order by fecha, pos_movimiento_id
  loop
    evento_id := e.pos_movimiento_id;
    tipo_pos := e.tipo_movimiento;
    begin
      perform public._wms_procesar_evento(e.pos_movimiento_id, v_usr);
      resultado := 'PROCESADO';
      detalle := null;
    exception when others then
      resultado := 'PENDIENTE';
      detalle := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 3.3 wms_ubicar() — SIN_UBICAR -> UBICADO en un contenedor
-- ------------------------------------------------------------
create or replace function public.wms_ubicar(
  p_producto_detalle_id uuid,
  p_codigo_ubicacion text,
  p_cantidad int,
  p_usuario uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_u public.wms_ubicaciones;
  v_id uuid;
begin
  perform public._wms_validar_fisico(p_producto_detalle_id);
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'WMS: la cantidad debe ser mayor que 0';
  end if;

  v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);
  perform public._wms_validar_mono_sku(v_u.id, p_producto_detalle_id);

  perform public._wms_stock_mover(p_producto_detalle_id, null, 'SIN_UBICAR', -p_cantidad, v_usr);
  perform public._wms_stock_mover(p_producto_detalle_id, v_u.id, 'UBICADO', p_cantidad, v_usr);

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad,
     bodega_destino_id, ubicacion_destino_id, fase_origen, fase_destino,
     motivo, created_by)
  values
    (p_producto_detalle_id, 'UBICACION', p_cantidad,
     v_u.bodega_id, v_u.id, 'SIN_UBICAR', 'UBICADO',
     'Ubicacion', v_usr)
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3.4 wms_trasladar() — UBICADO -> UBICADO (entre contenedores o bodegas)
-- ------------------------------------------------------------
create or replace function public.wms_trasladar(
  p_producto_detalle_id uuid,
  p_codigo_origen text,
  p_codigo_destino text,
  p_cantidad int,
  p_usuario uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_o public.wms_ubicaciones;
  v_d public.wms_ubicaciones;
  v_id uuid;
begin
  perform public._wms_validar_fisico(p_producto_detalle_id);
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'WMS: la cantidad debe ser mayor que 0';
  end if;

  v_o := public._wms_ubicacion_por_codigo(p_codigo_origen);
  v_d := public._wms_ubicacion_por_codigo(p_codigo_destino);

  if v_o.id = v_d.id then
    raise exception 'WMS: el origen y el destino son la misma ubicacion';
  end if;

  perform public._wms_validar_mono_sku(v_d.id, p_producto_detalle_id);

  perform public._wms_stock_mover(p_producto_detalle_id, v_o.id, 'UBICADO', -p_cantidad, v_usr);
  perform public._wms_stock_mover(p_producto_detalle_id, v_d.id, 'UBICADO', p_cantidad, v_usr);

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad,
     bodega_origen_id, bodega_destino_id, ubicacion_origen_id, ubicacion_destino_id,
     fase_origen, fase_destino, motivo, created_by)
  values
    (p_producto_detalle_id, 'TRASLADO', p_cantidad,
     v_o.bodega_id, v_d.bodega_id, v_o.id, v_d.id,
     'UBICADO', 'UBICADO', 'Traslado', v_usr)
  returning id into v_id;

  perform public._wms_liberar_mono_sku(v_o.id);

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3.5 wms_despachar() — RESERVADO -> DESPACHADO para toda una venta
-- Idempotente. Devuelve las unidades despachadas.
-- ------------------------------------------------------------
create or replace function public.wms_despachar(
  p_ref_pos_venta_id uuid,
  p_usuario uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  r record;
  v_total int := 0;
begin
  for r in
    select w.producto_detalle_id, w.ubicacion_origen_id, w.bodega_origen_id,
           w.cantidad, w.ref_pos_movimiento_id
      from public.wms_movimientos w
     where w.tipo_movimiento = 'RESERVA'
       and w.ref_pos_venta_id = p_ref_pos_venta_id
       and w.deleted_at is null
       and not exists (
         select 1 from public.wms_movimientos d
          where d.tipo_movimiento = 'DESPACHO'
            and d.ref_pos_movimiento_id = w.ref_pos_movimiento_id
            and d.ubicacion_origen_id is not distinct from w.ubicacion_origen_id
            and d.deleted_at is null
       )
     for update of w
  loop
    perform public._wms_stock_mover(r.producto_detalle_id, r.ubicacion_origen_id, 'RESERVADO', -r.cantidad, v_usr);
    perform public._wms_stock_mover(r.producto_detalle_id, null, 'DESPACHADO', r.cantidad, v_usr);

    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       ref_pos_movimiento_id, ref_pos_venta_id, motivo, created_by)
    values
      (r.producto_detalle_id, 'DESPACHO', r.cantidad,
       r.bodega_origen_id, r.ubicacion_origen_id, 'RESERVADO', 'DESPACHADO',
       r.ref_pos_movimiento_id, p_ref_pos_venta_id, 'Despacho de venta', v_usr);

    perform public._wms_liberar_mono_sku(r.ubicacion_origen_id);
    v_total := v_total + r.cantidad;
  end loop;

  if v_total = 0 then
    raise exception 'WMS: la venta no tiene reservas pendientes (ya despachada o aun no sincronizada)';
  end if;

  return v_total;
end;
$$;

-- ------------------------------------------------------------
-- 3.6 wms_resolver_decremento() — resuelve 'ajuste_decremento' o 'merma'
-- del POS que quedaron PENDIENTES porque lo sin ubicar no alcanzaba.
-- ------------------------------------------------------------
create or replace function public.wms_resolver_decremento(
  p_pos_movimiento_id uuid,
  p_codigo_ubicacion text,
  p_usuario uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  m record;
  v_u public.wms_ubicaciones;
  v_cant int;
  v_pool int;
  v_de_pool int;
  v_de_ubic int;
  v_tipo text;
begin
  select * into m
    from public.pos_movimientos_inventario
   where id = p_pos_movimiento_id
   for update;

  if not found then
    raise exception 'WMS: el movimiento POS % no existe', p_pos_movimiento_id;
  end if;
  perform public._wms_validar_fisico(m.producto_detalle_id);
  if m.tipo_movimiento not in ('ajuste_decremento', 'merma') then
    raise exception 'WMS: solo aplica a ajuste_decremento o merma (recibido %)', m.tipo_movimiento;
  end if;
  if exists (select 1 from public.wms_movimientos where ref_pos_movimiento_id = p_pos_movimiento_id)
     or exists (select 1 from public.wms_pos_linea_base where pos_movimiento_id = p_pos_movimiento_id) then
    raise exception 'WMS: el movimiento ya fue procesado';
  end if;

  v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);
  v_cant := abs(m.cantidad);
  v_tipo := case when m.tipo_movimiento = 'merma' then 'BAJA' else 'AJUSTE' end;

  select coalesce(sum(cantidad), 0) into v_pool
    from public.wms_stock_ubicacion
   where producto_detalle_id = m.producto_detalle_id
     and estado_fase = 'SIN_UBICAR'
     and deleted_at is null;

  v_de_pool := least(v_pool, v_cant);
  v_de_ubic := v_cant - v_de_pool;

  if v_de_pool > 0 then
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', -v_de_pool, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
       ref_pos_movimiento_id, motivo, created_by)
    values
      (m.producto_detalle_id, v_tipo, v_de_pool, 'SIN_UBICAR',
       case when v_tipo = 'BAJA' then 'BAJA' end,
       p_pos_movimiento_id, 'POS: ' || m.tipo_movimiento, v_usr);
  end if;

  if v_de_ubic > 0 then
    perform public._wms_stock_mover(m.producto_detalle_id, v_u.id, 'UBICADO', -v_de_ubic, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       ref_pos_movimiento_id, motivo, created_by)
    values
      (m.producto_detalle_id, v_tipo, v_de_ubic,
       v_u.bodega_id, v_u.id, 'UBICADO',
       case when v_tipo = 'BAJA' then 'BAJA' end,
       p_pos_movimiento_id, 'POS: ' || m.tipo_movimiento, v_usr);
    perform public._wms_liberar_mono_sku(v_u.id);
  end if;

  if v_tipo = 'BAJA' then
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'BAJA', v_cant, v_usr);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3.7 wms_ajustar() — ajuste manual originado en el WMS (sin aprobacion).
-- Se propaga al POS. Sin codigo = ajusta lo SIN_UBICAR.
-- ------------------------------------------------------------
create or replace function public.wms_ajustar(
  p_producto_detalle_id uuid,
  p_delta int,
  p_motivo text,
  p_codigo_ubicacion text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_u public.wms_ubicaciones;
  v_ubic uuid;
  v_fase text;
  v_pos uuid;
  v_id uuid;
begin
  perform public._wms_validar_fisico(p_producto_detalle_id);
  if coalesce(p_delta, 0) = 0 then
    raise exception 'WMS: el ajuste no puede ser 0';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'WMS: el motivo del ajuste es obligatorio';
  end if;

  if p_codigo_ubicacion is not null then
    v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);
    v_ubic := v_u.id;
    v_fase := 'UBICADO';
    if p_delta > 0 then
      perform public._wms_validar_mono_sku(v_ubic, p_producto_detalle_id);
    end if;
  else
    v_fase := 'SIN_UBICAR';
  end if;

  perform public._wms_stock_mover(p_producto_detalle_id, v_ubic, v_fase, p_delta, v_usr);

  v_pos := public._wms_ajuste_pos(
    p_producto_detalle_id, p_delta,
    case when p_delta > 0 then 'ajuste_incremento' else 'ajuste_decremento' end,
    'WMS: ' || p_motivo, v_usr);

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad,
     bodega_origen_id, bodega_destino_id, ubicacion_origen_id, ubicacion_destino_id,
     fase_origen, fase_destino, ref_pos_movimiento_id, motivo, created_by)
  values
    (p_producto_detalle_id, 'AJUSTE', abs(p_delta),
     case when p_delta < 0 then v_u.bodega_id end,
     case when p_delta > 0 then v_u.bodega_id end,
     case when p_delta < 0 then v_ubic end,
     case when p_delta > 0 then v_ubic end,
     case when p_delta < 0 then v_fase end,
     case when p_delta > 0 then v_fase end,
     v_pos, p_motivo, v_usr)
  returning id into v_id;

  if p_delta < 0 then
    perform public._wms_liberar_mono_sku(v_ubic);
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3.8 wms_registrar_conteo() — Inventario general por contenedor
--   fisico > sistema: primero UBICA lo que falta tomandolo de SIN_UBICAR;
--                     solo el resto es sobrante (ajuste + POS).
--   fisico < sistema: el faltante vuelve a SIN_UBICAR (NO ajusta el POS).
-- ------------------------------------------------------------
create or replace function public.wms_registrar_conteo(
  p_producto_detalle_id uuid,
  p_codigo_ubicacion text,
  p_cantidad_fisica int,
  p_sesion_inventario_id uuid default null,
  p_usuario uuid default null
) returns table (
  o_conteo_id uuid,
  o_diferencia int,
  o_ubicado_desde_sin_ubicar int,
  o_ajuste_pos int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_u public.wms_ubicaciones;
  v_sistema int;
  v_dif int;
  v_pool int;
  v_de_pool int := 0;
  v_sobrante int := 0;
  v_pos uuid;
begin
  perform public._wms_validar_fisico(p_producto_detalle_id);
  if p_cantidad_fisica is null or p_cantidad_fisica < 0 then
    raise exception 'WMS: la cantidad fisica debe ser 0 o mayor';
  end if;

  v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);

  select coalesce(sum(cantidad), 0) into v_sistema
    from public.wms_stock_ubicacion
   where producto_detalle_id = p_producto_detalle_id
     and ubicacion_id = v_u.id
     and estado_fase = 'UBICADO'
     and deleted_at is null;

  v_dif := p_cantidad_fisica - v_sistema;

  insert into public.wms_conteos
    (sesion_inventario_id, ubicacion_id, producto_detalle_id,
     cantidad_sistema, cantidad_fisica, estado, created_by)
  values
    (p_sesion_inventario_id, v_u.id, p_producto_detalle_id,
     v_sistema, p_cantidad_fisica, 'ABIERTO', v_usr)
  returning id into o_conteo_id;

  if v_dif > 0 then
    perform public._wms_validar_mono_sku(v_u.id, p_producto_detalle_id);

    select coalesce(sum(cantidad), 0) into v_pool
      from public.wms_stock_ubicacion
     where producto_detalle_id = p_producto_detalle_id
       and estado_fase = 'SIN_UBICAR'
       and deleted_at is null;

    v_de_pool := least(v_dif, v_pool);
    v_sobrante := v_dif - v_de_pool;

    if v_de_pool > 0 then
      perform public._wms_stock_mover(p_producto_detalle_id, null, 'SIN_UBICAR', -v_de_pool, v_usr);
      perform public._wms_stock_mover(p_producto_detalle_id, v_u.id, 'UBICADO', v_de_pool, v_usr);
      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad,
         bodega_destino_id, ubicacion_destino_id, fase_origen, fase_destino,
         motivo, created_by)
      values
        (p_producto_detalle_id, 'UBICACION', v_de_pool,
         v_u.bodega_id, v_u.id, 'SIN_UBICAR', 'UBICADO',
         'Inventario general', v_usr);
    end if;

    if v_sobrante > 0 then
      perform public._wms_stock_mover(p_producto_detalle_id, v_u.id, 'UBICADO', v_sobrante, v_usr);
      v_pos := public._wms_ajuste_pos(p_producto_detalle_id, v_sobrante, 'ajuste_incremento',
                                      'WMS: Inventario general - sobrante', v_usr);
      insert into public.wms_movimientos
        (producto_detalle_id, tipo_movimiento, cantidad,
         bodega_destino_id, ubicacion_destino_id, fase_destino,
         ref_pos_movimiento_id, motivo, created_by)
      values
        (p_producto_detalle_id, 'AJUSTE', v_sobrante,
         v_u.bodega_id, v_u.id, 'UBICADO',
         v_pos, 'Inventario general - sobrante', v_usr);
    end if;

  elsif v_dif < 0 then
    perform public._wms_stock_mover(p_producto_detalle_id, v_u.id, 'UBICADO', v_dif, v_usr);
    perform public._wms_stock_mover(p_producto_detalle_id, null, 'SIN_UBICAR', -v_dif, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       motivo, created_by)
    values
      (p_producto_detalle_id, 'UBICACION', -v_dif,
       v_u.bodega_id, v_u.id, 'UBICADO', 'SIN_UBICAR',
       'Inventario general - faltante en contenedor', v_usr);
    perform public._wms_liberar_mono_sku(v_u.id);
  end if;

  update public.wms_conteos set estado = 'AJUSTADO' where id = o_conteo_id;

  o_diferencia := v_dif;
  o_ubicado_desde_sin_ubicar := v_de_pool;
  o_ajuste_pos := v_sobrante;
  return next;
end;
$$;

-- ------------------------------------------------------------
-- 3.9 wms_dar_baja() — producto averiado: sale del contenedor (o de
-- SIN_UBICAR), queda en BAJA y se registra 'merma' en el POS.
-- ------------------------------------------------------------
create or replace function public.wms_dar_baja(
  p_producto_detalle_id uuid,
  p_cantidad int,
  p_motivo text,
  p_codigo_ubicacion text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usr uuid := public._wms_usuario(p_usuario);
  v_u public.wms_ubicaciones;
  v_ubic uuid;
  v_fase text;
  v_pos uuid;
  v_id uuid;
begin
  perform public._wms_validar_fisico(p_producto_detalle_id);
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'WMS: la cantidad debe ser mayor que 0';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'WMS: el motivo de la baja es obligatorio';
  end if;

  if p_codigo_ubicacion is not null then
    v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);
    v_ubic := v_u.id;
    v_fase := 'UBICADO';
  else
    v_fase := 'SIN_UBICAR';
  end if;

  perform public._wms_stock_mover(p_producto_detalle_id, v_ubic, v_fase, -p_cantidad, v_usr);
  perform public._wms_stock_mover(p_producto_detalle_id, null, 'BAJA', p_cantidad, v_usr);

  v_pos := public._wms_ajuste_pos(p_producto_detalle_id, -p_cantidad, 'merma',
                                  'WMS: Baja - ' || p_motivo, v_usr);

  insert into public.wms_movimientos
    (producto_detalle_id, tipo_movimiento, cantidad,
     bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
     ref_pos_movimiento_id, motivo, created_by)
  values
    (p_producto_detalle_id, 'BAJA', p_cantidad,
     v_u.bodega_id, v_ubic, v_fase, 'BAJA',
     v_pos, p_motivo, v_usr)
  returning id into v_id;

  perform public._wms_liberar_mono_sku(v_ubic);

  return v_id;
end;
$$;


-- ============================================================
-- SECCION 4. PERMISOS
-- ============================================================
revoke execute on function public._wms_usuario(uuid)                                from public, anon, authenticated;
revoke execute on function public._wms_es_digital(uuid)                             from public, anon, authenticated;
revoke execute on function public._wms_validar_fisico(uuid)                         from public, anon, authenticated;
revoke execute on function public._wms_ref_venta(text, text)                        from public, anon, authenticated;
revoke execute on function public._wms_ref_compra(text, timestamptz)                from public, anon, authenticated;
revoke execute on function public._wms_stock_mover(uuid, uuid, text, int, uuid)     from public, anon, authenticated;
revoke execute on function public._wms_ubicacion_por_codigo(text)                   from public, anon, authenticated;
revoke execute on function public._wms_validar_mono_sku(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function public._wms_liberar_mono_sku(uuid)                       from public, anon, authenticated;
revoke execute on function public._wms_ajuste_pos(uuid, int, text, text, uuid)      from public, anon, authenticated;
revoke execute on function public._wms_procesar_evento(uuid, uuid)                  from public, anon, authenticated;

revoke execute on function public.wms_inicializar(uuid)                                   from public, anon;
revoke execute on function public.wms_sincronizar(uuid)                                   from public, anon;
revoke execute on function public.wms_ubicar(uuid, text, int, uuid)                       from public, anon;
revoke execute on function public.wms_trasladar(uuid, text, text, int, uuid)              from public, anon;
revoke execute on function public.wms_despachar(uuid, uuid)                               from public, anon;
revoke execute on function public.wms_resolver_decremento(uuid, text, uuid)               from public, anon;
revoke execute on function public.wms_ajustar(uuid, int, text, text, uuid)                from public, anon;
revoke execute on function public.wms_registrar_conteo(uuid, text, int, uuid, uuid)       from public, anon;
revoke execute on function public.wms_dar_baja(uuid, int, text, text, uuid)               from public, anon;

grant execute on function public.wms_inicializar(uuid)                              to authenticated, service_role;
grant execute on function public.wms_sincronizar(uuid)                              to authenticated, service_role;
grant execute on function public.wms_ubicar(uuid, text, int, uuid)                  to authenticated, service_role;
grant execute on function public.wms_trasladar(uuid, text, text, int, uuid)         to authenticated, service_role;
grant execute on function public.wms_despachar(uuid, uuid)                          to authenticated, service_role;
grant execute on function public.wms_resolver_decremento(uuid, text, uuid)          to authenticated, service_role;
grant execute on function public.wms_ajustar(uuid, int, text, text, uuid)           to authenticated, service_role;
grant execute on function public.wms_registrar_conteo(uuid, text, int, uuid, uuid)  to authenticated, service_role;
grant execute on function public.wms_dar_baja(uuid, int, text, text, uuid)          to authenticated, service_role;


-- ============================================================
-- VERIFICACION
--   select * from public.wms_v_reconciliacion where diferencia <> 0;
--   select * from public.wms_sincronizar();
--   select * from public.wms_v_pos_pendientes;
--   select * from public.wms_v_despacho_pendiente;
-- ============================================================
-- FIN 09-wms-functions.sql (v2)
-- Pendiente (D2): logica de anulacion/edicion de ventas -> wms_liberar().
-- ============================================================
