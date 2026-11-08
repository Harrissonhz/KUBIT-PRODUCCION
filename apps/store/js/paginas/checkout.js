// T3b (ST-09): el envio se cotiza por zona (st_cotizar_envio) al elegir departamento y ciudad.
// Es informativo: el valor definitivo (y el envio gratis) lo fija la base de datos en st_crear_pedido.
var ENVIO_COTIZADO = null;      // { codigo, nombre, valor, dias_min, dias_max } o null
var CONFIG_CHECKOUT = null;     // { envio_gratis_desde, pedido_minimo, whatsapp } o null
var _consultaEnvio = 0;

// WhatsApp del negocio (mismo numero del boton flotante de checkout.html)
var WHATSAPP_NEGOCIO = '573054476133';

// T3b (ST-11): boton "Copiar" de la llave Bre-B en la confirmacion
document.addEventListener('click', function(e) {
  var btn = e.target && e.target.closest ? e.target.closest('[data-copiar]') : null;
  if (!btn) return;
  var texto = btn.getAttribute('data-copiar') || '';
  var listo = function() {
    btn.textContent = '¡Copiada!';
    setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(listo, function() { window.prompt('Copia la llave:', texto); });
  } else {
    window.prompt('Copia la llave:', texto);
  }
});

document.addEventListener('DOMContentLoaded', async function() {
  var items = obtenerCarritoCheckout();
  if (!items.length) {
    mostrarCarritoVacio();
    return;
  }
  renderizarResumen(items);
  poblarDepartamentos();

  // T3b: envio gratis y pedido minimo desde st_configuracion
  if (typeof obtenerConfigTienda === 'function') {
    CONFIG_CHECKOUT = await obtenerConfigTienda();
    if (CONFIG_CHECKOUT && CONFIG_CHECKOUT.whatsapp) WHATSAPP_NEGOCIO = CONFIG_CHECKOUT.whatsapp;
    renderizarResumen(obtenerCarritoCheckout());
  }
  var $ciudad = document.getElementById('checkout-ciudad');
  if ($ciudad) {
    $ciudad.addEventListener('change', cotizarEnvio);
    $ciudad.addEventListener('blur', cotizarEnvio);
  }

  document.getElementById('btn-confirmar-pedido').addEventListener('click', function(e) {
    e.preventDefault();
    // Se lee el carrito vigente al confirmar (puede haberse actualizado el precio)
    confirmarPedido(obtenerCarritoCheckout());
  });

  // T2: precios vigentes del POS al abrir el checkout
  if (typeof refrescarPreciosCarrito === 'function') {
    var r = await refrescarPreciosCarrito();
    if (r.huboCambios) {
      items = obtenerCarritoCheckout();
      if (!items.length) mostrarCarritoVacio();
      else renderizarResumen(items);
      avisoCambiosCarrito(r);
    }
  }
});

function poblarDepartamentos() {
  var $select = document.getElementById('checkout-departamento');
  if (!$select || !window.COLOMBIA) return;
  var deptos = Object.keys(COLOMBIA).sort();
  for (var i = 0; i < deptos.length; i++) {
    var $opt = document.createElement('option');
    $opt.value = deptos[i];
    $opt.textContent = deptos[i];
    $select.appendChild($opt);
  }
  $select.addEventListener('change', function() {
    filtrarCiudades(this.value);
    ENVIO_COTIZADO = null;          // T3b: cambia el departamento -> hay que volver a cotizar
    renderizarResumen(obtenerCarritoCheckout());
  });
}

function filtrarCiudades(depto) {
  var $input = document.getElementById('checkout-ciudad');
  var $datalist = document.getElementById('lista-ciudades');
  if (!$input || !$datalist) return;
  if (!depto || !window.COLOMBIA || !COLOMBIA[depto]) {
    $datalist.innerHTML = '';
    $input.value = '';
    $input.placeholder = 'Primero selecciona un departamento';
    return;
  }
  $datalist.innerHTML = '';
  var ciudades = COLOMBIA[depto];
  for (var i = 0; i < ciudades.length; i++) {
    var $opt = document.createElement('option');
    $opt.value = ciudades[i];
    $datalist.appendChild($opt);
  }
  $input.value = '';
  $input.placeholder = 'Escribe tu ciudad...';
}

// T1 (ST-01): lineas del carrito sin variante (detalleId)
function lineasSinVariante(items) {
  return (items || []).filter(function(it) { return !it || !it.detalleId; });
}

function obtenerCarritoCheckout() {
  try {
    var items = JSON.parse(localStorage.getItem('kubit_carrito') || '[]');
    return Array.isArray(items) ? items : [];
  } catch (e) {
    return [];
  }
}

function mostrarCarritoVacio() {
  document.getElementById('checkout-items').innerHTML =
    '<div class="text-center py-8">' +
      '<p class="text-slate-500 text-sm mb-2">No hay productos en tu carrito</p>' +
      '<a href="index.html" class="inline-block mt-2 text-sm text-slate-950 underline">Ir a la tienda</a>' +
    '</div>';
  document.getElementById('checkout-cantidad').textContent = '0';
  document.getElementById('checkout-subtotal').textContent = '$0';
  document.getElementById('checkout-total').textContent = '$0';
  document.getElementById('btn-confirmar-pedido').disabled = true;
}

function renderizarResumen(items) {
  var html = '';
  var totalItems = 0;
  var totalSubtotal = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var cant = item.cantidad || 1;
    var precio = item.precio || 0;
    var subtotal = cant * precio;
    totalItems += cant;
    totalSubtotal += subtotal;
    html += '' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">' +
          '<img src="' + (item.imagen || '') + '" alt="' + (item.nombre || '') + '" class="w-full h-full object-cover">' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm text-slate-900 truncate">' + (item.nombre || 'Producto') + '</p>' +
          (item.variante ? '<p class="text-xs text-slate-500 truncate">' + item.variante + '</p>' : '') +
          (item.codigo ? '<p class="text-[10px] font-mono text-slate-400 truncate">SKU: ' + item.codigo + '</p>' : '') +
          '<p class="text-xs text-slate-400">' + cant + ' × ' + formatearMoneda(precio) + '</p>' +
        '</div>' +
        '<p class="text-sm font-medium text-slate-900">' + formatearMoneda(subtotal) + '</p>' +
      '</div>';
  }
  document.getElementById('checkout-items').innerHTML = html;
  document.getElementById('checkout-cantidad').textContent = totalItems;
  document.getElementById('checkout-subtotal').textContent = formatearMoneda(totalSubtotal);
  // T3b (ST-09): envio por zona, gratis desde el umbral (subtotal sin envio)
  var umbral = CONFIG_CHECKOUT ? CONFIG_CHECKOUT.envio_gratis_desde : null;
  var gratis = umbral > 0 && totalSubtotal >= umbral;
  var envio = ENVIO_COTIZADO ? (gratis ? 0 : Number(ENVIO_COTIZADO.valor) || 0) : null;
  var $envio = document.getElementById('checkout-envio');
  if ($envio) {
    $envio.textContent = envio === null ? (gratis ? 'Gratis' : 'Elige tu ciudad') : (envio === 0 ? 'Gratis' : formatearMoneda(envio));
  }
  var $dias = document.getElementById('checkout-envio-dias');
  if ($dias) {
    $dias.textContent = ENVIO_COTIZADO && typeof textoDiasEntrega === 'function'
      ? textoDiasEntrega(ENVIO_COTIZADO.dias_min, ENVIO_COTIZADO.dias_max) : '';
  }
  var $barra = document.getElementById('checkout-envio-gratis');
  if ($barra && typeof htmlBarraEnvioGratis === 'function') {
    $barra.innerHTML = htmlBarraEnvioGratis(totalSubtotal, umbral);
  }
  var $min = document.getElementById('checkout-minimo');
  if ($min) {
    var falta = faltaParaMinimo(totalSubtotal) > 0;
    $min.textContent = falta ? textoPedidoMinimo() : '';
    if (falta) $min.classList.remove('hidden'); else $min.classList.add('hidden');
  }
  document.getElementById('checkout-total').textContent =
    formatearMoneda(totalSubtotal + (envio || 0)) + (envio === null && !gratis ? ' + envío' : '');
}

function subtotalCarrito(items) {
  return (items || []).reduce(function(s, it) { return s + (it.precio || 0) * (it.cantidad || 1); }, 0);
}

// T3b: pedido minimo sobre el subtotal de productos (sin envio)
function faltaParaMinimo(subtotal) {
  var minimo = CONFIG_CHECKOUT ? Number(CONFIG_CHECKOUT.pedido_minimo) || 0 : 0;
  return minimo > 0 && subtotal < minimo ? minimo - subtotal : 0;
}

function textoPedidoMinimo() {
  var minimo = CONFIG_CHECKOUT ? Number(CONFIG_CHECKOUT.pedido_minimo) || 0 : 0;
  return 'El pedido mínimo es ' + formatearMoneda(minimo) + ' (sin contar el envío).';
}

// T3b (ST-09): cotiza el envio de la zona del destino (solo lectura)
async function cotizarEnvio() {
  var depto = document.getElementById('checkout-departamento').value;
  var ciudad = (document.getElementById('checkout-ciudad').value || '').trim();
  var n = ++_consultaEnvio;
  if (!depto || ciudad.length < 2 || !window.__supabase) {
    ENVIO_COTIZADO = null;
    renderizarResumen(obtenerCarritoCheckout());
    return;
  }
  try {
    var r = await __supabase.rpc('st_cotizar_envio', { p_departamento: depto, p_ciudad: ciudad });
    if (n !== _consultaEnvio) return;   // llego una respuesta vieja
    ENVIO_COTIZADO = (r && r.valor !== undefined) ? r : null;
  } catch (e) {
    console.error('No se pudo cotizar el envio:', e);
    if (n !== _consultaEnvio) return;
    ENVIO_COTIZADO = null;
  }
  renderizarResumen(obtenerCarritoCheckout());
}

function leerFormulario() {
  return {
    nombre: document.getElementById('checkout-nombre').value.trim(),
    email: document.getElementById('checkout-email').value.trim(),
    telefono: document.getElementById('checkout-telefono').value.trim(),
    direccion: document.getElementById('checkout-direccion').value.trim(),
    ciudad: document.getElementById('checkout-ciudad').value,
    departamento: document.getElementById('checkout-departamento').value
  };
}

function obtenerMetodoPago() {
  var seleccionado = document.querySelector('input[name="pago"]:checked');
  return seleccionado ? seleccionado.value : null;
}

// T2: celular colombiano de 10 digitos que empieza en 3 (acepta +57 / 57 al inicio).
// Devuelve los 10 digitos o null si no es valido.
function normalizarCelular(valor) {
  var d = String(valor == null ? '' : valor).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : null;
}

function correoValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

// T2: celular obligatorio y valido; correo opcional (si se escribe, debe ser valido)
function validarFormulario(data) {
  var errores = [];
  if (!data.nombre || data.nombre.length < 3) errores.push('Nombre completo');
  if (!data.telefono) errores.push('Celular (WhatsApp)');
  else if (!normalizarCelular(data.telefono)) errores.push('Celular válido de 10 dígitos, por ejemplo 300 123 4567');
  if (data.email && !correoValido(data.email)) errores.push('Correo con formato válido (o déjalo vacío)');
  if (!data.direccion || data.direccion.length < 5) errores.push('Dirección');
  if (!data.ciudad) errores.push('Ciudad');
  if (!data.departamento) errores.push('Departamento');
  return errores;
}

function mostrarEstadoCargando(activo) {
  var btn = document.getElementById('btn-confirmar-pedido');
  var texto = document.getElementById('btn-confirmar-texto');
  var spinner = document.getElementById('btn-confirmar-spinner');
  if (activo) {
    btn.disabled = true;
    texto.textContent = 'Procesando...';
    spinner.classList.remove('hidden');
  } else {
    btn.disabled = false;
    texto.textContent = 'Confirmar pedido';
    spinner.classList.add('hidden');
  }
}

// T2: los errores de la funcion vienen como "[ST_XXX] mensaje" dentro del JSON de PostgREST.
// Al cliente solo se le muestra el mensaje en espanol, nunca el detalle tecnico.
function mensajeErrorPedido(err) {
  var msg = (err && err.message) ? String(err.message) : '';
  var m = msg.match(/\{[\s\S]*\}\s*$/);
  if (m) {
    try {
      var j = JSON.parse(m[0]);
      if (j && j.message) msg = String(j.message);
    } catch (e) { /* se usa el texto tal cual */ }
  }
  var p = msg.match(/^\[(ST_[A-Z_]+)\]\s*([\s\S]*)$/);
  if (p) return { codigo: p[1], texto: p[2] };
  return { codigo: null, texto: 'No pudimos registrar tu pedido en este momento. Inténtalo de nuevo o escríbenos por WhatsApp.' };
}

async function confirmarPedido(items) {
  var terminos = document.getElementById('checkout-terminos');
  if (terminos && !terminos.checked) {
    Modal({
      titulo: 'Acepta los términos',
      contenido: '<p class="text-sm text-slate-600">Debes aceptar los términos y condiciones para continuar.</p>'
    });
    return;
  }

  var data = leerFormulario();
  var errores = validarFormulario(data);
  if (errores.length > 0) {
    Modal({
      titulo: 'Campos obligatorios',
      contenido: '' +
        '<p class="text-sm text-slate-600 mb-3">Completa los siguientes campos:</p>' +
        '<ul class="text-sm text-red-500 space-y-1">' +
          errores.map(function(e) { return '<li>• ' + e + '</li>'; }).join('') +
        '</ul>'
    });
    return;
  }

  var metodoPago = obtenerMetodoPago();
  if (!metodoPago) {
    Modal({
      titulo: 'Método de pago',
      contenido: '<p class="text-sm text-slate-600">Selecciona un método de pago para continuar.</p>'
    });
    return;
  }

  // T3b: pedido minimo (la base de datos tambien lo valida)
  if (faltaParaMinimo(subtotalCarrito(items)) > 0) {
    Modal({
      titulo: 'Pedido mínimo',
      contenido: '<p class="text-sm text-slate-600 mb-4">' + textoPedidoMinimo() + ' Agrega más productos a tu carrito.</p>' +
        '<a href="index.html" class="block w-full text-center px-4 py-2 text-sm font-medium bg-slate-950 text-white rounded-lg hover:bg-slate-800 transition-colors">Seguir comprando</a>'
    });
    return;
  }

  // T1 (ST-01): sin variante no se crea nada
  if (lineasSinVariante(items).length > 0) {
    Modal({
      titulo: 'Actualiza tu carrito',
      contenido: '<p class="text-sm text-slate-600 mb-4">Hay productos en tu carrito sin la opción elegida. Revisa tu carrito antes de confirmar el pedido.</p>' +
        '<a href="carrito.html" class="block w-full text-center px-4 py-2 text-sm font-medium bg-slate-950 text-white rounded-lg hover:bg-slate-800 transition-colors">Ir al carrito</a>'
    });
    return;
  }

  mostrarEstadoCargando(true);
  try {
    if (!window.__supabase) throw new Error('Cliente de base de datos no disponible');

    var celular = normalizarCelular(data.telefono);

    // T2 (ST-04/05/07/08): una sola llamada. La base de datos valida, toma el precio
    // del POS, asigna el cliente "Consumidor final", genera el numero y crea todo
    // en una transaccion. El navegador NO envia precios, totales ni cliente.
    var pedido = await __supabase.rpc('st_crear_pedido', {
      p_nombre: data.nombre,
      p_celular: celular,
      p_email: data.email || null,
      p_direccion: data.direccion,
      p_ciudad: data.ciudad,
      p_departamento: data.departamento,
      p_metodo_pago: metodoPago,
      p_items: items.map(function(it) {
        return { producto_detalle_id: it.detalleId, cantidad: it.cantidad || 1 };
      })
    });
    if (!pedido || !pedido.numero_pedido) throw new Error('Respuesta inesperada al crear el pedido');

    localStorage.removeItem('kubit_carrito');
    if (typeof actualizarBadgeCarrito === 'function') actualizarBadgeCarrito();
    mostrarEstadoCargando(false);

    var totalItems = Number(pedido.total_items) ||
      items.reduce(function(sum, item) { return sum + (item.cantidad || 1); }, 0);

    Modal({
      titulo: 'Pedido recibido',
      contenido: htmlConfirmacion(pedido, celular, totalItems)
    });
  } catch (err) {
    console.error('Error al crear pedido:', err);
    mostrarEstadoCargando(false);
    var e = mensajeErrorPedido(err);
    Modal({
      titulo: 'No se pudo procesar',
      contenido: '' +
        '<div class="text-center py-2">' +
          '<svg class="w-14 h-14 mx-auto text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
          '</svg>' +
          '<p class="text-sm text-slate-600 mb-5">' + escaparHtml(e.texto) + '</p>' +
          '<a href="https://wa.me/' + WHATSAPP_NEGOCIO + '" target="_blank" rel="noopener" class="block w-full text-center px-4 py-2 mb-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Escribir por WhatsApp</a>' +
          '<button class="block w-full text-center px-4 py-2 text-sm font-medium bg-slate-950 text-white rounded-lg hover:bg-slate-800 transition-colors" onclick="this.closest(\'.fixed\').remove()">Intentar de nuevo</button>' +
        '</div>'
    });
  }
}

// T3b (ST-11): confirmacion con instrucciones de pago y "Confirmar por WhatsApp".
// Si el pedido tiene stock insuficiente (RA-05), NO se muestran instrucciones de pago.
function mensajeWhatsAppPedido(pedido) {
  return 'Hola, acabo de hacer el pedido ' + pedido.numero_pedido +
    ' por ' + formatearMoneda(pedido.total) + '.';
}

function htmlInstruccionesPago(pedido) {
  var caja = 'mt-4 text-left rounded-lg border px-4 py-3 ';
  if (pedido.stock_insuficiente) {
    return '<div class="' + caja + 'border-amber-200 bg-amber-50">' +
      '<p class="text-sm text-amber-800">Algunos productos tienen pocas unidades. ' +
      '<strong>Te confirmaremos disponibilidad por WhatsApp antes del pago.</strong> Aún no realices ningún pago.</p>' +
      '</div>';
  }
  var total = formatearMoneda(pedido.total);
  var numero = escaparHtml(pedido.numero_pedido);
  var pago = pedido.pago || null;
  if (pedido.medio_pago === 'transferencia' && pago && pago.llave) {
    return '<div class="' + caja + 'border-slate-200 bg-slate-50">' +
      '<p class="text-sm font-medium text-slate-900 mb-2">Paga por transferencia Bre-B</p>' +
      '<p class="text-xs text-slate-500 mb-1">Llave</p>' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<code class="flex-1 min-w-0 truncate text-sm font-mono bg-white border border-slate-200 rounded px-2 py-1.5">' + escaparHtml(pago.llave) + '</code>' +
        '<button type="button" data-copiar="' + escaparHtml(pago.llave) + '" class="shrink-0 px-3 py-1.5 text-xs font-medium bg-slate-950 text-white rounded hover:bg-slate-800">Copiar</button>' +
      '</div>' +
      (pago.titular ? '<p class="text-xs text-slate-600 mb-1">Al transferir verás el nombre: <strong>' + escaparHtml(pago.titular) + '</strong></p>' : '') +
      '<p class="text-xs text-slate-600">Valor exacto: <strong>' + total + '</strong> · Referencia: <strong>' + numero + '</strong></p>' +
      (pago.qr_url ? '<div class="mt-3 text-center"><p class="text-xs text-slate-500 mb-1">¿Estás en un computador? Escanea con la app de tu banco</p>' +
        '<img src="' + escaparHtml(pago.qr_url) + '" alt="QR Bre-B" class="w-40 h-40 mx-auto object-contain"></div>' : '') +
      '<p class="text-xs text-slate-500 mt-2">Envíanos el comprobante por WhatsApp.</p>' +
      '</div>';
  }
  if (pedido.medio_pago === 'mercado_pago' && pago && pago.link) {
    return '<div class="' + caja + 'border-slate-200 bg-slate-50">' +
      '<p class="text-sm font-medium text-slate-900 mb-1">Paga con tarjeta vía Mercado Pago</p>' +
      '<p class="text-xs text-slate-600 mb-3">Paga exactamente <strong>' + total + '</strong> y escribe <strong>' + numero + '</strong> en la descripción del pago.</p>' +
      '<a href="' + escaparHtml(pago.link) + '" target="_blank" rel="noopener" class="block w-full text-center px-4 py-2 text-sm font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors">Pagar con Mercado Pago</a>' +
      '</div>';
  }
  if (pedido.medio_pago === 'contraentrega') {
    return '<div class="' + caja + 'border-slate-200 bg-slate-50">' +
      '<p class="text-sm text-slate-700">Pagas <strong>' + total + '</strong> en efectivo al recibir. Te confirmaremos por WhatsApp antes de despachar.</p>' +
      '</div>';
  }
  return '';
}

function htmlConfirmacion(pedido, celular, totalItems) {
  var wa = 'https://wa.me/' + (pedido.whatsapp || WHATSAPP_NEGOCIO) + '?text=' + encodeURIComponent(mensajeWhatsAppPedido(pedido));
  var envio = pedido.envio_gratis || Number(pedido.costo_envio) === 0
    ? 'envío gratis'
    : 'incluye envío de ' + formatearMoneda(pedido.costo_envio);
  var dias = (pedido.dias_max && typeof textoDiasEntrega === 'function')
    ? '<p class="text-xs text-slate-500 mb-1">' + textoDiasEntrega(pedido.dias_min, pedido.dias_max) + '</p>' : '';
  return '' +
    '<div class="text-center py-2">' +
      '<svg class="w-14 h-14 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
      '</svg>' +
      '<p class="text-sm text-slate-600 mb-1">Pedido <strong>#' + escaparHtml(pedido.numero_pedido) + '</strong> recibido</p>' +
      '<p class="text-sm text-slate-600 mb-1">' + totalItems + ' ' + (totalItems === 1 ? 'producto' : 'productos') +
        ' · Total <strong>' + formatearMoneda(pedido.total) + '</strong> (' + envio + ')</p>' +
      dias +
      htmlInstruccionesPago(pedido) +
      '<p class="text-sm text-slate-500 mt-4 mb-4">Te contactaremos por WhatsApp al <strong>' + escaparHtml(celular) +
        '</strong> para confirmar tu pedido y el pago.</p>' +
      '<a href="' + wa + '" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 w-full px-4 py-2 mb-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Confirmar por WhatsApp</a>' +
      '<a href="index.html" class="block w-full text-center px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Volver a la tienda</a>' +
    '</div>';
}
