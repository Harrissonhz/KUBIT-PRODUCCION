window.StoreAPI = window.StoreAPI || {};

function _slugify(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extraerYoutubeId(url) {
  if (!url) return null;
  var patterns = [
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = url.match(patterns[i]);
    if (match) return match[1];
  }
  return null;
}

function _shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function _extraerDescripcionCorta(texto) {
  if (!texto) return '';
  var punto = texto.indexOf('.');
  if (punto > 0 && punto < 120) return texto.slice(0, punto + 1);
  return texto.length > 120 ? texto.slice(0, 120) + '...' : texto;
}

function mapearProducto(row) {
  // T1 (ST-27): las variantes eliminadas en el POS no se muestran
  var detalles = (row.detalles || []).filter(function(d) { return d && !d.deleted_at; });
  var multimedia = row.multimedia || [];
  var catNombre = row.categoria ? row.categoria.nombre : 'general';
  var catSlug = _slugify(catNombre);
  var primerDetalle = detalles[0] || {};
  var slug = row.slug || _slugify(row.nombre || 'producto');

  var imagenes = multimedia
    .filter(function(m) { return m.tipo === 'imagen' || !m.tipo; })
    .sort(function(a, b) { return (a.orden || 0) - (b.orden || 0); })
    .map(function(m) { return m.url; });

  var videos = multimedia
    .filter(function(m) { return m.tipo === 'video'; })
    .map(function(m) { return extraerYoutubeId(m.url); })
    .filter(function(id) { return id !== null; });

  var imagenPrincipal = imagenes[0] || 'https://placehold.co/400x400/slate-950/white?text=' + encodeURIComponent((row.nombre || 'Producto').slice(0, 15));

  var tags = row.tags || [];
  var variantes = [];

  if (detalles.length > 1) {
    variantes = detalles.map(function(d) {
      var nombreVariante = 'Unico';
      if (d.atributos) {
        var vals = Object.values(d.atributos).filter(function(v) { return v && typeof v === 'string'; });
        if (vals.length > 0) {
          nombreVariante = vals.join(' / ');
        } else if (d.codigo_interno) {
          nombreVariante = d.codigo_interno;
        }
      } else if (d.codigo_interno) {
        nombreVariante = d.codigo_interno;
      }
      return {
        id: d.id,
        nombre: nombreVariante,
        stock: d.stock_actual || 0,
        codigo_interno: d.codigo_interno || '',
        precio: d.precio_venta || 0,                 // T1 (ST-26): precio por variante
        precio_original: d.precio_original || null
      };
    });
  }

  // T1 (ST-28): precio minimo y si las variantes tienen precios distintos
  var precioMin = primerDetalle.precio_venta || 0;
  var preciosDistintos = false;
  if (variantes.length > 0) {
    var precios = variantes.map(function(v) { return v.precio; });
    precioMin = Math.min.apply(null, precios);
    preciosDistintos = precios.some(function(p) { return p !== precios[0]; });
  }

  return {
    id: row.id,
    nombre: row.nombre,
    detalleId: primerDetalle.id || null,
    codigo_interno: primerDetalle.codigo_interno || '',
    slug: slug,
    descripcion_corta: _extraerDescripcionCorta(row.descripcion),
    descripcion_larga: row.descripcion || '',
    precio: primerDetalle.precio_venta || 0,
    precio_original: primerDetalle.precio_original || null,
    precioMin: precioMin,
    preciosDistintos: preciosDistintos,
    categoria: catSlug,
    stock: primerDetalle.stock_actual || 0,
    tipo: row.tipo_producto || 'Fisico',
    tags: tags,
    imagen: imagenPrincipal,
    imagenes: imagenes,
    especificaciones: [],
    variantes: variantes,
    videos: videos,
    marca: row.marca || ''
  };
}

var _cache = { todos: null, timestamp: 0 };
var CACHE_TTL = 30000;

async function _fetchProductos() {
  if (_cache.todos && Date.now() - _cache.timestamp < CACHE_TTL) return _cache.todos;
  if (!window.__supabase) return [];
  try {
    var qs = 'select=' + encodeURIComponent('*,categoria:pos_categorias(nombre),detalles:pos_productos_detalle(*),multimedia:pos_productos_multimedia(*)') +
      '&deleted_at=' + encodeURIComponent('is.null') +
      '&activo=' + encodeURIComponent('eq.true');
    var data = await window.__supabase.get('pos_productos?' + qs);
    var productos = (data || []).map(mapearProducto);
    _cache.todos = productos;
    _cache.timestamp = Date.now();
    return productos;
  } catch (e) {
    console.error('Error obteniendo productos:', e);
    return [];
  }
}

window.StoreAPI.productos = {
  async obtenerTodos() {
    return _fetchProductos();
  },

  async obtenerDestacados(limite) {
    var productos = await _fetchProductos();
    var destacados = productos.filter(function(p) { return p.tags.indexOf('destacado') !== -1 && p.tipo !== 'Digital'; });
    return limite ? _shuffleArray(destacados).slice(0, limite) : _shuffleArray(destacados);
  },

  async obtenerPorTag(tag, limite) {
    var productos = await _fetchProductos();
    var filtrados = productos.filter(function(p) { return p.tags.indexOf(tag) !== -1; });
    return limite ? _shuffleArray(filtrados).slice(0, limite) : _shuffleArray(filtrados);
  },

  async obtenerPorCategoria(slug) {
    if (!slug || slug === 'todos') {
      var todos = await _fetchProductos();
      return _shuffleArray(todos.filter(function(p) { return p.tipo !== 'Digital'; }));
    }
    var productos = await _fetchProductos();
    var esCurso = slug === 'cursos-virtuales';
    return _shuffleArray(productos.filter(function(p) {
      return p.categoria === slug && (esCurso || p.tipo !== 'Digital');
    }));
  },

  async obtenerPorSlug(slug) {
    if (!slug || !window.__supabase) return null;
    try {
      var qs = 'select=' + encodeURIComponent('*,categoria:pos_categorias(nombre),detalles:pos_productos_detalle(*),multimedia:pos_productos_multimedia(*)') +
        '&slug=' + encodeURIComponent('eq.' + slug) +
        '&deleted_at=' + encodeURIComponent('is.null') +
        '&activo=' + encodeURIComponent('eq.true') +
        '&limit=1';
      var data = await window.__supabase.get('pos_productos?' + qs);
      if (data && data.length > 0) return mapearProducto(data[0]);
      return null;
    } catch (e) {
      console.error('Error obteniendo producto por slug:', e);
      return null;
    }
  },

  async obtenerRelacionados(producto, limite) {
    var productos = await _fetchProductos();
    var relacionados = productos.filter(function(p) {
      return p.categoria === producto.categoria && p.id !== producto.id;
    });
    return _shuffleArray(relacionados).slice(0, limite || 4);
  },

  async buscar(termino) {
    var t = termino.toLowerCase();
    var productos = await _fetchProductos();
    return _shuffleArray(productos.filter(function(p) {
      return p.nombre.toLowerCase().indexOf(t) !== -1 ||
        p.descripcion_corta.toLowerCase().indexOf(t) !== -1;
    }));
  },

  async obtenerPaginados(pagina, porPagina, filtros) {
    var productos = await _fetchProductos();
    if (filtros) {
      if (filtros.categoria && filtros.categoria !== 'todos') {
        productos = productos.filter(function(p) { return p.categoria === filtros.categoria; });
      }
      if (filtros.query) {
        var t = filtros.query.toLowerCase();
        productos = productos.filter(function(p) {
          return p.nombre.toLowerCase().indexOf(t) !== -1 ||
            p.descripcion_corta.toLowerCase().indexOf(t) !== -1;
        });
      }
    }
    var esCategoriaCurso = filtros && filtros.categoria === 'cursos-virtuales';
    productos = productos.filter(function(p) { return esCategoriaCurso || p.tipo !== 'Digital'; });
    var total = productos.length;
    productos = _shuffleArray(productos);
    var totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    var inicio = (pagina - 1) * porPagina;
    return {
      productos: productos.slice(inicio, inicio + porPagina),
      total: total,
      pagina: pagina,
      porPagina: porPagina,
      totalPaginas: totalPaginas
    };
  }
};
