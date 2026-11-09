# Roadmap de Implementación — Ecosistema Kubit

## Principios Rectores

1. **Cada fase produce un incremento funcional y testeable.** No se requiere la app completa para considerar un avance.
2. **No se avanza a la siguiente fase hasta que la actual cumple su criterio de éxito.** Esto garantiza calidad y evita deuda técnica.
3. **Si una especificación falta durante implementación, se completa la spec primero.** SDD estricto.
4. **Store solo comienza cuando POS Fase 9 está completo.**
5. **Academy solo comienza cuando Store está completo.**
6. **Tiempos estimados son para un desarrollador full-time + IA.** Ajustar según disponibilidad.

---

## Fase 0: Fundación — Setup (Día 1)

### Objetivo
Tener el esqueleto del proyecto corriendo en los tres servicios (Supabase, Vercel, GitHub).

### Dependencias
- Ninguna (es la primera fase).

### Archivos a crear/modificar
- `README.md` — instrucciones de setup.
- `supabase/config.toml` — si aplica.
- Seed SQL script (insertar 1 sucursal, 1 caja, 1 usuario admin, roles y permisos base).

### Pasos
1. Crear proyecto en Supabase (plan gratuito).
2. Crear proyecto en Vercel (plan gratuito), conectado a GitHub.
3. En Supabase SQL Editor, ejecutar `02-database-schema.sql` completo.
4. Ejecutar script de seed mínimo:
   - 1 sucursal (`pos_sucursales`)
   - 1 caja (`pos_cajas`)
   - 1 rol admin (`pos_roles`)
   - 1 permiso por tabla (`pos_permisos` y `pos_rol_permisos`)
   - 1 usuario admin (`pos_usuarios` + Supabase Auth)
5. Copiar `apps/pos/js/config.ejemplo.js` → `apps/pos/js/config.js` con credenciales reales de Supabase.
6. Deployar a Vercel (la app carga aunque solo muestre una página vacía).

### Criterio de Éxito
- La app carga en `https://<proyecto>.vercel.app` sin errores en consola del navegador.
- `supabase.js` se conecta a la base de datos sin errores de CORS ni autenticación.

### Tiempo estimado: 1 día

---

## Fase 1: Auth + Shell (Días 2-3)

### Objetivo
Toda la infraestructura de autenticación y navegación lista. El usuario puede loguearse, ver el dashboard y navegar entre secciones (aunque estén vacías).

### Dependencias
- Fase 0 completada.

### Archivos a crear
- `apps/pos/login.html` + `apps/pos/js/paginas/login.js`
- `apps/pos/js/compartido/auth.js` — manejo de sesión (Supabase Auth)
- `apps/pos/js/compartido/navbar.js` — navegación principal (responsive, mobile-first)
- `apps/pos/js/compartido/modal.js` — sistema de modales reutilizables
- `apps/pos/js/compartido/utils.js` — formato moneda, fechas, manejo de errores
- `apps/pos/index.html` — dashboard con cards de acceso rápido a módulos
- `apps/pos/js/paginas/dashboard.js`

### Reglas de navegación
- Si no hay sesión activa → redirigir a `login.html`.
- Si hay sesión activa en login → redirigir a `index.html`.
- Navbar debe ser responsiva: hamburger menu en móvil, enlaces horizontales en desktop.

### Criterio de Éxito
- Usuario se registra o inicia sesión con email/contraseña.
- Tras login, ve el dashboard con cards (Productos, Ventas, Caja, Clientes, etc.).
- Puede navegar a cada sección (aunque diga "En construcción").
- Cierra sesión y vuelve al login.
- Todo funciona en pantalla de 360px de ancho.

### Tiempo estimado: 2 días

---

## Fase 2: POS — Catálogo de Productos (Días 4-6)

### Objetivo
CRUD completo de productos con variantes, categorías y búsqueda.

### Dependencias
- Fase 1 completada (sesión y navegación).

### Archivos a crear
- `apps/pos/productos.html`
- `apps/pos/js/paginas/productos.js` — listar, crear, editar, desactivar
- `apps/pos/js/paginas/productos-categoria.js` — CRUD de categorías (modal)

### Funcionalidad
- Tabla con paginación, búsqueda por nombre/código.
- Modal de creación/edición de producto.
- Soporte para variantes (talla, color, etc.) desde `pos_productos_detalle`.
- Soporte para imágenes (URL externa, siguiendo `04-store-spec.md`).
- Categorías: listado inline, modal para agregar/editar.
- Soft delete (`deleted_at`), no destrucción física.

### Criterio de Éxito
- Crear un producto con 2 variantes (ej: "Camisa Negra M" y "Camisa Negra L").
- Verlo en la lista con su categoría y precio.
- Editarlo (cambiar nombre, precio).
- Desactivarlo (soft delete) y ver que desaparece del listado activo.

### Tiempo estimado: 3 días

---

## Fase 3: POS — Clientes (Días 7-8)

### Objetivo
Gestión completa de clientes: CRUD, búsqueda, modal de selección rápida para usar en ventas.

### Dependencias
- Fase 1 completada.

### Archivos a crear
- `apps/pos/clientes.html`
- `apps/pos/js/paginas/clientes.js`

### Funcionalidad
- Lista de clientes con paginación.
- Búsqueda por número de identificación (cédula/RUC), nombre o email.
- Modal de creación/edición.
- Modal de selección rápida (`seleccionar-cliente-modal`) — reutilizable en ventas.
- Soft delete.

### Criterio de Éxito
- Crear 3 clientes con distintos tipos de ID.
- Buscar por número de identificación y encontrarlo.
- Editar dirección y teléfono.
- Modal de selección abre y selecciona un cliente correctamente.

### Tiempo estimado: 2 días

---

## Fase 4: POS — Ventas (Días 9-14)

### ⬅️ **MVP CORE — El flujo más crítico del negocio**

### Objetivo
Flujo completo de venta: buscar productos, armar carrito, seleccionar cliente, cobrar, descontar stock, imprimir ticket.

### Dependencias
- Fase 2 (productos) y Fase 3 (clientes) completadas.

### Archivos a crear
- `apps/pos/ventas.html`
- `apps/pos/js/paginas/ventas.js` — toda la lógica del punto de venta
- `apps/pos/js/compartido/ticket.js` — generación de ticket imprimible
- `apps/pos/ventas-historial.html` — histórico de ventas
- `apps/pos/js/paginas/ventas-historial.js`

### Funcionalidad — Pantalla de Cobro
- **Buscador de productos:** búsqueda rápida por nombre/código con resultados en dropdown.
- **Carrito lateral:** productos agregados con cantidad, precio unitario, subtotal. Botón para quitar.
- **Totales en vivo:** subtotal, descuento (si aplica), impuesto, total.
- **Selección de cliente:** modal reutilizable de Fase 3 (opcional — permitir venta sin cliente como "Consumidor Final").
- **Métodos de pago:** selector de `pos_metodos_pago` (Efectivo, Tarjeta, Transferencia, etc.).
- **Confirmación:** modal de resumen antes de finalizar.
- **Post-venta:**
  - Descuenta stock en `pos_productos_detalle`.
  - Registra movimiento en `pos_movimientos_inventario`.
  - Guarda venta en `pos_ventas` y detalle en `pos_ventas_detalle`.
  - Muestra botón/imprimir ticket.

### Funcionalidad — Historial de Ventas
- Lista paginada de ventas.
- Filtros por fecha, cliente, método de pago.
- Click para ver detalle (productos, cantidades, totales).
- Opción de reimprimir ticket.

### Criterio de Éxito
- Flujo completo exitoso:
  1. Abrir pantalla de venta.
  2. Buscar "Camisa" y ver resultados.
  3. Agregar 2 unidades al carrito.
  4. Seleccionar cliente existente.
  5. Elegir método de pago "Efectivo".
  6. Confirmar venta.
  7. Ticket se genera (o se muestra vista previa).
  8. Stock del producto disminuye en 2.
  9. Venta aparece en el historial.
  10. Detalle de venta muestra los productos correctos.

### Tiempo estimado: 6 días

---

## Fase 5: POS — Caja (Días 15-17)

### Objetivo
Gestión de apertura y cierre de caja, con control de diferencias.

### Dependencias
- Fase 4 (ventas) completada (la caja depende de las ventas para calcular el cierre).

### Archivos a crear
- `apps/pos/caja.html`
- `apps/pos/js/paginas/caja.js`

### Funcionalidad
- **Apertura de caja:**
  - Seleccionar sucursal y caja (de `pos_cajas`).
  - Ingresar monto inicial en efectivo.
  - Registrar apertura en `pos_caja_apertura`.
- **Cierre de caja:**
  - Mostrar resumen: ventas del turno, métodos de pago, totales.
  - Solicitar conteo final de efectivo.
  - Calcular diferencia automática.
  - Registrar cierre.
- **Historial:** lista de aperturas/cierres con fechas, montos, diferencias.

### Criterio de Éxito
- Abrir caja con $100.00 iniciales.
- Realizar 2 ventas desde Fase 4 (una en efectivo, otra en tarjeta).
- Cerrar caja: el sistema muestra el total esperado, el usuario ingresa el conteo real.
- Diferencia calculada correctamente.
- Cierre registrado en historial.

### Tiempo estimado: 3 días

---

## Fase 6: POS — Compras e Inventario (Días 18-21)

### Objetivo
Gestión de proveedores, órdenes de compra y control de inventario.

### Dependencias
- Fase 2 (productos) completada.

### Archivos a crear
- `apps/pos/proveedores.html` + `apps/pos/js/paginas/proveedores.js`
- `apps/pos/compras.html` + `apps/pos/js/paginas/compras.js`
- `apps/pos/inventario.html` + `apps/pos/js/paginas/inventario.js`

### Funcionalidad
- **Proveedores:** CRUD completo (nombre, contacto, teléfono, email).
- **Órdenes de compra:**
  - Crear orden con productos y cantidades.
  - Estado: Pendiente → Recibida → Cancelada.
  - Al recibir: actualiza stock en `pos_productos_detalle` y registra movimiento en `pos_movimientos_inventario`.
- **Inventario:**
  - Vista de stock actual por producto/variante.
  - Bitácora de movimientos (venta, compra, ajuste).
  - Alertas de stock bajo (configurable por producto).
- **Ajustes de inventario:** para correcciones manuales (con registro en movimientos).

### Criterio de Éxito
- Crear un proveedor.
- Crear orden de compra para "Camisa Negra M" (cantidad 10).
- Recibir la orden → stock de "Camisa Negra M" aumenta en 10.
- Movimiento registrado en la bitácora.
- Establecer stock mínimo en 5, vender 6 unidades → alerta de stock bajo visible en dashboard.

### Tiempo estimado: 4 días

---

## Fase 7: POS — Facturación (Días 22-24)

### Objetivo
Emisión y anulación de facturas electrónicas desde ventas confirmadas.

### Dependencias
- Fase 4 (ventas) completada.

### Archivos a crear
- `apps/pos/facturacion.html`
- `apps/pos/js/paginas/facturacion.js`

### Funcionalidad
- **Emitir factura:**
  - Desde una venta confirmada, generar factura en `pos_facturacion`.
  - Mostrar datos del cliente (desnormalizados en `cliente_data` para histórico).
  - Número de factura secuencial (autogenerado).
- **Historial de facturas:** listado con filtros por fecha, cliente, estado.
- **Anular factura:**
  - Cambiar estado a "Anulada".
  - Revertir el inventario descontado (registrar movimiento inverso).
  - Registrar en bitácora de movimientos.

### Nota técnica
- La integración con entidades tributarias (SRI/SAT/DGI) no se implementa en esta fase. La factura es un registro interno que puede exportarse posteriormente.

### Criterio de Éxito
- Venta confirmada desde Fase 4.
- Emitir factura desde esa venta → número asignado correctamente.
- Ver factura en el historial.
- Anular factura → stock revertido, venta marcada como anulada.

### Tiempo estimado: 3 días

---

## Fase 8: POS — Reportes y Finanzas (Días 25-27)

### Objetivo
Dashboard financiero con indicadores clave del negocio.

### Dependencias
- Fases 4, 5, 6 y 7 completadas (reportes necesitan datos de ventas, caja, compras y facturación).

### Archivos a crear
- `apps/pos/reportes.html`
- `apps/pos/js/paginas/reportes.js`

### Funcionalidad
- **Dashboard del día:** ventas hoy, ticket promedio, métodos de pago.
- **Resumen semanal/mensual:** gráfica de ventas (usando Canvas o Chart.js vía CDN).
- **Costos y utilidad:** costo de ventas vs ingresos (basado en compras e inventario).
- **Gastos por categoría:** si se implementan gastos.
- **Exportar a CSV:** botón para descargar cualquier tabla de reporte.

### Criterio de Éxito
- Dashboard muestra ventas del mes correctas.
- Ticket promedio calculado correctamente (total ventas / número ventas).
- Costos vs utilidad coinciden con los datos ingresados.
- CSV descargable con datos correctos.

### Tiempo estimado: 3 días

---

## Fase 9: POS — Refinamiento y PWA (Días 28-30)

### Objetivo
Pulir la experiencia, asegurar que funciona en móviles táctiles y convertir la app en una PWA instalable.

### Dependencias
- Fases 0-8 completadas.

### Archivos a crear/modificar
- `apps/pos/manifest.json` — configuración PWA
- `apps/pos/service-worker.js` — caché de recursos estáticos
- Iconos de la app (192x192, 512x512) — SVG minimalista
- `apps/pos/compartido/loading.js` — skeleton loaders

### Funcionalidad
- **Responsive:** verificar todas las pantallas en 360px. Botones de tamaño táctil (mín 44x44px).
- **Estados de carga:** skeleton loaders mientras se cargan datos.
- **Estados vacíos:** mensaje amigable cuando no hay datos ("No hay ventas hoy").
- **Confirmaciones:** antes de eliminar/desactivar/anular.
- **Manejo de errores:** toast notifications para errores de red, validación, etc.
- **PWA:**
  - `manifest.json` con nombre, íconos, tema color.
  - `service-worker.js` que cachea HTML, JS, CSS para funcionar offline parcial.
  - Botón "Instalar app" en navegadores compatibles.

### Criterio de Éxito
- Todas las pantallas del POS funcionan correctamente en Chrome DevTools emulando Moto G4 (360x640).
- La app muestra skeleton loaders durante carga de datos.
- Aparece el prompt de instalación de PWA (o se puede instalar manualmente).
- Con service worker activo, la app carga al menos el shell sin conexión a internet.

### Tiempo estimado: 3 días

---

## Store (Post-MVP POS)

---

## Fase 10: Store — Setup y Catálogo Público (Semanas 5-6)

### Objetivo
Crear la tienda virtual pública con catálogo de productos, detalle y SEO básico.

### Dependencias
- POS Fase 9 completada.
- Tablas compartidas (`pos_productos`, `pos_productos_detalle`, `pos_categorias`, `pos_multimedia`) ya existen y tienen datos.

### Archivos a crear
- `apps/store/index.html` — catálogo público
- `apps/store/producto.html` — detalle de producto
- `apps/store/js/paginas/catalogo.js`
- `apps/store/js/paginas/producto-detalle.js`
- `apps/store/js/compartido/header.js` — header público (sin auth)

### Funcionalidad
- **Catálogo público:** lista de productos activos, con imágenes, precios y categorías.
- **Búsqueda y filtros:** por nombre, categoría, rango de precio.
- **Detalle de producto:** imágenes, descripción, variantes (talla/color), precio, stock disponible.
- **SEO:** meta tags, slugs en URLs, schema.org/Product.

### Criterio de Éxito
- Catálogo carga sin necesidad de autenticación.
- Búsqueda encuentra productos por nombre parcial.
- Producto con variantes se muestra correctamente.
- La URL del producto es legible (`/producto/camisa-negra-m`).

### Tiempo estimado: 2 semanas

---

## Fase 11: Store — Carrito y Checkout (Semana 7)

### Objetivo
Carrito de compras persistente y flujo de checkout completo.

### Dependencias
- Fase 10 completada.

### Archivos a crear
- `apps/store/carrito.html` + `apps/store/js/paginas/carrito.js`
- `apps/store/checkout.html` + `apps/store/js/paginas/checkout.js`
- `apps/store/js/compartido/carrito-state.js` — estado del carrito

### Funcionalidad
- **Carrito:** persiste en localStorage + respaldo en DB si hay sesión.
- **Checkout:**
  - Guest checkout (sin registro).
  - Registro rápido durante checkout.
  - Direcciones de envío.
  - Cupones de descuento (si aplica).
- **Transición a pedido:** al confirmar, crear en `st_pedidos` y `st_pedidos_detalle`.

### Criterio de Éxito
- Agregar producto al carrito → ver en carrito.
- Cerrar navegador → abrir de nuevo → carrito persiste.
- Checkout como guest permite comprar sin registro.
- Pedido creado en base de datos.

### Tiempo estimado: 1 semana

---

## Fase 12: Store — Pedidos y Pagos (Semana 8)

### Objetivo
Integración de pagos y gestión de pedidos.

### Dependencias
- Fase 11 completada.

### Archivos a crear
- `apps/store/pedidos.html` — historial del cliente
- `apps/store/pedido-detalle.html` — detalle y tracking
- `apps/store/js/paginas/pedidos.js`
- `apps/store/js/compartido/pago.js` — lógica de pago

### Funcionalidad
- **Pagos:** integración con pasarela (consultar al usuario cuál usar — Stripe/Mercado Pago/otro).
- **Pedidos:** panel del cliente con historial, estado actual, tracking.
- **Wishlist:** lista de deseos (`st_wishlist`).
- **Reseñas:** sistema de calificación y comentarios por producto (`st_resenas`).

### Criterio de Éxito
- Pedido completado exitosamente.
- Cliente puede ver su pedido en el panel.
- Wishlist funcional (agregar/remover).
- Reseña visible en producto.

### Tiempo estimado: 1 semana

---

## Store — Estado real y plan de mejora (actualizado 2026-11-08)

> Las Fases 10 a 12 de arriba describen el plan original. La tienda se publico con catalogo, carrito y checkout como invitado, y desde octubre de 2026 se mejora por el plan **T1 a T6** de `apps/store/specs/hallazgos-tienda.md`. Decisiones que cambian el plan original: sin pasarela integrada (pago manual por transferencia Bre-B, Tu Link de Mercado Pago o contraentrega), sin cuentas de cliente, el pedido web no mueve inventario (la venta se registra en el POS).

| Fase | Contenido | Estado |
|---|---|---|
| T1 Correcciones rapidas | Variantes en carrito y pedido, precio por variante, agotados y eliminados | Hecho 2026-10-28 (`f7ce184`) |
| T2 Pedido seguro | `st_crear_pedido`, cierre de acceso anonimo, numero por secuencia, cliente generico | Hecho 2026-11-03 (`b3bc908`) |
| T3a WhatsApp y paginacion | "Preguntar por WhatsApp" en la ficha, paginacion estable | Hecho 2026-11-08 (`92dc65b`, `272bc1d`) |
| T3b Checkout coherente | Envio por zona, envio gratis, pedido minimo, 3 medios de pago, confirmacion con WhatsApp | Hecho 2026-11-08 (`679251a`) |
| T4 Pedidos web en el POS | Aviso al entrar, contador en el menu, tarjeta en el Panel, `pedidos-web.html`, WhatsApp y cierre del pedido (venta registrada o no se concreto) | Hecho 2026-11-08 (`1bddcb5`) |
| ST-31 Configuracion de la tienda en el POS | Pantalla para editar tarifas, llave y link sin SQL (propuesta; requiere funciones que validen administrador) | Pendiente (sin aprobar) |
| T5 Alcance y rendimiento | Busqueda por SKU y sin tildes, SEO/Open Graph, consultas mas livianas, Tailwind compilado, service worker, iconos PNG | Pendiente |
| T6 Deuda tecnica | Escape de HTML, codigo duplicado, `01-schema.sql` alineado con politicas, ST-30, RA-04 | Pendiente |

## Academy (Post-Store)

---

## Fase 13: Academy — Sin fecha definida

### Objetivo
Módulo de aprendizaje con cursos, lecciones y progreso de estudiantes.

### Dependencias
- Store (Fases 10-12) completado.

### Pasos previos
1. Crear `specs/06-academy-spec.md` con especificación completa.
2. Definir tablas con prefijo `academy_*`.
3. Crear estructura `apps/academy/` siguiendo `10-codex.md`.

### Tiempo estimado: (por determinar)

---

## Hitos Verificables — Resumen para IA

| Hito | Fase | ¿Qué verificar? |
|---|---|---|
| **Setup OK** | 0 | App deployada en Vercel, sin errores en consola. |
| **Login funcional** | 1 | Usuario loguea, ve dashboard, navega, cierra sesión. |
| **Producto CRUD** | 2 | Producto creado con 2 variantes, listado, editado, desactivado. |
| **Cliente CRUD** | 3 | Cliente creado, buscado por ID, editado. |
| **Venta completa** | 4 | Venta creada desde selección de productos → cliente → pago → stock descontado. |
| **Caja operativa** | 5 | Caja abierta → ventas → cierre con diferencia calculada. |
| **Compra recibida** | 6 | Orden de compra creada, recibida → stock actualizado. |
| **Factura emitida** | 7 | Factura creada desde venta, visible en historial, anulable. |
| **Reportes correctos** | 8 | Dashboard financiero con números que coinciden con datos ingresados. |
| **POS terminado** | 9 | Instalable como PWA, funcional en mobile 360px, skeleton loaders visibles. |
| **Store catálogo** | 10 | Catálogo público sin auth, búsqueda funciona, detalle con variantes y SEO. |
| **Store checkout** | 11 | Carrito persiste, checkout como guest crea pedido en DB. |
| **Store pago completo** | 12 | Pedido pagado, tracking visible, wishlist y reseñas funcionales. |

---

## Historial de Cambios

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-05-23 | 1.0 | Versión inicial del roadmap con 9 fases POS + 3 fases Store + Academy reservada. |
| 2026-11-08 | 1.1 | Seccion "Store — Estado real y plan de mejora" con las fases T1 a T6 de la tienda. |
| 2026-11-08 | 1.2 | T4 (pedidos web en el POS) hecha; ST-31 queda como propuesta aparte. |
