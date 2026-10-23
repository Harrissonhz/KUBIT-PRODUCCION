# Contratos de API - Kubit

## 1. Convenciones Generales

### 1.1 Base URL
```
{{SUPABASE_URL}}/rest/v1/
```

### 1.2 Headers Estándar
| Header | Valor | Obligatorio |
|---|---|---|
| `apikey` | `{{SUPABASE_ANON_KEY}}` | Siempre |
| `Authorization` | `Bearer {{JWT_TOKEN}}` | Excepto en registro/login público |
| `Content-Type` | `application/json` | Siempre |
| `Prefer` | `return=representation` | Opcional (devuelve el registro creado/actualizado) |

### 1.3 Formato de Respuesta

```json
// Éxito
{ "data": [ ... ], "error": null }

// Error
{
  "data": null,
  "error": {
    "code": "42501",
    "message": "new row violates row-level security policy for this table",
    "details": null,
    "hint": null
  }
}
```

### 1.4 Paginación
| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `limit` | `&limit=50` | Máximo de filas por página (default 10, max 1000) |
| `offset` | `&offset=0` | Desplazamiento para paginación |
| `Range` header | `Range: 0-49` | Alternativa vía header para paginación |

### 1.5 Filtros y Ordenamiento
```
?columna=eq.valor           → igual
?columna=neq.valor          → no igual
?columna=gt.valor           → mayor que
?columna=gte.valor          → mayor o igual que
?columna=lt.valor           → menor que
?columna=lte.valor          → menor o igual que
?columna=in.(v1,v2,v3)      → en lista
?columna=is.null            → es nulo
?columna=not.is.null        → no es nulo
?columna=like.*texto*       → contiene (texto)
?order=columna.asc          → orden ascendente
?order=columna.desc         → orden descendente
```

### 1.6 Selección de Columnas y Relaciones
```
?select=col1,col2,col3                          → columnas específicas
?select=*,pos_ventas_detalle(*)                 → todas + relación
?select=id,total,pos_ventas_detalle(cantidad)   → columnas específicas + relación
```

---

## 2. Autenticación (Supabase Auth)

### 2.1 Iniciar Sesión
```
POST {{SUPABASE_URL}}/auth/v1/token?grant_type=password
```

**Headers:**
```
apikey: {{SUPABASE_ANON_KEY}}
Content-Type: application/json
```

**Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "uuid", "email": "usuario@ejemplo.com" }
}
```

### 2.2 Cerrar Sesión
```
POST {{SUPABASE_URL}}/auth/v1/logout
```

**Headers:**
```
apikey: {{SUPABASE_ANON_KEY}}
Authorization: Bearer {{JWT_TOKEN}}
```

### 2.3 Obtener Sesión Actual
```
GET {{SUPABASE_URL}}/auth/v1/user
```

**Headers:**
```
apikey: {{SUPABASE_ANON_KEY}}
Authorization: Bearer {{JWT_TOKEN}}
```

---

## 3. Endpoints POS

### 3.1 Productos

#### 3.1.1 Listar productos con variantes
```
GET /rest/v1/pos_productos
  ?select=*,pos_categorias(nombre),pos_productos_detalle(*),pos_productos_multimedia(*)
  &activo=eq.true
  &order=nombre.asc
```

#### 3.1.2 Obtener producto por ID
```
GET /rest/v1/pos_productos?id=eq.{id}
  &select=*,pos_categorias(*),pos_productos_detalle(*),pos_productos_multimedia(*)
```

#### 3.1.3 Crear producto + variante inicial
```
POST /rest/v1/pos_productos
Prefer: return=representation
```

```json
{
  "nombre": "Producto Ejemplo",
  "categoria_id": "uuid-categoria",
  "tasa_impuesto": 0.19,
  "tags": ["nuevo", "destacado"],
  "activo": true,
  "pos_productos_detalle": [
    {
      "codigo_barras": "7701234567890",
      "precio_venta": 50000,
      "stock_actual": 100,
      "stock_min": 10
    }
  ]
}
```

> **Nota:** La creación de producto con detalle en una sola request requiere que la relación esté configurada en Supabase. Alternativa: crear producto primero, luego detalle con `producto_id`.

#### 3.1.4 Actualizar producto
```
PATCH /rest/v1/pos_productos?id=eq.{id}
Content-Type: application/json
```

```json
{
  "nombre": "Nuevo Nombre",
  "tasa_impuesto": 0.05,
  "tags": ["nuevo", "destacado", "oferta"]
}

> Los tags se almacenan como `text[]` (PostgreSQL array). Siempre en **minúsculas**. Valores validos: `nuevo`, `destacado`, `oferta`, `super-oferta`, `remate`, `mas_vendido`, `liquidacion`, `imperdible`, `agotado`. Cualquier otro valor se ignora en el Store (no genera badge).
```

#### 3.1.5 Eliminar producto (soft delete)
```
PATCH /rest/v1/pos_productos?id=eq.{id}
```

```json
{
  "deleted_at": "2026-05-23T12:00:00Z"
}
```

### 3.2 Variantes de Producto

#### 3.2.1 Listar variantes de un producto
```
GET /rest/v1/pos_productos_detalle?producto_id=eq.{producto_id}
```

#### 3.2.2 Actualizar stock
```
PATCH /rest/v1/pos_productos_detalle?id=eq.{id}
```

```json
{
  "stock_actual": 50
}
```

### 3.3 Categorías

#### 3.3.1 Listar categorías activas
```
GET /rest/v1/pos_categorias
  ?select=*,pos_categorias!categoria_padre_id(nombre)
  &activa=eq.true
  &deleted_at=is.null
  &order=nombre.asc
```

#### 3.3.2 Crear categoría
```
POST /rest/v1/pos_categorias
```

```json
{
  "nombre": "Nueva Categoría",
  "codigo": "CAT-001",
  "color": "#4A90D9"
}
```

### 3.4 Clientes

#### 3.4.1 Buscar cliente
```
GET /rest/v1/pos_clientes
  ?or=(numero_id.like.*{termino}*,primer_nombre.like.*{termino}*,email.like.*{termino}*)
  &deleted_at=is.null
  &limit=20
```

#### 3.4.2 Crear cliente
```
POST /rest/v1/pos_clientes
Prefer: return=representation
```

```json
{
  "tipo_id": "CC",
  "numero_id": "1234567890",
  "primer_nombre": "Juan",
  "primer_apellido": "Pérez",
  "telefono": "3001234567",
  "email": "juan@ejemplo.com"
}
```

### 3.5 Ventas

#### 3.5.1 Listar ventas
```
GET /rest/v1/pos_ventas
  ?select=*,pos_clientes(primer_nombre,primer_apellido),pos_ventas_detalle(*)
  &deleted_at=is.null
  &order=created_at.desc
  &limit=50
```

#### 3.5.2 Crear venta
```
POST /rest/v1/pos_ventas
Prefer: return=representation
```

```json
{
  "numero_venta": "KBT-202605-0001",
  "cliente_id": "uuid-cliente",
  "usuario_id": "uuid-usuario",
  "fecha_venta": "2026-05-23T10:30:00Z",
  "metodo_pago": "Efectivo",
  "estado": "CONFIRMADA",
  "subtotal": 100000,
  "impuesto": 19000,
  "descuento": 0,
  "total": 119000,
  "pos_ventas_detalle": [
    {
      "producto_detalle_id": "uuid-detalle",
      "cantidad": 2,
      "precio_unitario": 50000,
      "tasa_impuesto": 0.19,
      "subtotal": 100000,
      "impuesto": 19000,
      "total": 119000
    }
  ]
}
```

#### 3.5.3 Anular venta
```
PATCH /rest/v1/pos_ventas?id=eq.{id}
```

```json
{
  "estado": "ANULADA"
}
```

### 3.6 Caja

#### 3.6.1 Abrir caja
```
POST /rest/v1/pos_caja_apertura
```

```json
{
  "caja_id": "uuid-caja",
  "cajero_id": "uuid-usuario",
  "fecha_apertura": "2026-05-23T07:00:00Z",
  "monto_inicial": 500000,
  "estado": "ABIERTA"
}
```

#### 3.6.2 Cerrar caja
```
PATCH /rest/v1/pos_caja_apertura?id=eq.{id}&estado=eq.ABIERTA
```

```json
{
  "fecha_cierre": "2026-05-23T18:00:00Z",
  "monto_final": 850000,
  "monto_esperado": 849500,
  "diferencia": 500,
  "observaciones": "Sobra 500",
  "estado": "CERRADA"
}
```

#### 3.6.3 Obtener caja activa del usuario
```
GET /rest/v1/pos_caja_apertura
  ?cajero_id=eq.{usuario_id}
  &estado=eq.ABIERTA
  &deleted_at=is.null
  &limit=1
```

### 3.7 Compras

#### 3.7.1 Crear compra
```
POST /rest/v1/pos_compras
Prefer: return=representation
```

```json
{
  "proveedor_id": "uuid-proveedor",
  "usuario_id": "uuid-usuario",
  "fecha_compra": "2026-05-23",
  "estado": "CONFIRMADA",
  "subtotal": 200000,
  "impuesto": 38000,
  "total": 238000,
  "pos_compras_detalle": [
    {
      "producto_detalle_id": "uuid-detalle",
      "cantidad": 10,
      "precio_unitario": 20000,
      "subtotal": 200000,
      "total": 238000
    }
  ]
}
```

### 3.8 Movimientos de Inventario

#### 3.8.1 Registrar movimiento manual
```
POST /rest/v1/pos_movimientos_inventario
```

```json
{
  "producto_detalle_id": "uuid-detalle",
  "tipo_movimiento": "ajuste_incremento",
  "cantidad": 10,
  "motivo": "Ajuste por conteo físico",
  "created_by": "uuid-usuario"
}
```

#### 3.8.2 Historial de movimientos de un producto
```
GET /rest/v1/pos_movimientos_inventario
  ?producto_detalle_id=eq.{detalle_id}
  &order=fecha.desc
  &limit=100
```

### 3.9 Facturación

#### 3.9.1 Emitir factura
```
POST /rest/v1/pos_facturacion
```

```json
{
  "venta_id": "uuid-venta",
  "tipo_comprobante": "factura",
  "serie": "KBT",
  "numero": "1",
  "fecha_emision": "2026-05-23",
  "cliente_id": "uuid-cliente",
  "cliente_nombre": "Juan Pérez",
  "cliente_documento": "1234567890",
  "subtotal": 100000,
  "impuesto": 19000,
  "total": 119000,
  "estado": "EMITIDA"
}
```

### 3.10 Finanzas Mensuales

#### 3.10.1 Obtener resumen del mes
```
GET /rest/v1/pos_finanzas_mensuales
  ?anio=eq.2026
  &mes=eq.5
  &deleted_at=is.null
  &limit=1
```

### 3.11 Dashboard / Estadísticas

#### 3.11.1 Ventas Hoy (KPI Bar + Dashboard)
```
GET /rest/v1/pos_ventas
  ?select=total
  &estado=eq.CONFIRMADA
  &fecha_venta=gte.{YYYY-MM-DDT00:00:00}
  &fecha_venta=lte.{YYYY-MM-DDT23:59:59}
```
**Implementación en database.js:** `ventas.estadisticasHoy()` calcula count y promedio client-side.

#### 3.11.2 Top 5 Productos del Mes
```
GET /rest/v1/pos_ventas_detalle
  ?select=producto_detalle_id,cantidad,precio_unitario,detalle:producto_detalle_id(*,producto:producto_id(nombre,slug,codigo_interno))
  &created_at=gte.{YYYY-MM-01T00:00:00}
```
**Implementación en database.js:** `ventas.topProductos(limite)` agrupa por `producto_detalle_id`, ordena por cantidad, limita a N.

### 3.12 Configuración Empresa

#### 3.12.1 Obtener configuración (incluye store_url y wms_url)
```
GET /rest/v1/pos_configuracion_empresa
  ?deleted_at=is.null
  &limit=1
```
**Implementación en database.js:** `configuracionEmpresa.obtener()` retorna la fila completa incluyendo `store_url`, `wms_url`, `logo_url`, `mensaje_legal`, etc. `store_url` y `wms_url` son las URLs de los enlaces "Tienda Virtual" y "WMS" del menú del POS (ver `03-pos-spec.md` §13).

#### 3.12.2 Actualizar configuración (store_url y wms_url)
```
PATCH /rest/v1/pos_configuracion_empresa?id=eq.{id}
{
  "store_url": "https://tienda.ejemplo.com",
  "wms_url": "https://wms.ejemplo.com/login.html"
}
```
**Implementación en database.js:** `configuracionEmpresa.guardar(data)`. Los campos vacíos se envían como `null` y el enlace correspondiente del menú se oculta. `wms_url` (Fase 44) debe existir en la tabla (ver `specs/13-pos-wms-url.sql`); si no existe, PostgREST rechaza el PATCH.

---



## 4. Endpoints Store

### 4.1 Catálogo Público

#### 4.1.1 Productos con stock disponible
```
GET /rest/v1/pos_productos
  ?select=*,pos_categorias!inner(nombre),pos_productos_detalle!inner(*),pos_productos_multimedia(*)
  &activo=eq.true
  &pos_productos_detalle.stock_actual=gt.0
  &deleted_at=is.null
  &order=nombre.asc
  &limit=50
```

> El campo `tags` viene incluido en `pos_productos.*`. Es un `text[]` con valores en lowercase. Ver `04-store-spec.md §3.2` para el mapeo de tags a badges.

### 4.2 Carrito

#### 4.2.1 Obtener carrito activo
```
GET /rest/v1/st_carritos
  ?cliente_id=eq.{cliente_id}
  &estado=eq.ACTIVO
  &select=*,st_carritos_detalle(*)
  &limit=1
```

#### 4.2.2 Agregar item al carrito
```
POST /rest/v1/st_carritos_detalle
```

```json
{
  "carrito_id": "uuid-carrito",
  "producto_detalle_id": "uuid-detalle",
  "cantidad": 2,
  "precio_unitario": 50000
}
```

### 4.3 Pedidos

#### 4.3.1 Crear pedido
```
POST /rest/v1/st_pedidos
Prefer: return=representation
```

```json
{
  "cliente_id": "uuid-cliente",
  "fecha_pedido": "2026-05-23",
  "estado": "PENDIENTE",
  "direccion_envio_id": "uuid-direccion",
  "subtotal": 100000,
  "impuesto": 19000,
  "costo_envio": 10000,
  "total": 129000,
  "metodo_pago_id": "uuid-metodo-pago",
  "st_pedidos_detalle": [
    {
      "producto_detalle_id": "uuid-detalle",
      "cantidad": 2,
      "precio_unitario": 50000,
      "subtotal": 100000,
      "impuesto": 19000,
      "total": 119000
    }
  ]
}
```

#### 4.3.2 Historial de pedidos del cliente
```
GET /rest/v1/st_pedidos
  ?cliente_id=eq.{cliente_id}
  &select=*,st_pedidos_detalle(*),st_envios(*)
  &order=fecha_pedido.desc
  &limit=20
```

### 4.4 Cupones

#### 4.4.1 Validar cupón
```
GET /rest/v1/st_cupones
  ?codigo=eq.{codigo}
  &activo=eq.true
  &deleted_at=is.null
  &limit=1
```

### 4.5 Reseñas

#### 4.5.1 Crear reseña
```
POST /rest/v1/st_resenas
```

```json
{
  "producto_id": "uuid-producto",
  "cliente_id": "uuid-cliente",
  "pedido_id": "uuid-pedido",
  "calificacion": 5,
  "comentario": "Excelente producto",
  "aprobada": false
}
```

#### 4.5.2 Reseñas de un producto (solo aprobadas)
```
GET /rest/v1/st_resenas
  ?producto_id=eq.{producto_id}
  &aprobada=eq.true
  &deleted_at=is.null
  &order=created_at.desc
  &limit=20
```

### 4.6 Wishlist

#### 4.6.1 Agregar a wishlist
```
POST /rest/v1/st_wishlist
```

```json
{
  "cliente_id": "uuid-cliente",
  "producto_detalle_id": "uuid-detalle"
}
```

#### 4.6.2 Eliminar de wishlist
```
DELETE /rest/v1/st_wishlist?id=eq.{id}
```

#### 4.6.3 Wishlist del cliente
```
GET /rest/v1/st_wishlist
  ?cliente_id=eq.{cliente_id}
  &select=*,pos_productos_detalle(*,pos_productos(nombre))
```

### 4.7 Envíos

#### 4.7.1 Tracking de envío
```
GET /rest/v1/st_envios?pedido_id=eq.{pedido_id}&limit=1
```

---

## 5. RPCs (Stored Procedures / Edge Functions)

### 5.1 Generar Número de Venta
```
POST /rest/v1/rpc/generar_numero_venta
```

```json
{
  "prefijo": "KBT"
}
```

**Response:**
```json
{ "numero_venta": "KBT-202605-0001" }
```

### 5.2 Validar Stock Antes de Confirmar Venta
```
POST /rest/v1/rpc/validar_stock_venta
```

```json
{
  "items": [
    { "producto_detalle_id": "uuid-1", "cantidad": 2 },
    { "producto_detalle_id": "uuid-2", "cantidad": 1 }
  ]
}
```

**Response:**
```json
{
  "valido": true,
  "errores": []
}
```

### 5.3 Calcular Finanzas del Mes
```
POST /rest/v1/rpc/calcular_finanzas_mes
```

```json
{
  "anio": 2026,
  "mes": 5
}
```

---

## 6. Checkout Flow (Guest — REST API Directa)

**Importante:** El Store NO usa Edge Functions. El checkout opera 100% via REST API directa a PostgREST con la anon key.

### 6.1 Obtener Canal Web
```
GET /rest/v1/pos_canales_venta?codigo=eq.web&limit=1
```
**Response:**
```json
[{ "id": "uuid", "nombre": "Web", "codigo": "web" }]
```

### 6.2 Buscar Cliente por Email
```
GET /rest/v1/pos_clientes?email=eq.{email}&deleted_at=is.null&limit=1
```
**Response:**
```json
[{ "id": "uuid", "primer_nombre": "Juan", "email": "juan@email.com" }]
```
Si no existe, se crea con POST.

### 6.3 Crear Cliente (si no existe)
```
POST /rest/v1/pos_clientes
Prefer: return=representation
```
**Body:**
```json
{
  "tipo_id": "NIT",
  "numero_id": "CG-{timestamp}",
  "primer_nombre": "Juan",
  "primer_apellido": "Perez",
  "email": "juan@email.com",
  "celular": "3001234567"
}
```
**Response:** `[{ "id": "uuid", ... }]`

### 6.4 Crear Dirección de Envío
```
POST /rest/v1/st_direcciones
Prefer: return=representation
```
**Body:**
```json
{
  "cliente_id": "uuid",
  "tipo": "envio",
  "nombre_destinatario": "Juan Perez",
  "telefono": "3001234567",
  "direccion": "Calle 50 #30-20",
  "ciudad": "Medellin",
  "departamento": "Antioquia",
  "pais": "Colombia"
}
```

### 6.5 Crear Pedido
```
POST /rest/v1/st_pedidos
Prefer: return=representation
```
**Body:**
```json
{
  "numero_pedido": "KBT-202606-1234",
  "cliente_id": "uuid",
  "canal_id": "uuid-del-canal-web",
  "direccion_envio_id": "uuid",
  "direccion_facturacion_id": "uuid",
  "fecha_pedido": "2026-06-08",
  "estado": "PENDIENTE",
  "subtotal": 150000,
  "descuento": 0,
  "costo_envio": 9900,
  "total": 159900,
  "notas": "Metodo de pago: transferencia"
}
```

### 6.6 Crear Detalle del Pedido (Bulk Insert)
```
POST /rest/v1/st_pedidos_detalle
Prefer: return=representation
```
**Body:** (array de objetos)
```json
[
  {
    "pedido_id": "uuid",
    "producto_detalle_id": "uuid",
    "cantidad": 2,
    "precio_unitario": 50000,
    "subtotal": 100000,
    "total": 100000
  }
]
```

### 6.7 Consultar producto_detalle_id
Se resuelve para cada item del carrito:
```
GET /rest/v1/pos_productos_detalle?producto_id=eq.{productoId}&deleted_at=is.null&limit=1
```

> **Requisito:** El rol `anon` debe tener grants INSERT y policies RLS en `pos_clientes`, `st_direcciones`, `st_pedidos` y `st_pedidos_detalle`. Ver `specs/seed-anon-grants-store.sql`.

---

## 7. Códigos de Error

| Código HTTP | Error Supabase | Significado | Causa Común |
|---|---|---|---|
| 200 | — | OK | Request exitosa |
| 201 | — | Created | Registro creado exitosamente |
| 204 | — | No Content | DELETE exitoso |
| 400 | `bad_request` | Solicitud mal formada | Filtro inválido, JSON mal formado |
| 401 | `not_authenticated` | No autenticado | Token JWT faltante o expirado |
| 404 | `not_found` | Recurso no encontrado | ID inválido o tabla no existe |
| 406 | `not_acceptable` | No aceptable | Formato de respuesta no soportado |
| 409 | `conflict` | Conflicto | Violación de unique constraint |
| 415 | `unsupported_media_type` | Tipo de contenido no soportado | Falta `Content-Type: application/json` |
| 42501 | `violates_rls_policy` | Violación de RLS | Política de seguridad bloquea la operación |
| 429 | `too_many_requests` | Demasiadas solicitudes | Rate limiting de Supabase |
| 500 | `internal_error` | Error interno del servidor | Error en Supabase |

---

## 8. Variables de Entorno (Placeholders)

| Variable | Dónde se usa | Ejemplo |
|---|---|---|
| `{{SUPABASE_URL}}` | Base URL de todas las requests | `https://abcde12345.supabase.co` |
| `{{SUPABASE_ANON_KEY}}` | Header `apikey` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `{{JWT_TOKEN}}` | Header `Authorization` | Se obtiene del login |
| `{{PROJECT_REF}}` | Identificador del proyecto | `abcde12345` |

> Estos valores se configuran en `apps/pos/js/config.js` (no versionado) a partir del template `apps/pos/js/config.ejemplo.js`.
