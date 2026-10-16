(function () {
  'use strict';

  var VENTAS = [];
  var CANALES = [];
  var PAGE_SIZE = 15;
  var PAGINA = 1;
  var VENTA_ACTUAL = null;

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  /* ─── INIT ─── */
  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    await cargarCanales();
    bindearEventos();
    await cargarVentas();
  }

  /* ─── CANALES ─── */
  async function cargarCanales() {
    try {
      var data = await window.__supabase.get('pos_canales_venta?select=*&order=nombre.asc');
      CANALES = data || [];
      var sel = $('filtro-canal');
      CANALES.forEach(function (c) {
        sel.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
    } catch (e) {
      console.error('[Historial] Error canales:', e);
    }
  }

  /* ─── VENTAS ─── */
  function mostrarErrorTabla(msg) {
    var tbody = $('ventas-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10"><div class="flex flex-col items-center gap-2"><svg class="w-8 h-8 text-red-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg><p class="text-sm text-slate-400">' + msg + '</p></div></td></tr>';
  }

  async function cargarVentas() {
    PAGINA = 1;
    await cargarPagina(1);
  }

  async function cargarPagina(pagina) {
    $('ventas-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Cargando...</td></tr>';

    var q = ($('buscador-ventas').value || '').trim();
    var estado = $('filtro-estado').value;
    var canalId = $('filtro-canal').value;
    var desde = $('filtro-desde').value;
    var hasta = $('filtro-hasta').value;

    var opts = {
      page: pagina,
      pageSize: PAGE_SIZE,
      search: q || null,
      estado: estado || null,
      canalId: canalId || null,
      desde: desde ? desde + 'T00:00:00' : null,
      hasta: hasta ? hasta + 'T23:59:59' : null
    };

    var res = await DB.ventas.listar(opts);
    if (res.error) {
      console.error('[Historial] Error:', res.error);
      mostrarErrorTabla('Error al cargar ventas. Verifica tu conexion.');
      return;
    }

    VENTAS = res.data || [];
    PAGINA = pagina;
    renderizarTabla(res.total || VENTAS.length);
  }

  function renderizarTabla(totalRegistros) {
    var tbody = $('ventas-tbody');
    var total = VENTAS.length;
    $('ventas-count').textContent = '(' + (totalRegistros || total) + ')';

    if (!total) {
      tbody.innerHTML = '';
      $('ventas-empty').classList.remove('hidden');
      renderizarPaginacion(totalRegistros || 0);
      return;
    }
    $('ventas-empty').classList.add('hidden');

    tbody.innerHTML = VENTAS.map(function (v) {
      var cliente = '';
      if (v.cliente) {
        cliente = [v.cliente.primer_nombre, v.cliente.primer_apellido].filter(Boolean).join(' ');
      }
      var canalNombre = v.canal ? v.canal.nombre : '—';
      var fecha = v.fecha_venta ? formatearFecha(v.fecha_venta) : '—';
      var badgeCls = estadoBadge(v.estado);
      var ref = v.referencia_externa || '';
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer btn-ver-detalle" data-id="' + v.id + '">' +
        '<td class="py-3 px-2"><div><span class="text-sm font-medium text-slate-950 dark:text-white">' + escaparHTML(v.numero_venta || '—') + '</span>' +
        (ref ? '<p class="text-xs text-slate-400">' + escaparHTML(ref) + '</p>' : '') + '</div></td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + (cliente || '—') + '</td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400 hidden md:table-cell">' + canalNombre + '</td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">' + fecha + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + badgeCls + '">' + v.estado + '</span></td>' +
        '<td class="py-3 px-2 text-right text-sm font-medium text-slate-950 dark:text-white">' + formatearMoneda(v.total) + '</td>' +
        '<td class="py-3 px-2 text-right"><button class="btn-ver-detalle text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-id="' + v.id + '" aria-label="Ver detalle">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
        '</button></td>' +
        '</tr>';
    }).join('');
    renderizarPaginacion(totalRegistros || total);
  }

  function renderizarPaginacion(total) {
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
    if (n < 1) return;
    cargarPagina(n);
  }

  /* ─── DETALLE ─── */
  async function abrirDetalle(ventaId) {
    var res = await DB.ventas.obtener(ventaId);
    if (res.error || !res.data) {
      mostrarToast('Error al cargar detalle de la venta');
      return;
    }
    VENTA_ACTUAL = res.data;
    var v = res.data;

    $('modal-titulo').textContent = v.numero_venta || 'Venta';
    $('modal-subtitulo').textContent = v.fecha_venta ? formatearFecha(v.fecha_venta) : '';

    var cliente = '';
    if (v.cliente) {
      cliente = [v.cliente.primer_nombre, v.cliente.segundo_nombre, v.cliente.primer_apellido, v.cliente.segundo_apellido].filter(Boolean).join(' ');
    }
    $('det-cliente').textContent = cliente || '—';
    $('det-vendedor').textContent = v.usuario ? v.usuario.nombre_completo : '—';
    $('det-canal').textContent = v.canal ? v.canal.nombre : '—';
    $('det-metodo').textContent = v.metodo_pago || '—';
    $('det-referencia').textContent = v.referencia_externa || '—';

    var badgeCls = estadoBadge(v.estado);
    $('det-estado').className = 'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + badgeCls;
    $('det-estado').textContent = v.estado;

    // Productos
    var detProd = $('det-productos');
    if (v.detalles && v.detalles.length) {
      detProd.innerHTML = v.detalles.map(function (d) {
        var prodName = 'Producto';
        var codigo = '';
        if (d.detalle && d.detalle.producto) {
          prodName = d.detalle.producto.nombre;
          codigo = d.detalle.codigo_interno || '';
        } else if (d.detalle) {
          prodName = d.detalle.codigo_interno || d.producto_detalle_id;
        }
        return '<div class="flex items-center justify-between text-sm py-1.5 gap-4">' +
          (codigo ? '<span class="text-xs text-slate-400 font-mono shrink-0 w-20 truncate">' + escaparHTML(codigo) + '</span>' : '') +
          '<span class="text-slate-900 dark:text-slate-100 font-medium truncate min-w-0 flex-1">' + escaparHTML(prodName) + '</span>' +
          '<span class="text-slate-400 whitespace-nowrap shrink-0">' + d.cantidad + ' und.</span>' +
          '<span class="text-slate-400 whitespace-nowrap shrink-0 w-24 text-right">' + formatearMoneda(d.precio_unitario) + '</span>' +
          '<span class="text-slate-950 dark:text-white font-medium whitespace-nowrap shrink-0 w-28 text-right">' + formatearMoneda(d.total) + '</span>' +
          '</div>';
      }).join('');
    } else {
      detProd.innerHTML = '<p class="text-sm text-slate-400">Sin detalle</p>';
    }

    // Totales
    $('det-subtotal').textContent = formatearMoneda(v.subtotal);
    $('det-descuento').textContent = formatearMoneda(v.descuento || 0);
    $('det-impuesto').textContent = formatearMoneda(v.impuesto || 0);

    var totalCostos = (v.costo_cargo_venta || 0) + (v.costo_impuestos || 0) + (v.costo_envios || 0);
    if (totalCostos > 0) {
      $('det-costos-section').classList.remove('hidden');
      $('det-costo-cargo').textContent = formatearMoneda(v.costo_cargo_venta || 0);
      $('det-costo-impuestos').textContent = formatearMoneda(v.costo_impuestos || 0);
      $('det-costo-envios').textContent = formatearMoneda(v.costo_envios || 0);
      $('det-total-costos').textContent = formatearMoneda(totalCostos);
    } else {
      $('det-costos-section').classList.add('hidden');
    }

    $('det-total').textContent = formatearMoneda(v.total);
    var ingresoNeto = v.total - totalCostos;
    if (totalCostos > 0) {
      $('det-ingreso-neto-section').classList.remove('hidden');
      $('det-ingreso-neto').textContent = formatearMoneda(ingresoNeto);
    } else {
      $('det-ingreso-neto-section').classList.add('hidden');
    }

    // Botones
    var btnAnular = $('btn-anular-venta');
    var btnEditar = $('btn-editar-venta');
    var editable = v.estado === 'CONFIRMADA' || v.estado === 'PENDIENTE';
    btnAnular.disabled = !editable;
    btnEditar.disabled = !editable;

    $('modal-detalle').classList.remove('hidden');
  }

  /* ─── EDITAR ─── */
  function editarVenta() {
    if (!VENTA_ACTUAL) return;
    if (VENTA_ACTUAL.estado !== 'CONFIRMADA' && VENTA_ACTUAL.estado !== 'PENDIENTE') {
      mostrarToast('Solo se pueden editar ventas CONFIRMADAS o PENDIENTES');
      return;
    }
    sessionStorage.setItem('kubit_editar_venta', JSON.stringify(VENTA_ACTUAL));
    window.location.href = 'ventas.html?editar=' + VENTA_ACTUAL.id;
  }

  function cerrarDetalle() {
    $('modal-detalle').classList.add('hidden');
    VENTA_ACTUAL = null;
  }
  window.cerrarDetalle = cerrarDetalle; // expuesta para onclick

  /* ─── ANULAR ─── */
  async function anularVenta() {
    if (!VENTA_ACTUAL) return;
    if (!confirm('¿Anular la venta ' + VENTA_ACTUAL.numero_venta + '?\nSe devolvera el stock de sus productos y se revertiran las finanzas del mes.\nEsta accion no se puede deshacer.')) return;

    // Fase 30: anular con politica estricta (devuelve stock con movimiento y revierte finanzas)
    var btn = $('btn-anular-venta');
    var textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Anulando...';
    var user = window.KubitAuth.obtenerUsuario();
    var res = await DB.ventas.anularConRevertir(VENTA_ACTUAL.id, { usuarioId: user ? user.id : null });
    btn.textContent = textoOriginal;
    if (res.error) {
      btn.disabled = false;
      mostrarToast('Error al anular: ' + res.error, 'error');
      return;
    }
    var adv = (res.data && res.data.advertencias) || [];
    if (adv.length) {
      mostrarToast('Venta anulada con advertencias: ' + adv.join(' | '), 'info');
    } else {
      mostrarToast('Venta anulada. Stock devuelto correctamente', 'success');
    }
    cerrarDetalle();
    await cargarVentas();
  }

  /* ─── UTILITY ─── */
  function formatearMoneda(valor) {
    return '$' + Number(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatearFecha(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escaparHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function estadoBadge(estado) {
    switch (estado) {
      case 'CONFIRMADA': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
      case 'PENDIENTE': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
      case 'FACTURADA': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
      case 'ANULADA': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
    }
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

  /* ─── FILTROS (debounced) ─── */
  var _filtroTimer = null;
  function aplicarFiltros() {
    clearTimeout(_filtroTimer);
    _filtroTimer = setTimeout(function () { cargarVentas(); }, 300);
  }

  /* ─── EVENTOS ─── */
  function bindearEventos() {
    $('btn-dark').addEventListener('click', function () {
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });

    $('btn-menu').addEventListener('click', toggleSidebar);
    $('btn-cerrar-menu').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', toggleSidebar);

    $('buscador-ventas').addEventListener('input', aplicarFiltros);
    $('filtro-estado').addEventListener('change', aplicarFiltros);
    $('filtro-canal').addEventListener('change', aplicarFiltros);
    $('filtro-desde').addEventListener('change', aplicarFiltros);
    $('filtro-hasta').addEventListener('change', aplicarFiltros);

    $('pag-controles').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'pag-prev') irPagina(PAGINA - 1);
      if (btn.id === 'pag-next') irPagina(PAGINA + 1);
    });

    $('ventas-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-ver-detalle');
      if (btn) abrirDetalle(btn.dataset.id);
    });

    $('btn-editar-venta').addEventListener('click', editarVenta);
    $('btn-anular-venta').addEventListener('click', anularVenta);
    $('btn-imprimir-venta').addEventListener('click', function () {
      if (!VENTA_ACTUAL) return;
      window.open('factura-print?id=' + VENTA_ACTUAL.id, '_blank');
    });
    $('btn-cuenta-cobro').addEventListener('click', function () {
      if (!VENTA_ACTUAL) return;
      window.open('cuenta-cobro-print?id=' + VENTA_ACTUAL.id, '_blank');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
