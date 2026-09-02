# AGENTS.md — Instrucciones del agente para el módulo WMS (Kubit)

> **IMPORTANTE:** Este archivo COMPLEMENTA el `AGENTS.md` raíz de Kubit; NO lo reemplaza.
> El agente debe leer PRIMERO el `AGENTS.md` (y `CLAUDE.md`) de la raíz del monorepo y respetar todas sus reglas. Aquí solo se añade lo específico del módulo `apps/wms`.

## 0. Reglas heredadas de la raíz (recordatorio — la fuente es el AGENTS.md raíz)
- **1.1 Cero Suposiciones:** ante cualquier duda o spec faltante, **PREGUNTAR** al usuario. Nunca inventar lógica, estructuras, tecnologías, nombres de archivos ni endpoints. Si no está en `/specs/`, se consulta.
- **1.2 No asumir pago:** todo debe funcionar en planes **gratuitos** de Supabase y Vercel. Sin add-ons de pago ni servicios externos sin autorización.
- **1.3 Responsive obligatorio:** mobile-first, **mínimo 360px**. Usar estrictamente las clases Tailwind de `05-ui-ux-system.md`.
- **1.4 Sin commits automáticos:** la IA **NUNCA** hace `git commit`/`git push` salvo que el usuario lo pida explícitamente ("commitea", "pushea", "sincroniza"). Todo queda en el working directory.

## 1. Stack tecnológico (confirmado en Kubit — NO reabrir)
| Capa | Tecnología |
|---|---|
| **Frontend** | HTML semántico + **Tailwind CSS vía CDN** + **JavaScript vanilla (IIFE por página)**. Sin React/Vue/Angular. Navegación tradicional (`<a href>`, no router). |
| **Backend/DB** | PostgreSQL 15+ vía **Supabase** (plan gratuito). Cliente `supabase-js` directo. **Sin ORMs.** |
| **API** | Supabase Data API (**PostgREST**) — REST directa. Lógica transaccional → funciones Postgres `.rpc()`. **Sin Edge Functions en producción** (patrón POS/Store). |
| **Auth** | Supabase Auth (email/password). Reutiliza `window.KubitAuth`. |
| **Multimedia** | URLs en DB; archivos en repo GitHub aparte. **No** Supabase Storage. |
| **Hosting** | Vercel (plan gratuito). |
| **PWA** | `manifest.json` + `service-worker.js`. |
| **Testing** | **vitest + jsdom** (patrón del repo). |

## 2. Comandos (no hay build de framework)
- **Servir local (Windows):** `npx http-server apps/wms -p 3000` (evitar `npx serve`: rompe query params).
- **Tests:** `npm test` (vitest + jsdom), siguiendo el patrón `tests/…/*.test.js` y la skill `tdd` (red-green-refactor).
- **Deploy:** Vercel (skill `deploy-to-vercel`). Solo si el usuario lo pide.

## 3. Estructura del módulo (coherente con ARCHITECTURE.md del monorepo)
```
/specs/07-wms-spec.md          ← Especificación del WMS (fuente de verdad)
/specs/08-wms-schema.sql       ← DDL de tablas wms_* (sigue el patrón de 02-database-schema.sql)
/apps/wms/                     ← Código del módulo (HTML + JS vanilla + Tailwind CDN)
   ├── index.html / *.html     ← Pantallas standalone (cada una con su JS IIFE)
   ├── vercel.json             ← rewrites (patrón POS)
   ├── manifest.json
   ├── service-worker.js       ← cache-first (wms-YYYYMMDD-NN)
   ├── css/estilo.css
   └── js/
       ├── config.js           ← credenciales Supabase (QA)
       ├── supabase.js         ← cliente REST
       ├── compartido/
       │   ├── database.js     ← DatabaseService: window.DB.wms.* (CRUD + .rpc())
       │   ├── auth.js         ← window.KubitAuth
       │   └── sidebar.js
       └── paginas/*.js        ← lógica por pantalla (IIFE)
/tests/wms/…                   ← pruebas *.test.js (vitest + jsdom)
```

## 4. Convenciones de datos (decisiones "No Reabrir" de Kubit)
- **Prefijo de tablas:** `wms_` (nuevo módulo, junto a `pos_*`, `st_*`). Esquema único `public`.
- **PK:** UUID v4 (`gen_random_uuid()`).
- **Timestamps:** `timestamptz` con default `now()`; `updated_at` vía trigger `update_updated_at()`.
- **Soft delete:** `deleted_at` nullable.
- **Estados:** **CHECK constraints con strings** (NO ENUMs de PostgreSQL).
- **RLS:** habilitado en todas las tablas, políticas por rol.
- **Grants:** explícitos por tabla (`anon`, `authenticated`, `service_role`).
- **Índices:** todas las FK indexadas.
- **Auditoría:** `created_by`/`updated_by` → `pos_usuarios`.
- **Zona horaria:** America/Bogota (UTC-5).

## 5. Convenciones de UI (05-ui-ux-system.md)
- **Ultra-minimalista, monocromático Slate** (Tailwind). **Modo oscuro por defecto** (`class="dark"` en `<html>` + anti-flash).
- Header fijo `fixed top-0` con `pt-16` de compensación; patrón de sidebar como POS.
- Sección de usuario centralizada (`auth.js::poblarUserHeader()` con IDs `user-avatar`, `user-name`, `user-rol`).
- PWA: service worker con rutas relativas, cache-first + fallback network, versioning `wms-YYYYMMDD-NN`, bypass en localhost, `ignoreSearch:true`.

## 6. Skills a usar (cuando apliquen)
- `supabase-postgres-best-practices`, `kubit-codex` (10-codex.md), `kubit-ui` (05-ui-ux-system.md), `tdd`, `requesting-code-review`, `deploy-to-vercel`.

## 7. Qué NO hacer
- No introducir frameworks SPA, TypeScript, ni build steps.
- No usar Supabase Storage ni Edge Functions en producción ni servicios de pago.
- No hacer commits sin petición explícita.
- No implementar features fuera del MVP (FIFO/FEFO, capacidad, devoluciones formales, triggers de sync, multiusuario operativo).
- No inventar catálogo: los productos viven en `pos_*`; el WMS solo referencia `producto_detalle_id`.
