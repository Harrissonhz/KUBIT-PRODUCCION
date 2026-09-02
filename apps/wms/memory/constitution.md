# constitution.md — Principios no negociables de Kubit-WMS

> Reglas que el agente **nunca** debe violar. Si una tarea contradice esta constitución, se detiene y lo reporta.

## Artículo 1 — Separación de responsabilidades
- **POS = fuente de verdad contable.** `pos_productos_detalle.stock_actual` es la única verdad de "cuánto hay".
- **WMS = capa física.** Administra "dónde está" y "en qué estado", nunca el "cuánto" salvo por ajustes/bajas explícitos.
- El WMS **jamás** crea productos ni variantes; solo referencia `producto_detalle_id` de `pos_productos_detalle`.

## Artículo 2 — Invariante de reconciliación (regla de oro)
Para todo SKU `X`:
```
pos_productos_detalle.stock_actual(X)
   == SUM( wms_stock_ubicacion.cantidad )
      WHERE producto_detalle_id = X
        AND estado_fase IN ('SIN_UBICAR', 'UBICADO')
```
Toda operación debe preservar este invariante. Las pruebas deben verificarlo.

## Artículo 3 — Estados del stock
- `SIN_UBICAR` (ubicacion_id = NULL, cuenta en stock), `UBICADO` (cuenta), `RESERVADO` (no cuenta), `DESPACHADO` (no cuenta), `BAJA` (no cuenta).
- `SIN_UBICAR` es **lógico**, sin ubicación física. Un producto puede recibirse y venderse sin ubicarse jamás.

## Artículo 4 — Atomicidad e integridad
- Movimiento físico + efecto en `wms_stock_ubicacion` = **una transacción**. Si falla un paso, se revierte todo. Prohibidos los "movimientos fantasma" (lección POS Fase 29).
- Nunca `cantidad < 0`. Nunca operar sobre datos inconsistentes.

## Artículo 5 — Idempotencia con el POS
- Sincronización **por lectura bajo demanda** (sin triggers en el MVP).
- Procesar dos veces la misma compra/venta **no** duplica efectos. Control por `wms_movimientos.ref_pos_compra_id` / `ref_pos_venta_id`.

## Artículo 6 — Modelo de datos
- Prefijo `wms_`; PK UUID v4; `created_at`/`updated_at`; soft delete `deleted_at`; auditoría `created_by`/`updated_by` → `pos_usuarios`; toda FK indexada.
- `wms_ubicaciones.tipo` es la **fuente de verdad** del tipo de contenedor; el rango del código numérico es solo ayuda visual.

## Artículo 7 — Nomenclatura de ubicaciones
- Código **numérico de 5 dígitos** `B CC PP`:
  - `B` = bodega (1–9)
  - `CC` = 01–50 canastilla · 51–99 entrepaño
  - `PP` = en canastilla: 01–90 bolsa, 91–99 suelto; en entrepaño: 01–99 caja; `00` = contenedor completo.

## Artículo 8 — UX
- **Mobile-first / PWA.** Entrada **manual** de códigos (sin lector). Mínimos toques y cambios de teclado.

## Artículo 9 — Alcance MVP (lo que NO se hace ahora)
- Sin FIFO/FEFO, sin lotes/vencimiento, sin primera/segunda calidad (solo primera; avería → BAJA).
- Sin gestión de capacidad ni bloqueos por capacidad.
- Sin fase de devoluciones (se gestionan por ajuste en POS).
- Sin carga inicial masiva (la ubicación ocurre en el Inventario general).
- Sin triggers/Edge Functions (Fase 2).

## Artículo 10 — Calidad
- Toda funcionalidad nueva llega con su prueba. `lint` + `test` en verde antes de cerrar tarea.
- Commits convencionales. Un cambio atómico por commit.
