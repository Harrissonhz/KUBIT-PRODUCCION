(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    bindearEventos();
    await cargarFinanzas();
    await cargarVentas();
    await cargarInventario();
  }

  async function cargarFinanzas() {
    var tbody = $('finanzas-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-slate-400">Cargando...</td></tr>';

    var res = await DB.finanzasMensuales.listar();
    var datos = res.data || [];

    if (res.error || !datos.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center py-10 text-slate-400">' + (res.error ? 'Error al cargar' : 'No hay datos financieros') + '</td></tr>';
      return;
    }

    var formatoCOP = window.formatCOP || function (val) { return '$' + Number(val).toLocaleString('es-CO'); };
    var ultimo = datos[datos.length - 1] || {};

    $('resumen-ventas-netas').textContent = formatoCOP(ultimo.ventas_netas || 0);
    $('resumen-utilidad-bruta').textContent = formatoCOP(ultimo.utilidad_bruta || 0);
    $('resumen-gastos').textContent = formatoCOP(ultimo.gastos_operativos_total || 0);
    $('resumen-utilidad-neta').textContent = formatoCOP(ultimo.utilidad_neta || 0);

    tbody.innerHTML = datos.map(function (f) {
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-3 px-3 text-sm font-medium text-slate-950 dark:text-white">' + f.anio + '-' + String(f.mes).padStart(2, '0') + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300">' + formatoCOP(f.ventas_brutas) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300 hidden sm:table-cell">' + formatoCOP(f.devoluciones) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300 hidden sm:table-cell">' + formatoCOP(f.descuentos) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right font-medium text-slate-950 dark:text-white">' + formatoCOP(f.ventas_netas) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300 hidden md:table-cell">' + formatoCOP(f.costo_mercaderia_vendida) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right font-medium text-emerald-600 hidden md:table-cell">' + formatoCOP(f.utilidad_bruta) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300 hidden lg:table-cell">' + formatoCOP(f.gastos_operativos_total) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right text-slate-600 dark:text-slate-300 hidden lg:table-cell">' + formatoCOP(f.inversion_marketing) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right font-medium text-slate-950 dark:text-white">' + formatoCOP(f.utilidad_neta) + '</td>' +
        '<td class="py-3 px-3 text-sm text-right font-medium text-indigo-600 hidden lg:table-cell">' + (f.roi_calculado != null ? f.roi_calculado + '%' : '\u2014') + '</td>' +
        '</tr>';
    }).join('');

    $('finanzas-pag-info').textContent = datos.length + ' registros';
  }

  async function cargarVentas() {
    $('ventas-hoy').textContent = '$0';
    $('ventas-semana').textContent = '$0';
    $('ventas-mes').textContent = '$0';
    $('top-productos-lista').innerHTML = '<div class="text-center py-10 text-slate-400 text-sm">Conecta a DB para ver top productos</div>';

    var res = await DB.ventas.listarRecientes();
    if (res.error || !res.data || !res.data.length) return;

    var formatoCOP = window.formatCOP || function (val) { return '$' + Number(val).toLocaleString('es-CO'); };
    var hoy = new Date();
    var inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    var inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    var totalHoy = 0, cantHoy = 0, totalSemana = 0, cantSemana = 0, totalMes = 0, cantMes = 0;

    res.data.forEach(function (v) {
      var t = parseFloat(v.total) || 0;
      var f = v.created_at ? new Date(v.created_at) : null;
      if (f && f >= inicioHoy) { totalHoy += t; cantHoy++; }
      if (f && f >= inicioSemana) { totalSemana += t; cantSemana++; }
      if (f && f >= inicioMes) { totalMes += t; cantMes++; }
    });

    $('ventas-hoy').textContent = formatoCOP(totalHoy);
    $('ventas-hoy-cant').textContent = cantHoy + ' transacciones';
    $('ventas-semana').textContent = formatoCOP(totalSemana);
    $('ventas-semana-cant').textContent = cantSemana + ' transacciones';
    $('ventas-mes').textContent = formatoCOP(totalMes);
    $('ventas-mes-cant').textContent = cantMes + ' transacciones';
  }

  async function cargarInventario() {
    var [res, resDigitales] = await Promise.all([
      DB.productos.listarConDetalle(),
      // Fase 36: los productos digitales no son mercancia fisica y se excluyen del inventario
      DB.select('pos_productos', { select: 'id', filters: [{ col: 'tipo_producto', val: 'Digital' }] })
    ]);
    if (res.error || !res.data) return;

    var idsDigital = {};
    (resDigitales.data || []).forEach(function (p) { idsDigital[p.id] = true; });
    var datos = res.data.filter(function (d) { return !idsDigital[d.producto_id]; });
    var totalItems = datos.length;
    var stockBajo = 0;
    var sinStock = 0;
    var valorTotal = 0;
    var alertas = [];

    datos.forEach(function (d) {
      var stock = parseInt(d.stock_actual) || 0;
      var pv = parseFloat(d.precio_venta) || 0;
      // Fase 37: misma regla que el Panel: agotado = stock <= 0; stock bajo = stock <= minimo del SKU (2 si no tiene)
      var minimo = d.stock_min || 2;
      if (stock <= 0) { sinStock++; alertas.push(d); }
      else if (stock <= minimo) { stockBajo++; alertas.push(d); }
      if (stock > 0) valorTotal += stock * pv; // Fase 36: Valor Inventario PVP (solo stock positivo)
    });

    var formatoCOP = window.formatCOP || function (val) { return '$' + Number(val).toLocaleString('es-CO'); };

    // Si no se pudo leer la lista de digitales, no se muestran numeros que podrian ser incorrectos
    var sinDigitales = !!resDigitales.error;
    $('inv-total').textContent = sinDigitales ? '---' : totalItems;
    $('inv-stock-bajo').textContent = sinDigitales ? '---' : stockBajo;
    $('inv-sin-stock').textContent = sinDigitales ? '---' : sinStock;
    $('inv-valor').textContent = sinDigitales ? '---' : formatoCOP(Math.round(valorTotal));

    var tbody = $('alertas-inventario-tbody');
    if (!tbody) return;

    if (!alertas.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-400">No hay alertas de inventario</td></tr>';
      return;
    }

    tbody.innerHTML = alertas.map(function (d) {
      var stock = parseInt(d.stock_actual) || 0;
      var estado = stock <= 0
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400">Agotado</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">Stock Bajo</span>';
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-3 px-4 text-sm font-medium text-slate-950 dark:text-white">' + (d.nombre || 'Sin nombre') + '</td>' +
        '<td class="py-3 px-4 text-sm text-right text-slate-600 dark:text-slate-300 hidden sm:table-cell font-mono">' + (d.sku || '-') + '</td>' +
        '<td class="py-3 px-4 text-sm text-right text-slate-600 dark:text-slate-300">' + stock + '</td>' +
        '<td class="py-3 px-4 text-sm text-right text-slate-600 dark:text-slate-300 hidden sm:table-cell">' + (d.stock_minimo || 0) + '</td>' +
        '<td class="py-3 px-4 text-sm text-right">' + estado + '</td>' +
        '</tr>';
    }).join('');
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

  function bindearEventos() {
    $('btn-dark').addEventListener('click', function () {
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });

    $('btn-menu').addEventListener('click', toggleSidebar);
    $('btn-cerrar-menu').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', toggleSidebar);

    var tabContainer = document.querySelector('.reportes-tabs');
    if (tabContainer) {
      tabContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-tab]');
        if (!btn) return;
        var tab = btn.dataset.tab;

        document.querySelectorAll('.tab-content').forEach(function (el) {
          el.classList.add('hidden');
        });
        var target = document.getElementById('tab-' + tab);
        if (target) target.classList.remove('hidden');

        tabContainer.querySelectorAll('button').forEach(function (b) {
          b.classList.remove('bg-slate-950', 'dark:bg-white', 'text-white', 'dark:text-slate-950');
          b.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
        });
        btn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:bg-slate-100', 'dark:hover:bg-slate-800');
        btn.classList.add('bg-slate-950', 'dark:bg-white', 'text-white', 'dark:text-slate-950');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();