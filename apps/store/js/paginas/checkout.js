var COSTO_ENVIO = 9900;

document.addEventListener('DOMContentLoaded', function() {
  var items = obtenerCarritoCheckout();
  if (!items.length) {
    mostrarCarritoVacio();
    return;
  }
  renderizarResumen(items);
  poblarDepartamentos();
  document.getElementById('btn-confirmar-pedido').addEventListener('click', function(e) {
    e.preventDefault();
    confirmarPedido(items);
  });
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
    return JSON.parse(localStorage.getItem('kubit_carrito') || '[]');
  } catch (e) {
    return [];
  }
}

function mostrarCarritoVacio() {
  document.getElementById('checkout-items').innerHTML = '\
    <div class="text-center py-8">\
      <p class="text-slate-500 text-sm mb-2">No hay productos en tu carrito</p>\
      <a href="index.html" class="inline-block mt-2 text-sm text-slate-950 underline">Ir a la tienda</a>\
    </div>\
  ';
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

    html += '\
      <div class="flex items-center gap-3">\
        <div class="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">\
          <img src="' + (item.imagen || '') + '" alt="' + (item.nombre || '') + '" class="w-full h-full object-cover">\
        </div>\
        <div class="flex-1 min-w-0">\
          <p class="text-sm text-slate-900 truncate">' + (item.nombre || 'Producto') + '</p>\
          ' + (item.variante ? '<p class="text-xs text-slate-500 truncate">' + item.variante + '</p>' : '') + '\
          ' + (item.codigo ? '<p class="text-[10px] font-mono text-slate-400 truncate">SKU: ' + item.codigo + '</p>' : '') + '\
          <p class="text-xs text-slate-400">' + cant + ' × ' + formatearMoneda(precio) + '</p>\
        </div>\
        <p class="text-sm font-medium text-slate-900">' + formatearMoneda(subtotal) + '</p>\
      </div>\
    ';
  }

  document.getElementById('checkout-items').innerHTML = html;
  document.getElementById('checkout-cantidad').textContent = totalItems;
  document.getElementById('checkout-subtotal').textContent = formatearMoneda(totalSubtotal);
  document.getElementById('checkout-total').textContent = formatearMoneda(totalSubtotal + COSTO_ENVIO);
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

function validarFormulario(data) {
  var errores = [];
  if (!data.nombre) errores.push('Nombre completo');
  if (!data.email) errores.push('Email');
  if (!data.telefono) errores.push('Teléfono');
  if (!data.direccion) errores.push('Dirección');
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
      contenido: '\
        <p class="text-sm text-slate-600 mb-3">Completa los siguientes campos:</p>\
        <ul class="text-sm text-red-500 space-y-1">\
          ' + errores.map(function(e) { return '<li>• ' + e + '</li>'; }).join('') + '\
        </ul>\
      '
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

    // 1. Obtener canal Web
    var canales = await __supabase.get('pos_canales_venta?codigo=eq.web&limit=1');
    if (!canales || !canales.length) throw new Error('Canal de venta Web no encontrado');
    var canalId = canales[0].id;

    // 2. Buscar cliente existente por email o crear uno nuevo
    var clientes = await __supabase.get('pos_clientes?email=eq.' + encodeURIComponent(data.email) + '&deleted_at=is.null&limit=1');
    var clienteId;
    if (clientes && clientes.length > 0) {
      clienteId = clientes[0].id;
    } else {
      var partesNombre = (data.nombre || '').trim().split(' ');
      var nuevoCliente = await __supabase.post('pos_clientes', {
        tipo_id: 'NIT',
        numero_id: 'CG-' + Date.now().toString(36).toUpperCase(),
        primer_nombre: partesNombre[0] || 'Invitado',
        primer_apellido: partesNombre.slice(1).join(' ') || 'Store',
        email: data.email,
        celular: data.telefono || null
      });
      if (!nuevoCliente || !nuevoCliente.length) throw new Error('Error al crear cliente');
      clienteId = nuevoCliente[0].id;
    }

    // 3. Crear direccion de envio
    var direcciones = await __supabase.post('st_direcciones', {
      cliente_id: clienteId,
      tipo: 'envio',
      nombre_destinatario: data.nombre,
      telefono: data.telefono || null,
      direccion: data.direccion,
      ciudad: data.ciudad,
      departamento: data.departamento,
      pais: 'Colombia'
    });
    if (!direcciones || !direcciones.length) throw new Error('Error al crear direccion');
    var direccionId = direcciones[0].id;

    // 4. Calcular totales
    var totalItems = items.reduce(function(sum, item) { return sum + (item.cantidad || 1); }, 0);
    var totalSubtotal = items.reduce(function(sum, item) { return sum + (item.precio || 0) * (item.cantidad || 1); }, 0);
    var total = totalSubtotal + COSTO_ENVIO;

    // 5. Generar numero de pedido
    var ahora = new Date();
    var y = ahora.getFullYear();
    var m = String(ahora.getMonth() + 1).padStart(2, '0');
    var r = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    var numeroPedido = 'KBT-' + y + m + '-' + r;

    // 6. Crear pedido
    var pedidos = await __supabase.post('st_pedidos', {
      numero_pedido: numeroPedido,
      cliente_id: clienteId,
      canal_id: canalId,
      direccion_envio_id: direccionId,
      direccion_facturacion_id: direccionId,
      fecha_pedido: ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0') + '-' + String(ahora.getDate()).padStart(2, '0'),
      estado: 'PENDIENTE',
      subtotal: totalSubtotal,
      descuento: 0,
      costo_envio: COSTO_ENVIO,
      total: total,
      notas: 'Metodo de pago: ' + (metodoPago || 'No especificado')
    });
    if (!pedidos || !pedidos.length) throw new Error('Error al crear pedido');
    var pedidoId = pedidos[0].id;

    // 7. Resolver producto_detalle_id y crear detalle del pedido
    var detalleData = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var cant = item.cantidad || 1;
      var precio = item.precio || 0;

      // T1 (ST-01): se guarda la variante elegida por el cliente
      detalleData.push({
        pedido_id: pedidoId,
        producto_detalle_id: item.detalleId,
        cantidad: cant,
        precio_unitario: precio,
        subtotal: cant * precio,
        total: cant * precio
      });
    }

    await __supabase.post('st_pedidos_detalle', detalleData);

    localStorage.removeItem('kubit_carrito');
    if (typeof actualizarBadgeCarrito === 'function') actualizarBadgeCarrito();

    mostrarEstadoCargando(false);

    Modal({
      titulo: 'Pedido registrado',
      contenido: '\
        <div class="text-center py-2">\
          <svg class="w-14 h-14 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">\
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>\
          </svg>\
          <p class="text-sm text-slate-600 mb-1">Pedido <strong>#' + numeroPedido + '</strong> registrado!</p>\
          <p class="text-sm text-slate-600 mb-1">Hemos recibido tu pedido de <strong>' + totalItems + ' ' + (totalItems === 1 ? 'producto' : 'productos') + '</strong>.</p>\
          <p class="text-sm text-slate-500 mb-5">Te enviaremos la confirmacion a <strong>' + data.email + '</strong>.</p>\
          <a href="index.html" class="block w-full text-center px-4 py-2 text-sm font-medium bg-slate-950 text-white rounded-lg hover:bg-slate-800 transition-colors">Volver a la tienda</a>\
        </div>\
      '
    });

  } catch (err) {
    console.error('Error al crear pedido:', err);
    mostrarEstadoCargando(false);

    Modal({
      titulo: 'No se pudo procesar',
      contenido: '\
        <div class="text-center py-2">\
          <svg class="w-14 h-14 mx-auto text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">\
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>\
          </svg>\
          <p class="text-sm text-slate-600 mb-1">Ocurrio un error al registrar tu pedido.</p>\
          <p class="text-xs text-slate-400 mb-5">Detalle: ' + err.message + '</p>\
          <button class="block w-full text-center px-4 py-2 text-sm font-medium bg-slate-950 text-white rounded-lg hover:bg-slate-800 transition-colors" onclick="this.closest(\'.fixed\').remove()">Intentar de nuevo</button>\
        </div>\
      '
    });
  }
}
