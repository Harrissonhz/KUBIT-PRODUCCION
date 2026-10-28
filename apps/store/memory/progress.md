# progress.md — Avance de la Tienda (apps/store)

Registro corto del estado. El detalle está en `specs/hallazgos-tienda.md`.

## Estado actual (2026-10-28)

- La tienda está en producción y no ha recibido pedidos reales (5 pedidos de prueba internos).
- Hallazgos ST-01 a ST-28, riesgos aceptados RA-01 a RA-03 y plan T1–T6.
- **T1 publicada:** el carrito y el pedido manejan cada variante (SKU) con su propio precio; variantes agotadas y eliminadas no se pueden comprar; la grilla muestra "Elegir opción" y "Desde $X". Caché `outletshop-20261028-01`.
- Pruebas automatizadas: `node --test tests/store/store-t1.test.mjs` (20/20).

## Siguiente paso

- **T2 Pedido seguro:** función `st_crear_pedido` (transacción única, precios y stock desde la base, cliente por celular, número de pedido por secuencia) y retiro de las políticas `anon` de `st_pedidos`, `st_pedidos_detalle` y `st_direcciones` (ST-04 a ST-08).
- OP-01 hecha (2026-10-28): 5 pedidos de prueba borrados de producción.

## Avance por fase

| Fase | Estado | Fecha | Commit |
|---|---|---|---|
| T1 Correcciones rápidas | Hecho | 2026-10-28 | f7ce184 |
| T2 Pedido seguro | Pendiente | | |
| T3 Checkout coherente | Pendiente | | |
| T4 Pedidos web en el POS | Pendiente | | |
| T5 Alcance y rendimiento | Pendiente | | |
| T6 Deuda técnica | Pendiente | | |

## Bitácora

- **2026-10-28:** documento de hallazgos v1 creado. Políticas RLS de producción revisadas (`pg_policies`): `anon` puede leer y crear en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`, y crear en `pos_clientes` (ST-05).
- **2026-10-28:** T1 probada en `KUBIT-Pruebas` (test 20/20 y 6 pruebas manuales: grilla, dos variantes en el carrito, botones por línea, pedido con `SEG011` y `SEG011-Reno`, variante agotada, celular) y publicada. ST-14 cerrado como falso positivo. Archivos: `js/api/productos.js`, `js/compartido/card-producto.js`, `js/paginas/producto.js`, `js/paginas/carrito.js`, `js/paginas/checkout.js`, `service-worker.js`, `tests/store/store-t1.test.mjs`.
- **2026-10-28:** OP-01 hecha: se borraron de producción los 5 pedidos de prueba y su detalle. `st_pedidos` queda vacía.
