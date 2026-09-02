# tasks.md — Backlog ejecutable Kubit-WMS (MVP)

> Lista ordenada y atómica. El bucle Ralph toma **una tarea pendiente por iteración**, la implementa, la prueba y la marca `[x]`.
> Stack: HTML + Tailwind (CDN) + JS vanilla + Supabase (PostgREST/.rpc()). Testing vitest + jsdom. Estados: `[ ]` pendiente · `[x]` hecho · `[!]` bloqueado.

## Épica 0 — Estructura del módulo (sin build)
- [ ] T-001 Crear `apps/wms/` con `index.html` base (layout Slate + modo oscuro por defecto + anti-flash) y Tailwind CDN.
- [ ] T-002 `js/config.js` + `js/supabase.js` (cliente REST, credenciales QA, plan gratuito).
- [ ] T-003 `js/compartido/auth.js` (`window.KubitAuth` + `poblarUserHeader()` con IDs `user-avatar`/`user-name`/`user-rol`).
- [ ] T-004 `manifest.json` + `service-worker.js` (rutas relativas, cache-first, versioning `wms-YYYYMMDD-NN`, bypass localhost, `ignoreSearch:true`) + `vercel.json`.
- [ ] T-005 `js/compartido/sidebar.js` + navegación a las 8 pantallas (patrón POS, responsive ≥360px).

## Épica 1 — Modelo de datos (`/specs/08-wms-schema.sql`)
- [ ] T-101 Tabla `wms_bodegas` (UUID, timestamptz, trigger updated_at, deleted_at, auditoría).
- [ ] T-102 Tabla `wms_ubicaciones` (árbol `parent_id`, `tipo` CHECK string, `es_hoja`, `mono_sku`, `codigo`).
- [ ] T-103 Tabla `wms_stock_ubicacion` (`estado_fase` CHECK string, `cantidad`, `ubicacion_id` nullable).
- [ ] T-104 Tabla `wms_movimientos` (`tipo_movimiento` CHECK string + `ref_pos_*`).
- [ ] T-105 Tabla `wms_conteos` (inventario general).
- [ ] T-106 Índices en todas las FK.
- [ ] T-107 RLS + grants explícitos (`anon`, `authenticated`, `service_role`) por tabla.
- [ ] T-108 Seed de las 3 bodegas.

## Épica 2 — Dominio: códigos y estados (JS vanilla + pruebas)
- [ ] T-201 `js/codigos.js`: parser/validador `B CC PP` (regex + rangos) + `tests/wms/codigos.test.js`.
- [ ] T-202 `js/stock.js`: máquina de transiciones de `estado_fase` + `tests/wms/stock.test.js`.
- [ ] T-203 `js/reconciliacion.js`: invariante y diff POS↔WMS + `tests/wms/reconciliacion.test.js`.

## Épica 3 — Funciones atómicas Postgres (.rpc()) + pruebas de flujo
- [ ] T-301 `wms_recibir()` (idempotente por `ref_pos_compra_id`) + prueba.
- [ ] T-302 `wms_ubicar()` (SIN_UBICAR→UBICADO, valida mono-SKU) + prueba.
- [ ] T-303 `wms_reservar()` (idempotente por `ref_pos_venta_id`) + prueba.
- [ ] T-304 `wms_despachar()` (RESERVADO→DESPACHADO, con/sin ubicación) + prueba.
- [ ] T-305 `wms_liberar()` (anulación de venta) + prueba.
- [ ] T-306 `wms_trasladar()` (entre contenedores y bodegas) + prueba.
- [ ] T-307 `wms_ajustar()` (+/-, propaga a `pos_movimientos_inventario`) + prueba.
- [ ] T-308 `wms_dar_baja()` (→BAJA + `merma` en POS) + prueba.
- [ ] T-309 Prueba de invariante tras cada RPC (`tests/wms/flujos.test.js`).

## Épica 4 — Capa de datos + Pantallas (HTML + JS vanilla)
- [ ] T-401 `js/compartido/database.js` — `window.DB.wms.*` (lecturas PostgREST + escrituras `.rpc()` + lectura bajo demanda del POS).
- [ ] T-402 **config.html** + `paginas/config.js`: alta de bodegas y contenedores (código validado).
- [ ] T-403 **inventario.html** + `paginas/inventario.js`: contar y **ubicar** (`SIN_UBICAR → UBICADO`).
- [ ] T-404 **buscar.html** + `paginas/buscar.js`: ruta completa + cantidades por estado.
- [ ] T-405 **despachar.html** + `paginas/despachar.js`: reservar y despachar ventas POS.
- [ ] T-406 **traslados.html** + `paginas/traslados.js`: origen → destino (contenedor/bodega).
- [ ] T-407 **reconciliacion.html** + `paginas/reconciliacion.js`: diffs por ajustes del POS.
- [ ] T-408 **baja.html** + `paginas/baja.js`: baja por avería.
- [ ] T-409 **index.html** (Dashboard): SIN_UBICAR, pendientes por despachar, diferencias.

## Épica 5 — Endurecimiento
- [ ] T-501 Verificar idempotencia end-to-end (recibir/reservar dobles).
- [ ] T-502 Verificar atomicidad (fallo simulado revierte todo en la función Postgres).
- [ ] T-503 PWA offline básica (últimas búsquedas / mapa).
- [ ] T-504 Revisión del invariante en los 8 flujos + reporte.
- [ ] T-505 Actualizar `07-wms-spec.md` / `README` con notas de implementación.

## Definición de Hecho (global)
Cada tarea: código o SQL + prueba (vitest + jsdom), pruebas en verde, responsive/paleta OK si es UI, `tasks.md`/`fix_plan.md`/`progress.md` actualizados. **Sin commit** salvo petición explícita.
