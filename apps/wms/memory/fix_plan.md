# fix_plan.md — Cola de trabajo priorizada (la que el bucle Ralph consume)

> El agente toma la **primera tarea pendiente** de arriba hacia abajo. Al terminar, la marca `[x]` y agrega aquí trabajo nuevo detectado (al final).
> Sincronizado con `specs/tasks.md`. Estados: `[ ]` pendiente · `[x]` hecho · `[!]` bloqueado.

## Prioridad 1 — Cimientos (bloquean todo lo demás)
- [ ] T-001 Estructura `apps/wms` + index.html base (Slate + dark)
- [ ] T-002 `js/config.js` (Supabase)
- [ ] T-101 Tabla `wms_bodegas`
- [ ] T-102 Tabla `wms_ubicaciones`
- [ ] T-103 Tabla `wms_stock_ubicacion`
- [ ] T-104 Tabla `wms_movimientos`
- [ ] T-105 Tabla `wms_conteos`
- [ ] T-106 Índices FK
- [ ] T-107 RLS + grants
- [ ] T-108 Seed 3 bodegas

## Prioridad 2 — Dominio verificable
- [ ] T-201 `js/codigos.js` + prueba
- [ ] T-202 `js/stock.js` + prueba
- [ ] T-203 `js/reconciliacion.js` + prueba

## Prioridad 3 — Funciones atómicas Postgres (.rpc())
- [ ] T-301 `wms_recibir()`
- [ ] T-302 `wms_ubicar()`
- [ ] T-303 `wms_reservar()`
- [ ] T-304 `wms_despachar()`
- [ ] T-305 `wms_liberar()`
- [ ] T-306 `wms_trasladar()`
- [ ] T-307 `wms_ajustar()`
- [ ] T-308 `wms_dar_baja()`
- [ ] T-309 Prueba de invariante por RPC

## Prioridad 4 — Capa de datos + pantallas
- [ ] T-401 `js/database.js` (DB.wms.*)
- [ ] T-402 config.html (bodegas/contenedores)
- [ ] T-403 inventario.html (ubicar)
- [ ] T-404 buscar.html
- [ ] T-405 despachar.html
- [ ] T-406 traslados.html
- [ ] T-407 reconciliacion.html
- [ ] T-408 baja.html
- [ ] T-409 index.html (dashboard)
- [ ] T-003 `js/auth.js`
- [ ] T-004 PWA (manifest + SW)
- [ ] T-005 Sidebar/navegación

## Prioridad 5 — Endurecimiento
- [ ] T-501 Idempotencia end-to-end
- [ ] T-502 Atomicidad (fallo revierte)
- [ ] T-503 PWA offline básica
- [ ] T-504 Invariante en los 8 flujos
- [ ] T-505 Notas de implementación

## Trabajo nuevo detectado durante el bucle (append here)
- (vacío)

## BLOQUEOS
- (ninguno)
