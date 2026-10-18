(function () {
  'use strict';

  var COMPRAS = [];
  var COMPRAS_FILTRADAS = [];
  var DETALLE = [];
  var PROVEEDORES = [];
  var CATALOGO = [];
  var CATALOGO_FILTRADO = [];
  var EDITANDO_ID = null;
  var EDITANDO_ESTADO = null;
  var _guardando = false;
  var PAGE_SIZE = 10;
  var PAGINA = 1;
  var CAT_PAGE_SIZE = 5;
  var CAT_PAGINA = 1;

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    await Promise.all([cargarProveedores(), cargarCatalogo(), cargarCompras()]);
    await generarNumeroOrden();
    bindearEventos();
    var _now = new Date();
    $('campo-fecha-compra').value = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
  }

  async function generarNumeroOrden() {
    var res = await DB.compras.obtenerSiguienteNumeroOrden();
    $('campo-numero-orden').value = res.data || 1;
  }

  async function cargarProveedores() {
    var res = await DB.proveedores.listar();
    if (res.error) { console.error('[Compras] Error proveedores:', res.error); return; }
    PROVEEDORES = res.data || [];
    var sel = $('campo-proveedor');
    sel.innerHTML = '<option value="">Seleccionar proveedor...</option>' +
      PROVEEDORES.map(function (p) { return '<option value="' + p.id + '">' + p.razon_social + ' (' + (p.numero_id || '') + ')</option>'; }).join('');
    var filtroSel = $('filtro-proveedor');
    filtroSel.innerHTML = '<option value="">Todos los proveedores</option>' +
      PROVEEDORES.map(function (p) { return '<option value="' + p.id + '">' + p.razon_social + '</option>'; }).join('');
  }

  async function cargarCatalogo() {
    var res = await DB.productos.listarDetalleActivos();
    if (res.error) { console.error('[Compras] Error catalogo:', res.error); return; }
    CATALOGO = res.data || [];
    CATALOGO_FILTRADO = CATALOGO;
    renderizarCatalogo();
  }

  function renderizarCatalogo() {
    var tbody = $('catalogo-tbody');
    var total = CATALOGO_FILTRADO.length;
    $('catalogo-pag-info').textContent = total + ' productos';

    if (!total) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400 text-sm">No se encontraron productos</td></tr>';
      $('catalogo-pag-controles').innerHTML = '';
      return;
    }

    var inicio = (CAT_PAGINA - 1) * CAT_PAGE_SIZE;
    var pagina = CATALOGO_FILTRADO.slice(inicio, inicio + CAT_PAGE_SIZE);

    tbody.innerHTML = pagina.map(function (d) {
      var prod = d.producto || {};
      var nombre = prod.nombre || 'Sin nombre';
      var codigo = d.codigo_interno || '';
      var presentacion = d.presentacion ? ' (' + d.presentacion + ')' : '';
      var precioCompra = formatCOP(parseFloat(d.precio_compra || prod.precio_compra || 0));
      var stock = parseInt(d.stock_actual || 0);
      var stockLabel = stock > 0 ? '<span class="text-emerald-500 font-medium">' + stock + '</span>' : '<span class="text-red-400">' + stock + '</span>';
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-2 px-2 cursor-pointer select-none" data-producto-id="' + (d.producto_id || '') + '"><span class="text-sm font-medium text-slate-950 dark:text-white">' + nombre + '</span><span class="text-xs text-slate-400 ml-1">' + presentacion + '</span><button class="btn-ver-img-catalogo inline-flex items-center justify-center w-6 h-6 ml-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 align-middle" title="Ver imagen"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"/></svg></button></td>' +
        '<td class="py-2 px-2 text-center text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + codigo + '</td>' +
        '<td class="py-2 px-2 text-center text-sm hidden md:table-cell">' + stockLabel + '</td>' +
        '<td class="py-2 px-2 text-right text-sm text-slate-950 dark:text-white font-medium">' + precioCompra + '</td>' +
        '<td class="py-2 px-2 text-center"><button class="btn-agregar-catalogo px-2 py-1 rounded-lg bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors" data-id="' + d.id + '">+</button></td></tr>';
    }).join('');
    renderizarPaginacionCatalogo();
    bindearBotonesCatalogo();
  }

  function renderizarPaginacionCatalogo() {
    var total = CATALOGO_FILTRADO.length;
    var paginas = Math.max(1, Math.ceil(total / CAT_PAGE_SIZE));
    if (CAT_PAGINA > paginas) CAT_PAGINA = paginas;
    var ctrl = $('catalogo-pag-controles');
    if (total === 0) { ctrl.innerHTML = ''; return; }

    var disabledPrev = CAT_PAGINA <= 1 ? ' opacity-30 pointer-events-none' : '';
    var disabledNext = CAT_PAGINA >= paginas ? ' opacity-30 pointer-events-none' : '';
    ctrl.innerHTML =
      '<button class="cat-pag-prev px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledPrev + '">Anterior</button>' +
      '<span class="text-xs text-slate-400">' + CAT_PAGINA + ' / ' + paginas + '</span>' +
      '<button class="cat-pag-next px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledNext + '">Siguiente</button>';
  }

  function bindearBotonesCatalogo() {
    $('catalogo-tbody').querySelectorAll('.btn-agregar-catalogo').forEach(function (btn) {
      btn.removeEventListener('click', onAgregarDesdeCatalogo);
      btn.addEventListener('click', onAgregarDesdeCatalogo);
    });
    var ctrl = $('catalogo-pag-controles');
    ctrl.querySelectorAll('.cat-pag-prev, .cat-pag-next').forEach(function (btn) {
      btn.removeEventListener('click', onCatPagChange);
      btn.addEventListener('click', onCatPagChange);
    });
  }

  function onCatPagChange(e) {
    if (e.target.classList.contains('cat-pag-prev') && CAT_PAGINA > 1) CAT_PAGINA--;
    if (e.target.classList.contains('cat-pag-next')) CAT_PAGINA++;
    renderizarCatalogo();
  }

  function onAgregarDesdeCatalogo(e) {
    var detalleId = e.target.dataset.id;
    var existe = DETALLE.find(function (d) { return d.producto_detalle_id === detalleId; });
    if (existe) {
      existe.cantidad = (existe.cantidad || 0) + 1;
      renderizarDetalle();
      return;
    }
    var item = CATALOGO.find(function (d) { return d.id === detalleId; });
    if (!item) return;
    var prod = item.producto || {};
    DETALLE.push({
      producto_detalle_id: detalleId,
      producto_nombre: prod.nombre || 'Sin nombre',
      _nombre: prod.nombre || 'Sin nombre',
      codigo_interno: item.codigo_interno || '',
      cantidad: 1,
      precio_unitario: parseFloat(item.precio_compra || prod.precio_compra || 0),
      descuento: 0,
      tasa_impuesto: parseFloat(prod.tasa_impuesto || 0),
      subtotal: 0,
      impuesto: 0,
      total: 0,
      cantidad_recibida: 0,
      estado_detalle: 'PENDIENTE'
    });
    renderizarDetalle();
    mostrarToast(item._nombre + ' agregado');
  }

  function renderizarDetalle() {
    var tbody = $('detalle-tbody');
    $('detalle-count').textContent = DETALLE.length + ' items';
    if (!DETALLE.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-slate-400 text-sm">Agregue productos desde el catalogo</td></tr>';
      recalcular();
      return;
    }
    var esEdicion = !!EDITANDO_ID;
    var hayPendientes = DETALLE.some(function (d) { return (parseInt(d.cantidad_recibida || 0) < parseInt(d.cantidad || 1)) && d._detalle_db_id; });
    var btnRecibirTodo = $('btn-recibir-todo');
    if (esEdicion && hayPendientes) {
      btnRecibirTodo.classList.remove('hidden');
    } else {
      btnRecibirTodo.classList.add('hidden');
    }
    tbody.innerHTML = DETALLE.map(function (d, i) {
      var nombre = d.producto_nombre || d._nombre || 'Producto #' + (i + 1);
      var codigo = d.codigo_interno || '';
      var totalConIva = (d.cantidad || 0) * (d.precio_unitario || 0) * (1 - (d.descuento || 0) / 100);
      var tasa = (d.tasa_impuesto || 0);
      d.subtotal = totalConIva / (1 + tasa);
      d.impuesto = totalConIva - d.subtotal;
      d.total = totalConIva;

      var recibi = parseInt(d.cantidad_recibida || 0);
      var totalCant = parseInt(d.cantidad || 1);
      var pendiente = totalCant - recibi;
      var recibidoHtml = '<span class="text-xs font-medium ' + (recibi >= totalCant ? 'text-emerald-500' : 'text-amber-500') + '">' + recibi + '/' + totalCant + '</span>';

      var btnRecibir = '';
      if (esEdicion && recibi < totalCant) {
        btnRecibir = '<button class="btn-recibir-item px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors" data-idx="' + i + '">Recibir</button>';
      } else if (recibi >= totalCant) {
        btnRecibir = '<span class="text-emerald-500 text-xs font-medium">Completo</span>';
      } else {
        btnRecibir = '<span class="text-slate-400 text-xs">—</span>';
      }

      return '<tr class="border-b border-slate-100 dark:border-slate-800/50">' +
        '<td class="py-2 px-2 text-sm text-slate-700 dark:text-slate-300">' + nombre + '</td>' +
        '<td class="py-2 px-2 text-center text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + codigo + '</td>' +
        '<td class="py-2 px-2"><input type="number" class="cantidad-detalle w-20 text-center input-campo py-1 text-xs" value="' + (d.cantidad || 1) + '" min="1" data-idx="' + i + '"></td>' +
        '<td class="py-2 px-2 hidden sm:table-cell"><input type="number" class="precio-detalle w-32 text-right input-campo py-1 text-xs" value="' + (d.precio_unitario || '') + '" step="1" min="0" data-idx="' + i + '" placeholder="0"></td>' +
        '<td class="py-2 px-2 hidden sm:table-cell"><input type="number" class="descuento-detalle w-20 text-right input-campo py-1 text-xs" value="' + (d.descuento || '') + '" step="1" min="0" max="100" data-idx="' + i + '" placeholder="0"></td>' +
        '<td class="py-2 px-2 hidden sm:table-cell"><span class="text-sm text-slate-500">' + Math.round((d.tasa_impuesto || 0) * 100) + '%</span></td>' +
        '<td class="py-2 px-2 text-right text-sm text-slate-950 dark:text-white font-medium hidden md:table-cell">' + formatCOP(d.total || 0) + '</td>' +
        '<td class="py-2 px-2 text-center">' + recibidoHtml + '</td>' +
        '<td class="py-2 px-2 text-center">' + btnRecibir + '</td>' +
        '<td class="py-2 px-2 text-center"><button class="btn-eliminar-detalle text-red-400 hover:text-red-600 transition-colors px-1" data-idx="' + i + '"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></td></tr>';
    }).join('');
    recalcular();
    bindearInputsDetalle();
    bindearBotonesRecibir();
  }

  function bindearInputsDetalle() {
    $('detalle-tbody').querySelectorAll('.cantidad-detalle, .precio-detalle, .descuento-detalle').forEach(function (input) {
      input.removeEventListener('input', onDetalleChange);
      input.addEventListener('input', onDetalleChange);
    });
    $('detalle-tbody').querySelectorAll('.btn-eliminar-detalle').forEach(function (btn) {
      btn.removeEventListener('click', onEliminarDetalle);
      btn.addEventListener('click', onEliminarDetalle);
    });
  }

  function bindearBotonesRecibir() {
    $('detalle-tbody').querySelectorAll('.btn-recibir-item').forEach(function (btn) {
      btn.removeEventListener('click', onRecibirItem);
      btn.addEventListener('click', onRecibirItem);
    });
  }

  function onDetalleChange(e) {
    var idx = parseInt(e.target.dataset.idx);
    var row = DETALLE[idx];
    if (!row) return;
    if (e.target.classList.contains('cantidad-detalle')) row.cantidad = parseInt(e.target.value) || 0;
    if (e.target.classList.contains('precio-detalle')) row.precio_unitario = parseFloat(e.target.value) || 0;
    if (e.target.classList.contains('descuento-detalle')) row.descuento = parseFloat(e.target.value) || 0;
    var totalConIva = (row.cantidad || 0) * (row.precio_unitario || 0) * (1 - (row.descuento || 0) / 100);
    var tasa = (row.tasa_impuesto || 0);
    row.subtotal = totalConIva / (1 + tasa);
    row.impuesto = totalConIva - row.subtotal;
    row.total = totalConIva;
    recalcular();
  }

  async function onEliminarDetalle(e) {
    var idx = parseInt(e.target.closest('button').dataset.idx);
    var item = DETALLE[idx];
    if (!item) return;
    if (item._detalle_db_id) {
      var res = await DB.comprasDetalle.eliminar(item._detalle_db_id);
      if (res.error) { mostrarToast('Error al eliminar: ' + res.error); return; }
    }
    DETALLE.splice(idx, 1);
    renderizarDetalle();
  }

  function onRecibirItem(e) {
    var idx = parseInt(e.target.dataset.idx);
    var item = DETALLE[idx];
    if (!item) return;
    var pendiente = (item.cantidad || 1) - (item.cantidad_recibida || 0);
    if (pendiente <= 0) { mostrarToast('Producto ya recibido completo'); return; }

    $('modal-recibir-info').textContent = 'Producto: ' + (item.producto_nombre || item._nombre || '');
    $('modal-recibir-pendiente').textContent = 'Pendiente por recibir: ' + pendiente;
    $('modal-recibir-cantidad').value = pendiente;
    $('modal-recibir-cantidad').max = pendiente;
    $('modal-recibir').dataset.idx = idx;
    $('modal-recibir').classList.remove('hidden');
    $('modal-recibir').classList.add('flex');
    $('modal-recibir-cantidad').focus();
  }

  async function confirmarRecepcion() {
    var idx = parseInt($('modal-recibir').dataset.idx);
    var item = DETALLE[idx];
    if (!item) { cerrarModalRecibir(); return; }

    var cantidad = parseInt($('modal-recibir-cantidad').value) || 0;
    var pendiente = (item.cantidad || 1) - (item.cantidad_recibida || 0);
    if (cantidad <= 0 || cantidad > pendiente) {
      mostrarToast('Cantidad invalida (max ' + pendiente + ')');
      return;
    }

    $('modal-recibir-confirmar').disabled = true;
    $('modal-recibir-confirmar').textContent = 'Procesando...';

    try {
      var detalleId = item._detalle_db_id;
      if (!detalleId) {
        mostrarToast('Debe guardar la compra antes de recibir');
        cerrarModalRecibir();
        return;
      }

      var user = window.KubitAuth.obtenerUsuario();
      var res = await DB.comprasDetalle.recibir(detalleId, cantidad, user ? user.id : null);
      if (res.error) {
        mostrarToast('Error: ' + res.error);
        return;
      }

      item.cantidad_recibida = (item.cantidad_recibida || 0) + cantidad;
      if (item.cantidad_recibida >= item.cantidad) {
        item.estado_detalle = 'RECIBIDO';
      }

      if (res.data && res.data.compra) {
        var compraActualizada = COMPRAS.find(function (c) { return c.id === res.data.compra.id; });
        if (compraActualizada) {
          compraActualizada.estado = res.data.compra.estado;
        }
      }

      renderizarDetalle();
      await cargarCompras();
      if (res.data && res.data.advertencias && res.data.advertencias.length) {
        mostrarToast('Recepcion registrada con advertencia: ' + res.data.advertencias[0]);
      } else {
        mostrarToast('Recepcion registrada (' + cantidad + ' unidades)');
      }
    } catch (e) {
      console.error('[Compras] Error al recibir:', e);
      mostrarToast('Error inesperado');
    }

    $('modal-recibir-confirmar').disabled = false;
    $('modal-recibir-confirmar').textContent = 'Confirmar Recepcion';
    cerrarModalRecibir();
  }

  async function onRecibirTodo() {
    var pendientes = DETALLE.filter(function (d) {
      return d._detalle_db_id && (parseInt(d.cantidad_recibida || 0) < parseInt(d.cantidad || 1));
    });
    if (!pendientes.length) { mostrarToast('No hay items pendientes'); return; }
    if (!confirm('¿Recibir todos los ' + pendientes.length + ' items pendientes?')) return;

    var user = window.KubitAuth.obtenerUsuario();
    var userId = user ? user.id : null;
    var errores = 0;
    var _advertencias = [];

    for (var i = 0; i < pendientes.length; i++) {
      var d = pendientes[i];
      var pendiente = parseInt(d.cantidad || 1) - parseInt(d.cantidad_recibida || 0);
      if (pendiente <= 0) continue;
      var res = await DB.comprasDetalle.recibir(d._detalle_db_id, pendiente, userId);
      if (res.error) {
        console.error('[Compras] Error recibir item:', d._detalle_db_id, res.error);
        errores++;
      } else {
        if (res.data && res.data.advertencias) {
          res.data.advertencias.forEach(function (a) { _advertencias.push(a); });
        }
        d.cantidad_recibida = (parseInt(d.cantidad_recibida || 0) + pendiente);
        if (d.cantidad_recibida >= d.cantidad) d.estado_detalle = 'RECIBIDO';
        if (res.data && res.data.compra) {
          var ca = COMPRAS.find(function (c) { return c.id === res.data.compra.id; });
          if (ca) ca.estado = res.data.compra.estado;
        }
      }
    }

    renderizarDetalle();
    await cargarCompras();
    if (errores) mostrarToast(errores + ' error(es) al recibir');
    else if (_advertencias.length) mostrarToast('Items recibidos con advertencia: ' + _advertencias[0]);
    else mostrarToast('Todos los items recibidos');
  }

  function cerrarModalRecibir() {
    $('modal-recibir').classList.add('hidden');
    $('modal-recibir').classList.remove('flex');
  }

  function formatCOP(val) {
    return '$' + String(Math.round(val || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function recalcular() {
    var descGlobal = parseFloat($('campo-descuento').value) || 0;
    var totalConIvaSum = 0, subtotalSum = 0, impuestoSum = 0;
    DETALLE.forEach(function (d) {
      totalConIvaSum += d.total || 0;
      subtotalSum += d.subtotal || 0;
      impuestoSum += d.impuesto || 0;
    });
    var factorDesc = (100 - descGlobal) / 100;
    $('res-subtotal').textContent = formatCOP(subtotalSum * factorDesc);
    $('res-impuesto').textContent = formatCOP(impuestoSum * factorDesc);
    $('res-total').textContent = formatCOP(totalConIvaSum * factorDesc);
  }

  function coloresEstado(estado) {
    switch (estado) {
      case 'PENDIENTE': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
      case 'CONFIRMADA': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'RECIBIENDO': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400';
      case 'RECIBIDA': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
      case 'ANULADA': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
    }
  }

  function renderizarTabla() {
    var tbody = $('compras-tbody');
    var total = COMPRAS_FILTRADAS.length;
    $('compras-count').textContent = '(' + total + ')';
    if (!total) {
      tbody.innerHTML = '';
      $('compras-empty').classList.remove('hidden');
      renderizarPaginacion();
      return;
    }
    $('compras-empty').classList.add('hidden');

    var inicio = (PAGINA - 1) * PAGE_SIZE;
    var pagina = COMPRAS_FILTRADAS.slice(inicio, inicio + PAGE_SIZE);

    tbody.innerHTML = pagina.map(function (c) {
      var prov = c.proveedor ? c.proveedor.razon_social : '—';
      var fecha = c.fecha_compra ? c.fecha_compra.slice(0, 10) : '—';
      var totalStr = formatCOP(parseFloat(c.total || 0));
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-3 px-2"><span class="text-sm font-medium text-slate-950 dark:text-white">#' + (c.numero_orden || '—') + '</span></td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400">' + prov + '</td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + fecha + '</td>' +
        '<td class="py-3 px-2 text-right text-sm text-slate-950 dark:text-white font-medium hidden md:table-cell">' + totalStr + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + coloresEstado(c.estado) + '">' + (c.estado || 'PENDIENTE') + '</span></td>' +
        '<td class="py-3 px-2 text-right"><div class="flex gap-1 justify-end">' +
        '<button class="btn-ver text-slate-400 hover:text-sky-500 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-id="' + c.id + '" aria-label="Ver detalle">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
        '</button>' +
        '<button class="btn-editar text-slate-400 hover:text-sky-500 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-id="' + c.id + '" aria-label="Editar">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>' +
        '</button>' +
        '<button class="btn-eliminar text-red-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20" data-id="' + c.id + '" aria-label="Eliminar">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>' +
        '</button>' +
        '</div></td></tr>';
    }).join('');
    renderizarPaginacion();
  }

  function renderizarPaginacion() {
    var total = COMPRAS_FILTRADAS.length;
    var paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (PAGINA > paginas) PAGINA = paginas;
    var desde = (PAGINA - 1) * PAGE_SIZE + 1;
    var hasta = Math.min(PAGINA * PAGE_SIZE, total);

    var info = $('pag-info');
    var ctrl = $('pag-controles');
    if (total === 0) {
      info.textContent = '0 resultados';
      ctrl.innerHTML = '';
      ctrl.classList.add('hidden');
      return;
    }
    ctrl.classList.remove('hidden');
    info.textContent = desde + '–' + hasta + ' de ' + total;

    var disabledPrev = PAGINA <= 1 ? ' opacity-30 pointer-events-none' : '';
    var disabledNext = PAGINA >= paginas ? ' opacity-30 pointer-events-none' : '';
    ctrl.innerHTML =
      '<button id="pag-prev" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledPrev + '">Anterior</button>' +
      '<span class="text-xs text-slate-400">' + PAGINA + ' / ' + paginas + '</span>' +
      '<button id="pag-next" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledNext + '">Siguiente</button>';
  }

  function irPagina(n) {
    var total = COMPRAS_FILTRADAS.length;
    var paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (n < 1 || n > paginas) return;
    PAGINA = n;
    renderizarTabla();
    $('compras-tbody').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function filtrarYRender() {
    var q = ($('buscador-compras').value || '').toLowerCase().trim();
    var estadoFiltro = $('filtro-estado').value;
    var proveedorFiltro = $('filtro-proveedor').value;
    COMPRAS_FILTRADAS = COMPRAS.filter(function (c) {
      var ord = String(c.numero_orden || '');
      var prov = (c.proveedor ? c.proveedor.razon_social : '') || '';
      var notas = String(c.notas || '').toLowerCase(); // Fase 38: tambien se busca por Notas (ej. ID de la plataforma)
      var matchesText = !q || ord.includes(q) || prov.toLowerCase().includes(q) || notas.includes(q);
      var matchesEstado = !estadoFiltro || c.estado === estadoFiltro;
      var matchesProveedor = !proveedorFiltro || c.proveedor_id === proveedorFiltro;
      return matchesText && matchesEstado && matchesProveedor;
    });
    PAGINA = 1;
    renderizarTabla();
  }

  function filtrarCatalogo() {
    var q = ($('catalogo-busqueda').value || '').toLowerCase().trim();
    if (!q) {
      CATALOGO_FILTRADO = CATALOGO;
    } else {
      CATALOGO_FILTRADO = CATALOGO.filter(function (d) {
        var prod = d.producto || {};
        var nombre = (prod.nombre || '').toLowerCase();
        var marca = (prod.marca || '').toLowerCase();
        var codigo = (d.codigo_interno || '').toLowerCase();
        var desc = (prod.descripcion || '').toLowerCase();
        return nombre.includes(q) || marca.includes(q) || codigo.includes(q) || desc.includes(q);
      });
    }
    CAT_PAGINA = 1;
    renderizarCatalogo();
  }

  async function cargarCompras() {
    $('compras-tbody').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Cargando...</td></tr>';
    PAGINA = 1;
    var res = await DB.compras.listar();
    if (res.error) {
      console.error('[Compras] Error:', res.error);
      $('compras-tbody').innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-400">Error al cargar compras</td></tr>';
      return;
    }
    COMPRAS = res.data || [];
    filtrarYRender();
  }

  async function limpiarFormulario() {
    EDITANDO_ID = null;
    EDITANDO_ESTADO = null;
    DETALLE = [];
    $('form-titulo').textContent = 'Nueva Orden de Compra';
    $('form-compra-id').textContent = '';
    $('campo-proveedor').value = '';
    await generarNumeroOrden();
    $('campo-estado').value = 'PENDIENTE';
    var _now = new Date();
    $('campo-fecha-compra').value = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
    $('campo-fecha-entrega').value = '';
    $('campo-notas').value = '';
    $('campo-descuento').value = '';
    renderizarDetalle();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cargarEnForm(id) {
    var c = COMPRAS.find(function (x) { return x.id === id; });
    if (!c) return;
    EDITANDO_ID = id;
    EDITANDO_ESTADO = c.estado || 'PENDIENTE';
    $('form-titulo').textContent = 'Editar Orden #' + (c.numero_orden || '');
    $('form-compra-id').textContent = c.proveedor ? c.proveedor.razon_social : '';
    $('campo-proveedor').value = c.proveedor_id || '';
    $('campo-numero-orden').value = c.numero_orden || '';
    $('campo-estado').value = c.estado || 'PENDIENTE';
    $('campo-fecha-compra').value = c.fecha_compra ? c.fecha_compra.slice(0, 10) : '';
    $('campo-fecha-entrega').value = c.fecha_entrega ? c.fecha_entrega.slice(0, 10) : '';
    $('campo-notas').value = c.notas || '';
    $('campo-descuento').value = c.descuento || '0';
    await cargarDetalleExistente(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cargarDetalleExistente(compraId) {
    var res = await DB.comprasDetalle.listarPorCompra(compraId);
    if (res.error || !res.data) { DETALLE = []; renderizarDetalle(); return; }
    DETALLE = (res.data || []).map(function (d) {
      var pd = d.producto_detalle || {};
      var prod = pd.producto || {};
      return {
        _detalle_db_id: d.id,
        producto_detalle_id: d.producto_detalle_id,
        producto_nombre: prod.nombre || '',
        _nombre: prod.nombre || '',
        codigo_interno: pd.codigo_interno || '',
        cantidad: d.cantidad || 1,
        precio_unitario: parseFloat(d.precio_unitario) || 0,
        descuento: parseFloat(d.descuento) || 0,
        tasa_impuesto: parseFloat(d.tasa_impuesto) || 0,
        subtotal: parseFloat(d.subtotal) || 0,
        impuesto: parseFloat(d.impuesto) || 0,
        total: parseFloat(d.total) || 0,
        cantidad_recibida: parseInt(d.cantidad_recibida) || 0,
        estado_detalle: d.estado_detalle || 'PENDIENTE'
      };
    });
    renderizarDetalle();
  }

  function obtenerDatosForm() {
    var user = window.KubitAuth.obtenerUsuario();
    var descGlobal = parseFloat($('campo-descuento').value) || 0;
    var totalConIvaSum = 0, subtotalSum = 0, impuestoSum = 0;
    DETALLE.forEach(function (d) {
      totalConIvaSum += d.total || 0;
      subtotalSum += d.subtotal || 0;
      impuestoSum += d.impuesto || 0;
    });
    var factorDesc = (100 - descGlobal) / 100;
    return {
      proveedor_id: $('campo-proveedor').value,
      usuario_id: user ? user.id : null,
      numero_orden: parseInt($('campo-numero-orden').value) || null,
      estado: $('campo-estado').value,
      fecha_compra: $('campo-fecha-compra').value || null,
      fecha_entrega: $('campo-fecha-entrega').value || null,
      subtotal: subtotalSum * factorDesc,
      impuesto: impuestoSum * factorDesc,
      descuento: descGlobal,
      total: totalConIvaSum * factorDesc,
      notas: $('campo-notas').value.trim() || null
    };
  }

  async function guardar() {
    if (_guardando) return;
    var prov = $('campo-proveedor').value;
    if (!prov) { mostrarToast('Debe seleccionar un proveedor'); return; }
    if (!DETALLE.length) { mostrarToast('Debe agregar al menos un producto'); return; }

    _guardando = true;
    $('btn-guardar').disabled = true;
    $('btn-guardar').textContent = 'Guardando...';

    try {
      var data = obtenerDatosForm();
      var detallesPayload = DETALLE.map(function (d) {
        return {
          producto_detalle_id: d.producto_detalle_id,
          cantidad: d.cantidad || 1,
          precio_unitario: d.precio_unitario || 0,
          descuento: d.descuento || 0,
          tasa_impuesto: d.tasa_impuesto || 0,
          subtotal: d.subtotal || 0,
          impuesto: d.impuesto || 0,
          total: d.total || 0
        };
      });

      var res;
      if (EDITANDO_ID) {
        // Proteccion de estado: recalcular desde los detalles reales para no
        // revertir recepciones ya registradas (ej. dropdown quedo en PENDIENTE)
        var _recibidos = DETALLE.filter(function (d) {
          return d._detalle_db_id && d.estado_detalle === 'RECIBIDO';
        }).length;
        var _totalDb = DETALLE.filter(function (d) { return d._detalle_db_id; }).length;
        var _estadoCalc = 'PENDIENTE';
        if (_totalDb > 0 && _recibidos === _totalDb) _estadoCalc = 'RECIBIDA';
        else if (_recibidos > 0) _estadoCalc = 'RECIBIENDO';

        var _jerarquia = { PENDIENTE: 0, CONFIRMADA: 1, RECIBIENDO: 2, RECIBIDA: 3 };
        if (data.estado === 'PENDIENTE' && (_jerarquia[_estadoCalc] || 0) > 0) {
          data.estado = _estadoCalc;
          $('campo-estado').value = _estadoCalc;
          mostrarToast('Estado ajustado a ' + _estadoCalc + ': hay items recibidos en DB');
        }

        res = await DB.compras.actualizar(EDITANDO_ID, data);
        if (res.error) { mostrarToast('Error: ' + res.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Compra'; return; }

        for (var i = 0; i < DETALLE.length; i++) {
          var d = DETALLE[i];
          if (d._detalle_db_id) {
            await DB.comprasDetalle.actualizar(d._detalle_db_id, {
              cantidad: d.cantidad,
              precio_unitario: d.precio_unitario,
              descuento: d.descuento,
              tasa_impuesto: d.tasa_impuesto,
              subtotal: d.subtotal,
              impuesto: d.impuesto,
              total: d.total
            });
          } else {
            await DB.comprasDetalle.crear({
              compra_id: EDITANDO_ID,
              producto_detalle_id: d.producto_detalle_id,
              cantidad: d.cantidad,
              precio_unitario: d.precio_unitario,
              descuento: d.descuento,
              tasa_impuesto: d.tasa_impuesto,
              subtotal: d.subtotal,
              impuesto: d.impuesto,
              total: d.total
            });
          }
        }
        if (data.estado === 'RECIBIDA') {
          var _pendItems = DETALLE.filter(function(d) {
            return d._detalle_db_id && (parseInt(d.cantidad_recibida || 0) < parseInt(d.cantidad || 1));
          });
          if (_pendItems.length) {
            var _usr = window.KubitAuth.obtenerUsuario();
            var _erroresRecibir = 0;
            for (var _p = 0; _p < _pendItems.length; _p++) {
              var _pend = parseInt(_pendItems[_p].cantidad || 1) - parseInt(_pendItems[_p].cantidad_recibida || 0);
              if (_pend > 0) {
                var _resRec = await DB.comprasDetalle.recibir(_pendItems[_p]._detalle_db_id, _pend, _usr ? _usr.id : null);
                if (_resRec.error) {
                  console.error('[Compras] Error en auto-recepcion:', _resRec.error);
                  _erroresRecibir++;
                }
              }
            }
            if (_erroresRecibir) {
              mostrarToast(_erroresRecibir + ' item(s) no pudieron recibirse: ' + 'revise la orden e intente recibirlos manualmente');
            }
          }
        }
        mostrarToast('Compra actualizada');
      } else {
        res = await DB.compras.crearConDetalles(data, detallesPayload);
        if (res.error) { mostrarToast('Error: ' + res.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Compra'; return; }
        mostrarToast('Compra #' + (data.numero_orden || '') + ' creada');

        if (res.data && res.data.id) {
          for (var j = 0; j < DETALLE.length; j++) {
            DETALLE[j]._detalle_db_id = null;
          }
        }
      }

      await limpiarFormulario();
      await cargarCompras();
    } catch (e) {
      console.error('[Compras] Error guardar:', e);
      mostrarToast('Error inesperado');
    }

    _guardando = false;
    $('btn-guardar').disabled = false;
    $('btn-guardar').textContent = 'Guardar Compra';
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta orden de compra?')) return;
    var r = await DB.compras.eliminar(id);
    if (r.error) { mostrarToast('Error: ' + r.error); return; }
    mostrarToast('Compra eliminada');
    if (EDITANDO_ID === id) await limpiarFormulario();
    await cargarCompras();
  }

  async function verDetalle(id) {
    var c = COMPRAS.find(function (x) { return x.id === id; });
    if (!c) { mostrarToast('Compra no encontrada'); return; }
    $('det-orden').textContent = '#' + (c.numero_orden || '—');
    var estado = c.estado || 'PENDIENTE';
    var badge = $('det-estado');
    badge.textContent = estado;
    badge.className = 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium ' + coloresEstado(estado);
    var prov = c.proveedor || {};
    $('det-proveedor').textContent = prov.razon_social || '—';
    var contactoHtml = '';
    if (prov.persona_contacto) contactoHtml += prov.persona_contacto;
    if (prov.telefono || prov.celular) {
      if (contactoHtml) contactoHtml += ' &middot; ';
      contactoHtml += prov.telefono || prov.celular;
    }
    $('det-proveedor-contacto').innerHTML = contactoHtml || '';
    $('det-fecha-compra').textContent = c.fecha_compra ? c.fecha_compra.slice(0, 10) : '—';
    $('det-fecha-entrega').textContent = c.fecha_entrega ? c.fecha_entrega.slice(0, 10) : '—';
    $('det-subtotal').textContent = formatCOP(parseFloat(c.subtotal || 0));
    $('det-impuesto').textContent = formatCOP(parseFloat(c.impuesto || 0));
    $('det-total').textContent = formatCOP(parseFloat(c.total || 0));
    var notasContainer = $('det-notas-container');
    var notasEl = $('det-notas');
    if (c.notas) {
      notasEl.textContent = c.notas;
      notasContainer.classList.remove('hidden');
    } else {
      notasContainer.classList.add('hidden');
    }
    var res = await DB.comprasDetalle.listarPorCompra(id);
    var items = res.data || [];
    var tbody = $('det-items-tbody');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400 text-sm">Sin productos</td></tr>';
    } else {
      tbody.innerHTML = items.map(function (d) {
        var pd = d.producto_detalle || {};
        var prod = pd.producto || {};
        var nombre = prod.nombre || 'Producto';
        var codigo = pd.codigo_interno || '';
        var pu = formatCOP(parseFloat(d.precio_unitario || 0));
        var total = formatCOP(parseFloat(d.total || 0));
        var dto = parseFloat(d.descuento || 0) > 0 ? parseFloat(d.descuento) + '%' : '—';
        var iva = parseFloat(d.tasa_impuesto || 0) > 0 ? Math.round(parseFloat(d.tasa_impuesto) * 100) + '%' : '—';
        return '<tr class="border-b border-slate-100 dark:border-slate-800/50">' +
          '<td class="py-2 px-2 text-sm text-slate-700 dark:text-slate-300">' + nombre + '</td>' +
          '<td class="py-2 px-2 text-center text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + codigo + '</td>' +
          '<td class="py-2 px-2 text-center text-sm text-slate-950 dark:text-white font-medium">' + (d.cantidad || 0) + '</td>' +
          '<td class="py-2 px-2 text-right text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + pu + '</td>' +
          '<td class="py-2 px-2 text-right text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + dto + '</td>' +
          '<td class="py-2 px-2 text-right text-sm text-slate-500 dark:text-slate-400 hidden md:table-cell">' + iva + '</td>' +
          '<td class="py-2 px-2 text-right text-sm text-slate-950 dark:text-white font-medium">' + total + '</td></tr>';
      }).join('');
    }
    $('modal-detalle').classList.remove('hidden');
    $('modal-detalle').classList.add('flex');
  }

  function cerrarDetalle() {
    $('modal-detalle').classList.add('hidden');
    $('modal-detalle').classList.remove('flex');
  }

  function toggleSidebar() {
    var sidebar = $('sidebar');
    var overlay = $('sidebar-overlay');
    var abierto = sidebar.classList.contains('translate-x-0');
    if (abierto) {
      sidebar.classList.remove('translate-x-0');
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    } else {
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
      overlay.classList.remove('hidden');
    }
  }

  function abrirModalImagenProducto(productoId, nombre) {
    $('modal-prod-img-nombre').textContent = nombre || 'Producto';
    $('modal-prod-img-loading').classList.remove('hidden');
    $('modal-prod-img-content').classList.add('hidden');
    $('modal-prod-img-empty').classList.add('hidden');
    $('modal-producto-imagen').classList.remove('hidden');
    $('modal-producto-imagen').classList.add('flex');

    DB.productosMultimedia.listar(productoId).then(function (res) {
      $('modal-prod-img-loading').classList.add('hidden');
      var imagenes = (res.data || []).filter(function (m) { return m.tipo === 'imagen' && m.url; });
      if (imagenes.length) {
        $('modal-prod-img').src = imagenes[0].url;
        $('modal-prod-img').alt = imagenes[0].alt_text || nombre;
        $('modal-prod-img-alt').textContent = imagenes[0].alt_text || '';
        $('modal-prod-img-content').classList.remove('hidden');
      } else {
        $('modal-prod-img-empty').classList.remove('hidden');
      }
    }).catch(function () {
      $('modal-prod-img-loading').classList.add('hidden');
      $('modal-prod-img-empty').classList.remove('hidden');
    });
  }

  function cerrarModalImagenProducto() {
    $('modal-producto-imagen').classList.add('hidden');
    $('modal-producto-imagen').classList.remove('flex');
    $('modal-prod-img-loading').classList.add('hidden');
    $('modal-prod-img-content').classList.add('hidden');
    $('modal-prod-img-empty').classList.add('hidden');
    $('modal-prod-img').src = '';
  }

  function bindearEventos() {
    $('btn-dark').addEventListener('click', function () {
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });

    $('btn-menu').addEventListener('click', toggleSidebar);
    $('btn-cerrar-menu').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', toggleSidebar);

    $('btn-guardar').addEventListener('click', guardar);
    $('btn-limpiar-form').addEventListener('click', limpiarFormulario);
    $('buscador-compras').addEventListener('input', filtrarYRender);
    $('filtro-proveedor').addEventListener('change', filtrarYRender);
    $('filtro-estado').addEventListener('change', filtrarYRender);
    $('catalogo-busqueda').addEventListener('input', filtrarCatalogo);
    $('campo-descuento').addEventListener('input', recalcular);

    $('pag-controles').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'pag-prev') irPagina(PAGINA - 1);
      if (btn.id === 'pag-next') irPagina(PAGINA + 1);
    });

    $('compras-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('btn-ver')) verDetalle(btn.dataset.id);
      if (btn.classList.contains('btn-editar')) cargarEnForm(btn.dataset.id);
      if (btn.classList.contains('btn-eliminar')) eliminar(btn.dataset.id);
    });

    $('btn-recibir-todo').addEventListener('click', onRecibirTodo);
    $('modal-recibir-cancelar').addEventListener('click', cerrarModalRecibir);
    $('modal-recibir-confirmar').addEventListener('click', confirmarRecepcion);
    $('modal-recibir').addEventListener('click', function (e) {
      if (e.target === this) cerrarModalRecibir();
    });
    $('modal-recibir-cantidad').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmarRecepcion();
      if (e.key === 'Escape') cerrarModalRecibir();
    });

    $('btn-cerrar-detalle').addEventListener('click', cerrarDetalle);
    $('btn-cerrar-detalle-2').addEventListener('click', cerrarDetalle);
    $('modal-detalle').addEventListener('click', function (e) {
      if (e.target === this) cerrarDetalle();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal-detalle').classList.contains('hidden')) cerrarDetalle();
    });

    // Imagen producto modal
    $('catalogo-tbody').addEventListener('dblclick', function (e) {
      var td = e.target.closest('td[data-producto-id]');
      if (td) {
        var nombre = td.querySelector('span:first-child').textContent;
        abrirModalImagenProducto(td.dataset.productoId, nombre);
      }
    });
    $('catalogo-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-ver-img-catalogo');
      if (!btn) return;
      var td = btn.closest('td[data-producto-id]');
      if (td) {
        var nombre = td.querySelector('span:first-child').textContent;
        abrirModalImagenProducto(td.dataset.productoId, nombre);
      }
    });
    $('btn-cerrar-prod-img').addEventListener('click', cerrarModalImagenProducto);
    $('modal-producto-imagen').addEventListener('click', function (e) {
      if (e.target === this) cerrarModalImagenProducto();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal-producto-imagen').classList.contains('hidden')) cerrarModalImagenProducto();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();