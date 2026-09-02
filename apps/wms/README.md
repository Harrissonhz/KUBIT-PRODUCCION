# Kubit-WMS — Artefactos SDD (Ralph Loop)

Este paquete contiene los artefactos de **Spec-Driven Development** con estructura **Ralph Loop** para arrancar el desarrollo del módulo `apps/wms` del ecosistema Kubit.

## ¿Qué es esto?
Ralph Loop es una técnica de desarrollo agéntico: un agente de IA se ejecuta en **bucle**, y en cada iteración lee un `PROMPT.md`, toma **una** tarea de una cola priorizada (`fix_plan.md`), la implementa, la prueba y registra el avance. La especificación (SDD) es la fuente de verdad de la que todo se deriva.

## Estructura
```
wms-sdd/
├── PROMPT.md              # Instrucción que el agente lee en CADA iteración
├── AGENTS.md             # Convenciones permanentes del proyecto
├── ralph.sh              # Orquestador del bucle (invoca al agente N veces)
├── README.md            # Este archivo
├── memory/
│   ├── constitution.md  # Principios NO negociables (reglas de oro)
│   ├── fix_plan.md      # Cola de trabajo priorizada (lo que consume el bucle)
│   └── progress.md      # Bitácora de avance (una entrada por iteración)
└── specs/
    ├── spec.md          # QUÉ y POR QUÉ (historias + criterios de aceptación)
    ├── plan.md          # CÓMO (arquitectura, stack, estructura, RPCs)
    └── tasks.md         # Backlog atómico (épicas T-0xx … T-5xx)
```

## Cómo se usa (flujo recomendado)
1. **Coloca estos archivos en la raíz de `apps/wms`** (o en un `.ralph/` dentro del repo).
2. Ajusta `ralph.sh`: variable `AGENT_CMD` a tu CLI (`claude -p`, `codex exec`, etc.).
3. Revisa/edita `memory/constitution.md` y `specs/*` si quieres afinar algo.
4. Ejecuta el bucle:
   ```bash
   chmod +x ralph.sh
   ./ralph.sh 30        # hasta 30 iteraciones (o hasta agotar fix_plan.md)
   ```
5. Cada iteración: el agente implementa una tarea, corre `lint`+`test`, marca `[x]` y hace commit.
6. Supervisa `memory/progress.md` y `specs/tasks.md` para ver el avance.

## Orden de construcción (resumen de tasks.md)
1. **Épica 0** Scaffolding + infra (Next.js, Supabase, Vitest, PWA).
2. **Épica 1** Migraciones de tablas `wms_*` + índices + RLS.
3. **Épica 2** Dominio verificable: códigos `B CC PP`, máquina de estados, reconciliación.
4. **Épica 3** RPCs atómicas (recibir, ubicar, reservar, despachar, liberar, trasladar, ajustar, baja).
5. **Épica 4** Pantallas mobile-first.
6. **Épica 5** Endurecimiento (idempotencia, atomicidad, invariante, PWA offline).

## Principios que nunca se rompen (ver constitution.md)
- El **POS** es la fuente de verdad del stock.
- `SIN_UBICAR` es un **estado lógico**, no una ubicación física.
- **Atomicidad + idempotencia** en toda operación de stock.
- **Invariante de reconciliación** verificado tras cada cambio.
- Códigos **numéricos de 5 dígitos** `B CC PP`.

## Referencia
La especificación funcional completa está en `06-wms-spec.md` (v5).
