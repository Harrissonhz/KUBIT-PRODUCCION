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

// T3a (ST-13): orden aleatorio pero FIJO durante la visita. La semilla vive en
// sessionStorage: todas las paginas de la visita usan el mismo orden (no se repiten
// ni se ocultan productos); en una visita nueva el orden cambia.
function _semillaSesion() {
  var CLAVE = 'kubit_orden_semilla';
  try {
    var s = parseInt(sessionStorage.getItem(CLAVE), 10);
    if (!(s > 0)) {
      s = Math.floor(Math.random() * 2147483646) + 1;
      sessionStorage.setItem(CLAVE, String(s));
    }
    return s;
  } catch (e) {
    if (!window.__kubitSemilla) window.__kubitSemilla = Math.floor(Math.random() * 2147483646) + 1;
    return window.__kubitSemilla;
  }
}

function _barajarConSemilla(arr, semilla) {
  var a = arr.slice();
  var t = semilla >>> 0;
  function aleatorio() {   // mulberry32
    t = (t + 0x6D2B79F5) >>> 0;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(aleatorio() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function _ordenSesion(productos) {
  // Se parte siempre del mismo orden (por id) antes de barajar con la semilla
  var base = productos.slice().sort(function(a, b) {
    return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
  });
  return _barajarConSemilla(base, _semillaSesion());
}

// T5a (ST-16): busqueda sin tildes ni mayusculas, por palabras (todas deben aparecer, en cualquier
// orden) en nombre, SKU de todas las variantes, marca, etiquetas (menos "destacado") y descripcion
// corta. Con busqueda, los resultados salen por relevancia (SKU exacto o que empieza igual, luego
// nombre, luego el resto) y, a igual relevancia, conservan el orden de la visita: la paginacion no cambia.
function _normalizarBusqueda(texto) {
  return String(texto == null ? '' : texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function _compactoBusqueda(texto) {
  return texto.replace(/[^a-z0-9]/g, '');
}
function _palabrasBusqueda(termino) {
  var t = _normalizarBusqueda(termino);
  return t ? t.split(' ') : [];
}
// Los datos de busqueda de cada producto se calculan una sola vez (filtro y orden los reutilizan)
var _datosBusquedaGuardados = typeof WeakMap === 'function' ? new WeakMap() : null;
function _datosBusqueda(p) {
  var guardados = _datosBusquedaGuardados && _datosBusquedaGuardados.get(p);
  if (guardados) return guardados;
  var skus = [p.codigo_interno]
    .concat((p.variantes || []).map(function(v) { return v.codigo_interno; }))
    .filter(function(s) { return !!s; })
    .map(function(s) { return _normalizarBusqueda(s); });
  var compactos = skus.map(function(s) { return _compactoBusqueda(s); });
  var nombre = _normalizarBusqueda(p.nombre);
  var etiquetas = (p.tags || [])
    .filter(function(e) { return e !== 'destacado'; })
    .map(function(e) { return _normalizarBusqueda(e); });
  var datos = {
    nombre: nombre,
    skus: skus,
    compactos: compactos,
    texto: [nombre, skus.join(' '), compactos.join(' '), _normalizarBusqueda(p.marca),
      etiquetas.join(' '), _normalizarBusqueda(p.descripcion_corta)].join(' ')
  };
  if (_datosBusquedaGuardados) _datosBusquedaGuardados.set(p, datos);
  return datos;
}
// Una palabra coincide si esta en el texto o, escrita con guiones/espacios/signos ("AL-119", "seg-011"),
// coincide con el SKU sin separadores ("AL119"). Con menos de 3 letras o numeros no se relaja la regla.
function _coincidePalabra(texto, palabra) {
  if (texto.indexOf(palabra) !== -1) return true;
  var compacta = _compactoBusqueda(palabra);
  return compacta.length >= 3 && compacta !== palabra && texto.indexOf(compacta) !== -1;
}
function _filtrarPorBusqueda(productos, termino) {
  var palabras = _palabrasBusqueda(termino);
  if (!palabras.length) return productos;
  return productos.filter(function(p) {
    var texto = _datosBusqueda(p).texto;
    return palabras.every(function(w) { return _coincidePalabra(texto, w); });
  });
}
// Menor numero = mas relevante: 0 SKU exacto, 1 SKU que empieza igual, 2 nombre que empieza igual,
// 3 nombre que contiene la frase, 4 SKU que contiene la frase, 5 el resto (palabras sueltas)
function _puntajeBusqueda(p, frase, fraseCompacta) {
  var d = _datosBusqueda(p);
  var i;
  for (i = 0; i < d.skus.length; i++) {
    if (d.skus[i] === frase || (fraseCompacta && d.compactos[i] === fraseCompacta)) return 0;
  }
  for (i = 0; i < d.skus.length; i++) {
    if (d.skus[i].indexOf(frase) === 0 || (fraseCompacta && d.compactos[i].indexOf(fraseCompacta) === 0)) return 1;
  }
  if (d.nombre.indexOf(frase) === 0) return 2;
  if (d.nombre.indexOf(frase) !== -1) return 3;
  for (i = 0; i < d.skus.length; i++) {
    if (d.skus[i].indexOf(frase) !== -1) return 4;
  }
  return 5;
}
function _ordenarPorRelevancia(productos, termino) {
  var palabras = _palabrasBusqueda(termino);
  if (!palabras.length) return productos;
  var frase = palabras.join(' ');
  var compacta = _compactoBusqueda(frase);
  return productos
    .map(function(p, i) { return { p: p, i: i, s: _puntajeBusqueda(p, frase, compacta) }; })
    .sort(function(a, b) { return (a.s - b.s) || (a.i - b.i); })
    .map(function(x) { return x.p; });
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
    // T5a (ST-16): sin tildes, por palabras, con SKU, marca y etiquetas; por relevancia
    var productos = await _fetchProductos();
    return _ordenarPorRelevancia(_ordenSesion(_filtrarPorBusqueda(productos, termino)), termino);
  },

  async obtenerPaginados(pagina, porPagina, filtros) {
    var productos = await _fetchProductos();
    if (filtros) {
      if (filtros.categoria && filtros.categoria !== 'todos') {
        productos = productos.filter(function(p) { return p.categoria === filtros.categoria; });
      }
      if (filtros.query) {
        productos = _filtrarPorBusqueda(productos, filtros.query);   // T5a (ST-16)
      }
    }
    var esCategoriaCurso = filtros && filtros.categoria === 'cursos-virtuales';
    productos = productos.filter(function(p) { return esCategoriaCurso || p.tipo !== 'Digital'; });
    var total = productos.length;
    productos = _ordenSesion(productos);   // T3a (ST-13)
    productos = _ordenarPorRelevancia(productos, filtros && filtros.query);   // T5a (ST-16)
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
