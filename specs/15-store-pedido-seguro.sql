-- ============================================================
-- 15-store-pedido-seguro.sql — Kubit Store T2 (pedido seguro)
-- Fecha: 2026-10-30 · Hallazgos: ST-04, ST-07, ST-08 (y base de ST-05)
-- ------------------------------------------------------------
-- QUE HACE (solo agrega; NO cierra nada, el checkout actual sigue funcionando):
--   1. st_direcciones.email (opcional): correo del comprador.
--   2. Secuencia st_pedidos_numero_seq + indice unico en numero_pedido.
--   3. Funcion public.st_crear_pedido(...): crea el pedido completo en UNA
--      transaccion. La tienda (rol anon) solo llama a esta funcion.
--
-- REGLAS (decisiones 2026-10-29):
--   - El pedido NO mueve inventario (D2). El stock solo se compara para dejar
--     un aviso en notas ("Stock insuficiente: ..."); nunca rechaza el pedido.
--   - El precio sale SIEMPRE de pos_productos_detalle.precio_venta. El navegador
--     no envia precios, subtotales ni totales.
--   - NO se crean ni se actualizan clientes. Todos los pedidos web quedan a
--     nombre del cliente "CONSUMIDOR Ecommerce" (CC 222222222222), que debe
--     existir UNA sola vez. Nombre, celular, correo y direccion del comprador
--     quedan en st_direcciones.
--   - Envio fijo $9.900 (T3 / ST-09 lo reemplaza por tarifas por departamento).
--   - Medios de pago (T3 crea Contraentrega y Mercado Pago):
--       transferencia -> Transferencia | contraentrega -> Efectivo | tarjeta -> Tarjeta
--
-- ORDEN: 15 (este) -> publicar el frontend T2 -> probar -> 16 (cierra anon).
-- Ejecutar primero en QA (gbjtdjbopwgbknklwldq) y despues en produccion.
-- Idempotente: se puede volver a ejecutar.
--
-- ROLLBACK (si hiciera falta, ANTES de ejecutar el 16):
--   drop function if exists public.st_crear_pedido(text,text,text,text,text,text,text,jsonb);
--   (la columna email, la secuencia y el indice pueden quedarse.)
-- ============================================================

begin;

-- 1. Correo opcional del comprador ---------------------------------------
alter table public.st_direcciones add column if not exists email text;

-- 2. Numeracion de pedidos (ST-07) ----------------------------------------
-- Consecutivo GLOBAL: KBT-AAAAMM-NNNNNN (AAAAMM = mes de creacion, NNNNNN no reinicia).
create sequence if not exists public.st_pedidos_numero_seq;

-- Si hay pedidos con numero repetido, este indice falla y el script se revierte completo.
create unique index if not exists ux_st_pedidos_numero_pedido
  on public.st_pedidos (numero_pedido);

-- 3. Funcion st_crear_pedido ----------------------------------------------
create or replace function public.st_crear_pedido(
  p_nombre        text,
  p_celular       text,
  p_email         text,
  p_direccion     text,
  p_ciudad        text,
  p_departamento  text,
  p_metodo_pago   text,
  p_items         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_envio constant numeric := 9900;          -- T3 (ST-09): tarifas por departamento
  c_cc_numero constant text := '222222222222';

  v_nombre      text;
  v_celular     text;
  v_email       text;
  v_direccion   text;
  v_ciudad      text;
  v_depto       text;
  v_metodo      text;
  v_metodo_pago_nombre text;

  v_elem        jsonb;
  v_r           record;
  v_d           record;

  v_cliente_ids uuid[];
  v_canal_ids   uuid[];
  v_cliente_id  uuid;
  v_canal_id    uuid;
  v_metodo_id   uuid;
  v_direccion_id uuid;
  v_pedido_id   uuid;

  v_lineas      jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_total       numeric;
  v_total_items integer := 0;
  v_aviso_stock text := '';
  v_notas       text;
  v_recientes   integer;
  v_ahora_bogota timestamp;
  v_numero      text;
begin
  -- ---- Validacion de datos del comprador --------------------------------
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then
    raise exception '[ST_NOMBRE] Escribe tu nombre completo.';
  end if;

  v_celular := regexp_replace(coalesce(p_celular, ''), '[^0-9]', '', 'g');
  if char_length(v_celular) = 12 and left(v_celular, 2) = '57' then
    v_celular := substr(v_celular, 3);
  end if;
  if v_celular !~ '^3[0-9]{9}$' then
    raise exception '[ST_CELULAR] Ingresa un celular colombiano válido de 10 dígitos, por ejemplo 300 123 4567.';
  end if;

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if v_email is not null
     and (char_length(v_email) > 160 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception '[ST_EMAIL] El correo no tiene un formato válido. Corrígelo o déjalo vacío.';
  end if;

  v_direccion := btrim(regexp_replace(coalesce(p_direccion, ''), '\s+', ' ', 'g'));
  if char_length(v_direccion) < 5 or char_length(v_direccion) > 200 then
    raise exception '[ST_DIRECCION] Escribe tu dirección de entrega.';
  end if;

  v_ciudad := btrim(coalesce(p_ciudad, ''));
  v_depto  := btrim(coalesce(p_departamento, ''));
  if char_length(v_ciudad) < 2 or char_length(v_ciudad) > 80
     or char_length(v_depto) < 2 or char_length(v_depto) > 80 then
    raise exception '[ST_UBICACION] Selecciona tu departamento y tu ciudad.';
  end if;

  v_metodo := lower(btrim(coalesce(p_metodo_pago, '')));
  v_metodo_pago_nombre := case v_metodo
    when 'transferencia' then 'Transferencia'
    when 'contraentrega' then 'Efectivo'
    when 'tarjeta'       then 'Tarjeta'
    else null
  end;
  if v_metodo_pago_nombre is null then
    raise exception '[ST_PAGO] Selecciona un método de pago.';
  end if;

  -- ---- Validacion de la forma de los items ------------------------------
  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception '[ST_ITEMS] Tu carrito debe tener entre 1 y 30 productos.';
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception '[ST_ITEMS] Tu carrito tiene datos inválidos. Actualízalo e inténtalo de nuevo.';
    end if;
    if coalesce(v_elem->>'producto_detalle_id', '')
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '[ST_ITEMS] Tu carrito tiene datos inválidos. Actualízalo e inténtalo de nuevo.';
    end if;
    if coalesce(v_elem->>'cantidad', '') !~ '^[0-9]{1,2}$' then
      raise exception '[ST_ITEMS] Las cantidades deben estar entre 1 y 99.';
    end if;
    if (v_elem->>'cantidad')::int < 1 then
      raise exception '[ST_ITEMS] Las cantidades deben estar entre 1 y 99.';
    end if;
  end loop;

  -- ---- Cliente generico y canal (exactamente UNO de cada uno) -----------
  select array_agg(c.id) into v_cliente_ids
    from public.pos_clientes c
   where c.numero_id = c_cc_numero
     and upper(btrim(c.primer_nombre)) = 'CONSUMIDOR'
     and upper(btrim(c.primer_apellido)) = 'ECOMMERCE'
     and c.deleted_at is null
     and coalesce(c.activo, true) = true;
  if coalesce(cardinality(v_cliente_ids), 0) <> 1 then
    raise exception '[ST_CONFIG] El servicio de pedidos no está disponible en este momento. Escríbenos por WhatsApp.';
  end if;
  v_cliente_id := v_cliente_ids[1];

  select array_agg(cv.id) into v_canal_ids
    from public.pos_canales_venta cv
   where cv.codigo = 'web'
     and cv.deleted_at is null
     and coalesce(cv.activo, true) = true;
  if coalesce(cardinality(v_canal_ids), 0) <> 1 then
    raise exception '[ST_CONFIG] El servicio de pedidos no está disponible en este momento. Escríbenos por WhatsApp.';
  end if;
  v_canal_id := v_canal_ids[1];

  -- Medio de pago (si no existe el maestro, el pedido se crea igual; el medio queda en notas)
  select mp.id into v_metodo_id
    from public.pos_metodos_pago mp
   where mp.nombre = v_metodo_pago_nombre
     and mp.deleted_at is null
     and coalesce(mp.activo, true) = true
   order by mp.created_at
   limit 1;

  -- ---- Limite anti-abuso: 5 pedidos PENDIENTES por celular en 24 horas --
  select count(*) into v_recientes
    from public.st_pedidos p
    join public.st_direcciones d on d.id = p.direccion_envio_id
   where d.telefono = v_celular
     and p.estado = 'PENDIENTE'
     and p.deleted_at is null
     and p.created_at > now() - interval '24 hours';
  if v_recientes >= 5 then
    raise exception '[ST_LIMITE] Ya tienes varios pedidos pendientes con este celular. Escríbenos por WhatsApp para confirmarlos.';
  end if;

  -- ---- Precios y validaciones por variante (el precio SIEMPRE sale del POS) ----
  for v_r in
    select (e.value->>'producto_detalle_id')::uuid as id,
           sum((e.value->>'cantidad')::int)        as cant,
           min(e.ord)                              as ord
      from jsonb_array_elements(p_items) with ordinality as e(value, ord)
     group by 1
     order by min(e.ord)
  loop
    select d.id, d.codigo_interno, d.precio_venta, d.stock_actual,
           d.deleted_at as d_borrado,
           p.nombre, p.activo, p.deleted_at as p_borrado
      into v_d
      from public.pos_productos_detalle d
      join public.pos_productos p on p.id = d.producto_id
     where d.id = v_r.id;

    if not found then
      raise exception '[ST_ITEMS] Uno de los productos de tu carrito ya no existe. Actualiza tu carrito e inténtalo de nuevo.';
    end if;
    if v_d.d_borrado is not null or v_d.p_borrado is not null
       or coalesce(v_d.activo, true) = false
       or coalesce(v_d.precio_venta, 0) <= 0 then
      raise exception '[ST_ITEMS] "%" ya no está disponible. Quítalo de tu carrito e inténtalo de nuevo.', v_d.nombre;
    end if;
    if v_r.cant > 99 then
      raise exception '[ST_ITEMS] Las cantidades deben estar entre 1 y 99.';
    end if;

    v_subtotal    := v_subtotal + v_r.cant * v_d.precio_venta;
    v_total_items := v_total_items + v_r.cant;

    -- Aviso de stock (NO rechaza): queda en notas para verlo en el POS
    if coalesce(v_d.stock_actual, 0) < v_r.cant then
      v_aviso_stock := v_aviso_stock
        || case when v_aviso_stock = '' then '' else '; ' end
        || coalesce(v_d.codigo_interno, left(v_d.id::text, 8))
        || ' (pedido ' || v_r.cant || ', disponible ' || greatest(coalesce(v_d.stock_actual, 0), 0) || ')';
    end if;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'producto_detalle_id', v_d.id,
      'codigo',              v_d.codigo_interno,
      'nombre',              v_d.nombre,
      'cantidad',            v_r.cant,
      'precio',              v_d.precio_venta,
      'subtotal',            v_r.cant * v_d.precio_venta
    ));
  end loop;

  v_total := v_subtotal + c_envio;

  -- ---- Numero de pedido (secuencia global, sin colisiones) --------------
  v_ahora_bogota := now() at time zone 'America/Bogota';
  v_numero := 'KBT-' || to_char(v_ahora_bogota, 'YYYYMM') || '-'
              || lpad(nextval('public.st_pedidos_numero_seq')::text, 6, '0');

  v_notas := 'Metodo de pago: ' || v_metodo;
  if v_aviso_stock <> '' then
    v_notas := v_notas || ' | Stock insuficiente: ' || v_aviso_stock;
  end if;

  -- ---- Creacion (todo o nada: cualquier error revierte la llamada completa) ----
  insert into public.st_direcciones
         (cliente_id, tipo, nombre_destinatario, telefono, email, direccion, ciudad, departamento, pais)
  values (v_cliente_id, 'envio', v_nombre, v_celular, v_email, v_direccion, v_ciudad, v_depto, 'Colombia')
  returning id into v_direccion_id;

  insert into public.st_pedidos
         (numero_pedido, cliente_id, canal_id, direccion_envio_id, direccion_facturacion_id,
          fecha_pedido, estado, subtotal, descuento, costo_envio, total, metodo_pago_id, notas)
  values (v_numero, v_cliente_id, v_canal_id, v_direccion_id, v_direccion_id,
          v_ahora_bogota::date, 'PENDIENTE', v_subtotal, 0, c_envio, v_total, v_metodo_id, v_notas)
  returning id into v_pedido_id;

  insert into public.st_pedidos_detalle
         (pedido_id, producto_detalle_id, cantidad, precio_unitario, subtotal, total)
  select v_pedido_id,
         (l->>'producto_detalle_id')::uuid,
         (l->>'cantidad')::int,
         (l->>'precio')::numeric,
         (l->>'subtotal')::numeric,
         (l->>'subtotal')::numeric
    from jsonb_array_elements(v_lineas) as l;

  return jsonb_build_object(
    'numero_pedido', v_numero,
    'subtotal',      v_subtotal,
    'costo_envio',   c_envio,
    'total',         v_total,
    'total_items',   v_total_items,
    'lineas',        v_lineas
  );
end;
$$;

comment on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) is
  'Kubit Store T2: crea un pedido web completo en una transaccion. Precio desde el POS; cliente Consumidor Ecommerce; no mueve inventario.';

-- Permisos: solo se puede ejecutar (la tienda usa la llave anon)
revoke all on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) to anon, authenticated;

commit;

-- ------------------------------------------------------------
-- VERIFICACION (ejecutar por separado, solo lectura)
--   select count(*) from public.pos_clientes
--    where numero_id = '222222222222' and upper(btrim(primer_nombre)) = 'CONSUMIDOR'
--      and upper(btrim(primer_apellido)) = 'ECOMMERCE' and deleted_at is null;   -- debe dar 1
--   select count(*) from public.pos_canales_venta where codigo = 'web' and deleted_at is null;  -- debe dar 1
--
-- PRUEBA SIN DEJAR DATOS (reemplaza el UUID por una variante real; termina en ROLLBACK):
--   begin;
--   select public.st_crear_pedido('Prueba QA', '300 123 4567', null, 'Calle 1 # 2-3',
--          'Itagüí', 'Antioquia', 'contraentrega',
--          jsonb_build_array(jsonb_build_object('producto_detalle_id', 'UUID_DE_UNA_VARIANTE', 'cantidad', 2)));
--   select numero_pedido, total, notas from public.st_pedidos order by created_at desc limit 1;
--   rollback;
-- ------------------------------------------------------------
