# AGENTS.md — Instrucciones permanentes del agente (Kubit-WMS)

> Convenciones estándar que el agente respeta en **todas** las iteraciones del bucle Ralph.
> (Compatible con Claude Code / Codex / Cursor: estos archivos se cargan como contexto de proyecto.)

## Contexto del proyecto
- Monorepo **Kubit** (SaaS para PYMES). Módulos: `apps/pos`, `apps/store`, y el nuevo `apps/wms`.
- El WMS gestiona la ubicación física del inventario de la tienda **Outletshop** en 3 bodegas.
- Fuente de verdad del stock: **POS** (`pos_productos_detalle.stock_actual`). Ver `memory/constitution.md`.

## Stack y comandos
- Next.js (App Router) + TypeScript + Tailwind + Supabase. PWA.
- Instalar: `npm install`
- Lint: `npm run lint`
- Test: `npm test`
- Dev: `npm run dev`
- Migraciones: SQL en `apps/wms/supabase/migrations` (idempotentes, versionadas).

## Convenciones de código
- TypeScript estricto. Sin `any` salvo justificación.
- Nombres en español para dominio (bodega, ubicacion, traslado); inglés para infra técnica.
- Prefijo de tablas `wms_`. PK UUID v4. Auditoría y soft delete en todas.
- Funciones que tocan stock → **RPC transaccional** en Postgres (nunca updates sueltos desde el front).
- Commits convencionales: `feat(wms): …`, `fix(wms): …`, `test(wms): …`, `chore(wms): …`.

## Reglas de dominio (resumen; fuente: constitution.md)
1. No modificar `stock_actual` del POS salvo por ajuste/baja explícitos vía `pos_movimientos_inventario`.
2. `SIN_UBICAR` = estado lógico (ubicacion_id NULL).
3. Atomicidad e idempotencia obligatorias.
4. Código de ubicación numérico `B CC PP` (5 dígitos); `wms_ubicaciones.tipo` es la verdad del tipo.
5. Verificar el invariante de reconciliación tras cada operación de stock.

## Flujo por iteración (ver PROMPT.md)
Leer specs + fix_plan → tomar 1 tarea → plan corto en progress.md → implementar → lint+test → marcar hecho → commit.

## Qué NO hacer
- No implementar features fuera del MVP (FIFO/FEFO, capacidad, devoluciones, triggers, multiusuario).
- No adelantar varias tareas en una iteración.
- No dejar código sin prueba ni commits con `lint`/`test` en rojo.
