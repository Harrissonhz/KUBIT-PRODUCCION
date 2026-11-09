# Especificación Maestra - Ecosistema Kubit

## 1. Visión General
Este documento constituye la **Fuente Única de Verdad (Single Source of Truth)** para el ecosistema SaaS "Kubit". Cualquier decisión de diseño, estructura de datos o flujo de trabajo debe ser validada contra este documento y sus archivos hijos dentro de `/specs`.

## 2. Arquitectura del Proyecto
El proyecto sigue una estructura de directorios estricta para separar la definición (specs) de la implementación (apps).
- `/specs`: Contiene los archivos de especificación (Plano Maestro, BD, UI/UX).
- `/apps`: Contiene la lógica ejecutable del software (POS, Store, etc.).

*Nota: Referenciar siempre `ARCHITECTURE.md` para detalles de la infraestructura de servicios.*

## 3. Identidad Visual (UI/UX)
El estilo es **Ultra-minimalista y corporativo (Estilo Apple)**.
- **Base:** Tailwind CSS.
- **Paleta:** Colores Monocromáticos (Slate).
- **Consistencia:** Todo componente debe seguir estrictamente las definiciones de `05-ui-ux-system.md`. No se permiten improvisaciones visuales.

## 4. Estructura de Datos
La base de datos se rige por un esquema relacional unificado.
- **Motor:** PostgreSQL (vía Supabase).
- **Tablas principales:** `ventas`, `productos`, `usuarios`, `caja_apertura`, `clientes`, etc.
- **Referencia técnica:** Consultar siempre `02-database-schema.sql` (o `Supabase.md`) antes de realizar cualquier operación CRUD.

## 5. Reglas de Desarrollo (SDD Riguroso)
Para mantener la integridad del proyecto, se establecen las siguientes reglas:
1. **No asumir:** Si falta una especificación en los archivos de `/specs`, la IA **debe** pausar y consultar al usuario. Nunca se debe inventar lógica o estructura de datos.
2. **Jerarquía:** La especificación siempre prevalece sobre el código. Si el código actual diverge de la especificación, se debe actualizar la especificación primero (previa aprobación) o corregir el código.
3. **Modularidad:** Todo desarrollo debe ser autónomo dentro de su carpeta en `/apps`.

## 6. Mapa de Artefactos

### 6.1 Specs
- `/specs/01-master-spec.md` (Este documento)
- `/specs/00-bootstrap.sql` — Extension unaccent
- `/specs/01-schema.sql` — DDL completo (35 tablas con grants, RLS, indices, triggers)
- `/specs/02-seed-permisos.sql` — Seed de roles y permisos por rol
- `/specs/03-seed-store-grants.sql` — Grants anon para modulo Store (desde T2 no abre pedidos, detalle ni direcciones)
- `/specs/03-pos-spec.md` — Especificacion del modulo POS
- `/specs/04-store-spec.md` — Especificacion del modulo Store
- `/specs/05-ui-ux-system.md` — Sistema de diseno UI/UX
- `/specs/06-servicio-correo.md` — Correo transaccional (POST-MVP)
- `/specs/10-codex.md` — Convenciones de codigo (Pendiente)
- `/specs/11-api-contracts.md` — Contratos de API (Pendiente)
- `/specs/12-roadmap.md` — Roadmap (Pendiente)
- `/specs/13-testing-model.md` — Modelo de testing automatico
- `/specs/14-migracion-datos.md` — Migracion de datos V1 → V2
- `/specs/13-pos-wms-url.sql` — Columna `wms_url` (Fase 44 del POS)
- `/specs/15-store-pedido-seguro.sql` — Tienda T2: `st_crear_pedido`, numero de pedido, `st_direcciones.email`
- `/specs/16-store-cerrar-acceso-anon.sql` — Tienda T2: sin acceso `anon` a pedidos, detalle y direcciones
- `/specs/17-store-checkout-coherente.sql` — Tienda T3b: configuracion, zonas de envio, `medio_pago_web`, `st_crear_pedido` v2
- `/specs/18-pos-pedidos-web.sql` — POS T4: columnas de gestion en `st_pedidos` y funciones `pos_pedido*_web_*` (pedidos web en el POS)
- `/specs/07-wms-spec.md` y `/specs/08-wms-schema.sql` — Modulo WMS
- `/specs/ARCHITECTURE.md` — Estructura de directorios

### 6.2 Memoria de IA
- `/AGENTS.md` — Memoria persistente del proyecto
- `/CLAUDE.md` — Copia de AGENTS.md (compatibilidad Claude Code)
- `/CONTEXT.md` — Glosario de dominio del proyecto
- `/tests/` — Tests del POS (Vitest, `*.test.js`), de pedidos web del POS (`tests/pos/*.test.mjs`, `node --test`) y de la tienda (`tests/store/*.test.mjs`, `node --test`)

### 6.3 Apps
- `/apps/pos/` — Modulo POS (Punto de Venta)
- `/apps/store/` — Modulo Tienda Virtual (hallazgos y plan en `apps/store/specs/hallazgos-tienda.md`, estado en `apps/store/memory/progress.md`)
- `/apps/wms/` — Modulo WMS (bodega; ver `apps/wms/AGENTS.md`)
- `/apps/academy/` — Modulo Academy (Futuro, post-MVP)

### 6.4 Archivos Informativos (externos, no versionados)
- `ArchivosInformativos/Basedatos/` — CSVs de origen V1 (14 tablas)
- `ArchivosInformativos/DespliegueProduccion/` — Credenciales de produccion, guias
- `ArchivosInformativos/DespliegueProduccion/ScriptMigracionDB/` — Scripts INSERT ordenados para migracion V1→V2
