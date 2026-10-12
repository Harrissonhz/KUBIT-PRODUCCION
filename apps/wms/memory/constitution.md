# constitution.md — Principios no negociables de Kubit-WMS

> Reglas que el agente **nunca** viola. Si una tarea las contradice, se detiene y lo reporta.
> Esta constitucion se subordina al **AGENTS.md raiz de Kubit** (que manda en caso de conflicto).
> Ultima actualizacion: 2026-10-06 (preparacion de produccion) — Articulos 7 (permisos del `12`), 12 (orden `08 → 12`) y 15 (commit de produccion) y nuevo Articulo 18 (despliegue sin tocar POS ni Tienda).

## Articulo 0 — Reglas raiz de Kubit (heredadas)
- **Cero suposiciones:** si falta una spec en `/specs/`, **PREGUNTAR**; nunca inventar.
- **No asumir pago:** solo planes gratuitos de Supabase/Vercel; sin Storage de Supabase; sin Edge Functions en produccion.
- **Responsive:** mobile-first, minimo 360px, clases de `05-ui-ux-system.md`.
- **Sin commits automaticos:** la IA no hace `git commit`/`push` salvo peticion explicita.

## Articulo 1 — Stack (confirmado, no reabrir)
- **HTML + Tailwind (CDN) + JavaScript vanilla (IIFE por pagina).** Sin React/Vue/Angular, sin TypeScript, sin build.
- **Supabase (PostgREST)** via el cliente propio `js/supabase.js` (`fetch` directo, **no** supabase-js); sin ORM; sin servidor propio. Logica transaccional → funciones Postgres via `rpc()`.
- **Testing:** vitest + jsdom.

## Articulo 2 — Separacion de responsabilidades (CR1, 2026-10-02)
- **POS = unico dueno del stock contable.** `pos_productos_detalle.stock_actual` y `pos_movimientos_inventario` solo los escribe el POS.
- **WMS = capa fisica** ("donde" / "en que estado"). **Solo lee** las tablas `pos_*` y `st_*`: **nunca** hace `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP` ni `SELECT ... FOR UPDATE` sobre ellas.
- Todo cambio del stock contable (ajuste +, ajuste −, merma) **nace en el POS**; el WMS lo recibe al sincronizar y solo actualiza sus tablas `wms_*`.
- El WMS **jamas** crea productos; solo referencia `producto_detalle_id`.
- Las tablas del WMS pueden tener **llaves foraneas** hacia `pos_*` (integridad); eso no modifica las tablas del POS. Verificado: el POS y la Tienda no borran fisicamente productos ni usuarios (R-P2, 2026-10-06).

## Articulo 3 — Invariante de reconciliacion (regla de oro)
Para todo SKU **fisico** `X`:
```
pos_productos_detalle.stock_actual(X)
   == SUM( wms_stock_ubicacion.cantidad )
      WHERE producto_detalle_id = X
        AND estado_fase IN ('SIN_UBICAR', 'UBICADO')
```
Toda operacion del WMS preserva este invariante. Se verifica con `wms_v_reconciliacion` y la pantalla Reconciliacion. Una diferencia se corrige **registrando el movimiento en el POS** (nunca escribiendo el POS desde el WMS). Los productos digitales no aplican (Articulo 13).

## Articulo 4 — Estados del stock
- `SIN_UBICAR` (ubicacion_id NULL, cuenta), `UBICADO` (cuenta), `RESERVADO` (no cuenta), `DESPACHADO` (no cuenta), `BAJA` (no cuenta).
- `SIN_UBICAR` es **logico**, sin ubicacion fisica. Un producto puede recibirse y venderse sin ubicarse.
- `RESERVADO` conserva su `ubicacion_id`: la unidad vendida sigue fisicamente en el contenedor hasta despacharla (IN1).
- Los estados se almacenan como **strings con CHECK constraint** (no ENUMs).

## Articulo 5 — Atomicidad e integridad
- Movimiento fisico + efecto en `wms_stock_ubicacion` = **una transaccion** (funcion Postgres). Si falla un paso, se revierte todo.
- Nunca `cantidad < 0`. La app **nunca** escribe directo en `wms_stock_ubicacion`, `wms_movimientos` ni `wms_conteos`: solo via `rpc()`. Desde el `12`, la base tambien lo impide (esas tablas son de solo lectura para `authenticated`).
- **(C1)** Los **maestros** `wms_bodegas` y `wms_ubicaciones` si se escriben directo desde la app (RLS "escritura authenticated").
- No se desactiva un contenedor con mercancia `UBICADO` o `RESERVADO`.
- **(CR1)** Ninguna funcion `wms_*` ni `_wms_*` escribe ni bloquea filas de `pos_*` o `st_*`. La exclusion entre procesos simultaneos usa candados propios (`pg_advisory_xact_lock`). Se verifica con las consultas A y B (Articulo 16).

## Articulo 6 — Sincronizacion con el POS
- **Lectura bajo demanda** (sin triggers en el MVP): `wms_sincronizar()` al abrir Buscar, Ubicar, Despachar, Panel, Bajas y ajustes, Inventario y Reconciliacion.
- Fuente unica de eventos: `pos_movimientos_inventario` (solo lectura).
- **Idempotencia:** clave `wms_movimientos.ref_pos_movimiento_id` (D1).
- **Linea base:** los movimientos anteriores al arranque del WMS estan en `wms_pos_linea_base` y nunca se procesan.
- **(CR1)** El WMS no escribe en el POS, asi que no genera "ecos". El filtro `referencia = 'WMS'` (D3) se conserva como proteccion.
- **(CR2)** Ajustes − y mermas del POS: se descuentan solos de `SIN_UBICAR` solo si el producto no tiene unidades ubicadas; si las tiene, quedan **pendientes** y el usuario indica de donde salieron en "Bajas y ajustes" (AJ1).
- Si un evento falla, se revierte solo ese y queda **PENDIENTE** con el motivo; los demas continuan.

## Articulo 7 — Modelo de datos y permisos (decisiones "No Reabrir" de Kubit)
- Esquema `public`; prefijo `wms_` (tablas), `wms_v_` (vistas), `wms_` y `_wms_` (funciones). PK UUID v4 (`gen_random_uuid()`).
- `timestamptz` default `now()`; `updated_at` via trigger con la funcion **existente** `update_updated_at()` del POS, que el WMS **nunca redefine** (R-P13).
- Soft delete `deleted_at`. Todas las FK **indexadas**. Auditoria `created_by`/`updated_by` → `pos_usuarios`.
- **RLS** habilitado con politicas por rol; **grants** explicitos.
- **(DP3, script `12`)** El rol `anon` (llave publica, la misma de la Tienda) **no tiene acceso** a ningun objeto `wms_*`. `authenticated`: lectura y escritura en maestros; solo lectura en stock, movimientos, conteos, linea base y vistas; las funciones `_wms_*` no son ejecutables por la app. Si se agrega un objeto `wms_*`, se vuelve a ejecutar el `12`.
- `wms_ubicaciones.tipo` es la **fuente de verdad** del tipo de contenedor.

## Articulo 8 — Nomenclatura de ubicaciones (decision P1, 2026-10-01)
- Codigo **numerico de 5 digitos** `B CC PP`:
  - `B` = bodega (1–9). Maximo 9 bodegas.
  - `CC` = **puesto** 01–99, unico en la bodega: una **canastilla** (en el piso) **o** un **entrepano** de la estanteria, nunca ambos con el mismo numero.
  - `PP` = `00` el puesto completo; `01–90` bolsa (en canastilla) o caja (en entrepano), un solo producto; `91–99` zona suelta, varios productos.
- La **estanteria** (el mueble) **no se registra**. Las canastillas nunca van sobre la estanteria.
- Puestos: `es_hoja=false`, `mono_sku=false`, sin padre. Bolsa/caja: `es_hoja=true`, `mono_sku=true`. Zona suelta: `es_hoja=true`, `mono_sku=false`. Bolsa, caja y zona suelta cuelgan (`parent_id`) de su puesto.

## Articulo 9 — UX (05-ui-ux-system.md)
- **Mobile-first / PWA.** Entrada **manual** de codigos. Ultra-minimalista, **monocromatico Slate**, **modo oscuro por defecto**, texto visible en ASCII plano.
- Navegacion: barra inferior en celular (< lg) y sidebar en computador (lg+), en el mismo HTML.
- Fechas en zona **America/Bogota** explicita (Z1, `js/compartido/fecha.js`). Ubicaciones con el formato V1 (`js/compartido/ubicacion-vista.js`).
- Toda pantalla indica **que registrar en el POS** cuando el problema se resuelve alla (CR1).

## Articulo 10 — Alcance MVP (lo que NO se hace)
- Sin FIFO/FEFO, lotes/vencimiento, primera/segunda (solo primera; averia → merma en el POS → BAJA en el WMS).
- Sin capacidad ni bloqueos por capacidad. Sin devoluciones formales (via ajuste POS). Sin carga inicial masiva de ubicaciones. Sin triggers/Edge Functions de sync. Sin multiusuario operativo.
- Sin ajustes ni bajas originados en el WMS (CR1). Sin conteo ciego (IN3).
- Anulacion/edicion de ventas: diferida (D2). Validacion SQL de ventas anuladas (T-515): bloqueada hasta corregir el bug de anulacion del POS (DP5).

## Articulo 11 — Calidad
- Toda funcionalidad llega con su prueba (vitest + jsdom o prueba manual documentada). Un cambio atomico por unidad de trabajo. **Sin commit** salvo peticion.
- Antes de entregar un paquete se lista su contenido; si se corrige, se entrega con nombre nuevo (`-v2`).

## Articulo 12 — Referencias de specs (numeracion real del repo)
- Spec funcional: **`specs/07-wms-spec.md`** (v11).
- DDL: **`specs/08-wms-schema.sql`**.
- Funciones, vistas y permisos, en este orden obligatorio: **`09-wms-functions.sql`** (v2) → **`10-wms-solo-lectura.sql`** (CR1, CR2, CR3) → **`11-wms-conteo-sobrante.sql`** (IN2) → **`12-wms-permisos.sql`** (DP3). Nunca re-ejecutar el `09` despues del `10`; si ocurre, ejecutar de nuevo `10`, `11` y `12`.
- Plan de produccion: `apps/wms/specs/despliegue-produccion.md` (documento vivo, T-430) y `apps/wms/specs/produccion/` (prechequeo v2 y rollback).
- Scripts de uso unico (ej. limpieza de pruebas) **no** van en `specs/`.

## Articulo 13 — Solo productos fisicos (D5)
- El WMS gestiona productos con `tipo_producto` = `'Fisico'` o `NULL`.
- Los productos `'Digital'` quedan fuera: no se cargan, no se sincronizan, no se reconcilian, no aparecen en Buscar y las funciones rechazan operarlos.

## Articulo 14 — Regla del conteo (CR3, IN1, IN2)
- Se cuenta **todo** lo que hay fisicamente en el contenedor, incluidas las unidades vendidas sin despachar; la pantalla resta lo `RESERVADO`. Un conteo menor que lo reservado **no se registra** (IN1).
- Conteo **mayor** al registrado: primero se ubica lo que haya en `SIN_UBICAR`; el **sobrante real queda pendiente** (conteo `ABIERTO`) hasta registrar un **ajuste + en el POS**.
- El sobrante se cierra en Inventario: **Ubicar** (exige que el ajuste + ya haya llegado al WMS) o **Descartar** (error de conteo, sin mover stock) (IN2).
- Conteo **menor**: lo que falta vuelve a `SIN_UBICAR`; **no** se toca el POS. Una perdida real se registra como ajuste − o merma **en el POS**.

## Articulo 15 — Archivos que nunca van a produccion
- `apps/wms/js/config.js` (credenciales de pruebas). **No confundir** con `apps/wms/js/paginas/config.js` (pantalla), que si va.
- Se suman a los del POS/Store: `apps/pos/js/config.js`, `apps/store/js/api/supabase-client.js`, `apps/store/js/compartido/supabase-client.js`.
- El `service_role` key nunca va en el frontend del WMS.
- **(DP4)** El commit al repositorio de produccion solo incluye `apps/wms/` y `specs/` (nunca `git add .`), para no publicar cambios pendientes del POS o la Tienda.

## Articulo 16 — Documentacion y verificacion por paso
- Cada paso termina actualizando `tasks.md`, `fix_plan.md` y `progress.md`.
- `spec.md`, `plan.md`, `constitution.md` o `07-wms-spec.md` se actualizan cuando cambia una decision o el diseno (como minimo al cerrar cada fase).
- Si el paso cambia base de datos, frontend o decisiones, se actualiza `despliegue-produccion.md` (T-430).
- **(I-1) Un script SQL solo se da por ejecutado con su verificacion**, nunca con el "Success" del editor: consultas A (escrituras en `pos_*`/`st_*` = 0 filas), B (bloqueos = 0 filas), C (cantidad de funciones esperada) y las especificas del script (V-12: G, H, I, J). Se registra en `despliegue-produccion.md` §1.4 con la fecha real.
- No se avanza al siguiente paso sin la prueba del anterior aprobada por el usuario.

## Articulo 17 — Reconciliacion de solo lectura (RC1, 2026-10-06)
- La pantalla Reconciliacion **explica** cada diferencia (causa y donde resolverla) y **no corrige** nada por si misma.
- La diferencia se muestra siempre como **POS − WMS** en todas las pantallas.
- Corregir una diferencia sin movimiento que la explique (ej. venta anulada) queda pendiente de decision (RC2, T-521); si se construye, solo podra escribir `wms_*`.

## Articulo 18 — Despliegue a produccion sin tocar POS ni Tienda (2026-10-06)
- El despliegue solo **crea** objetos `wms_*` y cambia **sus** permisos; no modifica funciones, tablas, politicas, permisos ni codigo del POS o la Tienda.
- Antes de la ventana: prechequeo de solo lectura en produccion, todos los scripts verificados en pruebas (§1.4) y "Ignored Build Step" en los proyectos Vercel del POS y la Tienda (mismo repositorio, R-P12).
- En la ventana: respaldo, conteos base del POS antes y despues de cada script (deben ser identicos) y rollback disponible que solo borra objetos `wms_*`.
