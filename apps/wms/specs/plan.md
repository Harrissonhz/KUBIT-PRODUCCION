# plan.md — Plan técnico de implementación Kubit-WMS (MVP)

> **Cómo.** Arquitectura, stack, estructura y decisiones técnicas derivadas de `spec.md` y `constitution.md`.

## 1. Stack
- **Frontend:** Next.js (App Router) + React + TailwindCSS. **PWA** (service worker + manifest) para uso móvil.
- **Backend/DB:** Supabase (PostgreSQL + PostgREST + RLS). Acceso vía `@supabase/supabase-js`.
- **Lenguaje:** TypeScript.
- **Testing:** Vitest (unitario) + pruebas de integración contra un esquema de prueba de Supabase.
- **CI/CD:** GitHub → Vercel (deploy) ; migraciones SQL versionadas en `supabase/migrations`.

## 2. Estructura de carpetas (monorepo, dentro de apps/wms)
```
apps/wms/
├── package.json
├── next.config.js
├── tsconfig.json
├── manifest.webmanifest        # PWA
├── public/
│   └── service-worker.js
├── src/
│   ├── app/                    # rutas (mobile-first)
│   │   ├── (dashboard)/page.tsx
│   │   ├── inventario/page.tsx        # Inventario general / ubicar
│   │   ├── buscar/page.tsx            # Buscar producto
│   │   ├── despachar/page.tsx         # Despacho de ventas
│   │   ├── traslados/page.tsx
│   │   ├── reconciliacion/page.tsx
│   │   ├── baja/page.tsx
│   │   └── config/page.tsx            # Bodegas y contenedores
│   ├── components/
│   ├── lib/
│   │   ├── supabase.ts               # cliente
│   │   ├── codigos.ts                # parseo/validación código B CC PP
│   │   ├── reconciliacion.ts         # invariante y diffs con POS
│   │   └── movimientos.ts            # helpers atómicos de movimientos
│   └── domain/
│       ├── stock.ts                  # transiciones de estado
│       └── tipos.ts                  # enums y modelos
├── supabase/
│   └── migrations/
│       ├── 0001_wms_bodegas.sql
│       ├── 0002_wms_ubicaciones.sql
│       ├── 0003_wms_stock_ubicacion.sql
│       ├── 0004_wms_movimientos.sql
│       ├── 0005_wms_conteos.sql
│       ├── 0006_indices_fk.sql
│       ├── 0007_rls_policies.sql
│       └── 0008_funciones_rpc.sql    # transacciones atómicas (put-away, despacho, traslado, ajuste, baja)
└── tests/
    ├── codigos.test.ts
    ├── stock.test.ts
    ├── reconciliacion.test.ts
    └── flujos.integration.test.ts
```

## 3. Modelo de datos (tablas `wms_*`)
Según `06-wms-spec.md` §4.2. Cinco tablas: `wms_bodegas`, `wms_ubicaciones` (árbol auto-referenciado `parent_id`), `wms_stock_ubicacion` (núcleo), `wms_movimientos` (ledger), `wms_conteos`.

### Enums de dominio
- `estado_fase`: `SIN_UBICAR | UBICADO | RESERVADO | DESPACHADO | BAJA`.
- `wms_ubicaciones.tipo`: `ESTANTERIA | ENTREPANO | CAJA | CANASTILLA | BOLSA | SUELTO`.
- `wms_movimientos.tipo_movimiento`: `ENTRADA | UBICACION | TRASLADO | RESERVA | DESPACHO | AJUSTE | BAJA | LIBERACION`.

## 4. Transacciones atómicas (RPC en Postgres)
Para garantizar el Artículo 4 (atomicidad), las operaciones que tocan stock + movimiento se implementan como **funciones RPC** de Supabase (PL/pgSQL) que hacen todo en una transacción y devuelven error si algo falla:
- `wms_recibir(ref_pos_compra_id, items[])` → +SIN_UBICAR + mov ENTRADA (idempotente).
- `wms_ubicar(producto_detalle_id, ubicacion_id, cantidad)` → SIN_UBICAR→UBICADO + mov UBICACION.
- `wms_reservar(ref_pos_venta_id, items[])` → →RESERVADO + mov RESERVA (idempotente).
- `wms_despachar(...)` → RESERVADO→DESPACHADO + mov DESPACHO.
- `wms_liberar(ref_pos_venta_id)` → RESERVADO→UBICADO/SIN_UBICAR + mov LIBERACION.
- `wms_trasladar(producto_detalle_id, origen_id, destino_id, cantidad)` → mov TRASLADO.
- `wms_ajustar(producto_detalle_id, delta, ubicacion_id?)` → +/- + mov AJUSTE + propaga a pos_movimientos_inventario.
- `wms_dar_baja(producto_detalle_id, ubicacion_id, cantidad)` → →BAJA + merma en POS.

## 5. Sincronización con POS (lectura bajo demanda)
- Vistas de lectura sobre `pos_compras`/`pos_ventas`/`pos_movimientos_inventario`.
- Al abrir cada bandeja, se listan los registros del POS **sin** `ref_pos_*` correspondiente en `wms_movimientos`.
- La reconciliación calcula, por SKU: `stock_actual` (POS) vs `SUM(SIN_UBICAR+UBICADO)` (WMS) y muestra el diff.

## 6. Validación de códigos (`lib/codigos.ts`)
- Parser `B CC PP` (regex `^[1-9]\d{4}$`) → `{ bodega, contenedor, tipoContenedor, posicion, tipoPosicion }`.
- El **tipo real** se resuelve contra `wms_ubicaciones.tipo` (fuente de verdad), no solo por rango.

## 7. RLS y seguridad
- RLS por `bodega_id`. En el MVP, un solo usuario admin; políticas simples pero presentes.
- Claves de servicio solo en el backend; el front usa `anon` + sesión.

## 8. Estrategia de pruebas
- **Unitarias:** códigos, transiciones de estado, cálculo de reconciliación.
- **Integración:** flujos HU-01…HU-08 contra esquema de prueba, verificando el invariante tras cada operación.
- **Idempotencia:** reejecutar recibir/reservar no duplica.

## 9. Orden de construcción (alto nivel → detalle en tasks.md)
1. Scaffolding + config + PWA.
2. Migraciones de tablas + índices + RLS.
3. `lib/codigos.ts` + pruebas.
4. RPCs atómicas + pruebas de integración.
5. Pantallas: Config → Inventario/Ubicar → Buscar → Despachar → Traslados → Reconciliación → Baja → Dashboard.
6. Endurecimiento (idempotencia, atomicidad, invariante) + PWA offline básica.

## 10. Riesgos técnicos
- Consistencia POS↔WMS bajo demanda (mitigado por reconciliación explícita).
- Concurrencia (bajo, es uso personal; RPCs transaccionales cubren el caso).
- Límite de 50 canastillas/bodega (validación blanda + `tipo` como verdad).
