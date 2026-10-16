(function () {
  'use strict';

  var PRODUCTOS = [];
  var CLIENTES = [];
  var CARRITO = [];
  var TASA_IMPUESTO = 0.19;
  var CANALES = [];
  var METODOS_PAGO = [];
  var CANAL_ACTIVO = null;
  var _loading = false;
  var ULTIMA_VENTA_ID = null;
  var VENTA_EDITANDO_ID = null;

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  async function init() {
    aplicarDarkMode();
    cargarSesionYMostrar();
    mostrarFecha();
    mostrarInfoCaja();
    await Promise.all([
      cargarProductos(),
      cargarClientes(),
      cargarCanales(),
      cargarMetodosPago(),
      cargarVendedores(),
      cargarEstadisticas()
    ]);

    // Detectar modo edicion
    var params = new URLSearchParams(window.location.search);
    var editId = params.get('editar');
    if (editId) {
      var editDataStr = sessionStorage.getItem('kubit_editar_venta');
      if (editDataStr) {
        try {
          var editData = JSON.parse(editDataStr);
          VENTA_EDITANDO_ID = editData.id;
          sessionStorage.removeItem('kubit_editar_venta');
          cargarEdicion(editData);
        } catch (e) {
          console.error('[Ventas] Error cargando datos de edicion:', e);
        }
      }
    } else {
      setClienteDefecto();
      setFechaDefecto();
      setearValoresDefecto();
    }
    bindearEventos();
    actualizarTotales();
    window.KubitAuth.aplicarRestriccionesUI();
    validarFormulario();
    $('input-referencia').focus();
  }

  function aplicarDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
  }

  function toggleDark() {
    html.classList.toggle('dark');
    localStorage.setItem('darkMode', html.classList.contains('dark'));
  }

  function cargarSesionYMostrar() {
    window.KubitAuth.cargarSesion();
    var user = window.KubitAuth.obtenerUsuario();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
  }

  function mostrarFecha() {
    var ahora = new Date();
    var opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    $('fecha-actual').textContent = ahora.toLocaleDateString('es-CO', opts);
    setInterval(function () {
      var a = new Date();
      $('fecha-actual').textContent = a.toLocaleDateString('es-CO', opts);
    }, 30000);
  }

  function mostrarInfoCaja() {
    var cajaNombre = localStorage.getItem('pos_caja_nombre') || 'Caja Principal';
    var user = window.KubitAuth.obtenerUsuario();
    var nombre = user ? user.nombre : 'Admin';
    var rol = user ? user.rolNombre : '';
    $('caja-info').textContent = cajaNombre + ' · Abierta';
    $('user-name').textContent = nombre;
    $('user-rol').textContent = rol;
    $('user-avatar').textContent = nombre.charAt(0).toUpperCase();
  }

  async function cargarEstadisticas() {
    try {
      var stats = await DB.ventas.estadisticasHoy();
      if (stats.error) {
        $('kpi-ventas-count').textContent = '\u2014';
        $('kpi-ventas-total').textContent = '$\u2014';
        $('kpi-ventas-prom').textContent = '$\u2014';
        return;
      }
      $('kpi-ventas-count').textContent = stats.count;
      $('kpi-ventas-total').textContent = formatearMoneda(stats.total);
      $('kpi-ventas-prom').textContent = formatearMoneda(stats.promedio);
    } catch (e) {
      console.error('[Ventas] Error cargando estadisticas:', e);
    }
  }

  async function cargarProductos() {
    var res = await DB.productos.listarConDetalle();
    if (res.error) {
      console.error('[Ventas] Error cargando productos:', res.error);
      mostrarToast('Error al cargar productos');
      return;
    }
    PRODUCTOS = (res.data || []).map(function (d) {
      var p = d.producto || {};
      return {
        detalleId: d.id,
        productoId: p.id || d.producto_id,
        nombre: p.nombre || 'Sin nombre',
        codigoInterno: d.codigo_interno || '',
        precio: d.precio_venta || 0,
        precioCompra: d.precio_compra || 0,
        descuentoMax: d.descuento_max || 0,
        stock: d.stock_actual || 0,
        categoriaId: p.categoria_id || null,
        categoriaNombre: (p.categoria && p.categoria.nombre) || '',
        tags: p.tags || [],
        tasaImpuesto: p.tasa_impuesto !== null && p.tasa_impuesto !== undefined ? p.tasa_impuesto : TASA_IMPUESTO,
        slug: p.slug || ''
      };
    });
  }

  async function cargarClientes() {
    var res = await DB.clientes.listar({ limit: 100 });
    if (res.error) {
      console.error('[Ventas] Error cargando clientes:', res.error);
      return;
    }
    CLIENTES = res.data || [];
  }

  async function cargarCanales() {
    try {
      var data = await window.__supabase.get('pos_canales_venta?select=*&order=nombre.asc');
      CANALES = data || [];
      renderizarCanales();
      renderizarMarketplaces();
      seleccionarTipo('marketplace');
    } catch (e) {
      console.error('[Ventas] Error cargando canales:', e);
    }
  }

  async function cargarMetodosPago() {
    var res = await DB.metodosPago.listar();
    if (res.error) {
      console.error('[Ventas] Error cargando metodos de pago:', res.error);
      return;
    }
    METODOS_PAGO = res.data || [];
  }

  async function cargarVendedores() {
    try {
      var data = await window.__supabase.get('pos_usuarios?select=id,nombre_completo,activo&activo=eq.true&order=nombre_completo.asc');
      var select = $('select-vendedor');
      var user = window.KubitAuth.obtenerUsuario();
      select.innerHTML = '';
      (data || []).forEach(function (u) {
        var sel = u.id === user.id ? ' selected' : '';
        select.innerHTML += '<option value="' + u.id + '"' + sel + '>' + u.nombre_completo + '</option>';
      });
    } catch (e) {
      console.error('[Ventas] Error cargando vendedores:', e);
    }
  }

  function setClienteDefecto() {
    var cliente = CLIENTES.find(function(c) { return c.numero_id === '222222222222'; });
    if (!cliente) return;
    var nombre = [cliente.primer_nombre, cliente.segundo_nombre, cliente.primer_apellido, cliente.segundo_apellido].filter(Boolean).join(' ');
    $('input-cliente').value = nombre;
    $('selected-cliente-id').value = cliente.id;
  }

  function setFechaDefecto() {
    var ahora = new Date();
    var y = ahora.getFullYear();
    var m = String(ahora.getMonth() + 1).padStart(2, '0');
    var d = String(ahora.getDate()).padStart(2, '0');
    var h = String(ahora.getHours()).padStart(2, '0');
    var min = String(ahora.getMinutes()).padStart(2, '0');
    $('input-fecha').value = y + '-' + m + '-' + d + 'T' + h + ':' + min;
  }

  function setearValoresDefecto() {
    $('select-metodo-pago').value = 'transferencia';
  }

  function toggleCostosCanal(canalCodigo) {
    var canal = CANALES.find(function(c) { return c.codigo === canalCodigo; });
    var costosSection = $('costos-canal-section');
    if (canal && canal.tipo === 'marketplace') {
      costosSection.classList.remove('hidden');
    } else {
      costosSection.classList.add('hidden');
    }
  }

  function renderizarCanales() {
    var container = $('canales-container');
    var tipos = [];
    CANALES.forEach(function(c) {
      if (tipos.indexOf(c.tipo) === -1) tipos.push(c.tipo);
    });
    var orden = ['fisico', 'web_propio', 'marketplace'];
    var labels = {
      fisico: { texto: 'Fisico' },
      web_propio: { texto: 'Web' },
      marketplace: { texto: 'Ecommerce' }
    };
    container.innerHTML = '';
    orden.forEach(function(t) {
      if (tipos.indexOf(t) === -1) return;
      var info = labels[t] || { texto: t };
      container.innerHTML +=
        '<button type="button" class="canal-tipo flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-tipo="' + t + '">' +
        obtenerIconoCanal(t) + '<span>' + info.texto + '</span>' +
        (t === 'marketplace' ? '<span class="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded ml-1">Ecomm</span>' : '') +
        '</button>';
    });
  }

  function renderizarMarketplaces() {
    var select = $('select-marketplace');
    var marketplaces = CANALES.filter(function(c) { return c.tipo === 'marketplace'; });
    select.innerHTML = '';
    marketplaces.forEach(function(m) {
      select.innerHTML += '<option value="' + m.codigo + '">' + m.nombre + '</option>';
    });
  }

  function seleccionarTipo(tipo) {
    document.querySelectorAll('.canal-tipo').forEach(function(btn) {
      var active = btn.dataset.tipo === tipo;
      btn.className = active
        ? 'canal-tipo flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-950 dark:border-white bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium transition-all'
        : 'canal-tipo flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:border-slate-300 dark:hover:border-slate-600 transition-all';
    });
    var esMarketplace = tipo === 'marketplace';
    $('marketplace-selector').classList.toggle('hidden', !esMarketplace);
    if (esMarketplace) {
      var first = CANALES.find(function(c) { return c.codigo === 'mercadolibre'; }) || CANALES.find(function(c) { return c.tipo === 'marketplace'; });
      if (first) {
        $('select-marketplace').value = first.codigo;
        CANAL_ACTIVO = first.codigo;
      }
    } else {
      var canal = CANALES.find(function(c) { return c.tipo === tipo; });
      if (canal) CANAL_ACTIVO = canal.codigo;
    }
    toggleCostosCanal(CANAL_ACTIVO);
    actualizarTotales();
  }

  function seleccionarMarketplace(codigo) {
    CANAL_ACTIVO = codigo;
    toggleCostosCanal(codigo);
    actualizarTotales();
  }

  function obtenerIconoCanal(tipo) {
    if (tipo === 'fisico') {
      return '<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z"/></svg>';
    }
    if (tipo === 'web_propio') {
      return '<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/></svg>';
    }
    return '<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>';
  }

  /* ─── CLIENTE AUTOCOMPLETE ─── */
  var _clienteTimer = null;
  function onClienteInput() {
    clearTimeout(_clienteTimer);
    var q = $('input-cliente').value.trim();
    if (q.length < 2) {
      $('cliente-suggestions').classList.add('hidden');
      $('selected-cliente-id').value = '';
      return;
    }
    _clienteTimer = setTimeout(function () { buscarClientes(q); }, 250);
  }

  async function buscarClientes(q) {
    var res = await DB.clientes.buscar(q);
    var container = $('cliente-suggestions');
    if (res.error || !res.data || !res.data.length) {
      container.classList.add('hidden');
      return;
    }
    container.innerHTML = res.data.map(function (c) {
      var nombre = [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ');
      var doc = c.numero_id || '';
      return '<div class="cliente-sugerencia px-3.5 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between" data-id="' + c.id + '">' +
        '<span>' + escaparHTML(nombre) + '</span>' +
        (doc ? '<span class="text-xs text-slate-400">' + escaparHTML(doc) + '</span>' : '') +
        '</div>';
    }).join('');
    container.classList.remove('hidden');
  }

  function seleccionarCliente(e) {
    var item = e.target.closest('.cliente-sugerencia');
    if (!item) return;
    var id = item.dataset.id;
    var nombre = item.firstChild.textContent.trim();
    $('input-cliente').value = nombre;
    $('selected-cliente-id').value = id;
    $('cliente-suggestions').classList.add('hidden');
  }

  /* ─── PRODUCTO SEARCH ─── */
  var _productoTimer = null;
  function onProductoInput() {
    clearTimeout(_productoTimer);
    var q = $('input-buscar-producto').value.trim().toLowerCase();
    var container = $('producto-suggestions');
    if (q.length < 1) {
      container.classList.add('hidden');
      return;
    }
    _productoTimer = setTimeout(function () {
      var matches = PRODUCTOS.filter(function (p) {
        return p.nombre.toLowerCase().includes(q) || (p.codigoInterno && p.codigoInterno.toLowerCase().includes(q));
      }).slice(0, 8);

      if (!matches.length) {
        container.classList.add('hidden');
        return;
      }
      container.innerHTML = matches.map(function (p) {
        var agotado = p.stock <= 0;
        return '<div class="producto-sugerencia px-3.5 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between ' + (agotado ? 'opacity-50' : '') + '" data-id="' + p.detalleId + '">' +
          '<div><span class="text-slate-700 dark:text-slate-300">' + escaparHTML(p.nombre) + '</span>' +
          (p.codigoInterno ? '<span class="text-xs text-slate-400 block">' + escaparHTML(p.codigoInterno) + '</span>' : '') + '</div>' +
          '<div class="text-right"><span class="text-slate-950 dark:text-white font-medium">' + formatearMoneda(p.precio) + '</span>' +
          '<span class="text-xs text-slate-400 ml-2">Stock: ' + p.stock + '</span></div>' +
          '</div>';
      }).join('');
      container.classList.remove('hidden');
    }, 200);
  }

  function seleccionarProducto(e) {
    var item = e.target.closest('.producto-sugerencia');
    if (!item) return;
    var detalleId = item.dataset.id;
    agregarAlCarrito(detalleId);
    $('input-buscar-producto').value = '';
    $('producto-suggestions').classList.add('hidden');
    $('input-buscar-producto').focus();
  }

  function agregarAlCarrito(detalleId) {
    var p = obtenerProducto(detalleId);
    if (!p) return;
    if (p.stock <= 0) {
      mostrarToast('Producto agotado');
      return;
    }
    var existente = CARRITO.find(function (i) { return i.detalleId === detalleId; });
    if (existente) {
      if (existente.cantidad >= p.stock) {
        mostrarToast('Stock insuficiente');
        return;
      }
      existente.cantidad += 1;
    } else {
      CARRITO.push({
        detalleId: p.detalleId,
        productoId: p.productoId,
        nombre: p.nombre,
        precio: p.precio,
        cantidad: 1,
        descuento: 0,
        descuentoMax: p.descuentoMax,
        precioCompra: p.precioCompra,
        stock: p.stock
      });
    }
    actualizarCarrito();
  }

  function obtenerProducto(detalleId) {
    return PRODUCTOS.find(function (x) { return x.detalleId === detalleId; });
  }

  function quitarDelCarrito(detalleId) {
    CARRITO = CARRITO.filter(function (i) { return i.detalleId !== detalleId; });
    actualizarCarrito();
  }

  function cambiarCantidad(detalleId, delta) {
    var item = CARRITO.find(function (i) { return i.detalleId === detalleId; });
    if (!item) return;
    var nueva = item.cantidad + delta;
    if (nueva < 1) { quitarDelCarrito(detalleId); return; }
    var p = obtenerProducto(detalleId);
    if (p && nueva > p.stock) {
      mostrarToast('Stock insuficiente');
      return;
    }
    item.cantidad = nueva;
    actualizarCarrito();
  }

  function cambiarDescuentoItem(detalleId, valor) {
    var item = CARRITO.find(function (i) { return i.detalleId === detalleId; });
    if (!item) return;
    var max = item.descuentoMax || 100;
    var user = window.KubitAuth.obtenerUsuario();
    if (!window.KubitAuth.tienePermiso('pos.descuento.alto')) {
      max = Math.min(max, 10);
    }
    var v = Math.min(Math.max(parseFloat(valor) || 0, 0), max);
    item.descuento = v;
    actualizarBadge();
    actualizarTotales();
    validarFormulario();
  }

  function cambiarPrecioItem(detalleId, valor) {
    var item = CARRITO.find(function (i) { return i.detalleId === detalleId; });
    if (!item) return;
    var v = Math.max(parseFloat(valor) || 0, 0);
    item.precio = v;
    actualizarBadge();
    actualizarTotales();
    validarFormulario();
  }

  function actualizarSubtotalRow(detalleId, inputEl) {
    var item = CARRITO.find(function (i) { return i.detalleId === detalleId; });
    if (!item) return;
    var row = inputEl.closest('tr');
    if (!row) return;
    var cell = row.querySelector('.cell-subtotal');
    if (!cell) return;
    var base = item.precio * item.cantidad;
    var desc = base * (item.descuento / 100);
    cell.textContent = formatearMoneda(base - desc);
  }

  function actualizarBadge() {
    var badge = $('cart-count-badge');
    if (badge) {
      var totalItems = CARRITO.reduce(function (s, i) { return s + i.cantidad; }, 0);
      badge.textContent = totalItems + ' items';
    }
  }

  function actualizarCarrito() {
    var tbody = $('cart-table-body');
    actualizarBadge();
    if (!CARRITO.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-slate-300 dark:text-slate-700">' +
        '<svg class="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-700" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>' +
        '<p class="text-sm">Carrito vacio</p><p class="text-xs mt-1">Busca y agrega productos a la venta</p></td></tr>';
    } else {
      tbody.innerHTML = CARRITO.map(function (i, index) {
        var base = i.precio * i.cantidad;
        var desc = base * (i.descuento / 100);
        var sub = base - desc;
        var maxD = i.descuentoMax || 100;
        return '<tr class="border-b border-slate-100 dark:border-slate-800 text-sm ' + (index % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/20') + '">' +
          '<td class="py-2.5 pr-2"><span class="text-slate-900 dark:text-slate-100 font-medium">' + escaparHTML(i.nombre) + '</span></td>' +
          '<td class="py-2.5 px-2 text-right"><input type="number" class="input-precio-item w-24 px-1.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-slate-950 dark:focus:ring-white/20" value="' + i.precio + '" min="0" step="any" data-id="' + i.detalleId + '"></td>' +
          '<td class="py-2.5 px-2 text-center"><div class="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg"><button class="btn-cant-menos w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-950 dark:hover:text-white rounded-lg transition-colors" data-id="' + i.detalleId + '">-</button><span class="w-6 text-center text-sm font-medium text-slate-950 dark:text-white">' + i.cantidad + '</span><button class="btn-cant-mas w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-950 dark:hover:text-white rounded-lg transition-colors" data-id="' + i.detalleId + '">+</button></div></td>' +
          '<td class="py-2.5 px-2 text-center"><input type="number" class="input-dto-item w-14 px-1.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-slate-950 dark:focus:ring-white/20" value="' + i.descuento + '" min="0" max="' + maxD + '" step="0.5" data-id="' + i.detalleId + '"></td>' +
          '<td class="cell-subtotal py-2.5 px-2 text-right font-medium text-slate-950 dark:text-white">' + formatearMoneda(sub) + '</td>' +
          '<td class="py-2.5 pl-2 text-center"><button class="btn-eliminar-item w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors" data-id="' + i.detalleId + '"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg></button></td>' +
          '</tr>';
      }).join('');
    }
    actualizarTotales();
    validarFormulario();
  }

  function formatearMoneda(valor) {
    return '$' + Number(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function actualizarStatsCarrito() {
    var count = CARRITO.length;
    var unidades = CARRITO.reduce(function (s, i) { return s + i.cantidad; }, 0);
    var subtotal = CARRITO.reduce(function (s, i) { return s + (i.precio * i.cantidad); }, 0);
    $('stats-productos').textContent = count;
    $('stats-unidades').textContent = unidades;
    $('stats-ticket-prom').textContent = count > 0 ? formatearMoneda(subtotal / count) : '$0';
  }

  function actualizarTotales() {
    actualizarStatsCarrito();
    var subtotal = CARRITO.reduce(function (s, i) {
      return s + (i.precio * i.cantidad);
    }, 0);

    var descGlobalPct = parseFloat($('input-descuento-global').value) || 0;
    var descGlobal = subtotal * (descGlobalPct / 100);

    var total = subtotal - descGlobal;

    var ivaTotal = CARRITO.reduce(function (s, i) {
      var base = i.precio * i.cantidad;
      var tasa = i.tasaImpuesto || 0;
      if (tasa > 0) {
        return s + (base - (base / (1 + tasa)));
      }
      return s;
    }, 0);

    // Determinar label del IVA segun tasas en el carrito
    var tasas = {};
    CARRITO.forEach(function (i) {
      tasas[i.tasaImpuesto || 0] = true;
    });
    var tasaKeys = Object.keys(tasas).map(Number).sort();
    var labelIva = 'IVA';
    if (tasaKeys.length === 1) {
      var pct = tasaKeys[0] * 100;
      var nombre = pct === 0 ? 'exento' : (pct === 5 ? 'reducido' : 'general');
      labelIva += ' (' + pct + '% ' + nombre + ')';
    } else if (tasaKeys.length > 1) {
      labelIva += ' (tasas mixtas)';
    }
    $('label-impuesto').textContent = labelIva;

    var cargoVenta = parseFloat($('input-costo-cargo').value) || 0;
    var cargoImpuestos = parseFloat($('input-costo-impuestos').value) || 0;
    var cargoEnvios = parseFloat($('input-costo-envios').value) || 0;
    var totalCostos = cargoVenta + cargoImpuestos + cargoEnvios;

    var ingresoNeto = total - totalCostos;

    $('res-subtotal').textContent = formatearMoneda(subtotal);
    $('res-descuento').textContent = formatearMoneda(descGlobal);
    $('res-impuesto').textContent = formatearMoneda(ivaTotal);
    $('res-total-costos').textContent = formatearMoneda(totalCostos);
    $('res-total').textContent = formatearMoneda(total);

    var canalActual = CANALES.find(function(c) { return c.codigo === CANAL_ACTIVO; });
    var esMarketplace = canalActual && canalActual.tipo === 'marketplace';
    var netoSection = $('res-ingreso-neto-section');
    if (esMarketplace) {
      netoSection.classList.remove('hidden');
      $('res-ingreso-neto').textContent = formatearMoneda(ingresoNeto);
    } else {
      netoSection.classList.add('hidden');
    }
  }

  function validarFormulario() {
    var btn = $('btn-procesar');
    btn.disabled = CARRITO.length === 0;
  }

  function limpiarFormulario() {
    CARRITO = [];
    $('input-cliente').value = '';
    $('selected-cliente-id').value = '';
    $('input-referencia').value = '';
    $('input-descuento-global').value = '';
    $('input-costo-cargo').value = '';
    $('input-costo-impuestos').value = '';
    $('input-costo-envios').value = '';
    $('input-buscar-producto').value = '';
    $('producto-suggestions').classList.add('hidden');
    seleccionarTipo('marketplace');
    setFechaDefecto();
    setearValoresDefecto();
    setClienteDefecto();
    $('input-referencia').focus();
    actualizarCarrito();
    actualizarTotales();
    mostrarToast('Formulario limpiado');
  }

  async function procesarVenta() {
    if (_loading) return;
    _loading = true;
    var btn = $('btn-procesar');
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"/></svg> Procesando...';

    try {
      var erroresStock = validarStockCarrito();
      if (erroresStock.length) {
        mostrarToast('Stock insuficiente: ' + erroresStock.join(' | '));
        _loading = false;
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Procesar Venta';
        return;
      }

      var user = window.KubitAuth.obtenerUsuario();
      var canalCodigo = CANAL_ACTIVO;
      var canal = CANALES.find(function (c) { return c.codigo === canalCodigo; });
      var canalId = canal ? canal.id : null;
      var esMarketplace = canal && canal.tipo === 'marketplace';

      var vendedorId = $('select-vendedor').value || user.id;
      var clienteId = $('selected-cliente-id').value || null;
      var metodoPago = $('select-metodo-pago').value;
      var referencia = $('input-referencia').value.trim() || null;
      var fechaVenta = $('input-fecha').value;
      var fechaISO = fechaVenta ? new Date(fechaVenta).toISOString() : new Date().toISOString();

      var t = calcularTotalesDesdeFormulario();

      var numeroVenta = await window.__supabase.rpc('generar_consecutivo', { p_entidad: 'VENTA', p_prefijo: 'KBT' });
      var ventaData = {
        numero_venta: numeroVenta,
        cliente_id: clienteId,
        usuario_id: vendedorId,
        canal_id: canalId,
        fecha_venta: fechaISO,
        metodo_pago: metodoPago,
        estado: 'CONFIRMADA',
        referencia_externa: referencia,
        subtotal: t.baseSinIva,
        descuento: t.descuento,
        impuesto: t.impuesto,
        total: t.total,
        costo_cargo_venta: esMarketplace ? t.cargoVenta : 0,
        costo_impuestos: esMarketplace ? t.cargoImpuestos : 0,
        costo_envios: esMarketplace ? t.cargoEnvios : 0
      };

      var detalles = CARRITO.map(function (i) {
        var base = i.precio * i.cantidad;
        var desc = base * (i.descuento / 100);
        var subConDesc = base - desc;
        var tasa = i.tasaImpuesto || 0;
        var baseSinIva = tasa > 0 ? (subConDesc / (1 + tasa)) : subConDesc;
        var imp = subConDesc - baseSinIva;
        return {
          producto_detalle_id: i.detalleId,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
          descuento: desc,
          tasa_impuesto: tasa,
          subtotal: baseSinIva,
          impuesto: imp,
          total: subConDesc
        };
      });

      var res = await DB.ventas.crearConDetalles(ventaData, detalles);
      if (res.error) {
        mostrarToast('Error al guardar venta: ' + res.error);
        _loading = false;
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Procesar Venta';
        return;
      }

      ULTIMA_VENTA_ID = res.data.id;

      for (var j = 0; j < CARRITO.length; j++) {
        var item = CARRITO[j];
        var stockRes = await DB.productos.ajustarStock(
          item.detalleId,
          -item.cantidad,
          'salida_venta',
          'Venta #' + ventaData.numero_venta,
          { usuarioId: user.id }
        );
        if (stockRes.error) {
          console.error('[Ventas] Error ajustando stock de ' + item.nombre + ':', stockRes.error);
          mostrarToast('Error ajustando stock: ' + stockRes.error);
        } else if (stockRes.data && stockRes.data.stock_nuevo !== undefined) {
          for (var k = 0; k < PRODUCTOS.length; k++) {
            if (PRODUCTOS[k].detalleId === item.detalleId) {
              PRODUCTOS[k].stock = stockRes.data.stock_nuevo;
              break;
            }
          }
        }
      }

      var fd = new Date(fechaVenta);
      var anio = fd.getFullYear();
      var mes = fd.getMonth() + 1;

      await DB.finanzasMensuales.actualizarPorVenta(
        anio,
        mes,
        t.total,
        t.descuento,
        esMarketplace ? (t.cargoVenta + t.cargoImpuestos + t.cargoEnvios) : 0,
        CARRITO.reduce(function (s, i) { return s + (i.precioCompra || 0) * i.cantidad; }, 0)
      );

      // Si estamos editando, anular la venta original (Void + Recreate)
      var editando = !!VENTA_EDITANDO_ID;
      if (editando) {
        var anularRes = await DB.ventas.anularConRevertir(VENTA_EDITANDO_ID, { usuarioId: user.id });
        if (anularRes.error) {
          console.error('[Ventas] Error al anular venta original:', anularRes.error);
          mostrarToast('Venta nueva creada, pero la original NO se anulo: ' + anularRes.error + ' Anulela desde Historial.', 'error');
        } else if (anularRes.data && anularRes.data.advertencias && anularRes.data.advertencias.length) {
          // Fase 30: la original se anulo, pero algo menor fallo (ej. finanzas)
          mostrarToast('Venta editada con advertencias: ' + anularRes.data.advertencias.join(' | '), 'info');
        }
        VENTA_EDITANDO_ID = null;
      }

      var metodoNombre = $('select-metodo-pago').options[$('select-metodo-pago').selectedIndex].text;
      var resumen = formatearMoneda(t.total) + ' · ' + metodoNombre + ' · ' + CARRITO.reduce(function (s, i) { return s + i.cantidad; }, 0) + ' items';
      $('exito-resumen').textContent = resumen;
      $('exito-titulo').textContent = editando ? 'Venta Editada' : 'Venta Completada';
      $('modal-exito').classList.remove('hidden');
      cargarEstadisticas();
    } catch (e) {
      console.error('[Ventas] Error en procesarVenta:', e);
      mostrarToast('Error inesperado al procesar la venta');
    }

    _loading = false;
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> Procesar Venta';
  }

  function calcularTotalesDesdeFormulario() {
    var subtotal = CARRITO.reduce(function (s, i) {
      return s + (i.precio * i.cantidad);
    }, 0);
    var descGlobalPct = parseFloat($('input-descuento-global').value) || 0;
    var descuento = subtotal * (descGlobalPct / 100);
    var total = subtotal - descuento;

    var ivaTotal = CARRITO.reduce(function (s, i) {
      var base = i.precio * i.cantidad;
      var tasa = i.tasaImpuesto || 0;
      if (tasa > 0) {
        return s + (base - (base / (1 + tasa)));
      }
      return s;
    }, 0);

    var baseSinIva = CARRITO.reduce(function (s, i) {
      var base = i.precio * i.cantidad;
      var tasa = i.tasaImpuesto || 0;
      if (tasa > 0) {
        return s + (base / (1 + tasa));
      }
      return s + base;
    }, 0);

    var cargoVenta = parseFloat($('input-costo-cargo').value) || 0;
    var cargoImpuestos = parseFloat($('input-costo-impuestos').value) || 0;
    var cargoEnvios = parseFloat($('input-costo-envios').value) || 0;
    return {
      subtotal: subtotal,
      baseSinIva: baseSinIva,
      descuento: descuento,
      impuesto: ivaTotal,
      total: total,
      cargoVenta: cargoVenta,
      cargoImpuestos: cargoImpuestos,
      cargoEnvios: cargoEnvios
    };
  }

  function validarStockCarrito() {
    var errores = [];
    CARRITO.forEach(function (item) {
      var p = obtenerProducto(item.detalleId);
      if (p && item.cantidad > p.stock) {
        errores.push(item.nombre + ': solicitado ' + item.cantidad + ', disponible ' + p.stock);
      }
    });
    return errores;
  }

  function cerrarExito() {
    $('modal-exito').classList.add('hidden');
  }

  async function nuevaVenta() {
    VENTA_EDITANDO_ID = null;
    limpiarFormulario();
    cerrarExito();
    await cargarProductos();
    mostrarToast('Listo para nueva venta');
  }

  /* ─── CARGAR EDICION ─── */
  function cargarEdicion(v) {
    // Cliente
    if (v.cliente) {
      var c = v.cliente;
      var nombreCliente = [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ');
      $('input-cliente').value = nombreCliente;
      $('selected-cliente-id').value = c.id;
    } else if (v.cliente_id) {
      var cLocal = CLIENTES.find(function(x) { return x.id === v.cliente_id; });
      if (cLocal) {
        var n = [cLocal.primer_nombre, cLocal.segundo_nombre, cLocal.primer_apellido, cLocal.segundo_apellido].filter(Boolean).join(' ');
        $('input-cliente').value = n;
        $('selected-cliente-id').value = cLocal.id;
      }
    }

    // Fecha
    if (v.fecha_venta) {
      var d = new Date(v.fecha_venta);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var dia = String(d.getDate()).padStart(2, '0');
      var h = String(d.getHours()).padStart(2, '0');
      var min = String(d.getMinutes()).padStart(2, '0');
      $('input-fecha').value = y + '-' + m + '-' + dia + 'T' + h + ':' + min;
    }

    // Metodo de pago
    if (v.metodo_pago) $('select-metodo-pago').value = v.metodo_pago;

    // Referencia
    if (v.referencia_externa) $('input-referencia').value = v.referencia_externa;

    // Vendedor
    if (v.usuario_id) {
      var selVendedor = $('select-vendedor');
      if (selVendedor.querySelector('option[value="' + v.usuario_id + '"]')) {
        selVendedor.value = v.usuario_id;
      }
    }

    // Canal — buscar por canal_id
    if (v.canal || v.canal_id) {
      var canal = v.canal || CANALES.find(function(c) { return c.id === v.canal_id; });
      if (canal) {
        var tipo = canal.tipo || 'marketplace';
        var tipoBtn = document.querySelector('.canal-tipo[data-tipo="' + tipo + '"]');
        if (tipoBtn) tipoBtn.click();
        if (tipo === 'marketplace') {
          var selMp = $('select-marketplace');
          if (selMp.querySelector('option[value="' + canal.codigo + '"]')) {
            selMp.value = canal.codigo;
            seleccionarMarketplace(canal.codigo);
          }
        }
      }
    }

    // Costos
    if (v.costo_cargo_venta) $('input-costo-cargo').value = v.costo_cargo_venta;
    if (v.costo_impuestos) $('input-costo-impuestos').value = v.costo_impuestos;
    if (v.costo_envios) $('input-costo-envios').value = v.costo_envios;

    // Descuento global (aproximado: calcular desde subtotal vs total)
    if (v.subtotal > 0 && v.descuento) {
      var pctDesc = Math.round((v.descuento / v.subtotal) * 100 * 100) / 100;
      $('input-descuento-global').value = pctDesc;
    }

    // Carrito
    CARRITO = [];
    if (v.detalles && v.detalles.length) {
      v.detalles.forEach(function(d) {
        var p = PRODUCTOS.find(function(x) { return x.detalleId === d.producto_detalle_id; });
        if (!p) return;
        var tasa = d.tasa_impuesto !== null && d.tasa_impuesto !== undefined ? d.tasa_impuesto : (p.tasaImpuesto || 0);
        CARRITO.push({
          detalleId: p.detalleId,
          productoId: p.productoId,
          nombre: p.nombre,
          precio: d.precio_unitario || p.precio,
          cantidad: d.cantidad,
          descuento: d.descuento ? Math.round((d.descuento / ((d.precio_unitario || 1) * d.cantidad)) * 100 * 100) / 100 : 0,
          descuentoMax: p.descuentoMax,
          precioCompra: p.precioCompra,
          stock: p.stock,
          tasaImpuesto: tasa
        });
      });
    }
    actualizarCarrito();
  }

  function bindearEventos() {
    $('btn-dark').addEventListener('click', toggleDark);

    $('btn-menu').addEventListener('click', function () {
      $('sidebar').classList.remove('-translate-x-full');
      $('sidebar-overlay').classList.remove('hidden');
    });

    function cerrarSidebar() {
      $('sidebar').classList.add('-translate-x-full');
      $('sidebar-overlay').classList.add('hidden');
    }
    $('btn-cerrar-menu').addEventListener('click', cerrarSidebar);
    $('sidebar-overlay').addEventListener('click', cerrarSidebar);

    document.querySelector('#canales-container').addEventListener('click', function (e) {
      var btn = e.target.closest('.canal-tipo');
      if (!btn) return;
      seleccionarTipo(btn.dataset.tipo);
    });

    $('select-marketplace').addEventListener('change', function () {
      seleccionarMarketplace(this.value);
    });

    $('input-cliente').addEventListener('input', onClienteInput);
    $('cliente-suggestions').addEventListener('click', seleccionarCliente);
    $('input-cliente').addEventListener('blur', function () {
      setTimeout(function () { $('cliente-suggestions').classList.add('hidden'); }, 200);
    });

    $('input-buscar-producto').addEventListener('input', onProductoInput);
    $('producto-suggestions').addEventListener('click', seleccionarProducto);
    $('input-buscar-producto').addEventListener('blur', function () {
      setTimeout(function () { $('producto-suggestions').classList.add('hidden'); }, 200);
    });

    $('btn-agregar-producto').addEventListener('click', function () {
      var q = $('input-buscar-producto').value.trim().toLowerCase();
      if (!q) return;
      var match = PRODUCTOS.find(function (p) {
        return p.nombre.toLowerCase().includes(q) || (p.codigoInterno && p.codigoInterno.toLowerCase().includes(q));
      });
      if (match) {
        agregarAlCarrito(match.detalleId);
        $('input-buscar-producto').value = '';
        $('producto-suggestions').classList.add('hidden');
        $('input-buscar-producto').focus();
      } else {
        mostrarToast('Producto no encontrado');
      }
    });

    document.addEventListener('click', function (e) {
      var btnMenos = e.target.closest('.btn-cant-menos');
      if (btnMenos) { cambiarCantidad(btnMenos.dataset.id, -1); return; }
      var btnMas = e.target.closest('.btn-cant-mas');
      if (btnMas) { cambiarCantidad(btnMas.dataset.id, 1); return; }
      var btnEliminar = e.target.closest('.btn-eliminar-item');
      if (btnEliminar) { quitarDelCarrito(btnEliminar.dataset.id); return; }
    });

    $('cart-table-body').addEventListener('input', function (e) {
      var dtoInput = e.target.closest('.input-dto-item');
      if (dtoInput) {
        cambiarDescuentoItem(dtoInput.dataset.id, dtoInput.value);
        actualizarSubtotalRow(dtoInput.dataset.id, dtoInput);
        return;
      }
      var precioInput = e.target.closest('.input-precio-item');
      if (precioInput) {
        cambiarPrecioItem(precioInput.dataset.id, precioInput.value);
        actualizarSubtotalRow(precioInput.dataset.id, precioInput);
      }
    });

    $('input-descuento-global').addEventListener('input', actualizarTotales);

    ['input-costo-cargo', 'input-costo-impuestos', 'input-costo-envios'].forEach(function (id) {
      $(id).addEventListener('input', actualizarTotales);
    });

    $('btn-procesar').addEventListener('click', procesarVenta);
    $('btn-limpiar').addEventListener('click', limpiarFormulario);
    $('btn-cerrar-exito').addEventListener('click', cerrarExito);
    $('btn-nueva-venta').addEventListener('click', nuevaVenta);
    $('btn-imprimir-factura').addEventListener('click', function () {
      if (!ULTIMA_VENTA_ID) return;
      window.open('factura-print?id=' + ULTIMA_VENTA_ID, '_blank');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
