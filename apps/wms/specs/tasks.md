# tasks.md — Backlog ejecutable Kubit-WMS (MVP)

> Lista ordenada y atomica. Se toma **una tarea por iteracion**, se implementa, se prueba y se marca.
> Estados: `[ ]` pendiente · `[x]` hecho · `[~]` implementado, falta prueba · `[!]` bloqueado o diferido.
> Ultima actualizacion: 2026-10-07 (listo para produccion, plan v6).

## Epica 0 — Estructura del modulo (sin build) — ✅ Fase A
- [x] T-001 `index.html` redirige a `login.html`; diagnostico en `diagnostico.html`.
- [x] T-002 `js/config.js` (pruebas) + `js/supabase.js` (copia exacta del POS).
- [x] T-003 `js/compartido/auth.js`: copia sin cambios del POS.
- [x] T-004 `manifest.json` + `service-worker.js` + `.vercelignore`. Cache vigente: `kubit-wms-20261006-02`.
- [x] T-005 `layout.js` + `css/wms.css`. Todo el menu disponible desde C3.
- [x] T-006 `login.html` + `login.js`. Destino tras el login: Buscar (PN1).
- [x] T-007 `css/estilo.css`: copia sin cambios del POS.
- [x] T-008 Buscar provisional (reemplazado en A5).
- [x] T-009 `diagnostico.html` (v2 con chequeo de permisos, T-437).

## Epica 1 — Modelo de datos (`08-wms-schema.sql`) — ejecutado en pruebas 2026-09-28
- [x] T-101 a T-109.

## Epica 2 — Dominio: codigos y estados (JS vanilla + pruebas)
- [ ] T-201 `js/codigos.js`: validador `B CC PP` + prueba.
- [ ] T-202 `js/stock.js`: transiciones de `estado_fase` + prueba.
- [ ] T-203 `js/reconciliacion.js` (dominio) + prueba.

## Epica 3 — Funciones Postgres
- [x] T-300 `wms_inicializar()`. · [x] T-301 Recepcion de compras. · [x] T-302 `wms_ubicar()`. · [x] T-303 Reserva de ventas. · [x] T-304 `wms_despachar()`.
- [!] T-305 `wms_liberar()` — diferida (D2).
- [x] T-306 `wms_trasladar()`.
- [x] ~~T-307 `wms_ajustar()`~~ y ~~T-308 `wms_dar_baja()`~~ — eliminadas en `10` (CR1).
- [~] T-309 Invariante: verificado manualmente; falta prueba automatica.
- [x] T-310 `wms_registrar_conteo()` (CR3). · [x] T-311 `wms_resolver_decremento()` (CR2). · [x] T-312 Vistas. · [x] T-313 Digitales (D5) y referencias (D6).
- [x] T-314 `10-wms-solo-lectura.sql` — pruebas 2026-10-06 (I-1).
- [x] T-315 `11-wms-conteo-sobrante.sql` — pruebas 2026-10-06.
- [x] **T-316 `12-wms-permisos.sql`** — pruebas 2026-10-06: G = 0, H = 0, I = 6 sin anon, J = 0, A = 0, B = 0, C = 19; escritura directa → 403.

## Epica 4 — Capa de datos + pantallas
- [x] Fase A (2026-10-01) · [x] Fase B (2026-10-02) · [x] Fase C (2026-10-06): T-440 a T-444.
- Mejoras opcionales: [ ] T-412 enlace Ubicar desde Buscar · [ ] T-516 enlace Trasladar · [ ] T-519 enlace Contar.
- Reglas: navegacion (`disponible: true` + `ASSETS`), formato V1, fechas Z1, solo lectura CR1, verificacion I-1.

## Epica 6 — Paso a produccion (documento vivo)
- [~] **T-430** `despliegue-produccion.md` **v6** + `produccion/GUIA-DIA-DESPLIEGUE.md` + `P1-prechequeo.sql` v2 + `P9-rollback.sql` v2.
- [x] T-431 Prechequeo v2 en produccion — 2026-10-07, sin bloqueantes.
- [x] T-432 Sin `DELETE` fisico de productos ni usuarios (R-P2) — 2026-10-06.
- [x] T-433 Permisos (R-P3) — `12` verificado en pruebas 2026-10-06.
- [ ] **T-434** Ejecutar la ventana P1–P6 (fecha la define el usuario).
- [ ] **T-435** A1: Ignored Build Step `git diff HEAD^ HEAD --quiet -- .` en los proyectos POS y Tienda (R-P12).
- [x] T-436 El `08` no modifica el POS (R-P13) — 2026-10-06.
- [x] T-437 `diagnostico.html` v2 — verificado 2026-10-06.
- [x] **T-438** Tipos de producto en el POS de produccion (R-P14, hecho por el usuario) — 2026-10-07: 0 productos sin tipo con stock; `Domi01` = `Digital` (DP6). Volumen: 146 / 1.385.
- [ ] **T-439** A2–A3: 5 scripts en `specs/` del repo de produccion (comparados con pruebas) y `apps/wms` con `config.js` de produccion, sin commit.

## Epica 5 — Endurecimiento
- [ ] T-501 Idempotencia end-to-end · [ ] T-502 Atomicidad · [ ] T-503 PWA offline · [ ] T-504 Invariante en todos los flujos.
- [~] T-505 Documentacion (`07` v11, constitucion); falta README.
- [ ] T-506 Permisos `wms.*` en `pos_permisos` · [ ] T-507 Renovacion de sesion · [ ] T-508 Prueba automatica de `database.js`.
- [ ] T-509 Borrar contenedores · [ ] T-510 Cascada atomica · [ ] T-511 Editar bodegas · [ ] T-514 Hora "Sincronizado" en Bogota.
- [!] T-515 Validar en SQL ventas anuladas — bloqueado (DP5).
- [ ] T-517 Totales del Panel en SQL · [ ] T-518 Salida desde varios contenedores · [ ] T-520 Sobrante en columna propia.
- [ ] T-521 Igualar el WMS al POS sin movimiento que lo explique (RC2, pendiente de decision).
- [ ] **T-522** Exclusion por tipo segun el Art. 13: el WMS gestiona solo `Fisico` o sin tipo (hoy: "todo menos `Digital`"). Script nuevo sobre funciones y vistas `wms_*`, `database.js` y prechequeo. Probar en pruebas antes de produccion (R-P15).
- [ ] T-512 Despacho parcial (fuera del MVP, DB1).

## Definicion de Hecho (global)
Codigo o SQL + prueba; responsive/paleta OK si es UI; `tasks.md` / `fix_plan.md` / `progress.md` actualizados; `despliegue-produccion.md` si cambia base de datos, frontend o decisiones (con §1.4 verificado); A y B = 0; sin commit salvo peticion; listar el zip antes de entregarlo (`-v2` si se corrige); revisar cabeceras antes de cada commit.
