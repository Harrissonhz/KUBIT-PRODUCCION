function formatearMoneda(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(valor ?? 0);
}

function formatearFecha(isoString) {
  return new Date(isoString).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function obtenerParametroURL(nombre) {
  return new URLSearchParams(window.location.search).get(nombre);
}

function renderPrecio(producto) {
  const original = producto.precio_original;
  const actual = producto.precio;

  if (original && original > actual) {
    const descuento = Math.round((1 - actual / original) * 100);
    return `
      <span class="text-slate-400 line-through text-xs">${formatearMoneda(original)}</span>
      <span class="text-red-600 font-semibold ml-1">${formatearMoneda(actual)}</span>
      <span class="text-red-500 text-[10px] font-bold ml-1">-${descuento}%</span>
    `;
  }

  return `<span class="text-slate-400">${formatearMoneda(actual)}</span>`;
}

// T2: escape de texto para insertarlo en HTML (uso en codigo nuevo)
function escaparHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// T2: el precio del carrito se vuelve a leer del POS al abrir el carrito y el
// checkout (la tienda muestra siempre el precio vigente de pos_productos_detalle).
// Solo actualiza precio y precio_original; NO toca cantidades ni stock.
// Si la consulta falla, el carrito queda como estaba (no se pierde nada).
// Las lineas cuya variante ya no existe (o sin precio valido) se retiran.
async function refrescarPreciosCarrito() {
  var resultado = { huboCambios: false, cambios: [], retirados: [], error: false };
  var items;
  try {
    items = JSON.parse(localStorage.getItem('kubit_carrito') || '[]');
  } catch (e) {
    return resultado;
  }
  if (!Array.isArray(items) || !items.length) return resultado;
  if (!window.__supabase) { resultado.error = true; return resultado; }
  var antes = JSON.stringify(items);   // los items se modifican mas abajo: se compara contra este texto

  var ids = [];
  var vistos = {};
  items.forEach(function(it) {
    if (it && it.detalleId && !vistos[it.detalleId]) {
      vistos[it.detalleId] = true;
      ids.push(it.detalleId);
    }
  });
  if (!ids.length) return resultado;

  var filas;
  try {
    filas = await __supabase.get('pos_productos_detalle?select=id,precio_venta,precio_original' +
      '&deleted_at=is.null&id=in.(' + ids.join(',') + ')');
  } catch (e) {
    console.error('No se pudieron actualizar los precios del carrito:', e);
    resultado.error = true;
    return resultado;
  }
  if (!Array.isArray(filas)) { resultado.error = true; return resultado; }

  var porId = {};
  filas.forEach(function(f) { porId[f.id] = f; });

  var nuevos = [];
  items.forEach(function(it) {
    if (!it || !it.detalleId) { nuevos.push(it); return; }
    var f = porId[it.detalleId];
    var precio = f ? Number(f.precio_venta) : 0;
    if (!f || !(precio > 0)) {
      resultado.retirados.push({ nombre: it.nombre || 'Producto', variante: it.variante || '' });
      return;
    }
    var anterior = Number(it.precio) || 0;
    if (precio !== anterior) {
      resultado.cambios.push({ nombre: it.nombre || 'Producto', variante: it.variante || '', anterior: anterior, actual: precio });
    }
    it.precio = precio;
    it.precio_original = f.precio_original != null ? Number(f.precio_original) : null;
    nuevos.push(it);
  });

  resultado.huboCambios = resultado.cambios.length > 0 || resultado.retirados.length > 0;
  if (JSON.stringify(nuevos) !== antes) {
    localStorage.setItem('kubit_carrito', JSON.stringify(nuevos));
    if (typeof actualizarBadgeCarrito === 'function') actualizarBadgeCarrito();
  }
  return resultado;
}

// T2: aviso al cliente cuando cambiaron precios o se retiraron productos
function avisoCambiosCarrito(r) {
  if (!r || !r.huboCambios || typeof Modal !== 'function') return;
  var html = '<p class="text-sm text-slate-600 mb-3">Actualizamos tu carrito con los precios vigentes:</p>' +
    '<ul class="text-sm text-slate-700 space-y-2">';
  r.cambios.forEach(function(c) {
    html += '<li>' + escaparHtml(c.nombre) + (c.variante ? ' (' + escaparHtml(c.variante) + ')' : '') +
      ': <span class="line-through text-slate-400">' + formatearMoneda(c.anterior) + '</span> ' +
      '<strong>' + formatearMoneda(c.actual) + '</strong></li>';
  });
  r.retirados.forEach(function(c) {
    html += '<li>' + escaparHtml(c.nombre) + (c.variante ? ' (' + escaparHtml(c.variante) + ')' : '') +
      ': <strong>ya no está disponible y lo retiramos del carrito</strong></li>';
  });
  html += '</ul>';
  Modal({ titulo: 'Actualizamos tu carrito', contenido: html });
}

// T3b: configuracion publica de la tienda (envio gratis, pedido minimo, WhatsApp).
// Se pide una vez por carga de pagina; si falla, se usan valores por defecto.
var CONFIG_TIENDA_DEFECTO = { envio_gratis_desde: 80000, pedido_minimo: 15000, whatsapp: '573054476133' };
var _configTiendaPromesa = null;

function obtenerConfigTienda() {
  if (_configTiendaPromesa) return _configTiendaPromesa;
  _configTiendaPromesa = (async function() {
    var cfg = Object.assign({}, CONFIG_TIENDA_DEFECTO);
    try {
      if (!window.__supabase || !__supabase.rpc) return cfg;
      var r = await __supabase.rpc('st_config_tienda', {});
      if (r && typeof r === 'object') {
        if (r.envio_gratis_desde === null) cfg.envio_gratis_desde = null;
        else if (Number(r.envio_gratis_desde) > 0) cfg.envio_gratis_desde = Number(r.envio_gratis_desde);
        if (Number(r.pedido_minimo) >= 0 && r.pedido_minimo !== undefined && r.pedido_minimo !== null) cfg.pedido_minimo = Number(r.pedido_minimo);
        if (typeof r.whatsapp === 'string' && /^\d{10,15}$/.test(r.whatsapp)) cfg.whatsapp = r.whatsapp;
      }
    } catch (e) {
      console.error('No se pudo leer la configuracion de la tienda:', e);
    }
    return cfg;
  })();
  return _configTiendaPromesa;
}

// T3b: barra "te faltan $X para envio gratis" (subtotal de productos, sin envio)
function htmlBarraEnvioGratis(subtotal, umbral) {
  if (!(umbral > 0)) return '';
  if (subtotal >= umbral) {
    return '<p class="text-xs font-medium text-green-700">¡Tu envío es gratis!</p>';
  }
  var pct = Math.max(4, Math.min(100, Math.round(subtotal / umbral * 100)));
  return '<p class="text-xs text-slate-600 mb-1.5">Te faltan <strong>' + formatearMoneda(umbral - subtotal) +
      '</strong> para envío gratis</p>' +
    '<div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">' +
      '<div class="h-full bg-green-500 rounded-full" style="width:' + pct + '%"></div>' +
    '</div>';
}

// T3b: texto de dias estimados de entrega
function textoDiasEntrega(min, max) {
  min = Number(min); max = Number(max);
  if (!(max > 0)) return '';
  if (!(min > 0) || min === max) return 'Llega en ' + max + (max === 1 ? ' día hábil' : ' días hábiles');
  return 'Llega en ' + min + '–' + max + ' días hábiles';
}
