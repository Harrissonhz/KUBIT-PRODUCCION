# fix_plan.md — Cola de trabajo priorizada

> Se toma la **primera tarea pendiente** de arriba hacia abajo. Sincronizado con `specs/tasks.md`.
> Estados: `[ ]` pendiente · `[x]` hecho · `[~]` implementado, falta prueba · `[!]` bloqueado o diferido.
> Ultima actualizacion: 2026-10-07 (listo para produccion, plan v6).

## Ya completado
- [x] Base de datos en pruebas: `08`, `09` v2, `11`, `10` y `12` (registro en `despliegue-produccion.md` §1.4).
- [x] **Fases A, B y C cerradas** (2026-10-01, 2026-10-02, 2026-10-06).
- [x] Fase 0 de produccion: 0.1, 0.2, 0.4, 0.6 (`12` verificado), 0.3 (prechequeo), tipos de producto.

## Prioridad 1 — Despliegue a produccion (guia `produccion/GUIA-DIA-DESPLIEGUE.md`)

| Paso | Tarea | Estado |
|---|---|---|
| Prechequeo v2 en produccion (R-P1) | T-431 | [x] 2026-10-07 |
| `12` verificado en pruebas (R-P10) | T-316, T-433, T-437 | [x] 2026-10-06 |
| Tipos de producto en el POS (R-P14) | T-438 | [x] 2026-10-07 |
| **A1** Ignored Build Step en POS y Tienda (R-P12) | T-435 | [ ] |
| **A2** Copiar los 5 scripts a `specs/` del repo de produccion y comparar con pruebas | T-439 | [ ] |
| **A3** `apps/wms` en el repo de produccion con `config.js` de produccion | T-439 | [ ] |
| **Ventana** P1–P6 (fecha la define el usuario) | T-434 | [ ] |

Valores de referencia (2026-10-07): volumen a cargar **146 / 1.385**; FOTO **401 · 198.192 · 1.231 · 653** (cambiaran con las ventas; en la ventana se toman de nuevo).

## Prioridad 2 — Despues del despliegue
- [ ] **T-522** Exclusion por tipo: el WMS debe gestionar solo `Fisico` o sin tipo (Art. 13), no "todo menos Digital" (R-P15).
- [ ] RC2 / T-521 Igualar el WMS al POS cuando no hay movimiento que explique la diferencia (pendiente de decision).
- [!] T-515 Validacion SQL de ventas anuladas — bloqueado por el bug de anulacion del POS (DP5).
- [!] T-305 `wms_liberar()` — anulacion/edicion de ventas (D2).

## Prioridad 3 — Dominio verificable y endurecimiento
- [ ] T-201 / T-202 / T-203 · [ ] T-309 · [ ] T-501 a T-520 · [ ] T-412 · [ ] T-516 · [ ] T-519

## Decisiones
- [x] **B1/B2 · C1 · P1/P2 · U1 · V1 · Z1 · DB1/DB2 · T1/T2/T3 · PN1/PN2 · DP1** — 2026-10-01/02.
- [x] **CR1** El WMS solo lee `pos_*` y `st_*` (usuario) — 2026-10-02. **CR2 · CR3 · AJ1 · IN1/IN2/IN3 · DP2 · RC1** — 2026-10-06.
- [x] **DP3** Permisos cerrados con el `12` — 2026-10-06.
- [x] **DP4** Mismo repositorio: Ignored Build Step + commit solo de `apps/wms` y los 5 scripts — 2026-10-06.
- [x] **DP5** T-515 bloqueado hasta corregir el bug de anulacion del POS; R-P4 aceptado — 2026-10-06.
- [x] **DP6** `Domi01` (domicilio) como `Digital`: fuera del WMS y oculto en la Tienda, lo cual es deseado (usuario) — 2026-10-07.
- [x] **DP7** No hacer en produccion ventas de prueba para anularlas mientras D2 este pendiente — 2026-10-07.
- [ ] **RC2** Igualar el WMS al POS sin movimiento que lo explique (T-521). Pendiente.

## Riesgos abiertos
- **R-B1 / R-P4** Venta anulada despachable: mitigado en pantalla (T-515 bloqueado).
- **R-P6** Auditoria: 2 de 3 usuarios del POS con id distinto al de Auth → `created_by` vacio en operaciones de stock.
- **R-P9** Produccion nunca registro merma ni ajuste +.
- **R-P11** Borrado del movimiento en la recepcion de compras del POS (informativo).
- **R-P12** Mismo repositorio en Vercel (A1 pendiente).
- **R-P15** El WMS excluye solo `Digital`; un tipo nuevo entraria al WMS (T-522).
- **R-C1** Doble paso (CR1). **R-C2** Sesgo del conteo (IN3). **R-C3** Diferencias sin movimiento (T-521).
- Cerrados: R-P1, R-P2, R-P10, R-P13, R-P14.

## Incidentes
- **I-1 (2026-10-06):** el `10` no se habia ejecutado en pruebas. Sin impacto en el POS. Lecciones en `despliegue-produccion.md` §11.

## Trabajo nuevo detectado
### En el WMS
1. Sesion de ~1 hora sin renovacion (T-507). 2. Busqueda por codigo de barras parcial. 3. Contenedores creados por error sin borrado (T-509). 4. Dos `config.js` (credenciales vs pantalla). 5. Cascada de activar/desactivar no atomica (T-510). 6. Mover una caja de entrepano cambia su codigo. 7. Editar bodegas (T-511). 8. Validacion de codigos repetida (T-201). 9. Reversiones por OneDrive: revisar cabeceras; las casillas `[x]` se pierden al abrir los `.md` desde OneDrive. 10. Despacho parcial (T-512). 11. Hora "Sincronizado" de Buscar y Ubicar (T-514). 12. Ventas del mismo minuto: desempate por numero. 13. Reservado en el origen. 14. Totales del Panel en el navegador (T-517). 15. Contenedores de pruebas no se migran. 16. Salida de un solo origen (T-518). 17. Sobrante leido de la observacion (T-520). 18. Diferencias sin movimiento (T-521). 19. Si se agrega un objeto `wms_*`, volver a ejecutar el `12`. 20. **(2026-10-07)** Exclusion por tipo (T-522).

### Fuera del WMS (en el POS y la Tienda)
1. Ventas nuevas sin referencia (el WMS lo resuelve con el motivo, D6). 2. Numeracion de ventas en pruebas. 3. Bug de Editar venta. 4. Anulacion sin movimiento (`entrada_anulacion`, bloquea T-515). 5. KPI "Ventas Brutas" inflado. 6. Averias y sobrantes dependen de merma y ajustes ± (R-P9). 7. **(2026-10-07)** 16 `entrada_compra` con referencia `V-…` en produccion (posibles devoluciones registradas como compra). 8. **(2026-10-07)** La Tienda oculta los productos `Digital` del catalogo (`apps/store/js/api/productos.js`).

## BLOQUEOS
- Ninguno. Pendientes: A1 (recomendado), A2–A3 y la fecha de la ventana.
