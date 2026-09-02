# plan.md — Plan técnico de implementación Kubit-WMS (MVP)

> **Cómo.** Arquitectura, estructura y decisiones técnicas derivadas de `spec.md`, `constitution.md` y el **AGENTS.md raíz de Kubit**.

## 1. Stack (confirmado en Kubit — no reabrir)
- **Frontend:** HTML semántico + **Tailwind CSS vía CDN** + **JavaScript vanilla** (IIFE por página). Sin SPA, sin TypeScript, sin build. Alpine.js ligero solo si es imprescindible.
- **Backend/DB:** PostgreSQL 15+ vía **Supabase** (plan gratuito). Cliente `supabase-js`. Sin ORM.
- **API:** Supabase Data API (**PostgREST**). Lógica transaccional → **funciones Postgres** llamadas con `.rpc()` (o Edge Functions si se requiere). Sin servidor propio.
- **Auth:** Supabase Auth (reutiliza usuarios de Kubit).
- **PWA:** `manifest.json` + `service-worker.js` (patrón POS/Store).
- **Hosting:** Vercel (plan gratuito).

## 2. Estructura de archivos (coherente con el monorepo Kubit)
```
/specs/
  ├── 06-wms-spec.md         # Especificación funcional (fuente de verdad)
  └── 07-wms-schema.sql      # DDL de tablas wms_* (patrón de 02-database-schema.sql)

/apps/wms/
  ├── index.html             # Dashboard
  ├── inventario.html        # Inventario general / ubicar
  ├── buscar.html            # Buscar producto
  ├── despachar.html         # Despacho de ventas
  ├── traslados.html
  ├── reconciliacion.html
  ├── baja.html
  ├── config.html            # Bodegas y contenedores
  ├── manifest.json
  ├── service-worker.js
  ├── css/                   # (si hace falta CSS propio; base es Tailwind CDN)
  └── js/
      ├── config.js          # credenciales Supabase (patrón POS/Store)
      ├── database.js        # objeto DB.wms.* (acceso vía supabase-js / .rpc())
      ├── auth.js            # sesión + poblarUserHeader()
      ├── codigos.js         # parseo/validación código B CC PP
      └── paginas/
          ├── inventario.js
          ├── buscar.js
          ├── despachar.js
          ├── traslados.js
          ├── reconciliacion.js
          ├── baja.js
          └── config.js

/tests/wms/                  # pruebas *.test.js (patrón del repo; skill tdd)
  ├── codigos.test.js
  ├── stock.test.js
  ├── reconciliacion.test.js
  └── flujos.test.js
```

## 3. Modelo de datos (tablas `wms_*`)
Según `06-wms-spec.md` §4.2. Cinco tablas: `wms_bodegas`, `wms_ubicaciones` (árbol `parent_id`), `wms_stock_ubicacion` (núcleo), `wms_movimientos` (ledger), `wms_conteos`.

### Decisiones "No Reabrir" aplicadas
- PK UUID v4 `gen_random_uuid()`; `timestamptz` default `now()`; `updated_at` vía trigger `update_updated_at()`; `deleted_at` nullable.
- **Estados como strings con CHECK constraint** (NO ENUMs):
  - `wms_stock_ubicacion.estado_fase` CHECK IN (`'SIN_UBICAR','UBICADO','RESERVADO','DESPACHADO','BAJA'`).
  - `wms_ubicaciones.tipo` CHECK IN (`'ESTANTERIA','ENTREPANO','CAJA','CANASTILLA','BOLSA','SUELTO'`).
  - `wms_movimientos.tipo_movimiento` CHECK IN (`'ENTRADA','UBICACION','TRASLADO','RESERVA','DESPACHO','AJUSTE','BAJA','LIBERACION'`).
- **RLS** habilitado + políticas por rol; **grants** explícitos (`anon`, `authenticated`, `service_role`).
- Todas las FK **indexadas**. Auditoría → `pos_usuarios`.

## 4. Transacciones atómicas (funciones Postgres via `.rpc()`)
Para garantizar atomicidad (Artículo 5) sin servidor propio, las operaciones stock+movimiento se implementan como **funciones PL/pgSQL** en Supabase, invocadas desde `database.js` con `supabase.rpc()`:
- `wms_recibir(ref_pos_compra_id, items)` → +SIN_UBICAR + ENTRADA (idempotente).
- `wms_ubicar(producto_detalle_id, ubicacion_id, cantidad)` → SIN_UBICAR→UBICADO + UBICACION.
- `wms_reservar(ref_pos_venta_id, items)` → →RESERVADO + RESERVA (idempotente).
- `wms_despachar(...)` → RESERVADO→DESPACHADO + DESPACHO.
- `wms_liberar(ref_pos_venta_id)` → RESERVADO→UBICADO/SIN_UBICAR + LIBERACION.
- `wms_trasladar(producto_detalle_id, origen_id, destino_id, cantidad)` → TRASLADO.
- `wms_ajustar(producto_detalle_id, delta, ubicacion_id?)` → AJUSTE + propaga a `pos_movimientos_inventario`.
- `wms_dar_baja(producto_detalle_id, ubicacion_id, cantidad)` → BAJA + `merma` en POS.

## 5. Capa de datos (`js/database.js`)
- Objeto global `DB.wms.*` (patrón de los `DB.*` del POS).
- Lecturas: `supabase.from('wms_...').select()` con embeds PostgREST.
- Escrituras transaccionales: `supabase.rpc('wms_...', {...})`.
- Sincronización bajo demanda: consultas a `pos_compras`/`pos_ventas`/`pos_movimientos_inventario` filtrando lo que **no** tiene `ref_pos_*` en `wms_movimientos`.

## 6. Validación de códigos (`js/codigos.js`)
- Parser `B CC PP` (regex `^[1-9]\d{4}$`) → `{ bodega, contenedor, tipoContenedor, posicion, tipoPosicion }`.
- El **tipo real** se resuelve contra `wms_ubicaciones.tipo` (fuente de verdad), no solo por rango.

## 7. PWA y UI (05-ui-ux-system.md)
- Modo oscuro por defecto (`class="dark"` + anti-flash). Paleta **Slate**. Header fijo `pt-16`. Sidebar como POS.
- Service worker: rutas relativas, cache-first + fallback, versioning `wms-YYYYMMDD-NN`, bypass en localhost, `ignoreSearch:true`.
- `auth.js::poblarUserHeader()` con IDs `user-avatar`, `user-name`, `user-rol`.

## 8. Pruebas (skill tdd, patrón del repo)
- **Unitarias:** `codigos.test.js`, `stock.test.js` (transiciones), `reconciliacion.test.js`.
- **Flujos:** `flujos.test.js` cubre HU-01…HU-08 verificando el invariante tras cada operación.
- **Idempotencia:** reejecutar recibir/reservar no duplica.

## 9. Orden de construcción (detalle en tasks.md)
1. Estructura `apps/wms` + `config.js` + `service-worker.js` + `manifest.json` + layout Slate/dark.
2. `07-wms-schema.sql`: tablas + CHECK + índices + trigger + RLS + grants.
3. `codigos.js` + pruebas.
4. Funciones `.rpc()` atómicas + pruebas de flujo.
5. `database.js` (DB.wms.*) + lectura bajo demanda del POS.
6. Pantallas: Config → Inventario/Ubicar → Buscar → Despachar → Traslados → Reconciliación → Baja → Dashboard.
7. Endurecimiento (idempotencia, atomicidad, invariante) + PWA offline básica.

## 10. Local y despliegue
- **Local (Windows):** `npx http-server apps/wms -p 3000` (no `npx serve`).
- **Deploy:** Vercel (skill `deploy-to-vercel`), solo si el usuario lo pide. **Sin commits automáticos.**

## 11. Riesgos técnicos
- Consistencia POS↔WMS bajo demanda → mitigada con panel de reconciliación explícito.
- Atomicidad en cliente vanilla → resuelta moviendo la lógica a funciones Postgres `.rpc()`.
- Límite 50 canastillas/bodega → validación blanda; `tipo` manda sobre el rango.
