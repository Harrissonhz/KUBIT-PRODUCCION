# spec.md — Especificacion funcional Kubit-WMS (MVP)

> **Que y por que.** Derivado de `specs/07-wms-spec.md` **v11**. Referencia funcional del bucle Ralph. Subordinado al AGENTS.md raiz de Kubit.
> Ultima actualizacion: 2026-10-06 (paso C4, cierre de la Fase C) — HU-07 Reconciliacion (RC1) aprobada; todas las historias del MVP implementadas salvo HU-05 (diferida).

## 1. Problema
Kubit-POS controla *cuanto* stock hay, pero no *donde esta fisicamente*. La tienda Outletshop almacena en varias bodegas, con canastillas en el piso y una estanteria, y necesita ubicar lo recibido y localizar lo vendido.

## 2. Objetivo del MVP
Un modulo `apps/wms` que permita: **recibir** (leer del POS), **ubicar**, **buscar**, **despachar**, **trasladar**, **contar**, **reconciliar** con el POS y **resolver** las salidas que registra el POS (ajustes − y mermas), **sin escribir nunca en el POS ni en la Tienda**.

## 3. Actores
- **Admin (uso personal):** unico usuario del MVP. Login propio del WMS con los usuarios de Supabase Auth del POS.
- **POS (sistema):** unico dueno del stock contable. Origen de compras recibidas, ventas, anulaciones, ajustes y mermas.
- **Tienda Virtual (sistema):** sus ventas entran por el flujo de venta del POS (`salida_venta`) — D4.

## 4. Alcance de productos y regla de solo lectura
- Solo **productos fisicos** (`tipo_producto` = `'Fisico'` o `NULL`) — D5.
- **CR1:** el WMS **solo lee** `pos_*` y `st_*`. Todo ajuste o merma se registra en el POS.

## 5. Historias de usuario

| HU | Historia | Pantalla | Estado |
|---|---|---|---|
| HU-01 | Recibir compra (`entrada_compra` → `SIN_UBICAR`) | (sincronizacion) | ✅ 2026-09-29 |
| HU-02 | Ubicar (`SIN_UBICAR → UBICADO`, mono-SKU, U1) | `ubicar.html` | ✅ 2026-10-01 |
| HU-03 | Buscar producto (B1, B2, V1) | `buscar.html` | ✅ 2026-10-01 |
| HU-04 | Despachar venta (DB1, DB2, R-B1, Z1) | `despachar.html` | ✅ 2026-10-01 |
| HU-05 | Anulacion / edicion de venta (liberar reserva) | — | ⏸ diferida (D2) |
| HU-06 | Traslado (T1, T2, T3) | `traslados.html` | ✅ 2026-10-02 |
| HU-07 | Reconciliacion (RC1) | `reconciliacion.html` | ✅ 2026-10-06 |
| HU-08 | Bajas y ajustes del POS (CR2, AJ1) | `ajustes.html` | ✅ 2026-10-06 |
| HU-09 | Inventario general (CR3, IN1, IN2, IN3) | `inventario.html` | ✅ 2026-10-06 |
| HU-10 | Configuracion de bodegas y contenedores (P1, P2, C1) | `config.html` | ✅ 2026-10-01 |
| HU-11 | Panel (PN2) | `panel.html` | ✅ 2026-10-02 (enlaces C3: 2026-10-06) |

### HU-07 Reconciliacion — criterios
- **AC1:** lista los productos donde `SIN_UBICAR` + `UBICADO` del WMS no coincide con el `stock_actual` del POS, con POS, WMS y **POS − WMS**, ordenados por magnitud.
- **AC2:** para cada diferencia muestra la causa y donde resolverla: salida pendiente → Bajas y ajustes; movimiento fallido → su motivo; sin movimiento que lo explique → explicacion (venta anulada D2 o cambio directo del stock en el POS).
- **AC3:** lista salidas por resolver (→ Bajas y ajustes), sobrantes de conteo (→ Inventario) y otros movimientos del POS sin procesar (fallidos y no soportados).
- **AC4:** solo lectura: no corrige nada.

### HU-08 Bajas y ajustes — criterios
- La averia se registra en el POS como merma; el faltante como ajuste −. Si el producto no esta ubicado, se descuenta solo (CR2); si lo esta, queda pendiente y el usuario elige el origen de una lista (solo los que alcanzan, con confirmacion, AJ1).

### HU-09 Inventario — criterios
- Contenedor validado (los puestos se rechazan); esperado = ubicado + reservado; "Contado" vacio y "Coincide" (IN3); agregar producto encontrado (no en bolsas/cajas ocupadas); se resta lo reservado y no se registra un conteo menor que lo reservado (IN1); mayor → primero desde `SIN_UBICAR`, el sobrante queda pendiente (CR3); menor → vuelve a `SIN_UBICAR`; el sobrante se cierra con Ubicar (tras el ajuste + en el POS) o Descartar (IN2).

## 6. Formato de ubicacion (decision V1)
```
30191                                11    <- codigo del adhesivo y cantidad, grandes
Canastilla 01 › Suelto 91 · nombre         <- puesto y posicion dentro de la bodega
Bodega 3 · Cuarto Util Grande              <- bodega
```

## 7. Stack (heredado de Kubit)
HTML + Tailwind (CDN) + JavaScript vanilla + Supabase (PostgREST y `rpc()` via el cliente propio `supabase.js`). UI Slate, modo oscuro por defecto, mobile-first desde 360px.

## 8. Configuracion inicial (maestros)
- Bodegas 1, 2, 3 y 4 (pruebas); hasta 9. Stock fisico del POS cargado como `SIN_UBICAR` (135 SKUs, 1.034 unidades, 2026-09-29).

## 9. Decisiones
| # | Tema | Decision | Estado |
|---|---|---|---|
| B1 / B2 | Buscar | Sin stock visible; sincroniza al abrir | ✅ 2026-10-01 |
| C1 | Escritura de maestros | `wms_bodegas` y `wms_ubicaciones` directo; stock solo por `rpc()` | ✅ 2026-10-01 |
| P1 / P2 | Codigos y bodegas | Puesto 01–99 compartido; hasta 9 bodegas | ✅ 2026-10-01 |
| U1 · V1 · Z1 | Ubicar · formato · zona horaria | Ultimo contenedor; formato comun; America/Bogota | ✅ 2026-10-01 |
| DB1 / DB2 | Despacho | Venta completa; casillas de ayuda | ✅ 2026-10-01 |
| T1 / T2 / T3 | Traslados | Por origen; sin sincronizar; sin confirmacion | ✅ 2026-10-02 |
| PN1 / PN2 | Login · Panel | Abre Buscar; Panel de solo lectura | ✅ 2026-10-02 |
| DP1 / DP2 | Despliegue a produccion | Aditivo con rollback; verificacion despues de cada script y registro por ambiente | ✅ 2026-10-02 / 2026-10-06 |
| **CR1** | Relacion con POS y Tienda | Solo lectura de `pos_*` y `st_*` | ✅ 2026-10-02 (usuario) |
| **CR2** | Salidas del POS | Automaticas si el producto no esta ubicado; si no, pendientes | ✅ 2026-10-06 |
| **CR3** | Sobrante del conteo | Pendiente hasta ajuste + en el POS | ✅ 2026-10-06 |
| **AJ1** | Bajas y ajustes | Origen elegido de una lista | ✅ 2026-10-06 |
| **IN1 / IN2 / IN3** | Conteo | Resta lo reservado; Ubicar/Descartar; esperado visible | ✅ 2026-10-06 |
| **RC1** | Reconciliacion | Solo lectura; explica y enlaza; POS − WMS | ✅ 2026-10-06 |
| **RC2** | Igualar el WMS al POS sin movimiento que lo explique (T-521) | Pendiente de decision del usuario | ⏳ |

## 10. Riesgos abiertos
- **R-B1:** ventas anuladas: mitigado en la pantalla; pendiente validarlo en SQL (T-515).
- **R-C1 (CR1):** doble paso: averias y sobrantes se registran en el POS y luego se resuelven en el WMS.
- **R-C2 (IN3):** ver lo esperado puede llevar a confirmar sin contar.
- **R-C3:** diferencias sin movimiento (venta anulada, cambio directo en el POS) que hoy el WMS no puede igualar (RC2).

## 11. Fuera de alcance (MVP)
FIFO/FEFO, lotes/vencimiento, primera/segunda calidad, capacidad/bloqueos, devoluciones formales, carga inicial masiva de ubicaciones, triggers/Edge Functions de sync, multiusuario operativo, productos digitales, anulacion/edicion de ventas (diferida), borrado de contenedores desde la app (T-509), despacho parcial (T-512), ajustes o bajas originados en el WMS (CR1), conteo ciego (IN3).

## 12. Nomenclatura de codigos (resumen)
`B CC PP`. Ej. en la Bodega 3: `30100` canastilla 01; `30110` bolsa 10; `30500` entrepano 05; `30503` caja 03 del entrepano 05; `30591` zona suelta del entrepano 05. Detalle en `07-wms-spec.md` §15.

## 13. Metricas de exito
- Flujo de las historias activas operable **desde el celular** con entrada manual. ✅ Fases A, B y C.
- `select * from wms_v_reconciliacion where diferencia <> 0` sale vacio (salvo pendientes de registrar en el POS y anulaciones de D2).
- Las consultas A y B de CR1 devuelven 0 filas. ✅ 2026-10-06.
