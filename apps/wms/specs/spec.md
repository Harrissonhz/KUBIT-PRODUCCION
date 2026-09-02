# spec.md — Especificación funcional Kubit-WMS (MVP)

> **Qué y por qué.** Fuente derivada de `06-wms-spec.md` v5. Este archivo es la referencia funcional del bucle Ralph.

## 1. Problema
Kubit-POS controla *cuánto* stock hay, pero no *dónde está físicamente*. El negocio (tienda Outletshop) almacena inventario en **3 bodegas** con dos paradigmas (estantería→entrepaño→caja y canastilla→bolsa/suelto) y necesita ubicar lo recibido y localizar lo vendido.

## 2. Objetivo del MVP
Un módulo `apps/wms` que permita:
1. **Recibir** (leer del POS lo comprado) sin obligar a ubicar.
2. **Ubicar** productos en bodega/contenedor durante el **Inventario general**.
3. **Buscar** un producto y ver su ubicación exacta.
4. **Despachar** lo vendido en POS (con o sin ubicación previa).
5. **Trasladar** productos entre bodegas y contenedores.
6. **Reconciliar** con el POS (ajustes +/−) y **dar de baja** por avería.

## 3. Actores
- **Admin (uso personal):** único usuario del MVP. Hace todo.
- **POS (sistema):** origen de compras recibidas, ventas confirmadas, anulaciones y ajustes.

## 4. Historias de usuario (con criterios de aceptación)

### HU-01 Recibir compra
*Como admin, cuando marco una compra RECIBIDA en POS, quiero que el WMS sume ese stock como `SIN_UBICAR`.*
- **AC1:** al abrir la bandeja, aparecen las compras `RECIBIDA` no procesadas.
- **AC2:** procesarlas incrementa `SIN_UBICAR` del SKU (mov. `ENTRADA`).
- **AC3:** `stock_actual` del POS no cambia. Invariante se mantiene.
- **AC4:** reprocesar la misma compra no duplica (idempotencia por `ref_pos_compra_id`).

### HU-02 Inventario general / Ubicar
*Como admin, quiero contar y asignar productos `SIN_UBICAR` a un contenedor.*
- **AC1:** puedo mover `SIN_UBICAR → UBICADO` indicando el código de contenedor de 5 dígitos.
- **AC2:** un mismo SKU puede quedar repartido en varios contenedores.
- **AC3:** caja/bolsa rechazan un segundo SKU (mono-SKU); canastilla acepta varios.
- **AC4:** el movimiento `UBICACION` queda en `wms_movimientos`.

### HU-03 Buscar producto
*Como admin, quiero saber dónde está un SKU.*
- **AC1:** al buscar el SKU, veo lista de: bodega › contenedor (ruta completa) › cantidad › estado.
- **AC2:** incluye lo `SIN_UBICAR` como "pendiente por ubicar".

### HU-04 Despachar venta
*Como admin, cuando vendo en POS, quiero reservar y luego despachar.*
- **AC1:** venta `CONFIRMADA` marca `RESERVADO` (mov. `RESERVA`), tomando de `UBICADO` o `SIN_UBICAR`.
- **AC2:** puedo despachar (`RESERVADO → DESPACHADO`) con o sin ubicación previa.
- **AC3:** idempotencia por `ref_pos_venta_id`.

### HU-05 Anulación de venta
*Como admin, si anulo una venta en POS, el WMS debe liberar la reserva.*
- **AC1:** `RESERVADO → UBICADO` (a su contenedor previo) o `SIN_UBICAR` (mov. `LIBERACION`).

### HU-06 Traslado
*Como admin, quiero mover un SKU entre contenedores o bodegas.*
- **AC1:** `TRASLADO` mueve `UBICADO(origen) → UBICADO(destino)`; total y `stock_actual` intactos.
- **AC2:** admite misma bodega o entre bodegas (ej. B1→B3).

### HU-07 Reconciliación por ajuste POS
*Como admin, cuando ajusto inventario en POS (+/−), el WMS debe cuadrar.*
- **AC1:** ajuste **+** → agrega diferencia a `SIN_UBICAR` (mov. `AJUSTE +`).
- **AC2:** ajuste **−** → retira de `SIN_UBICAR`; si no alcanza, pide contenedor(es) para descontar `UBICADO` (mov. `AJUSTE −`).
- **AC3:** sin aprobación (uso personal). Panel muestra diferencias.

### HU-08 Baja por avería
*Como admin, quiero retirar un producto dañado.*
- **AC1:** `→ BAJA` y se propaga al POS como `merma` (descuenta `stock_actual`).

## 5. Configuración inicial (maestros)
- Alta de las **3 bodegas** (1, 2, 3).
- Alta de contenedores (estanterías/entrepaños, canastillas, bolsas) con su código numérico.

## 6. Fuera de alcance (MVP)
FIFO/FEFO, lotes/vencimiento, primera/segunda calidad, capacidad/bloqueos, devoluciones formales, carga inicial masiva, triggers/Edge Functions, multiusuario/roles operativos.

## 7. Nomenclatura de códigos (resumen)
`B CC PP` (5 dígitos). Ej.: `20110` = Bodega2·Canastilla01·Bolsa10; `35905` = Bodega3·Entrepaño59·Caja05; `30191` = Bodega3·Canastilla01·Suelto. Detalle completo en `06-wms-spec.md` §15.

## 8. Métricas de éxito del MVP
- Puedo recibir, ubicar, buscar, despachar, trasladar, reconciliar y dar de baja end-to-end.
- El invariante de reconciliación se cumple en todos los flujos.
- Operable desde el celular con entrada manual de códigos.
