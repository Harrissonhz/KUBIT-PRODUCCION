# progress.md — Avance de la Tienda (apps/store)

Registro corto del estado. El detalle está en `specs/hallazgos-tienda.md`.

## Estado actual (2026-11-03)

- La tienda está en producción y no ha recibido pedidos reales (todos los pedidos de prueba se borraron: OP-01 y OP-02).
- Hallazgos ST-01 a ST-30, riesgos aceptados RA-01 a RA-05 y plan T1–T6.
- **T1 publicada (`f7ce184`):** carrito y pedido por variante (SKU) con su propio precio; variantes agotadas y eliminadas no se pueden comprar; "Elegir opción" y "Desde $X".
- **T2 publicada (`b3bc908`):** los pedidos se crean solo con la función `st_crear_pedido` (una transacción, precio del POS, cliente CONSUMIDOR Ecommerce, número `KBT-AAAAMM-NNNNNN` por secuencia, aviso de stock en `notas` sin rechazar). Celular obligatorio y correo opcional, sin cédula. Carrito y checkout vuelven a leer el precio del POS. Acceso anónimo a `st_pedidos`, `st_pedidos_detalle` y `st_direcciones` cerrado. Caché `outletshop-20261030-01`.
- Scripts en producción y QA: `specs/15-store-pedido-seguro.sql` y `specs/16-store-cerrar-acceso-anon.sql`.
- Pruebas automatizadas: `node --test tests/store/*.test.mjs` (59/59) y `npm test` (119/119).
- `KUBIT-Pruebas` sincronizada con producción (`837c110`); solo difieren los 3 archivos de credenciales.

## Siguiente paso

- **T3 Checkout coherente:** envío por departamento y gratis desde $80.000 (ST-09), medios de pago reales Transferencia / Mercado Pago / Contraentrega (ST-10), confirmación con instrucciones y "Confirmar por WhatsApp" (ST-11), "Preguntar por WhatsApp" en la ficha (ST-12) y paginación estable (ST-13).
- Pendiente aparte: RA-04 (quitar `anon crean clientes` tras verificar el POS en QA) y ST-30.

## Avance por fase

| Fase | Estado | Fecha | Commit |
|---|---|---|---|
| T1 Correcciones rápidas | Hecho | 2026-10-28 | f7ce184 |
| T2 Pedido seguro | Hecho | 2026-11-03 | b3bc908 |
| T3 Checkout coherente | Pendiente | | |
| T4 Pedidos web en el POS | Pendiente | | |
| T5 Alcance y rendimiento | Pendiente | | |
| T6 Deuda técnica | Pendiente | | |

## Bitácora

- **2026-10-28:** documento de hallazgos v1 creado. Políticas RLS de producción revisadas (`pg_policies`): `anon` puede leer y crear en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`, y crear en `pos_clientes` (ST-05).
- **2026-10-28:** T1 probada en `KUBIT-Pruebas` (test 20/20 y 6 pruebas manuales: grilla, dos variantes en el carrito, botones por línea, pedido con `SEG011` y `SEG011-Reno`, variante agotada, celular) y publicada. ST-14 cerrado como falso positivo. Archivos: `js/api/productos.js`, `js/compartido/card-producto.js`, `js/paginas/producto.js`, `js/paginas/carrito.js`, `js/paginas/checkout.js`, `service-worker.js`, `tests/store/store-t1.test.mjs`.
- **2026-10-28:** OP-01 hecha: se borraron de producción los 5 pedidos de prueba y su detalle. Después se encontró y borró `KBT-202610-8889`, creado por la prueba manual de T1: la tienda de `KUBIT-Pruebas` apuntaba a producción (ST-29). Se restauró `supabase-client.js` de Pruebas con `git restore`.
- **2026-10-29:** `KUBIT-Pruebas` sincronizada con producción sin credenciales (POS F42, WMS U2, Store T1, documentación, `package-lock.json`). Se quitó el test duplicado `tests/store/store-t1.test.js` (`97a2455`).
- **2026-10-29:** decisiones de T2: sin cédula; cliente genérico CONSUMIDOR Ecommerce (`CC 222222222222`; se corrigió el número de Daniel Castaño, que estaba repetido); sin validación de stock (RA-05) con aviso en `notas`; precio siempre del POS; medios de pago temporales; `pos_clientes` no se toca (RA-04).
- **2026-11-03:** T2 probada en QA (scripts 15 y 16, pedidos `KBT-202611-000001` a `-000003`; `-000002` con `Stock insuficiente: AL119 (pedido 20, disponible 1)`; precio manipulado en `localStorage` ignorado; lectura anónima de `st_pedidos` bloqueada; POS y WMS sin errores) y publicada en producción en orden 15 → frontend (`b3bc908`) → 16. Verificación en producción: 0 políticas y 0 permisos `anon` en las tres tablas. `st_envios` y `st_pagos_online` vacías y sin uso (ST-30). OP-02: pedidos de la prueba de humo borrados. Archivos: `specs/15-store-pedido-seguro.sql`, `specs/16-store-cerrar-acceso-anon.sql`, `specs/03-seed-store-grants.sql`, `checkout.html`, `service-worker.js`, `js/paginas/checkout.js`, `js/paginas/carrito.js`, `js/compartido/utils.js`, `tests/store/_entorno.mjs`, `store-t1.test.mjs`, `store-t2.test.mjs`, `ambiente.test.mjs`.
