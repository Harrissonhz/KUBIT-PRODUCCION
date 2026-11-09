# hallazgos-tienda.md — Hallazgos y plan de mejora de la Tienda (apps/store)

**Versión:** v7 · **Fecha:** 2026-11-09 · **Responsable:** Harrisson Zapata
**Alcance:** código de `apps/store` vigente en producción (`outletshop`), políticas RLS reales de producción y decisiones de negocio.
**Base de datos:** una sola base Supabase por ambiente; prefijos `pos_` (POS), `st_` (Tienda) y `wms_` (WMS). QA = `gbjtdjbopwgbknklwldq`, producción = `gxqcybboiskwznxdioun`.

---

## 1. Contexto y objetivo

- El 99,5 % de las ventas entra por Mercado Libre. La tienda web **no ha recibido ningún pedido real**: todos los pedidos registrados hasta hoy fueron pruebas internas y se borraron (OP-01, OP-02).
- Los clientes que escriben por WhatsApp o redes buscan más información. La tienda se usa para mostrar fotos, descripción y precio; la venta se cierra por chat y casi siempre es **contraentrega**.
- **Objetivo:** que la tienda genere confianza, registre pedidos completos y apoye el cierre por WhatsApp, con el POS como único dueño del inventario.

## 2. Decisiones de negocio

| # | Decisión |
|---|---|
| D1 | Rol de la tienda: checkout propio **y** apoyo por WhatsApp. |
| D2 | El pedido web **no mueve inventario**. La venta se registra manualmente en el POS, que controla stock y movimientos. |
| D3 | Aviso en el POS en tres piezas: contador en el menú lateral, tarjeta en el Panel y página `pedidos-web.html`. Sin pop-up bloqueante. **Ajustada por D29-D30 (T4): hay aviso emergente, una sola vez por sesión.** |
| D4 | Medios de pago: **transferencia con llave**, **link de pago de Mercado Pago** (creado a mano) y **contraentrega**. Sin APIs ni pasarelas integradas. **PayPal descartado.** |
| D5 | El pago se confirma a mano contra el banco o Mercado Pago, nunca solo con una captura. En el POS se registra medio, monto, fecha y referencia. |
| D6 | Contraentrega en todo el país, con confirmación obligatoria por WhatsApp antes de despachar. |
| D7 | Envío dinámico por **departamento**, con excepciones por ciudad, valor normal y valor contraentrega. |
| D8 | Envío gratis desde **$80.000**, configurable, **también en zonas remotas**. |
| D9 | Transportadoras: **ENVIA** e **Interrapidísimo**. La elige el negocio al despachar; el cliente solo ve el valor. |
| D10 | Ficha: "Agregar al carrito" + "Preguntar por WhatsApp" (consulta, no pedido). Checkout: un solo botón "Enviar pedido". Confirmación: número, total, instrucciones de pago y botón "Confirmar por WhatsApp". |
| D11 | **Celular obligatorio** (10 dígitos, inicia en 3). **Correo opcional.** **Sin cédula** (2026-10-29: la cédula es dato de facturación y se pide por WhatsApp solo a quien necesite factura a su nombre). |
| D12 | Se borran los 5 pedidos de prueba (tarea OP-01). |
| D13 | Las variantes de un producto pueden tener precios distintos: la tienda usa el precio de cada variante. |
| D14 | En la grilla, los productos con variantes muestran "Elegir opción" y llevan a la ficha. |
| D15 | Las líneas de carritos guardados sin variante se descartan con un aviso (no hay clientes reales). |
| D16 | (2026-10-29) Todos los pedidos web quedan a nombre del cliente genérico **CONSUMIDOR Ecommerce** (`CC 222222222222`, debe existir una sola vez). La tienda **no crea ni actualiza** clientes en `pos_clientes`. Nombre, celular, correo y dirección del comprador quedan en `st_direcciones`. Si el cliente pide factura a su nombre, en el POS se crea o busca el cliente real y se asigna al pedido. |
| D17 | (2026-10-29) La tienda **no valida ni limita stock** (RA-05). Si la cantidad supera el stock al crear el pedido, el pedido se crea igual y queda el aviso en `notas`: `Stock insuficiente: SKU (pedido N, disponible M)`. |
| D18 | (2026-10-29) El precio del pedido es siempre el del POS (`pos_productos_detalle.precio_venta`). El carrito y el checkout vuelven a leer el precio al abrirse y avisan si cambió. |
| D19 | (2026-10-29) Medios de pago en T2 (temporal, T3 crea los definitivos): transferencia → Transferencia, contraentrega → Efectivo, tarjeta → Tarjeta. El medio elegido también queda en `notas`. |
| D20 | (2026-10-29) La inserción anónima en `pos_clientes` no se quita en T2 para no tocar el POS (RA-04). |
| D21 | (2026-11-08) T3 se divide en **T3a** (ST-12, ST-13; solo frontend) y **T3b** (ST-09, ST-10, ST-11; SQL + checkout). |
| D22 | (2026-11-08) Orden del catálogo: aleatorio pero **fijo durante la visita** (semilla en `sessionStorage`); en una visita nueva cambia. |
| D23 | (2026-11-08) El medio de pago de la tienda se guarda en una columna propia `st_pedidos.medio_pago_web` (`transferencia` / `mercado_pago` / `contraentrega`). **`pos_metodos_pago` no se toca** (el POS la lista al vender). Reemplaza D19. |
| D24 | (2026-11-08) Tres medios en el checkout: **Transferencia Bre-B**, **Tarjeta débito/crédito vía Mercado Pago** y **Contraentrega**. El botón o los datos de pago aparecen **después** de crear el pedido, nunca antes. |
| D25 | (2026-11-08) Bre-B: llave **alfanumérica** con botón "Copiar", nombre del titular y QR opcional. Mercado Pago: **Tu Link con monto libre** ("Paga exactamente $X" y el número de pedido en la descripción). Los valores viven en `st_configuracion`. |
| D26 | (2026-11-08) Envío por **zonas** (`st_tarifas_envio`) con mapeo departamento/ciudad (`st_destinos_envio`); regla ciudad > departamento > zona por defecto (`nacional`). Contraentrega usa la misma tarifa, sin recargo (la comisión de recaudo la asume el negocio). El checkout muestra los días estimados de entrega. |
| D27 | (2026-11-08) **Pedido mínimo $15.000** en productos, sin envío: lo valida `st_crear_pedido` y el checkout lo avisa. Envío gratis desde $80.000 en productos, sin envío. |
| D28 | (2026-11-08) Si el pedido tiene "Stock insuficiente" (RA-05), la confirmación **no muestra instrucciones de pago**: "Te confirmaremos disponibilidad por WhatsApp antes del pago". |
| D29 | (2026-11-08) T4 se reformula: la gestión del pedido web es por **WhatsApp**; el POS solo **avisa y muestra** los datos. La venta se registra a mano en Ventas con canal **Web** (cliente real creado en Clientes, o `222222222222`) y después se **cierra el pedido** en el POS. Se descartan los estados intermedios, el registro de pagos y guías y "Crear venta en POS". Reduce el alcance de D3 y D5 en el POS. |
| D30 | (2026-11-08) Aviso al entrar al POS: aviso emergente **una vez por inicio de sesión** + contador fijo en el menú ("Pedidos web (N)") + tarjeta en el Panel. Implementado en un archivo independiente y de solo lectura (`pedidos-web-aviso.js`); si falla, el POS sigue igual. |
| D31 | (2026-11-08) Permisos: todo usuario activo del POS con sesión puede ver y cerrar pedidos web (hoy solo el administrador); no hay permiso propio. |
| D32 | (2026-11-08) Cierre del pedido: resultado **obligatorio** — "Venta registrada" (`CONFIRMADO`) o "No se concretó" (`CANCELADO`), **sin motivo**; número de venta **opcional** (se valida contra `pos_ventas` y se enlaza en `venta_id`); nota **opcional** (500 caracteres). Solo se cierran pedidos `PENDIENTE`. |
| D33 | (2026-11-08) El POS no lee las tablas `st_*` directo: usa funciones `security definer` (`pos_pedido*_web_*`) que validan al usuario y devuelven el pedido con los datos del comprador (por sus políticas, el POS no puede leer `st_direcciones`). |
| D34 | (2026-11-08) Mensaje inicial de WhatsApp: "Hola {nombre}, te escribimos de OutletShop por tu pedido KBT-… por $X". El correo del comprador solo se muestra si lo escribió (es opcional). |
| D35 | (2026-11-08) Cada pedido es una tarjeta colapsable **cerrada por defecto**, en "Por gestionar" y en "Gestionados (30 días)"; el encabezado muestra número, cliente, total, medio de pago y la etiqueta "Stock insuficiente". Los textos de cantidad, precio y total tienen color explícito en modo claro y oscuro. |
| D36 | (2026-11-09) T5 se divide en **T5a** (ST-16, ST-20, ST-21 y ST-32; solo frontend, sin SQL), **T5b** (ST-17: vista previa al compartir y `sitemap.xml`; requiere configuración en Vercel) y **T5c** (ST-18, ST-19 y ST-33: rendimiento). T5a primero por ser de bajo riesgo. |
| D37 | (2026-11-09) Búsqueda: sin tildes ni mayúsculas, todas las palabras en cualquier orden, sobre nombre, SKU de **todas** las variantes, marca, etiquetas (menos `destacado`) y descripción corta; ordenada por relevancia (SKU exacto, SKU que empieza igual, nombre) y, a igual relevancia, con el orden de la visita de T3a para no romper la paginación. Se calcula en el navegador sobre el catálogo ya cargado: sin SQL. |
| D38 | (2026-11-09) Service worker de la tienda: red primero para HTML, JS, CSS y manifiesto; caché primero para imágenes; solo GET del mismo sitio; precarga archivo por archivo; recarga las páginas abiertas solo al actualizar (no en la primera visita) y **nunca el checkout**; en `localhost` no actúa (se prueba en el Vercel de calidad). |
| D39 | (2026-11-09) Íconos PNG (192, 512, maskable 512 con margen seguro y `apple-touch-icon` 180) generados desde `icon.svg`; el favicon sigue siendo `icon.svg`. El peso del SVG (152 KB) queda para T5c (ST-33). Compilar Tailwind queda fuera de alcance salvo que la medición muestre un problema serio. |

**Fuera de alcance por ahora:** analítica (GA, Pixel, Vercel Analytics), reputación de Mercado Libre en la tienda, cédula en el checkout, pasarelas con API.

## 3. Convenciones

- **Criticidad:** P0 = afecta pedidos, dinero o datos · P1 = el cliente lo ve o frena la venta · P2 = alcance y rendimiento · P3 = deuda técnica.
- **Impacto en ventas:** Alto · Medio · Bajo.
- **Esfuerzo:** S (horas) · M (1–2 días) · L (más de 2 días).
- **Estado:** Pendiente · En curso · Hecho · Aceptado (riesgo asumido) · Cerrado (falso positivo).

## 4. Resumen de hallazgos

| ID | Hallazgo | Criticidad | Impacto en ventas | Esfuerzo | Fase | Estado |
|---|---|---|---|---|---|---|
| ST-01 | El pedido guarda el primer SKU del producto y no la variante elegida | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-02 | El carrito confunde variantes del mismo producto | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-03 | Variante agotada en la ficha agrega el producto sin variante | P0 | Medio | S | T1 | Hecho 2026-10-28 |
| ST-04 | Pedido no atómico y precio definido por el navegador | P0 | Alto | L | T2 | Hecho 2026-11-03 |
| ST-05 | Pedidos, detalle y direcciones legibles y creables sin sesión | P0 | Medio | M | T2 | Hecho 2026-11-03 |
| ST-06 | No se valida stock en carrito ni checkout | — | — | — | — | Aceptado (RA-05) |
| ST-07 | Número de pedido aleatorio con riesgo de colisión | P1 | Bajo | S | T2 | Hecho 2026-11-03 |
| ST-08 | Cliente creado con NIT inventado y reconocido solo por correo | P1 | Medio | M | T2 | Hecho 2026-11-03 |
| ST-09 | Envío fijo e incoherente entre carrito y checkout | P1 | Alto | M | T3b | Hecho 2026-11-08 |
| ST-10 | Promesas falsas: pago con tarjeta y correo de confirmación | P1 | Alto | S | T3b | Hecho 2026-11-08 |
| ST-11 | Sin pantalla de confirmación con instrucciones de pago ni WhatsApp | P1 | Alto | M | T3b | Hecho 2026-11-08 |
| ST-12 | WhatsApp de la ficha abre un chat vacío | P1 | Alto | S | T3a | Hecho 2026-11-08 |
| ST-13 | Paginación con barajado repite y oculta productos | P1 | Medio | S | T3a | Hecho 2026-11-08 |
| ST-14 | Caracteres dañados en textos visibles | — | — | — | — | Cerrado (falso positivo) |
| ST-15 | El POS no avisa ni permite gestionar pedidos web | P1 | Alto | L | T4 | Hecho 2026-11-08 |
| ST-16 | Búsqueda limitada (sin SKU, sensible a tildes) | P2 | Medio | M | T5a | Hecho 2026-11-09 |
| ST-17 | Sin vista previa al compartir (SEO / Open Graph) | P2 | Medio | M | T5b | Pendiente |
| ST-18 | Cada página descarga el catálogo completo | P2 | Bajo | M | T5c | Pendiente |
| ST-19 | Tailwind desde CDN y embebidos de Instagram pesados | P2 | Bajo | M | T5c | Pendiente |
| ST-20 | Service worker puede servir versiones viejas | P2 | Bajo | S | T5a | Hecho 2026-11-09 |
| ST-21 | Ícono del manifiesto solo en SVG (iOS) | P2 | Bajo | S | T5a | Hecho 2026-11-09 |
| ST-22 | `innerHTML` con datos no escapados (XSS potencial) | P3 | Bajo | M | T6 | Pendiente |
| ST-23 | Código duplicado y datos de ejemplo | P3 | Bajo | S | T6 | Pendiente |
| ST-24 | `01-schema.sql` no refleja las políticas RLS de producción | P3 | Bajo | S | T6 | En curso (03, 15 y 16 versionados en T2) |
| ST-25 | El botón de la grilla agrega la primera variante sin preguntar | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-26 | El precio sale siempre de la primera variante | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-27 | La tienda muestra variantes eliminadas en el POS | P0 | Medio | S | T1 | Hecho 2026-10-28 |
| ST-28 | La grilla no indica que las variantes tienen precios distintos | P1 | Medio | S | T1 | Hecho 2026-10-28 |
| ST-29 | El ambiente de pruebas de la tienda apuntaba a la base de producción | P0 | — | S | T2 | Hecho 2026-11-03 |
| ST-30 | Políticas de `st_envios` y `st_pagos_online` dependen de `st_pedidos` | P3 | Bajo | S | T3/T4 | Pendiente (revisar al usarlas) |
| ST-31 | La configuración de la tienda (tarifas, envío gratis, mínimo, llave, link) solo se cambia por SQL | P2 | Bajo | M | Fase propia (propuesto) | Pendiente |
| ST-32 | El buscador de la barra no funciona desde otras páginas ni muestra lo buscado | P2 | Medio | S | T5a | Hecho 2026-11-09 |
| ST-33 | El favicon `icon.svg` pesa 152 KB | P2 | Bajo | S | T5c | Pendiente |
| RA-01 | Lectura pública de `pos_clientes` (Ley 1581) | — | — | — | — | Aceptado |
| RA-02 | Reseñas y calificación ficticias en la portada | — | — | — | — | Aceptado |
| RA-03 | Envío gratis desde $80.000 también en zonas remotas | — | — | — | — | Aceptado |
| RA-04 | Inserción anónima en `pos_clientes` | — | — | — | — | Aceptado (temporal) |
| RA-05 | La tienda no valida stock (antes ST-06) | — | — | — | — | Aceptado |

## 5. Detalle de hallazgos

### ST-01 · El pedido guarda el primer SKU del producto — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/checkout.js` consultaba `pos_productos_detalle` del producto con `limit=1` e ignoraba el `detalleId` del carrito.
- **Solución aplicada:** cada línea del pedido usa el `detalleId` de su variante. Si alguna línea del carrito no tiene variante, no se crea nada y se pide revisar el carrito (`lineasSinVariante`). Desde T2 el `detalleId` viaja a `st_crear_pedido` como `producto_detalle_id`.
- **Archivos:** `js/paginas/checkout.js`.

### ST-02 · El carrito confunde variantes — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/carrito.js` identificaba las filas solo por `productoId`.
- **Solución aplicada:** cada línea del carrito es una variante (`detalleId`); `agregarAlCarrito` agrupa por `detalleId`; +, − y eliminar actúan por `detalleId`. Al abrir el carrito, `normalizarCarrito` descarta líneas sin variante (con aviso, D15) y une repetidas.
- **Archivos:** `js/compartido/card-producto.js`, `js/paginas/carrito.js`.

### ST-03 · Variante agotada agrega el producto sin variante — P0 · Ventas: Medio · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/producto.js` llamaba `agregarAlCarrito(producto)` sin opciones cuando la variante estaba agotada.
- **Solución aplicada:** variantes agotadas deshabilitadas, tachadas y con la etiqueta "Agotado"; se selecciona por defecto la primera variante con stock; el botón queda en "Agotado" si ninguna tiene stock. `agregarAlCarrito` exige la variante y valida su stock.
- **Archivos:** `js/paginas/producto.js`, `js/compartido/card-producto.js`.

### ST-04 · Pedido no atómico y precio del navegador — P0 · Ventas: Alto · ✅ Hecho (T2)
- **Evidencia (antes):** `js/paginas/checkout.js` hacía 4 inserciones separadas (cliente, dirección, pedido, detalle) con la llave pública; el precio salía del carrito en `localStorage`.
- **Solución aplicada:** función `public.st_crear_pedido(...)` (`security definer`, `search_path` fijo, solo `EXECUTE` para `anon` y `authenticated`) en `specs/15-store-pedido-seguro.sql`. En **una sola transacción**: valida nombre, celular, correo opcional, dirección, ciudad, departamento, medio de pago y carrito (1–30 líneas, cantidades 1–99, líneas repetidas unidas); toma el precio de `pos_productos_detalle`; asigna el cliente CONSUMIDOR Ecommerce (D16); crea dirección, pedido y detalle; devuelve número, subtotal, envío, total y líneas. Límite anti-abuso: 5 pedidos `PENDIENTE` por celular en 24 horas. Los errores llegan al cliente como mensaje en español (`[ST_xxx] …`) sin detalle técnico.
- **Checkout:** una sola llamada `__supabase.rpc('st_crear_pedido', …)`; el navegador envía solo datos del comprador, medio de pago y `(producto_detalle_id, cantidad)`.
- **Evidencia (después):** en QA, un precio cambiado a mano en `localStorage` no cambió el `precio_unitario` guardado (2026-11-03).
- **Archivos:** `specs/15-store-pedido-seguro.sql`, `js/paginas/checkout.js`, `checkout.html`.

### ST-05 · Pedidos y direcciones legibles y creables sin sesión — P0 · Ventas: Medio · ✅ Hecho (T2)
- **Evidencia (antes, `pg_policies` de producción):** `anon ven pedidos`, `anon ven detalle de pedidos` y `anon ven direcciones` con `qual = true`; inserciones anónimas en `st_pedidos`, `st_pedidos_detalle`, `st_direcciones` y `pos_clientes`.
- **Solución aplicada:** `specs/16-store-cerrar-acceso-anon.sql` elimina las 6 políticas `anon` y revoca todos los permisos de `anon` en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`. `pos_clientes` no se toca (RA-01, RA-04). `specs/03-seed-store-grants.sql` se actualizó para no volver a abrir ese acceso.
- **Evidencia (después):** en producción, 0 políticas `anon` y 0 permisos `anon` en las tres tablas (2026-11-03). En QA, una consulta a `st_pedidos` con la llave pública no devuelve pedidos y la tienda sigue creando pedidos por la función.
- **Usuarios del POS (`authenticated`):** conservan sus políticas; POS y WMS probados sin errores después del 16.

### ST-06 · Sin validación de stock — Aceptado (RA-05, 2026-10-29)
- **Decisión (D17):** la tienda es apoyo de ventas y el pedido es una solicitud que se confirma por WhatsApp; no mueve inventario (D2). No se limita la cantidad en el carrito ni se rechaza el pedido por stock.
- **Aviso interno:** `st_crear_pedido` deja en `notas` `Stock insuficiente: SKU (pedido N, disponible M)` cuando la cantidad supera `stock_actual`. Evidencia QA: `KBT-202611-000002` → `Stock insuficiente: AL119 (pedido 20, disponible 1)`.
- **Se mantiene de T1:** una variante con stock 0 no se puede agregar al carrito.

### ST-07 · Número de pedido con colisiones — P1 · Ventas: Bajo · ✅ Hecho (T2)
- **Evidencia (antes):** `KBT-AAAAMM-` + 4 dígitos al azar en el navegador.
- **Solución aplicada:** secuencia `public.st_pedidos_numero_seq` dentro de `st_crear_pedido` y índice único `ux_st_pedidos_numero_pedido`. Formato **`KBT-AAAAMM-NNNNNN`**: AAAAMM es el mes de creación (hora de Bogotá) y NNNNNN es un consecutivo **global** que no reinicia cada mes. Borrar pedidos no reutiliza números.

### ST-08 · Cliente con NIT inventado — P1 · Ventas: Medio · ✅ Hecho (T2)
- **Evidencia (antes):** el checkout creaba `pos_clientes` con `tipo_id = 'NIT'` y número ficticio y reutilizaba cualquier cliente con el mismo correo.
- **Solución aplicada (D11, D16):** la tienda ya no crea ni actualiza clientes. Todo pedido web queda a nombre de **CONSUMIDOR Ecommerce** (`CC 222222222222`); la función exige que exista exactamente uno (si no, aborta sin crear nada). Los datos reales del comprador quedan en `st_direcciones` (`nombre_destinatario`, `telefono` con 10 dígitos, `email` nueva columna opcional, dirección). Se corrigió un segundo cliente (Daniel Castaño) que tenía el mismo número.
- **Consecuencia aceptada:** el sistema no reconoce automáticamente a quien compra de nuevo; los pedidos web se agrupan bajo el cliente genérico hasta asignarlos a uno real en el POS (T4).

### ST-09 · Envío fijo e incoherente — P1 · Ventas: Alto · ✅ Hecho (T3b)
- **Evidencia (antes):** `carrito.html` mostraba "Por calcular" y no lo sumaba; el checkout y `st_crear_pedido` usaban $9.900 fijos.
- **Solución aplicada (D26–D27):** `specs/17-store-checkout-coherente.sql`:
  - `st_tarifas_envio` (5 zonas: `local`, `antioquia`, `nacional_principal`, `nacional`, `especial`; valor y días) y `st_destinos_envio` (departamento y ciudad → zona). Comparación sin tildes ni mayúsculas; ciudad exacta > departamento > zona por defecto. "Barbosa" solo es local en Antioquia.
  - `st_configuracion`: `envio_gratis_desde` (80000), `pedido_minimo` (15000), `envio_zona_defecto`.
  - `st_cotizar_envio(departamento, ciudad)` (solo lectura, `anon`): el checkout muestra valor y "Llega en N–M días hábiles" al elegir la ciudad.
  - `st_crear_pedido` (misma firma) calcula el envío de la zona, gratis desde el umbral (subtotal sin envío) y rechaza pedidos bajo el mínimo (`[ST_MINIMO]`).
  - Carrito y checkout: barra "Te faltan $X para envío gratis" y aviso de pedido mínimo (`st_config_tienda`).
- **Tarifas en producción (2026-11-08):** local $15.000 (1–2 días), Antioquia $18.000 (2–3), ciudades principales $25.000 (3–4), nacional $30.000 (3–6), zonas especiales $42.000 (5–10). QA conserva valores de prueba ($8.000 a $35.000). Se cambian por SQL (`update public.st_tarifas_envio ...`).
- **Evidencia QA:** `st_cotizar_envio` devolvió local para Itagüí, nacional para Barbosa (Santander) y especial para Leticia; pedidos `KBT-202611-000006` a `-000010` con envío de zona, envío gratis desde $80.000 y `medio_pago_web` correcto.
- **Archivos:** `specs/17-store-checkout-coherente.sql`, `checkout.html`, `js/paginas/checkout.js`, `carrito.html`, `js/paginas/carrito.js`, `js/compartido/utils.js`.

### ST-10 · Promesas falsas en el checkout — P1 · Ventas: Alto · ✅ Hecho (T3b)
- **Avance T2:** el mensaje final ya no promete correo.
- **Solución aplicada (D23–D24):** solo 3 medios reales: Transferencia Bre-B, Tarjeta débito/crédito vía Mercado Pago y Contraentrega, guardados en `st_pedidos.medio_pago_web` (`pos_metodos_pago` no se toca; el valor `tarjeta` del checkout anterior se acepta como `mercado_pago`). Se corrigieron `terminos-condiciones.html` (compra sin registro, mínimo $15.000 sin envío, envío gratis desde $80.000, medios reales, factura por WhatsApp o a consumidor final) y `preguntas-frecuentes.html` (medios reales, envío gratis $80.000, guía por WhatsApp, días según la ciudad).

### ST-11 · Sin pantalla de confirmación útil — P1 · Ventas: Alto · ✅ Hecho (T3b)
- **Solución aplicada (D24–D25, D28):** la confirmación muestra número, total, envío (o "envío gratis"), días estimados y, según el medio: llave Bre-B con botón "Copiar", titular, valor exacto y referencia (QR opcional); o "Paga exactamente $X" y botón "Pagar con Mercado Pago" (Tu Link, monto libre); o "Pagas $X en efectivo al recibir". Si hay stock insuficiente no muestra instrucciones de pago (evidencia QA: `KBT-202611-000010`, AL033 pedido 20 y disponible 1). Botón "Confirmar por WhatsApp" con "Hola, acabo de hacer el pedido KBT-… por $X.". La llave y el link solo los devuelve `st_crear_pedido` (D4).
- **Archivos:** `checkout.html`, `js/paginas/checkout.js`, `specs/17-store-checkout-coherente.sql`.

### ST-12 · WhatsApp de la ficha sin contexto — P1 · Ventas: Alto · ✅ Hecho (T3a)
- **Evidencia:** `producto.html`: el botón flotante abría un chat vacío.
- **Solución aplicada:** botón "Preguntar por WhatsApp" en la ficha (logo completo de WhatsApp, verde oficial) y el botón flotante con el mensaje: producto, opción, SKU, precio y enlace; se actualiza al cambiar de variante. Es una consulta: no crea pedido.
- **Archivos:** `producto.html`, `js/paginas/producto.js`, `tests/store/store-t3a.test.mjs`. Commits `92dc65b` y `272bc1d`.

### ST-13 · Paginación con barajado — P1 · Ventas: Medio · ✅ Hecho (T3a)
- **Evidencia:** `js/api/productos.js` barajaba todo el catálogo en cada carga y luego cortaba por página.
- **Solución aplicada (D22):** `obtenerPaginados` ordena por `id` y baraja con una semilla guardada en `sessionStorage` (`kubit_orden_semilla`): en una visita las páginas no repiten ni ocultan productos; en otra visita el orden cambia. Destacados, relacionados y búsqueda sin cambios.

### ST-14 · Caracteres dañados — Cerrado (falso positivo, 2026-10-28)
- Las tildes se ven bien en producción ("Presentación", "Cojín", "Navideña"). El daño venía del visor de OneDrive usado en el levantamiento, no de los archivos.

### ST-15 · El POS no gestiona pedidos web — P1 · Ventas: Alto · ✅ Hecho (T4)
- **Evidencia (antes):** el POS no tenía forma de enterarse de un pedido web ni de ver los datos del comprador. Las políticas de producción dejan al rol `authenticated` leer y actualizar `st_pedidos`, pero en `st_direcciones` solo ve las filas con `cliente_id = auth.uid()`; como todos los pedidos web van a nombre de CONSUMIDOR Ecommerce (D16), el POS no podía leer nombre, celular ni dirección del comprador.
- **Reformulación (D29–D35):** la gestión es por WhatsApp; el POS avisa, muestra los datos y permite cerrar el pedido. Se descartan los estados intermedios, el registro de pagos y guías y "Crear venta en POS" (la venta, el cliente y el inventario siguen como hoy, a mano en el POS).
- **Solución aplicada:**
  - `specs/18-pos-pedidos-web.sql` (solo agrega): columnas `st_pedidos.gestionado_at`, `gestionado_por` y `nota_gestion`; funciones `pos_pedidos_web_contar()`, `pos_pedidos_web_listar(p_vista)`, `pos_pedido_web_detalle(p_pedido_id)` y `pos_pedido_web_cerrar(p_pedido_id, p_resultado, p_numero_venta, p_nota)` (solo `authenticated`; exigen un usuario activo de `pos_usuarios` con sesión de Supabase Auth) y las internas `pos_usuario_sesion()` y `pos_pedido_web_json()`. No cambia políticas ni toca inventario, ventas, clientes ni la tienda.
  - **Aviso (D30):** `pedidos-web-aviso.js` agrega "Pedidos web (N)" debajo de Dashboard, la tarjeta "Pedidos web por gestionar" en el Panel y un aviso emergente una vez por inicio de sesión. Archivo independiente; lo carga `database.js` desde `cargarLinkTienda()`.
  - **Página (D34, D35):** `pedidos-web.html` con pestañas "Por gestionar" y "Gestionados (30 días)", tarjetas colapsables cerradas por defecto, "Escribir por WhatsApp", "Copiar datos del cliente" y "Cerrar pedido".
  - **Cierre (D32):** "Venta registrada" (`CONFIRMADO`, número de venta opcional) o "No se concretó" (`CANCELADO`), sin motivo, con nota opcional.
- **Evidencia QA (2026-11-08):** script 18 verificado (3 columnas nuevas; las 4 funciones públicas con `authenticated` y sin `anon`; `pos_pedidos_web_contar()` desde el SQL Editor falla con `[POS_SESION]`). Con el usuario `admin_pruebas`: aviso al entrar, contador y tarjeta del Panel coincidieron con la base; `KBT-202611-000001` cerrado como "Venta registrada" con número de venta y nota (`CONFIRMADO`, `venta_id` lleno) y `KBT-202611-000002` como "No se concretó" con nota (`CANCELADO`); conteo final 8 `PENDIENTE`, 1 `CONFIRMADO` y 1 `CANCELADO`. Ajustes pedidos en la revisión visual: color de cantidad, precio y total en modo claro y oscuro y tarjetas colapsables cerradas por defecto.
- **Producción (2026-11-08):** script 18 ejecutado y verificado, frontend publicado (`1bddcb5`) y prueba de humo con un pedido real de prueba (aviso, menú, Panel, cierre "No se concretó"); el pedido se borró (OP-04).
- **Archivos:** `specs/18-pos-pedidos-web.sql`; POS (`apps/pos`): `pedidos-web.html`, `js/paginas/pedidos-web.js`, `js/compartido/pedidos-web-aviso.js`, `js/compartido/database.js` (solo se agregó `DB.pedidosWeb` y la carga del aviso), `service-worker.js` (caché `kubit-pos-20261108-01`); `tests/pos/pedidos-web.test.mjs` y `tests/pos/pedidos-web-ui.test.mjs`.
- **Hallazgo operativo:** en Supabase Auth de producción solo existe `outletshoptiendavirtual@gmail.com` (los usuarios `admin` y `admin_497a2c95` de `pos_usuarios` no pueden iniciar sesión); en QA, solo `admin_pruebas`. Ver AGENTS.md §10.5.

### ST-16 · Búsqueda limitada — P2 · Ventas: Medio · ✅ Hecho (T5a)
- **Evidencia (antes):** `buscar()` y `obtenerPaginados()` de `js/api/productos.js` comparaban la frase completa con el nombre y la descripción corta, con tildes y sin mirar el SKU: "bebe" no encontraba "bebé" y "reno cojin" no encontraba "Funda Cojín Navideña Felpa (Reno / Muñeco Nieve)". Los resultados salían en el orden aleatorio de la visita, así que un SKU exacto podía quedar detrás de otros productos.
- **Solución aplicada (D37):** una sola función de filtro para las dos rutas (`_filtrarPorBusqueda`) y otra de orden (`_ordenarPorRelevancia`) en `js/api/productos.js`: sin tildes ni mayúsculas, todas las palabras en cualquier orden, sobre nombre, SKU de **todas** las variantes, marca, etiquetas (menos `destacado`) y descripción corta; `AL-119` encuentra `AL119`. Orden: SKU exacto, SKU que empieza igual, nombre que empieza igual, nombre que contiene la frase, SKU que contiene la frase y el resto; a igual relevancia, el orden de la visita de T3a, así la paginación sigue sin repetir ni ocultar productos. Los datos de búsqueda de cada producto se calculan una vez (en una prueba con 450 productos, una búsqueda tardó entre 0,4 y 4 ms). Sin SQL.
- **Evidencia:** 35 casos de `store-t5a.test.mjs` (tildes, SKU de variantes, relevancia, varias palabras, marca y etiquetas, consultas vacías o con caracteres especiales, paginación estable, categoría y productos digitales); los 7 casos de ST-13 de T3a siguen pasando con la búsqueda nueva. Pruebas manuales en `KUBIT-Pruebas` y prueba de humo en producción exitosas (2026-11-09).
- **Archivos:** `js/api/productos.js`, `tests/store/store-t5a.test.mjs`.

### ST-17 · Sin SEO ni vista previa al compartir — P2 · Ventas: Medio · Pendiente (T5b)
- **Evidencia:** las fichas se arman en el navegador; sin meta description, Open Graph, datos estructurados ni sitemap.
- **Mitigación:** metadatos base en todas las páginas; Open Graph por producto (requiere generación del lado del servidor o páginas estáticas, a evaluar en Vercel); `sitemap.xml` y `robots.txt`.

### ST-18 · Catálogo completo en cada página — P2 · Ventas: Bajo · Pendiente (T5c)
- **Evidencia:** `js/api/productos.js` consulta `select=*` con detalle y multimedia de todos los productos, incluso para "relacionados".
- **Mitigación:** seleccionar solo columnas necesarias y consultar por página o por producto.

### ST-19 · Tailwind por CDN e Instagram embebido — P2 · Ventas: Bajo · Pendiente (T5c)
- **Evidencia:** `index.html` carga Tailwind desde CDN en producción y embebidos de Instagram.
- **Mitigación:** CSS de Tailwind compilado; cargar Instagram solo al hacer scroll o reemplazarlo por imágenes con enlace.

### ST-20 · Service worker con versiones viejas — P2 · Ventas: Bajo · ✅ Hecho (T5a)
- **Evidencia (antes):** `service-worker.js` respondía primero con lo guardado, aunque fuera una versión vieja; la precarga era de todo o nada (si un archivo fallaba no se guardaba ninguno y no se avisaba); `colombia.js` no estaba en la lista; al activarse recargaba todas las páginas abiertas, también en la primera visita y en pleno checkout. Versión anterior de la caché: `outletshop-20261108-02`.
- **Solución aplicada (D38):** reescrito (ver `AGENTS.md` §5.3): red primero para HTML, JS, CSS y manifiesto (la copia guardada solo sin conexión); caché primero para imágenes y demás archivos locales; solo GET del mismo sitio (Supabase, WhatsApp, Mercado Pago, fuentes y CDN pasan directo); clave de caché sin `?consulta` (`?q=`, `?slug=`, `?pagina=`) y `/` equivale a `index.html`; se ignoran copias con redirección; precarga archivo por archivo, con `colombia.js` y los íconos; recarga las páginas abiertas solo si ya había una caché anterior y nunca la de `checkout.html`; en `localhost` no precarga ni intercepta. Caché `outletshop-20261109-01`.
- **Evidencia:** pruebas con un navegador simulado (estrategias, caché sin consulta, sin conexión, redirecciones, errores del servidor, POST y otros sitios, localhost, primera visita y actualización, y que cada archivo de la lista exista). El service worker no corre en `localhost`: se verifica en el Vercel de calidad (Manifest, Cache Storage, sin conexión, búsqueda y checkout sin recarga). Prueba de humo en producción exitosa (2026-11-09).
- **Efecto a tener en cuenta:** cada visita pregunta al servidor si HTML, JS y CSS cambiaron; Vercel responde sin descargar nada si no cambiaron. A cambio nunca se ven precios o textos viejos.
- **Archivos:** `service-worker.js`, `tests/store/store-t5a.test.mjs`.

### ST-21 · Ícono del manifiesto en SVG — P2 · Ventas: Bajo · ✅ Hecho (T5a)
- **Evidencia (antes):** `manifest.json` solo tenía el SVG, marcado `any maskable`; el `apple-touch-icon` de `index.html` también apuntaba al SVG (iPhone necesita PNG).
- **Solución aplicada (D39):** PNG generados desde `icon.svg`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (todo el logo dentro del círculo seguro del 40 %, comprobado píxel a píxel) y `apple-touch-icon.png` (180x180). `manifest.json` los declara con su `purpose` (`any` o `maskable`, nunca los dos) y mantiene el SVG como `any`. Las 8 páginas apuntan el `apple-touch-icon` al PNG. El favicon sigue siendo `icon.svg`.
- **Evidencia:** pruebas de tamaño real de cada PNG y de que el manifiesto y las 8 páginas coincidan; revisión visual de los íconos (recorte circular y cuadrado redondeado).
- **Archivos:** `manifest.json`, `img/icon-192.png`, `img/icon-512.png`, `img/icon-maskable-512.png`, `img/apple-touch-icon.png` y las 8 páginas `.html`.

### ST-22 · XSS potencial — P3 · Ventas: Bajo
- **Evidencia:** `innerHTML` con nombres de producto, datos de `localStorage` y mensajes de error en `js/compartido/card-producto.js`, `js/paginas/producto.js`, `js/paginas/carrito.js` y otros.
- **Avance:** T1 agregó `escHtml` en la ficha; T2 agregó `escaparHtml` en `js/compartido/utils.js` y la usa en la confirmación y los errores del checkout y en el aviso de cambio de precios.
- **Mitigación pendiente:** usar `escaparHtml` (o `textContent`) en el resto de páginas.

### ST-23 · Código duplicado y datos de ejemplo — P3 · Ventas: Bajo
- **Evidencia:** `_slugify` repetido (`js/api/categorias.js` y `js/api/productos.js`); `js/api/data.js` con productos de ejemplo.
- **Mitigación:** una sola utilidad en `js/compartido/utils.js`; retirar `data.js` si no se usa.

### ST-24 · Documentación de base de datos desalineada — P3 · Ventas: Bajo · En curso
- **Evidencia:** `specs/01-schema.sql` solo concede SELECT a `anon` en `st_pedidos` y `pos_clientes`; producción tenía políticas `anon` de INSERT y SELECT creadas fuera del script.
- **Avance T2:** `03-seed-store-grants.sql` actualizado y `15` / `16` versionados reflejan el estado de permisos de la tienda.
- **Pendiente:** reflejar en `01-schema.sql` (o en un script de políticas) el estado final de `pos_clientes` y de `st_envios` / `st_pagos_online`.

### ST-25 · El botón de la grilla agrega la primera variante — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** el botón "Agregar" de `js/compartido/card-producto.js` agregaba la primera variante sin preguntar, aunque estuviera agotada.
- **Solución aplicada (D14):** con variantes, el botón dice "Elegir opción" y lleva a la ficha; sin variantes, se agrega directo como antes.

### ST-26 · Precio de la primera variante — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `mapearProducto` (`js/api/productos.js`) tomaba `precio_venta` de `detalles[0]`; las variantes no traían precio.
- **Solución aplicada (D13):** cada variante trae `precio` y `precio_original`; la ficha cambia el precio al elegir variante; el carrito guarda el precio de la variante. Desde T2, carrito y checkout lo vuelven a leer del POS (D18).

### ST-27 · Variantes eliminadas visibles — P0 · Ventas: Medio · ✅ Hecho (T1)
- **Evidencia:** la consulta trae `pos_productos_detalle(*)` sin filtrar `deleted_at`.
- **Solución aplicada:** `mapearProducto` descarta variantes con `deleted_at`.

### ST-28 · Grilla sin indicar precios distintos — P1 · Ventas: Medio · ✅ Hecho (T1)
- **Solución aplicada:** `precioMin` y `preciosDistintos` en `js/api/productos.js`; la tarjeta muestra "Desde $X" cuando los precios difieren y el precio normal cuando son iguales.

### ST-29 · El ambiente de pruebas apuntaba a producción — P0 (proceso) · ✅ Hecho (T2)
- **Evidencia (2026-10-28):** al copiar archivos de Producción a Pruebas, `apps/store/js/api/supabase-client.js` de `KUBIT-Pruebas` quedó con la URL y la llave de **producción**. Una prueba manual de T1 creó el pedido basura `KBT-202610-8889` en producción (borrado).
- **Solución aplicada:**
  - `supabase-client.js` de Pruebas restaurado con `git restore` (URL y llave `anon` de QA).
  - Regla: **nunca se copian entre ambientes** `apps/pos/js/config.js`, `apps/wms/js/config.js` ni `apps/store/js/api/supabase-client.js`. Las listas de copia los excluyen y los commits usan `git add` por archivo.
  - Test `tests/store/ambiente.test.mjs`: falla si la tienda apunta a un proyecto distinto del POS/WMS del mismo repositorio o si su llave no es `anon`.
  - Verificación de cierre: `diff -rq` entre `KUBIT-PRODUCCION` y `KUBIT-Pruebas` muestra solo esos 3 archivos.

### ST-30 · Políticas de `st_envios` y `st_pagos_online` — P3 · Ventas: Bajo · Pendiente
- **Evidencia (producción, 2026-11-03):** las políticas `clientes ven envios de sus pedidos` (`st_envios`) y `clientes ven pagos de sus pedidos` (`st_pagos_online`) consultan `st_pedidos`. Ambas tablas están vacías y ningún archivo de `apps` las usa.
- **Impacto hoy:** ninguno. Después del script 16, una lectura **anónima** de esas tablas fallaría por permisos sobre `st_pedidos`.
- **Mitigación:** revisar roles y políticas cuando T3 o T4 empiecen a usar envíos o pagos en línea.
### ST-31 · Configuración de la tienda solo por SQL — P2 · Ventas: Bajo · Pendiente
- **Situación (2026-11-08):** `st_configuracion` (envío gratis, pedido mínimo, zona por defecto, llave Bre-B, titular, QR, link de Mercado Pago, WhatsApp), `st_tarifas_envio` y `st_destinos_envio` solo se editan con `UPDATE`/`INSERT` en el SQL Editor de Supabase. D8 había previsto que el umbral fuera "configurable en el POS"; en T3b se dejó por SQL para no tocar el POS.
- **Restricciones para construirla:**
  - El script 17 revocó el acceso a esas tablas para `anon` **y** `authenticated`: una pantalla en el POS necesita funciones `security definer` que verifiquen que el usuario es administrador (no basta con abrir las tablas).
  - `terminos-condiciones.html` y `preguntas-frecuentes.html` tienen escritos "$15.000" y "$80.000": si los valores se editan desde una pantalla, esos textos deben leerse de la configuración o actualizarse a mano.
- **Mitigación mientras tanto:** `UPDATE` documentados en `specs/11-api-contracts.md` §9.4 y al pie de `specs/17-store-checkout-coherente.sql`.
- **Fase:** propuesta como fase propia (ya no va en T4, que se redujo a avisar y gestionar por WhatsApp); sin aprobar.

### ST-32 · El buscador de la barra no funciona desde otras páginas — P2 · Ventas: Medio · ✅ Hecho (T5a)
- **Evidencia (antes):** en `js/compartido/navbar-store.js` Enter navegaba a `?q=...` (relativo): en la ficha de un producto abría `producto.html?q=...`, sin producto, y el campo no mostraba lo buscado. Se encontró al revisar el código para ST-16.
- **Solución aplicada:** Enter (escritorio y móvil) lleva a `index.html?q=...` desde cualquier página y el campo muestra el texto buscado (`?q=`). Los resultados salen de la búsqueda nueva (ST-16).
- **Archivos:** `js/compartido/navbar-store.js`, `tests/store/store-t5a.test.mjs`.

### ST-33 · El favicon `icon.svg` pesa 152 KB — P2 · Ventas: Bajo · Pendiente (T5c)
- **Evidencia (2026-11-09):** `img/icon.svg` (371x315, la vectorización de una imagen) pesa 152 KB y se descarga como favicon en las 8 páginas (`<link rel="icon" type="image/svg+xml" href="img/icon.svg">`).
- **Mitigación:** un favicon PNG de unos 48 px pesaría del orden de pocos KB. Se decide en T5c, con la medición de rendimiento.

## 6. Riesgos aceptados

| ID | Riesgo | Decisión | Revisión |
|---|---|---|---|
| RA-01 | Lectura pública de `pos_clientes` (nombres, correos, celulares) con la llave pública. Riesgo bajo la Ley 1581 de 2012 (Habeas Data). | Aceptado por el negocio (2026-10-16, ratificado 2026-10-28). Desde T2 la tienda no agrega datos de compradores a esa tabla (D16). | Revisar cuando la tienda reciba pedidos reales. |
| RA-02 | La portada muestra "4.8 · 152 reseñas verificadas" fijas en `index.html`, que no corresponden a reseñas reales. | Se mantienen por decisión del negocio (2026-10-28). | **Recomendación técnica:** retirarlas o reemplazarlas por reseñas reales. Afirmaciones no veraces en publicidad pueden considerarse publicidad engañosa (Ley 1480 de 2011, Estatuto del Consumidor) y ser sancionadas por la SIC; además, si un cliente lo detecta, afecta la confianza que la tienda busca generar. |
| RA-03 | Envío gratis desde $80.000 también en zonas remotas y en contraentrega. | Aceptado (D8). **Ratificado 2026-11-08 con las tarifas reales:** en un pedido de $80.000 el envío gratis cuesta entre el 19 % (local, $15.000) y el 52 % (zonas especiales, $42.000) de la venta, más la comisión de recaudo en contraentrega; el negocio decide mantener $80.000 y asumir el costo. | Revisar el margen si entran pedidos a zonas especiales o a contraentrega con envío gratis. |
| RA-04 | Política `anon crean clientes`: cualquiera con la llave pública puede insertar registros en `pos_clientes` (no editar ni borrar). La tienda ya no la usa desde T2. | Aceptado temporalmente (2026-10-29) para no tocar el POS, que está estable (D20). | Después de T2: probar en QA crear y editar clientes desde el POS sin esa política; si todo funciona, retirarla con un script independiente. |
| RA-05 | La tienda no valida stock: un pedido puede pedir más unidades de las disponibles (antes ST-06). | Aceptado (2026-10-29, D17). El pedido no mueve inventario y se confirma por WhatsApp; queda el aviso `Stock insuficiente: …` en `notas`. | Revisar si entran pedidos reales con faltantes frecuentes. |

## 7. Plan de trabajo

| Fase | Contenido | Tipo | Dependencias | Estado |
|---|---|---|---|---|
| **T1 Correcciones rápidas** | ST-01, ST-02, ST-03, ST-25, ST-26, ST-27, ST-28 | Solo frontend | Ninguna | ✅ Hecho 2026-10-28 (`f7ce184`) |
| **T2 Pedido seguro** | ST-04, ST-05, ST-07, ST-08, ST-29 (ST-06 → RA-05) | SQL + frontend | T1 | ✅ Hecho 2026-11-03 (`b3bc908`) |
| **T3a WhatsApp y paginación** | ST-12, ST-13 | Solo frontend | T2 | ✅ Hecho 2026-11-08 (`92dc65b`, `272bc1d`) |
| **T3b Checkout coherente** | ST-09, ST-10, ST-11 | SQL (`17`) + frontend | T3a | ✅ Hecho 2026-11-08 (`679251a`) |
| **T4 Pedidos web en el POS** | ST-15 | POS + SQL (`18`) | T3b | ✅ Hecho 2026-11-08 (`1bddcb5`) |
| **T5a Búsqueda, service worker e íconos** | ST-16, ST-20, ST-21, ST-32 | Solo frontend | Ninguna | ✅ Hecho 2026-11-09 (`6d052a9`) |
| **T5b Vista previa al compartir** | ST-17 | Frontend + Vercel | T5a | Pendiente |
| **T5c Rendimiento** | ST-18, ST-19, ST-33 | Frontend + Vercel | T5a | Pendiente (medir antes con PageSpeed) |
| **T6 Deuda técnica** | ST-22, ST-23, ST-24, ST-30, RA-04 | Frontend + SQL + documentación | Puede ir junto con otras fases | Pendiente |

**Método de trabajo (igual que POS y WMS):** un cambio a la vez; análisis con archivos reales (subidos desde el disco local, no desde el visor de OneDrive); plan y luz verde; archivos completos (si el navegador no deja descargar HTML, se entregan en un `.zip`); pruebas en `KUBIT-Pruebas` contra QA; copia a `KUBIT-PRODUCCION` **sin** los 3 archivos de credenciales; commit con `git add` por archivo (nunca `git add .`); prueba de humo en Vercel; actualizar este documento y `memory/progress.md`.

**Scripts SQL:** se ejecutan a mano en el SQL Editor de Supabase, primero en QA y después en producción. Un bloque `begin; … commit;` debe ejecutarse completo en una sola corrida (el editor no conserva la transacción entre ejecuciones).

### Orden de despliegue de T2 (referencia para futuras fases con SQL)

1. `specs/15-store-pedido-seguro.sql` (solo agrega; la tienda anterior sigue funcionando).
2. Commit y push del frontend; prueba de humo con un pedido real de prueba.
3. `specs/16-store-cerrar-acceso-anon.sql` (cierra el acceso). Ejecutarlo antes del frontend deja la tienda sin poder crear pedidos.
4. Verificación con `pg_policies` e `information_schema.role_table_grants` (0 filas `anon`), nueva prueba de humo en tienda, POS y WMS.
5. Borrado de los pedidos de prueba.

### Orden de despliegue de T4 (script que solo agrega)

1. `specs/18-pos-pedidos-web.sql` en QA y verificación (3 columnas; funciones con `authenticated` y sin `anon`; `pos_pedidos_web_contar()` sin sesión falla con `[POS_SESION]`).
2. Frontend en `KUBIT-Pruebas` con `node ~/Downloads/store-t4/tools/actualizar-sw-pos-t4.mjs` para el service worker del POS; tests y pruebas manuales con un usuario que exista en Supabase Auth de QA.
3. Script 18 en producción y las mismas verificaciones. No hay riesgo de orden: el script no cierra accesos y la tienda no lo usa.
4. Commit por archivo en producción (`git add` con la lista, nunca `git add .`) y prueba de humo: crear un pedido en la tienda, verlo en el POS, cerrarlo "No se concretó", hacer una venta y abrir el WMS.
5. Borrar el pedido de prueba (OP-04).

### Pruebas automatizadas

- Carpeta `tests/store/` en la raíz del repo. Archivos `.mjs` (módulo ES; el `package.json` del repo usa `"type": "module"`, y Vitest solo toma `tests/**/*.test.js`).
- Sin dependencias (`node:test` y `node:vm`); cargan el código real de `apps/store`, simulan navegador y Supabase y **no tocan la base de datos**. Los scripts SQL se validan como texto; su ejecución real se prueba en QA.
- `tests/store/_entorno.mjs`: utilidades compartidas (no es un test).
- `tests/store/store-t1.test.mjs`: 20 casos de T1 (en T2, los de checkout verifican la llamada a `st_crear_pedido`).
- `tests/store/store-t2.test.mjs`: 35 casos de T2 (una sola llamada, sin precios del navegador, celular y correo, errores, precios vigentes, `checkout.html`, caché y reglas de los scripts 15, 16 y 03).
- `tests/store/ambiente.test.mjs`: 4 casos de ST-29.
- `tests/store/store-t3a.test.mjs`: 15 casos de T3a (mensaje y logo de WhatsApp, paginación por visita).
- `tests/store/store-t3b.test.mjs`: 37 casos de T3b (configuración, envío por zona y gratis, días, pedido mínimo, 3 medios de pago, confirmación, stock insuficiente, carrito, textos legales, caché y reglas del script 17).
- `tests/pos/pedidos-web.test.mjs` (23 casos) y `tests/pos/pedidos-web-ui.test.mjs` (6): T4, en el POS (`DB.pedidosWeb`, aviso una vez por sesión, menú, tarjeta del Panel, página, tarjetas colapsables, colores y reglas del script 18).
- `tests/store/store-t5a.test.mjs`: 35 casos de T5a (búsqueda, orden y paginación estable, buscador de la barra, service worker con navegador simulado, manifiesto e íconos).
- Ejecutar desde la raíz: `node --test tests/store/*.test.mjs` (146/146), `node --test tests/pos/*.test.mjs` (29/29) y `npm test` (Vitest, 119/119).
- Cada fase agrega su propio archivo de test y los anteriores deben seguir pasando.

### Criterios de aceptación por fase

- **T1 (✅ 2026-10-28):** con dos variantes del mismo producto en el carrito, +, − y eliminar actúan sobre la correcta; el pedido guarda el `producto_detalle_id` de cada variante; una variante agotada no se puede agregar; la grilla muestra "Elegir opción" para productos con variantes y "Desde $X" si los precios difieren; las variantes eliminadas no aparecen; test 20/20.
- **T2 (✅ 2026-11-03):** el pedido se crea con una sola llamada a `st_crear_pedido`; un precio manipulado en `localStorage` no cambia el precio guardado; si la cantidad supera el stock, el pedido se crea y queda el aviso en `notas` (RA-05); `anon` ya no puede leer ni insertar en `st_pedidos`, `st_pedidos_detalle` ni `st_direcciones` (0 filas en `pg_policies` y en permisos); números `KBT-AAAAMM-NNNNNN` únicos por secuencia; todos los pedidos quedan a nombre de CONSUMIDOR Ecommerce y los datos del comprador en `st_direcciones`; celular obligatorio y correo opcional; POS y WMS sin cambios de comportamiento; tests 59/59 y 119/119.
- **T3a (✅ 2026-11-08):** "Preguntar por WhatsApp" con producto, opción, SKU, precio y enlace, y logo completo; la paginación no repite productos en una visita; tests 74/74.
- **T3b (✅ 2026-11-08):** el envío cambia según departamento/ciudad (zona) y se muestran los días; desde $80.000 es $0; bajo $15.000 no se crea el pedido; carrito, checkout y pedido muestran el mismo total; solo aparecen los 3 medios de pago reales; la confirmación muestra instrucciones y el botón "Confirmar por WhatsApp"; la ficha tiene "Preguntar por WhatsApp" con el producto; la paginación no repite productos.
- **T4 (✅ 2026-11-08):** un pedido nuevo aparece en el aviso al entrar (una vez por sesión), en el contador del menú y en el Panel; la página muestra nombre, celular, correo (si existe), dirección, productos y totales, con tarjetas cerradas por defecto; "Escribir por WhatsApp" abre el chat con el mensaje acordado; cerrar como "Venta registrada" (con o sin número de venta) pasa a `CONFIRMADO` y como "No se concretó" a `CANCELADO`; el número de venta inexistente no cierra el pedido; el pedido web no mueve inventario; POS y WMS sin cambios de comportamiento; tests 29/29, 111/111 y 119/119.
- **T5a (✅ 2026-11-09):** la búsqueda encuentra por SKU de cualquier variante, marca y etiquetas, sin importar tildes ni mayúsculas, y el SKU exacto sale primero sin romper la paginación; el buscador funciona desde cualquier página y muestra lo buscado; HTML, JS y CSS salen de la red y no se ven versiones viejas; el checkout no se recarga solo; el manifiesto y el `apple-touch-icon` usan PNG; tests 146/146, 29/29 y 119/119.
- **T5b:** al compartir un enlace de un producto se ve imagen, nombre y precio; hay `sitemap.xml` y `robots.txt`.
- **T5c:** mejora medida de la carga en celular (catálogo más liviano, Tailwind, Instagram diferido y favicon).
- **T6:** sin `innerHTML` con datos sin escapar; `01-schema.sql` (o su script complementario) coincide con `pg_policies` de producción; decisión final sobre RA-04.

## 8. Tareas operativas

| ID | Tarea | Estado |
|---|---|---|
| OP-01 | Borrar los 5 pedidos de prueba de producción (KBT-202610-8977, -0409, -9276, -1848, -7621) y su detalle. También se borró `KBT-202610-8889`, creado por la prueba manual de T1 contra producción (ST-29). | Hecho 2026-10-28 |
| OP-02 | Borrar los pedidos de prueba de la prueba de humo de T2 en producción (`KBT-202611-000001` y `-000002`) y su detalle. El consecutivo sigue desde el siguiente número. | Hecho 2026-11-03 |
| OP-03 | Borrar de producción los pedidos de la prueba de humo de T3b (2026-11-08) y su detalle, en un solo bloque `begin; ... commit;`. | Hecho 2026-11-08 |
| OP-04 | Borrar de producción el pedido de la prueba de humo de T4 (2026-11-08) y su detalle, en un solo bloque `begin; ... commit;`. Los pedidos de prueba de QA (`KBT-202611-000001` a `-000010`) no se borran. | Hecho 2026-11-08 |

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2026-10-28 | Levantamiento inicial: 24 hallazgos, 3 riesgos aceptados, decisiones D1–D12 y plan T1–T6. |
| v2 | 2026-10-28 | T1 publicada: ST-01, 02, 03, 25, 26, 27 y 28 hechos; ST-14 cerrado como falso positivo; nuevos ST-25 a ST-28; decisiones D13–D15; rutas corregidas (`js/api/`, `js/compartido/`); pruebas automatizadas en `tests/store/`. |
| v3 | 2026-11-03 | T2 publicada (`b3bc908`): ST-04, 05, 07, 08 y 29 hechos; ST-06 pasa a RA-05; nuevos RA-04, ST-29 y ST-30; decisiones D16–D20 (cliente CONSUMIDOR Ecommerce, sin cédula, sin validación de stock, precio del POS, medios de pago temporales); formato `KBT-AAAAMM-NNNNNN`; orden de despliegue 15 → frontend → 16; tests 59/59; OP-02. |
| v4 | 2026-11-08 | T3a publicada (`92dc65b`, `272bc1d`): ST-12 y ST-13 hechos. T3b en QA con `specs/17-store-checkout-coherente.sql`; decisiones D21–D28; tests 111/111. |
| v5 | 2026-11-08 | T3b publicada (`679251a`): ST-09, ST-10 y ST-11 hechos; tarifas reales en producción; RA-03 ratificado con las tarifas reales; nuevo ST-31 (configuración solo por SQL); OP-03. |
| v6 | 2026-11-08 | T4 publicada (`1bddcb5`): ST-15 hecho (aviso, página `pedidos-web.html` y cierre del pedido con script `18`); decisiones D29–D35; ST-31 pasa a fase propia; OP-04; tests POS 29/29. |
| v7 | 2026-11-09 | T5a publicada (`6d052a9`; Pruebas `677a26e`): ST-16, ST-20 y ST-21 hechos; nuevos ST-32 (buscador desde otras páginas, hecho) y ST-33 (favicon de 152 KB, pendiente); decisiones D36–D39; T5 se divide en T5a, T5b y T5c; tests tienda 146/146. |
