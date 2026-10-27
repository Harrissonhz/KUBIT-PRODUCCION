/* ============================================================
   database.js — Servicio de Base de Datos — Kubit-WMS
   ============================================================
   A2: version minima adaptada de apps/pos/js/compartido/database.js
       (_buildQuery, _esErrorAuth, select, configuracionEmpresa,
       logo del header y mostrarToast). Sin entidades del POS.
   A4: agrega DB.wms.* (lecturas de tablas/vistas wms_* y llamadas
       rpc() a las funciones de specs/09-wms-functions.sql).
   A5: agrega DB.productos.buscar() y DB.wms.stockPorSkus().
   A6: agrega DB.wms.crearUbicacion() (alta de contenedores).
   A7: agrega DB.wms.crearBodega(), DB.wms.actualizarUbicacion()
       y DB.wms.stockEnUbicaciones().
   V1: agrega DB.wms.detalleUbicaciones().
   B1: agrega DB.wms.bandejaDespacho() (R-B1). B2: orden por numero.
   C1: regla CR1 (solo lectura sobre pos_* y st_*): sin ajustar/darBaja;
       resolverDecremento(mov, codigo?); productos.porIds();
       wms.salidasPendientes().
   C2: registrarConteo devuelve una fila (o_sobrante_pendiente, CR3);
       agrega wms.stockEnContenedor(), wms.conteosAbiertos() y
       wms.cerrarSobrante() (specs/11-wms-conteo-sobrante.sql).
   U2: agrega wms.pendientesUbicar() (SKU con unidades SIN_UBICAR para
       la lista de Ubicar; marca los SKU eliminados en el POS).

   REGLA CR1: este archivo solo LEE tablas pos_* (GET). Nunca hace
   post/patch/delete sobre pos_* ni st_*.
   REGLA (constitution.md, Articulo 5): las escrituras de stock van
   SIEMPRE por rpc(). wms_bodegas y wms_ubicaciones son MAESTROS y
   se escriben directo (RLS "escritura authenticated").

   Todas las funciones devuelven { data, error }.
   Dependencias: supabase.js (window.__supabase)
   Expone: window.DB
   ============================================================ */
window.DB = (function () {
  var api = window.__supabase;
  if (!api) {
    console.error('[DB] ERROR: window.__supabase no disponible. Cargar supabase.js antes.');
    return {};
  }

  /* ════════════════════════════════════════════════════════════
     QUERY STRING BUILDER (PostgREST) — copia del POS
     ════════════════════════════════════════════════════════════ */
  function _buildQuery(opts) {
    var parts = [];
    parts.push('select=' + encodeURIComponent(opts.select || '*'));
    (opts.filters || []).forEach(function (f) {
      if (f.val === null || f.val === undefined) return;
      parts.push(encodeURIComponent(f.col) + '=' + encodeURIComponent(f.op || 'eq') + '.' + encodeURIComponent(f.val));
    });
    if (opts.search) {
      var searchFields = opts.searchFields || ['nombre'];
      var orParts = searchFields.map(function (f) {
        return f + '.ilike.%25' + encodeURIComponent(opts.search) + '%25';
      });
      parts.push('or=(' + orParts.join(',') + ')');
    }
    if (!opts.incluirEliminados) {
      parts.push('deleted_at=is.null');
    }
    if (opts.orderBy) {
      var dir = opts.orderDir === 'desc' ? '.desc' : '.asc';
      parts.push('order=' + encodeURIComponent(opts.orderBy) + dir);
    }
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
     ERRORES
     ════════════════════════════════════════════════════════════ */
  function _esErrorAuth(msj) {
    return msj && (msj.indexOf('401') !== -1 || msj.indexOf('JWT') !== -1 || msj.indexOf('expired') !== -1);
  }

  function _mensajeError(e) {
    var texto = (e && e.message) || String(e);
    var i = texto.indexOf('{');
    if (i !== -1) {
      try {
        var json = JSON.parse(texto.slice(i));
        if (json && json.message) return json.message;
      } catch (x) { /* no era JSON */ }
    }
    return texto;
  }

  function _codigoError(e) {
    var texto = (e && e.message) || '';
    var i = texto.indexOf('{');
    if (i === -1) return null;
    try { return JSON.parse(texto.slice(i)).code || null; } catch (x) { return null; }
  }

  function _manejarAuth(msj) {
    if (_esErrorAuth(msj) && window.KubitAuth && window.KubitAuth.manejarErrorAuth) {
      window.KubitAuth.manejarErrorAuth();
    }
  }

  function _auditoria(cuerpo, usuarioId, esAlta) {
    if (usuarioId && /^[0-9a-f-]{36}$/i.test(String(usuarioId))) {
      if (esAlta) cuerpo.created_by = usuarioId;
      cuerpo.updated_by = usuarioId;
    }
    return cuerpo;
  }

  function _unicos(lista) {
    var vistos = {};
    return lista.filter(function (v) {
      if (!v || vistos[v]) return false;
      vistos[v] = true;
      return true;
    });
  }

  /* ════════════════════════════════════════════════════════════
     LECTURA GENERICA — copia del POS (+ error legible en A4)
     ════════════════════════════════════════════════════════════ */
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
      _manejarAuth(e.message);
      return { data: [], error: _mensajeError(e), count: 0 };
    }
  }

  function _selectVista(vista, opts) {
    opts.incluirEliminados = true;
    return select(vista, opts);
  }

  /* ════════════════════════════════════════════════════════════
     RPC GENERICO (A4)
     ════════════════════════════════════════════════════════════ */
  async function rpc(fn, params) {
    try {
      var data = await api.rpc(fn, params || {});
      return { data: data, error: null };
    } catch (e) {
      console.error('[DB] rpc error:', fn, e);
      _manejarAuth(e.message);
      return { data: null, error: _mensajeError(e) };
    }
  }

  /* ════════════════════════════════════════════════════════════
     CONFIGURACION EMPRESA (solo lectura: logo)
     ════════════════════════════════════════════════════════════ */
  var configuracionEmpresa = {
    obtener: async function () {
      var res = await select('pos_configuracion_empresa', {
        orderBy: 'created_at',
        limit: 1
      });
      return { data: res.data && res.data[0] || null, error: res.error };
    }
  };

  /* ════════════════════════════════════════════════════════════
     DB.productos — CATALOGO FISICO DEL POS (solo lectura)
     Excluye productos DIGITALES (D5). tipo NULL = fisico.
     ════════════════════════════════════════════════════════════ */
  function _limpiarBusqueda(texto) {
    return String(texto || '')
      .replace(/[,.:()"\\*%']/g, '*')
      .replace(/\s+/g, ' ')
      .replace(/\*+/g, '*')
      .replace(/^[*\s]+|[*\s]+$/g, '');
  }

  var SEL_DETALLE = 'id,producto_id,codigo_interno,codigo_barras,stock_actual,atributos';
  var SEL_PRODUCTO = 'id,nombre,tipo_producto,activo';

  var productos = {
    buscar: async function (texto, limite) {
      var t = _limpiarBusqueda(texto);
      if (t.replace(/\*/g, '').length < 2) return { data: [], error: null };
      limite = limite || 30;
      var patron = '*' + encodeURIComponent(t) + '*';
      try {
        var r1 = await Promise.all([
          api.get('pos_productos?select=' + SEL_PRODUCTO +
            '&deleted_at=is.null&nombre=ilike.' + patron +
            '&or=(tipo_producto.is.null,tipo_producto.neq.Digital)' +
            '&order=nombre.asc&limit=' + limite),
          api.get('pos_productos_detalle?select=' + SEL_DETALLE +
            '&deleted_at=is.null&or=(codigo_interno.ilike.' + patron + ',codigo_barras.ilike.' + patron + ')' +
            '&limit=' + limite)
        ]);
        var prodNombre = r1[0] || [];
        var detCodigo = r1[1] || [];

        var prodMap = {};
        prodNombre.forEach(function (p) { prodMap[p.id] = p; });
        var idsProdNombre = prodNombre.map(function (p) { return p.id; });
        var idsProdFaltan = _unicos(detCodigo.map(function (d) { return d.producto_id; }))
          .filter(function (id) { return !prodMap[id]; });

        var r2 = await Promise.all([
          idsProdNombre.length
            ? api.get('pos_productos_detalle?select=' + SEL_DETALLE +
                '&deleted_at=is.null&producto_id=in.(' + idsProdNombre.join(',') + ')')
            : Promise.resolve([]),
          idsProdFaltan.length
            ? api.get('pos_productos?select=' + SEL_PRODUCTO +
                '&deleted_at=is.null&id=in.(' + idsProdFaltan.join(',') + ')')
            : Promise.resolve([])
        ]);
        (r2[1] || []).forEach(function (p) { prodMap[p.id] = p; });

        var detMap = {};
        detCodigo.concat(r2[0] || []).forEach(function (d) { detMap[d.id] = d; });

        var buscado = t.replace(/\*/g, '').toLowerCase();
        var lista = Object.keys(detMap).map(function (id) {
          var d = detMap[id];
          var p = prodMap[d.producto_id];
          if (!p || p.tipo_producto === 'Digital') return null;   // D5
          return {
            id: d.id,
            producto_id: d.producto_id,
            nombre: p.nombre,
            codigo_interno: d.codigo_interno,
            codigo_barras: d.codigo_barras,
            stock_actual: d.stock_actual || 0,
            atributos: d.atributos,
            activo: p.activo !== false
          };
        }).filter(Boolean);

        lista.sort(function (a, b) {
          var ea = (a.codigo_interno || '').toLowerCase() === buscado ? 0 : 1;
          var eb = (b.codigo_interno || '').toLowerCase() === buscado ? 0 : 1;
          if (ea !== eb) return ea - eb;
          var n = (a.nombre || '').localeCompare(b.nombre || '', 'es');
          if (n !== 0) return n;
          return (a.codigo_interno || '').localeCompare(b.codigo_interno || '', 'es');
        });

        return { data: lista.slice(0, limite), error: null, hayMas: lista.length > limite };
      } catch (e) {
        console.error('[DB] productos.buscar error:', e);
        _manejarAuth(e.message);
        return { data: [], error: _mensajeError(e) };
      }
    },

    // C1: datos de varios SKU por id (incluye eliminados, para mostrar historicos).
    // data = { producto_detalle_id: { id, codigo_interno, atributos, stock_actual, nombre } }
    porIds: async function (ids) {
      ids = _unicos(ids || []);
      if (!ids.length) return { data: {}, error: null };
      try {
        var det = await api.get('pos_productos_detalle?select=' + SEL_DETALLE + '&id=in.(' + ids.join(',') + ')');
        var idsProd = _unicos((det || []).map(function (d) { return d.producto_id; }));
        var prods = idsProd.length
          ? await api.get('pos_productos?select=' + SEL_PRODUCTO + '&id=in.(' + idsProd.join(',') + ')')
          : [];
        var pm = {};
        (prods || []).forEach(function (p) { pm[p.id] = p; });
        var mapa = {};
        (det || []).forEach(function (d) {
          mapa[d.id] = {
            id: d.id,
            codigo_interno: d.codigo_interno,
            atributos: d.atributos,
            stock_actual: d.stock_actual || 0,
            nombre: (pm[d.producto_id] || {}).nombre || ''
          };
        });
        return { data: mapa, error: null };
      } catch (e) {
        console.error('[DB] productos.porIds error:', e);
        _manejarAuth(e.message);
        return { data: {}, error: _mensajeError(e) };
      }
    }
  };

  /* ════════════════════════════════════════════════════════════
     DB.wms — KUBIT-WMS
     ════════════════════════════════════════════════════════════ */
  var SEL_BODEGA = 'id,codigo,nombre,descripcion,activo';
  var SEL_UBICACION = 'id,bodega_id,parent_id,tipo,codigo,nombre,es_hoja,mono_sku,producto_detalle_id,activo';
  var _cacheBodegas = null;

  // C2: el sobrante lo escribe wms_registrar_conteo al inicio de la observacion
  function _sobranteDe(observaciones) {
    var m = String(observaciones || '').match(/^Sobrante de (\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  var wms = {

    /* ---------- Lecturas: maestros ---------- */

    bodegas: function () {
      return select('wms_bodegas', { select: SEL_BODEGA, orderBy: 'codigo' });
    },

    ubicaciones: function (opts) {
      opts = opts || {};
      var filtros = [
        { col: 'bodega_id', op: 'eq', val: opts.bodegaId },
        { col: 'tipo', op: 'eq', val: opts.tipo }
      ];
      if (opts.soloActivos) filtros.push({ col: 'activo', op: 'eq', val: 'true' });
      return select('wms_ubicaciones', { select: SEL_UBICACION, filters: filtros, orderBy: 'codigo' });
    },

    ubicacionPorCodigo: async function (codigo) {
      var res = await select('wms_ubicaciones', {
        select: SEL_UBICACION,
        filters: [{ col: 'codigo', op: 'eq', val: String(codigo || '').trim() }],
        limit: 1
      });
      return { data: res.data[0] || null, error: res.error };
    },

    rutas: function (opts) {
      opts = opts || {};
      return _selectVista('wms_v_ubicaciones_ruta', {
        select: 'ubicacion_id,codigo,tipo,bodega_codigo,bodega,ruta',
        filters: [{ col: 'bodega_codigo', op: 'eq', val: opts.bodegaCodigo }],
        orderBy: 'codigo'
      });
    },

    // V1: datos para mostrar contenedores
    detalleUbicaciones: async function (ids) {
      ids = _unicos(ids || []);
      if (!ids.length) return { data: {}, error: null };
      var sel = 'id,codigo,tipo,nombre,parent_id,bodega_id,activo';

      var r1 = await select('wms_ubicaciones', {
        select: sel,
        filters: [{ col: 'id', op: 'in', val: '(' + ids.join(',') + ')' }]
      });
      if (r1.error) return { data: {}, error: r1.error };
      var porId = {};
      r1.data.forEach(function (u) { porId[u.id] = u; });

      var faltan = _unicos(r1.data.map(function (u) { return u.parent_id; }))
        .filter(function (id) { return !porId[id]; });
      if (faltan.length) {
        var r2 = await select('wms_ubicaciones', {
          select: sel,
          filters: [{ col: 'id', op: 'in', val: '(' + faltan.join(',') + ')' }]
        });
        if (!r2.error) r2.data.forEach(function (u) { porId[u.id] = u; });
      }

      if (!_cacheBodegas) {
        var rb = await wms.bodegas();
        if (!rb.error) _cacheBodegas = rb.data;
      }
      var bodegaPorId = {};
      (_cacheBodegas || []).forEach(function (b) { bodegaPorId[b.id] = b; });

      var mapa = {};
      ids.forEach(function (id) {
        var u = porId[id];
        if (!u) return;
        var p = u.parent_id ? porId[u.parent_id] : null;
        var b = bodegaPorId[u.bodega_id];
        mapa[id] = {
          id: u.id,
          codigo: u.codigo,
          tipo: u.tipo,
          nombre: u.nombre,
          activo: u.activo,
          puesto: p ? { tipo: p.tipo, codigo: p.codigo, nombre: p.nombre } : null,
          bodega: b ? { codigo: b.codigo, nombre: b.nombre } : null
        };
      });
      return { data: mapa, error: null };
    },

    /* ---------- Escritura de maestros wms_* (A6-A7) ---------- */

    crearBodega: async function (datos) {
      var cuerpo = _auditoria({
        codigo: String(datos.codigo || '').trim(),
        nombre: String(datos.nombre || '').trim(),
        descripcion: datos.descripcion ? String(datos.descripcion).trim() : null,
        activo: true
      }, datos.usuarioId, true);
      try {
        var filas = await api.post('wms_bodegas?select=' + SEL_BODEGA, cuerpo);
        _cacheBodegas = null;
        return { data: (filas && filas[0]) || null, error: null };
      } catch (e) {
        console.error('[DB] crearBodega error:', e);
        _manejarAuth(e.message);
        if (_codigoError(e) === '23505') {
          return { data: null, error: 'La bodega ' + cuerpo.codigo + ' ya existe' };
        }
        return { data: null, error: _mensajeError(e) };
      }
    },

    crearUbicacion: async function (datos) {
      var cuerpo = _auditoria({
        bodega_id: datos.bodegaId,
        parent_id: datos.parentId || null,
        tipo: datos.tipo,
        codigo: String(datos.codigo || '').trim(),
        nombre: datos.nombre ? String(datos.nombre).trim() : null,
        es_hoja: !!datos.esHoja,
        mono_sku: !!datos.monoSku,
        activo: true
      }, datos.usuarioId, true);
      try {
        var filas = await api.post('wms_ubicaciones?select=' + SEL_UBICACION, cuerpo);
        return { data: (filas && filas[0]) || null, error: null };
      } catch (e) {
        console.error('[DB] crearUbicacion error:', e);
        _manejarAuth(e.message);
        if (_codigoError(e) === '23505') {
          return { data: null, error: 'El codigo ' + cuerpo.codigo + ' ya existe' };
        }
        return { data: null, error: _mensajeError(e) };
      }
    },

    actualizarUbicacion: async function (id, cambios, usuarioId) {
      var cuerpo = {};
      if (Object.prototype.hasOwnProperty.call(cambios, 'nombre')) {
        var n = cambios.nombre == null ? '' : String(cambios.nombre).trim();
        cuerpo.nombre = n || null;
      }
      if (Object.prototype.hasOwnProperty.call(cambios, 'activo')) {
        cuerpo.activo = !!cambios.activo;
      }
      _auditoria(cuerpo, usuarioId, false);
      try {
        var filas = await api.patch('wms_ubicaciones?id=eq.' + encodeURIComponent(id) + '&select=' + SEL_UBICACION, cuerpo);
        return { data: (filas && filas[0]) || null, error: null };
      } catch (e) {
        console.error('[DB] actualizarUbicacion error:', e);
        _manejarAuth(e.message);
        return { data: null, error: _mensajeError(e) };
      }
    },

    /* ---------- Lecturas: stock y control ---------- */

    stockDetalle: function (opts) {
      opts = opts || {};
      return _selectVista('wms_v_stock_detalle', {
        select: 'producto_detalle_id,codigo_interno,producto,estado_fase,cantidad,ubicacion_id,ruta',
        filters: [
          { col: 'producto_detalle_id', op: 'eq', val: opts.productoDetalleId },
          { col: 'estado_fase', op: 'eq', val: opts.estado }
        ],
        search: opts.texto ? String(opts.texto).trim() : null,
        searchFields: ['codigo_interno', 'producto'],
        orderBy: 'producto',
        limit: opts.limite || 200
      });
    },

    // U2: SKU con unidades SIN_UBICAR (lo RESERVADO es otra fila y no cuenta).
    // Incluye SKU eliminados en el POS (eliminado = true) porque sus unidades
    // existen fisicamente. Excluye digitales (D5). Mas unidades primero.
    // data = [{ id, producto_id, nombre, codigo_interno, codigo_barras,
    //           stock_actual, atributos, activo, sin_ubicar, eliminado }]
    // hayMas = true si se alcanzo el tope de filas leidas.
    pendientesUbicar: async function () {
      var TOPE = 1000;
      var LOTE = 100;   // ids por consulta (URL corta)
      var res = await _selectVista('wms_v_stock_detalle', {
        select: 'producto_detalle_id,codigo_interno,producto,cantidad',
        filters: [{ col: 'estado_fase', op: 'eq', val: 'SIN_UBICAR' }],
        orderBy: 'cantidad',
        orderDir: 'desc',
        limit: TOPE
      });
      if (res.error) return { data: [], error: res.error, hayMas: false };
      var filas = res.data || [];
      var ids = _unicos(filas.map(function (f) { return f.producto_detalle_id; }));
      var detMap = {};
      var prodMap = {};
      var errorDatos = null;
      try {
        for (var i = 0; i < ids.length; i += LOTE) {
          var det = await api.get('pos_productos_detalle?select=' + SEL_DETALLE + ',deleted_at' +
            '&id=in.(' + ids.slice(i, i + LOTE).join(',') + ')');
          (det || []).forEach(function (d) { detMap[d.id] = d; });
        }
        var idsProd = _unicos(Object.keys(detMap).map(function (k) { return detMap[k].producto_id; }));
        for (var j = 0; j < idsProd.length; j += LOTE) {
          var prods = await api.get('pos_productos?select=' + SEL_PRODUCTO + ',deleted_at' +
            '&id=in.(' + idsProd.slice(j, j + LOTE).join(',') + ')');
          (prods || []).forEach(function (p) { prodMap[p.id] = p; });
        }
      } catch (e) {
        console.error('[DB] wms.pendientesUbicar error:', e);
        _manejarAuth(e.message);
        errorDatos = _mensajeError(e);
      }
      var lista = filas.map(function (f) {
        var d = detMap[f.producto_detalle_id] || {};
        var p = prodMap[d.producto_id] || {};
        if (p.tipo_producto === 'Digital') return null;   // D5
        return {
          id: f.producto_detalle_id,
          producto_id: d.producto_id || null,
          nombre: p.nombre || f.producto || '',
          codigo_interno: d.codigo_interno || f.codigo_interno || '',
          codigo_barras: d.codigo_barras || null,
          stock_actual: d.stock_actual || 0,
          atributos: d.atributos || null,
          activo: p.activo !== false,
          sin_ubicar: Number(f.cantidad) || 0,
          eliminado: !!(d.deleted_at || p.deleted_at)
        };
      }).filter(function (x) { return x && x.sin_ubicar > 0; });
      lista.sort(function (a, b) {
        if (a.sin_ubicar !== b.sin_ubicar) return b.sin_ubicar - a.sin_ubicar;
        var n = (a.nombre || '').localeCompare(b.nombre || '', 'es');
        if (n !== 0) return n;
        return (a.codigo_interno || '').localeCompare(b.codigo_interno || '', 'es');
      });
      return { data: lista, error: errorDatos, hayMas: filas.length >= TOPE };
    },

    stockPorSkus: function (ids) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) return Promise.resolve({ data: [], error: null, count: 0 });
      return _selectVista('wms_v_stock_detalle', {
        select: 'producto_detalle_id,estado_fase,cantidad,ubicacion_id,ruta',
        filters: [{ col: 'producto_detalle_id', op: 'in', val: '(' + ids.join(',') + ')' }],
        orderBy: 'ruta'
      });
    },

    stockEnUbicaciones: function (ids) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) return Promise.resolve({ data: [], error: null, count: 0 });
      return _selectVista('wms_v_stock_detalle', {
        select: 'ubicacion_id,producto_detalle_id,estado_fase,cantidad',
        filters: [{ col: 'ubicacion_id', op: 'in', val: '(' + ids.join(',') + ')' }]
      });
    },

    // C2: contenido de un contenedor agrupado por producto.
    // data = [{ producto_detalle_id, codigo_interno, producto, ubicado, reservado }]
    // (lo RESERVADO sigue fisicamente en el contenedor hasta despacharlo)
    stockEnContenedor: async function (ubicacionId) {
      var res = await _selectVista('wms_v_stock_detalle', {
        select: 'producto_detalle_id,codigo_interno,producto,estado_fase,cantidad',
        filters: [{ col: 'ubicacion_id', op: 'eq', val: ubicacionId }],
        orderBy: 'producto'
      });
      if (res.error) return { data: [], error: res.error };
      var porSku = {};
      var orden = [];
      res.data.forEach(function (f) {
        var p = porSku[f.producto_detalle_id];
        if (!p) {
          p = porSku[f.producto_detalle_id] = {
            producto_detalle_id: f.producto_detalle_id,
            codigo_interno: f.codigo_interno,
            producto: f.producto,
            ubicado: 0,
            reservado: 0
          };
          orden.push(f.producto_detalle_id);
        }
        if (f.estado_fase === 'UBICADO') p.ubicado += Number(f.cantidad) || 0;
        else if (f.estado_fase === 'RESERVADO') p.reservado += Number(f.cantidad) || 0;
      });
      return { data: orden.map(function (k) { return porSku[k]; }), error: null };
    },

    reconciliacion: function (soloDiferencias) {
      return _selectVista('wms_v_reconciliacion', {
        select: 'producto_detalle_id,codigo_interno,stock_pos,stock_wms,diferencia',
        filters: soloDiferencias ? [{ col: 'diferencia', op: 'neq', val: '0' }] : [],
        orderBy: 'codigo_interno'
      });
    },

    posPendientes: function () {
      return _selectVista('wms_v_pos_pendientes', {
        select: 'pos_movimiento_id,fecha,tipo_movimiento,producto_detalle_id,cantidad,referencia,motivo,accion_wms',
        orderBy: 'fecha'
      });
    },

    // C1: salidas del POS (ajuste - y merma) pendientes de indicar el origen (CR2).
    salidasPendientes: async function () {
      var res = await _selectVista('wms_v_pos_pendientes', {
        select: 'pos_movimiento_id,fecha,tipo_movimiento,producto_detalle_id,cantidad,referencia,motivo,accion_wms',
        filters: [{ col: 'accion_wms', op: 'in', val: '(AJUSTE_MENOS,BAJA)' }],
        orderBy: 'fecha'
      });
      if (res.error) return { data: [], error: res.error };
      var filas = res.data || [];
      var prod = await productos.porIds(filas.map(function (f) { return f.producto_detalle_id; }));
      var pm = prod.data || {};
      return {
        data: filas.map(function (f) {
          var p = pm[f.producto_detalle_id] || {};
          return {
            pos_movimiento_id: f.pos_movimiento_id,
            fecha: f.fecha,
            tipo_movimiento: f.tipo_movimiento,
            accion_wms: f.accion_wms,
            cantidad: Number(f.cantidad) || 0,
            referencia: f.referencia,
            motivo: f.motivo,
            producto_detalle_id: f.producto_detalle_id,
            codigo_interno: p.codigo_interno || '',
            nombre: p.nombre || '',
            atributos: p.atributos || null
          };
        }),
        error: prod.error
      };
    },

    // C2: conteos con sobrante pendiente (CR3), los mas recientes primero.
    // data = [{ id, fecha, sobrante, observaciones, cantidad_sistema, cantidad_fisica,
    //           producto_detalle_id, codigo_interno, nombre, ubicacion_id, ubicacion (V1) }]
    conteosAbiertos: async function () {
      var res = await select('wms_conteos', {
        select: 'id,sesion_inventario_id,ubicacion_id,producto_detalle_id,cantidad_sistema,cantidad_fisica,diferencia,estado,observaciones,created_at',
        filters: [{ col: 'estado', op: 'eq', val: 'ABIERTO' }],
        orderBy: 'created_at',
        orderDir: 'desc'
      });
      if (res.error) return { data: [], error: res.error };
      var filas = res.data || [];
      var r = await Promise.all([
        productos.porIds(filas.map(function (f) { return f.producto_detalle_id; })),
        wms.detalleUbicaciones(filas.map(function (f) { return f.ubicacion_id; }))
      ]);
      var pm = r[0].data || {};
      var um = r[1].data || {};
      return {
        data: filas.map(function (f) {
          var p = pm[f.producto_detalle_id] || {};
          return {
            id: f.id,
            fecha: f.created_at,
            sobrante: _sobranteDe(f.observaciones),
            observaciones: f.observaciones,
            cantidad_sistema: f.cantidad_sistema,
            cantidad_fisica: f.cantidad_fisica,
            producto_detalle_id: f.producto_detalle_id,
            codigo_interno: p.codigo_interno || '',
            nombre: p.nombre || '',
            ubicacion_id: f.ubicacion_id,
            ubicacion: um[f.ubicacion_id] || null
          };
        }).filter(function (c) { return c.sobrante > 0; }),
        error: r[0].error || r[1].error
      };
    },

    despachoPendiente: function () {
      return _selectVista('wms_v_despacho_pendiente', {
        select: 'ref_pos_venta_id,numero_venta,fecha_venta,producto_detalle_id,codigo_interno,producto,ubicacion_origen_id,ruta,cantidad',
        orderBy: 'fecha_venta'
      });
    },

    // B1: bandeja de despacho agrupada por venta, con su estado en el POS (R-B1)
    bandejaDespacho: async function () {
      var res = await wms.despachoPendiente();
      if (res.error) return { data: [], error: res.error };

      var grupos = {};
      var orden = [];
      (res.data || []).forEach(function (f) {
        var clave = f.ref_pos_venta_id || '__sin_venta';
        if (!grupos[clave]) {
          grupos[clave] = {
            ventaId: f.ref_pos_venta_id || null,
            numeroVenta: f.numero_venta || null,
            fechaVenta: f.fecha_venta || null,
            estado: null,
            despachable: false,
            motivoBloqueo: null,
            unidades: 0,
            lineas: []
          };
          orden.push(clave);
        }
        var g = grupos[clave];
        g.unidades += Number(f.cantidad) || 0;
        g.lineas.push({
          producto_detalle_id: f.producto_detalle_id,
          codigo_interno: f.codigo_interno,
          producto: f.producto,
          ubicacion_origen_id: f.ubicacion_origen_id,
          ruta: f.ruta,
          cantidad: Number(f.cantidad) || 0
        });
      });
      var ventas = orden.map(function (k) { return grupos[k]; });
      if (!ventas.length) return { data: [], error: null };

      var ids = _unicos(ventas.map(function (v) { return v.ventaId; }));
      var estados = {};
      var errorEstados = null;
      if (ids.length) {
        var rv = await select('pos_ventas', {
          select: 'id,estado,deleted_at',
          filters: [{ col: 'id', op: 'in', val: '(' + ids.join(',') + ')' }],
          incluirEliminados: true
        });
        if (rv.error) errorEstados = rv.error;
        else rv.data.forEach(function (v) { estados[v.id] = v; });
      }

      ventas.forEach(function (v) {
        if (!v.ventaId) { v.motivoBloqueo = 'Reserva sin venta asociada en el POS'; return; }
        if (errorEstados) { v.motivoBloqueo = 'No se pudo verificar el estado de la venta en el POS'; return; }
        var e = estados[v.ventaId];
        if (!e) { v.motivoBloqueo = 'La venta no existe en el POS'; return; }
        v.estado = e.estado;
        if (e.deleted_at) v.motivoBloqueo = 'Venta eliminada en el POS: no despachar';
        else if (e.estado === 'ANULADA') v.motivoBloqueo = 'Venta anulada en el POS: no despachar';
        else v.despachable = true;
      });

      ventas.sort(function (a, b) {
        var fa = a.fechaVenta ? new Date(a.fechaVenta).getTime() : Infinity;
        var fb = b.fechaVenta ? new Date(b.fechaVenta).getTime() : Infinity;
        if (fa !== fb) return fa - fb;
        return String(a.numeroVenta || '').localeCompare(String(b.numeroVenta || ''), 'es', { numeric: true });
      });

      return { data: ventas, error: errorEstados };
    },

    /* ---------- Operaciones (RPC atomicas; solo escriben wms_*) ---------- */

    sincronizar: function () {
      return rpc('wms_sincronizar', {});
    },

    ubicar: function (productoDetalleId, codigoUbicacion, cantidad) {
      return rpc('wms_ubicar', {
        p_producto_detalle_id: productoDetalleId,
        p_codigo_ubicacion: String(codigoUbicacion || '').trim(),
        p_cantidad: Number(cantidad)
      });
    },

    trasladar: function (productoDetalleId, codigoOrigen, codigoDestino, cantidad) {
      return rpc('wms_trasladar', {
        p_producto_detalle_id: productoDetalleId,
        p_codigo_origen: String(codigoOrigen || '').trim(),
        p_codigo_destino: String(codigoDestino || '').trim(),
        p_cantidad: Number(cantidad)
      });
    },

    despachar: function (ventaId) {
      return rpc('wms_despachar', { p_ref_pos_venta_id: ventaId });
    },

    // C1 (CR2): codigo vacio o null = sale de SIN_UBICAR; codigo = sale de ese contenedor.
    resolverDecremento: function (posMovimientoId, codigoUbicacion) {
      var c = codigoUbicacion == null ? '' : String(codigoUbicacion).trim();
      return rpc('wms_resolver_decremento', {
        p_pos_movimiento_id: posMovimientoId,
        p_codigo_ubicacion: c || null
      });
    },

    // C2 (CR3): cantidadFisica = unidades UBICADAS contadas (sin las reservadas).
    // data = { o_conteo_id, o_diferencia, o_ubicado_desde_sin_ubicar, o_sobrante_pendiente }
    registrarConteo: async function (productoDetalleId, codigoUbicacion, cantidadFisica, sesionId) {
      var p = {
        p_producto_detalle_id: productoDetalleId,
        p_codigo_ubicacion: String(codigoUbicacion || '').trim(),
        p_cantidad_fisica: Number(cantidadFisica)
      };
      if (sesionId) p.p_sesion_inventario_id = sesionId;
      var res = await rpc('wms_registrar_conteo', p);
      if (res.error) return res;
      var fila = Array.isArray(res.data) ? res.data[0] : res.data;
      return { data: fila || null, error: fila ? null : 'El conteo no devolvio resultado' };
    },

    // C2: cierra el sobrante de un conteo. accion = 'UBICAR' | 'DESCARTAR'.
    // data = unidades ubicadas (0 si se descarta)
    cerrarSobrante: function (conteoId, accion) {
      return rpc('wms_cerrar_sobrante', { p_conteo_id: conteoId, p_accion: accion });
    }
  };

  /* ════════════════════════════════════════════════════════════
     API PUBLICA
     ════════════════════════════════════════════════════════════ */
  return {
    select: select,
    rpc: rpc,
    esErrorAuth: _esErrorAuth,
    mensajeError: _mensajeError,
    configuracionEmpresa: configuracionEmpresa,
    productos: productos,
    wms: wms
  };
})();

/* ════════════════════════════════════════════════════════════
    AUTO: Cargar logo de empresa en el header (copia del POS)
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

/* ════════════════════════════════════════════════════════════
    TOAST — copia del POS (el markup lo inserta layout.js)
    ════════════════════════════════════════════════════════════ */
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
