# constitution.md — Principios no negociables de Kubit-WMS

> Reglas que el agente **nunca** viola. Si una tarea las contradice, se detiene y lo reporta.
> Esta constitución se subordina al **AGENTS.md raíz de Kubit** (que manda en caso de conflicto).

## Artículo 0 — Reglas raíz de Kubit (heredadas)
- **Cero suposiciones:** si falta una spec en `/specs/`, **PREGUNTAR**; nunca inventar.
- **No asumir pago:** solo planes gratuitos de Supabase/Vercel; sin Storage de Supabase.
- **Responsive:** mobile-first, mínimo 360px, clases de `05-ui-ux-system.md`.
- **Sin commits automáticos:** la IA no hace `git commit`/`push` salvo petición explícita.

## Artículo 1 — Stack (confirmado, no reabrir)
- **HTML + Tailwind (CDN) + JavaScript vanilla.** Sin React/Vue/Angular, sin TypeScript, sin build.
- **Supabase (PostgREST)** vía `supabase-js`; sin ORM; sin servidor propio. Lógica compleja → Edge Functions o funciones Postgres (`.rpc()`).

## Artículo 2 — Separación de responsabilidades
- **POS = fuente de verdad contable.** `pos_productos_detalle.stock_actual` es la única verdad del "cuánto".
- **WMS = capa física** ("dónde"/"en qué estado"). No toca `stock_actual` salvo por ajuste/baja explícitos vía `pos_movimientos_inventario`.
- El WMS **jamás** crea productos; solo referencia `producto_detalle_id`.

## Artículo 3 — Invariante de reconciliación (regla de oro)
Para todo SKU `X`:
```
pos_productos_detalle.stock_actual(X)
   == SUM( wms_stock_ubicacion.cantidad )
      WHERE producto_detalle_id = X
        AND estado_fase IN ('SIN_UBICAR', 'UBICADO')
```
Toda operación preserva este invariante; las pruebas lo verifican.

## Artículo 4 — Estados del stock
- `SIN_UBICAR` (ubicacion_id NULL, cuenta), `UBICADO` (cuenta), `RESERVADO` (no cuenta), `DESPACHADO` (no cuenta), `BAJA` (no cuenta).
- `SIN_UBICAR` es **lógico**, sin ubicación física. Un producto puede recibirse y venderse sin ubicarse.
- Los estados se almacenan como **strings con CHECK constraint** (no ENUMs).

## Artículo 5 — Atomicidad e integridad
- Movimiento físico + efecto en `wms_stock_ubicacion` = **una transacción** (función Postgres `.rpc()`). Si falla un paso, se revierte todo. Prohibidos los "movimientos fantasma" (lección POS Fase 29).
- Nunca `cantidad < 0`.

## Artículo 6 — Idempotencia con el POS
- Sincronización **por lectura bajo demanda** (sin triggers en el MVP).
- Procesar dos veces la misma compra/venta **no** duplica efectos. Control por `wms_movimientos.ref_pos_compra_id` / `ref_pos_venta_id`.

## Artículo 7 — Modelo de datos (decisiones "No Reabrir" de Kubit)
- Esquema `public`; prefijo `wms_`. PK UUID v4 (`gen_random_uuid()`).
- `timestamptz` default `now()`; `updated_at` vía trigger `update_updated_at()`; soft delete `deleted_at`.
- **RLS** habilitado con políticas por rol; **grants** explícitos (`anon`, `authenticated`, `service_role`).
- Todas las FK **indexadas**. Auditoría `created_by`/`updated_by` → `pos_usuarios`.
- `wms_ubicaciones.tipo` es la **fuente de verdad** del tipo de contenedor; el rango del código es solo ayuda visual.

## Artículo 8 — Nomenclatura de ubicaciones
- Código **numérico de 5 dígitos** `B CC PP`:
  - `B` = bodega (1–9)
  - `CC` = 01–50 canastilla · 51–99 entrepaño
  - `PP` = en canastilla: 01–90 bolsa, 91–99 suelto; en entrepaño: 01–99 caja; `00` = contenedor completo.

## Artículo 9 — UX (05-ui-ux-system.md)
- **Mobile-first / PWA.** Entrada **manual** de códigos. Ultra-minimalista, **monocromático Slate**, **modo oscuro por defecto**.

## Artículo 10 — Alcance MVP (lo que NO se hace)
- Sin FIFO/FEFO, lotes/vencimiento, primera/segunda (solo primera; avería → BAJA).
- Sin capacidad ni bloqueos. Sin devoluciones formales (vía ajuste POS). Sin carga inicial masiva (vía Inventario general). Sin triggers/Edge Functions de sync (Fase 2). Sin multiusuario operativo.

## Artículo 11 — Calidad
- Toda funcionalidad llega con su prueba (patrón `tests/…/*.test.js`, skill `tdd`). Un cambio atómico por unidad de trabajo. **Sin commit** salvo petición.
