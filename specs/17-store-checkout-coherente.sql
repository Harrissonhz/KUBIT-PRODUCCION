-- ============================================================
-- 17-store-checkout-coherente.sql — Kubit Store T3b (checkout coherente)
-- Fecha: 2026-11-08 · Hallazgos: ST-09, ST-10, ST-11
-- ------------------------------------------------------------
-- QUE HACE (solo agrega y reemplaza la funcion; NO cierra accesos):
--   1. st_configuracion: parametros de la tienda (envio gratis, pedido minimo,
--      llave Bre-B, titular, QR, link de Mercado Pago, WhatsApp).
--   2. st_tarifas_envio (zonas: valor y dias) y st_destinos_envio
--      (departamento/ciudad -> zona). Lo que no coincide va a la zona por defecto.
--   3. st_pedidos.medio_pago_web: medio de pago de la tienda
--      (transferencia | mercado_pago | contraentrega). pos_metodos_pago NO se toca.
--   4. Funciones:
--        st_cfg(clave)              interna (no la ejecuta anon)
--        st_normalizar_texto(t)     interna (minusculas, sin tildes)
--        st_zona_envio(dep, ciudad) interna
--        st_config_tienda()         publica: envio gratis, pedido minimo, WhatsApp
--        st_cotizar_envio(dep, ciu) publica: zona, valor y dias del envio
--        st_crear_pedido(...)       MISMA firma de T2; ahora calcula envio por zona,
--                                   envio gratis, pedido minimo y devuelve las
--                                   instrucciones de pago.
--
-- REGLAS (decisiones 2026-11-08):
--   - Envio gratis desde envio_gratis_desde (subtotal de productos, sin envio),
--     en todas las zonas y medios de pago (RA-03).
--   - Pedido minimo pedido_minimo (subtotal de productos, sin envio).
--   - Contraentrega: misma tarifa de la zona, sin recargo.
--   - Si el pedido tiene "Stock insuficiente" (RA-05) NO se devuelven instrucciones
--     de pago: se confirma disponibilidad por WhatsApp antes del pago.
--   - La llave Bre-B y el link de pago solo se devuelven al crear el pedido (D4).
--   - 'tarjeta' (checkout de T2) se acepta y se guarda como 'mercado_pago'.
--
-- VALORES INICIALES: tarifas, llave, titular y link son de PRUEBA.
--   Antes de produccion actualizalos con los UPDATE del final de este archivo.
--   El script NO sobrescribe valores que ya existan (on conflict do nothing).
--
-- ORDEN: 17 (este) -> publicar frontend T3b -> probar. Primero QA, luego produccion.
-- Idempotente: se puede volver a ejecutar.
--
-- ROLLBACK: volver a ejecutar specs/15-store-pedido-seguro.sql (restaura st_crear_pedido
--   de T2; las tablas y la columna nuevas pueden quedarse).
-- ============================================================

begin;

-- 1. Configuracion ----------------------------------------------------------
create table if not exists public.st_configuracion (
  clave       text primary key,
  valor       text not null default '',
  descripcion text,
  updated_at  timestamptz default now()
);

insert into public.st_configuracion (clave, valor, descripcion) values
  ('envio_gratis_desde',   '80000', 'Envio gratis desde este subtotal de productos (sin envio). Vacio = sin envio gratis'),
  ('pedido_minimo',        '15000', 'Pedido minimo: subtotal de productos (sin envio)'),
  ('envio_zona_defecto',   'nacional', 'Zona para destinos que no esten en st_destinos_envio'),
  ('bre_b_llave',          'LLAVE-PRUEBA-QA', 'Llave Bre-B (alfanumerica) que se muestra al confirmar una transferencia'),
  ('bre_b_titular',        'TITULAR DE PRUEBA', 'Nombre que vera el cliente al transferir'),
  ('bre_b_qr_url',         '', 'URL de la imagen del QR Bre-B (opcional; vacio = no se muestra)'),
  ('mercado_pago_link',    'https://www.mercadopago.com.co/', 'Tu Link de Mercado Pago (monto libre). Provisional en QA'),
  ('whatsapp',             '573054476133', 'WhatsApp de la tienda (con indicativo, sin +)')
on conflict (clave) do nothing;

-- 2. Zonas y destinos de envio ---------------------------------------------
create table if not exists public.st_tarifas_envio (
  codigo     text primary key,
  nombre     text not null,
  valor      numeric not null check (valor >= 0),
  dias_min   integer not null check (dias_min >= 0),
  dias_max   integer not null,
  orden      integer default 0,
  activo     boolean default true,
  updated_at timestamptz default now(),
  check (dias_max >= dias_min)
);

-- VALORES DE PRUEBA (reemplazar por los reales antes de produccion)
insert into public.st_tarifas_envio (codigo, nombre, valor, dias_min, dias_max, orden) values
  ('local',              'Valle de Aburra',     8000, 1, 2, 1),
  ('antioquia',          'Antioquia',          12000, 2, 3, 2),
  ('nacional_principal', 'Ciudades principales', 15000, 3, 4, 3),
  ('nacional',           'Nacional',           18000, 3, 6, 4),
  ('especial',           'Zonas especiales',   35000, 5, 10, 5)
on conflict (codigo) do nothing;

create table if not exists public.st_destinos_envio (
  id           uuid primary key default gen_random_uuid(),
  zona         text not null references public.st_tarifas_envio(codigo),
  departamento text not null,
  ciudad       text,            -- null = todo el departamento
  activo       boolean default true
);

create unique index if not exists ux_st_destinos_envio
  on public.st_destinos_envio (lower(departamento), lower(coalesce(ciudad, '')));

-- Nombres como en apps/store/js/compartido/colombia.js (sin tildes). La comparacion
-- ignora mayusculas y tildes. Regla: ciudad exacta > departamento completo > zona por defecto.
insert into public.st_destinos_envio (zona, departamento, ciudad) values
  ('local', 'Antioquia', 'Medellin'),
  ('local', 'Antioquia', 'Bello'),
  ('local', 'Antioquia', 'Itagui'),
  ('local', 'Antioquia', 'Envigado'),
  ('local', 'Antioquia', 'Sabaneta'),
  ('local', 'Antioquia', 'La Estrella'),
  ('local', 'Antioquia', 'Caldas'),
  ('local', 'Antioquia', 'Copacabana'),
  ('local', 'Antioquia', 'Girardota'),
  ('local', 'Antioquia', 'Barbosa'),
  ('antioquia', 'Antioquia', null),
  ('nacional_principal', 'Bogota', null),
  ('nacional_principal', 'Cundinamarca', 'Bogota'),
  ('nacional_principal', 'Cundinamarca', 'Bogota D.C.'),
  ('nacional_principal', 'Valle del Cauca', 'Cali'),
  ('nacional_principal', 'Valle del Cauca', 'Santiago de Cali'),
  ('nacional_principal', 'Atlantico', 'Barranquilla'),
  ('nacional_principal', 'Santander', 'Bucaramanga'),
  ('nacional_principal', 'Risaralda', 'Pereira'),
  ('nacional_principal', 'Caldas', 'Manizales'),
  ('nacional_principal', 'Quindio', 'Armenia'),
  ('nacional_principal', 'Bolivar', 'Cartagena'),
  ('nacional_principal', 'Bolivar', 'Cartagena de Indias'),
  ('especial', 'San Andres y Providencia', null),
  ('especial', 'Amazonas', null),
  ('especial', 'Guainia', null),
  ('especial', 'Vaupes', null),
  ('especial', 'Vichada', null),
  ('especial', 'Putumayo', null)
on conflict do nothing;

-- Solo el SQL Editor (postgres) y las funciones security definer leen estas tablas
alter table public.st_configuracion  enable row level security;
alter table public.st_tarifas_envio  enable row level security;
alter table public.st_destinos_envio enable row level security;
revoke all on public.st_configuracion  from anon, authenticated;
revoke all on public.st_tarifas_envio  from anon, authenticated;
revoke all on public.st_destinos_envio from anon, authenticated;

-- 3. Medio de pago de la tienda (decision B: columna propia) -----------------
alter table public.st_pedidos add column if not exists medio_pago_web text;
do $chk$ begin
  if not exists (select 1 from pg_constraint where conname = 'st_pedidos_medio_pago_web_check') then
    alter table public.st_pedidos add constraint st_pedidos_medio_pago_web_check
      check (medio_pago_web is null or medio_pago_web in ('transferencia', 'mercado_pago', 'contraentrega'));
  end if;
end $chk$;

-- 4. Funciones internas -----------------------------------------------------
create or replace function public.st_cfg(p_clave text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select valor from public.st_configuracion where clave = p_clave;
$f$;

create or replace function public.st_normalizar_texto(p_texto text)
returns text
language sql
immutable
as $f$
  select lower(btrim(regexp_replace(
           translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
           '\s+', ' ', 'g')));
$f$;

create or replace function public.st_zona_envio(p_departamento text, p_ciudad text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_codigo text;
  v_z      record;
begin
  select d.zona into v_codigo
    from public.st_destinos_envio d
    join public.st_tarifas_envio t on t.codigo = d.zona and coalesce(t.activo, true)
   where coalesce(d.activo, true)
     and public.st_normalizar_texto(d.departamento) = public.st_normalizar_texto(p_departamento)
     and (d.ciudad is null
          or public.st_normalizar_texto(d.ciudad) = public.st_normalizar_texto(p_ciudad))
   order by (d.ciudad is null)   -- primero la ciudad exacta, luego el departamento
   limit 1;

  if v_codigo is null then
    v_codigo := nullif(public.st_cfg('envio_zona_defecto'), '');
  end if;

  select codigo, nombre, valor, dias_min, dias_max into v_z
    from public.st_tarifas_envio
   where codigo = v_codigo and coalesce(activo, true);
  if not found then
    return null;
  end if;

  return jsonb_build_object('codigo', v_z.codigo, 'nombre', v_z.nombre, 'valor', v_z.valor,
                            'dias_min', v_z.dias_min, 'dias_max', v_z.dias_max);
end;
$f$;

revoke all on function public.st_cfg(text) from public, anon, authenticated;
revoke all on function public.st_zona_envio(text, text) from public, anon, authenticated;

-- 5. Funciones publicas de lectura (sin datos sensibles) --------------------
create or replace function public.st_config_tienda()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select jsonb_build_object(
    'envio_gratis_desde', nullif(public.st_cfg('envio_gratis_desde'), '')::numeric,
    'pedido_minimo',      coalesce(nullif(public.st_cfg('pedido_minimo'), '')::numeric, 0),
    'whatsapp',           coalesce(nullif(public.st_cfg('whatsapp'), ''), '573054476133'));
$f$;

create or replace function public.st_cotizar_envio(p_departamento text, p_ciudad text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $f$
declare
  v_zona jsonb;
begin
  if char_length(btrim(coalesce(p_departamento, ''))) < 2 or char_length(btrim(coalesce(p_ciudad, ''))) < 2 then
    return null;
  end if;
  v_zona := public.st_zona_envio(p_departamento, p_ciudad);
  if v_zona is null then
    return null;
  end if;
  return v_zona || jsonb_build_object(
    'envio_gratis_desde', nullif(public.st_cfg('envio_gratis_desde'), '')::numeric);
end;
$f$;

revoke all on function public.st_config_tienda() from public;
revoke all on function public.st_cotizar_envio(text, text) from public;
grant execute on function public.st_config_tienda() to anon, authenticated;
grant execute on function public.st_cotizar_envio(text, text) to anon, authenticated;

-- 6. st_crear_pedido (misma firma de T2) --------------------------------------
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
  -- T3b: el envio, el umbral de envio gratis y el pedido minimo salen de st_configuracion y st_tarifas_envio
  c_cc_numero constant text := '222222222222';

  v_nombre      text;
  v_celular     text;
  v_email       text;
  v_direccion   text;
  v_ciudad      text;
  v_depto       text;
  v_metodo      text;
  v_medio       text;
  v_zona        jsonb;
  v_envio       numeric;
  v_umbral      numeric;
  v_minimo      numeric;
  v_gratis      boolean;
  v_pago        jsonb;
  v_whatsapp    text;

  v_elem        jsonb;
  v_r           record;
  v_d           record;

  v_cliente_ids uuid[];
  v_canal_ids   uuid[];
  v_cliente_id  uuid;
  v_canal_id    uuid;
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

  -- T3b (ST-10): 3 medios reales. 'tarjeta' es el valor del checkout de T2 (compatibilidad):
  -- la tarjeta se paga por el link de Mercado Pago.
  v_metodo := lower(btrim(coalesce(p_metodo_pago, '')));
  v_medio := case v_metodo
    when 'transferencia' then 'transferencia'
    when 'mercado_pago'  then 'mercado_pago'
    when 'tarjeta'       then 'mercado_pago'
    when 'contraentrega' then 'contraentrega'
    else null
  end;
  if v_medio is null then
    raise exception '[ST_PAGO] Selecciona un método de pago.';
  end if;

  -- T3b (ST-09): zona de envio segun departamento y ciudad
  v_zona := public.st_zona_envio(v_depto, v_ciudad);
  if v_zona is null then
    raise exception '[ST_CONFIG] El servicio de pedidos no está disponible en este momento. Escríbenos por WhatsApp.';
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

  -- T3b: pedido minimo y envio gratis se calculan sobre el subtotal de productos (sin envio)
  v_minimo := coalesce(nullif(public.st_cfg('pedido_minimo'), '')::numeric, 0);
  if v_subtotal < v_minimo then
    raise exception '[ST_MINIMO] El pedido mínimo es $% (sin contar el envío). Agrega más productos a tu carrito.',
      replace(to_char(v_minimo, 'FM999,999,999'), ',', '.');
  end if;
  v_umbral := nullif(public.st_cfg('envio_gratis_desde'), '')::numeric;
  v_gratis := v_umbral is not null and v_subtotal >= v_umbral;
  v_envio  := case when v_gratis then 0 else (v_zona->>'valor')::numeric end;
  v_total  := v_subtotal + v_envio;

  -- ---- Numero de pedido (secuencia global, sin colisiones) --------------
  v_ahora_bogota := now() at time zone 'America/Bogota';
  v_numero := 'KBT-' || to_char(v_ahora_bogota, 'YYYYMM') || '-'
              || lpad(nextval('public.st_pedidos_numero_seq')::text, 6, '0');

  v_notas := 'Medio de pago: ' || v_medio || ' | Envio: ' || (v_zona->>'nombre')
             || case when v_gratis then ' (gratis)' else '' end;
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
          fecha_pedido, estado, subtotal, descuento, costo_envio, total, medio_pago_web, notas)
  values (v_numero, v_cliente_id, v_canal_id, v_direccion_id, v_direccion_id,
          v_ahora_bogota::date, 'PENDIENTE', v_subtotal, 0, v_envio, v_total, v_medio, v_notas)
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

  -- T3b (ST-11): instrucciones de pago. NO se muestran si hay stock insuficiente
  -- (se confirma disponibilidad por WhatsApp antes del pago) ni en contraentrega.
  v_whatsapp := coalesce(nullif(public.st_cfg('whatsapp'), ''), '573054476133');
  v_pago := null;
  if v_aviso_stock = '' then
    if v_medio = 'transferencia' then
      v_pago := jsonb_build_object(
        'tipo',    'transferencia',
        'llave',   nullif(public.st_cfg('bre_b_llave'), ''),
        'titular', nullif(public.st_cfg('bre_b_titular'), ''),
        'qr_url',  nullif(public.st_cfg('bre_b_qr_url'), ''));
    elsif v_medio = 'mercado_pago' then
      v_pago := jsonb_build_object(
        'tipo', 'mercado_pago',
        'link', nullif(public.st_cfg('mercado_pago_link'), ''));
    end if;
  end if;

  return jsonb_build_object(
    'numero_pedido',      v_numero,
    'subtotal',           v_subtotal,
    'costo_envio',        v_envio,
    'total',              v_total,
    'total_items',        v_total_items,
    'lineas',             v_lineas,
    'medio_pago',         v_medio,
    'zona',               v_zona->>'codigo',
    'zona_nombre',        v_zona->>'nombre',
    'dias_min',           (v_zona->>'dias_min')::int,
    'dias_max',           (v_zona->>'dias_max')::int,
    'envio_gratis',       v_gratis,
    'stock_insuficiente', v_aviso_stock <> '',
    'pago',               v_pago,
    'whatsapp',           v_whatsapp
  );
end;
$$;

comment on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) is
  'Kubit Store T3b: crea un pedido web en una transaccion. Precio del POS; envio por zona y gratis desde el umbral; pedido minimo; medio de pago en medio_pago_web; no mueve inventario.';

revoke all on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.st_crear_pedido(text,text,text,text,text,text,text,jsonb) to anon, authenticated;

commit;

-- ------------------------------------------------------------
-- VERIFICACION (ejecutar por separado, solo lectura)
--   select public.st_config_tienda();
--   -- debe dar {"envio_gratis_desde": 80000, "pedido_minimo": 15000, "whatsapp": "573054476133"}
--   select public.st_cotizar_envio('Antioquia', 'Itagüí');      -- local, 8000
--   select public.st_cotizar_envio('Antioquia', 'Rionegro');    -- antioquia, 12000
--   select public.st_cotizar_envio('Valle del Cauca', 'Cali');  -- nacional_principal, 15000
--   select public.st_cotizar_envio('Narino', 'Pasto');          -- nacional, 18000 (por defecto)
--   select public.st_cotizar_envio('Amazonas', 'Leticia');      -- especial, 35000
--   select public.st_cotizar_envio('Santander', 'Barbosa');     -- nacional (NO local)
--
-- PRUEBA SIN DEJAR DATOS (reemplaza el UUID; termina en ROLLBACK; ejecutar TODO junto):
--   begin;
--   select public.st_crear_pedido('Prueba QA', '300 123 4567', null, 'Calle 1 # 2-3',
--          'Itagüí', 'Antioquia', 'transferencia',
--          jsonb_build_array(jsonb_build_object('producto_detalle_id', 'UUID_DE_UNA_VARIANTE', 'cantidad', 1)));
--   rollback;
--
-- ANTES DE PRODUCCION: valores reales (ejecutar en produccion despues de este script)
--   update public.st_configuracion set valor = 'TU-LLAVE-BRE-B', updated_at = now() where clave = 'bre_b_llave';
--   update public.st_configuracion set valor = 'NOMBRE DEL TITULAR', updated_at = now() where clave = 'bre_b_titular';
--   update public.st_configuracion set valor = 'https://link.mercadopago.com.co/TU-LINK', updated_at = now() where clave = 'mercado_pago_link';
--   update public.st_tarifas_envio set valor = 0000, dias_min = 1, dias_max = 2, updated_at = now() where codigo = 'local';
--   update public.st_tarifas_envio set valor = 0000, dias_min = 2, dias_max = 3, updated_at = now() where codigo = 'antioquia';
--   update public.st_tarifas_envio set valor = 0000, dias_min = 3, dias_max = 4, updated_at = now() where codigo = 'nacional_principal';
--   update public.st_tarifas_envio set valor = 0000, dias_min = 3, dias_max = 6, updated_at = now() where codigo = 'nacional';
--   update public.st_tarifas_envio set valor = 0000, dias_min = 5, dias_max = 10, updated_at = now() where codigo = 'especial';
--   select * from public.st_configuracion order by clave;
--   select * from public.st_tarifas_envio order by orden;
-- ------------------------------------------------------------
