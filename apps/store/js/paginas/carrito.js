document.addEventListener('DOMContentLoaded', function() {
  depurarCarritoGuardado();
  renderCarrito();
});

// T1 (ST-02): cada linea del carrito debe tener detalleId (variante).
// Las lineas antiguas sin detalleId se descartan; las repetidas se unen.
function normalizarCarrito(items) {
  var validos = [];
  var descartados = 0;
  var porDetalle = {};
  (Array.isArray(items) ? items : []).forEach(function(it) {
    if (!it || !it.detalleId) { descartados++; return; }
    var cant = parseInt(it.cantidad, 10);
    if (!(cant > 0)) cant = 1;
    if (porDetalle[it.detalleId]) {
      porDetalle[it.detalleId].cantidad += cant;
      return;
    }
    var copia = Object.assign({}, it, { cantidad: cant });
    porDetalle[it.detalleId] = copia;
    validos.push(copia);
  });
  return { items: validos, descartados: descartados };
}

function depurarCarritoGuardado() {
  var r = normalizarCarrito(obtenerCarrito());
  if (r.descartados > 0 || JSON.stringify(r.items) !== localStorage.getItem('kubit_carrito')) {
    guardarCarrito(r.items);
  }
  if (r.descartados > 0 && typeof Modal === 'function') {
    Modal({
      titulo: 'Actualizamos tu carrito',
      contenido: '<p class="text-sm text-slate-600">Retiramos ' + r.descartados +
        (r.descartados === 1 ? ' producto agregado' : ' productos agregados') +
        ' con una versión anterior de la tienda. Agrégalos de nuevo eligiendo la opción que deseas.</p>'
    });
  }
}

function obtenerCarrito() {
  try {
    return JSON.parse(localStorage.getItem('kubit_carrito') || '[]');
  } catch (e) {
    return [];
  }
}

function guardarCarrito(items) {
  localStorage.setItem('kubit_carrito', JSON.stringify(items));
  if (typeof actualizarBadgeCarrito === 'function') {
    actualizarBadgeCarrito();
  }
}

function renderCarrito() {
  var items = obtenerCarrito();
  var $contenedor = document.getElementById('carrito-items');
  var $resumen = document.getElementById('resumen-pedido');

  if (!items.length) {
    $contenedor.innerHTML = '\
      <div class="text-center py-16">\
        <svg class="w-16 h-16 mx-auto text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">\
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"/>\
        </svg>\
        <p class="text-slate-500 text-lg mb-2">Tu carrito está vacío</p>\
        <p class="text-slate-400 text-sm mb-6">Agrega productos desde nuestro catálogo</p>\
        <a href="index.html" class="inline-block px-6 py-3 bg-slate-950 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">Ir a la tienda</a>\
      </div>\
    ';
    $resumen.innerHTML = '\
      <h2 class="text-sm font-semibold text-slate-900 mb-4">Resumen del pedido</h2>\
      <p class="text-sm text-slate-400 text-center py-8">Agrega productos para ver el resumen</p>\
    ';
    return;
  }

  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += renderItemRow(items[i]);
  }
  $contenedor.innerHTML = html;
  actualizarResumen(items);
}

function renderItemRow(item) {
  var subtotal = (item.precio || 0) * (item.cantidad || 1);
  return '\
    <div class="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-4" data-id="' + item.detalleId + '">\
        <div class="sm:col-span-6 flex items-center gap-3">\
        <div class="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">\
          <img src="' + (item.imagen || '') + '" alt="' + (item.nombre || '') + '" class="w-full h-full object-cover" loading="lazy">\
        </div>\
        <div class="min-w-0">\
          <p class="text-sm font-medium text-slate-900 truncate">' + (item.nombre || 'Producto') + '</p>\
          ' + (item.variante ? '<p class="text-xs text-slate-500 truncate">' + item.variante + '</p>' : '') + '\
          ' + (item.codigo ? '<p class="text-[10px] font-mono text-slate-400 truncate">SKU: ' + item.codigo + '</p>' : '') + '\
          <p class="text-xs text-slate-400">' + formatearMoneda(item.precio || 0) + ' c/u</p>\
        </div>\
      </div>\
      <div class="sm:col-span-6 flex items-center justify-between sm:justify-end gap-3">\
        <div class="flex items-center gap-2">\
          <button class="btn-restar w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors text-sm' + ((item.cantidad || 1) <= 1 ? ' opacity-40 cursor-default' : '') + '">−</button>\
          <span class="cantidad text-sm font-medium text-slate-900 w-6 text-center">' + (item.cantidad || 1) + '</span>\
          <button class="btn-sumar w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors text-sm">+</button>\
        </div>\
        <p class="text-sm font-semibold text-slate-900 item-subtotal">' + formatearMoneda(subtotal) + '</p>\
        <button class="btn-eliminar text-slate-400 hover:text-red-500 transition-colors p-1" aria-label="Eliminar">\
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">\
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>\
          </svg>\
        </button>\
      </div>\
    </div>\
  ';
}

function actualizarResumen(items) {
  var totalItems = 0;
  var totalSubtotal = 0;
  for (var i = 0; i < items.length; i++) {
    var cant = items[i].cantidad || 1;
    totalItems += cant;
    totalSubtotal += (items[i].precio || 0) * cant;
  }

  document.getElementById('resumen-items').textContent = 'Subtotal (' + totalItems + ' ' + (totalItems === 1 ? 'item' : 'items') + ')';
  document.getElementById('resumen-subtotal').textContent = formatearMoneda(totalSubtotal);
  document.getElementById('resumen-total').textContent = formatearMoneda(totalSubtotal);
}

document.getElementById('carrito-items').addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;

  var row = btn.closest('[data-id]');
  if (!row) return;

  var detalleId = row.getAttribute('data-id');   // T1 (ST-02): fila = variante
  var items = obtenerCarrito();
  var idx = -1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].detalleId === detalleId) { idx = i; break; }
  }
  if (idx === -1) return;

  if (btn.classList.contains('btn-sumar')) {
    items[idx].cantidad = (items[idx].cantidad || 1) + 1;
    guardarCarrito(items);
    renderCarrito();
  }

  if (btn.classList.contains('btn-restar')) {
    var cant = items[idx].cantidad || 1;
    if (cant > 1) {
      items[idx].cantidad = cant - 1;
      guardarCarrito(items);
      renderCarrito();
    }
  }

  if (btn.classList.contains('btn-eliminar')) {
    items.splice(idx, 1);
    guardarCarrito(items);
    renderCarrito();
  }
});
