# tasks.md — Backlog ejecutable Kubit-WMS (MVP)

> Lista ordenada y atómica. El bucle Ralph toma **una tarea pendiente por iteración**, la implementa, la prueba y la marca `[x]`.
> Estados: `[ ]` pendiente · `[x]` hecho · `[!]` bloqueado.

## Épica 0 — Scaffolding e infraestructura
- [ ] T-001 Crear `apps/wms` con Next.js (App Router) + TypeScript + Tailwind.
- [ ] T-002 Configurar PWA: `manifest.webmanifest` + `service-worker.js` (precache básico).
- [ ] T-003 Configurar cliente Supabase en `src/lib/supabase.ts` (env `.env.local`).
- [ ] T-004 Configurar Vitest + script `npm test` y `npm run lint`.
- [ ] T-005 Layout base mobile-first + navegación a las 9 pantallas.

## Épica 1 — Modelo de datos (migraciones)
- [ ] T-101 Migración `0001_wms_bodegas.sql` (con soft delete y auditoría).
- [ ] T-102 Migración `0002_wms_ubicaciones.sql` (árbol `parent_id`, `tipo`, `es_hoja`, `mono_sku`, `codigo`).
- [ ] T-103 Migración `0003_wms_stock_ubicacion.sql` (`estado_fase`, `cantidad`, `ubicacion_id` nullable).
- [ ] T-104 Migración `0004_wms_movimientos.sql` (ledger + `ref_pos_*`).
- [ ] T-105 Migración `0005_wms_conteos.sql` (inventario general).
- [ ] T-106 Migración `0006_indices_fk.sql` (índices en todas las FK).
- [ ] T-107 Migración `0007_rls_policies.sql` (RLS por `bodega_id`).
- [ ] T-108 Seed de las 3 bodegas.

## Épica 2 — Dominio: códigos y estados
- [ ] T-201 `lib/codigos.ts`: parser/validador `B CC PP` (regex + rangos) + `tests/codigos.test.ts`.
- [ ] T-202 `domain/stock.ts`: máquina de transiciones de `estado_fase` + `tests/stock.test.ts`.
- [ ] T-203 `lib/reconciliacion.ts`: cálculo del invariante y diff POS↔WMS + `tests/reconciliacion.test.ts`.

## Épica 3 — RPCs atómicas (PL/pgSQL) + integración
- [ ] T-301 `wms_recibir()` (idempotente por `ref_pos_compra_id`) + prueba.
- [ ] T-302 `wms_ubicar()` (SIN_UBICAR→UBICADO, valida mono-SKU) + prueba.
- [ ] T-303 `wms_reservar()` (idempotente por `ref_pos_venta_id`) + prueba.
- [ ] T-304 `wms_despachar()` (RESERVADO→DESPACHADO, con/sin ubicación) + prueba.
- [ ] T-305 `wms_liberar()` (anulación de venta) + prueba.
- [ ] T-306 `wms_trasladar()` (entre contenedores y bodegas) + prueba.
- [ ] T-307 `wms_ajustar()` (+/-, propaga a `pos_movimientos_inventario`) + prueba.
- [ ] T-308 `wms_dar_baja()` (→BAJA + merma en POS) + prueba.
- [ ] T-309 Prueba de invariante tras cada RPC (`tests/flujos.integration.test.ts`).

## Épica 4 — Pantallas (UI mobile-first)
- [ ] T-401 **Config**: alta de bodegas y contenedores (con código numérico validado).
- [ ] T-402 **Inventario general / Ubicar**: contar y asignar `SIN_UBICAR → UBICADO`.
- [ ] T-403 **Buscar producto**: ruta completa + cantidades por estado.
- [ ] T-404 **Despachar**: bandeja de ventas POS; reservar y despachar.
- [ ] T-405 **Traslados**: origen → destino (contenedor/bodega).
- [ ] T-406 **Reconciliación**: diffs por ajustes del POS y resolución.
- [ ] T-407 **Baja por avería**.
- [ ] T-408 **Dashboard**: SIN_UBICAR, pendientes por despachar, diferencias.

## Épica 5 — Endurecimiento
- [ ] T-501 Verificar idempotencia end-to-end (recibir/reservar dobles).
- [ ] T-502 Verificar atomicidad (fallo simulado revierte todo).
- [ ] T-503 PWA offline básica (lectura de mapa/últimas búsquedas).
- [ ] T-504 Revisión del invariante en los 8 flujos + reporte.
- [ ] T-505 README de `apps/wms` (setup, migraciones, scripts).

## Definición de Hecho (global)
Cada tarea: código + prueba, `lint` y `test` en verde, `tasks.md`/`fix_plan.md`/`progress.md` actualizados, commit convencional.
