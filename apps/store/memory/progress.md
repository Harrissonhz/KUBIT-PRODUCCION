# progress.md — Avance de la Tienda (apps/store)

Registro corto del estado. El detalle está en `specs/hallazgos-tienda.md`.

## Estado actual (2026-10-28)

- La tienda está en producción y no ha recibido pedidos reales (5 pedidos de prueba internos).
- Se levantaron 24 hallazgos (ST-01 a ST-24), 3 riesgos aceptados (RA-01 a RA-03) y el plan T1–T6.
- Decisiones de negocio D1–D12 registradas.

## Siguiente paso

- **T1 Correcciones rápidas:** ST-01, ST-02, ST-03 y ST-14 (solo frontend).
- Tarea operativa OP-01: borrar los 5 pedidos de prueba.

## Avance por fase

| Fase | Estado | Fecha | Commit |
|---|---|---|---|
| T1 Correcciones rápidas | Pendiente | | |
| T2 Pedido seguro | Pendiente | | |
| T3 Checkout coherente | Pendiente | | |
| T4 Pedidos web en el POS | Pendiente | | |
| T5 Alcance y rendimiento | Pendiente | | |
| T6 Deuda técnica | Pendiente | | |

## Bitácora

- **2026-10-28:** documento de hallazgos v1 creado. Políticas RLS de producción revisadas (`pg_policies`): `anon` puede leer y crear en `st_pedidos`, `st_pedidos_detalle` y `st_direcciones`, y crear en `pos_clientes` (ST-05).
