/* ============================================================
   database.test.js — Tests de ejemplo para database.js
   ============================================================
   Patrones demostrados:
     - Happy path (datos validos)
     - Sad path (errores de API)
     - Cache (primera llamada vs segunda)
     - Validacion de negocio (stock negativo)
     - Mutacion con invalidacion de cache
     - URL query string verification
   ============================================================ */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);

// ─── Cargar database.js real SIN el bloque auto-ejecutable del logo ──
// Esto evita que el cargador de logo se ejecute en cada re-evaluacion
var dbCode = readFileSync(
  resolve(__dirname, '../../apps/pos/js/compartido/database.js'),
  'utf-8'
);

// Extraer solo el IIFE principal, omitiendo el auto-loader del logo
var autoLoaderStart = dbCode.lastIndexOf('/* ════════════════════════════════════════════════');
var cleanCode = autoLoaderStart > 0 ? dbCode.substring(0, autoLoaderStart) : dbCode;

function recargarDB() {
  delete window.DB;
  eval(cleanCode);
  return window.DB;
}

var DB = recargarDB();

// ─── Reiniciar DB antes de cada test (cache, estado interno) ──
beforeEach(function () {
  vi.clearAllMocks();
  DB = recargarDB();
});

// ═══════════════════════════════════════════════════════════════
// DB.productos
// ═══════════════════════════════════════════════════════════════
describe('DB.productos', function () {

  describe('listar()', function () {

    it('retorna productos activos (happy path)', async function () {
      var mock = [
        { id: '1', nombre: 'Coca Cola', precio: 3000, categoria: { id: 'c1', nombre: 'Bebidas' } },
        { id: '2', nombre: 'Papa Frita', precio: 2500, categoria: { id: 'c2', nombre: 'Snacks' } }
      ];
      window.__supabase.get.mockResolvedValue(mock);

      var res = await DB.productos.listar();

      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(2);
      expect(res.data[0].nombre).toBe('Coca Cola');
    });

    it('maneja error 500 de API (sad path)', async function () {
      window.__supabase.get.mockRejectedValue(new Error('Supabase 500: Internal Server Error'));

      var res = await DB.productos.listar();

      expect(res.error).toBe('Supabase 500: Internal Server Error');
      expect(res.data).toEqual([]);
    });

    it('construye URL con soft-delete filter', async function () {
      window.__supabase.get.mockResolvedValue([]);

      await DB.productos.listar();

      expect(window.__supabase.get).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at=is.null')
      );
    });

    it('filtra por categoria si se pasa categoriaId', async function () {
      window.__supabase.get.mockResolvedValue([]);

      await DB.productos.listar({ categoriaId: 'cat-1' });

      var llamada = window.__supabase.get.mock.calls[0][0];
      expect(llamada).toContain('categoria_id=eq.cat-1');
    });

  });

  describe('obtener()', function () {

    it('retorna un producto por ID', async function () {
      window.__supabase.get.mockResolvedValue([
        { id: '1', nombre: 'Coca Cola', precio: 3000 }
      ]);

      var res = await DB.productos.obtener('1');

      expect(res.error).toBeNull();
      expect(res.data.nombre).toBe('Coca Cola');
      expect(window.__supabase.get).toHaveBeenCalledWith(
        expect.stringContaining('id=eq.1')
      );
    });

    it('retorna null si no existe', async function () {
      window.__supabase.get.mockResolvedValue([]);

      var res = await DB.productos.obtener('inexistente');

      expect(res.data).toBeNull();
    });

  });

  describe('buscar()', function () {

    it('busca por termino con ilike', async function () {
      window.__supabase.get.mockResolvedValue([
        { id: '1', nombre: 'Coca Cola' }
      ]);

      await DB.productos.buscar('coca');

      var llamada = window.__supabase.get.mock.calls[0][0];
      expect(llamada).toContain('or=(nombre.ilike');
      expect(llamada).toContain('%25coca%25');
    });

  });

  describe('crear()', function () {

    it('inserta producto y devuelve datos', async function () {
      window.__supabase.post.mockResolvedValue([{ id: 'nuevo-1', nombre: 'Nuevo Producto' }]);

      var res = await DB.productos.crear({ nombre: 'Nuevo Producto', precio: 5000 });

      expect(res.error).toBeNull();
      expect(res.data[0].id).toBe('nuevo-1');
      expect(window.__supabase.post).toHaveBeenCalledWith(
        'pos_productos',
        { nombre: 'Nuevo Producto', precio: 5000 }
      );
    });

    it('maneja error de insercion', async function () {
      window.__supabase.post.mockRejectedValue(new Error('Duplicate key'));

      var res = await DB.productos.crear({ nombre: 'Duplicado' });

      expect(res.error).toBe('Duplicate key');
      expect(res.data).toBeNull();
    });

  });

  describe('ajustarStock()', function () {

    it('reduce stock y registra movimiento', async function () {
      window.__supabase.get.mockResolvedValue([{ id: 'd1', producto_id: '1', stock_actual: 10 }]);
      window.__supabase.patch.mockResolvedValue([{ id: 'd1', stock_actual: 8 }]);
      window.__supabase.post.mockResolvedValue([{ id: 'm1' }]);

      var res = await DB.productos.ajustarStock('d1', -2, 'salida_venta', 'Venta #001');

      expect(res.error).toBeNull();
      expect(res.data.stock_anterior).toBe(10);
      expect(res.data.stock_nuevo).toBe(8);
      expect(window.__supabase.post).toHaveBeenCalledWith(
        'pos_movimientos_inventario',
        expect.objectContaining({
          producto_detalle_id: 'd1',
          tipo_movimiento: 'salida_venta',
          cantidad: 2
        })
      );
    });

    it('rechaza stock si resultado seria negativo', async function () {
      window.__supabase.get.mockResolvedValue([{ id: 'd1', producto_id: '1', stock_actual: 3 }]);

      var res = await DB.productos.ajustarStock('d1', -10, 'salida_venta', 'Venta fallida');

      expect(res.error).toBe('Stock no puede ser negativo');
      expect(window.__supabase.patch).not.toHaveBeenCalled();
      expect(window.__supabase.post).not.toHaveBeenCalled();
    });

    it('incrementa stock en devoluciones', async function () {
      window.__supabase.get.mockResolvedValue([{ id: 'd1', producto_id: '1', stock_actual: 5 }]);
      window.__supabase.patch.mockResolvedValue([{ id: 'd1', stock_actual: 7 }]);
      window.__supabase.post.mockResolvedValue([{ id: 'm1' }]);

      var res = await DB.productos.ajustarStock('d1', 2, 'devolucion_venta', 'Devolucion #001');

      expect(res.data.stock_anterior).toBe(5);
      expect(res.data.stock_nuevo).toBe(7);
    });

  });

});

// ═══════════════════════════════════════════════════════════════
// DB.categorias
// ═══════════════════════════════════════════════════════════════
describe('DB.categorias', function () {

  it('filtra solo activas por defecto en URL', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.categorias.listar();

    expect(window.__supabase.get).toHaveBeenCalledWith(
      expect.stringContaining('activa=eq.true')
    );
  });

  it('usa cache en segunda llamada', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', nombre: 'Bebidas', activa: true }
    ]);

    await DB.categorias.listar();
    window.__supabase.get.mockClear();
    await DB.categorias.listar();

    expect(window.__supabase.get).not.toHaveBeenCalled();
  });

  it('invalida cache al crear categoria', async function () {
    window.__supabase.get.mockResolvedValue([]);
    window.__supabase.post.mockResolvedValue([{ id: 'n1', nombre: 'Nueva' }]);

    await DB.categorias.listar();
    window.__supabase.get.mockClear();
    await DB.categorias.crear({ nombre: 'Nueva' });
    await DB.categorias.listar();

    // Cache invalido al crear, debe llamar API de nuevo
    expect(window.__supabase.get).toHaveBeenCalled();
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.ventas
// ═══════════════════════════════════════════════════════════════
describe('DB.ventas', function () {

  describe('crearConDetalles()', function () {

    it('crea venta con sus detalles', async function () {
      window.__supabase.post
        .mockResolvedValueOnce([{ id: 'v-1', numero_venta: 'FV-001', total: 50000 }])
        .mockResolvedValueOnce([{ id: 'd-1' }]);

      var res = await DB.ventas.crearConDetalles(
        { total: 50000, metodo_pago: 'efectivo' },
        [{ producto_detalle_id: 'pd-1', cantidad: 2, precio_unitario: 25000 }]
      );

      expect(res.error).toBeNull();
      expect(res.data.id).toBe('v-1');
      expect(window.__supabase.post).toHaveBeenCalledWith(
        'pos_ventas_detalle',
        expect.arrayContaining([
          expect.objectContaining({ venta_id: 'v-1' })
        ])
      );
    });

    it('retorna error si la venta no se crea', async function () {
      window.__supabase.post.mockResolvedValue(null);

      var res = await DB.ventas.crearConDetalles(
        { total: 50000 },
        [{ producto_detalle_id: 'pd-1', cantidad: 2, precio_unitario: 25000 }]
      );

      expect(res.error).toBe('Error al crear venta');
      expect(res.data).toBeNull();
    });

  });

  describe('listar()', function () {

    it('filtra por estado usando getWithMeta (paginacion default)', async function () {
      window.__supabase.getWithMeta.mockResolvedValue({ data: [], total: 0 });

      await DB.ventas.listar({ estado: 'CONFIRMADA' });

      expect(window.__supabase.getWithMeta).toHaveBeenCalledWith(
        expect.stringContaining('estado=eq.CONFIRMADA'),
        expect.objectContaining({ page: 1, pageSize: 20 })
      );
    });

    it('filtra por rango de fechas', async function () {
      window.__supabase.getWithMeta.mockResolvedValue({ data: [], total: 0 });

      await DB.ventas.listar({
        desde: '2026-01-01',
        hasta: '2026-06-30'
      });

      var url = window.__supabase.getWithMeta.mock.calls[0][0];
      expect(url).toContain('fecha_venta=gte.2026-01-01');
      expect(url).toContain('fecha_venta=lte.2026-06-30');
    });

  });

  describe('anular()', function () {

    it('cambia estado a ANULADA', async function () {
      window.__supabase.patch.mockResolvedValue([{ id: 'v-1', estado: 'ANULADA' }]);

      var res = await DB.ventas.anular('v-1');

      expect(res.error).toBeNull();
      expect(window.__supabase.patch).toHaveBeenCalledWith(
        'pos_ventas?id=eq.v-1',
        { estado: 'ANULADA' }
      );
    });

  });

});

// ═══════════════════════════════════════════════════════════════
// DB.proveedores
// ═══════════════════════════════════════════════════════════════
describe('DB.proveedores', function () {

  it('lista proveedores ordenados por razon_social', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', razon_social: 'Proveedor A' },
      { id: '2', razon_social: 'Proveedor B' }
    ]);

    var res = await DB.proveedores.listar();

    expect(res.data).toHaveLength(2);
    expect(window.__supabase.get).toHaveBeenCalledWith(
      expect.stringContaining('order=razon_social.asc')
    );
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.compras
// ═══════════════════════════════════════════════════════════════
describe('DB.compras', function () {

  it('obtener() trae orden con cabecera', async function () {
    window.__supabase.get.mockResolvedValue([{
      id: 'c-1',
      estado: 'PENDIENTE',
      proveedor: { id: 'p-1', nombre: 'Prov A' }
    }]);

    var res = await DB.compras.obtener('c-1');

    expect(res.data.estado).toBe('PENDIENTE');
    expect(res.error).toBeNull();
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.clientes
// ═══════════════════════════════════════════════════════════════
describe('DB.clientes', function () {

  it('busca clientes por numero de ID', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', numero_id: '12345', primer_nombre: 'Juan' }
    ]);

    var res = await DB.clientes.listar({ search: '12345' });

    expect(res.data).toHaveLength(1);
    expect(res.data[0].numero_id).toBe('12345');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.clientes — EXTENDIDO
// ═══════════════════════════════════════════════════════════════
describe('DB.clientes — EXT', function () {

  it('TC-CLI-01: crear() envia tipo_id, numero_id, primer_nombre, email', async function () {
    var input = {
      tipo_id: 'CC',
      numero_id: '1010202030',
      primer_nombre: 'Juan',
      primer_apellido: 'Perez',
      email: 'juan.perez@example.com'
    };
    window.__supabase.post.mockResolvedValue([{ id: 'new-cli-1', ...input }]);

    var res = await DB.clientes.crear(input);

    expect(res.error).toBeNull();
    expect(res.data[0].tipo_id).toBe('CC');
    expect(res.data[0].numero_id).toBe('1010202030');
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_clientes', input);
  });

  it('TC-CLI-02: maneja error de identificacion duplicada', async function () {
    window.__supabase.post.mockRejectedValue(new Error('duplicate key value violates unique constraint'));

    var res = await DB.clientes.crear({
      numero_id: '1010202030',
      primer_nombre: 'Otro'
    });

    expect(res.error).toBeTruthy();
    expect(res.error).toContain('duplicate');
  });

  it('obtener() retorna null si no existe', async function () {
    window.__supabase.get.mockResolvedValue([]);

    var res = await DB.clientes.obtener('id-inexistente');

    expect(res.data).toBeNull();
  });

  it('buscar() por termino construye URL con ilike en 6 campos', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.clientes.buscar('juan');

    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('or=(');
    expect(url).toContain('primer_nombre');
    expect(url).toContain('numero_id');
    expect(url).toContain('celular');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.proveedores — EXTENDIDO
// ═══════════════════════════════════════════════════════════════
describe('DB.proveedores — EXT', function () {

  it('TC-PRV-01: crear() envia razon_social, nit, limite_credito', async function () {
    var input = {
      razon_social: 'Textiles del Caribe SAS',
      numero_id: '900555666-8',
      email: 'contacto@textiles.co',
      contacto: 'Pedro Gomez',
      limite_credito: 5000000
    };
    window.__supabase.post.mockResolvedValue([{ id: 'prov-1', ...input }]);

    var res = await DB.proveedores.crear(input);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_proveedores', input);
  });

  it('listar() busca por razon_social con search', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', razon_social: 'Distribuidora Mayorista SAS' }
    ]);

    var res = await DB.proveedores.listar({ search: 'Mayorista' });

    expect(res.data).toHaveLength(1);
    expect(res.data[0].razon_social).toContain('Mayorista');
  });

  it('obtener() retorna proveedor por ID', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'p-1', razon_social: 'Proveedor Test' }
    ]);

    var res = await DB.proveedores.obtener('p-1');

    expect(res.data.razon_social).toBe('Proveedor Test');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.compras — EXTENDIDO
// ═══════════════════════════════════════════════════════════════
describe('DB.compras — EXT', function () {

  it('crearConDetalles() crea compra y luego detalles', async function () {
    window.__supabase.post
      .mockResolvedValueOnce([{ id: 'comp-1', numero_orden: 'OC-001' }])
      .mockResolvedValueOnce([{ id: 'det-1' }]);

    var res = await DB.compras.crearConDetalles(
      { total: 678300, proveedor_id: 'prov-1' },
      [{ producto_detalle_id: 'pd-1', cantidad: 10, precio_unitario: 60000 }]
    );

    expect(res.error).toBeNull();
    expect(res.data.id).toBe('comp-1');
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_compras', expect.any(Object));
  });

  it('actualizarEstado() cambia estado via patch', async function () {
    window.__supabase.patch.mockResolvedValue([{ id: 'comp-1', estado: 'RECIBIDA' }]);

    var res = await DB.compras.actualizarEstado('comp-1', 'RECIBIDA');

    expect(res.error).toBeNull();
    expect(window.__supabase.patch).toHaveBeenCalledWith(
      'pos_compras?id=eq.comp-1',
      { estado: 'RECIBIDA' }
    );
  });

  it('listar() construye URL con joins de proveedor y usuario', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.compras.listar();

    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('proveedor:proveedor_id');
    expect(url).toContain('usuario:usuario_id');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.gastos
// ═══════════════════════════════════════════════════════════════
describe('DB.gastos', function () {

  it('TC-GAS-01: crear() envia categoria_id, monto, notas', async function () {
    var input = {
      categoria_id: 'cat-gasto-1',
      monto: 250000,
      notas: 'Pago de luz Junio 2026',
      anio: 2026,
      mes: 6
    };
    window.__supabase.post.mockResolvedValue([{ id: 'gasto-1', ...input }]);

    var res = await DB.gastos.crear(input);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_gastos_mensuales_detalle', input);
  });

  it('listarPorPeriodo() filtra por anio y mes', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.gastos.listarPorPeriodo(2026, 6);

    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('anio=eq.2026');
    expect(url).toContain('mes=eq.6');
  });

  it('listar() incluye join con categoria', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.gastos.listar();

    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('categoria:categoria_id');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.gastoCategorias
// ═══════════════════════════════════════════════════════════════
describe('DB.gastoCategorias', function () {

  it('TC-GAS-02: crear() envia nombre, descripcion, activa', async function () {
    var input = { nombre: 'Papeleria', descripcion: 'Insumos de papeleria', activa: true };
    window.__supabase.post.mockResolvedValue([{ id: 'cat-1', ...input }]);

    var res = await DB.gastoCategorias.crear(input);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_gasto_categorias', input);
  });

  it('listarActivas() filtra solo activas', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.gastoCategorias.listarActivas();

    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('activa=eq.true');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.facturacion
// ═══════════════════════════════════════════════════════════════
describe('DB.facturacion', function () {

  it('TC-FAC-02: anular() cambia estado a ANULADA', async function () {
    window.__supabase.patch.mockResolvedValue([{ id: 'fac-1', estado: 'ANULADA' }]);

    var res = await DB.facturacion.anular('fac-1');

    expect(res.error).toBeNull();
    expect(window.__supabase.patch).toHaveBeenCalledWith(
      'pos_facturacion?id=eq.fac-1',
      { estado: 'ANULADA' }
    );
  });

  it('emitir() cambia estado a EMITIDA', async function () {
    window.__supabase.patch.mockResolvedValue([{ id: 'fac-1', estado: 'EMITIDA' }]);

    var res = await DB.facturacion.emitir('fac-1');

    expect(res.error).toBeNull();
    expect(window.__supabase.patch).toHaveBeenCalledWith(
      'pos_facturacion?id=eq.fac-1',
      { estado: 'EMITIDA' }
    );
  });

  it('listar() incluye join con venta', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.facturacion.listar();

    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('venta:venta_id');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.cajaApertura
// ═══════════════════════════════════════════════════════════════
describe('DB.cajaApertura', function () {

  it('abrir() inserta apertura con datos correctos', async function () {
    var data = { caja_id: 'caja-1', monto_inicial: 150000, usuario_id: 'user-1' };
    window.__supabase.post.mockResolvedValue([{ id: 'ap-1', ...data }]);

    var res = await DB.cajaApertura.abrir(data);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_caja_apertura', data);
  });

  it('cerrar() envia monto_final, monto_esperado, diferencia, estado=cerrada', async function () {
    window.__supabase.patch.mockResolvedValue([{ id: 'ap-1', estado: 'cerrada' }]);

    var res = await DB.cajaApertura.cerrar('ap-1', 250000, 250000, 0);

    expect(res.error).toBeNull();
    expect(window.__supabase.patch).toHaveBeenCalledWith(
      'pos_caja_apertura?id=eq.ap-1',
      expect.objectContaining({
        monto_final: 250000,
        monto_esperado: 250000,
        diferencia: 0,
        estado: 'cerrada'
      })
    );
  });

  it('obtenerActiva() busca por caja_id y estado=abierta', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'ap-1', caja_id: 'caja-1', estado: 'abierta', monto_inicial: 150000 }
    ]);

    var res = await DB.cajaApertura.obtenerActiva('caja-1');

    expect(res.data.estado).toBe('abierta');
    expect(res.data.monto_inicial).toBe(150000);
    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('caja_id=eq.caja-1');
    expect(url).toContain('estado=eq.abierta');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.movimientosInventario
// ═══════════════════════════════════════════════════════════════
describe('DB.movimientosInventario', function () {

  it('TC-INV-01: crear() envia tipo_movimiento, cantidad, motivo', async function () {
    var data = {
      producto_detalle_id: 'pd-1',
      tipo_movimiento: 'salida_merma',
      cantidad: 2,
      motivo: 'Producto de exhibicion danado'
    };
    window.__supabase.post.mockResolvedValue([{ id: 'mov-1', ...data }]);

    var res = await DB.movimientosInventario.crear(data);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_movimientos_inventario', data);
  });

  it('listar() incluye join profundo producto_detalle->producto->categoria', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.movimientosInventario.listar();

    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('producto_detalle:producto_detalle_id');
    expect(url).toContain('producto:producto_id');
    expect(url).toContain('categoria:categoria_id');
  });

  it('obtenerPorProducto() filtra por producto_detalle_id', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'mov-1', producto_detalle_id: 'pd-1', cantidad: 5 }
    ]);

    var res = await DB.movimientosInventario.obtenerPorProducto('pd-1');

    expect(res.data).toHaveLength(1);
    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('producto_detalle_id=eq.pd-1');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.configuracionEmpresa
// ═══════════════════════════════════════════════════════════════
describe('DB.configuracionEmpresa', function () {

  it('TC-CFG-01: guardar() inserta cuando no existe registro previo', async function () {
    window.__supabase.get.mockResolvedValue([]);  // obtener() no encuentra nada
    var data = {
      nombre_empresa: 'Kubit Store Colombia SAS',
      nit: '900999888-2',
      logo_url: 'https://ejemplo.com/logo.png',
      resolucion_dian: 'Res 1876000000001 de 2026'
    };
    window.__supabase.post.mockResolvedValue([{ id: 'cfg-1', ...data }]);

    var res = await DB.configuracionEmpresa.guardar(data);

    expect(res.error).toBeNull();
    // debe llamar a insert porque no existia
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_configuracion_empresa', data);
    expect(window.__supabase.patch).not.toHaveBeenCalled();
  });

  it('TC-CFG-01: guardar() actualiza cuando ya existe registro', async function () {
    window.__supabase.get.mockResolvedValue([{ id: 'cfg-existente', nombre_empresa: 'Viejo' }]);
    var data = { nombre_empresa: 'Kubit Store Colombia SAS' };
    window.__supabase.patch.mockResolvedValue([{ id: 'cfg-existente', ...data }]);

    var res = await DB.configuracionEmpresa.guardar(data);

    expect(res.error).toBeNull();
    // debe llamar a patch porque ya existe
    expect(window.__supabase.patch).toHaveBeenCalledWith(
      'pos_configuracion_empresa?id=eq.cfg-existente',
      data
    );
    expect(window.__supabase.post).not.toHaveBeenCalled();
  });

  it('obtener() retorna primer registro ordenado por created_at', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'cfg-1', nombre_empresa: 'Empresa Test' }
    ]);

    var res = await DB.configuracionEmpresa.obtener();

    expect(res.data.nombre_empresa).toBe('Empresa Test');
    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('order=created_at.asc');
    expect(url).toContain('limit=1');
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.finanzasMensuales
// ═══════════════════════════════════════════════════════════════
describe('DB.finanzasMensuales', function () {

  it('obtenerPorPeriodo() filtra por anio y mes exactos', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'fin-1', anio: 2026, mes: 6, ventas_netas: 950000 }
    ]);

    var res = await DB.finanzasMensuales.obtenerPorPeriodo(2026, 6);

    expect(res.data.ventas_netas).toBe(950000);
    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('anio=eq.2026');
    expect(url).toContain('mes=eq.6');
  });

  it('actualizarPorVenta() llama a RPC con parametros correctos', async function () {
    window.__supabase.rpc.mockResolvedValue({ success: true });

    var res = await DB.finanzasMensuales.actualizarPorVenta(2026, 6, 1000000, 50000, 15000, 400000);

    expect(res.error).toBeNull();
    expect(window.__supabase.rpc).toHaveBeenCalledWith('actualizar_finanzas_mensuales', {
      p_anio: 2026,
      p_mes: 6,
      p_venta_bruta: 1000000,
      p_descuento: 50000,
      p_costo_comision: 15000,
      p_costo_mercaderia: 400000
    });
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.productos — EXTENDIDO
// ═══════════════════════════════════════════════════════════════
describe('DB.productos — EXT', function () {

  it('buscar() por termino construye URL con ilike en nombre', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', nombre: 'Zapatillas Nike Air Max' }
    ]);

    var res = await DB.productos.buscar('Zapatillas');

    expect(res.data).toHaveLength(1);
    expect(res.data[0].nombre).toContain('Zapatillas');
    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('%25Zapatillas%25');
  });

  it('buscarPorCategoria() filtra por categoria_id y ordena por nombre', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: '1', nombre: 'Zapatillas', categoria_id: 'cat-1' }
    ]);

    await DB.productos.buscarPorCategoria('cat-1');

    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).toContain('categoria_id=eq.cat-1');
    expect(url).toContain('order=nombre.asc');
  });

  it('listarConDetalle() usa cache en segunda llamada', async function () {
    window.__supabase.get.mockResolvedValue([
      { id: 'pd-1', producto_id: 'p-1', stock_actual: 15 }
    ]);

    await DB.productos.listarConDetalle();       // primera: API
    window.__supabase.get.mockClear();
    await DB.productos.listarConDetalle();       // segunda: cache

    expect(window.__supabase.get).not.toHaveBeenCalled();
  });

  it('listarConDetalle({skipCache:true}) no guarda en cache', async function () {
    window.__supabase.get.mockResolvedValue([]);

    // skipCache evita escribir en cache
    await DB.productos.listarConDetalle({ skipCache: true });  // primera: API + sin cache
    window.__supabase.get.mockClear();
    await DB.productos.listarConDetalle();       // segunda: no hay cache, llama API otra vez

    expect(window.__supabase.get).toHaveBeenCalled();
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.categorias — EXTENDIDO
// ═══════════════════════════════════════════════════════════════
describe('DB.categorias — EXT', function () {

  it('TC-CAT-01: crear() envia nombre, codigo, color', async function () {
    var input = { nombre: 'Deportes QA', codigo: 'deportes-qa', color: '#ff0000' };
    window.__supabase.post.mockResolvedValue([{ id: 'cat-1', ...input }]);

    var res = await DB.categorias.crear(input);

    expect(res.error).toBeNull();
    expect(window.__supabase.post).toHaveBeenCalledWith('pos_categorias', input);
  });

  it('listarTodas() no filtra por activa', async function () {
    window.__supabase.get.mockResolvedValue([]);

    await DB.categorias.listarTodas();

    var url = window.__supabase.get.mock.calls[0][0];
    expect(url).not.toContain('activa=eq.true');
  });

  it('crear() invalida cache de categorias', async function () {
    window.__supabase.get.mockResolvedValue([{ id: '1', nombre: 'Bebidas', activa: true }]);
    window.__supabase.post.mockResolvedValue([{ id: 'cat-nueva' }]);

    await DB.categorias.listar();         // poblar cache
    await DB.categorias.crear({ nombre: 'Nueva' });  // invalida cache
    window.__supabase.get.mockClear();
    await DB.categorias.listar();         // debe llamar API otra vez

    expect(window.__supabase.get).toHaveBeenCalled();
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.compras — totalDelMes
// ═══════════════════════════════════════════════════════════════
describe('DB.compras.totalDelMes', function () {

  it('suma totales de compras RECIBIDA y PENDIENTE del mes', async function () {
    window.__supabase.get.mockResolvedValue([
      { total: 100000 },
      { total: 129572 }
    ]);

    var resultado = await DB.compras.totalDelMes(2026, 6);

    expect(resultado).toBe(229572);
    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('estado=in.(RECIBIDA,RECIBIENDO,PENDIENTE)');
    expect(url).toContain('deleted_at=is.null');
    expect(url).toContain('fecha_compra=gte.2026-06-01');
    expect(url).toContain('fecha_compra=lt.2026-07-01');
  });

  it('retorna 0 cuando no hay compras en el mes', async function () {
    window.__supabase.get.mockResolvedValue([]);

    var resultado = await DB.compras.totalDelMes(2025, 1);

    expect(resultado).toBe(0);
  });

  it('retorna 0 cuando el API falla', async function () {
    window.__supabase.get.mockRejectedValue(new Error('Network error'));

    var resultado = await DB.compras.totalDelMes(2026, 6);

    expect(resultado).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.gastos — totalDelMes
// ═══════════════════════════════════════════════════════════════
describe('DB.gastos.totalDelMes', function () {

  it('suma montos de gastos del mes excluyendo soft-delete', async function () {
    window.__supabase.get.mockResolvedValue([
      { monto: 50000 },
      { monto: 75000 },
      { monto: 25000 }
    ]);

    var resultado = await DB.gastos.totalDelMes(2026, 7);

    expect(resultado).toBe(150000);
    var url = decodeURIComponent(window.__supabase.get.mock.calls[0][0]);
    expect(url).toContain('deleted_at=is.null');
    expect(url).toContain('created_at=gte.2026-07-01');
    expect(url).toContain('created_at=lt.2026-08-01');
  });

  it('retorna 0 cuando no hay gastos en el mes', async function () {
    window.__supabase.get.mockResolvedValue([]);

    var resultado = await DB.gastos.totalDelMes(2025, 2);

    expect(resultado).toBe(0);
  });

  it('retorna 0 cuando el API falla', async function () {
    window.__supabase.get.mockRejectedValue(new Error('Network error'));

    var resultado = await DB.gastos.totalDelMes(2026, 7);

    expect(resultado).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════
// DB.comprasDetalle.recibir — Politica estricta (Fase 29)
// ═══════════════════════════════════════════════════════════════

function mockRecepcionFeliz() {
  window.__supabase.get
    .mockResolvedValueOnce([{
      id: 'd-1', compra_id: 'c-1', producto_detalle_id: 'pd-1',
      cantidad: 5, cantidad_recibida: 0,
      compra: { numero_orden: 64 }
    }])
    .mockResolvedValueOnce([{ id: 'pd-1', stock_actual: 12 }])
    .mockResolvedValueOnce([{ id: 'd-1', estado_detalle: 'RECIBIDO' }])
    .mockResolvedValueOnce([{ id: 'c-1', estado: 'RECIBIDA', proveedor: { razon_social: 'Proveedor X' } }]);
  window.__supabase.post.mockResolvedValue([{ id: 'mov-1' }]);
  window.__supabase.patch.mockResolvedValue([{ id: 'ok' }]);
}

describe('DB.comprasDetalle.recibir', function () {

  it('happy path total: actualiza detalle, movimiento, stock y marca RECIBIDA', async function () {
    mockRecepcionFeliz();

    var res = await DB.comprasDetalle.recibir('d-1', 5, 'usr-1');

    expect(res.error).toBeNull();
    expect(res.data.detalle).toEqual({ id: 'd-1', cantidad_recibida: 5, estado_detalle: 'RECIBIDO' });
    expect(res.data.advertencias).toEqual([]);

    // Movimiento de inventario creado con datos correctos
    expect(window.__supabase.post).toHaveBeenCalledTimes(1);
    expect(window.__supabase.post.mock.calls[0][0]).toBe('pos_movimientos_inventario');
    var movBody = window.__supabase.post.mock.calls[0][1];
    expect(movBody.tipo_movimiento).toBe('entrada_compra');
    expect(movBody.cantidad).toBe(5);
    expect(movBody.referencia).toBe('OC-64');
    expect(movBody.producto_detalle_id).toBe('pd-1');

    // Stock incrementado (12 + 5 = 17)
    var patchStock = window.__supabase.patch.mock.calls.find(function (c) {
      return c[0] === 'pos_productos_detalle?id=eq.pd-1';
    });
    expect(patchStock).toBeDefined();
    expect(patchStock[1].stock_actual).toBe(17);

    // Compra marcada RECIBIDA
    var patchCompra = window.__supabase.patch.mock.calls.find(function (c) {
      return c[0] === 'pos_compras?id=eq.c-1';
    });
    expect(patchCompra).toBeDefined();
    expect(patchCompra[1].estado).toBe('RECIBIDA');
  });

  it('recepcion parcial: detalle queda PENDIENTE y compra pasa a RECIBIENDO', async function () {
    window.__supabase.get
      .mockResolvedValueOnce([{
        id: 'd-2', compra_id: 'c-2', producto_detalle_id: 'pd-2',
        cantidad: 10, cantidad_recibida: 0,
        compra: { numero_orden: 61 }
      }])
      .mockResolvedValueOnce([{ id: 'pd-2', stock_actual: 3 }])
      .mockResolvedValueOnce([
        { id: 'd-2', estado_detalle: 'PENDIENTE' },
        { id: 'd-3', estado_detalle: 'RECIBIDO' }
      ])
      .mockResolvedValueOnce([{ id: 'c-2', estado: 'RECIBIENDO', proveedor: {} }]);
    window.__supabase.post.mockResolvedValue([{ id: 'mov-2' }]);
    window.__supabase.patch.mockResolvedValue([{ id: 'ok' }]);

    var res = await DB.comprasDetalle.recibir('d-2', 4, null);

    expect(res.error).toBeNull();
    expect(res.data.detalle.cantidad_recibida).toBe(4);
    expect(res.data.detalle.estado_detalle).toBe('PENDIENTE');

    var patchCompra = window.__supabase.patch.mock.calls.find(function (c) {
      return c[0] === 'pos_compras?id=eq.c-2';
    });
    expect(patchCompra).toBeDefined();
    expect(patchCompra[1].estado).toBe('RECIBIENDO');
  });

  it('politica estricta: si el movimiento falla, revierte el detalle y retorna error', async function () {
    window.__supabase.get
      .mockResolvedValueOnce([{
        id: 'd-1', compra_id: 'c-1', producto_detalle_id: 'pd-1',
        cantidad: 5, cantidad_recibida: 0,
        compra: { numero_orden: 64 }
      }]);
    // patch #1 (update detalle) OK, patch #2 (revertir) OK
    window.__supabase.patch.mockResolvedValue([{ id: 'ok' }]);
    window.__supabase.post.mockRejectedValue(new Error('Supabase 403: RLS violation'));

    var res = await DB.comprasDetalle.recibir('d-1', 5, 'usr-1');

    // Retorna error visible al usuario
    expect(res.error).toContain('Fallo al registrar movimiento de inventario');
    expect(res.error).toContain('revertida');
    expect(res.data).toBeNull();

    // El detalle se revirtio a sus valores previos (cantidad_recibida 0, PENDIENTE)
    var patchRevert = window.__supabase.patch.mock.calls[1];
    expect(patchRevert[0]).toBe('pos_compras_detalle?id=eq.d-1');
    expect(patchRevert[1]).toEqual({
      cantidad_recibida: 0,
      estado_detalle: 'PENDIENTE',
      updated_by: 'usr-1'
    });

    // No se toco el stock ni el estado de la compra
    var patchStock = window.__supabase.patch.mock.calls.find(function (c) {
      return c[0] === 'pos_productos_detalle?id=eq.pd-1';
    });
    expect(patchStock).toBeUndefined();
  });

  it('politica estricta: si el update de stock falla, elimina el movimiento y revierte', async function () {
    window.__supabase.get
      .mockResolvedValueOnce([{
        id: 'd-1', compra_id: 'c-1', producto_detalle_id: 'pd-1',
        cantidad: 5, cantidad_recibida: 0,
        compra: { numero_orden: 64 }
      }])
      .mockResolvedValueOnce([{ id: 'pd-1', stock_actual: 12 }]);
    window.__supabase.post.mockResolvedValue([{ id: 'mov-9' }]);
    // patch #1 (detalle) OK; patch #2 (stock) FALLA; patch #3 (revertir) OK
    window.__supabase.patch
      .mockResolvedValueOnce([{ id: 'ok' }])
      .mockRejectedValueOnce(new Error('Supabase 500: Internal Error'))
      .mockResolvedValueOnce([{ id: 'ok' }]);

    var res = await DB.comprasDetalle.recibir('d-1', 5, 'usr-1');

    expect(res.error).toContain('Fallo al actualizar stock');
    expect(res.data).toBeNull();

    // El movimiento huerfano fue eliminado
    expect(window.__supabase.delete).toHaveBeenCalledWith(
      'pos_movimientos_inventario?id=eq.mov-9'
    );

    // El detalle quedo en sus valores previos
    var patchRevert = window.__supabase.patch.mock.calls[2];
    expect(patchRevert[0]).toBe('pos_compras_detalle?id=eq.d-1');
    expect(patchRevert[1].cantidad_recibida).toBe(0);
  });

  it('rechaza recibir mas de lo ordenado', async function () {
    window.__supabase.get.mockResolvedValueOnce([{
      id: 'd-1', compra_id: 'c-1', producto_detalle_id: 'pd-1',
      cantidad: 5, cantidad_recibida: 4,
      compra: { numero_orden: 64 }
    }]);

    var res = await DB.comprasDetalle.recibir('d-1', 2, null);

    expect(res.error).toBe('Cantidad a recibir excede lo ordenado');
    expect(window.__supabase.patch).not.toHaveBeenCalled();
    expect(window.__supabase.post).not.toHaveBeenCalled();
  });

});
