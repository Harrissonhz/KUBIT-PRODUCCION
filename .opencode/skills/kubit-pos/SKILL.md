---
name: kubit-pos
description: Reglas de negocio del módulo POS del ecosistema Kubit. Usar cuando se trabaje en ventas, caja, inventario, compras, facturación electrónica DIAN, finanzas mensuales o los pedidos web de la Tienda Virtual que se gestionan desde el POS.
metadata:
  module: POS
  project: Kubit
  spec: 03-pos-spec.md
  updated: 2026-11-08
---

# Módulo POS - Kubit

Este skill contiene las reglas de negocio del módulo POS (Point of Sale) del ecosistema Kubit. Gestiona ventas presenciales, control de caja, inventario, compras, facturación electrónica (DIAN) y finanzas mensuales para PYMES colombianas.

## Tablas del Módulo

Todas las tablas del módulo POS usan el prefijo `pos_*`. 24 tablas en total.

## Reglas de Negocio

### Ventas
- **Número de venta:** Formato `{prefijo_facturacion}-{año}{mes}-{correlativo}` (ej. `KBT-202605-0001`)
- **Descuento:** No puede exceder `descuento_max` definido en `pos_productos_detalle`
- **Stock:** Al confirmar una venta, se valida `stock_actual >= cantidad`. Si no hay stock suficiente, la venta no puede confirmarse
- **Múltiples métodos de pago:** Una venta puede dividirse entre varios métodos de pago (ej. 50% Efectivo + 50% Tarjeta). Se registra el método principal en `metodo_pago`
- **Cliente opcional:** Una venta puede registrarse sin cliente (venta al público general)
- **Estados de venta:** PENDIENTE → CONFIRMADA → FACTURADA | ANULADA

### Caja
- Cada sesión de caja tiene: apertura, ingresos, egresos, ventas, y cierre
- Al abrir caja se registra el `monto_inicial`
- Al cerrar, se valida el `monto_final_esperado` vs `monto_final_real`
- Diferencia se registra como sobrante o faltante

### Inventario
- Cada producto tiene `stock_actual` y `stock_minimo`
- Al caer por debajo del mínimo se genera alerta de reorden
- El inventario se descuenta al CONFIRMAR (no al crear) una venta
- Las compras ingresan inventario al confirmar recepción

### Facturación Electrónica (DIAN)
- Integración con resolución de facturación de la DIAN
- La factura se emite contra la DIAN al pasar venta a estado FACTURADA
- Se requiere configuración de resolución vigente en `pos_configuracion_empresa`

### Finanzas Mensuales
- Cálculo automático de ingresos, costos, gastos y utilidad por mes
- Basado en ventas CONFIRMADAS y FACTURADAS del período

### Pedidos web de la Tienda (T4, 2026-11-08)
- La Tienda Virtual crea pedidos `PENDIENTE` en `st_pedidos`. El POS **avisa y muestra** esos pedidos; la gestión es por **WhatsApp** y la venta se registra a mano en Ventas con el canal **Web** (cliente creado en Clientes, o `222222222222`).
- **El pedido web y su cierre no mueven inventario, no crean ventas ni clientes.** El stock solo cambia con la venta registrada en el POS.
- Pantalla `pedidos-web.html` (`js/paginas/pedidos-web.js`): pestañas "Por gestionar" y "Gestionados (30 días)", tarjetas `<details>` cerradas por defecto, "Escribir por WhatsApp", "Copiar datos del cliente" y "Cerrar pedido".
- Cerrar: "Venta registrada" → `CONFIRMADO` o "No se concretó" → `CANCELADO` (sin motivo); número de venta opcional (se valida contra `pos_ventas` y se guarda en `st_pedidos.venta_id`); nota opcional (500). Solo se cierran pedidos `PENDIENTE`.
- Aviso: `js/compartido/pedidos-web-aviso.js` (independiente y de solo lectura; lo carga `database.js` desde `cargarLinkTienda()`): enlace "Pedidos web (N)" debajo de Dashboard, tarjeta en el Panel y aviso emergente **una vez por inicio de sesión**. Si falla, no muestra nada ni redirige.
- Datos: el POS **no lee** `st_pedidos`, `st_pedidos_detalle` ni `st_direcciones` directo. Usa `DB.pedidosWeb` (`contar`, `listar`, `detalle`, `cerrar`) → funciones `pos_pedidos_web_contar`, `pos_pedidos_web_listar`, `pos_pedido_web_detalle` y `pos_pedido_web_cerrar` (`specs/18-pos-pedidos-web.sql`, solo `authenticated`; exigen un usuario activo de `pos_usuarios` con el mismo `id` que `auth.users`).
- Errores `[POS_xxx]`; contratos en `specs/11-api-contracts.md` §10. Reglas completas: `AGENTS.md` §5.2 y `specs/03-pos-spec.md` §14.
- Tests: `node --test tests/pos/*.test.mjs` (`.mjs`; Vitest no toma los tests de pedidos web).

## Convenciones

- El prefijo de facturación por defecto es `KBT`
- El formato de serie es el mismo prefijo
- Todos los IDs son UUID v4
- Soft delete con `deleted_at` nullable
