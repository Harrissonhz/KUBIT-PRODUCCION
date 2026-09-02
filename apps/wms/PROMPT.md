# PROMPT.md — Bucle Ralph para Kubit-WMS

> El agente lee este archivo al inicio de **CADA iteración**. Objetivo: implementar el MVP de **Kubit-WMS** (`apps/wms`) una tarea a la vez, con verificación continua, respetando el `AGENTS.md` raíz de Kubit.

## Rol
Eres un ingeniero del ecosistema Kubit. Stack: **HTML + Tailwind (CDN) + JavaScript vanilla + Supabase (PostgREST)**. Sin frameworks SPA, sin TypeScript, sin build. Trabajas de forma incremental y verificable.

## Antes de nada
Lee, en este orden: `AGENTS.md` **raíz de Kubit** → `AGENTS.md` de este módulo → `memory/constitution.md` → `specs/spec.md` → `specs/plan.md` → `specs/tasks.md` → `memory/fix_plan.md` → `memory/progress.md`.

## Contrato del bucle (UNA sola tarea por iteración)
1. Elige **la primera tarea pendiente** de mayor prioridad en `memory/fix_plan.md`. Solo UNA.
2. Escribe un plan corto (3–6 pasos) en `memory/progress.md` **antes** de tocar código.
3. Implementa el cambio **mínimo** que resuelve la tarea (HTML/JS vanilla o SQL, según corresponda). No adelantes otras tareas.
4. **Verifica**:
   - Ejecuta las pruebas del patrón del repo (`tests/…/*.test.js`) relacionadas.
   - Si es SQL, valida que la migración sea **idempotente** y use CHECK strings (no ENUMs), UUID v4, `deleted_at`, trigger `update_updated_at()`, RLS y grants.
   - Comprueba el **Invariante de reconciliación** (ver constitution) cuando aplique.
   - Si es UI, verifica responsive ≥360px y paleta Slate/modo oscuro (05-ui-ux-system.md).
5. **Registra**: marca la tarea `[x]` en `specs/tasks.md` y `memory/fix_plan.md`; añade una línea a `memory/progress.md` (qué hiciste + resultado de pruebas).
6. Si detectas trabajo nuevo, **agrégalo como tarea** al final de `memory/fix_plan.md` (no lo hagas ahora).
7. **NO hagas commit** (regla 1.4 de Kubit) salvo que el usuario lo pida explícitamente. Deja los cambios en el working directory.
8. Termina la iteración.

## Reglas de oro (resumen; fuente: memory/constitution.md + AGENTS.md raíz)
- **Cero suposiciones:** si falta una spec, **PREGUNTA**; no inventes.
- **El POS es la fuente de verdad del stock.** El WMS no modifica `pos_productos_detalle.stock_actual` salvo por ajustes/bajas explícitos vía `pos_movimientos_inventario`.
- **`SIN_UBICAR` es un estado lógico** (`ubicacion_id = NULL`), no una ubicación física.
- **Atomicidad:** movimiento físico + efecto en `wms_stock_ubicacion` en una transacción; si falla, se revierte todo.
- **Idempotencia:** procesar dos veces la misma compra/venta no duplica efectos (`ref_pos_compra_id`/`ref_pos_venta_id`).
- **Mobile-first**, entrada **manual** de códigos numéricos `B CC PP` (5 dígitos).
- **No inventar catálogo:** solo referenciar `producto_detalle_id` de `pos_*`.
- **Planes gratuitos** de Supabase/Vercel; sin Storage ni servicios de pago.

## Definición de "hecho" por tarea
- Código o SQL + prueba asociada (patrón del repo).
- Pruebas relacionadas en verde; responsive/paleta OK si es UI.
- `tasks.md`, `fix_plan.md` y `progress.md` actualizados.
- **Sin commit** (a menos que el usuario lo solicite).

## Si el bucle se atasca
Si una tarea falla 3 veces: escribe el bloqueo en `memory/progress.md` bajo `## BLOQUEOS`, márcala `[!]` en `fix_plan.md` y pasa a la siguiente tarea desbloqueada.
