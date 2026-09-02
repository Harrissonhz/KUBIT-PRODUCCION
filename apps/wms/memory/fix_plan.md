# fix_plan.md — Cola de trabajo priorizada (la que el bucle Ralph consume)

> El agente toma la **primera tarea pendiente** de arriba hacia abajo. Al terminar, la marca `[x]` y agrega aquí cualquier trabajo nuevo detectado (al final).
> Sincronizado con `specs/tasks.md`. Estados: `[ ]` pendiente · `[x]` hecho · `[!]` bloqueado.

## Prioridad 1 — Cimientos (bloquean todo lo demás)
- [ ] T-001 Scaffolding Next.js + TS + Tailwind en `apps/wms`
- [ ] T-003 Cliente Supabase
- [ ] T-004 Vitest + lint
- [ ] T-101 Migración `wms_bodegas`
- [ ] T-102 Migración `wms_ubicaciones`
- [ ] T-103 Migración `wms_stock_ubicacion`
- [ ] T-104 Migración `wms_movimientos`
- [ ] T-105 Migración `wms_conteos`
- [ ] T-106 Índices FK
- [ ] T-108 Seed 3 bodegas

## Prioridad 2 — Dominio verificable
- [ ] T-201 `lib/codigos.ts` + pruebas
- [ ] T-202 `domain/stock.ts` + pruebas
- [ ] T-203 `lib/reconciliacion.ts` + pruebas

## Prioridad 3 — RPCs atómicas (corazón del sistema)
- [ ] T-301 `wms_recibir()`
- [ ] T-302 `wms_ubicar()`
- [ ] T-303 `wms_reservar()`
- [ ] T-304 `wms_despachar()`
- [ ] T-305 `wms_liberar()`
- [ ] T-306 `wms_trasladar()`
- [ ] T-307 `wms_ajustar()`
- [ ] T-308 `wms_dar_baja()`
- [ ] T-309 Prueba de invariante por RPC

## Prioridad 4 — Pantallas
- [ ] T-401 Config (bodegas/contenedores)
- [ ] T-402 Inventario general / Ubicar
- [ ] T-403 Buscar producto
- [ ] T-404 Despachar
- [ ] T-405 Traslados
- [ ] T-406 Reconciliación
- [ ] T-407 Baja
- [ ] T-408 Dashboard
- [ ] T-002 PWA manifest + SW
- [ ] T-005 Layout + navegación

## Prioridad 5 — Endurecimiento
- [ ] T-501 Idempotencia end-to-end
- [ ] T-502 Atomicidad (fallo revierte)
- [ ] T-503 PWA offline básica
- [ ] T-504 Invariante en los 8 flujos
- [ ] T-505 README apps/wms
- [ ] T-107 RLS policies

## Trabajo nuevo detectado durante el bucle (append here)
- (vacío)

## BLOQUEOS
- (ninguno)
