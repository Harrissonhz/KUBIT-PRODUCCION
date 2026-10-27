## Especificación del Módulo WMS - Kubit (SDD) — v12

> **Estado:** **MVP funcional completo en pruebas.** Base de datos (`08`, `09` v2, `10`, `11`) y Fases A, B y C cerradas; publicado en Vercel `kubit-wms-calidad`. Plan de producción documentado, sin fecha.
> **Ubicación en el repo:** `specs/07-wms-spec.md` (el `06` es `06-servicio-correo.md`).
>
> **Cambios v12 (2026-10-27):**
> - **U2 Pendientes por ubicar** en `ubicar.html`: con el buscador vacío lista los SKU con unidades `SIN_UBICAR` (§5.3). Solo frontend: `DB.wms.pendientesUbicar()`, sin SQL nuevo. Caché `kubit-wms-20261027-01`.
>
> **Cambios v11 (2026-10-06):**
> - **Fase C cerrada:** Bajas y ajustes (CR2, AJ1), Inventario (CR3, IN1, IN2, IN3) y Reconciliación (RC1).
> - Nuevo script `11-wms-conteo-sobrante.sql` (`wms_cerrar_sobrante`). Orden obligatorio `08 → 09 → 10 → 11` (§4.4).
> - Conteo con unidades reservadas (IN1) y cierre del sobrante (IN2) (§5.10). Reconciliación de solo lectura (§5.12).
> - Incidente I-1 y regla de verificación de scripts (§8, §14). Decisión pendiente RC2 (§12).
>
> **Cambios v10:** CR1 (solo lectura sobre `pos_*`/`st_*`), CR2, CR3, script `10`, Fase B cerrada.
> **Cambios v9:** Fase A cerrada; V1; U1; DB1, DB2, T1, PN1; R-B1.
> **Cambios v8:** P1, bodegas hasta 9, B1, B2, C1. **v7:** D1–D6, regla del conteo, D2 diferida. **v6:** numeración `07`, Slate, stack.

---

### 1. Descripción General

El módulo **WMS** (`apps/wms`) controla **la ubicación física de cada producto y su estado** dentro del almacén. Complementa, sin reemplazar, el inventario del POS.

- **POS = capa contable y único dueño del stock:** *"¿cuánto hay?"* → `pos_productos_detalle.stock_actual`.
- **WMS = capa física:** *"¿en qué bodega y contenedor está?"* → tablas `wms_*`.

**El WMS nunca modifica el POS ni la Tienda (CR1).**

#### 1.1 Contexto físico (Outletshop)
| # | Bodega | Descripción |
|---|---|---|
| 1 | **Bodega Hogar/Limpieza** | Solo se gestiona el inventario de venta. |
| 2 | **Mini Cuarto Útil** | Sector pequeño del apartamento. |
| 3 | **Cuarto Útil Grande** | Tiene la **única estantería**, con 5 entrepaños. |

Se pueden crear más bodegas, hasta 9. **Puestos:** canastilla en el piso (bolsas y zona suelta) o entrepaño de la estantería (cajas y zona suelta). Las canastillas nunca van sobre la estantería.

#### 1.2 Alcance funcional (MVP)
Multi-bodega; stock físico por contenedor y estado; recepción, ubicación, búsqueda, despacho (con o sin ubicación, venta completa), traslados, inventario general, bajas y ajustes recibidos del POS, panel y reconciliación. **Solo productos físicos** (§1.3). **Solo lectura sobre `pos_*` y `st_*`** (CR1).

#### 1.3 Productos gestionados (D5)
| `pos_productos.tipo_producto` | ¿En el WMS? |
|---|---|
| `'Fisico'` | Sí |
| `NULL` | Sí (se trata como físico) |
| `'Digital'` | **No** |

#### 1.4 Dependencias
- **DB:** Supabase (plan gratuito), esquema `public`; prefijo `wms_*`. **Lee** `pos_productos`, `pos_productos_detalle`, `pos_usuarios`, `pos_ventas`, `pos_compras`, `pos_movimientos_inventario`, `pos_configuracion_empresa`.
- **Stack:** HTML + Tailwind (CDN) + JavaScript vanilla + cliente propio `supabase.js`. Sin SPA, sin TypeScript, sin build.
- **UI:** `05-ui-ux-system.md`: Slate, modo oscuro por defecto, mobile-first / PWA, entrada manual de códigos.
- **Infra:** Vercel (plan gratuito), proyecto `kubit-wms-calidad`.

---

### 2. Arquitectura e Integración

#### 2.1 Fuente de verdad y regla de solo lectura (CR1)
| Dato | Fuente | El WMS… |
|---|---|---|
| Catálogo, stock total | `pos_productos*`, `stock_actual` | **Solo lee** |
| Estado de cada venta | `pos_ventas.estado` | **Solo lee** |
| Eventos contables | `pos_movimientos_inventario` | **Solo lee** (sin bloquear filas) |
| Tienda Virtual | `st_*` | No usa |
| Bodegas y contenedores | `wms_bodegas`, `wms_ubicaciones` | Lee y escribe (maestros, C1) |
| Ubicación física / estado | `wms_stock_ubicacion` | Solo por funciones |
| Movimientos y conteos | `wms_movimientos`, `wms_conteos` | Solo por funciones |

Ninguna función ni pantalla del WMS ejecuta `INSERT`, `UPDATE`, `DELETE` ni `SELECT ... FOR UPDATE` sobre `pos_*` o `st_*`. Todo cambio del stock contable **se registra en el POS**. Verificable con las consultas A y B (§8).

#### 2.2 Estados del stock
| Estado | ¿`ubicacion_id`? | ¿Cuenta en `stock_actual`? | Significado |
|---|---|---|---|
| `SIN_UBICAR` | No | Sí | Existe sin contenedor (lógico) |
| `UBICADO` | Sí | Sí | En un contenedor |
| `RESERVADO` | Opcional | No | Vendido; **sigue físicamente en el contenedor** hasta despacharlo |
| `DESPACHADO` | — | No | Salió |
| `BAJA` | — | No | Averiado (merma registrada en el POS) |

#### 2.3 Invariante de reconciliación
```
pos_productos_detalle.stock_actual(X)
   == SUM(wms_stock_ubicacion.cantidad) WHERE producto = X AND estado IN ('SIN_UBICAR','UBICADO')
```
Se verifica con `wms_v_reconciliacion` y la pantalla Reconciliación. Una diferencia se corrige **registrando el movimiento en el POS**.

#### 2.4 Sincronización — lectura bajo demanda
- **Arranque (una vez):** `wms_inicializar()` carga el stock físico como `SIN_UBICAR` y registra la línea base.
- **Operación:** `wms_sincronizar()` procesa en orden de fecha los eventos no procesados; se ejecuta al abrir Buscar, Ubicar, Despachar, Panel, Bajas y ajustes, Inventario y Reconciliación.
- **Idempotencia (D1)** por `ref_pos_movimiento_id`; exclusión con candado propio (`pg_advisory_xact_lock`); un evento que falla queda **PENDIENTE** con su motivo.

| Evento POS | Acción WMS |
|---|---|
| `entrada_compra` | `ENTRADA`: + `SIN_UBICAR` |
| `ajuste_incremento` | `AJUSTE`: + `SIN_UBICAR` |
| `salida_venta` | `RESERVA`: `UBICADO`/`SIN_UBICAR` → `RESERVADO` (todo o nada) |
| `ajuste_decremento` | **CR2:** sin unidades ubicadas → − `SIN_UBICAR`; con unidades ubicadas → **pendiente** (se resuelve en Bajas y ajustes) |
| `merma` | **CR2:** igual que el anterior, terminando en `BAJA` |
| Otros (anulaciones) | `NO_SOPORTADO` (D2) |

#### 2.5 Resolución de referencias del POS (D6)
Venta: por `referencia` (uuid o `numero_venta`) o por el número del motivo (`Venta #KBT-…`). Compra: `OC-<numero_orden>`, solo trazabilidad.

---

### 3. Jerarquía física (P1)
```
Bodega (1-9)
  ├── Puesto CANASTILLA (piso)          B CC 00
  │     ├── Bolsa        (1 producto)   B CC 01-90
  │     └── Zona suelta  (varios)       B CC 91-99
  └── Puesto ENTREPANO (estantería)     B CC 00
        ├── Caja         (1 producto)   B CC 01-90
        └── Zona suelta  (varios)       B CC 91-99
```
`CC` (01–99) es único en la bodega y se comparte entre canastillas y entrepaños. La estantería no se registra. El stock vive solo en el contenido (`es_hoja = true`). Mover una caja de entrepaño cambia su código.

---

### 4. Modelo de Datos

#### 4.1 Convenciones
Prefijos `wms_` (tablas), `wms_v_` (vistas), `wms_`/`_wms_` (funciones); PK UUID; `timestamptz`; `updated_at` por trigger; soft delete; auditoría → `pos_usuarios`; FK indexadas; estados como CHECK; RLS + grants.

#### 4.2 Tablas
| Tabla | Propósito | Escritura desde la app |
|---|---|---|
| `wms_bodegas` | Bodegas (hasta 9) | Directa (C1) |
| `wms_ubicaciones` | Puestos y su contenido; `producto_detalle_id` fija el SKU en bolsas/cajas | Directa (C1) |
| `wms_stock_ubicacion` | Stock por contenedor y estado | Solo `rpc()` |
| `wms_movimientos` | Bitácora (`ENTRADA`, `UBICACION`, `TRASLADO`, `RESERVA`, `DESPACHO`, `AJUSTE`, `BAJA`, `LIBERACION`) | Solo `rpc()` |
| `wms_conteos` | Conteos; `estado` `ABIERTO` = sobrante pendiente (CR3), `AJUSTADO` = cerrado | Solo `rpc()` |
| `wms_pos_linea_base` | Movimientos POS anteriores al arranque | Ninguna |

#### 4.3 Vistas
`wms_v_reconciliacion` (diferencias), `wms_v_pos_pendientes` (eventos por procesar), `wms_v_ubicaciones_ruta`, `wms_v_stock_detalle`, `wms_v_despacho_pendiente`.

#### 4.4 Scripts y funciones (orden obligatorio `08 → 09 → 10 → 11`)
| Script | Contenido |
|---|---|
| `08-wms-schema.sql` | Tablas, índices, RLS, seed de bodegas 1–3, `wms_v_reconciliacion` |
| `09-wms-functions.sql` v2 | Funciones y vistas. **Por sí solo escribe en el POS: el `10` va inmediatamente después**; nunca re-ejecutar el `09` después del `10` |
| `10-wms-solo-lectura.sql` | Elimina `wms_ajustar`, `wms_dar_baja`, `_wms_ajuste_pos`; CR1, CR2, CR3 |
| `11-wms-conteo-sobrante.sql` | `wms_cerrar_sobrante` (IN2) |

| Función | Uso |
|---|---|
| `wms_inicializar()` | Arranque único |
| `wms_sincronizar()` | Procesa eventos del POS |
| `wms_ubicar()` · `wms_trasladar()` · `wms_despachar()` | Ubicar · Traslados · Despachar |
| `wms_resolver_decremento(mov, codigo?)` | Bajas y ajustes: sin código = desde `SIN_UBICAR`; con código = desde ese contenedor |
| `wms_registrar_conteo()` | Inventario (CR3) |
| `wms_cerrar_sobrante(conteo, 'UBICAR'\|'DESCARTAR')` | Inventario (IN2) |

Total: **19 funciones** (11 `_wms_` + 8 `wms_`).

---

### 5. Reglas de Negocio

#### 5.1 Contenedores
Puestos sin stock; bolsa y caja mono-SKU (se liberan al vaciarse); zona suelta multi-SKU; sin capacidad. No se desactiva un contenedor con mercancía; desactivar un puesto desactiva su contenido.

#### 5.2 Entrada
Cada `entrada_compra` suma a `SIN_UBICAR`. No exige ubicar.

#### 5.3 Ubicación
`SIN_UBICAR → UBICADO` con el código del contenedor. Sincroniza al abrir y recuerda el último contenedor (U1).

**Pendientes por ubicar (U2):**
- Con el buscador vacío, Ubicar muestra los SKU con unidades `SIN_UBICAR` (`wms_v_stock_detalle`, `estado_fase = 'SIN_UBICAR'`), ordenados de más a menos unidades (empate por nombre y SKU).
- Lo reservado por ventas no aparece: la reserva es otra fila con `estado_fase = 'RESERVADO'` y no se resta nada.
- Una sola zona de recepción: `SIN_UBICAR` no tiene bodega ni ubicación, así que la lista no se agrupa por bodega.
- Resumen "N SKU · N unidades por ubicar"; 10 tarjetas en pantalla y "Ver más (N)" para el resto. Una sola consulta (tope 1.000 filas, con aviso si se alcanza); sin paginación contra la base.
- Tocar una tarjeta abre el flujo de ubicar de siempre. Escribir en el buscador busca como antes; limpiarlo vuelve a la lista; "Cambiar producto" la recarga (salen los SKU ya ubicados).
- SKU eliminados en el POS con unidades `SIN_UBICAR` se muestran con la etiqueta **"Eliminado en el POS"** (las unidades existen físicamente). Los digitales no aparecen (D5).
- Solo lectura (CR1); ubicar sigue usando `wms_ubicar()`. El parámetro `ubicar.html?q=` abre directo la búsqueda.

#### 5.4 Salida (venta en POS o Tienda — D4)
Reserva primero de `UBICADO` y luego de `SIN_UBICAR` (todo o nada). Despacho de la **venta completa** (DB1), con casillas de ayuda (DB2). Ventas anuladas bloqueadas y re-verificadas antes de despachar (R-B1).

#### 5.5 Anulación y edición de venta — **diferida (D2)**
No se liberan reservas automáticamente; la anulación aparece como movimiento no soportado y como diferencia en Reconciliación.
> Hallazgo en el POS: `ajustarStock()` sube el stock antes de insertar `'entrada_anulacion'` (no admitido por el CHECK) y no revisa el error.

#### 5.6 Traslados
`UBICADO → UBICADO`, misma bodega o entre bodegas; empieza por el origen (T1); sin sincronizar (T2); sin confirmación (T3). Lo `RESERVADO` no se traslada.

#### 5.7 Ajustes (CR1)
**Se registran siempre en el POS.** Ajuste +: entra a `SIN_UBICAR` y luego se ubica. Ajuste −: automático si el producto no está ubicado; si lo está, pendiente hasta elegir el origen en Bajas y ajustes (CR2, AJ1).

#### 5.8 Baja por avería (CR1)
Se registra como **merma en el POS**; el WMS la pasa a `BAJA` (automática o eligiendo el origen, CR2).

#### 5.9 Integridad
Cada operación de stock es una función transaccional que **solo escribe en `wms_*`**. La validación en pantalla es una ayuda; la base revalida.

#### 5.10 Inventario general / conteo (CR3, IN1, IN2, IN3)
- Se cuenta **todo** lo que hay en el contenedor; la pantalla muestra **esperado = ubicado + reservado** y resta lo reservado antes de registrar. Un conteo menor que lo reservado no se registra (IN1).
- **Mayor:** primero se ubica lo de `SIN_UBICAR`; el **sobrante real queda pendiente** (conteo `ABIERTO`) hasta registrar un **ajuste + en el POS**.
- **Cierre del sobrante (IN2):** *Ubicar* (exige que el ajuste + ya haya llegado; mueve las unidades al contenedor contado) o *Descartar* (error de conteo, sin mover stock).
- **Menor:** lo que falta vuelve a `SIN_UBICAR`; no se toca el POS.
- Lo esperado es visible, con botón "Coincide"; el campo "Contado" empieza vacío (IN3).

#### 5.11 Buscar producto
Sin stock visible (B1), sincroniza al abrir (B2), ubicaciones con formato V1 y aviso de diferencia con el POS.

#### 5.12 Reconciliación (RC1)
Solo lectura. Muestra cada diferencia como **POS − WMS** con su causa y dónde resolverla: salida pendiente (→ Bajas y ajustes), movimiento fallido (motivo), o sin movimiento que la explique (venta anulada D2 o cambio directo en el POS). También lista salidas por resolver, sobrantes de conteo y movimientos sin procesar. Igualar diferencias sin movimiento queda pendiente (RC2).

---

### 6. Flujos
- **Recibir:** compra en POS → `+SIN_UBICAR`. **Ubicar:** `SIN_UBICAR → UBICADO`.
- **Vender/Despachar:** venta → `RESERVA` → `DESPACHO`. **Trasladar:** `UBICADO → UBICADO`.
- **Avería / faltante:** merma o ajuste − en el POS → sincronización → (si está ubicado) origen en Bajas y ajustes.
- **Sobrante:** conteo → pendiente → ajuste + en el POS → Ubicar en Inventario.
- **Control:** Panel → Reconciliación → acción en el POS o en la pantalla indicada.

---

### 7. UI/UX

#### 7.1 Páginas
| Página | Función | Fase |
|---|---|---|
| `login.html` | Login propio; abre Buscar (PN1) | A ✅ |
| `buscar.html` · `ubicar.html` · `config.html` | Buscar · Ubicar · Configuración | A ✅ |
| `despachar.html` · `traslados.html` · `panel.html` | Despacho · Traslados · Panel | B ✅ |
| `ajustes.html` | Bajas y ajustes del POS | C ✅ |
| `inventario.html` | Conteo y sobrantes | C ✅ |
| `reconciliacion.html` | Diferencias y causas | C ✅ |

#### 7.2 Navegación
Celular: barra inferior **Buscar · Ubicar · Despachar · Más** ("Más": Traslados, Panel, Inventario, Reconciliación, Bajas y ajustes, Configuración, Cerrar sesión). Computador: sidebar. Todo el menú habilitado.

#### 7.3 Estilo
Slate, modo oscuro por defecto, cards, toast superior, ASCII plano, PWA (`kubit-wms-YYYYMMDD-NN`). Fechas en America/Bogota (Z1).

#### 7.4 Formato de ubicación (V1)
```
30191                                11    <- código y cantidad, grandes
Canastilla 01 › Suelto 91 · nombre         <- puesto y posición
Bodega 3 · Cuarto Util Grande              <- bodega
```

---

### 8. Integración Técnica
| Aspecto | Definición |
|---|---|
| **DB** | Supabase (gratuito); tablas `wms_*`; FK hacia `pos_*` solo como referencia |
| **Escritura** | Maestros directo (C1); stock solo por `rpc()`; **nunca** sobre `pos_*`/`st_*` (CR1) |
| **Sync** | Lectura bajo demanda; idempotencia; candado propio; línea base |
| **Verificación de scripts (I-1)** | Un script se da por ejecutado solo con su verificación: A (escrituras en `pos_*`/`st_*` = 0), B (bloqueos = 0), C (funciones esperadas: 21 tras `09`, 18 tras `10`, 19 tras `11`) y específicas. "Success" del editor no es verificación |
| **Despliegue** | Pruebas: `KUBIT-Pruebas` → Vercel `kubit-wms-calidad`. Producción: `apps/wms/specs/despliegue-produccion.md` (v4) |
| **Credenciales** | `apps/wms/js/config.js` nunca va a producción (no confundir con `js/paginas/config.js`) |

---

### 9. Roles (RBAC)
Uso personal (un admin). Previstos: permisos `wms.*` en `pos_permisos` si otro rol usa el WMS.

---

### 10. Plan por Fases
- **Base de datos:** ✅ `08`, `09` v2, `10`, `11`, inicialización (135 SKUs, 1.034 unidades).
- **Fase A** ✅ 2026-10-01 · **Fase B** ✅ 2026-10-02 · **Fase C** ✅ 2026-10-06.
- **Producción:** plan v4, sin fecha.
- **Posterior:** anulaciones (D2), RC2/T-521, T-515, endurecimiento (pruebas automáticas, renovación de sesión, permisos), escaneo por cámara.

---

### 11. Set de Pruebas
| Prueba | Estado |
|---|---|
| Recibir, reservar y despachar; idempotencia | ✅ 2026-09-29 |
| Buscar, Configuración, Ubicar, formato V1 | ✅ 2026-10-01 |
| Despachar (bandeja, detalle, venta anulada bloqueada) | ✅ 2026-10-01 |
| Traslados (misma bodega y entre bodegas) · Panel | ✅ 2026-10-02 |
| Solo lectura (CR1): A = 0, B = 0, C = 19, sin escrituras `referencia = 'WMS'` | ✅ 2026-10-06 |
| Bajas y ajustes: automático sin ubicar; pendiente y resuelto si está ubicado (CR2) | ✅ 2026-10-06 |
| Inventario: coincide, faltante, mayor desde sin ubicar, sobrante, Ubicar/Descartar, reservado (IN1) | ✅ 2026-10-06 |
| Reconciliación: causas, enlaces, comparación con SQL | ✅ 2026-10-06 |
| U2 Pendientes por ubicar: lista, orden, "Ver más", buscar/limpiar, ubicar parcial y total, venta y compra en el POS, `?q=`, celular claro/oscuro | ✅ 2026-10-27 |
| Anular venta → liberación | ⏸ Diferida (D2) |

---

### 12. Decisiones — estado
| # | Decisión | Estado |
|---|---|---|
| 1–28 | Multi-bodega, sync bajo demanda, reserva en la venta, detalle de ubicación, sin FIFO/FEFO, solo primera calidad, ajustes sin aprobación, traslados, carga inicial como `SIN_UBICAR`, SKU multi-ubicación, despacho sin ubicar, anulación diferida (D2), devoluciones fuera, unidades sueltas, bodega 1 personal ignorada, sin capacidad, entrada manual, nomenclatura `B CC PP`, stack, numeración de specs, D1, D3, D4, D5, D6, regla del conteo, login y navegación, despliegue en Vercel | ✅ (ver v10) |
| 29–34 | P1, B1, B2, C1, U1, V1 | ✅ 2026-10-01 |
| 35–42 | DB1, DB2, T1, PN1, Z1, T2/T3, PN2, DP1 | ✅ 2026-10-01 / 02 |
| 43 | **CR1** Solo lectura de `pos_*` y `st_*` | ✅ 2026-10-02 (usuario) |
| 44 | **CR2** Salidas del POS pendientes si el producto está ubicado | ✅ 2026-10-06 |
| 45 | **CR3** Sobrante pendiente hasta ajuste + en el POS | ✅ 2026-10-06 |
| 46 | **AJ1** Origen de la salida elegido de una lista | ✅ 2026-10-06 |
| 47 | **IN1** Conteo resta lo reservado | ✅ 2026-10-06 |
| 48 | **IN2** Cierre del sobrante: Ubicar / Descartar | ✅ 2026-10-06 |
| 49 | **IN3** Conteo con esperado visible y "Coincide" | ✅ 2026-10-06 |
| 50 | **RC1** Reconciliación de solo lectura; POS − WMS | ✅ 2026-10-06 |
| 51 | **DP2** Verificación después de cada script; registro por ambiente | ✅ 2026-10-06 |
| 53 | **U2** Pendientes por ubicar en Ubicar: solo `SIN_UBICAR` libre, lista completa con "Ver más", eliminados en el POS visibles con etiqueta | ✅ 2026-10-27 |
| 52 | **RC2** Igualar el WMS al POS cuando no hay movimiento que explique la diferencia (solo `wms_*`, T-521) | ⏳ Pendiente de decisión |

**Riesgos abiertos:** R-B1 (T-515); R-C1 doble paso por CR1; R-C2 sesgo del conteo; R-C3 diferencias sin movimiento (RC2).

---

### 13. Glosario
| Término | Definición |
|---|---|
| **Puesto** | Canastilla (piso) o entrepaño; `CC` 01–99 único en la bodega |
| **Contenido** | Bolsa, caja o zona suelta dentro de un puesto |
| **SIN_UBICAR / UBICADO** | Stock sin contenedor / en un contenedor |
| **RESERVADO** | Vendido sin despachar; sigue físicamente en el contenedor |
| **Salida pendiente** | Ajuste − o merma del POS de un producto ubicado, a la espera del origen |
| **Sobrante pendiente** | Unidades contadas de más que esperan un ajuste + en el POS |
| **Solo lectura (CR1)** | El WMS consulta `pos_*`/`st_*` pero nunca las modifica ni bloquea |
| **Reconciliación** | Comparar el stock físico (WMS) con el contable (POS) y explicar la diferencia |

---

### 14. Incidentes
- **I-1 (2026-10-06):** el `10` no se había ejecutado en pruebas (el C0 se aprobó sin la verificación A/B/C). Detectado al ejecutar el `11`. Impacto: ninguno sobre el POS (0 movimientos `referencia = 'WMS'`). Se ejecutó el `10` y se revalidaron C0, C1 y C2. Origen de la regla de verificación (§8) y de DP2.

---

### 15. Estándar de Nomenclatura de Códigos (OFICIAL)

```
B CC PP   →  5 dígitos, todo numérico
B   = bodega 1–9
CC  = puesto 01–99, único en la bodega: canastilla (piso) O entrepaño, nunca ambos
PP  = 00 el puesto · 01–90 bolsa (canastilla) o caja (entrepaño), un producto · 91–99 zona suelta, varios
```

| Código | Significado |
|---|---|
| `30100` | Canastilla 01 (Bodega 3) |
| `30110` | Bolsa 10 de la canastilla 01 |
| `30191` | Zona suelta de la canastilla 01 |
| `30500` | Entrepaño 05 |
| `30503` | Caja 03 del entrepaño 05 |
| `30591` | Zona suelta del entrepaño 05 |

Reglas: `wms_ubicaciones.tipo` es la fuente de verdad; código único (`uk_wms_ubicaciones_codigo`); la zona suelta aloja varios SKU; mover una caja de entrepaño cambia su código; la pantalla arma la descripción desde el código (V1).
