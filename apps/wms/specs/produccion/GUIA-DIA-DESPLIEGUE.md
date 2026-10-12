# Guia del dia del despliegue — Kubit-WMS a PRODUCCION

> Documento operativo. Se sigue **en orden**, sin saltar pasos. Cada paso dice **que hacer**, **donde**, **que esperar** y **que hacer si no da lo esperado**.
> Version 1 · 2026-10-07 · Plan de referencia: `apps/wms/specs/despliegue-produccion.md` (v6).
>
> **Regla de oro:** si un resultado no coincide con lo esperado, **DETENERSE**. No ejecutar el siguiente paso. Ir a la seccion R (rollback) o pedir revision.

---

## Datos de referencia (completar antes de la ventana)

| Dato | Valor |
|---|---|
| Proyecto Supabase PRODUCCION | `gxqcybboiskwznxdioun` |
| Proyecto Supabase PRUEBAS (NO usar hoy) | `gbjtdjbopwgbknklwldq` |
| Fecha y hora de la ventana | ________________ |
| Prechequeo (2026-10-07): productos / unidades a cargar | 146 / 1.385 |
| Prechequeo (2026-10-07): foto del POS (skus · stock · movimientos · ventas) | 401 · 198.192 · 1.231 · 653 |

---

## ANTES DE LA VENTANA (dias antes; no toca la base de produccion)

### A1. Ignored Build Step en Vercel (POS y Tienda de produccion)
Por que: POS, Tienda y WMS comparten el repositorio. Sin esto, subir el WMS vuelve a publicar el POS y la Tienda.
1. Vercel → proyecto **POS** de produccion → **Settings** → **Git** → **Ignored Build Step**.
2. Elegir comando personalizado y pegar:
   ```
   git diff HEAD^ HEAD --quiet -- .
   ```
3. **Save**. Repetir en el proyecto de la **Tienda**.
- Esperado: no cambia nada visible. Se comprueba en el paso P4.6.

### A2. Copiar los scripts al repositorio de produccion (sin ejecutarlos)
En la carpeta `specs/` del repositorio de produccion, copiar desde `KUBIT-Pruebas/specs/`:
`08-wms-schema.sql`, `09-wms-functions.sql`, `10-wms-solo-lectura.sql`, `11-wms-conteo-sobrante.sql`, `12-wms-permisos.sql`.
- No hacer commit todavia (se hace en P4 junto con el frontend).
- Verificar que son identicos a los de pruebas (en Git Bash, ajustando las rutas):
  ```bash
  cd <repo-produccion>
  for f in 08-wms-schema 09-wms-functions 10-wms-solo-lectura 11-wms-conteo-sobrante 12-wms-permisos; do
    cmp -s "specs/$f.sql" "<ruta-KUBIT-Pruebas>/specs/$f.sql" && echo "igual  $f" || echo "DISTINTO  $f"
  done
  ```
  Esperado: 5 lineas `igual`.

### A3. Preparar el frontend del WMS (sin subirlo)
1. Copiar la carpeta `KUBIT-Pruebas/apps/wms/` a `<repo-produccion>/<prefijo>/apps/wms/`, donde `<prefijo>` es el mismo que usa el POS en su Root Directory de Vercel (ej. `Kubit-Produccion/apps/pos` → `Kubit-Produccion/apps/wms`).
2. **Reemplazar** `apps/wms/js/config.js` por uno de PRODUCCION: Supabase (produccion) → **Settings → API** → copiar **Project URL** y **anon public key**:
   ```js
   const ENTORNO = 'development';
   const CONFIG = {
     development: {
       supabaseUrl: 'https://gxqcybboiskwznxdioun.supabase.co',
       supabaseAnonKey: '<anon public key de PRODUCCION>',
       supabaseServiceKey: ''
     }
   };
   const SUPABASE_URL = CONFIG[ENTORNO].supabaseUrl;
   const SUPABASE_ANON_KEY = CONFIG[ENTORNO].supabaseAnonKey;
   const SUPABASE_SERVICE_KEY = CONFIG[ENTORNO].supabaseServiceKey;
   ```
   **Nunca** pegar el `service_role`.
3. Revisar que no quede nada de pruebas:
   ```bash
   cd <repo-produccion>
   grep -rn "gbjtdjbopwgbknklwldq" <prefijo>/apps/wms     # debe salir VACIO
   grep -rn "service_role" <prefijo>/apps/wms/js            # debe salir VACIO
   ```

### A4. Tener a mano
- `01_backup_origen.sql` (respaldo, solo lectura).
- `apps/wms/specs/produccion/P9-rollback.sql` (abierto en otra pestana, por si hace falta).
- Esta guia impresa o en otra pantalla.

---

## DIA DE LA VENTANA (unos 60 minutos)

**Antes de cada script:** confirmar que la URL del SQL Editor dice **`gxqcybboiskwznxdioun`**.
**Cada consulta de verificacion se ejecuta por separado** (el editor solo muestra la ultima).

### P0. Condiciones (2 min)
- [ ] POS sin ventas en curso; Tienda sin pedidos en curso.
- [ ] Nadie mas usando el POS durante la ventana.

### P1. Respaldo y foto del POS (10 min)
1. Ejecutar `01_backup_origen.sql` (seccion 1). Descargar la salida y guardarla como `respaldo-produccion-AAAA-MM-DD.sql` **fuera del repositorio**.
2. **FOTO** del POS. Anotar los 4 valores:
   ```sql
   select (select count(*) from pos_productos_detalle) as skus,
          (select coalesce(sum(stock_actual), 0) from pos_productos_detalle where deleted_at is null) as stock_total,
          (select count(*) from pos_movimientos_inventario) as movimientos,
          (select count(*) from pos_ventas) as ventas;
   ```
   FOTO: skus ______ · stock ______ · movimientos ______ · ventas ______
3. Volumen esperado de la inicializacion. Anotar:
   ```sql
   select count(*) filter (where pd.stock_actual > 0) as skus_a_cargar,
          coalesce(sum(pd.stock_actual) filter (where pd.stock_actual > 0), 0) as unidades_a_cargar,
          count(*) filter (where pd.stock_actual < 0) as skus_stock_negativo
   from pos_productos_detalle pd join pos_productos p on p.id = pd.producto_id
   where pd.deleted_at is null and p.tipo_producto is distinct from 'Digital';
   ```
   Esperado: `skus_stock_negativo = 0`. Anotar: productos ______ · unidades ______
4. Confirmar que no existe nada del WMS (0 filas):
   ```sql
   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'wms\_%';
   ```

### Consultas de verificacion (se usan en P2)
```sql
-- A) funciones WMS que escriben en pos_*/st_*
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.(pos|st)_';
-- B) funciones WMS que bloquean filas de pos_*/st_*
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  and p.prosrc ~* 'from\s+public\.(pos|st)_[a-z_]+[^;]*for\s+update';
-- C) cantidad de funciones WMS
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%');
-- G) permisos de anon sobre wms_*
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public' and table_name like 'wms\_%';
-- H) escrituras de authenticated en stock y vistas
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
  and (table_name in ('wms_stock_ubicacion','wms_movimientos','wms_conteos','wms_pos_linea_base')
       or table_name like 'wms\_v\_%') and privilege_type <> 'SELECT';
-- I) politicas del WMS
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename like 'wms\_%' order by 1, 2;
-- J) funciones WMS ejecutables sin sesion
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'wms\_%' or p.proname like '\_wms\_%')
  and has_function_privilege('anon', p.oid, 'execute');
-- FOTO) la del paso P1.2
```

### P2. Base de datos (25 min). Cada script se ejecuta COMPLETO
| # | Ejecutar | Verificar | Esperado | Hecho |
|---|---|---|---|---|
| P2.1 | `08-wms-schema.sql` | `select codigo, nombre from wms_bodegas order by codigo;` · C · FOTO | 3 bodegas · C = 0 · FOTO identica | [ ] |
| P2.2 | `09-wms-functions.sql` | A · B · C | A y B **con filas** (esperado en este punto) · C = 21 | [ ] |
| P2.3 | **De inmediato** `10-wms-solo-lectura.sql` | A · B · C | A = 0 · B = 0 · C = 18 | [ ] |
| P2.4 | `11-wms-conteo-sobrante.sql` | A · B · C | A = 0 · B = 0 · C = 19 | [ ] |
| P2.5 | `12-wms-permisos.sql` | G · H · I · J · A · B · C | G = 0 · H = 0 · I = 6 filas sin `anon` · J = 0 · A = 0 · B = 0 · C = 19 | [ ] |
| P2.6 | — | FOTO | **Identica** a P1.2 | [ ] |

- **No** volver a ejecutar el `09` despues del `10`. Si ocurre: ejecutar de nuevo `10`, `11` y `12` y repetir sus verificaciones.
- Si P2.2 se interrumpe antes del `10`: no dejar la base asi; ejecutar el `10` o ir a R.

### P3. Inicializacion — UNA SOLA VEZ (5 min)
1. Confirmar que no entro ninguna venta: repetir FOTO → identica a P1.2.
2. Ejecutar:
   ```sql
   select * from public.wms_inicializar();
   ```
   Esperado: `skus_cargados` y `unidades_cargadas` = los anotados en P1.3 · `skus_stock_negativo = 0`.
3. Verificar:
   ```sql
   select * from wms_v_reconciliacion where diferencia <> 0;                 -- 0 filas
   select estado_fase, sum(cantidad) from wms_stock_ubicacion group by 1;     -- solo SIN_UBICAR = unidades de P1.3
   select * from public.wms_sincronizar();                                    -- sin error (0 filas)
   select count(*) from pos_movimientos_inventario where referencia = 'WMS';  -- 0
   ```
4. FOTO → **identica** a P1.2.
- **Nunca** volver a ejecutar `wms_inicializar()` (la funcion lo impide).
- **Desde aqui el POS puede volver a vender.** El WMS procesara las ventas nuevas al abrirse.

### P4. Frontend (15 min)
1. En el repositorio de produccion, agregar **solo** el WMS y los scripts (nunca `git add .`):
   ```bash
   cd <repo-produccion>
   git pull --no-rebase
   git add <prefijo>/apps/wms specs/08-wms-schema.sql specs/09-wms-functions.sql specs/10-wms-solo-lectura.sql specs/11-wms-conteo-sobrante.sql specs/12-wms-permisos.sql
   git status --short          # solo apps/wms y los 5 specs
   git diff --cached | grep -n "gbjtdjbopwgbknklwldq"   # VACIO
   git diff --cached | grep -n "service_role"           # VACIO
   git commit -m "WMS: despliegue inicial en produccion"
   git push
   ```
2. Vercel → **Add New → Project** → importar el repositorio de produccion.
3. **Project Name:** sugerido `kubit-wms` · **Root Directory:** `<prefijo>/apps/wms` · **Framework:** Other · Build y Output **vacios** · **Deploy**.
4. Esperar el estado **Ready**.
5. Si Vercel muestra "Usuario de GitHub no encontrado": revisar que el commit tenga el correo `harrissonhzs@gmail.com` (`git log --format="%h %an <%ae>" -1`).
6. En los proyectos **POS** y **Tienda**: el despliegue de este commit debe aparecer **cancelado u omitido** (Ignored Build Step). Si se publicaron, no se dano nada (mismo codigo), pero revisar A1.

### P5. Pruebas de humo (10 min)
**WMS** (URL del proyecto nuevo):
- [ ] `/diagnostico.html`: alerta roja "ATENCION: ... PRODUCCION" (esperada) · conexion **OK** · permisos **OK**.
- [ ] `/memory/progress.md` → **404**.
- [ ] Login con tu usuario del POS.
- [ ] Buscar un producto fisico → "Sin ubicacion asignada · N".
- [ ] Panel: "Sin ubicar" = unidades de P1.3 · Diferencias = 0.
- [ ] Reconciliacion: "Todo cuadra con el POS".

**POS y Tienda** (no deben haber cambiado):
- [ ] POS: iniciar sesion, abrir productos y ventas.
- [ ] Tienda: abrir el catalogo y un producto.
- [ ] **No** hacer una venta de prueba para luego anularla: la anulacion aun no la procesa el WMS (D2) y dejaria una reserva bloqueada y una diferencia. La primera venta real aparecera en Despachar.

### P6. Puesta en operacion
- [ ] Configuracion: crear la bodega 4 y los puestos y contenedores **con los mismos codigos de los adhesivos**.
- [ ] Ubicar la mercancia (Ubicar o Inventario).
- [ ] Instalar la app en el celular desde la URL de produccion.
- [ ] Registrar la ejecucion en `despliegue-produccion.md` §1.4 y §8.

---

## R. ROLLBACK (si algo falla en P2 o P3, o en P5 hay un problema sin solucion)
1. Ejecutar `apps/wms/specs/produccion/P9-rollback.sql` completo en produccion.
2. Verificar: 0 objetos `wms_*` (consulta de P1.4) y FOTO **identica** a P1.2.
3. Si se creo el proyecto Vercel del WMS: pausarlo o eliminarlo.
- El rollback solo borra objetos `wms_*`. El POS y la Tienda quedan exactamente como estaban.

---

## Registro de la ejecucion

| Paso | Hora | Resultado | Notas |
|---|---|---|---|
| P1 | | | |
| P2.1 – P2.6 | | | |
| P3 | | | |
| P4 | | | |
| P5 | | | |
| P6 | | | |
