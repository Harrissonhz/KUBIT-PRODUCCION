-- ============================================================
-- P1-prechequeo.sql — Kubit-WMS · Prechequeo de PRODUCCION (version 2)
-- Plan: apps/wms/specs/despliegue-produccion.md (v5), paso 0.3
--
-- *** 100% SOLO LECTURA ***
-- Solo contiene SELECT. No crea, modifica ni bloquea nada en el POS,
-- la Tienda ni el WMS. Se puede ejecutar en horario normal.
--
-- DONDE: SQL Editor de PRODUCCION. Confirmar en la URL: gxqcybboiskwznxdioun
-- COMO:  ejecutar CADA BLOQUE por separado (el SQL Editor solo muestra el
--        resultado de la ultima consulta) y comparar con "ESPERADO".
--        Pegar las salidas para revisarlas antes de la ventana.
--
-- Si se ejecuta en PRUEBAS (para practicar): el bloque 1 mostrara los
-- objetos wms_* que ya existen alli; es lo esperado en ese ambiente.
-- ============================================================


-- ============================================================
-- BLOQUE 1 — No debe existir NADA del WMS en produccion
-- ESPERADO: 0 filas.
-- Si aparece algo: NO continuar; puede ser un intento anterior.
-- ============================================================
select 'tabla/vista' as tipo, c.relname as nombre
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'wms\_%'
union all
select 'funcion', p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
union all
select 'politica', tablename || ' / ' || policyname
from pg_policies
where schemaname = 'public' and tablename like 'wms\_%'
order by 1, 2;


-- ============================================================
-- BLOQUE 2 — Columnas del POS que el WMS LEE (deben existir todas)
-- ESPERADO: 0 filas.
-- Cada fila que aparezca es una columna que falta en produccion: NO continuar.
-- ============================================================
with requeridas(tabla, columna) as (values
  ('pos_productos', 'id'),
  ('pos_productos', 'nombre'),
  ('pos_productos', 'tipo_producto'),
  ('pos_productos', 'activo'),
  ('pos_productos', 'deleted_at'),
  ('pos_productos_detalle', 'id'),
  ('pos_productos_detalle', 'producto_id'),
  ('pos_productos_detalle', 'codigo_interno'),
  ('pos_productos_detalle', 'codigo_barras'),
  ('pos_productos_detalle', 'stock_actual'),
  ('pos_productos_detalle', 'atributos'),
  ('pos_productos_detalle', 'deleted_at'),
  ('pos_movimientos_inventario', 'id'),
  ('pos_movimientos_inventario', 'fecha'),
  ('pos_movimientos_inventario', 'tipo_movimiento'),
  ('pos_movimientos_inventario', 'producto_detalle_id'),
  ('pos_movimientos_inventario', 'cantidad'),
  ('pos_movimientos_inventario', 'motivo'),
  ('pos_movimientos_inventario', 'referencia'),
  ('pos_movimientos_inventario', 'deleted_at'),
  ('pos_ventas', 'id'),
  ('pos_ventas', 'numero_venta'),
  ('pos_ventas', 'fecha_venta'),
  ('pos_ventas', 'estado'),
  ('pos_ventas', 'created_at'),
  ('pos_ventas', 'deleted_at'),
  ('pos_compras', 'id'),
  ('pos_compras', 'numero_orden'),
  ('pos_compras', 'created_at'),
  ('pos_compras', 'deleted_at'),
  ('pos_usuarios', 'id'),
  ('pos_usuarios', 'deleted_at'),
  ('pos_configuracion_empresa', 'logo_url'),
  ('pos_configuracion_empresa', 'created_at'),
  ('pos_configuracion_empresa', 'deleted_at')
)
select r.tabla, r.columna as columna_faltante
from requeridas r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.tabla
 and c.column_name = r.columna
where c.column_name is null
order by 1, 2;


-- ============================================================
-- BLOQUE 3 — Tipos de dato de las columnas clave
-- ESPERADO (comparar con pruebas):
--   pos_productos_detalle.id, pos_usuarios.id, pos_movimientos_inventario.id -> uuid
--   stock_actual y cantidad -> integer (o numeric SIN decimales; ver bloque 6)
--   fecha, fecha_venta, created_at -> timestamp with time zone
--   numero_orden -> integer
-- ============================================================
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('pos_productos_detalle', 'id'),
    ('pos_productos_detalle', 'stock_actual'),
    ('pos_usuarios', 'id'),
    ('pos_movimientos_inventario', 'id'),
    ('pos_movimientos_inventario', 'cantidad'),
    ('pos_movimientos_inventario', 'fecha'),
    ('pos_ventas', 'fecha_venta'),
    ('pos_compras', 'numero_orden'),
    ('pos_compras', 'created_at')
  )
order by 1, 2;


-- ============================================================
-- BLOQUE 4 — Funciones y extensiones que el WMS necesita
-- ESPERADO: las 4 columnas en true.
-- ============================================================
select
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'update_updated_at')      as update_updated_at_existe,
  exists (select 1 from pg_proc where proname = 'gen_random_uuid')            as gen_random_uuid_existe,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'auth' and p.proname = 'uid')                     as auth_uid_existe,
  current_setting('server_version_num')::int >= 150000                         as postgres_15_o_mayor;


-- ============================================================
-- BLOQUE 5 — Productos por tipo (D5: los digitales no entran al WMS)
-- ESPERADO: ver cuantos son 'Fisico', NULL y 'Digital'.
-- Si aparece otro valor (ej. 'fisico' en minuscula), avisar: el WMS
-- trata como fisico todo lo que NO sea exactamente 'Digital'.
-- ============================================================
select coalesce(p.tipo_producto, '(NULL)') as tipo_producto,
       count(*)                                   as skus,
       coalesce(sum(pd.stock_actual), 0)          as unidades
from pos_productos_detalle pd
join pos_productos p on p.id = pd.producto_id
where pd.deleted_at is null and p.deleted_at is null
group by 1
order by 1;


-- ============================================================
-- BLOQUE 6 — Volumen que cargara wms_inicializar() y casos especiales
-- ESPERADO:
--   skus_a_cargar / unidades_a_cargar: lo que quedara en SIN_UBICAR
--   skus_stock_negativo: 0 (si no, corregirlos EN EL POS antes de la ventana)
--   skus_stock_con_decimales: 0 (el WMS cuenta unidades enteras)
-- ============================================================
select
  count(*) filter (where pd.stock_actual > 0)                                   as skus_a_cargar,
  coalesce(sum(pd.stock_actual) filter (where pd.stock_actual > 0), 0)          as unidades_a_cargar,
  count(*) filter (where pd.stock_actual < 0)                                   as skus_stock_negativo,
  count(*) filter (where pd.stock_actual <> trunc(pd.stock_actual::numeric))    as skus_stock_con_decimales
from pos_productos_detalle pd
join pos_productos p on p.id = pd.producto_id
where pd.deleted_at is null
  and p.tipo_producto is distinct from 'Digital';


-- ============================================================
-- BLOQUE 7 — Productos con stock negativo (solo si el bloque 6 dio > 0)
-- ESPERADO: 0 filas.
-- ============================================================
select pd.codigo_interno, p.nombre, pd.stock_actual
from pos_productos_detalle pd
join pos_productos p on p.id = pd.producto_id
where pd.deleted_at is null
  and p.tipo_producto is distinct from 'Digital'
  and pd.stock_actual < 0
order by pd.stock_actual;


-- ============================================================
-- BLOQUE 8 — Usuarios del POS vs Supabase Auth (auditoria, R-P6)
-- ESPERADO: pos_sin_auth = 0 para el usuario que operara el WMS.
-- Si un usuario del POS no tiene el mismo id en Auth, sus acciones en el
-- WMS quedaran sin created_by (no bloquea).
-- ============================================================
select
  (select count(*) from pos_usuarios where deleted_at is null)                          as usuarios_pos,
  (select count(*) from pos_usuarios u
     where u.deleted_at is null
       and not exists (select 1 from auth.users a where a.id = u.id))                   as pos_sin_auth,
  (select count(*) from auth.users a
     where not exists (select 1 from pos_usuarios u where u.id = a.id))                 as auth_sin_pos;


-- ============================================================
-- BLOQUE 9 — Movimientos del POS por tipo (sincronizacion y R-P9)
-- ESPERADO: ver que tipos usa produccion.
--   entrada_compra, salida_venta: los procesa el WMS.
--   ajuste_incremento, ajuste_decremento, merma: necesarios para averias,
--   faltantes y sobrantes (CR1). Si nunca aparecen, confirmar que el POS
--   permite registrarlos.
--   Otros (ej. devolucion_venta): el WMS los marca NO_SOPORTADO (D2).
-- ============================================================
select tipo_movimiento,
       count(*)                as movimientos,
       min(abs(cantidad))      as cantidad_min,
       max(abs(cantidad))      as cantidad_max,
       max(fecha)              as ultimo
from pos_movimientos_inventario
group by 1
order by 2 desc;


-- ============================================================
-- BLOQUE 10 — Formato de la referencia de ventas y compras (D6)
-- ESPERADO:
--   salida_venta: referencia tipo 'V-...' o vacia con motivo 'Venta #...'
--   entrada_compra: referencia tipo 'OC-<numero>'
-- ============================================================
select tipo_movimiento,
       count(*) filter (where referencia is null)                     as sin_referencia,
       count(*) filter (where referencia ~ '^V-')                     as ref_v,
       count(*) filter (where referencia ~ '^OC-[0-9]+$')             as ref_oc,
       count(*) filter (where referencia is null and motivo ~ '#')    as motivo_con_numero,
       min(referencia)                                                as ejemplo_referencia,
       min(motivo)                                                    as ejemplo_motivo
from pos_movimientos_inventario
where tipo_movimiento in ('salida_venta', 'entrada_compra')
group by 1;


-- ============================================================
-- BLOQUE 11 — Triggers sobre pos_movimientos_inventario (informativo)
-- ESPERADO: solo el de updated_at (igual que en pruebas).
-- Con la regla CR1 el WMS no inserta movimientos; sirve para detectar
-- diferencias de produccion frente a pruebas.
-- ============================================================
select tgname
from pg_trigger
where tgrelid = 'public.pos_movimientos_inventario'::regclass
  and not tgisinternal;


-- ============================================================
-- BLOQUE 12 — Conteos base (GUARDAR: se repiten despues de cada script)
-- ESPERADO: anotar los 4 valores. Deben quedar IDENTICOS despues del
-- despliegue (el WMS no escribe en el POS).
-- ============================================================
select (select count(*) from pos_productos_detalle)                                              as skus,
       (select coalesce(sum(stock_actual), 0) from pos_productos_detalle where deleted_at is null) as stock_total,
       (select count(*) from pos_movimientos_inventario)                                         as movimientos,
       (select count(*) from pos_ventas)                                                         as ventas;

-- ============================================================
-- FIN P1-prechequeo.sql (v2)
-- ============================================================
