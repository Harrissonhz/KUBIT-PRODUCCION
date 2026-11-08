-- ============================================================
-- 18-pos-pedidos-web.sql — Kubit T4: pedidos web en el POS
-- Fecha: 2026-11-08 · Hallazgo: ST-15
-- ------------------------------------------------------------
-- QUE HACE (solo agrega; NO cierra accesos ni cambia politicas):
--   1. st_pedidos: columnas gestionado_at, gestionado_por, nota_gestion.
--   2. Funciones para el POS (rol authenticated, usuario activo de pos_usuarios):
--        pos_pedidos_web_contar()                   cuantos pedidos PENDIENTE hay
--        pos_pedidos_web_listar(p_vista)            'pendientes' | 'gestionados' (ultimos 30 dias)
--        pos_pedido_web_detalle(p_pedido_id)        un pedido
--        pos_pedido_web_cerrar(p_pedido_id, p_resultado, p_numero_venta, p_nota)
--      Devuelven el pedido con los datos del comprador (st_direcciones), que el POS
--      no puede leer directamente por las politicas actuales.
--
-- REGLAS (decisiones T4, 2026-11-08):
--   - El pedido web NO mueve inventario, NO crea ventas ni clientes. La venta y el
--     cliente se registran a mano en el POS (canal Web; cliente real o 222222222222).
--   - Cerrar: 'venta' -> CONFIRMADO; 'no_concretado' -> CANCELADO. Sin motivo.
--     Numero de venta opcional (solo con 'venta'): si se escribe, debe existir en
--     pos_ventas y se enlaza en st_pedidos.venta_id. Nota opcional (max 500).
--   - Solo se cierran pedidos PENDIENTE.
--   - Lo puede usar cualquier usuario activo del POS con sesion (hoy solo el admin).
--
-- ORDEN: 18 (este) -> publicar frontend T4 -> probar. Primero QA, luego produccion.
-- No hay riesgo de orden: el script no quita permisos y la tienda no lo usa.
-- Idempotente: se puede volver a ejecutar.
--
-- ROLLBACK (si hiciera falta):
--   drop function if exists public.pos_pedido_web_cerrar(uuid, text, text, text);
--   drop function if exists public.pos_pedido_web_detalle(uuid);
--   drop function if exists public.pos_pedidos_web_listar(text);
--   drop function if exists public.pos_pedidos_web_contar();
--   drop function if exists public.pos_pedido_web_json(uuid);
--   drop function if exists public.pos_usuario_sesion();
--   (las columnas nuevas pueden quedarse)
-- ============================================================

begin;

-- 1. Columnas de gestion ----------------------------------------------------
alter table public.st_pedidos add column if not exists gestionado_at  timestamptz;
alter table public.st_pedidos add column if not exists gestionado_por uuid references public.pos_usuarios(id);
alter table public.st_pedidos add column if not exists nota_gestion   text;

create index if not exists idx_st_pedidos_estado_created
  on public.st_pedidos (estado, created_at desc);

-- 2. Usuario del POS que hace la llamada (interna) ----------------------------
-- Devuelve el id del usuario activo de pos_usuarios que corresponde a la sesion de
-- Supabase Auth (mismo id; respaldo por email). Si no hay, devuelve null.
create or replace function public.pos_usuario_sesion()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select u.id
    from public.pos_usuarios u
   where u.deleted_at is null
     and coalesce(u.activo, true) = true
     and auth.uid() is not null
     and (u.id = auth.uid()
          or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
   order by (u.id = auth.uid()) desc
   limit 1;
$f$;

-- 3. Un pedido en JSON con comprador y lineas (interna) ----------------------
create or replace function public.pos_pedido_web_json(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select jsonb_build_object(
    'id',                 p.id,
    'numero_pedido',      p.numero_pedido,
    'created_at',         p.created_at,
    'estado',             p.estado,
    'subtotal',           p.subtotal,
    'costo_envio',        p.costo_envio,
    'total',              p.total,
    'medio_pago',         coalesce(p.medio_pago_web, substring(p.notas from 'Metodo de pago: ([a-z_]+)')),
    'notas',              p.notas,
    'stock_insuficiente', coalesce(p.notas, '') like '%Stock insuficiente:%',
    'aviso_stock',        substring(p.notas from 'Stock insuficiente: (.*)$'),
    'gestionado_at',      p.gestionado_at,
    'gestionado_por',     gu.nombre_completo,
    'nota_gestion',       p.nota_gestion,
    'venta_id',           p.venta_id,
    'numero_venta',       v.numero_venta,
    'comprador', jsonb_build_object(
      'nombre',       d.nombre_destinatario,
      'celular',      d.telefono,
      'email',        d.email,
      'direccion',    d.direccion,
      'ciudad',       d.ciudad,
      'departamento', d.departamento),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'producto_detalle_id', pd.producto_detalle_id,
               'codigo',              det.codigo_interno,
               'nombre',              pr.nombre,
               'atributos',           det.atributos,
               'cantidad',            pd.cantidad,
               'precio_unitario',     pd.precio_unitario,
               'total',               pd.total,
               'stock_actual',        det.stock_actual)
             order by pd.created_at, pd.id)
        from public.st_pedidos_detalle pd
        left join public.pos_productos_detalle det on det.id = pd.producto_detalle_id
        left join public.pos_productos pr on pr.id = det.producto_id
       where pd.pedido_id = p.id
         and pd.deleted_at is null), '[]'::jsonb)
  )
  from public.st_pedidos p
  left join public.st_direcciones d on d.id = p.direccion_envio_id
  left join public.pos_ventas v on v.id = p.venta_id
  left join public.pos_usuarios gu on gu.id = p.gestionado_por
  where p.id = p_pedido_id
    and p.deleted_at is null;
$f$;

revoke all on function public.pos_usuario_sesion() from public, anon, authenticated;
revoke all on function public.pos_pedido_web_json(uuid) from public, anon, authenticated;

-- 4. Funciones publicas para el POS -----------------------------------------
create or replace function public.pos_pedidos_web_contar()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
begin
  if public.pos_usuario_sesion() is null then
    raise exception '[POS_SESION] Inicia sesion en el POS para ver los pedidos web.';
  end if;
  return (select count(*)::int
            from public.st_pedidos p
           where p.estado = 'PENDIENTE'
             and p.deleted_at is null);
end;
$f$;

create or replace function public.pos_pedidos_web_listar(p_vista text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_vista text := lower(btrim(coalesce(p_vista, 'pendientes')));
begin
  if public.pos_usuario_sesion() is null then
    raise exception '[POS_SESION] Inicia sesion en el POS para ver los pedidos web.';
  end if;
  if v_vista not in ('pendientes', 'gestionados') then
    raise exception '[POS_VISTA] Vista no valida.';
  end if;

  if v_vista = 'pendientes' then
    return coalesce((
      select jsonb_agg(public.pos_pedido_web_json(x.id) order by x.created_at)
        from (select p.id, p.created_at
                from public.st_pedidos p
               where p.estado = 'PENDIENTE'
                 and p.deleted_at is null
               order by p.created_at
               limit 200) x), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(public.pos_pedido_web_json(x.id) order by x.gestionado_at desc)
      from (select p.id, p.gestionado_at
              from public.st_pedidos p
             where p.gestionado_at is not null
               and p.gestionado_at > now() - interval '30 days'
               and p.deleted_at is null
             order by p.gestionado_at desc
             limit 200) x), '[]'::jsonb);
end;
$f$;

create or replace function public.pos_pedido_web_detalle(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_json jsonb;
begin
  if public.pos_usuario_sesion() is null then
    raise exception '[POS_SESION] Inicia sesion en el POS para ver los pedidos web.';
  end if;
  v_json := public.pos_pedido_web_json(p_pedido_id);
  if v_json is null then
    raise exception '[POS_PEDIDO] El pedido no existe.';
  end if;
  return v_json;
end;
$f$;

create or replace function public.pos_pedido_web_cerrar(
  p_pedido_id    uuid,
  p_resultado    text,
  p_numero_venta text,
  p_nota         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_usuario   uuid;
  v_resultado text := lower(btrim(coalesce(p_resultado, '')));
  v_estado    text;
  v_numero    text := nullif(btrim(coalesce(p_numero_venta, '')), '');
  v_nota      text := nullif(btrim(coalesce(p_nota, '')), '');
  v_venta_id  uuid;
  v_pedido    record;
  v_otro      text;
begin
  v_usuario := public.pos_usuario_sesion();
  if v_usuario is null then
    raise exception '[POS_SESION] Inicia sesion en el POS para gestionar los pedidos web.';
  end if;

  v_estado := case v_resultado
    when 'venta'         then 'CONFIRMADO'
    when 'no_concretado' then 'CANCELADO'
    else null
  end;
  if v_estado is null then
    raise exception '[POS_RESULTADO] Elige "Venta registrada" o "No se concreto".';
  end if;
  if v_nota is not null and char_length(v_nota) > 500 then
    raise exception '[POS_NOTA] La nota no puede superar 500 caracteres.';
  end if;
  if v_numero is not null and v_resultado <> 'venta' then
    raise exception '[POS_VENTA] El numero de venta solo aplica a "Venta registrada".';
  end if;

  select p.id, p.estado, p.numero_pedido into v_pedido
    from public.st_pedidos p
   where p.id = p_pedido_id
     and p.deleted_at is null
   for update;
  if not found then
    raise exception '[POS_PEDIDO] El pedido no existe.';
  end if;
  if v_pedido.estado <> 'PENDIENTE' then
    raise exception '[POS_YA_GESTIONADO] El pedido % ya fue gestionado.', v_pedido.numero_pedido;
  end if;

  if v_numero is not null then
    select v.id into v_venta_id
      from public.pos_ventas v
     where upper(btrim(v.numero_venta)) = upper(v_numero)
       and v.deleted_at is null
       and upper(coalesce(v.estado, '')) not in ('ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO')
     order by v.created_at desc
     limit 1;
    if v_venta_id is null then
      raise exception '[POS_VENTA] No existe una venta activa con el numero %.', v_numero;
    end if;
    select p.numero_pedido into v_otro
      from public.st_pedidos p
     where p.venta_id = v_venta_id
       and p.id <> p_pedido_id
       and p.deleted_at is null
     limit 1;
    if v_otro is not null then
      raise exception '[POS_VENTA] La venta % ya esta enlazada al pedido %.', v_numero, v_otro;
    end if;
  end if;

  update public.st_pedidos
     set estado         = v_estado,
         gestionado_at  = now(),
         gestionado_por = v_usuario,
         nota_gestion   = v_nota,
         venta_id       = coalesce(v_venta_id, venta_id),
         updated_by     = v_usuario,
         updated_at     = now()
   where id = p_pedido_id;

  return public.pos_pedido_web_json(p_pedido_id);
end;
$f$;

revoke all on function public.pos_pedidos_web_contar() from public, anon;
revoke all on function public.pos_pedidos_web_listar(text) from public, anon;
revoke all on function public.pos_pedido_web_detalle(uuid) from public, anon;
revoke all on function public.pos_pedido_web_cerrar(uuid, text, text, text) from public, anon;
grant execute on function public.pos_pedidos_web_contar() to authenticated;
grant execute on function public.pos_pedidos_web_listar(text) to authenticated;
grant execute on function public.pos_pedido_web_detalle(uuid) to authenticated;
grant execute on function public.pos_pedido_web_cerrar(uuid, text, text, text) to authenticated;

commit;

-- ------------------------------------------------------------
-- VERIFICACION (solo lectura, ejecutar por separado)
--   -- 1) columnas nuevas (3 filas):
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'st_pedidos'
--      and column_name in ('gestionado_at', 'gestionado_por', 'nota_gestion');
--   -- 2) funciones y quien las ejecuta (anon NO debe aparecer):
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name like 'pos_pedido%web%'
--    order by 1, 2;
--   -- 3) Desde el SQL Editor (sin sesion de POS) la funcion debe responder [POS_SESION]:
--   select public.pos_pedidos_web_contar();
--   -- 4) Pedidos pendientes (lectura directa, solo para comparar con el POS):
--   select numero_pedido, estado, created_at from public.st_pedidos
--    where estado = 'PENDIENTE' and deleted_at is null order by created_at;
-- ------------------------------------------------------------
