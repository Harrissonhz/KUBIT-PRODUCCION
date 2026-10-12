-- ============================================================
-- 10-wms-solo-lectura.sql — Kubit-WMS: solo lectura sobre POS y Tienda
-- Motor: PostgreSQL 15+ (Supabase)
-- Base: specs/09-wms-functions.sql (v2)  ·  Paso C0 (2026-10-02)
--
-- DECISION CR1 (usuario, 2026-10-02):
--   El WMS NUNCA escribe datos en tablas pos_* ni st_*. Solo las lee.
--   El POS es el unico dueno del stock contable (stock_actual) y de
--   pos_movimientos_inventario.
--
-- QUE HACE ESTE SCRIPT
--   1. Elimina las funciones que escribian en el POS:
--        wms_ajustar, wms_dar_baja y _wms_ajuste_pos.
--   2. Redefine wms_registrar_conteo sin ajustar el POS (CR3):
--        el sobrante real queda PENDIENTE (conteo ABIERTO) hasta que se
--        registre un ajuste + en el POS.
--   3. Quita los bloqueos de filas del POS (SELECT ... FOR UPDATE sobre
--      pos_movimientos_inventario). La exclusion entre sincronizaciones
--      simultaneas se hace con un candado propio del WMS
--      (pg_advisory_xact_lock), sin tocar filas del POS.
--   4. Regla CR2 para ajustes - y mermas del POS:
--        - si el producto NO tiene unidades ubicadas, se descuentan solas
--          de SIN_UBICAR al sincronizar;
--        - si tiene unidades ubicadas, quedan PENDIENTES y el usuario
--          indica de donde salieron (sin ubicar o un contenedor) con
--          wms_resolver_decremento.
--
-- NO TOCA: tablas, datos, vistas, wms_inicializar, wms_sincronizar,
-- wms_ubicar, wms_trasladar, wms_despachar ni el stock del WMS.
--
-- USO: ejecutar despues de 09-wms-functions.sql (v2). Idempotente.
-- Orden obligatorio: 08 -> 09 -> 10. No re-ejecutar el 09 despues del 10.
-- Verificacion al final del archivo.
-- ============================================================


begin;   -- todo o nada: si una instruccion falla, no se aplica ningun cambio

-- ============================================================
-- 1. FUNCIONES QUE ESCRIBIAN EN EL POS (se eliminan)
-- ============================================================
drop function if exists public.wms_ajustar(uuid, int, text, text, uuid);
drop function if exists public.wms_dar_baja(uuid, int, text, text, uuid);
drop function if exists public._wms_ajuste_pos(uuid, int, text, text, uuid);


-- ============================================================
-- 2. _wms_procesar_evento — sin bloquear filas del POS (CR1) y con CR2
--    entrada_compra     -> ENTRADA : +SIN_UBICAR
--    ajuste_incremento  -> AJUSTE  : +SIN_UBICAR
--    salida_venta       -> RESERVA : UBICADO/SIN_UBICAR -> RESERVADO (todo o nada)
--    ajuste_decremento  -> AJUSTE  : -SIN_UBICAR solo si el producto no esta ubicado (CR2)
--    merma              -> BAJA    : SIN_UBICAR -> BAJA solo si el producto no esta ubicado (CR2)
-- ============================================================
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
  -- Candado propio del WMS (no bloquea filas del POS)
  perform pg_advisory_xact_lock(hashtext('wms_evento:' || p_pos_mov::text));

  select * into m
    from public.pos_movimientos_inventario
   where id = p_pos_mov;

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

  -- ---------------- SALIDAS POR AJUSTE / MERMA DEL POS (CR2) ----------------
  elsif m.tipo_movimiento in ('ajuste_decremento', 'merma') then
    -- Si el producto tiene unidades ubicadas, el usuario debe indicar de donde salieron
    if exists (
      select 1 from public.wms_stock_ubicacion
       where producto_detalle_id = m.producto_detalle_id
         and estado_fase = 'UBICADO'
         and cantidad > 0
         and deleted_at is null
    ) then
      raise exception 'REQUIERE_CONTENEDOR: el producto esta ubicado; indique de donde salieron las % unidades', v_cant;
    end if;

    select coalesce(sum(cantidad), 0) into v_disp
      from public.wms_stock_ubicacion
     where producto_detalle_id = m.producto_detalle_id
       and estado_fase = 'SIN_UBICAR'
       and deleted_at is null;

    if v_disp < v_cant then
      raise exception 'REQUIERE_REVISION: solo hay % sin ubicar y se requieren %. Revise la reconciliacion', v_disp, v_cant;
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
-- 3. wms_resolver_decremento — el usuario indica de donde salio (CR2)
--    p_codigo_ubicacion NULL o vacio -> todo sale de SIN_UBICAR
--    p_codigo_ubicacion = contenedor -> todo sale de ese contenedor (UBICADO)
--    Solo escribe en tablas wms_*. No bloquea filas del POS.
-- ============================================================
drop function if exists public.wms_resolver_decremento(uuid, text, uuid);

create function public.wms_resolver_decremento(
  p_pos_movimiento_id uuid,
  p_codigo_ubicacion text default null,
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
  v_tipo text;
begin
  perform pg_advisory_xact_lock(hashtext('wms_evento:' || p_pos_movimiento_id::text));

  select * into m
    from public.pos_movimientos_inventario
   where id = p_pos_movimiento_id;

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

  v_cant := abs(m.cantidad);
  v_tipo := case when m.tipo_movimiento = 'merma' then 'BAJA' else 'AJUSTE' end;

  if p_codigo_ubicacion is null or trim(p_codigo_ubicacion) = '' then
    -- Sale de lo sin ubicar
    perform public._wms_stock_mover(m.producto_detalle_id, null, 'SIN_UBICAR', -v_cant, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad, fase_origen, fase_destino,
       ref_pos_movimiento_id, motivo, created_by)
    values
      (m.producto_detalle_id, v_tipo, v_cant, 'SIN_UBICAR',
       case when v_tipo = 'BAJA' then 'BAJA' end,
       p_pos_movimiento_id, 'POS: ' || m.tipo_movimiento, v_usr);
  else
    -- Sale del contenedor indicado
    v_u := public._wms_ubicacion_por_codigo(p_codigo_ubicacion);
    perform public._wms_stock_mover(m.producto_detalle_id, v_u.id, 'UBICADO', -v_cant, v_usr);
    insert into public.wms_movimientos
      (producto_detalle_id, tipo_movimiento, cantidad,
       bodega_origen_id, ubicacion_origen_id, fase_origen, fase_destino,
       ref_pos_movimiento_id, motivo, created_by)
    values
      (m.producto_detalle_id, v_tipo, v_cant,
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


-- ============================================================
-- 4. wms_registrar_conteo — sin tocar el POS (CR3)
--   fisico > sistema: primero UBICA lo que falta tomandolo de SIN_UBICAR;
--                     el sobrante real NO se crea: queda PENDIENTE
--                     (conteo ABIERTO) hasta registrar un ajuste + en el POS.
--   fisico < sistema: el faltante vuelve a SIN_UBICAR (igual que antes).
--   Cambia la columna de salida o_ajuste_pos -> o_sobrante_pendiente.
-- ============================================================
drop function if exists public.wms_registrar_conteo(uuid, text, int, uuid, uuid);

create function public.wms_registrar_conteo(
  p_producto_detalle_id uuid,
  p_codigo_ubicacion text,
  p_cantidad_fisica int,
  p_sesion_inventario_id uuid default null,
  p_usuario uuid default null
) returns table (
  o_conteo_id uuid,
  o_diferencia int,
  o_ubicado_desde_sin_ubicar int,
  o_sobrante_pendiente int
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
    -- v_sobrante > 0: no se crea stock; se registra en el conteo (CR3)

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

  update public.wms_conteos
     set estado = case when v_sobrante > 0 then 'ABIERTO' else 'AJUSTADO' end,
         observaciones = case when v_sobrante > 0
           then 'Sobrante de ' || v_sobrante || ' unidad(es): registrar ajuste + en el POS y luego ubicarlas'
           else null end
   where id = o_conteo_id;

  o_diferencia := v_dif;
  o_ubicado_desde_sin_ubicar := v_de_pool;
  o_sobrante_pendiente := v_sobrante;
  return next;
end;
$$;


-- ============================================================
-- 5. PERMISOS de las funciones recreadas
-- ============================================================
revoke execute on function public._wms_procesar_evento(uuid, uuid)                from public, anon, authenticated;

revoke execute on function public.wms_resolver_decremento(uuid, text, uuid)         from public, anon;
revoke execute on function public.wms_registrar_conteo(uuid, text, int, uuid, uuid) from public, anon;

grant execute on function public.wms_resolver_decremento(uuid, text, uuid)          to authenticated, service_role;
grant execute on function public.wms_registrar_conteo(uuid, text, int, uuid, uuid)  to authenticated, service_role;

commit;


-- ============================================================
-- VERIFICACION (ejecutar cada consulta por separado)
--
-- A) Ninguna funcion del WMS escribe en pos_* ni st_*  -> 0 filas
-- select p.proname
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
--   and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.(pos|st)_';
--
-- B) Ninguna funcion del WMS bloquea filas del POS o la Tienda -> 0 filas
-- select p.proname
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
--   and p.prosrc ~* 'from\s+public\.(pos|st)_[a-z_]+[^;]*for\s+update';
--
-- C) Funciones del WMS que quedan -> 18 (11 _wms_ + 7 wms_)
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%');
--
-- D) La sincronizacion sigue funcionando -> sin error
-- select * from public.wms_sincronizar();
-- ============================================================
-- FIN 10-wms-solo-lectura.sql
-- ============================================================
