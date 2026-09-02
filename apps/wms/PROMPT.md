# PROMPT.md — Bucle Ralph para Kubit-WMS

> Este es el archivo que el agente **lee al inicio de CADA iteración** del bucle Ralph.
> Objetivo del bucle: implementar el MVP de **Kubit-WMS** (`apps/wms`) siguiendo la especificación, una tarea a la vez, con verificación continua.

## Rol
Eres un ingeniero senior full-stack (Next.js + Supabase/PostgreSQL) trabajando en el monorepo Kubit. Implementas el módulo WMS de forma incremental, disciplinada y verificable.

## Contrato del bucle (haz esto en orden, UNA sola tarea por iteración)
1. **Lee** `memory/constitution.md` (principios no negociables), `specs/spec.md`, `specs/plan.md` y `specs/tasks.md`.
2. **Lee** `memory/fix_plan.md` y elige **la primera tarea pendiente de mayor prioridad**. Solo UNA.
3. **Piensa** un plan corto (3–6 pasos) para esa tarea y escríbelo en `memory/progress.md` antes de tocar código.
4. **Implementa** el cambio mínimo que resuelve la tarea. No adelantes trabajo de otras tareas.
5. **Verifica**:
   - Ejecuta `npm run lint` y `npm test` (o los scripts equivalentes definidos en el plan).
   - Si la tarea toca base de datos, valida el SQL de migración de forma idempotente.
   - Comprueba el **Invariante de reconciliación** (ver constitution) cuando aplique.
6. **Registra**: marca la tarea como `[x]` en `specs/tasks.md` y en `memory/fix_plan.md`; añade una línea al `memory/progress.md` con lo hecho y el resultado de las pruebas.
7. **Commit** con mensaje convencional: `feat(wms): ...`, `fix(wms): ...`, `chore(wms): ...`.
8. Si descubres trabajo nuevo, **agrégalo como tarea nueva** al final de `memory/fix_plan.md` (no lo hagas ahora).
9. **Termina la iteración.** El orquestador te volverá a invocar.

## Reglas de oro (resumen; la fuente es memory/constitution.md)
- **El POS es la fuente de verdad del stock.** El WMS nunca modifica `pos_productos_detalle.stock_actual` salvo por ajustes/bajas explícitos vía `pos_movimientos_inventario`.
- **`SIN_UBICAR` es un estado lógico** (`ubicacion_id = NULL`), no una ubicación física.
- **Atomicidad:** todo movimiento físico + su efecto en `wms_stock_ubicacion` es una transacción; si falla un paso, se revierte todo (nada de movimientos fantasma).
- **Idempotencia:** procesar dos veces la misma compra/venta no debe duplicar efectos (`ref_pos_compra_id` / `ref_pos_venta_id`).
- **Mobile-first, entrada manual** de códigos numéricos de 5 dígitos (`B CC PP`).
- **No inventes catálogo:** los productos existen en `pos_*`; el WMS solo referencia `producto_detalle_id`.

## Criterio de "hecho" (Definition of Done) por tarea
- Código + prueba que lo cubre.
- `lint` y `test` en verde.
- `tasks.md` y `fix_plan.md` actualizados.
- `progress.md` con la entrada del día.
- Commit realizado.

## Si el bucle se atasca
- Si una tarea falla 3 veces seguidas, **no insistas**: escribe el bloqueo en `memory/progress.md` bajo `## BLOQUEOS`, márcala como `[!]` en `fix_plan.md` y pasa a la siguiente tarea desbloqueada.
