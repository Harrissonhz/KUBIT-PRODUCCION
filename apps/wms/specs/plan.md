# plan.md — Plan tecnico de implementacion Kubit-WMS (MVP)

> **Como.** Arquitectura, estructura y decisiones tecnicas derivadas de `07-wms-spec.md` (v11), `constitution.md` y el **AGENTS.md raiz de Kubit**.
> Ultima actualizacion: 2026-10-06 (paso C4, cierre de la Fase C) — estructura final del MVP, funciones (19), capa de datos y decisiones de pantalla de la Fase C.

## 1. Stack (confirmado en Kubit — no reabrir)
- **Frontend:** HTML semantico + **Tailwind CSS via CDN** + **JavaScript vanilla** (IIFE por pagina). Sin SPA, sin TypeScript, sin build. Fuente Poppins.
- **Backend/DB:** PostgreSQL 15+ via **Supabase** (plan gratuito). Sin ORM.
- **Cliente de datos:** `js/supabase.js` propio de Kubit (`fetch` directo, **no** supabase-js).
- **API:** PostgREST. Transacciones → funciones Postgres via `rpc()`. Sin Edge Functions en produccion.
- **Auth:** Supabase Auth + `window.KubitAuth` (copia sin cambios del POS).
- **PWA:** `manifest.json` + `service-worker.js`. **Testing:** vitest + jsdom. **Hosting:** Vercel `kubit-wms-calidad`.

## 2. Estructura de archivos (MVP completo)

```
/specs/                        (raiz del monorepo)
  ├── 07-wms-spec.md           # v11
  ├── 08-wms-schema.sql
  ├── 09-wms-functions.sql     # v2
  ├── 10-wms-solo-lectura.sql  # CR1, CR2, CR3
  └── 11-wms-conteo-sobrante.sql  # IN2

/apps/wms/
  ├── AGENTS.md, PROMPT.md, ralph.sh, README.md, memory/, specs/   # NO se publican (.vercelignore)
  │     specs/despliegue-produccion.md (v4) · specs/produccion/P1-prechequeo.sql · P9-rollback.sql
  ├── index.html · diagnostico.html · login.html
  ├── buscar.html · ubicar.html · config.html                          # Fase A
  ├── despachar.html · traslados.html · panel.html                     # Fase B
  ├── ajustes.html · inventario.html · reconciliacion.html             # Fase C
  ├── manifest.json · service-worker.js (vigente: 20261006-02)
  ├── css/ estilo.css (copia del POS) · wms.css
  ├── img/
  └── js/
      ├── config.js            # CREDENCIALES DE PRUEBAS — NUNCA a produccion
      ├── supabase.js          # copia exacta del POS
      ├── compartido/  database.js · auth.js · layout.js · fecha.js · ubicacion-vista.js
      └── paginas/     login · buscar · ubicar · config · despachar · traslados · panel · ajustes · inventario · reconciliacion
```

## 3. Modelo de datos — ✅ ejecutado en pruebas 2026-09-28
Tablas `wms_bodegas`, `wms_ubicaciones`, `wms_stock_ubicacion`, `wms_movimientos`, `wms_conteos`; el `09` agrega `wms_pos_linea_base`. Ninguna fase posterior agrego tablas.

## 4. Funciones RPC (19 = 11 `_wms_` + 8 `wms_`)

| Funcion | Archivo | Pantalla | Estado |
|---|---|---|---|
| `wms_inicializar()` | `09` | — (una vez) | ✅ |
| `wms_sincronizar()` / `_wms_procesar_evento` | `09` → `10` | todas las que sincronizan | ✅ (CR1, CR2) |
| `wms_ubicar()` | `09` | Ubicar | ✅ |
| `wms_trasladar()` | `09` | Traslados | ✅ |
| `wms_despachar()` | `09` | Despachar | ✅ |
| `wms_resolver_decremento(mov, codigo?)` | `10` | Bajas y ajustes | ✅ |
| `wms_registrar_conteo()` | `10` | Inventario | ✅ (CR3) |
| `wms_cerrar_sobrante(conteo, accion)` | `11` | Inventario | ✅ (IN2) |
| ~~`wms_ajustar`~~, ~~`wms_dar_baja`~~, ~~`_wms_ajuste_pos`~~ | eliminadas en `10` | — | CR1 |
| `wms_liberar()` | — | — | ⏸ diferida (D2) |

Verificacion CR1: consultas A y B = 0 filas, C = 19 (ver `despliegue-produccion.md`, bloque V). Orden obligatorio: `08 → 09 → 10 → 11`.

## 5. Capa de datos (`js/compartido/database.js`)
- **Formato:** `{ data, error }`. **CR1:** sin `post`/`patch`/`delete` sobre `pos_*`/`st_*`. **C1:** escritura directa solo en `wms_bodegas` y `wms_ubicaciones`.

| Grupo | Metodos |
|---|---|
| Generico | `select`, `rpc` |
| Catalogo (lectura POS) | `productos.buscar`, `productos.porIds` |
| Maestros | `wms.bodegas`, `ubicaciones`, `ubicacionPorCodigo`, `rutas`, `detalleUbicaciones`, `crearBodega`, `crearUbicacion`, `actualizarUbicacion` |
| Stock y control (lectura) | `wms.stockDetalle`, `stockPorSkus`, `stockEnUbicaciones`, `stockEnContenedor`, `reconciliacion`, `posPendientes`, `salidasPendientes`, `conteosAbiertos`, `despachoPendiente`, `bandejaDespacho` |
| Operaciones (RPC) | `wms.sincronizar`, `ubicar`, `trasladar`, `despachar`, `resolverDecremento`, `registrarConteo`, `cerrarSobrante` |

## 6. Codigos y contenedores (decision P1)
Formato `B CC PP` (`07-wms-spec.md` §15). Solo se ubica, traslada, cuenta o descuenta en contenedores con `es_hoja = true` y activos. Pendiente: `js/codigos.js` (T-201).

## 7. UI y navegacion
- Modo oscuro por defecto, paleta Slate, header fijo, cards, toast superior, texto en ASCII plano.
- **Contrato de pagina protegida:** `<body data-pagina data-titulo>`, `<main id="contenido" class="invisible">`; scripts `config` → `supabase` → `database` → `auth` → `layout` → (`fecha`) → (`ubicacion-vista`) → pagina.
- **Menu:** barra inferior (Buscar · Ubicar · Despachar · Mas); "Mas" con Traslados, Panel, Inventario, Reconciliacion, Bajas y ajustes, Configuracion. **Todo disponible** desde C3.
- **Z1** fechas en America/Bogota; **V1** formato de ubicacion; **CR1** ninguna pantalla crea ajustes ni bajas.
- Decisiones de pantalla: U1 (Ubicar), DB1/DB2 (Despachar), T1/T2/T3 (Traslados), PN1/PN2 (Panel), AJ1 (Bajas y ajustes), IN1/IN2/IN3 (Inventario), RC1 (Reconciliacion: solo lectura, causa y enlace; diferencia como POS − WMS en todas las pantallas).

## 8. Pruebas
Pruebas manuales por paso en `fix_plan.md` (todas aprobadas al 2026-10-06) y pruebas con datos simulados en Node antes de cada entrega. Pendientes: automatizadas (T-201, T-508, T-309).

## 9. Plan por fases — estado final del MVP

| Fase | Pasos | Estado |
|---|---|---|
| Base de datos | `08`, `09` v2, inicializacion | ✅ 2026-09-28/29 |
| A — Base y ubicacion | A0–A8, V1 | ✅ 2026-10-01 |
| B — Operacion diaria | B0–B7 (Despachar, Traslados, Panel) | ✅ 2026-10-02 |
| C — Control | C0 (`10`), C1 (Bajas y ajustes), C2 (`11`, Inventario), C3 (Reconciliacion), C4 (cierre) | ✅ 2026-10-06 (C4: publicacion pendiente del usuario) |
| Produccion | `despliegue-produccion.md` v4 | Sin fecha |
| Posterior | D2 (anulaciones), RC2/T-521, T-515, endurecimiento (Epica 5) | Por priorizar |

## 10. Local y despliegue
- Local: `npx http-server apps/wms -p 3001 -c-1` desde la raiz de `KUBIT-Pruebas`.
- GitHub `KUBIT-Pruebas` → Vercel `kubit-wms-calidad` (Root `apps/wms`, Framework "Other", sin build).
- Antes de cada commit: revisar cabeceras, existencia de `ASSETS` y secretos.
- Produccion: `apps/wms/specs/despliegue-produccion.md` (v4).

## 11. Riesgos tecnicos
- Consistencia POS↔WMS bajo demanda → Reconciliacion y Panel.
- Token sin renovacion (~1 h) → T-507.
- Service worker: un archivo inexistente en `ASSETS` impide instalarlo.
- Contenedores creados por error no se borran desde la app (T-509).
- R-B1 (T-515), R-C1, R-C2, R-C3 (RC2/T-521).
- Salida de un solo origen (T-518); sobrante leido de la observacion (T-520); totales del Panel en el navegador (T-517).
- Bugs del POS que afectan al WMS: ver `fix_plan.md`.
