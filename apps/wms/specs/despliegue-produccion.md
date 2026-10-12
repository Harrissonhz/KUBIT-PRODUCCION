# Plan de despliegue a produccion — Kubit-WMS (documento vivo)

> **Tarea T-430.** Se actualiza **cada vez** que un paso agrega o cambia un objeto de base de datos, un archivo del frontend o una decision que afecte el paso a produccion.
> Ultima actualizacion: 2026-10-07 (fase 0 cerrada salvo A1) · Version del plan: **6**
> Ubicacion: `apps/wms/specs/despliegue-produccion.md` (no se publica: `.vercelignore` excluye `specs/`).
> Documentos de apoyo en `apps/wms/specs/produccion/`: **`GUIA-DIA-DESPLIEGUE.md`** (paso a paso operativo), `P1-prechequeo.sql` (v2, solo lectura) y `P9-rollback.sql` (v2).

---

## 0. Principios (no negociables)
1. **El WMS solo lee `pos_*` y `st_*` (CR1).** Verificado con las consultas A y B.
2. **Despliegue aditivo:** solo crea objetos `wms_*` / `wms_v_*` / `_wms_*` y cambia **sus** permisos. No modifica funciones, tablas, politicas, permisos ni codigo del POS o la Tienda.
3. **Primero se verifica, despues se ejecuta.**
4. **Verificar despues de CADA script** (incidente I-1).
5. **Solo va a produccion lo registrado como verificado en pruebas** (§1.4).
6. **Respaldo** antes de tocar la base de produccion.
7. **Ventana sin ventas** (unos 60 minutos; fecha la define el usuario).
8. **Rollback** siempre disponible, solo sobre objetos `wms_*`.
9. El `apps/wms/js/config.js` de pruebas **nunca** va a produccion.
10. **Mismos scripts que en pruebas**, completos, en el orden de §1.1.
11. **El commit de produccion solo incluye `apps/wms/` y los 5 scripts** (nunca `git add .`).
12. **No hacer ventas de prueba para anularlas** en produccion mientras D2 este pendiente: dejan una reserva bloqueada y una diferencia que el WMS no puede corregir.

| Ambiente | Proyecto Supabase | Repositorio | Vercel WMS |
|---|---|---|---|
| Pruebas | `gbjtdjbopwgbknklwldq` | `KUBIT-Pruebas` | `kubit-pruebas-wms` ✅ |
| Produccion | `gxqcybboiskwznxdioun` | Repositorio de produccion (mismo para POS, Tienda y WMS; tiene `specs/`) | **por crear** (sugerido: `kubit-wms`) |

---

## 1. Inventario de lo que se despliega

### 1.1 Base de datos (orden obligatorio)
| # | Archivo | Que crea / cambia | Escribe en `pos_*`/`st_*` | Verificacion |
|---|---|---|---|---|
| 1 | `08-wms-schema.sql` | Tablas, indices, triggers (usan `update_updated_at()` **sin redefinirla**), RLS, seed bodegas 1–3, `wms_v_reconciliacion` | No (FK hacia `pos_usuarios` y `pos_productos_detalle`) | V-08 |
| 2 | `09-wms-functions.sql` v2 | `wms_pos_linea_base`, funciones, vistas | **Transitoriamente si**; el `10` va de inmediato | V-09 |
| 3 | `10-wms-solo-lectura.sql` | CR1, CR2, CR3 | No | V-10 |
| 4 | `11-wms-conteo-sobrante.sql` | `wms_cerrar_sobrante` | No | V-11 |
| 5 | `12-wms-permisos.sql` | Sin acceso `anon`; stock solo lectura para `authenticated` | No | V-12 |
| 6 | `wms_inicializar()` | Stock fisico como `SIN_UBICAR` + linea base | No (solo lee) | V-INI |

### 1.2 Frontend
Toda la carpeta `apps/wms/` **excepto** `js/config.js` de pruebas, que se reemplaza por uno de produccion (URL y anon key de `gxqcybboiskwznxdioun`, `supabaseServiceKey` vacio). `memory/`, `specs/` y los `.md` pueden ir al repositorio; `.vercelignore` evita publicarlos. Ubicacion: mismo prefijo que el Root Directory del POS en Vercel (ej. `Kubit-Produccion/apps/wms`).

### 1.3 Cambios fuera de `apps/wms`
- **Codigo del POS y la Tienda:** ninguno.
- **Vercel:** Ignored Build Step en los proyectos POS y Tienda (A1).
- **Datos del POS hechos por el usuario (no por el WMS), 2026-10-07:** los productos sin tipo con stock se marcaron `Fisico`; `Domi01` (domicilio) se marco `Digital` (queda fuera del WMS y oculto en la Tienda, lo cual es deseado: la Tienda cobra el envio en otro campo).

### 1.4 Registro de scripts por ambiente (solo con verificacion confirmada)
| Script | Pruebas: fecha | Pruebas: verificacion | Produccion |
|---|---|---|---|
| `08-wms-schema.sql` | 2026-09-28 | 3 bodegas | — |
| `09-wms-functions.sql` v2 | 2026-09-29 | Flujo compra → reserva → despacho | — |
| `wms_inicializar()` | 2026-09-29 | 135 SKUs, 1.034 unidades, reconciliacion vacia | — |
| `11-wms-conteo-sobrante.sql` | 2026-10-06 | Ejecutado antes del `10` (I-1) | — |
| `10-wms-solo-lectura.sql` | 2026-10-06 | A = 0, B = 0, C = 19, `version_c0 = true`, F = 0 | — |
| `12-wms-permisos.sql` | **2026-10-06** | G = 0, H = 0, I = 6 sin anon, J = 0, A = 0, B = 0, C = 19; diagnostico v2 "no se puede leer sin sesion"; app con sesion OK en todas las pantallas; escritura directa → 403 `42501 permission denied`; publicado en Vercel | — |

---

## 2. Impacto sobre Kubit-POS y Kubit-Store
| Objeto | Uso por el WMS | Estado |
|---|---|---|
| `pos_productos`, `pos_productos_detalle`, `pos_ventas`, `pos_compras`, `pos_configuracion_empresa` | Lectura | — |
| `pos_movimientos_inventario` | Lectura sin bloquear filas | R-P11 (informativo) |
| FK hacia `pos_productos_detalle` y `pos_usuarios` | Impedirian un `DELETE` fisico | ✅ R-P2: el POS y la Tienda no borran fisicamente productos ni usuarios |
| `update_updated_at()` | La usan los triggers del WMS | ✅ R-P13: el `08` no la redefine |
| Creacion de FK (`08`) | Bloqueo breve de escritura en dos tablas del POS | Ventana sin ventas |
| Proyectos Vercel POS y Tienda | Mismo repositorio | R-P12: Ignored Build Step (A1) |
| `tipo_producto = 'Digital'` | La Tienda oculta los digitales del catalogo | `Domi01` oculto: deseado (decision DP6) |
| Rol `anon` | Sin acceso al WMS tras el `12` | La Tienda no usa objetos `wms_*` |

---

## 3. Pre-requisitos
| # | Tema | Tipo | Estado |
|---|---|---|---|
| R-P1 | Prechequeo v2 limpio en produccion | **Bloqueante** | ✅ 2026-10-07 (§12) |
| R-P2 | Sin `DELETE` fisico de productos ni usuarios | **Bloqueante** | ✅ 2026-10-06 |
| R-P10 | Registro §1.4 completo en pruebas | **Bloqueante** | ✅ 2026-10-06 (el `12`) |
| R-P13 | El `08` no modifica el POS | **Bloqueante** | ✅ 2026-10-06 |
| R-P3 | Permisos (`12`) | Aprobado | ✅ verificado en pruebas |
| R-P4 | Venta anulada despachable (T-515) | Riesgo aceptado (DP5) | Mitigado en pantalla |
| R-P5 | Bug del POS `entrada_anulacion` | Fuera del WMS | Pendiente |
| R-P6 | Ids de `pos_usuarios` distintos de Auth (2 de 3) | Informativo | Auditoria `created_by` vacia en operaciones de stock; el login funciona |
| R-P7 | Contenedores de pruebas no se migran | Operativo | P6 |
| R-P8 | Proyecto Vercel y `config.js` de produccion | Operativo | A3 y P4 |
| R-P9 | Produccion nunca registro `merma` ni `ajuste_incremento` | Informativo | Ajuste + probado en pruebas; una averia sin merma se registra como ajuste − |
| R-P11 | Borrado del movimiento en la recepcion de compras del POS | Informativo | Aceptado |
| R-P12 | Mismo repositorio en Vercel | Recomendado | **Pendiente: A1** |
| R-P14 | Productos sin tipo y `Domi01` | Datos | ✅ 2026-10-07: 0 productos sin tipo con stock; `Domi01` = `Digital` |
| R-P15 | El WMS excluye solo `'Digital'`; la constitucion (Art. 13) dice "solo `Fisico` o sin tipo". Un tipo nuevo (ej. `Servicio`) entraria al WMS | Informativo | Hoy solo existen `Fisico`, `Digital` y 5 sin tipo y sin stock. Mejora T-522 |

**Sin bloqueantes pendientes.** Falta A1 (recomendado) y la fecha de la ventana.

---

## 4. Ventana
| Elemento | Definicion |
|---|---|
| Fecha y hora | La define el usuario |
| Duracion | ~60 min |
| Condicion | POS sin ventas y Tienda sin pedidos durante P1 a P3 |
| Punto de no retorno | No hay: rollback disponible |

---

## 5. Paso a paso
El detalle operativo, con cada consulta y resultado esperado, esta en **`produccion/GUIA-DIA-DESPLIEGUE.md`**. Resumen:

| Fase | Contenido |
|---|---|
| **Antes** | A1 Ignored Build Step · A2 copiar los 5 scripts a `specs/` del repositorio de produccion y comparar con pruebas · A3 preparar `apps/wms` con `config.js` de produccion · A4 tener respaldo y rollback a mano |
| **P1** | Respaldo · FOTO del POS · volumen esperado · 0 objetos `wms_*` |
| **P2** | `08` → `09` → `10` → `11` → `12`, cada uno con su verificacion; FOTO identica |
| **P3** | `wms_inicializar()` una vez; reconciliacion vacia; FOTO identica |
| **P4** | Commit solo de `apps/wms` + 5 scripts; proyecto Vercel nuevo; POS y Tienda omitidos |
| **P5** | Humo: diagnostico, login, Buscar, Panel, Reconciliacion; POS y Tienda abren igual; **sin venta de prueba con anulacion** |
| **P6** | Bodegas, contenedores, ubicar, instalar en el celular, registrar |

### Verificaciones esperadas
| Despues de | A | B | C | G | H | I | J |
|---|---|---|---|---|---|---|---|
| `08` | — | — | 0 | — | — | — | — |
| `09` | filas | filas | 21 | — | — | — | — |
| `10` | 0 | 0 | 18 | — | — | — | — |
| `11` | 0 | 0 | 19 | — | — | — | — |
| `12` | 0 | 0 | 19 | 0 | 0 | 6 sin anon | 0 |

---

## 6. Rollback
`produccion/P9-rollback.sql` (v2): borra vistas, funciones y tablas `wms_*` en una transaccion, sin `CASCADE`, y se revierte solo si queda algun objeto `wms_*`. Despues: 0 objetos `wms_*` y FOTO identica. Pausar o eliminar el proyecto Vercel del WMS.

## 7. Checklist
| Fase | Hecho | Fecha |
|---|---|---|
| Fase 0: 0.1–0.6, prechequeo, tipos de producto | [x] | 2026-10-07 |
| A1 Ignored Build Step | [ ] | |
| A2–A4 Preparacion del repositorio | [ ] | |
| P1–P6 Ventana | [ ] | |

## 8. Registro de ejecuciones en produccion
| Fecha | Paso | Resultado | Notas |
|---|---|---|---|
| 2026-10-07 | Prechequeo v2 (solo lectura) | Sin bloqueantes | §12 |
| 2026-10-07 | Datos del POS (usuario) | 0 productos sin tipo con stock; `Domi01` = `Digital` | No es parte del WMS |

## 9. Como mantener este documento
Al cerrar cada paso: §1.1 y §1.4, §1.2, §2, §3, §11, la guia operativa y la version en §10.

## 10. Historial
| Version | Fecha | Cambio |
|---|---|---|
| 1–4 | 2026-10-02 / 06 | Plan inicial, CR1, `11`, I-1 y verificacion por script |
| 5 | 2026-10-06 | Fase 0; script `12`; prechequeo v2; R-P11 a R-P13 |
| 6 | 2026-10-07 | `12` verificado en pruebas (R-P10); prechequeo de produccion sin bloqueantes (R-P1, §12); tipos de producto corregidos por el usuario (R-P14, DP6); R-P15; principio 12 (sin venta de prueba con anulacion); **guia del dia del despliegue**; `P9-rollback.sql` v2 |

## 11. Incidentes conocidos
- **I-1 (2026-10-06):** el `10` no se habia ejecutado en pruebas; detectado al ejecutar el `11`; sin impacto en el POS (F = 0). Origen de la verificacion por script.

## 12. Resultados del prechequeo en produccion (2026-10-07)
| Bloque | Resultado |
|---|---|
| 1. Objetos `wms_*` | 0 filas ✅ |
| 2. Columnas que lee el WMS | 0 faltantes ✅ |
| 3. Tipos de dato | uuid, integer y timestamptz como en pruebas ✅ |
| 4. Funciones necesarias | 4 en `true` ✅ |
| 5. Productos por tipo | Fisico 111 (539 u.), sin tipo 90 (1.844 u.), Digital 197 (195.809 u.). Corregido despues (R-P14) |
| 6. Volumen a cargar | 147 / 2.383; sin negativos ni decimales ✅. **Tras R-P14: 146 productos / 1.385 unidades** |
| 7. Stock negativo | 0 filas ✅ |
| 8. Usuarios | 3 en el POS; 2 sin el mismo id en Auth; 1 cuenta de Auth sin usuario POS (R-P6) |
| 9. Tipos de movimiento | `salida_venta` 803, `entrada_compra` 427, `ajuste_decremento` 1; sin merma ni ajuste + (R-P9) |
| 10. Referencias | Ventas: 332 `V-…`, 470 numero en motivo, 1 sin identificar; compras: 398 `OC-…`, 16 `V-…`, 12 otras. Todo historico: queda en la linea base |
| 11. Triggers | Solo `updated_at` ✅ |
| 12. FOTO | 401 · 198.192 · 1.231 · 653 |
