# Kubit-WMS — Artefactos SDD (Ralph Loop)

Artefactos de **Spec-Driven Development** con estructura **Ralph Loop** para desarrollar el módulo `apps/wms` de Kubit, **alineados al stack real** del proyecto (HTML + Tailwind CDN + JS vanilla + Supabase).

## ¿Qué es Ralph Loop?
Un agente de IA corre en **bucle**; en cada iteración lee `PROMPT.md`, toma **una** tarea de `memory/fix_plan.md`, la implementa, la prueba y registra el avance. La especificación (SDD) es la fuente de verdad.

## Estructura
```
wms-sdd/
├── PROMPT.md              # Instrucción por iteración (NO commit automático)
├── AGENTS.md             # Complemento del AGENTS.md raíz de Kubit (stack real)
├── ralph.sh              # Orquestador del bucle
├── README.md
├── memory/
│   ├── constitution.md  # Principios NO negociables (incluye reglas raíz)
│   ├── fix_plan.md      # Cola priorizada que consume el bucle
│   └── progress.md      # Bitácora de avance
└── specs/
    ├── spec.md          # QUÉ/POR QUÉ (8 historias + criterios)
    ├── plan.md          # CÓMO (stack Kubit real, estructura, .rpc())
    └── tasks.md         # Backlog atómico (T-0xx…T-5xx)
```
> La spec funcional completa vive en `06-wms-spec.md` (v5) y debe ir en `/specs/` del monorepo.

## Stack (confirmado en el AGENTS.md raíz de Kubit — no reabrir)
- **Frontend:** HTML + **Tailwind (CDN)** + **JavaScript vanilla** (IIFE por página). Sin SPA, sin TypeScript, sin build.
- **DB/API:** Supabase (PostgreSQL) + PostgREST; transacciones vía **funciones Postgres `.rpc()`**.
- **DB decisiones:** UUID v4, `timestamptz`, trigger `update_updated_at()`, `deleted_at`, **estados con CHECK strings (no ENUMs)**, RLS + grants, FK indexadas.
- **UI:** ultra-minimalista **Slate**, **modo oscuro por defecto**, mobile-first ≥360px.
- **PWA:** `manifest.json` + `service-worker.js`. **Hosting:** Vercel gratuito. **Sin commits automáticos.**

## Cómo se usa
1. Coloca `06-wms-spec.md` y `07-wms-schema.sql` en `/specs/`, y estos artefactos donde gestiones el bucle (p.ej. `.ralph/`).
2. Ajusta `ralph.sh`: `AGENT_CMD` a tu CLI (`claude -p`, `codex exec`, `opencode run`).
3. Ejecuta:
   ```bash
   chmod +x ralph.sh
   ./ralph.sh 30
   ```
4. Servir local (Windows): `npx http-server apps/wms -p 3000` (evita `npx serve`).
5. Supervisa `memory/progress.md` y `specs/tasks.md`. **Los cambios quedan sin commit** hasta que tú lo pidas.

## Orden de construcción (resumen de tasks.md)
1. **Épica 0** Estructura `apps/wms` (HTML base Slate/dark, config.js, PWA).
2. **Épica 1** `07-wms-schema.sql`: tablas `wms_*` + CHECK + índices + trigger + RLS + grants.
3. **Épica 2** Dominio JS: `codigos.js`, `stock.js`, `reconciliacion.js` + pruebas.
4. **Épica 3** Funciones `.rpc()` atómicas (recibir, ubicar, reservar, despachar, liberar, trasladar, ajustar, baja).
5. **Épica 4** `database.js` (DB.wms.*) + pantallas HTML/JS.
6. **Épica 5** Endurecimiento (idempotencia, atomicidad, invariante, PWA offline).

## Principios que nunca se rompen (constitution.md)
- **Cero suposiciones** (si falta spec, preguntar).
- **POS** = fuente de verdad del stock; `SIN_UBICAR` es estado lógico.
- **Atomicidad + idempotencia** en toda operación de stock.
- **Invariante de reconciliación** verificado tras cada cambio.
- Códigos **numéricos de 5 dígitos** `B CC PP`.
- **Sin commits automáticos**; planes **gratuitos** de Supabase/Vercel.
