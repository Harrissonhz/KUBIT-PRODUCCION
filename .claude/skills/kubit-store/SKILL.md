---
name: kubit-store
description: Reglas de negocio vigentes del módulo Tienda Virtual (apps/store) del ecosistema Kubit. Usar cuando se trabaje en catálogo público, ficha de producto, carrito, checkout, envíos, medios de pago, pedidos web (tablas st_*), la función st_crear_pedido, los scripts SQL de la tienda o la gestión de los pedidos web desde el POS.
metadata:
  module: Store
  project: Kubit
  spec: 04-store-spec.md
  updated: 2026-11-08
---

# Módulo Tienda Virtual - Kubit

Este skill resume las reglas **vigentes en producción** (noviembre de 2026, fases T1 a T4) del módulo Store (Tienda Virtual): catálogo público, carrito y pedidos web como invitado que se confirman y cobran por WhatsApp, y su gestión desde el POS.

**Antes de cambiar código o SQL de la tienda, leer:**
1. `AGENTS.md` §5.1 (reglas de la tienda), §5.2 (pedidos web en el POS), §10.4 y §10.5 (credenciales por ambiente y usuarios del POS).
2. `apps/store/specs/hallazgos-tienda.md` (hallazgos ST-01 a ST-31, riesgos RA-01 a RA-05, decisiones D1 a D35, plan T1 a T6).
3. `specs/04-store-spec.md` §2.6, §3.4, §3.9, §3.10, §3.11 y §5.3, y `specs/11-api-contracts.md` §9 y §10.

Ante una contradicción con otros documentos antiguos (checkout de 7 operaciones REST, registro obligatorio, pasarela integrada, descuento de inventario, estados `PAGADO`/`ENVIADO`/`ENTREGADO`), **prevalece este skill** junto con los documentos de arriba.

## Tablas del módulo

- Prefijo `st_*`. Esquema base (`specs/01-schema.sql`): 10 tablas, entre ellas `st_pedidos`, `st_pedidos_detalle`, `st_direcciones`, `st_envios`, `st_pagos_online`.
- Agregadas en T3b (`specs/17-store-checkout-coherente.sql`): `st_configuracion`, `st_tarifas_envio`, `st_destinos_envio`.
- Columnas agregadas: `st_direcciones.email` (T2), `st_pedidos.medio_pago_web` (T3b) y `st_pedidos.gestionado_at`, `gestionado_por`, `nota_gestion` (T4, `specs/18-pos-pedidos-web.sql`).
- Tablas compartidas que la tienda **solo lee**: `pos_productos`, `pos_productos_detalle`, `pos_categorias`, multimedia, `pos_clientes` (cliente genérico) y `pos_canales_venta` (canal `web`).

## Reglas de negocio

### Catálogo y ficha
- Los productos salen de `pos_productos` y `pos_productos_detalle` (POS es la fuente de verdad). Las variantes eliminadas (`deleted_at`) no se muestran.
- Cada variante tiene su propio precio. Si las variantes tienen precios distintos, la grilla muestra "Desde $X" y el botón "Elegir opción" (lleva a la ficha).
- Una variante con stock 0 se ve tachada y no se puede agregar.
- Ficha: botón "Preguntar por WhatsApp" con producto, opción, SKU, precio y enlace (consulta, no crea pedido).
- Paginación con orden aleatorio **fijo por visita** (semilla en `sessionStorage`, clave `kubit_orden_semilla`).

### Carrito
- Vive en `localStorage` (`kubit_carrito`). Cada línea es una **variante** (`detalleId`); las líneas sin variante se descartan con aviso.
- No requiere registro ni login.
- Al abrir carrito y checkout se vuelve a leer el precio del POS (`utils.js::refrescarPreciosCarrito()`) y se avisa si cambió.
- Barra "Te faltan $X para envío gratis" y aviso de pedido mínimo (`st_config_tienda`).

### Checkout
- Formulario: nombre, **celular con WhatsApp obligatorio** (10 dígitos, empieza en 3), correo opcional, dirección, departamento y ciudad (`colombia.js`). **Sin cédula ni registro.**
- Envío por zona: al elegir la ciudad se llama `st_cotizar_envio` y se muestran valor y "Llega en N–M días hábiles". Zonas: `local` (Valle de Aburrá, solo Antioquia), `antioquia`, `nacional_principal`, `nacional` (por defecto), `especial`. Contraentrega sin recargo.
- Envío gratis desde $80.000 y pedido mínimo $15.000, ambos sobre el **subtotal de productos sin envío** (`st_configuracion`).
- Tres medios de pago (columna `st_pedidos.medio_pago_web`): `transferencia` (Bre-B), `mercado_pago` (tarjeta vía Tu Link de monto libre) y `contraentrega`. **No usar `pos_metodos_pago`** (el POS la lista al vender).
- **Crear el pedido solo con `rpc('st_crear_pedido', ...)`**, una sola llamada. El navegador envía datos del comprador, medio de pago y `[{producto_detalle_id, cantidad}]`. **Nunca** enviar precios, totales, cliente ni número, ni insertar directo en `st_pedidos`, `st_pedidos_detalle`, `st_direcciones` o `pos_clientes`.
- Confirmación: número, total, envío y días; instrucciones según el medio (llave con botón "Copiar" y titular; "Pagar con Mercado Pago"; o pago en efectivo al recibir) y botón "Confirmar por WhatsApp". Los datos de pago aparecen **después** de crear el pedido.

### Pedidos
- **Número de pedido:** `KBT-AAAAMM-NNNNNN` (ej. `KBT-202611-000012`), generado por la secuencia `st_pedidos_numero_seq` (consecutivo global que no reinicia por mes) con índice único.
- Todos los pedidos web quedan a nombre del cliente genérico **CONSUMIDOR Ecommerce** (`CC 222222222222`, debe existir exactamente uno). Los datos reales del comprador van en `st_direcciones`. La tienda no crea ni actualiza clientes.
- Estado inicial `PENDIENTE`. **En la práctica solo se usan `PENDIENTE`, `CONFIRMADO` y `CANCELADO`** (T4): el pedido se gestiona por WhatsApp y se cierra desde el POS. `PAGADO`, `ENVIADO`, `ENTREGADO` y `DEVUELTO` existen en la base pero no se usan; tampoco `st_envios` ni `st_pagos_online`.
- **Stock (RA-05):** el pedido no se rechaza por stock. Si la cantidad supera el disponible queda en `notas`: `Stock insuficiente: SKU (pedido N, disponible M)`, y la confirmación **no** muestra instrucciones de pago.
- Límite anti-abuso: 5 pedidos `PENDIENTE` por celular en 24 horas.
- Errores de la función con prefijo `[ST_xxx]` (`ST_NOMBRE`, `ST_CELULAR`, `ST_EMAIL`, `ST_DIRECCION`, `ST_UBICACION`, `ST_PAGO`, `ST_ITEMS`, `ST_MINIMO`, `ST_LIMITE`, `ST_CONFIG`); el checkout muestra solo el texto.
- No hay pasarela integrada ni correo de confirmación: el pago se confirma a mano contra el banco o Mercado Pago.

### Integración con POS (T4)
- **El pedido web no mueve inventario ni crea ventas ni clientes.** El stock solo cambia cuando la venta se registra a mano en el POS (canal Web; cliente creado en Clientes o `222222222222`).
- El POS **avisa y muestra** los pedidos `PENDIENTE`: enlace "Pedidos web (N)" en el menú, tarjeta en el Panel y aviso emergente una vez por inicio de sesión (`pedidos-web-aviso.js`); la página `pedidos-web.html` muestra los datos para escribirle al cliente por WhatsApp.
- El POS **no lee** `st_pedidos`, `st_pedidos_detalle` ni `st_direcciones` directo: usa las funciones `pos_pedidos_web_contar`, `pos_pedidos_web_listar`, `pos_pedido_web_detalle` y `pos_pedido_web_cerrar` (`specs/18-pos-pedidos-web.sql`, solo `authenticated`; exigen un usuario activo de `pos_usuarios` con el mismo `id` que `auth.users`). Contratos en `specs/11-api-contracts.md` §10.
- Cerrar un pedido: "Venta registrada" (`CONFIRMADO`, con número de venta opcional que se enlaza en `venta_id`) o "No se concretó" (`CANCELADO`), sin motivo y con nota opcional. Solo se cierran pedidos `PENDIENTE`.
- Fuera de alcance: estados intermedios, registro de pagos y guías, "Crear venta en POS" automático y pantalla de configuración de la tienda (ST-31, propuesta aparte).

### Configuración
- `st_configuracion` (claves `envio_gratis_desde`, `pedido_minimo`, `envio_zona_defecto`, `bre_b_llave`, `bre_b_titular`, `bre_b_qr_url`, `mercado_pago_link`, `whatsapp`), `st_tarifas_envio` y `st_destinos_envio` **solo se cambian por SQL** en el editor de Supabase (`update ... set valor = ...`). No hay pantalla (ST-31).
- Esas tablas no están abiertas a `anon` ni a `authenticated`; se leen con funciones `security definer`.
- Si cambian `envio_gratis_desde` o `pedido_minimo`, actualizar también los montos escritos en `terminos-condiciones.html` y `preguntas-frecuentes.html`.

## Seguridad y ambientes
- Rol `anon`: sin acceso a `st_pedidos`, `st_pedidos_detalle`, `st_direcciones` ni a las tablas de configuración. Ejecuta `st_crear_pedido`, `st_cotizar_envio` y `st_config_tienda`. `pos_clientes` conserva lectura pública (RA-01) e inserción (RA-04, temporal).
- Credenciales por ambiente: **nunca** copiar entre `KUBIT-Pruebas` (QA) y `KUBIT-PRODUCCION` los archivos `apps/store/js/api/supabase-client.js`, `apps/pos/js/config.js` y `apps/wms/js/config.js`.
- Commits con `git add` por archivo (nunca `git add .`). Antes del commit, `git diff --cached | grep -c "eyJ"` debe dar 0 (salvo cuando el commit incluye `tests/store/ambiente.test.mjs`).

## SQL de la tienda
- Scripts: `03-seed-store-grants.sql`, `15-store-pedido-seguro.sql`, `16-store-cerrar-acceso-anon.sql`, `17-store-checkout-coherente.sql` y `18-pos-pedidos-web.sql` (orden en `specs/00-bootstrap.sql`).
- El usuario ejecuta los scripts **a mano** en el SQL Editor de Supabase: primero QA, luego producción. Un bloque `begin; ... commit;` se ejecuta completo en una sola corrida.
- Un script que cierra permisos va **después** de publicar el frontend que ya no los necesita.
- Un script que carga valores de prueba se acompaña, en producción, de los `UPDATE` con valores reales en la misma sesión.

## Tests
- Tienda: `node --test tests/store/*.test.mjs` (111 casos; `.mjs`, `node:test` + `node:vm`, sin tocar la base; los SQL se validan como texto).
- Pedidos web del POS: `node --test tests/pos/*.test.mjs` (29 casos, mismo estilo).
- POS: `npm test` (Vitest, 119; solo `tests/**/*.test.js`). No crear tests de la tienda ni de pedidos web con extensión `.js`.
- Cada fase agrega su propio archivo de test y los anteriores deben seguir pasando. `ambiente.test.mjs` verifica que la tienda apunte al mismo proyecto que el POS/WMS y use la llave `anon`.

## Convenciones
- Mismo prefijo `KBT` que el módulo POS.
- Todos los IDs son UUID v4.
- Soft delete con `deleted_at` nullable.
- Timestamps con `timestamptz` y `default now()`; fechas del pedido en hora de Bogotá.
- Caché de la tienda: `apps/store/service-worker.js`, `outletshop-YYYYMMDD-NN`, se sube en cada deploy (vigente `outletshop-20261108-02`). Caché del POS: `kubit-pos-YYYYMMDD-NN` (vigente `kubit-pos-20261108-01`).
- Archivos modificados conservan su formato de fin de línea (CRLF o LF) y UTF-8.
