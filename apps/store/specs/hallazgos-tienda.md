# hallazgos-tienda.md — Hallazgos y plan de mejora de la Tienda (apps/store)

**Versión:** v2 · **Fecha:** 2026-10-28 · **Responsable:** Harrisson Zapata
**Alcance:** código de `apps/store` vigente en producción (`outletshop`), políticas RLS reales de producción y decisiones de negocio.
**Base de datos:** una sola base Supabase compartida; prefijos `pos_` (POS), `st_` (Tienda) y `wms_` (WMS).

---

## 1. Contexto y objetivo

- El 99,5 % de las ventas entra por Mercado Libre. La tienda web **no ha recibido ningún pedido real**: los 5 registros de `st_pedidos` en producción son pruebas internas.
- Los clientes que escriben por WhatsApp o redes buscan más información. La tienda se usa para mostrar fotos, descripción y precio; la venta se cierra por chat y casi siempre es **contraentrega**.
- **Objetivo:** que la tienda genere confianza, registre pedidos completos y apoye el cierre por WhatsApp, con el POS como único dueño del inventario.

## 2. Decisiones de negocio (2026-10-28)

| # | Decisión |
|---|---|
| D1 | Rol de la tienda: checkout propio **y** apoyo por WhatsApp. |
| D2 | El pedido web **no mueve inventario**. La venta se registra manualmente en el POS, que controla stock y movimientos. |
| D3 | Aviso en el POS en tres piezas: contador en el menú lateral, tarjeta en el Panel y página `pedidos-web.html`. Sin pop-up bloqueante. |
| D4 | Medios de pago: **transferencia con llave**, **link de pago de Mercado Pago** (creado a mano) y **contraentrega**. Sin APIs ni pasarelas integradas. **PayPal descartado.** |
| D5 | El pago se confirma a mano contra el banco o Mercado Pago, nunca solo con una captura. En el POS se registra medio, monto, fecha y referencia. |
| D6 | Contraentrega en todo el país, con confirmación obligatoria por WhatsApp antes de despachar. |
| D7 | Envío dinámico por **departamento**, con excepciones por ciudad, valor normal y valor contraentrega. |
| D8 | Envío gratis desde **$80.000**, configurable, **también en zonas remotas**. |
| D9 | Transportadoras: **ENVIA** e **Interrapidísimo**. La elige el negocio al despachar; el cliente solo ve el valor. |
| D10 | Ficha: "Agregar al carrito" + "Preguntar por WhatsApp" (consulta, no pedido). Checkout: un solo botón "Enviar pedido". Confirmación: número, total, instrucciones de pago y botón "Confirmar por WhatsApp". |
| D11 | **Celular obligatorio** (10 dígitos, inicia en 3). **Correo opcional.** Sin cédula. |
| D12 | Se borran los 5 pedidos de prueba (tarea OP-01). |
| D13 | Las variantes de un producto pueden tener precios distintos: la tienda usa el precio de cada variante. |
| D14 | En la grilla, los productos con variantes muestran "Elegir opción" y llevan a la ficha. |
| D15 | Las líneas de carritos guardados sin variante se descartan con un aviso (no hay clientes reales). |

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
| ST-04 | Pedido no atómico y precio definido por el navegador | P0 | Alto | L | T2 | Pendiente |
| ST-05 | Pedidos, detalle y direcciones legibles y creables sin sesión | P0 | Medio | M | T2 | Pendiente |
| ST-06 | No se valida stock en carrito ni checkout | P0 | Medio | M | T2 | Pendiente |
| ST-07 | Número de pedido aleatorio con riesgo de colisión | P1 | Bajo | S | T2 | Pendiente |
| ST-08 | Cliente creado con NIT inventado y reconocido solo por correo | P1 | Medio | M | T2 | Pendiente |
| ST-09 | Envío fijo e incoherente entre carrito y checkout | P1 | Alto | M | T3 | Pendiente |
| ST-10 | Promesas falsas: pago con tarjeta y correo de confirmación | P1 | Alto | S | T3 | Pendiente |
| ST-11 | Sin pantalla de confirmación con instrucciones de pago ni WhatsApp | P1 | Alto | M | T3 | Pendiente |
| ST-12 | WhatsApp de la ficha abre un chat vacío | P1 | Alto | S | T3 | Pendiente |
| ST-13 | Paginación con barajado repite y oculta productos | P1 | Medio | S | T3 | Pendiente |
| ST-14 | Caracteres dañados en textos visibles | — | — | — | — | Cerrado (falso positivo) |
| ST-15 | El POS no avisa ni permite gestionar pedidos web | P1 | Alto | L | T4 | Pendiente |
| ST-16 | Búsqueda limitada (sin SKU, sensible a tildes) | P2 | Medio | M | T5 | Pendiente |
| ST-17 | Sin vista previa al compartir (SEO / Open Graph) | P2 | Medio | M | T5 | Pendiente |
| ST-18 | Cada página descarga el catálogo completo | P2 | Bajo | M | T5 | Pendiente |
| ST-19 | Tailwind desde CDN y embebidos de Instagram pesados | P2 | Bajo | M | T5 | Pendiente |
| ST-20 | Service worker puede servir versiones viejas | P2 | Bajo | S | T5 | Pendiente |
| ST-21 | Ícono del manifiesto solo en SVG (iOS) | P2 | Bajo | S | T5 | Pendiente |
| ST-22 | `innerHTML` con datos no escapados (XSS potencial) | P3 | Bajo | M | T6 | Pendiente |
| ST-23 | Código duplicado y datos de ejemplo | P3 | Bajo | S | T6 | Pendiente |
| ST-24 | `01-schema.sql` no refleja las políticas RLS de producción | P3 | Bajo | S | T6 | Pendiente |
| ST-25 | El botón de la grilla agrega la primera variante sin preguntar | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-26 | El precio sale siempre de la primera variante | P0 | Alto | S | T1 | Hecho 2026-10-28 |
| ST-27 | La tienda muestra variantes eliminadas en el POS | P0 | Medio | S | T1 | Hecho 2026-10-28 |
| ST-28 | La grilla no indica que las variantes tienen precios distintos | P1 | Medio | S | T1 | Hecho 2026-10-28 |
| RA-01 | Lectura pública de `pos_clientes` (Ley 1581) | — | — | — | — | Aceptado |
| RA-02 | Reseñas y calificación ficticias en la portada | — | — | — | — | Aceptado |
| RA-03 | Envío gratis desde $80.000 también en zonas remotas | — | — | — | — | Aceptado |

## 5. Detalle de hallazgos

### ST-01 · El pedido guarda el primer SKU del producto — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/checkout.js` consultaba `pos_productos_detalle` del producto con `limit=1` e ignoraba el `detalleId` del carrito.
- **Solución aplicada:** cada línea del pedido usa el `detalleId` de su variante. Si alguna línea del carrito no tiene variante, no se crea nada y se pide revisar el carrito (`lineasSinVariante`).
- **Archivos:** `js/paginas/checkout.js`.

### ST-02 · El carrito confunde variantes — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/carrito.js` identificaba las filas solo por `productoId`.
- **Solución aplicada:** cada línea del carrito es una variante (`detalleId`); `agregarAlCarrito` agrupa por `detalleId`; +, − y eliminar actúan por `detalleId`. Al abrir el carrito, `normalizarCarrito` descarta líneas sin variante (con aviso, D15) y une repetidas.
- **Archivos:** `js/compartido/card-producto.js`, `js/paginas/carrito.js`.

### ST-03 · Variante agotada agrega el producto sin variante — P0 · Ventas: Medio · ✅ Hecho (T1)
- **Evidencia:** `js/paginas/producto.js` llamaba `agregarAlCarrito(producto)` sin opciones cuando la variante estaba agotada.
- **Solución aplicada:** variantes agotadas deshabilitadas, tachadas y con la etiqueta "Agotado"; se selecciona por defecto la primera variante con stock; el botón queda en "Agotado" si ninguna tiene stock. `agregarAlCarrito` exige la variante y valida su stock.
- **Archivos:** `js/paginas/producto.js`, `js/compartido/card-producto.js`.

### ST-04 · Pedido no atómico y precio del navegador — P0 · Ventas: Alto
- **Evidencia:** `js/paginas/checkout.js` hace 4 inserciones separadas (cliente, dirección, pedido, detalle) con la llave pública; el precio sale del carrito en `localStorage`. Políticas de producción: `anon crean pedidos`, `anon crean detalle de pedidos`, `anon crean direcciones` y `anon crean clientes` con `with_check = true`.
- **Impacto:** pedidos huérfanos o sin detalle si algo falla a mitad; cualquiera puede crear pedidos con el precio que quiera.
- **Mitigación:** función `st_crear_pedido(...)` (`security definer`) que en **una sola transacción**: valida celular, recalcula precios desde `pos_productos_detalle`, valida stock, calcula envío (ST-09), crea o reutiliza cliente, crea dirección, pedido y detalle, y devuelve número y total. La tienda solo llama a esta función.
- **Archivos:** nuevo `specs/NN-st-crear-pedido.sql`, `js/paginas/checkout.js`, `js/api/supabase-client.js`.

### ST-05 · Pedidos y direcciones legibles y creables sin sesión — P0 · Ventas: Medio
- **Evidencia (producción, `pg_policies`):** `anon ven pedidos`, `anon ven detalle de pedidos` y `anon ven direcciones` con `qual = true`; inserciones anónimas en `st_pedidos`, `st_pedidos_detalle`, `st_direcciones` y `pos_clientes`.
- **Impacto:** cualquiera con la llave pública puede leer todos los pedidos con montos y direcciones de entrega, y crear registros basura. Es distinto de RA-01 (lectura de `pos_clientes`).
- **Mitigación:** cuando exista `st_crear_pedido` (ST-04), retirar las políticas `anon` de INSERT y SELECT en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`, y la de INSERT en `pos_clientes`. La lectura pública de `pos_clientes` se mantiene (RA-01).
- **Archivos:** `specs/NN-st-crear-pedido.sql` (o script propio), verificación con `pg_policies`.

### ST-06 · Sin validación de stock — P0 · Ventas: Medio
- **Evidencia:** `js/paginas/carrito.js`: el botón + no tiene tope; `checkout.js` no revisa existencias. (T1 ya impide agregar variantes agotadas, pero no limita la cantidad.)
- **Impacto:** se aceptan pedidos de unidades que no existen.
- **Mitigación:** tope por `stock_actual` en ficha y carrito (informativo) y validación definitiva en `st_crear_pedido`. No reserva inventario (D2).
- **Archivos:** `js/paginas/carrito.js`, `js/paginas/producto.js`, función SQL.

### ST-07 · Número de pedido con colisiones — P1 · Ventas: Bajo
- **Evidencia:** `js/paginas/checkout.js`: `KBT-AAAAMM-` + 4 dígitos al azar.
- **Mitigación:** secuencia en base de datos dentro de `st_crear_pedido`, conservando el formato `KBT-AAAAMM-NNNN`; índice único en `numero_pedido`.

### ST-08 · Cliente con NIT inventado — P1 · Ventas: Medio
- **Evidencia:** `js/paginas/checkout.js` crea `pos_clientes` con `tipo_id = 'NIT'` y número ficticio y reutiliza cualquier cliente con el mismo correo.
- **Impacto:** datos falsos en el maestro de clientes del POS; un pedido puede quedar asociado al cliente de otra persona.
- **Mitigación:** celular obligatorio y correo opcional (D11). Reconocer al cliente por celular normalizado dentro de `st_crear_pedido`; definir con el POS el `tipo_id` para clientes web sin documento (por ejemplo, `SIN_DOC`) en lugar de un NIT ficticio.

### ST-09 · Envío fijo e incoherente — P1 · Ventas: Alto
- **Evidencia:** `carrito.html` muestra "Por calcular" y no lo suma; `checkout.js` suma $9.900 fijos.
- **Mitigación:**
  - Tabla `st_tarifas_envio`: departamento, ciudad (opcional, para excepciones), valor normal, valor contraentrega, días estimados, activo.
  - Envío gratis desde un monto configurable en la Configuración del POS (inicial $80.000, D8).
  - El checkout muestra el valor al elegir departamento y ciudad (`colombia.js`); el valor definitivo lo calcula `st_crear_pedido`.
  - Carrito: "Envío: se calcula según el destino · gratis desde $80.000".
- **Archivos:** nuevo script SQL, `checkout.html`, `js/paginas/checkout.js`, `carrito.html`, `js/paginas/carrito.js`; POS: Configuración.

### ST-10 · Promesas falsas en el checkout — P1 · Ventas: Alto
- **Evidencia:** `checkout.html` ofrece "Tarjeta débito/crédito" sin pasarela; el mensaje final promete confirmación por correo que no se envía.
- **Mitigación:** opciones reales (D4): transferencia con llave, link de Mercado Pago y contraentrega. Mensaje final: "Pedido recibido. Te contactaremos por WhatsApp para confirmar". La llave y los datos de pago se muestran solo en la confirmación, con el número de pedido.

### ST-11 · Sin pantalla de confirmación útil — P1 · Ventas: Alto
- **Mitigación (D10):** pantalla de confirmación con número de pedido, productos, envío, total, instrucciones según el medio de pago y botón "Confirmar por WhatsApp" (`wa.me`) con el texto "Hola, acabo de hacer el pedido KBT-…".
- **Archivos:** `checkout.html`, `js/paginas/checkout.js`.

### ST-12 · WhatsApp de la ficha sin contexto — P1 · Ventas: Alto
- **Evidencia:** `producto.html`: el botón flotante abre un chat vacío.
- **Mitigación:** botón "Preguntar por WhatsApp" en la ficha con producto, variante, SKU y enlace. Es una consulta: no crea pedido.
- **Archivos:** `producto.html`, `js/paginas/producto.js`.

### ST-13 · Paginación con barajado — P1 · Ventas: Medio
- **Evidencia:** `js/api/productos.js` baraja todo el catálogo en cada carga y luego corta por página.
- **Mitigación:** orden estable (por ejemplo, destacados y luego recientes) o barajado con semilla fija por sesión.

### ST-14 · Caracteres dañados — Cerrado (falso positivo, 2026-10-28)
- Las tildes se ven bien en producción ("Presentación", "Cojín", "Navideña"). El daño venía del visor de OneDrive usado en el levantamiento, no de los archivos.

### ST-15 · El POS no gestiona pedidos web — P1 · Ventas: Alto
- **Mitigación (D3, D5):**
  - Contador "Pedidos web (N)" en el menú lateral del POS.
  - Tarjeta "Pedidos web por atender" en el Panel.
  - Página `apps/pos/pedidos-web.html`: lista y detalle; estados `PENDIENTE → CONFIRMADO → PAGADO → ENVIADO → ENTREGADO` o `CANCELADO`; registro de pago (medio, monto, fecha, referencia); transportadora y guía; botón "Contactar por WhatsApp"; botón "Crear venta en POS" que abre la venta con los productos cargados para registrarla manualmente (D2).
- **Archivos:** POS (`apps/pos`): nueva página, menú, Panel, `database.js`, `service-worker.js`; posible script SQL para columnas de pago y envío en `st_pedidos`.

### ST-16 · Búsqueda limitada — P2 · Ventas: Medio
- **Evidencia:** `js/api/productos.js` busca solo en nombre y descripción corta; no busca por SKU; "bebe" no encuentra "bebé".
- **Mitigación:** buscar también por `codigo_interno`; normalizar tildes y mayúsculas.

### ST-17 · Sin SEO ni vista previa al compartir — P2 · Ventas: Medio
- **Evidencia:** las fichas se arman en el navegador; sin meta description, Open Graph, datos estructurados ni sitemap.
- **Mitigación:** metadatos base en todas las páginas; Open Graph por producto (requiere generación del lado del servidor o páginas estáticas, a evaluar en Vercel); `sitemap.xml` y `robots.txt`.

### ST-18 · Catálogo completo en cada página — P2 · Ventas: Bajo
- **Evidencia:** `js/api/productos.js` consulta `select=*` con detalle y multimedia de todos los productos, incluso para "relacionados".
- **Mitigación:** seleccionar solo columnas necesarias y consultar por página o por producto.

### ST-19 · Tailwind por CDN e Instagram embebido — P2 · Ventas: Bajo
- **Evidencia:** `index.html` carga Tailwind desde CDN en producción y embebidos de Instagram.
- **Mitigación:** CSS de Tailwind compilado; cargar Instagram solo al hacer scroll o reemplazarlo por imágenes con enlace.

### ST-20 · Service worker con versiones viejas — P2 · Ventas: Bajo
- **Evidencia:** `service-worker.js` sirve primero la caché y oculta errores de instalación. Versión actual: `outletshop-20261028-01` (T1).
- **Mitigación:** mismo patrón del POS y WMS (versión por deploy, aviso de recarga); red primero para HTML.

### ST-21 · Ícono del manifiesto en SVG — P2 · Ventas: Bajo
- **Mitigación:** íconos PNG 192 y 512 y `apple-touch-icon` en `manifest.json` y en el HTML.

### ST-22 · XSS potencial — P3 · Ventas: Bajo
- **Evidencia:** `innerHTML` con nombres de producto, datos de `localStorage` y mensajes de error en `js/compartido/card-producto.js`, `js/paginas/producto.js` y otros. (T1 agregó `escHtml` para los nombres de variantes en la ficha.)
- **Mitigación:** función de escape común en `js/compartido/utils.js` o `textContent`.

### ST-23 · Código duplicado y datos de ejemplo — P3 · Ventas: Bajo
- **Evidencia:** `_slugify` repetido (`js/api/categorias.js` y `js/api/productos.js`); `js/api/data.js` con productos de ejemplo.
- **Mitigación:** una sola utilidad en `js/compartido/utils.js`; retirar `data.js` si no se usa.

### ST-24 · Documentación de base de datos desalineada — P3 · Ventas: Bajo
- **Evidencia:** `specs/01-schema.sql` solo concede SELECT a `anon` en `st_pedidos` y `pos_clientes`; producción tiene políticas `anon` de INSERT y SELECT creadas fuera del script.
- **Mitigación:** script que documente el estado final de políticas después de T2; actualizar `01-schema.sql` o agregar un script de políticas versionado.

### ST-25 · El botón de la grilla agrega la primera variante — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** el botón "Agregar" de `js/compartido/card-producto.js` agregaba la primera variante sin preguntar, aunque estuviera agotada.
- **Solución aplicada (D14):** con variantes, el botón dice "Elegir opción" y lleva a la ficha; sin variantes, se agrega directo como antes.

### ST-26 · Precio de la primera variante — P0 · Ventas: Alto · ✅ Hecho (T1)
- **Evidencia:** `mapearProducto` (`js/api/productos.js`) tomaba `precio_venta` de `detalles[0]`; las variantes no traían precio.
- **Solución aplicada (D13):** cada variante trae `precio` y `precio_original`; la ficha cambia el precio al elegir variante; el carrito guarda el precio de la variante.

### ST-27 · Variantes eliminadas visibles — P0 · Ventas: Medio · ✅ Hecho (T1)
- **Evidencia:** la consulta trae `pos_productos_detalle(*)` sin filtrar `deleted_at`.
- **Solución aplicada:** `mapearProducto` descarta variantes con `deleted_at`.

### ST-28 · Grilla sin indicar precios distintos — P1 · Ventas: Medio · ✅ Hecho (T1)
- **Solución aplicada:** `precioMin` y `preciosDistintos` en `js/api/productos.js`; la tarjeta muestra "Desde $X" cuando los precios difieren y el precio normal cuando son iguales.

## 6. Riesgos aceptados

| ID | Riesgo | Decisión | Revisión |
|---|---|---|---|
| RA-01 | Lectura pública de `pos_clientes` (nombres, correos, celulares) con la llave pública. Riesgo bajo la Ley 1581 de 2012 (Habeas Data). | Aceptado por el negocio (2026-10-16, ratificado 2026-10-28). | Revisar cuando la tienda reciba pedidos reales. |
| RA-02 | La portada muestra "4.8 · 152 reseñas verificadas" fijas en `index.html`, que no corresponden a reseñas reales. | Se mantienen por decisión del negocio (2026-10-28). | **Recomendación técnica:** retirarlas o reemplazarlas por reseñas reales. Afirmaciones no veraces en publicidad pueden considerarse publicidad engañosa (Ley 1480 de 2011, Estatuto del Consumidor) y ser sancionadas por la SIC; además, si un cliente lo detecta, afecta la confianza que la tienda busca generar. |
| RA-03 | Envío gratis desde $80.000 también en zonas remotas y en contraentrega. | Aceptado (D8). | Revisar el margen si entran pedidos a zonas especiales. |

## 7. Plan de trabajo

| Fase | Contenido | Tipo | Dependencias | Estado |
|---|---|---|---|---|
| **T1 Correcciones rápidas** | ST-01, ST-02, ST-03, ST-25, ST-26, ST-27, ST-28 | Solo frontend | Ninguna | ✅ Hecho 2026-10-28 |
| **T2 Pedido seguro** | ST-04, ST-05, ST-06, ST-07, ST-08 | SQL + frontend | T1 | Pendiente |
| **T3 Checkout coherente** | ST-09, ST-10, ST-11, ST-12, ST-13 | SQL (tarifas) + frontend | T2 | Pendiente |
| **T4 Pedidos web en el POS** | ST-15 | POS + SQL menor | T2 (T3 recomendado) | Pendiente |
| **T5 Alcance y rendimiento** | ST-16 a ST-21 | Frontend + Vercel | Ninguna | Pendiente |
| **T6 Deuda técnica** | ST-22, ST-23, ST-24 | Frontend + documentación | Puede ir junto con otras fases | Pendiente |

**Método de trabajo (igual que POS y WMS):** un cambio a la vez; análisis con archivos reales (subidos desde el disco local, no desde el visor de OneDrive); plan y luz verde; archivos completos; pruebas en `KUBIT-Pruebas`; copia a `KUBIT-PRODUCCION`; commit con `git add` por archivo (sin `config.js`); prueba de humo en Vercel; actualizar este documento y `memory/progress.md`.

### Pruebas automatizadas

- Carpeta `tests/store/` en la raíz del repo. Archivos `.mjs` (módulo ES; el `package.json` del repo usa `"type": "module"`).
- Sin dependencias (`node:test` y `node:vm`); cargan el código real de `apps/store`, simulan navegador y Supabase y **no tocan la base de datos**.
- `tests/store/store-t1.test.mjs`: 20 casos (ST-01, 02, 03, 25, 26, 27, 28, regresión de productos sin variantes y agotados, versión de caché y sintaxis de todos los JS de la tienda).
- Ejecutar desde la raíz del repo: `node --test tests/store/store-t1.test.mjs`.
- Cada fase agrega su propio archivo de test (`store-t2.test.mjs`, …) y los anteriores deben seguir pasando.

### Criterios de aceptación por fase

- **T1 (✅ 2026-10-28):** con dos variantes del mismo producto en el carrito, +, − y eliminar actúan sobre la correcta; el pedido guarda el `producto_detalle_id` de cada variante; una variante agotada no se puede agregar; la grilla muestra "Elegir opción" para productos con variantes y "Desde $X" si los precios difieren; las variantes eliminadas no aparecen; test 20/20.
- **T2:** el pedido se crea con una sola llamada; un precio manipulado en `localStorage` no cambia el total guardado; si falta stock, no se crea nada; `anon` ya no puede leer `st_pedidos`, `st_pedidos_detalle` ni `st_direcciones` (verificado con `pg_policies` y una consulta con la llave pública); números de pedido únicos; el cliente se reconoce por celular.
- **T3:** el envío cambia según departamento/ciudad y medio de pago; desde $80.000 es $0; carrito, checkout y pedido muestran el mismo total; solo aparecen los 3 medios de pago; la confirmación muestra instrucciones y el botón "Confirmar por WhatsApp"; la ficha tiene "Preguntar por WhatsApp" con el producto; la paginación no repite productos.
- **T4:** un pedido nuevo aparece en el contador del menú y en el Panel; se puede pasar por todos los estados registrando pago y guía; "Crear venta en POS" abre la venta con los productos; el pedido web no mueve inventario.
- **T5:** al compartir un enlace se ve imagen, nombre y precio; la búsqueda encuentra por SKU y sin tildes; mejora la carga en celular.
- **T6:** sin `innerHTML` con datos sin escapar; `01-schema.sql` (o su script complementario) coincide con `pg_policies` de producción.

## 8. Tareas operativas

| ID | Tarea | Estado |
|---|---|---|
| OP-01 | Borrar los 5 pedidos de prueba de producción (KBT-202610-8977, -0409, -9276, -1848, -7621) y su detalle. | Hecho 2026-10-28 |

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2026-10-28 | Levantamiento inicial: 24 hallazgos, 3 riesgos aceptados, decisiones D1–D12 y plan T1–T6. |
| v2 | 2026-10-28 | T1 publicada: ST-01, 02, 03, 25, 26, 27 y 28 hechos; ST-14 cerrado como falso positivo; nuevos ST-25 a ST-28; decisiones D13–D15; rutas corregidas (`js/api/`, `js/compartido/`); pruebas automatizadas en `tests/store/`. |
