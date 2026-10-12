# progress.md — Bitacora de avance

> Una entrada por paso: fecha · paso/tarea · resumen · prueba. Sin commits salvo peticion explicita (regla 1.4 de Kubit).

## Plan del paso en curso
**Listo para la ventana de produccion** (plan v6 + `produccion/GUIA-DIA-DESPLIEGUE.md`):
1. A1: Ignored Build Step en los proyectos POS y Tienda de Vercel.
2. A2–A4: copiar los 5 scripts y `apps/wms` (con `config.js` de produccion) al repositorio de produccion, sin commit.
3. El usuario define la fecha de la ventana (~60 min) y ejecuta P1 a P6 con la guia.

**Siguiente despues del despliegue:** RC2 (T-521), T-522 (exclusion por tipo), D2, endurecimiento.

## Historial

### 2026-09-01 / 2026-09-02 — Especificacion
- `07-wms-spec.md` v1 → v6 y artefactos SDD/Ralph alineados al stack de Kubit.

### 2026-09-28 — Base de datos (T-101 a T-109)
- `08-wms-schema.sql` ejecutado en pruebas. Seed de 3 bodegas OK.

### 2026-09-29 — Funciones RPC (Epica 3)
- `09` v1 → v2 ejecutado en pruebas. `wms_inicializar()`: 135 SKUs, 1.034 unidades. Compra, reserva y despacho OK.

### 2026-09-29 / 2026-10-01 — Fase A (A0 a A8, V1) — **cerrada**
### 2026-10-01 / 2026-10-02 — Fase B (B0 a B7) — **cerrada**
### 2026-10-02 — T-430 Plan de despliegue a produccion (version 1)

### 2026-10-02 / 2026-10-06 — Fase C (C0 a C4) — **cerrada 2026-10-06**
- C0 `10-wms-solo-lectura.sql` (CR1, CR2, CR3); C1 Bajas y ajustes (AJ1); C2 `11` e Inventario (IN1–IN3); C3 Reconciliacion (RC1) y plan v4; C4 documentacion final, publicacion y pruebas.
- **Incidente I-1 (2026-10-06):** el `10` no estaba ejecutado en pruebas; detectado al ejecutar el `11` (A con filas, B = 3 funciones, C = 22). F = 0 (el WMS nunca escribio en el POS). Se ejecuto el `10` (A = 0, B = 0, C = 19) y se revalidaron C0, C1 y C2.

### 2026-10-06 — Preparacion de produccion (fase 0, plan v5)
- **0.2 (R-P13):** el `08` no crea funciones; las menciones de `update_updated_at()` son triggers que la usan; las coincidencias de `update` eran `updated_by references public.pos_usuarios`. ✅
- **0.4 (R-P2):** el POS solo borra `pos_movimientos_inventario` en la recepcion de compras (politica estricta, R-P11); la Tienda no borra. ✅
- Decisiones del usuario: mismo repositorio en Vercel (R-P12, DP4); si al script de permisos (DP3); T-515 bloqueado hasta corregir el bug de anulacion del POS (DP5).
- Entregado: `P1-prechequeo.sql` v2, `12-wms-permisos.sql`, `diagnostico.html` v2, plan v5. Los `.md` se regeneraron a partir de los archivos adjuntos por el usuario.

### 2026-10-06 — Script `12` en pruebas (T-316)
- Diagnostico v2 antes: permisos **ATENCION**. Ejecutado el `12`.
- Verificacion: G = 0, H = 0, I = 6 filas sin `anon` (bodegas y ubicaciones "escritura authenticated" ALL; conteos, movimientos, linea base y stock "lectura authenticated" SELECT), J = 0, A = 0, B = 0, C = 19.
- Diagnostico despues: permisos **OK** ("no se puede leer sin sesion (acceso denegado)"), en local y en Vercel.
- App con sesion: todas las pantallas y acciones OK.
- Escritura directa en `wms_stock_ubicacion` → **403, `42501 permission denied`**. (La sugerencia de Supabase `GRANT UPDATE ...` no debe ejecutarse.)
- Commit y push. — **APROBADO** (cierra R-P10).

### 2026-10-07 — Prechequeo v2 en PRODUCCION (T-431, solo lectura)
- Bloques 1, 2, 4, 7 y 11 como se esperaba; bloque 3 con los mismos tipos que pruebas.
- Bloque 5: Fisico 111 (539 u.), sin tipo 90 (1.844 u.), Digital 197 (195.809 u.).
- Bloque 6: 147 productos / 2.383 unidades, sin negativos ni decimales.
- Bloque 8: 3 usuarios POS, 2 sin el mismo id en Auth (R-P6). Bloque 9: venta 803, compra 427, ajuste − 1 (R-P9). Bloque 10: referencias historicas variadas (quedan en la linea base).
- Bloque 12 (FOTO): 401 · 198.192 · 1.231 · 653. — **Sin bloqueantes** (cierra R-P1).

### 2026-10-07 — Tipos de producto en el POS (R-P14, hecho por el usuario)
- La consulta de productos sin tipo con stock mostro 75 variantes; todas fisicas salvo `Domi01` (domicilio, un servicio).
- El usuario marco los fisicos como `Fisico` y `Domi01` primero como `Servicio`. Hallazgo: el WMS excluye solo `'Digital'` (contradice el Art. 13); `Servicio` habria entrado al WMS con 998 unidades → R-P15 / T-522.
- El usuario cambio `Domi01` a `Digital`. Resultado: tipos = Fisico 147, Digital 197, Servicio 1→0, 5 sin tipo y sin stock; volumen a cargar **146 productos / 1.385 unidades**, sin negativos.
- `grep` de `tipo_producto` en POS y Tienda: el POS solo lo muestra y edita; la Tienda oculta los `Digital` del catalogo. El usuario confirmo que el domicilio no debe verse en la Tienda (DP6). ✅

### 2026-10-07 — Listo para produccion (plan v6)
- Entregado: `produccion/GUIA-DIA-DESPLIEGUE.md` (antes de la ventana A1–A4; ventana P0–P6 con cada consulta y valor esperado; rollback; registro), `produccion/P9-rollback.sql` v2 (sin CASCADE, verifica que no quede nada `wms_*`), `despliegue-produccion.md` v6.
- Nuevo principio 12: no hacer en produccion ventas de prueba para anularlas mientras D2 este pendiente.
- Pendientes del usuario: A1 (Ignored Build Step), A2–A4 y la fecha de la ventana.

## BLOQUEOS
- Ninguno. Pendiente A1 (recomendado) y la fecha de la ventana.
