# progress.md — Avance de la Tienda (apps/store)

Registro corto del estado. El detalle está en `specs/hallazgos-tienda.md`.

## Estado actual (2026-11-09)

- La tienda está en producción y no ha recibido pedidos reales (todos los pedidos de prueba se borraron: OP-01 y OP-02).
- Hallazgos ST-01 a ST-33, riesgos aceptados RA-01 a RA-05 y plan T1–T6.
- **T1 publicada (`f7ce184`):** carrito y pedido por variante (SKU) con su propio precio; variantes agotadas y eliminadas no se pueden comprar; "Elegir opción" y "Desde $X".
- **T2 publicada (`b3bc908`):** los pedidos se crean solo con la función `st_crear_pedido` (una transacción, precio del POS, cliente CONSUMIDOR Ecommerce, número `KBT-AAAAMM-NNNNNN` por secuencia, aviso de stock en `notas` sin rechazar). Celular obligatorio y correo opcional, sin cédula. Carrito y checkout vuelven a leer el precio del POS. Acceso anónimo a `st_pedidos`, `st_pedidos_detalle` y `st_direcciones` cerrado. Caché `outletshop-20261030-01`.
- Scripts en producción y QA: `specs/15-store-pedido-seguro.sql` y `specs/16-store-cerrar-acceso-anon.sql`.
- **T3a publicada (`92dc65b`, `272bc1d`):** "Preguntar por WhatsApp" en la ficha con producto, opción, SKU, precio y enlace, y el logo completo de WhatsApp; paginación estable por visita. Caché `outletshop-20261108-01`.
- **T3b publicada (`679251a`):** script `specs/17-store-checkout-coherente.sql` (zonas de envío, envío gratis desde $80.000, pedido mínimo $15.000, `medio_pago_web`, instrucciones de pago); checkout con 3 medios (Transferencia Bre-B, Tarjeta vía Mercado Pago, Contraentrega), envío y días por ciudad y confirmación con "Copiar", "Pagar con Mercado Pago" y "Confirmar por WhatsApp"; términos y preguntas frecuentes alineados. Caché `outletshop-20261108-02`.
- Producción con valores reales: tarifas local $15.000, Antioquia $18.000, ciudades principales $25.000, nacional $30.000, zonas especiales $42.000; llave Bre-B, titular y Tu Link en `st_configuracion`. QA conserva valores de prueba.
- Scripts en producción y QA: 15, 16, 17 y 18.
- **T4 publicada (`1bddcb5`, caché POS `kubit-pos-20261108-01`):** pedidos web en el POS. Script `specs/18-pos-pedidos-web.sql` (columnas `gestionado_at`, `gestionado_por`, `nota_gestion` y funciones `pos_pedido*_web_*`); aviso al entrar (una vez por sesión), "Pedidos web (N)" en el menú y tarjeta en el Panel; página `pedidos-web.html` con tarjetas colapsables, WhatsApp, copiar datos del cliente y cierre ("Venta registrada" → `CONFIRMADO`, "No se concretó" → `CANCELADO`, número de venta y nota opcionales). El pedido web sigue sin mover inventario: la venta se registra a mano. QA conserva sus pedidos de prueba (`KBT-202611-000001` a `-000010`).
- **T5a publicada (`6d052a9`; Pruebas `677a26e`, caché `outletshop-20261109-01`):** búsqueda por SKU de cualquier variante, marca y etiquetas, sin tildes y por relevancia (ST-16); el buscador de la barra funciona desde cualquier página y muestra lo buscado (ST-32); service worker con red primero, sin versiones viejas y sin recargar el checkout (ST-20); íconos PNG y `apple-touch-icon` (ST-21). Sin SQL.
- Pruebas automatizadas: `node --test tests/store/*.test.mjs` (146/146), `node --test tests/pos/*.test.mjs` (29/29) y `npm test` (119/119).
- `KUBIT-Pruebas` sincronizada con producción (`837c110`); solo difieren los 3 archivos de credenciales.

## Siguiente paso

- Decidir: **T5b** (vista previa al compartir un producto y `sitemap.xml`; requiere configuración en Vercel), **T5c** (rendimiento: medir antes con PageSpeed; incluye el favicon de 152 KB, ST-33) o **ST-31** (pantalla para editar la configuración de la tienda sin SQL).
- Pendiente aparte: RA-04 (quitar `anon crean clientes` tras verificar el POS en QA), ST-30 y depurar en producción los usuarios `admin` y `admin_497a2c95` de `pos_usuarios`, que no existen en Supabase Auth (AGENTS.md §10.5).

## Avance por fase

| Fase | Estado | Fecha | Commit |
|---|---|---|---|
| T1 Correcciones rápidas | Hecho | 2026-10-28 | f7ce184 |
| T2 Pedido seguro | Hecho | 2026-11-03 | b3bc908 |
| T3a WhatsApp y paginación | Hecho | 2026-11-08 | 92dc65b, 272bc1d |
| T3b Checkout coherente | Hecho | 2026-11-08 | 679251a |
| T4 Pedidos web en el POS | Hecho | 2026-11-08 | 1bddcb5 |
| T5a Búsqueda, service worker e íconos | Hecho | 2026-11-09 | 6d052a9 |
| T5b Vista previa al compartir | Pendiente | | |
| T5c Rendimiento | Pendiente | | |
| T6 Deuda técnica | Pendiente | | |

## Bitácora

- **2026-10-28:** documento de hallazgos v1 creado. Políticas RLS de producción revisadas (`pg_policies`): `anon` puede leer y crear en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`, y crear en `pos_clientes` (ST-05).
- **2026-10-28:** T1 probada en `KUBIT-Pruebas` (test 20/20 y 6 pruebas manuales: grilla, dos variantes en el carrito, botones por línea, pedido con `SEG011` y `SEG011-Reno`, variante agotada, celular) y publicada. ST-14 cerrado como falso positivo. Archivos: `js/api/productos.js`, `js/compartido/card-producto.js`, `js/paginas/producto.js`, `js/paginas/carrito.js`, `js/paginas/checkout.js`, `service-worker.js`, `tests/store/store-t1.test.mjs`.
- **2026-10-28:** OP-01 hecha: se borraron de producción los 5 pedidos de prueba y su detalle. Después se encontró y borró `KBT-202610-8889`, creado por la prueba manual de T1: la tienda de `KUBIT-Pruebas` apuntaba a producción (ST-29). Se restauró `supabase-client.js` de Pruebas con `git restore`.
- **2026-10-29:** `KUBIT-Pruebas` sincronizada con producción sin credenciales (POS F42, WMS U2, Store T1, documentación, `package-lock.json`). Se quitó el test duplicado `tests/store/store-t1.test.js` (`97a2455`).
- **2026-10-29:** decisiones de T2: sin cédula; cliente genérico CONSUMIDOR Ecommerce (`CC 222222222222`; se corrigió el número de Daniel Castaño, que estaba repetido); sin validación de stock (RA-05) con aviso en `notas`; precio siempre del POS; medios de pago temporales; `pos_clientes` no se toca (RA-04).
- **2026-11-03:** T2 probada en QA (scripts 15 y 16, pedidos `KBT-202611-000001` a `-000003`; `-000002` con `Stock insuficiente: AL119 (pedido 20, disponible 1)`; precio manipulado en `localStorage` ignorado; lectura anónima de `st_pedidos` bloqueada; POS y WMS sin errores) y publicada en producción en orden 15 → frontend (`b3bc908`) → 16. Verificación en producción: 0 políticas y 0 permisos `anon` en las tres tablas. `st_envios` y `st_pagos_online` vacías y sin uso (ST-30). OP-02: pedidos de la prueba de humo borrados. Archivos: `specs/15-store-pedido-seguro.sql`, `specs/16-store-cerrar-acceso-anon.sql`, `specs/03-seed-store-grants.sql`, `checkout.html`, `service-worker.js`, `js/paginas/checkout.js`, `js/paginas/carrito.js`, `js/compartido/utils.js`, `tests/store/_entorno.mjs`, `store-t1.test.mjs`, `store-t2.test.mjs`, `ambiente.test.mjs`.
- **2026-11-08:** T3a probada en `KUBIT-Pruebas` (tests 73/73 y pruebas manuales) y publicada (`92dc65b`; Pruebas `f492026`). Ajuste: logo completo de WhatsApp en el botón (`272bc1d`; Pruebas `9a7fcc1`), tests 74/74.
- **2026-11-08:** T3b: decisiones D23–D28; script 17 probado en QA (zonas Itagüí/local, Barbosa de Santander/nacional, Leticia/especial; pedidos `KBT-202611-000006` a `-000010` con envío por zona, envío gratis, los 3 medios y stock insuficiente sin instrucciones de pago); POS y WMS sin cambios. Publicada en producción (`679251a`): script 17, `UPDATE` con tarifas, llave, titular y Tu Link reales, frontend y prueba de humo. RA-03 ratificado con las tarifas reales. Nuevo ST-31.
- **2026-11-08:** documentación del proyecto actualizada para T1 a T3b (`AGENTS.md`, `CLAUDE.md`, `specs/04-store-spec.md`, `11-api-contracts.md`, `00-bootstrap.sql`, `01-master-spec.md`, `ARCHITECTURE.md`, `12-roadmap.md`, `13-testing-model.md`, este archivo y `hallazgos-tienda.md` v5).
- **2026-11-08:** T4 reformulada con el negocio: la gestión es por WhatsApp; el POS avisa, muestra los datos y permite cerrar el pedido (D29–D35). Script `18` probado en QA con `admin_pruebas` (solo ese usuario existe en Supabase Auth de QA): aviso, contador, tarjeta del Panel, cierre con número de venta (`CONFIRMADO` con `venta_id`) y sin él (`CANCELADO`), número de venta inexistente rechazado, tarjetas colapsables y colores en modo claro y oscuro. POS y WMS sin cambios de comportamiento.
- **2026-11-08:** T4 publicada en producción (`1bddcb5`): script 18, frontend y prueba de humo con un pedido de prueba, borrado después (OP-04). QA conserva sus pedidos de prueba.
- **2026-11-08:** documentación actualizada para T4 (`AGENTS.md`, `CLAUDE.md`, `specs/03-pos-spec.md` §14, `04-store-spec.md` §3.11, `11-api-contracts.md` §10, `00-bootstrap.sql`, `01-master-spec.md`, `ARCHITECTURE.md`, `12-roadmap.md`, `13-testing-model.md`, `hallazgos-tienda.md` v6 y los skills `kubit-store` y `kubit-pos`).
- **2026-11-09:** T5 dividida en T5a, T5b y T5c (D36). T5a: decisiones D37–D39; al revisar el código se encontró que el buscador de la barra no funcionaba desde otras páginas (ST-32) y que el favicon `icon.svg` pesa 152 KB (ST-33, para T5c). Probada en `KUBIT-Pruebas` (tests 146/146 y pruebas manuales), publicada en calidad (`677a26e`) y luego en producción (`6d052a9`) con prueba de humo exitosa; no se crearon pedidos de prueba.
- **2026-11-09:** documentación actualizada para T5a (`AGENTS.md`, `CLAUDE.md`, `specs/04-store-spec.md` §3.12, `12-roadmap.md`, `13-testing-model.md`, `ARCHITECTURE.md`, `hallazgos-tienda.md` v7 y el skill `kubit-store`).
