# Arquitectura del Proyecto Kubit

## 1. Estructura de Directorios (Actual)

```
/
├── AGENTS.md                     ← Memoria de IA (universal, fuente de verdad para decisiones)
├── CLAUDE.md                     ← Copia de AGENTS.md (compatibilidad Claude Code)
├── CONTEXT.md                    ← Glosario de dominio del proyecto
├── README.md
│
├── specs/                        ← Spec-Driven Development: fuente de verdad
│   ├── 01-master-spec.md         ← Visión general, branding, reglas del SaaS
│   ├── 01-schema.sql             ← DDL completo (35 tablas con grants, RLS, índices, triggers). En documentos antiguos aparece como 02-database-schema.sql
│   ├── 13-pos-wms-url.sql        ← Fase 44: columna wms_url en pos_configuracion_empresa (ya incluida en 01-schema.sql)
│   ├── 03-pos-spec.md            ← Especificación del módulo POS
│   ├── 04-store-spec.md          ← Especificación del módulo Tienda Virtual
│   ├── 05-ui-ux-system.md        ← Sistema de diseño UI/UX
│   ├── 06-servicio-correo.md     ← Correo transaccional con Resend (POST-MVP)
│   ├── 10-codex.md               ← Convenciones de código del proyecto
│   ├── 11-api-contracts.md       ← Contratos de API (REST + RPCs)
│   ├── 12-roadmap.md             ← Pendiente
│   ├── 13-testing-model.md       ← Modelo de testing automático
│   ├── ARCHITECTURE.md           ← Este archivo
│   ├── seed-anon-grants-store.sql← (historico) Grants anon del checkout antiguo; reemplazado por 03, 15 y 16
│   ├── 03-seed-store-grants.sql  ← Grants anon de la tienda (desde T2 sin acceso a pedidos, detalle ni direcciones)
│   ├── 15-store-pedido-seguro.sql      ← Tienda T2: st_crear_pedido, numero de pedido, st_direcciones.email
│   ├── 16-store-cerrar-acceso-anon.sql ← Tienda T2: cierra el acceso anon a pedidos, detalle y direcciones
│   ├── 17-store-checkout-coherente.sql ← Tienda T3b: configuracion, zonas de envio, medio_pago_web, st_crear_pedido v2
│   ├── 18-pos-pedidos-web.sql          ← POS T4: gestion de pedidos web (columnas de st_pedidos y funciones pos_pedido*_web_*)
│   └── seed-permisos.sql         ← Seed de roles y permisos
│
├── apps/
│   ├── pos/                      ← Módulo POS (Point of Sale)
│   │   ├── index.html            ← Redirección a login.html
│   │   ├── login.html            ← Login con Supabase Auth
│   │   ├── panel.html            ← Dashboard principal
│   │   ├── ventas.html           ← Registro de ventas
│   │   ├── ventas-rapido.html    ← Modo mostrador (split panel)
│   │   ├── ventas-historial.html ← Historial de ventas + modal detalle
│   │   ├── facturacion.html      ← Facturación electrónica DIAN
│   │   ├── productos.html        ← CRUD productos (multi-variante)
│   │   ├── categorias.html       ← CRUD categorías
│   │   ├── inventario.html       ← Dashboard de stock
│   │   ├── compras.html          ← Órdenes de compra
│   │   ├── proveedores.html      ← CRUD proveedores
│   │   ├── clientes.html         ← CRUD clientes
│   │   ├── caja.html             ← Apertura/cierre de caja
│   │   ├── gastos.html           ← CRUD gastos
│   │   ├── reportes.html         ← Reportes financieros
│   │   ├── configuracion.html    ← Configuración de empresa
│   │   ├── herramientas.html     ← Hub de herramientas
│   │   ├── pedidos-web.html      ← Pedidos de la tienda (T4): por gestionar / gestionados
│   │   ├── factura-print.html    ← Vista de impresión de factura
│   │   ├── vercel.json           ← Rewrite rules para Vercel
│   │   ├── manifest.json         ← PWA manifest
│   │   ├── service-worker.js     ← Service Worker (cache-first)
│   │   ├── css/
│   │   │   └── estilo.css        ← Estilos globales POS
│   │   ├── js/
│   │   │   ├── config.js         ← Credenciales Supabase (QA)
│   │   │   ├── supabase.js       ← Cliente REST API Supabase
│   │   │   ├── compartido/
│   │   │   │   ├── database.js   ← DatabaseService (CRUD genérico + entity-specific)
│   │   │   │   ├── auth.js       ← Autenticación (login/sesión/permisos)
│   │   │   │   ├── sidebar.js    ← toggleSidebar() compartido
│   │   │   │   └── pedidos-web-aviso.js ← T4: menu, aviso emergente y tarjeta del Panel (solo lectura)
│   │   │   ├── paginas/
│   │   │   │   ├── panel.js
│   │   │   │   ├── ventas.js
│   │   │   │   ├── ventas-rapido.js
│   │   │   │   ├── ventas-historial.js
│   │   │   │   ├── facturacion.js
│   │   │   │   ├── productos.js
│   │   │   │   ├── categorias.js
│   │   │   │   ├── inventario.js
│   │   │   │   ├── compras.js
│   │   │   │   ├── proveedores.js
│   │   │   │   ├── clientes.js
│   │   │   │   ├── pedidos-web.js    ← T4: pedidos de la tienda (WhatsApp y cierre)
│   │   │   │   ├── caja.js
│   │   │   │   ├── gastos.js
│   │   │   │   ├── reportes.js
│   │   │   │   ├── configuracion.js
│   │   │   │   └── login.js
│   │   │   └── herramientas/
│   │   │       └── renombrar-archivos.js ← Tool: File System Access API
│   │   └── img/
│   │       ├── icon.svg           ← Icono PWA
│   │       ├── icon-192x192.png   ← Icono Android 192px
│   │       └── icon-512x512.png   ← Icono Android 512px
│   │
│   └── store/                     ← Módulo Tienda Virtual
│       ├── index.html
│       ├── carrito.html
│       ├── checkout.html
│       ├── producto.html
│       ├── sobre-nosotros.html
│       ├── terminos-condiciones.html
│       ├── politica-privacidad.html
│       ├── preguntas-frecuentes.html
│       ├── factura-print.html
│       ├── service-worker.js     ← Store SW (outletshop-YYYYMMDD-NN)
│       ├── manifest.json
│       ├── css/
│       │   └── estilo.css
│       ├── js/
│       │   ├── compartido/
│       │   │   ├── navbar-store.js
│       │   │   ├── footer-store.js
│       │   │   ├── card-producto.js
│       │   │   ├── colombia.js
│       │   │   └── supabase-client.js
│       │   ├── api/
│       │   │   ├── productos.js
│       │   │   ├── categorias.js
│       │   │   └── supabase-client.js
│       │   └── paginas/
│       │       ├── inicio.js
│       │       ├── producto.js
│       │       ├── carrito.js
│       │       └── checkout.js
│       └── img/
│           ├── icon.svg
│           ├── icon2.svg
│           └── EquipoOutletShop.jpg
│
├── tests/                         ← Suite de tests (vitest + jsdom)
│   ├── setup.js                   ← Setup global con mocks
│   ├── compartido/
│   │   ├── database.test.js       ← 59 tests (DB entidades)
│   │   └── auth.test.js           ← 8 tests (permisos)
│   ├── calculos/
│   │   ├── compras.test.js        ← 12 tests
│   │   ├── caja.test.js           ← 10 tests
│   │   └── productos.test.js      ← 10 tests
│   ├── helpers/
│   │   └── calculos-pos.js        ← Funciones puras (IVA, descuento, formato)
│   ├── pos/                       ← Tests de pedidos web del POS (node --test, NO vitest)
│   │   ├── pedidos-web.test.mjs   ← T4: DB.pedidosWeb, aviso, pagina y script 18 (23 casos)
│   │   └── pedidos-web-ui.test.mjs← T4: tarjetas colapsables y colores (6 casos)
│   └── store/                     ← Tests de la tienda (node --test, NO vitest)
│       ├── _entorno.mjs           ← Utilidades: navegador y Supabase simulados (no es test)
│       ├── store-t1.test.mjs      ← T1: variantes en carrito y pedido
│       ├── store-t2.test.mjs      ← T2: st_crear_pedido, celular, precios vigentes, scripts 15/16/03
│       ├── store-t3a.test.mjs     ← T3a: WhatsApp en la ficha, paginacion por visita
│       ├── store-t3b.test.mjs     ← T3b: envio por zona, minimo, medios de pago, confirmacion, script 17
│       └── ambiente.test.mjs      ← ST-29: la tienda apunta al mismo proyecto que POS/WMS y usa llave anon
│
├── .opencode/                     ← Skills para OpenCode CLI
│   └── skills/
│       ├── deploy-to-vercel/
│       ├── improve-codebase-architecture/
│       ├── kubit-codex/
│       ├── kubit-pos/
│       ├── kubit-store/
│       ├── kubit-ui/
│       ├── requesting-code-review/
│       ├── supabase-postgres-best-practices/
│       └── tdd/
│
├── .claude/                       ← Skills para Claude Code (mismos que .opencode)
│   └── skills/
│       └── ...
│
├── supabase/                      ← Configuración de Supabase
│   └── config.toml               ← Proyecto Supabase local
│
├── vitest.config.js               ← Configuración de vitest
└── package.json                   ← Dependencias (vitest, jsdom)
```

## 2. Principios Arquitectónicos

### 2.1 Zero-Framework Frontend
- Sin React, Vue, Angular ni SPA frameworks
- HTML semántico + Tailwind CSS (via CDN) + JavaScript vanilla
- Cada página es un HTML standalone con su propio JS IIFE
- Navegación tradicional (links `<a href>`, no router)

### 2.2 DatabaseService (database.js)
- Único punto de acceso a datos para todo el POS
- Patrón: IIFE que expone `window.DB` con métodos entity-specific
- Caché en memoria con `Map` (30s default)
- CRUD genérico: `select()`, `insert()`, `update()`, `softDelete()`
- Paginación y búsqueda integradas

### 2.3 Autenticación (auth.js)
- `window.KubitAuth` — objeto global con sesión, permisos, usuario activo
- Flujo: login → cargarSesion → aplicarRestriccionesUI
- Permisos basados en roles (RBAC) con patron `modulo.recurso.accion`
- Admin bypass: retorna `true` siempre

### 2.4 Spec-Driven Development
- `specs/` es la fuente de verdad. Todo cambio debe documentarse primero en specs
- `AGENTS.md` es la memoria ejecutiva (decisiones, keywords, changelog)
- Las skills `.opencode/skills/` y `.claude/skills/` contienen instrucciones especializadas

### 2.5 Capa de Datos: REST Directa vs Edge Functions
- POS: 100% REST API directa a Supabase (PostgREST) via `supabase.js`
- Store: lectura del catalogo por REST directa via `apps/store/js/api/supabase-client.js`; **pedidos solo por la funcion `st_crear_pedido`** (RPC `security definer`, una transaccion) desde T2. Envio y configuracion por `st_cotizar_envio` y `st_config_tienda` (T3b). Ver `specs/11-api-contracts.md` §9
- POS, pedidos web (T4): `DB.pedidosWeb` llama funciones `security definer` (`pos_pedido*_web_*`, `specs/18-pos-pedidos-web.sql`); el POS no lee `st_pedidos` ni `st_direcciones` directo. Ver `specs/11-api-contracts.md` §10
- Sin Edge Functions en producción. ~~El checkout usa 7 operaciones REST secuenciales~~ (obsoleto desde T2, 2026-11-03)

### 2.6 Testing
- vitest + jsdom para tests unitarios y de integración
- POS: 119 tests en 5 suites de Vitest (`npm test`, solo `tests/**/*.test.js`)
- Tienda: 111 casos en `tests/store/*.test.mjs` con `node --test` (sin dependencias, `node:test` + `node:vm`; no tocan la base; los scripts SQL se validan como texto)
- POS pedidos web (T4): 29 casos en `tests/pos/*.test.mjs` con `node --test` (mismo estilo que `tests/store`)
- Zona horaria: America/Bogota (UTC-5) via `ALTER DATABASE SET timezone`
- Mocks de `window.__supabase`, `window.KubitAuth`, `localStorage` en `tests/setup.js`

## 3. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + Tailwind CSS (CDN) + JS vanilla (IIFE) |
| Backend/Database | PostgreSQL 15+ via Supabase (plan gratuito) |
| API | Supabase Data API (PostgREST) |
| Auth | Supabase Auth (email/password) |
| Hosting | Vercel (plan gratuito) |
| Testing | vitest + jsdom |
| PWA | manifest.json + service-worker.js |
| Imágenes | URLs en DB, contenido en repositorio separado GitHub |
