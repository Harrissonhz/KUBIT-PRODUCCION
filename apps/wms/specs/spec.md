# spec.md — Especificación funcional Kubit-WMS (MVP)

> **Qué y por qué.** Derivado de `06-wms-spec.md` v5. Referencia funcional del bucle Ralph. Subordinado al AGENTS.md raíz de Kubit.

## 1. Problema
Kubit-POS controla *cuánto* stock hay, pero no *dónde está físicamente*. La tienda Outletshop almacena en **3 bodegas** con dos paradigmas (estantería→entrepaño→caja y canastilla→bolsa/suelto) y necesita ubicar lo recibido y localizar lo vendido.

## 2. Objetivo del MVP
Un módulo `apps/wms` que permita: **recibir** (leer del POS), **ubicar** (Inventario general), **buscar**, **despachar** (con o sin ubicación), **trasladar** entre bodegas/contenedores, **reconciliar** con el POS y **dar de baja** por avería.

## 3. Actores
- **Admin (uso personal):** único usuario del MVP.
- **POS (sistema):** origen de compras recibidas, ventas confirmadas, anulaciones y ajustes.

## 4. Historias de usuario (con criterios de aceptación)

### HU-01 Recibir compra
- **AC1:** la bandeja lista compras `RECIBIDA` no procesadas.
- **AC2:** procesarlas incrementa `SIN_UBICAR` (mov. `ENTRADA`).
- **AC3:** `stock_actual` del POS no cambia; invariante se mantiene.
- **AC4:** idempotencia por `ref_pos_compra_id`.

### HU-02 Inventario general / Ubicar
- **AC1:** `SIN_UBICAR → UBICADO` indicando el código de contenedor (5 dígitos).
- **AC2:** un SKU puede repartirse en varios contenedores.
- **AC3:** caja/bolsa rechazan un segundo SKU (mono-SKU); canastilla acepta varios.
- **AC4:** movimiento `UBICACION` registrado.

### HU-03 Buscar producto
- **AC1:** al buscar el SKU, veo bodega › contenedor (ruta completa) › cantidad › estado.
- **AC2:** incluye lo `SIN_UBICAR`.

### HU-04 Despachar venta
- **AC1:** venta `CONFIRMADA` marca `RESERVADO` (de `UBICADO` o `SIN_UBICAR`).
- **AC2:** despacho `RESERVADO → DESPACHADO` con o sin ubicación previa.
- **AC3:** idempotencia por `ref_pos_venta_id`.

### HU-05 Anulación de venta
- **AC1:** `RESERVADO → UBICADO`/`SIN_UBICAR` (mov. `LIBERACION`).

### HU-06 Traslado
- **AC1:** `TRASLADO` mueve `UBICADO(origen) → UBICADO(destino)`; total y `stock_actual` intactos.
- **AC2:** misma bodega o entre bodegas (ej. B1→B3).

### HU-07 Reconciliación por ajuste POS
- **AC1:** ajuste **+** → agrega a `SIN_UBICAR` (mov. `AJUSTE +`).
- **AC2:** ajuste **−** → retira de `SIN_UBICAR`; si no alcanza, pide contenedor(es) (mov. `AJUSTE −`).
- **AC3:** sin aprobación; panel muestra diferencias.

### HU-08 Baja por avería
- **AC1:** `→ BAJA` y propaga al POS como `merma`.

## 4.9 Stack (heredado de Kubit)
HTML + Tailwind (CDN) + JavaScript vanilla + Supabase (PostgREST/`.rpc()`). Sin frameworks SPA, sin TypeScript, sin build. UI Slate, modo oscuro por defecto, mobile-first ≥360px. Detalle en `plan.md` y `AGENTS.md`.

## 5. Configuración inicial (maestros)
- Alta de las **3 bodegas** (1, 2, 3).
- Alta de contenedores (estanterías/entrepaños, canastillas, bolsas) con su código numérico.

## 6. Fuera de alcance (MVP)
FIFO/FEFO, lotes/vencimiento, primera/segunda calidad, capacidad/bloqueos, devoluciones formales, carga inicial masiva, triggers/Edge Functions de sync, multiusuario operativo.

## 7. Nomenclatura de códigos (resumen)
`B CC PP` (5 dígitos). Ej.: `20110` = Bodega2·Canastilla01·Bolsa10; `35905` = Bodega3·Entrepaño59·Caja05; `30191` = Bodega3·Canastilla01·Suelto. Detalle en `06-wms-spec.md` §15.

## 8. Métricas de éxito
- Flujo end-to-end de las 8 historias operable **desde el celular** con entrada manual.
- El invariante de reconciliación se cumple en todos los flujos.
