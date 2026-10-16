/* ============================================================
   database.js — Servicio de Base de Datos (CRUD generico)
   ============================================================
   Dependencias: supabase.js (window.__supabase)
   Expone: window.DB con metodos genericos + especificos
   ============================================================ */

window.DB = (function () {
  var api = window.__supabase;
  if (!api) {
    console.error('[DB] ERROR: window.__supabase no disponible. Cargar supabase.js antes.');
    return {};
  }

  /* ════════════════════════════════════════════════════════════
     UTILIDAD: Fecha Colombia (UTC-5)
     ════════════════════════════════════════════════════════════ */
  function hoyColombia() {
    var a = new Date();
    return a.getFullYear() + '-' + String(a.getMonth() + 1).padStart(2, '0') + '-' + String(a.getDate()).padStart(2, '0');
  }

  /* ════════════════════════════════════════════════════════════
     CACHE
     ════════════════════════════════════════════════════════════ */
  var _cache = new Map();
  var CACHE_TTL = 60000; // 60s default

  function _cacheGet(key) {
    var entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expira) { _cache.delete(key); return null; }
    return entry.data;
  }

  function _cacheSet(key, data, ttl) {
    _cache.set(key, { data: data, expira: Date.now() + (ttl || CACHE_TTL) });
  }

  function _cacheClear(prefix) {
    if (!prefix) { _cache.clear(); return; }
    _cache.forEach(function (_, key) {
      if (key.indexOf(prefix) === 0) _cache.delete(key);
    });
  }

  /* ════════════════════════════════════════════════════════════
     QUERY STRING BUILDER (PostgREST)
     ════════════════════════════════════════════════════════════ */
  function _buildQuery(opts) {
    var parts = [];

    // Select columns con joins: "*,categoria:categoria_id(nombre)"
    parts.push('select=' + encodeURIComponent(opts.select || '*'));

    // Filtros exactos
    (opts.filters || []).forEach(function (f) {
      if (f.val === null || f.val === undefined) return;
      parts.push(encodeURIComponent(f.col) + '=' + encodeURIComponent(f.op || 'eq') + '.' + encodeURIComponent(f.val));
    });

    // Busqueda ilike multi-campo
    if (opts.search) {
      var searchFields = opts.searchFields || ['nombre'];
      var orParts = searchFields.map(function (f) {
        return f + '.ilike.%25' + encodeURIComponent(opts.search) + '%25';
      });
      parts.push('or=(' + orParts.join(',') + ')');
    }

    // Filtro por categoria (directo)
    if (opts.categoriaId) {
      parts.push(encodeURIComponent('categoria_id') + '=eq.' + encodeURIComponent(opts.categoriaId));
    }

    // Soft-delete: excluir deleted_at is not null
    if (!opts.incluirEliminados) {
      parts.push('deleted_at=is.null');
    }

    // Orden
    if (opts.orderBy) {
      var dir = opts.orderDir === 'desc' ? '.desc' : '.asc';
      parts.push('order=' + encodeURIComponent(opts.orderBy) + dir);
    }

    // Paginacion
    if (opts.page && opts.pageSize) {
      var offset = (opts.page - 1) * opts.pageSize;
      parts.push('offset=' + offset);
      parts.push('limit=' + opts.pageSize);
    } else if (opts.limit) {
      parts.push('limit=' + opts.limit);
    }

    return parts.join('&');
  }

  /* ════════════════════════════════════════════════════════════
     GENERIC CRUD
     ════════════════════════════════════════════════════════════ */
  function _esErrorAuth(msj) {
    return msj && (msj.indexOf('401') !== -1 || msj.indexOf('JWT') !== -1 || msj.indexOf('expired') !== -1);
  }

  async function select(tabla, opts) {
    try {
      var qs = _buildQuery(opts || {});
      var usarMeta = opts && opts.page && opts.pageSize;
      if (usarMeta) {
        var meta = await api.getWithMeta(tabla + '?' + qs, { page: opts.page, pageSize: opts.pageSize });
        return { data: meta.data || [], error: null, count: meta.data.length, total: meta.total };
      }
      var data = await api.get(tabla + '?' + qs);
      var count = (data && data.length) || 0;
      return { data: data || [], error: null, count: count };
    } catch (e) {
      console.error('[DB] select error:', tabla, e);
      if (_esErrorAuth(e.message) && window.KubitAuth && window.KubitAuth.manejarErrorAuth) {
        window.KubitAuth.manejarErrorAuth();
      }
      return { data: [], error: e.message, count: 0 };
    }
  }

  async function insert(tabla, data) {
    try {
      var result = await api.post(tabla, data);
      return { data: result, error: null };
    } catch (e) {
      console.error('[DB] insert error:', tabla, e);
      return { data: null, error: e.message };
    }
  }

  async function update(tabla, id, data) {
    try {
      var result = await api.patch(tabla + '?id=eq.' + id, data);
      return { data: result, error: null };
    } catch (e) {
      console.error('[DB] update error:', tabla, e);
      return { data: null, error: e.message };
    }
  }

  async function softDelete(tabla, id) {
    try {
      await api.patch(tabla + '?id=eq.' + id, { deleted_at: new Date().toISOString() });
      return { error: null };
    } catch (e) {
      console.error('[DB] softDelete error:', tabla, e);
      return { error: e.message };
    }
  }

  /* ════════════════════════════════════════════════════════════
     ENTITY: PRODUCTOS
     ════════════════════════════════════════════════════════════ */
  var productos = {
    listar: async function (opts) {
      return select('pos_productos', Object.assign({
        select: '*,categoria:categoria_id(id,nombre)',
        orderBy: 'nombre',
        searchFields: ['nombre']
      }, opts || {}));
    },

    listarConDetalle: async function (opts) {
      var cacheKey = 'productos_detalle';
      var mostrarInactivos = opts && opts.mostrarInactivos;
      if (!mostrarInactivos) {
        var cached = _cacheGet(cacheKey);
        if (cached) return cached;
      }

      var res = await select('pos_productos_detalle', Object.assign({
        select: '*,producto:producto_id(id,nombre,slug,categoria_id,tasa_impuesto,activo,tags,marca,modelo,descripcion,categoria:categoria_id(id,nombre))',
        orderBy: 'created_at'
      }, opts || {}));

      var data = (res.data || []).filter(function (d) {
        return d.producto && (mostrarInactivos || d.producto.activo !== false);
      });

      var result = { data: data, error: res.error, count: data.length, total: res.total };

      if (!opts || !opts.skipCache) {
        _cacheSet(cacheKey, result, 30000);
      }
      return result;
    },

    obtener: async function (id) {
      var res = await select('pos_productos', {
        select: '*,categoria:categoria_id(id,nombre)',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    buscar: async function (termino, opts) {
      return select('pos_productos', Object.assign({
        select: '*,categoria:categoria_id(id,nombre)',
        search: termino,
        searchFields: ['nombre'],
        limit: 20
      }, opts || {}));
    },

    buscarPorCategoria: async function (categoriaId, opts) {
      return select('pos_productos', Object.assign({
        select: '*,categoria:categoria_id(id,nombre)',
        categoriaId: categoriaId,
        orderBy: 'nombre'
      }, opts || {}));
    },

    crear: async function (data) { _cacheClear('productos'); return insert('pos_productos', data); },
    actualizar: async function (id, data) { _cacheClear('productos'); return update('pos_productos', id, data); },
    eliminar: async function (id) { _cacheClear('productos'); return softDelete('pos_productos', id); },

    listarDetalleActivos: async function (opts) {
      var res = await select('pos_productos_detalle', Object.assign({
        select: '*,producto:producto_id(id,nombre,slug,categoria_id,tasa_impuesto,activo,tags,marca,modelo,descripcion,categoria:categoria_id(id,nombre))',
        orderBy: 'producto_id'
      }, opts || {}));
      var data = (res.data || []).filter(function (d) {
        return d.producto && d.producto.activo !== false;
      });
      return { data: data, error: res.error, count: data.length };
    },

    detalleCrear: async function (data) { _cacheClear('productos'); return insert('pos_productos_detalle', data); },
    detalleActualizar: async function (id, data) {
      // Fase 31: el stock solo cambia con ajustarStock (deja un movimiento). Se ignora stock_actual.
      _cacheClear('productos');
      var datos = Object.assign({}, data);
      delete datos.stock_actual;
      return update('pos_productos_detalle', id, datos);
    },
    detalleEliminar: async function (id) { _cacheClear('productos'); return softDelete('pos_productos_detalle', id); },
    detalleObtener: async function (id) {
      var res = await select('pos_productos_detalle', {
        select: '*,producto:producto_id(id,nombre,slug,categoria_id,tasa_impuesto,activo,tags,marca,modelo,descripcion,categoria:categoria_id(id,nombre))',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    buscarPorCodigoInterno: async function (codigo, excluirId) {
      var opts = {
        select: 'id,producto:producto_id(id,nombre)',
        filters: [{ col: 'codigo_interno', val: codigo }],
        limit: 1
      };
      if (excluirId) {
        opts.filters.push({ col: 'id', op: 'neq', val: excluirId });
      }
      var res = await select('pos_productos_detalle', opts);
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    ajustarStock: async function (detalleId, cantidad, tipoMovimiento, motivo, opts) {
      // Politica estricta (Fase 30): primero el movimiento, luego el stock.
      // Si falla el stock, se elimina el movimiento para no dejar registros huerfanos.
      var res = await productos.detalleObtener(detalleId);
      if (res.error || !res.data) return { data: null, error: res.error || 'Producto no encontrado' };
      var detalle = res.data;

      var stockAnterior = parseInt(detalle.stock_actual || 0, 10);
      var nuevoStock = stockAnterior + cantidad;
      if (nuevoStock < 0) return { data: null, error: 'Stock no puede ser negativo' };

      var user = opts && opts.usuarioId || null;
      var mov = {
        producto_detalle_id: detalleId,
        tipo_movimiento: tipoMovimiento,
        cantidad: Math.abs(cantidad),
        motivo: motivo || 'Ajuste manual',
        created_by: user
      };
      if (opts && opts.referencia) mov.referencia = opts.referencia;
      var movRes = await insert('pos_movimientos_inventario', mov);
      if (movRes.error) {
        return { data: null, error: 'No se pudo registrar el movimiento de inventario: ' + movRes.error };
      }

      var upd = await update('pos_productos_detalle', detalleId, { stock_actual: nuevoStock });
      if (upd.error) {
        var movId = movRes.data && (Array.isArray(movRes.data) ? (movRes.data[0] && movRes.data[0].id) : movRes.data.id);
        if (movId) {
          try {
            await api.delete('pos_movimientos_inventario?id=eq.' + movId);
          } catch (e) {
            console.error('[DB] CRITICO: no se pudo eliminar el movimiento huerfano:', movId, e);
          }
        }
        return { data: null, error: 'No se pudo actualizar el stock: ' + upd.error };
      }

      _cacheClear('productos');

      return { data: { stock_anterior: stockAnterior, stock_nuevo: nuevoStock, movimiento: movRes.data }, error: null };
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: CATEGORIAS
     ════════════════════════════════════════════════════════════ */
  var categorias = {
    listar: async function (opts) {
      var cacheKey = 'categorias_listar';
      var cached = _cacheGet(cacheKey);
      if (cached) return cached;

      var res = await select('pos_categorias', Object.assign({
        orderBy: 'nombre',
        filters: [{ col: 'activa', val: true }]
      }, opts || {}));

      _cacheSet(cacheKey, res, 30000); // 30s
      return res;
    },

    listarTodas: async function () {
      return select('pos_categorias', { orderBy: 'nombre' });
    },

    crear: async function (data) { _cacheClear('categorias'); return insert('pos_categorias', data); },
    actualizar: async function (id, data) { _cacheClear('categorias'); return update('pos_categorias', id, data); },
    eliminar: async function (id) { _cacheClear('categorias'); return softDelete('pos_categorias', id); }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: CLIENTES
     ════════════════════════════════════════════════════════════ */
  var clientes = {
    listar: async function (opts) {
      return select('pos_clientes', Object.assign({
        orderBy: 'primer_nombre',
        searchFields: ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'numero_id', 'email']
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_clientes', { filters: [{ col: 'id', val: id }], limit: 1 });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    buscar: async function (termino, opts) {
      return select('pos_clientes', Object.assign({
        search: termino,
        searchFields: ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'numero_id', 'email', 'celular'],
        limit: 15
      }, opts || {}));
    },

    crear: async function (data) { return insert('pos_clientes', data); },
    actualizar: async function (id, data) { return update('pos_clientes', id, data); },
    eliminar: async function (id) { return softDelete('pos_clientes', id); }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: VENTAS
     ════════════════════════════════════════════════════════════ */
  var ventas = {
    listarRecientes: async function (opts) {
      return select('pos_ventas', Object.assign({
        select: '*,cliente:cliente_id(id,primer_nombre,primer_apellido),usuario:usuario_id(id,nombre_completo)',
        orderBy: 'created_at',
        orderDir: 'desc',
        limit: 20
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_ventas', {
        select: '*,cliente:cliente_id(*),usuario:usuario_id(*),canal:canal_id(*),detalles:pos_ventas_detalle(*,detalle:producto_detalle_id(*,producto:producto_id(nombre)))',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (ventaData) {
      return insert('pos_ventas', ventaData);
    },

    crearConDetalles: async function (ventaData, detalles) {
      var resVenta = await insert('pos_ventas', ventaData);
      if (resVenta.error || !resVenta.data || !resVenta.data.length) {
        return { data: null, error: resVenta.error || 'Error al crear venta' };
      }
      var ventaId = resVenta.data[0].id;

      var detallesConId = detalles.map(function (d) {
        d.venta_id = ventaId;
        return d;
      });

      try {
        await api.post('pos_ventas_detalle', detallesConId);
        return { data: resVenta.data[0], error: null };
      } catch (e) {
        console.error('[DB] Error al insertar detalles de venta:', e);
        return { data: null, error: e.message };
      }
    },

    listar: async function (opts) {
      var filters = [];
      if (opts) {
        if (opts.estado) filters.push({ col: 'estado', val: opts.estado });
        if (opts.canalId) filters.push({ col: 'canal_id', val: opts.canalId });
        if (opts.desde) filters.push({ col: 'fecha_venta', op: 'gte', val: opts.desde });
        if (opts.hasta) filters.push({ col: 'fecha_venta', op: 'lte', val: opts.hasta });
      }
      return select('pos_ventas', Object.assign({
        select: '*,cliente:cliente_id(id,primer_nombre,primer_apellido),usuario:usuario_id(id,nombre_completo),canal:canal_id(id,nombre,codigo)',
        filters: filters,
        search: (opts && opts.search) || null,
        searchFields: ['numero_venta', 'referencia_externa'],
        orderBy: 'fecha_venta',
        orderDir: 'desc',
        page: (opts && opts.page) || 1,
        pageSize: (opts && opts.pageSize) || 20
      }, opts || {}));
    },

    anular: async function (id) {
      return update('pos_ventas', id, { estado: 'ANULADA' });
    },

    anularConRevertir: async function (id, opts) {
      // Politica estricta (Fase 30): devuelve el stock (devolucion_venta), marca ANULADA
      // solo si todo el stock quedo bien, y revierte finanzas al final.
      var user = opts && opts.usuarioId || null;
      var res = await ventas.obtener(id);
      if (res.error || !res.data) return { data: null, error: res.error || 'Venta no encontrada' };
      var v = res.data;
      if (v.estado !== 'CONFIRMADA' && v.estado !== 'PENDIENTE') {
        return { data: null, error: 'Solo se pueden anular ventas CONFIRMADAS o PENDIENTES (estado actual: ' + v.estado + ')' };
      }

      var ref = v.numero_venta || id;
      var motivo = 'Anulacion venta #' + ref;
      var aplicados = [];

      var deshacerAplicados = async function () {
        var fallidos = [];
        for (var k = aplicados.length - 1; k >= 0; k--) {
          var a = aplicados[k];
          var ok = false;
          var act = await productos.detalleObtener(a.producto_detalle_id);
          if (!act.error && act.data) {
            var rev = await update('pos_productos_detalle', a.producto_detalle_id, {
              stock_actual: parseInt(act.data.stock_actual || 0, 10) - a.cantidad
            });
            ok = !rev.error;
          }
          if (ok && a.movimientoId) {
            try { await api.delete('pos_movimientos_inventario?id=eq.' + a.movimientoId); }
            catch (e) { ok = false; }
          }
          if (!ok) fallidos.push(a.codigo || a.producto_detalle_id);
        }
        _cacheClear('productos');
        return fallidos;
      };

      // Devolver stock de cada detalle (devolucion_venta existe en el CHECK de pos_movimientos_inventario)
      var detalles = v.detalles || [];
      for (var i = 0; i < detalles.length; i++) {
        var d = detalles[i];
        var codigo = (d.detalle && d.detalle.codigo_interno) || d.producto_detalle_id;
        var r = await productos.ajustarStock(d.producto_detalle_id, d.cantidad, 'devolucion_venta', motivo, {
          usuarioId: user,
          referencia: ref
        });
        if (r.error) {
          var fallidos = await deshacerAplicados();
          var msg = 'No se pudo devolver el stock de ' + codigo + ': ' + r.error + '. La venta NO fue anulada.';
          if (fallidos.length) msg += ' ATENCION: revise el stock de ' + fallidos.join(', ');
          return { data: null, error: msg };
        }
        var m = r.data && r.data.movimiento;
        aplicados.push({
          producto_detalle_id: d.producto_detalle_id,
          cantidad: d.cantidad,
          codigo: codigo,
          movimientoId: m ? (Array.isArray(m) ? (m[0] && m[0].id) : m.id) : null
        });
      }

      // Marcar como ANULADA (solo si todo el stock quedo bien)
      var upd = await update('pos_ventas', id, { estado: 'ANULADA' });
      if (upd.error) {
        var fallidos2 = await deshacerAplicados();
        var msg2 = 'No se pudo marcar la venta como ANULADA: ' + upd.error + '. El stock fue restaurado.';
        if (fallidos2.length) msg2 = 'No se pudo marcar la venta como ANULADA: ' + upd.error + '. ATENCION: revise el stock de ' + fallidos2.join(', ');
        return { data: null, error: msg2 };
      }

      // Revertir finanzas mensuales (si falla, la venta queda anulada y se advierte)
      var advertencias = [];
      if (v.fecha_venta) {
        var fd = new Date(v.fecha_venta);
        var costoComision = (v.costo_cargo_venta || 0) + (v.costo_impuestos || 0) + (v.costo_envios || 0);
        var costoMercaderia = detalles.reduce(function (s, x) {
          var pc = (x.detalle && x.detalle.precio_compra) || 0;
          return s + (pc * x.cantidad);
        }, 0);
        var fin = await finanzasMensuales.actualizarPorVenta(
          fd.getFullYear(), fd.getMonth() + 1,
          -(v.total || 0), -(v.descuento || 0), -costoComision, -costoMercaderia
        );
        if (fin.error) advertencias.push('La venta se anulo, pero no se pudieron revertir las finanzas del mes: ' + fin.error);
      }
      return { data: { venta: (upd.data && upd.data[0]) || null, advertencias: advertencias }, error: null };
    },

    obtenerPorPeriodo: async function (usuarioId, desde, hasta, opts) {
      var filters = [
        { col: 'estado', val: 'CONFIRMADA' }
      ];
      if (usuarioId) filters.push({ col: 'usuario_id', val: usuarioId });
      if (desde) filters.push({ col: 'fecha_venta', op: 'gte', val: desde });
      if (hasta) filters.push({ col: 'fecha_venta', op: 'lte', val: hasta });

      return select('pos_ventas', Object.assign({
        select: 'id,metodo_pago,subtotal,impuesto,descuento,total,costo_cargo_venta,costo_impuestos,costo_envios',
        filters: filters,
        orderBy: 'fecha_venta',
        orderDir: 'desc'
      }, opts || {}));
    },

    estadisticasHoy: async function () {
      var hoy = new Date();
      var y = hoy.getFullYear();
      var m = String(hoy.getMonth() + 1).padStart(2, '0');
      var d = String(hoy.getDate()).padStart(2, '0');
      var desde = y + '-' + m + '-' + d + 'T00:00:00';
      var hasta = y + '-' + m + '-' + d + 'T23:59:59';
      var res = await select('pos_ventas', {
        select: 'total',
        filters: [
          { col: 'estado', val: 'CONFIRMADA' },
          { col: 'fecha_venta', op: 'gte', val: desde },
          { col: 'fecha_venta', op: 'lte', val: hasta }
        ]
      });
      if (res.error) {
        return { count: 0, total: 0, promedio: 0, error: res.error };
      }
      var rows = res.data || [];
      var count = rows.length;
      var total = rows.reduce(function (s, r) { return s + (r.total || 0); }, 0);
      var promedio = count > 0 ? total / count : 0;
      return { count: count, total: total, promedio: promedio, error: null };
    },

    productosVendidosHoy: async function () {
      try {
        var hoy = new Date();
        var y = hoy.getFullYear();
        var m = String(hoy.getMonth() + 1).padStart(2, '0');
        var d = String(hoy.getDate()).padStart(2, '0');
        var desde = y + '-' + m + '-' + d + 'T00:00:00';
        var hasta = y + '-' + m + '-' + d + 'T23:59:59';
        var data = await api.get('pos_ventas?select=detalles:pos_ventas_detalle!venta_id(cantidad)' +
          '&estado=eq.CONFIRMADA' +
          '&deleted_at=is.null' +
          '&fecha_venta=gte.' + desde +
          '&fecha_venta=lte.' + hasta);
        if (!data || !data.length) return 0;
        var total = 0;
        data.forEach(function (v) {
          if (v.detalles) {
            v.detalles.forEach(function (d) { total += d.cantidad || 0; });
          }
        });
        return total;
      } catch (e) {
        console.error('[DB] ventas.productosVendidosHoy error:', e);
        return 0;
      }
    },

    topProductos: async function (limite) {
      limite = limite || 5;
      var hoy = new Date();
      var y = hoy.getFullYear();
      var m = String(hoy.getMonth() + 1).padStart(2, '0');
      var desde = y + '-' + m + '-01T00:00:00';
      var res = await select('pos_ventas_detalle', {
        select: 'producto_detalle_id,cantidad,precio_unitario,detalle:producto_detalle_id(*,producto:producto_id(nombre,slug))',
        filters: [
          { col: 'created_at', op: 'gte', val: desde }
        ]
      });
      if (res.error) return { data: [], error: res.error };
      var agrupado = {};
      (res.data || []).forEach(function (d) {
        var id = d.producto_detalle_id;
        if (!agrupado[id]) {
          agrupado[id] = { id: id, cantidad: 0, total: 0, nombre: (d.detalle && d.detalle.producto && d.detalle.producto.nombre) || '---' };
        }
        agrupado[id].cantidad += d.cantidad || 0;
        agrupado[id].total += (d.cantidad || 0) * (d.precio_unitario || 0);
      });
      var ordenado = Object.keys(agrupado).map(function (k) { return agrupado[k]; })
        .sort(function (a, b) { return b.cantidad - a.cantidad; })
        .slice(0, limite);
      return { data: ordenado, error: null };
    },

    estadisticasDelPeriodo: async function (anio, mes, canalId) {
      var m = String(mes).padStart(2, '0');
      var sigMes = mes === 12 ? 1 : mes + 1;
      var sigAnio = mes === 12 ? anio + 1 : anio;
      var desde = anio + '-' + m + '-01T00:00:00';
      var hasta = sigAnio + '-' + String(sigMes).padStart(2, '0') + '-01T00:00:00';
      var qs = 'select=total,costo_cargo_venta,costo_impuestos,costo_envios&estado=eq.CONFIRMADA&deleted_at=is.null&fecha_venta=gte.' + desde + '&fecha_venta=lte.' + hasta;
      if (canalId) qs += '&canal_id=eq.' + encodeURIComponent(canalId);
      try {
        var rows = await api.get('pos_ventas?' + qs) || [];
        var count = rows.length;
        var total = rows.reduce(function (s, r) { return s + (r.total || 0); }, 0);
        var promedio = count > 0 ? total / count : 0;
        var costos = rows.reduce(function (s, r) {
          return s + (r.costo_cargo_venta || 0) + (r.costo_impuestos || 0) + (r.costo_envios || 0);
        }, 0);
        return { count: count, total: total, promedio: promedio, costos: costos, error: null };
      } catch (e) {
        return { count: 0, total: 0, promedio: 0, costos: 0, error: e.message };
      }
    },

    porMes: async function (anio, canalId) {
      try {
        var meses = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var ahora = new Date();
        var mesActual = ahora.getMonth() + 1;
        var anioActual = ahora.getFullYear();

        if (!canalId) {
          // Sin filtro de canal: usar pos_finanzas_mensuales (pre-agregado)
          // Solo para meses historicos (NO el mes corriente)
          var finanzas = await select('pos_finanzas_mensuales', {
            filters: [
              { col: 'anio', val: anio },
              { col: 'mes', op: 'gte', val: 1 },
              { col: 'mes', op: 'lte', val: 12 }
            ],
            orderBy: 'mes'
          });
          var mesesConDato = {};
          (finanzas.data || []).forEach(function (f) {
            if (f.mes >= 1 && f.mes <= 12) {
              var esMesCorriente = (anio === anioActual && f.mes === mesActual);
              if (!esMesCorriente) {
                meses[f.mes - 1] = f.ventas_brutas || f.ventas_netas || 0;
                mesesConDato[f.mes] = true;
              }
            }
          });
        }

        // Suplementar meses sin dato en finanzas con ventas en vivo
        var desde = anio + '-01-01T00:00:00';
        var hasta = (anio + 1) + '-01-01T00:00:00';
        var qs = 'select=total,fecha_venta&estado=eq.CONFIRMADA&deleted_at=is.null&fecha_venta=gte.' + desde + '&fecha_venta=lte.' + hasta;
        if (canalId) {
          qs += '&canal_id=eq.' + encodeURIComponent(canalId);
        }
        var ventasVivo = await api.get('pos_ventas?' + qs);
        (ventasVivo || []).forEach(function (v) {
          var d = new Date(v.fecha_venta);
          var mesNum = d.getMonth() + 1;
          if (!canalId && mesesConDato && mesesConDato[mesNum]) return;
          meses[d.getMonth()] += (v.total || 0);
        });

        return { data: meses, error: null };
      } catch (e) {
        return { data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], error: e.message };
      }
    },

    todosLosAnios: async function () {
      try {
        var rows = await api.get('pos_finanzas_mensuales?select=anio,mes,ventas_brutas,ventas_netas&order=anio.asc,mes.asc&deleted_at=is.null');
        if (!rows || !Array.isArray(rows)) return { data: [], error: 'Sin datos' };
        var mapped = rows.map(function (f) {
          return {
            anio: f.anio,
            mes: f.mes,
            ventas: f.ventas_brutas || f.ventas_netas || 0
          };
        });
        return { data: mapped, error: null };
      } catch (e) {
        return { data: [], error: e.message };
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: CAJAS
     ════════════════════════════════════════════════════════════ */
  var cajas = {
    listar: async function () {
      var cacheKey = 'cajas_listar';
      var cached = _cacheGet(cacheKey);
      if (cached) return cached;

      var res = await select('pos_cajas', {
        filters: [{ col: 'activa', val: true }],
        orderBy: 'nombre'
      });

      _cacheSet(cacheKey, res, 30000);
      return res;
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: CAJA APERTURA
     ════════════════════════════════════════════════════════════ */
  var cajaApertura = {
    obtenerActiva: async function (cajaId) {
      var res = await select('pos_caja_apertura', {
        filters: [
          { col: 'caja_id', val: cajaId },
          { col: 'estado', val: 'abierta' }
        ],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    abrir: async function (data) {
      _cacheClear('caja');
      return insert('pos_caja_apertura', data);
    },

    cerrar: async function (id, montoFinal, montoEsperado, diferencia) {
      _cacheClear('caja');
      return update('pos_caja_apertura', id, {
        fecha_cierre: new Date().toISOString(),
        monto_final: montoFinal,
        monto_esperado: montoEsperado,
        diferencia: diferencia,
        estado: 'cerrada'
      });
    },

    historial: async function (cajaId, opts) {
      return select('pos_caja_apertura', Object.assign({
        filters: [{ col: 'caja_id', val: cajaId }],
        orderBy: 'fecha_apertura',
        orderDir: 'desc'
      }, opts || {}));
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: MOVIMIENTOS INVENTARIO
     ════════════════════════════════════════════════════════════ */
  var movimientosInventario = {
    listar: async function (opts) {
      return select('pos_movimientos_inventario', Object.assign({
        select: '*,producto_detalle:producto_detalle_id(id,stock_actual,codigo_interno,producto:producto_id(id,nombre,categoria:categoria_id(id,nombre)))',
        orderBy: 'fecha',
        orderDir: 'desc',
        limit: 100
      }, opts || {}));
    },

    crear: async function (data) { return insert('pos_movimientos_inventario', data); },

    obtenerPorProducto: async function (productoDetalleId, opts) {
      return select('pos_movimientos_inventario', Object.assign({
        filters: [{ col: 'producto_detalle_id', val: productoDetalleId }],
        orderBy: 'fecha',
        orderDir: 'desc',
        limit: 50
      }, opts || {}));
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: METODOS DE PAGO
     ════════════════════════════════════════════════════════════ */
  var metodosPago = {
    listar: async function () {
      var cacheKey = 'metodos_pago';
      var cached = _cacheGet(cacheKey);
      if (cached) return cached;

      var res = await select('pos_metodos_pago', {
        filters: [{ col: 'activo', val: true }],
        orderBy: 'nombre'
      });

      _cacheSet(cacheKey, res, 60000);
      return res;
    }
  };

  /* ════════════════════════════════════════════════════════════
     ENTITY: CANALES DE VENTA
     ════════════════════════════════════════════════════════════ */
  var canalesVenta = {
    obtenerPorCodigo: async function (codigo) {
      var cacheKey = 'canal_' + codigo;
      var cached = _cacheGet(cacheKey);
      if (cached) return cached;

      var res = await select('pos_canales_venta', {
        filters: [{ col: 'codigo', val: codigo }],
        limit: 1
      });
      var result = { data: res.data && res.data[0] || null, error: res.error };
      if (result.data) _cacheSet(cacheKey, result, 60000);
      return result;
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: PRODUCTOS MULTIMEDIA
      ════════════════════════════════════════════════════════════ */
  var productosMultimedia = {
    listar: async function (productoId) {
      return select('pos_productos_multimedia', {
        filters: [{ col: 'producto_id', val: productoId }],
        orderBy: 'orden'
      });
    },
    crear: async function (data) { return insert('pos_productos_multimedia', data); },
    actualizar: async function (id, data) { return update('pos_productos_multimedia', id, data); },
    eliminar: async function (id) { return softDelete('pos_productos_multimedia', id); }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: PROVEEDORES
      ════════════════════════════════════════════════════════════ */
  var proveedores = {
    listar: async function (opts) {
      return select('pos_proveedores', Object.assign({
        orderBy: 'razon_social',
        searchFields: ['razon_social', 'numero_id', 'email', 'celular']
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_proveedores', { filters: [{ col: 'id', val: id }], limit: 1 });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    buscar: async function (termino, opts) {
      return select('pos_proveedores', Object.assign({
        search: termino,
        searchFields: ['razon_social', 'numero_id', 'email', 'celular'],
        limit: 15
      }, opts || {}));
    },

    crear: async function (data) { return insert('pos_proveedores', data); },
    actualizar: async function (id, data) { return update('pos_proveedores', id, data); },
    eliminar: async function (id) { return softDelete('pos_proveedores', id); }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: COMPRAS
      ════════════════════════════════════════════════════════════ */
  var compras = {
    listar: async function (opts) {
      return select('pos_compras', Object.assign({
        select: '*,proveedor:proveedor_id(id,razon_social,numero_id),usuario:usuario_id(id,nombre_completo)',
        orderBy: 'fecha_compra',
        orderDir: 'desc',
        searchFields: ['numero_orden', 'notas']
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_compras', {
        select: '*,proveedor:proveedor_id(*),usuario:usuario_id(*),detalles:pos_compras_detalle(*)',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    obtenerSiguienteNumeroOrden: async function () {
      try {
        var data = await api.get('pos_compras?select=numero_orden&order=numero_orden.desc&limit=1');
        var ultimo = (data && data.length && data[0].numero_orden) || 0;
        return { data: (parseInt(ultimo) || 0) + 1, error: null };
      } catch (e) {
        console.error('[DB] Error obteniendo siguiente numero orden:', e);
        return { data: 1, error: e.message };
      }
    },

    crear: async function (compraData) {
      return insert('pos_compras', compraData);
    },

    crearConDetalles: async function (compraData, detalles) {
      var resCompra = await insert('pos_compras', compraData);
      if (resCompra.error || !resCompra.data || !resCompra.data.length) {
        return { data: null, error: resCompra.error || 'Error al crear compra' };
      }
      var compraId = resCompra.data[0].id;

      var detallesConId = detalles.map(function (d) {
        d.compra_id = compraId;
        return d;
      });

      try {
        await api.post('pos_compras_detalle', detallesConId);
        return { data: resCompra.data[0], error: null };
      } catch (e) {
        console.error('[DB] Error al insertar detalles de compra:', e);
        return { data: null, error: e.message };
      }
    },

    actualizar: async function (id, data) {
      return update('pos_compras', id, data);
    },

    actualizarEstado: async function (id, estado) {
      return update('pos_compras', id, { estado: estado });
    },

    obtenerConDetalles: async function (id) {
      var res = await select('pos_compras', {
        select: '*,proveedor:proveedor_id(*),usuario:usuario_id(*),detalles:pos_compras_detalle(*,producto_detalle:producto_detalle_id(*,producto:producto_id(*)))',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    eliminar: async function (id) { return softDelete('pos_compras', id); },

    totalDelMes: async function (anio, mes) {
      try {
        var a = anio || new Date().getFullYear();
        var m = mes || (new Date().getMonth() + 1);
        var sigMes = m === 12 ? 1 : m + 1;
        var sigAnio = m === 12 ? a + 1 : a;
        var desde = a + '-' + String(m).padStart(2, '0') + '-01T00:00:00';
        var hasta = sigAnio + '-' + String(sigMes).padStart(2, '0') + '-01T00:00:00';
        var data = await api.get('pos_compras?select=total' +
          '&estado=in.(RECIBIDA,RECIBIENDO,PENDIENTE)' +
          '&deleted_at=is.null' +
          '&fecha_compra=gte.' + desde +
          '&fecha_compra=lt.' + hasta);
        if (!data || !data.length) return 0;
        return data.reduce(function (s, r) { return s + (r.total || 0); }, 0);
      } catch (e) {
        console.error('[DB] compras.totalDelMes error:', e);
        return 0;
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: COMPRAS DETALLE
      ════════════════════════════════════════════════════════════ */
  var comprasDetalle = {
    listarPorCompra: async function (compraId) {
      return select('pos_compras_detalle', {
        select: '*,producto_detalle:producto_detalle_id(id,codigo_interno,stock_actual,producto:producto_id(id,nombre,marca,modelo))',
        filters: [{ col: 'compra_id', val: compraId }],
        orderBy: 'created_at'
      });
    },

    crear: async function (data) { return insert('pos_compras_detalle', data); },
    actualizar: async function (id, data) { return update('pos_compras_detalle', id, data); },
    eliminar: async function (id) { return softDelete('pos_compras_detalle', id); },

    recibir: async function (id, cantidad, usuarioId) {
      try {
        var resDet = await select('pos_compras_detalle', {
          select: '*,compra:compra_id(*)',
          filters: [{ col: 'id', val: id }],
          limit: 1
        });
        if (!resDet.data || !resDet.data.length) {
          return { data: null, error: 'Detalle de compra no encontrado' };
        }
        var detalle = resDet.data[0];
        var nuevaRecibida = (detalle.cantidad_recibida || 0) + cantidad;
        if (nuevaRecibida > detalle.cantidad) {
          return { data: null, error: 'Cantidad a recibir excede lo ordenado' };
        }

        var nuevoEstadoDet = nuevaRecibida >= detalle.cantidad ? 'RECIBIDO' : 'PENDIENTE';

        var updRes = await update('pos_compras_detalle', id, {
          cantidad_recibida: nuevaRecibida,
          estado_detalle: nuevoEstadoDet,
          updated_by: usuarioId
        });
        if (updRes.error) return updRes;

        // Politica estricta: si el movimiento de inventario falla, se revierte
        // el detalle para no dejar una recepcion "fantasma" sin inventario
        var movRes = await insert('pos_movimientos_inventario', {
          producto_detalle_id: detalle.producto_detalle_id,
          tipo_movimiento: 'entrada_compra',
          cantidad: cantidad,
          motivo: 'Recepcion de compra',
          referencia: 'OC-' + (detalle.compra && detalle.compra.numero_orden || ''),
          created_by: usuarioId
        });
        if (movRes.error) {
          console.error('[DB] Error al crear movimiento inventario:', movRes.error);
          var revDet = await update('pos_compras_detalle', id, {
            cantidad_recibida: detalle.cantidad_recibida || 0,
            estado_detalle: (parseInt(detalle.cantidad_recibida || 0)) >= detalle.cantidad ? 'RECIBIDO' : 'PENDIENTE',
            updated_by: usuarioId
          });
          if (revDet.error) {
            console.error('[DB] CRITICO: no se pudo revertir el detalle tras fallo de movimiento:', revDet.error);
          }
          return { data: null, error: 'Fallo al registrar movimiento de inventario: ' + movRes.error + '. Recepcion revertida, intente de nuevo.' };
        }

        var detActual = await select('pos_productos_detalle', {
          filters: [{ col: 'id', val: detalle.producto_detalle_id }],
          limit: 1,
          incluirEliminados: true
        });
        if (detActual.data && detActual.data.length) {
          var stockActual = parseInt(detActual.data[0].stock_actual || 0);
          var stockUpd = await update('pos_productos_detalle', detalle.producto_detalle_id, {
            stock_actual: stockActual + cantidad
          });
          if (stockUpd.error) {
            console.error('[DB] Error al actualizar stock:', stockUpd.error);
            // Politica estricta: eliminar movimiento creado y revertir detalle
            var movId = movRes.data && (Array.isArray(movRes.data) ? movRes.data[0].id : movRes.data.id);
            if (movId) {
              var delMov = await api.delete('pos_movimientos_inventario?id=eq.' + movId);
              if (delMov && delMov.error) console.error('[DB] CRITICO: no se pudo eliminar el movimiento huerfano:', delMov.error);
            }
            var revDet2 = await update('pos_compras_detalle', id, {
              cantidad_recibida: detalle.cantidad_recibida || 0,
              estado_detalle: (parseInt(detalle.cantidad_recibida || 0)) >= detalle.cantidad ? 'RECIBIDO' : 'PENDIENTE',
              updated_by: usuarioId
            });
            if (revDet2.error) {
              console.error('[DB] CRITICO: no se pudo revertir el detalle tras fallo de stock:', revDet2.error);
            }
            return { data: null, error: 'Fallo al actualizar stock: ' + stockUpd.error + '. Recepcion revertida, intente de nuevo.' };
          }
        } else {
          console.error('[DB] Variante no encontrada para actualizar stock:', detalle.producto_detalle_id);
          var movId2 = movRes.data && (Array.isArray(movRes.data) ? movRes.data[0].id : movRes.data.id);
          if (movId2) await api.delete('pos_movimientos_inventario?id=eq.' + movId2);
          await update('pos_compras_detalle', id, {
            cantidad_recibida: detalle.cantidad_recibida || 0,
            estado_detalle: (parseInt(detalle.cantidad_recibida || 0)) >= detalle.cantidad ? 'RECIBIDO' : 'PENDIENTE',
            updated_by: usuarioId
          });
          return { data: null, error: 'Variante de producto no encontrada. Recepcion revertida.' };
        }

        var advertencias = [];
        // Nota: checkTodos usa el filtro default (deleted_at=is.null) a proposito:
        // las filas soft-deleted ya no hacen parte de la orden, por lo que NO deben
        // bloquear el paso a RECIBIDA (a diferencia del lookup de variante, que si
        // usa incluirEliminados porque el stock debe actualizarse siempre).
        var checkTodos = await select('pos_compras_detalle', {
          select: 'id,estado_detalle',
          filters: [{ col: 'compra_id', val: detalle.compra_id }]
        });
        if (!checkTodos.error && checkTodos.data && checkTodos.data.length) {
          var todosRecibidos = checkTodos.data.every(function (d) { return d.estado_detalle === 'RECIBIDO'; });
          var algunRecibido = checkTodos.data.some(function (d) { return d.estado_detalle === 'RECIBIDO'; });
          if (todosRecibidos) {
            var resEst1 = await update('pos_compras', detalle.compra_id, { estado: 'RECIBIDA' });
            if (resEst1.error) {
              console.error('[DB] Error al marcar compra RECIBIDA:', resEst1.error);
              advertencias.push('No se pudo actualizar el estado de la orden a RECIBIDA');
            }
          } else if (algunRecibido) {
            var resEst2 = await update('pos_compras', detalle.compra_id, { estado: 'RECIBIENDO' });
            if (resEst2.error) {
              console.error('[DB] Error al marcar compra RECIBIENDO:', resEst2.error);
              advertencias.push('No se pudo actualizar el estado de la orden a RECIBIENDO');
            }
          }
        } else if (checkTodos.error) {
          advertencias.push('No se pudo verificar el estado de la orden');
        }

        var compraActualizada = await select('pos_compras', {
          select: '*,proveedor:proveedor_id(id,razon_social,numero_id)',
          filters: [{ col: 'id', val: detalle.compra_id }],
          limit: 1
        });

        _cacheClear('productos');

        return {
          data: {
            detalle: { id: id, cantidad_recibida: nuevaRecibida, estado_detalle: nuevoEstadoDet },
            compra: compraActualizada.data && compraActualizada.data[0] || null,
            advertencias: advertencias
          },
          error: null
        };
      } catch (e) {
        console.error('[DB] Error al recibir detalle:', e);
        return { data: null, error: e.message };
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: FACTURACION
      ════════════════════════════════════════════════════════════ */
  var facturacion = {
    listar: async function (opts) {
      return select('pos_facturacion', Object.assign({
        select: '*,venta:venta_id(id,total,created_at,fecha_venta,estado)',
        orderBy: 'created_at',
        orderDir: 'desc',
        searchFields: ['numero', 'serie', 'cliente_nombre', 'cliente_numero_id']
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_facturacion', {
        select: '*,venta:venta_id(id,total,created_at,fecha_venta,estado,usuario:usuario_id(nombre_completo))',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (data) { return insert('pos_facturacion', data); },
    actualizar: async function (id, data) { return update('pos_facturacion', id, data); },
    eliminar: async function (id) { return softDelete('pos_facturacion', id); },

    emitir: async function (id) {
      return update('pos_facturacion', id, { estado: 'EMITIDA' });
    },

    anular: async function (id) {
      return update('pos_facturacion', id, { estado: 'ANULADA' });
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: GASTOS
      ════════════════════════════════════════════════════════════ */
  var gastos = {
    listar: async function (opts) {
      return select('pos_gastos_mensuales_detalle', Object.assign({
        select: '*,categoria:categoria_id(id,nombre,descripcion)',
        orderBy: 'created_at',
        orderDir: 'desc'
      }, opts || {}));
    },

    listarPorPeriodo: async function (anio, mes, opts) {
      return select('pos_gastos_mensuales_detalle', Object.assign({
        select: '*,categoria:categoria_id(id,nombre,descripcion)',
        filters: [
          { col: 'anio', val: anio },
          { col: 'mes', val: mes }
        ],
        orderBy: 'created_at',
        orderDir: 'desc'
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_gastos_mensuales_detalle', {
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (data) { return insert('pos_gastos_mensuales_detalle', data); },
    actualizar: async function (id, data) { return update('pos_gastos_mensuales_detalle', id, data); },
    eliminar: async function (id) { return softDelete('pos_gastos_mensuales_detalle', id); },

    totalDelMes: async function (anio, mes) {
      try {
        var a = anio || new Date().getFullYear();
        var m = mes || (new Date().getMonth() + 1);
        var sigMes = m === 12 ? 1 : m + 1;
        var sigAnio = m === 12 ? a + 1 : a;
        var desde = a + '-' + String(m).padStart(2, '0') + '-01T00:00:00';
        var hasta = sigAnio + '-' + String(sigMes).padStart(2, '0') + '-01T00:00:00';
        var data = await api.get('pos_gastos_mensuales_detalle?select=monto' +
          '&deleted_at=is.null' +
          '&created_at=gte.' + desde +
          '&created_at=lt.' + hasta);
        if (!data || !data.length) return 0;
        return data.reduce(function (s, r) { return s + (r.monto || 0); }, 0);
      } catch (e) {
        console.error('[DB] gastos.totalDelMes error:', e);
        return 0;
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: GASTO CATEGORIAS
      ════════════════════════════════════════════════════════════ */
  var gastoCategorias = {
    listar: async function (opts) {
      return select('pos_gasto_categorias', Object.assign({
        orderBy: 'nombre'
      }, opts || {}));
    },

    listarActivas: async function () {
      return select('pos_gasto_categorias', {
        filters: [{ col: 'activa', val: true }],
        orderBy: 'nombre'
      });
    },

    obtener: async function (id) {
      var res = await select('pos_gasto_categorias', {
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (data) { return insert('pos_gasto_categorias', data); },
    actualizar: async function (id, data) { return update('pos_gasto_categorias', id, data); },
    eliminar: async function (id) { return softDelete('pos_gasto_categorias', id); }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: FINANZAS MENSUALES
      ════════════════════════════════════════════════════════════ */
  var finanzasMensuales = {
    listar: async function (opts) {
      return select('pos_finanzas_mensuales', Object.assign({
        orderBy: 'anio',
        orderDir: 'desc'
      }, opts || {}));
    },

    obtenerPorPeriodo: async function (anio, mes) {
      var res = await select('pos_finanzas_mensuales', {
        filters: [
          { col: 'anio', val: anio },
          { col: 'mes', val: mes }
        ],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (data) { return insert('pos_finanzas_mensuales', data); },
    actualizar: async function (id, data) { return update('pos_finanzas_mensuales', id, data); },
    eliminar: async function (id) { return softDelete('pos_finanzas_mensuales', id); },

    obtenerIngresosVsGastos: async function (anio) {
      try {
        var ahora = new Date();
        var mesActual = ahora.getMonth() + 1;
        var anioActual = ahora.getFullYear();

        var ingresosArr = Array(12).fill(0);
        var gastosArr = Array(12).fill(0);
        var utilidadArr = Array(12).fill(0);

        var res = await select('pos_finanzas_mensuales', {
          filters: [
            { col: 'anio', val: anio },
            { col: 'mes', op: 'gte', val: 1 },
            { col: 'mes', op: 'lte', val: 12 }
          ],
          orderBy: 'mes'
        });

        if (!res.error && res.data) {
          res.data.forEach(function (f) {
            if (f.mes >= 1 && f.mes <= 12) {
              var idx = f.mes - 1;
              if (anio === anioActual && f.mes === mesActual) return;

              var ing = f.ventas_brutas || f.ventas_netas || 0;
              var gas = (f.costo_mercaderia_vendida || 0)
                      + (f.gastos_operativos_total || 0)
                      + (f.costos_comision_total || 0)
                      + (f.compras_total || 0)
                      + (f.otros_gastos || 0);

              ingresosArr[idx] = ing;
              gastosArr[idx] = gas;
              utilidadArr[idx] = ing - gas;
            }
          });
        }

        if (anio === anioActual) {
          var idxAct = mesActual - 1;
          var [estVentas, totalGastos, totalCompras] = await Promise.all([
            DB.ventas.estadisticasDelPeriodo(anio, mesActual),
            DB.gastos.totalDelMes(anio, mesActual),
            DB.compras.totalDelMes(anio, mesActual)
          ]);

          var ingresosVivo = estVentas.total || 0;
          var comisiones = estVentas.costos || 0;
          var gastosVivo = totalGastos + totalCompras + comisiones;

          ingresosArr[idxAct] = ingresosVivo;
          gastosArr[idxAct] = gastosVivo;
          utilidadArr[idxAct] = ingresosVivo - gastosVivo;
        }

        return { data: { ingresos: ingresosArr, gastos: gastosArr, utilidad: utilidadArr }, error: null };
      } catch (e) {
        console.error('[DB] finanzasMensuales.obtenerIngresosVsGastos error:', e);
        return { data: null, error: e.message };
      }
    },

    obtenerTotalesHistoricos: async function () {
      try {
        var [resVentas, dataGastos, dataCompras, dataGastosCom, dataInvInicial] = await Promise.all([
          select('pos_finanzas_mensuales', {
            select: 'ventas_netas',
            noCache: true
          }),
          api.get('pos_gastos_mensuales_detalle?select=monto' +
            '&categoria_id=in.(75a007e7-76a1-4862-aea4-ff0a6d4f93c3,4fd3dd82-30b8-4ad2-997a-3dd31a5fd165,cc8832af-9c03-49e3-b5b3-bed57783fd2f)' +
            '&deleted_at=is.null'),
          api.get('pos_compras?select=total' +
            '&deleted_at=is.null' +
            '&estado=neq.ANULADA'),
          api.get('pos_gastos_mensuales_detalle?select=monto' +
            '&categoria_id=not.in.(75a007e7-76a1-4862-aea4-ff0a6d4f93c3,4fd3dd82-30b8-4ad2-997a-3dd31a5fd165,cc8832af-9c03-49e3-b5b3-bed57783fd2f,825d6c01-f9ea-490f-9a81-9eeb9a5bbddf,22508578-c881-43a9-9c9d-63149dd53e2b,98e57eb7-4a8b-4757-b5b1-381f75a8c0af)' +
            '&deleted_at=is.null'),
          api.get('pos_gastos_mensuales_detalle?select=monto' +
            '&categoria_id=in.(825d6c01-f9ea-490f-9a81-9eeb9a5bbddf,22508578-c881-43a9-9c9d-63149dd53e2b,98e57eb7-4a8b-4757-b5b1-381f75a8c0af)' +
            '&deleted_at=is.null')
        ]);

        if (resVentas.error) return { data: null, error: resVentas.error };

        var ventasBrutas = (resVentas.data || []).reduce(function (sum, r) {
          return sum + (r.ventas_netas || 0);
        }, 0);

        var cmvGastos = !dataGastos || !dataGastos.length ? 0
          : dataGastos.reduce(function (s, r) { return s + (r.monto || 0); }, 0);

        var cmvCompras = !dataCompras || !dataCompras.length ? 0
          : dataCompras.reduce(function (s, r) { return s + (r.total || 0); }, 0);

        var gastosComisiones = !dataGastosCom || !dataGastosCom.length ? 0
          : dataGastosCom.reduce(function (s, r) { return s + (r.monto || 0); }, 0);

        var inversionInicial = !dataInvInicial || !dataInvInicial.length ? 0
          : dataInvInicial.reduce(function (s, r) { return s + (r.monto || 0); }, 0);

        return {
          data: {
            ventas_brutas: ventasBrutas,
            cmv: cmvGastos + cmvCompras,
            gastos_comisiones: gastosComisiones,
            inversion_inicial: inversionInicial,
            meses_operacion: (resVentas.data || []).length
          },
          error: null
        };
      } catch (e) {
        console.error('[DB] obtenerTotalesHistoricos error:', e);
        return { data: null, error: e.message };
      }
    },

    actualizarPorVenta: async function (anio, mes, ventaBruta, descuento, costoComision, costoMercaderia) {
      try {
        await api.rpc('actualizar_finanzas_mensuales', {
          p_anio: anio,
          p_mes: mes,
          p_venta_bruta: ventaBruta,
          p_descuento: descuento,
          p_costo_comision: costoComision,
          p_costo_mercaderia: costoMercaderia
        });
        return { error: null };
      } catch (e) {
        console.error('[DB] Error actualizando finanzas:', e);
        return { error: e.message };
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: CONFIGURACION EMPRESA (singleton)
      ════════════════════════════════════════════════════════════ */
  var configuracionEmpresa = {
    obtener: async function () {
      var res = await select('pos_configuracion_empresa', {
        orderBy: 'created_at',
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    guardar: async function (data) {
      var existe = await configuracionEmpresa.obtener();
      if (existe.data) {
        return update('pos_configuracion_empresa', existe.data.id, data);
      }
      return insert('pos_configuracion_empresa', data);
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: ROLES
      ════════════════════════════════════════════════════════════ */
  var roles = {
    listar: async function () {
      var cacheKey = 'roles_listar';
      var cached = _cacheGet(cacheKey);
      if (cached) return cached;

      var res = await select('pos_roles', {
        orderBy: 'nombre'
      });

      _cacheSet(cacheKey, res, 60000);
      return res;
    }
  };

  /* ════════════════════════════════════════════════════════════
      ENTITY: USUARIOS
      ════════════════════════════════════════════════════════════ */
  var usuarios = {
    listar: async function (opts) {
      return select('pos_usuarios', Object.assign({
        select: '*,rol:rol_id(id,nombre)',
        orderBy: 'nombre_completo',
        searchFields: ['nombre_completo', 'usuario', 'email', 'documento']
      }, opts || {}));
    },

    obtener: async function (id) {
      var res = await select('pos_usuarios', {
        select: '*,rol:rol_id(id,nombre)',
        filters: [{ col: 'id', val: id }],
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    },

    crear: async function (data) { return insert('pos_usuarios', data); },
    actualizar: async function (id, data) { return update('pos_usuarios', id, data); },
    eliminar: async function (id) { return softDelete('pos_usuarios', id); },

    crearConAuth: async function (datosUsuario, password) {
      try {
        // 1. Crear usuario en Supabase Auth via Admin API
        var authRes = await window.__supabase.authPost('admin/users', {
          email: datosUsuario.email,
          password: password,
          email_confirm: true,
          user_metadata: { full_name: datosUsuario.nombre_completo }
        });

        if (!authRes.ok) {
          var errText = await authRes.text();
          return { data: null, error: 'Error creando usuario en Auth: ' + errText };
        }

        var authUser = await authRes.json();

        // 2. Insertar en pos_usuarios con el mismo UUID de Auth
        var usuarioData = {
          id: authUser.id,
          nombre_completo: datosUsuario.nombre_completo,
          usuario: datosUsuario.usuario,
          email: datosUsuario.email,
          telefono: datosUsuario.telefono || null,
          documento: datosUsuario.documento || null,
          fecha_nacimiento: datosUsuario.fecha_nacimiento || null,
          direccion: datosUsuario.direccion || null,
          rol_id: datosUsuario.rol_id,
          activo: datosUsuario.activo !== false,
          password_hash: ''
        };

        var dbRes = await insert('pos_usuarios', usuarioData);
        if (dbRes.error) {
          return { data: null, error: dbRes.error };
        }

        return { data: usuarioData, error: null };
      } catch (e) {
        console.error('[DB] usuarios.crearConAuth error:', e);
        return { data: null, error: e.message };
      }
    },

    actualizarPassword: async function (userId, newPassword) {
      try {
        var authRes = await window.__supabase.authPut('admin/users/' + userId, {
          password: newPassword
        });

        if (!authRes.ok) {
          var errText = await authRes.text();
          return { error: 'Error actualizando password en Auth: ' + errText };
        }

        return { error: null };
      } catch (e) {
        console.error('[DB] usuarios.actualizarPassword error:', e);
        return { error: e.message };
      }
    }
  };

  function cargarLinkTienda() {
    var link = document.getElementById('link-tienda-virtual');
    if (!link) return;
    configuracionEmpresa.obtener().then(function (res) {
      if (res.data && res.data.store_url) {
        link.href = res.data.store_url;
      }
    }).catch(function () {});
  }

  /* ════════════════════════════════════════════════════════════
      API PUBLICA
      ════════════════════════════════════════════════════════════ */
  return {
    // Genericos
    select: select,
    insert: insert,
    update: update,
    softDelete: softDelete,

    // Cache
    cacheClear: _cacheClear,

    // Entidades
    productos: productos,
    categorias: categorias,
    clientes: clientes,
    proveedores: proveedores,
    ventas: ventas,
    compras: compras,
    comprasDetalle: comprasDetalle,
    cajas: cajas,
    cajaApertura: cajaApertura,
    metodosPago: metodosPago,
    canalesVenta: canalesVenta,
    movimientosInventario: movimientosInventario,
    productosMultimedia: productosMultimedia,
    facturacion: facturacion,
    gastos: gastos,
    gastoCategorias: gastoCategorias,
    finanzasMensuales: finanzasMensuales,
    configuracionEmpresa: configuracionEmpresa,
    roles: roles,
    usuarios: usuarios,
    cargarLinkTienda: cargarLinkTienda
  };
})();

/* ════════════════════════════════════════════════════════════
    AUTO: Cargar logo de empresa en el header de todas las paginas POS
    Busca el contenedor .w-8.h-8.bg-slate-950.rounded-lg y reemplaza
    la "K" por el logo si existe logo_url en la configuracion.
    ════════════════════════════════════════════════════════════ */
(function () {
  function cargarLogoHeader() {
    var container = document.querySelector('.w-8.h-8.bg-slate-950.rounded-lg');
    if (!container) return;

    DB.configuracionEmpresa.obtener().then(function (res) {
      if (!res.data || !res.data.logo_url) return;

      var img = document.createElement('img');
      img.src = res.data.logo_url;
      img.alt = 'Logo';
      img.className = 'h-8 w-auto max-w-[160px]';
      img.onerror = function () {
        container.innerHTML = '<span class="text-white dark:text-slate-950 font-bold text-sm">K</span>';
        container.className = 'w-8 h-8 bg-slate-950 dark:bg-white rounded-lg flex items-center justify-center shrink-0';
      };
      container.innerHTML = '';
      container.className = 'h-8 flex items-center shrink-0';
      container.appendChild(img);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarLogoHeader);
  } else {
    cargarLogoHeader();
  }
})();

window.mostrarToast = function (msg, tipo) {
  var el = document.getElementById('toast');
  if (!el) return;
  var iconEl = document.getElementById('toast-icon');
  var msgEl = document.getElementById('toast-message');
  var closeEl = document.getElementById('toast-close');

  if (msgEl) msgEl.textContent = msg;

  if (iconEl) {
    iconEl.classList.remove('hidden');
    el.classList.remove('border-red-200', 'dark:border-red-800/50', 'border-emerald-200', 'dark:border-emerald-800/50', 'border-sky-200', 'dark:border-sky-800/50');

    if (tipo) {
      var icons = {
        error: '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>',
        success: '<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        info: '<svg class="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>'
      };
      iconEl.innerHTML = icons[tipo] || icons.info;
      if (tipo === 'error') el.classList.add('border-red-200', 'dark:border-red-800/50');
      else if (tipo === 'success') el.classList.add('border-emerald-200', 'dark:border-emerald-800/50');
      else el.classList.add('border-sky-200', 'dark:border-sky-800/50');
    } else {
      iconEl.classList.add('hidden');
    }
  }

  el.classList.add('show');

  if (closeEl) {
    closeEl.onclick = function () { el.classList.remove('show'); };
  }

  clearTimeout(el._timer);
  el._timer = setTimeout(function () { el.classList.remove('show'); }, 4000);
};
