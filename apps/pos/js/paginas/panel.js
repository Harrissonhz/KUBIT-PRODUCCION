(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;
  var chartVentas = null;
  var chartComparativa = null;
  var chartIngresosVsGastos = null;
  var chartTendencia = null;

  function formatCOP(val) {
    if (val == null || isNaN(val)) return '$0';
    return '$' + Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function getFiltros() {
    return {
      canalId: $('filtro-canal') ? $('filtro-canal').value : '',
      mes: parseInt($('filtro-mes') ? $('filtro-mes').value : (new Date().getMonth() + 1)),
      anio: parseInt($('filtro-anio') ? $('filtro-anio').value : new Date().getFullYear())
    };
  }

  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    $('panel-subtitulo').textContent = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    await cargarCanales();
    poblarSelectores();
    bindearFiltros();
    await cargarTodo();
  }

  async function cargarCanales() {
    var res = await DB.select('pos_canales_venta', {
      select: 'id,nombre',
      filters: [{ col: 'activo', val: true }],
      orderBy: 'nombre'
    });
    var select = $('filtro-canal');
    if (!select) return;
    select.innerHTML = '<option value="">Todos los canales</option>';
    (res.data || []).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });
  }

  function poblarSelectores() {
    var anioAct = new Date().getFullYear();
    var mesAct = new Date().getMonth() + 1;
    var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    var selMes = $('filtro-mes');
    if (selMes) {
      selMes.innerHTML = '';
      meses.forEach(function (n, i) {
        var opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = n;
        if (i + 1 === mesAct) opt.selected = true;
        selMes.appendChild(opt);
      });
    }

    [['filtro-anio', anioAct], ['chart-anio', anioAct], ['ivg-anio', anioAct], ['comp-anio1', anioAct - 1], ['comp-anio2', anioAct]].forEach(function (pair) {
      var sel = $(pair[0]);
      if (!sel) return;
      sel.innerHTML = '';
      for (var a = anioAct + 1; a >= 2023; a--) {
        var opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        if (a === pair[1]) opt.selected = true;
        sel.appendChild(opt);
      }
    });
  }

  function bindearFiltros() {
    ['filtro-canal', 'filtro-mes', 'filtro-anio'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', cargarTodo);
    });
    var btn = $('btn-actualizar');
    if (btn) btn.addEventListener('click', cargarTodo);

    var chartAnio = $('chart-anio');
    if (chartAnio) chartAnio.addEventListener('change', function () {
      if (chartVentas) { chartVentas.destroy(); chartVentas = null; }
      cargarVentasMensuales();
    });

    var ivgAnio = $('ivg-anio');
    if (ivgAnio) ivgAnio.addEventListener('change', function () {
      if (chartIngresosVsGastos) { chartIngresosVsGastos.destroy(); chartIngresosVsGastos = null; }
      cargarIngresosVsGastos();
    });

    ['comp-anio1', 'comp-anio2'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () {
        if (chartComparativa) { chartComparativa.destroy(); chartComparativa = null; }
        cargarComparativaAnual();
      });
    });
  }

  async function cargarTodo() {
    await Promise.all([
      cargarKpisMes(),
      cargarKpisOperativos(),
      cargarTopProductos(),
      cargarVentasMensuales(),
      cargarComparativaAnual(),
      cargarIngresosVsGastos(),
      cargarTendencia(),
      cargarKpisTotales()
    ]);
  }

  async function cargarKpisMes() {
    var f = getFiltros();
    var ventasBrutas = 0, comisiones = 0, gastos = 0, utilidadNeta = 0, compras = 0;
    var devoluciones = 0, descuentos = 0, ticketProm = 0, countVentas = 0;

    if (!f.canalId) {
      var res = await DB.finanzasMensuales.obtenerPorPeriodo(f.anio, f.mes);
      if (!res.error && res.data) {
        var d = res.data;
        ventasBrutas = d.ventas_brutas || d.ventas_netas || 0;
        devoluciones = d.devoluciones || 0;
        descuentos = d.descuentos || 0;
        comisiones = d.costos_comision_total || 0;
        gastos = await DB.gastos.totalDelMes(f.anio, f.mes);
        compras = await DB.compras.totalDelMes(f.anio, f.mes);
      }
      var estGlobal = await DB.ventas.estadisticasDelPeriodo(f.anio, f.mes);
      countVentas = estGlobal.count || 0;
    } else {
      var est = await DB.ventas.estadisticasDelPeriodo(f.anio, f.mes, f.canalId);
      ventasBrutas = est.total || 0;
      comisiones = est.costos || 0;
      countVentas = est.count || 0;
      gastos = await DB.gastos.totalDelMes(f.anio, f.mes);
      compras = await DB.compras.totalDelMes(f.anio, f.mes);
    }

    var ventasNetas = ventasBrutas - comisiones - devoluciones - descuentos;
    utilidadNeta = ventasBrutas - comisiones - devoluciones - descuentos - gastos - compras;
    var margen = ventasBrutas > 0 ? Math.round((utilidadNeta / ventasBrutas) * 100) : 0;
    ticketProm = countVentas > 0 ? ventasBrutas / countVentas : 0;

    $('kpi-mes-ventas').textContent = formatCOP(ventasBrutas);
    $('kpi-mes-ventas-netas').textContent = formatCOP(ventasNetas);
    $('kpi-mes-compras').textContent = formatCOP(compras);
    $('kpi-mes-comisiones').textContent = formatCOP(comisiones);
    $('kpi-mes-gastos').textContent = formatCOP(gastos);
    $('kpi-mes-utilidad').textContent = formatCOP(utilidadNeta);
    $('kpi-mes-margen').textContent = margen + '%';
    $('kpi-mes-ticket').textContent = formatCOP(ticketProm);
  }

  async function cargarKpisOperativos() {
    var [estHoy, resProductos, prodHoy, resDigitales] = await Promise.all([
      DB.ventas.estadisticasHoy(),
      DB.productos.listarConDetalle({ skipCache: true }),
      DB.ventas.productosVendidosHoy(),
      // Fase 35: los productos digitales no son mercancia fisica y se excluyen de los indicadores de inventario
      DB.select('pos_productos', { select: 'id', filters: [{ col: 'tipo_producto', val: 'Digital' }] })
    ]);

    $('kpi-op-ventas-hoy').textContent = estHoy.count || 0;
    $('kpi-op-total-hoy').textContent = formatCOP(estHoy.total || 0);
    $('kpi-op-ticket-prom').textContent = formatCOP(estHoy.promedio || 0);

    var totalSku = 0, stockBajo = 0, agotados = 0, valorInventario = 0;
    var idsDigital = {};
    (resDigitales.data || []).forEach(function (p) { idsDigital[p.id] = true; });
    if (resProductos.data) {
      resProductos.data.forEach(function (d) {
        if (idsDigital[d.producto_id]) return; // Fase 35: sin productos digitales
        totalSku++; // Fase 37: el total cuenta SKU (cada variante), igual que Stock Bajo y Agotados
        var stock = d.stock_actual != null ? d.stock_actual : 0;
        if (stock <= 0) {
          agotados++;
        } else if (stock <= (d.stock_min || 2)) {
          stockBajo++;
        }
        // Fase 35: Valor Inventario PVP = precio de venta x unidades (solo stock positivo)
        if (stock > 0) valorInventario += stock * (Number(d.precio_venta) || 0);
      });
    }

    // Si no se pudo leer la lista de digitales, no se muestran numeros que podrian ser incorrectos
    var sinDigitales = !!resDigitales.error;
    $('kpi-inv-total').textContent = sinDigitales ? '---' : totalSku;
    $('kpi-inv-stock-bajo').textContent = sinDigitales ? '---' : stockBajo;
    $('kpi-inv-agotados').textContent = sinDigitales ? '---' : agotados;
    $('kpi-inv-valor').textContent = sinDigitales ? '---' : formatCOP(valorInventario);

    $('kpi-op-prod-hoy').textContent = prodHoy;
  }

  async function cargarTopProductos() {
    var container = $('top-productos');
    if (!container) return;
    var f = getFiltros();
    var m = String(f.mes).padStart(2, '0');
    var sigMes = f.mes === 12 ? 1 : f.mes + 1;
    var sigAnio = f.mes === 12 ? f.anio + 1 : f.anio;
    var desde = f.anio + '-' + m + '-01T00:00:00';
    var hasta = sigAnio + '-' + String(sigMes).padStart(2, '0') + '-01T00:00:00';

    var qs = 'select=producto_detalle_id,cantidad,precio_unitario,detalle:producto_detalle_id(*,producto:producto_id(nombre,slug))&created_at=gte.' + desde + '&created_at=lte.' + hasta;
    if (f.canalId) {
      qs += '&venta_id.canales=canal_id.eq.' + encodeURIComponent(f.canalId);
    }

    var res = await DB.select('pos_ventas_detalle', {
      select: 'producto_detalle_id,cantidad,precio_unitario,detalle:producto_detalle_id(*,producto:producto_id(nombre,slug))',
      filters: [
        { col: 'created_at', op: 'gte', val: desde },
        { col: 'created_at', op: 'lte', val: hasta }
      ]
    });

    if (res.error || !res.data || !res.data.length) {
      container.innerHTML = '<p class="text-xs text-slate-400">Sin ventas este periodo</p>';
      return;
    }

    var agrupado = {};
    (res.data || []).forEach(function (d) {
      var id = d.producto_detalle_id;
      if (!agrupado[id]) {
        agrupado[id] = { id: id, cantidad: 0, total: 0, nombre: (d.detalle && d.detalle.producto && d.detalle.producto.nombre) || '---' };
      }
      agrupado[id].cantidad += d.cantidad || 0;
      agrupado[id].total += (d.cantidad || 0) * (d.precio_unitario || 0);
    });

    var totalGlobal = 0;
    var ordenado = Object.keys(agrupado).map(function (k) { return agrupado[k]; })
      .sort(function (a, b) { return b.cantidad - a.cantidad; })
      .slice(0, 5);
    ordenado.forEach(function (p) { totalGlobal += p.total; });

    var html = '';
    ordenado.forEach(function (p, i) {
      var pos = i + 1;
      var bg = pos === 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
               pos === 2 ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' :
               pos === 3 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                           'bg-slate-50 dark:bg-slate-800/50 text-slate-400';
      var pct = totalGlobal > 0 ? Math.round((p.total / totalGlobal) * 100) : 0;
      html += '<div class="flex items-center gap-3 py-1.5">' +
        '<span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ' + bg + ' shrink-0">' + pos + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<span class="text-sm text-slate-700 dark:text-slate-300 truncate block">' + p.nombre + '</span>' +
          '<span class="text-xs text-slate-400">' + p.cantidad + ' u. &middot; ' + formatCOP(p.total) + ' <span class="text-slate-500">(' + pct + '%)</span></span>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = html;
  }

  async function cargarVentasMensuales() {
    var canvas = $('ventasMensualesChart');
    if (!canvas) return;
    var anio = parseInt($('chart-anio') ? $('chart-anio').value : new Date().getFullYear());
    var f = getFiltros();
    var canalId = f.canalId || null;

    var res = await DB.ventas.porMes(anio, canalId);
    var datos = res.data || [0,0,0,0,0,0,0,0,0,0,0,0];
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    if (chartVentas) { chartVentas.destroy(); chartVentas = null; }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    chartVentas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [{
          label: 'Ventas ' + anio,
          data: datos,
          backgroundColor: 'rgba(14, 165, 233, 0.6)',
          borderColor: 'rgba(14, 165, 233, 1)',
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return formatCOP(ctx.parsed.y); }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (v) { return v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v; },
              color: '#94a3b8',
              font: { size: 10 }
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function formatNum(val) {
    if (val == null || isNaN(val)) return 0;
    return Math.round(val);
  }

  function formatPct(val) {
    if (val == null || isNaN(val) || !isFinite(val)) return '—';
    var v = val.toFixed(1);
    return (val >= 0 ? '▲ +' : '▼ ') + v + '%';
  }

  async function cargarIngresosVsGastos() {
    var canvas = $('ingresosVsGastosChart');
    if (!canvas) return;
    var anio = parseInt($('ivg-anio') ? $('ivg-anio').value : new Date().getFullYear());

    var res = await DB.finanzasMensuales.obtenerIngresosVsGastos(anio);
    if (res.error || !res.data) return;

    var d = res.data;
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    if (chartIngresosVsGastos) { chartIngresosVsGastos.destroy(); chartIngresosVsGastos = null; }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    chartIngresosVsGastos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [{
          label: 'Ingresos',
          data: d.ingresos,
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 2,
          borderRadius: 4
        }, {
          label: 'Gastos+Costos',
          data: d.gastos,
          backgroundColor: 'rgba(244, 63, 94, 0.6)',
          borderColor: 'rgba(244, 63, 94, 1)',
          borderWidth: 2,
          borderRadius: 4
        }, {
          label: 'Utilidad Neta',
          data: d.utilidad,
          backgroundColor: 'rgba(14, 165, 233, 0.6)',
          borderColor: 'rgba(14, 165, 233, 1)',
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var val = ctx.parsed.y;
                var prefix = val >= 0 ? '' : '-';
                return ctx.dataset.label + ': ' + prefix + formatCOP(Math.abs(val));
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (v) { return v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v; },
              color: '#94a3b8',
              font: { size: 10 }
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  async function cargarTendencia() {
    var canvas = $('tendenciaChart');
    var tabla = $('tabla-tendencia');
    if (!canvas || !tabla) return;

    var res = await DB.ventas.todosLosAnios();
    if (res.error || !res.data || !res.data.length) {
      tabla.innerHTML = '<p class="text-xs text-slate-400">Sin datos historicos</p>';
      return;
    }

    var data = res.data;
    var years = {};
    data.forEach(function (d) {
      if (!years[d.anio]) years[d.anio] = [];
      years[d.anio].push(d);
    });
    var anios = Object.keys(years).sort();
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    var palette = [
      { border: '#94a3b8', bg: '#94a3b820' },
      { border: '#64748b', bg: '#64748b20' },
      { border: '#475569', bg: '#47556920' },
      { border: '#0284c7', bg: '#0284c720' },
      { border: '#059669', bg: '#05966920' },
      { border: '#d97706', bg: '#d9770620' }
    ];

    var datasets = anios.map(function (anio, i) {
      var mesesData = Array(12).fill(null);
      (years[anio] || []).forEach(function (d) {
        if (d.mes >= 1 && d.mes <= 12) {
          mesesData[d.mes - 1] = d.ventas;
        }
      });
      var p = palette[i % palette.length];
      return {
        label: String(anio),
        data: mesesData,
        borderColor: p.border,
        backgroundColor: p.bg,
        borderWidth: anio === parseInt(anios[anios.length - 1]) ? 3 : 2,
        pointRadius: anio === parseInt(anios[anios.length - 1]) ? 4 : 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: p.border,
        tension: 0.35,
        spanGaps: false
      };
    });

    if (chartTendencia) { chartTendencia.destroy(); chartTendencia = null; }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    chartTendencia = new Chart(ctx, {
      type: 'line',
      data: { labels: meses, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { size: 11 },
              boxWidth: 14,
              padding: 14,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              title: function (items) { return items[0].label; },
              label: function (ctx) {
                if (ctx.parsed.y === null || ctx.parsed.y === undefined) return null;
                return ctx.dataset.label + ': ' + formatCOP(ctx.parsed.y);
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (v) { return v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v; },
              color: '#94a3b8',
              font: { size: 10 }
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });

    // Tabla resumen anual
    var ultimoAnio = parseInt(anios[anios.length - 1]);
    var totalesAnuales = {};
    var mesesPorAnio = {};
    anios.forEach(function (a) {
      var total = 0;
      (years[a] || []).forEach(function (d) { total += d.ventas; });
      totalesAnuales[a] = total;
      mesesPorAnio[a] = (years[a] || []).length;
    });
    var maxTotal = Math.max.apply(null, Object.keys(totalesAnuales).map(function (k) { return totalesAnuales[k]; }));

    var html = '<table class="w-full text-xs">' +
      '<thead>' +
        '<tr class="text-slate-400 uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-700">' +
          '<th class="text-left py-2 pr-3 font-medium">Ano</th>' +
          '<th class="text-right py-2 px-3 font-medium">Total</th>' +
          '<th class="text-right py-2 px-3 font-medium">Crecimiento</th>' +
          '<th class="text-right py-2 px-3 font-medium">Promedio</th>' +
          '<th class="text-left py-2 pl-3 font-medium hidden sm:table-cell">Barra</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>';

    anios.forEach(function (a, idx) {
      var anioInt = parseInt(a);
      var total = totalesAnuales[a];
      var mesesCount = mesesPorAnio[a];
      var prom = mesesCount > 0 ? total / mesesCount : 0;
      var barWidth = maxTotal > 0 ? (total / maxTotal * 100) : 0;
      var p = palette[idx % palette.length];

      // Calcular crecimiento vs ano anterior comparable
      var crecimiento = null;
      if (idx > 0) {
        var prev = parseInt(anios[idx - 1]);
        var prevTotal = totalesAnuales[prev];
        var prevMeses = mesesPorAnio[prev];
        if (prevTotal && prevTotal > 0 && mesesCount === prevMeses) {
          crecimiento = ((total - prevTotal) / prevTotal) * 100;
        } else if (prevTotal && prevTotal > 0) {
          // Distinto numero de meses: comparar promedios
          var prevProm = prevTotal / prevMeses;
          crecimiento = ((prom - prevProm) / prevProm) * 100;
        }
      }

      var parcial = (anioInt === parseInt(anios[0]) || anioInt === ultimoAnio) && mesesCount < 12 ? true : false;

      html += '<tr class="border-b border-slate-100 dark:border-slate-800/50">' +
        '<td class="py-2 pr-3 text-slate-700 dark:text-slate-300 font-medium">' + a + (parcial ? '<span class="text-slate-400 font-normal">*</span>' : '') + '</td>' +
        '<td class="py-2 px-3 text-right text-slate-950 dark:text-white font-medium">' + formatCOP(total) + '</td>' +
        '<td class="py-2 px-3 text-right ' + (crecimiento !== null && crecimiento >= 0 ? 'text-emerald-500' : crecimiento !== null ? 'text-red-500' : 'text-slate-400') + ' font-medium">' +
          (crecimiento !== null ? formatPct(crecimiento) : '—') +
        '</td>' +
        '<td class="py-2 px-3 text-right text-slate-600 dark:text-slate-400">' + formatCOP(prom) + '</td>' +
        '<td class="py-2 pl-3 hidden sm:table-cell">' +
          '<div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">' +
            '<div class="h-2.5 rounded-full" style="width:' + barWidth + '%;background:' + p.border + '"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';

    var parcialNote = '';
    if (parseInt(anios[0]) < anios[anios.length - 1]) {
      var primerAnio = parseInt(anios[0]);
      if (mesesPorAnio[primerAnio] < 12) parcialNote += ' *' + primerAnio + ': parcial (' + mesesPorAnio[primerAnio] + ' meses)';
    }
    if (mesesPorAnio[anios[anios.length - 1]] < 12) {
      parcialNote += (parcialNote ? '. ' : ' *') + anios[anios.length - 1] + ': parcial (' + mesesPorAnio[anios[anios.length - 1]] + ' meses)';
    }
    if (parcialNote) {
      html += '<p class="text-xs text-slate-400 mt-2">' + parcialNote.trim() + '</p>';
    }

    tabla.innerHTML = html;
  }

  async function cargarComparativaAnual() {
    var canvas = $('comparativaChart');
    if (!canvas) return;
    var anio1 = parseInt($('comp-anio1') ? $('comp-anio1').value : new Date().getFullYear() - 1);
    var anio2 = parseInt($('comp-anio2') ? $('comp-anio2').value : new Date().getFullYear());

    if (anio1 === anio2) {
      anio2 = anio1 + 1;
      var sel2 = $('comp-anio2');
      if (sel2) sel2.value = anio2;
    }

    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var f = getFiltros();
    var canalId = f.canalId || null;

    var [r1, r2] = await Promise.all([
      DB.ventas.porMes(anio1, canalId),
      DB.ventas.porMes(anio2, canalId)
    ]);
    var d1 = r1.data || [0,0,0,0,0,0,0,0,0,0,0,0];
    var d2 = r2.data || [0,0,0,0,0,0,0,0,0,0,0,0];

    if (chartComparativa) { chartComparativa.destroy(); chartComparativa = null; }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    chartComparativa = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: meses,
        datasets: [
          {
            label: String(anio1),
            data: d1,
            backgroundColor: 'rgba(100, 116, 139, 0.6)',
            borderColor: 'rgba(100, 116, 139, 1)',
            borderWidth: 2,
            borderRadius: 4
          },
          {
            label: String(anio2),
            data: d2,
            backgroundColor: 'rgba(14, 165, 233, 0.6)',
            borderColor: 'rgba(14, 165, 233, 1)',
            borderWidth: 2,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.dataset.label + ': ' + formatCOP(ctx.parsed.y); }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (v) { return v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v; },
              color: '#94a3b8',
              font: { size: 10 }
            },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  async function cargarKpisTotales() {
    var res = await DB.finanzasMensuales.obtenerTotalesHistoricos();
    if (res.data) {
      var vb = res.data.ventas_brutas;
      var cmv = res.data.cmv;
      var gc = res.data.gastos_comisiones;
      var utilidadBruta = vb - cmv;
      var margenBruto = vb > 0 ? Math.round((utilidadBruta / vb) * 100) : 0;
      var utilidadNeta = vb - cmv - gc;
      var margenNeto = vb > 0 ? Math.round((utilidadNeta / vb) * 100) : 0;
      var ii = res.data.inversion_inicial;
      var roi = ii > 0 ? Math.round((utilidadNeta / ii) * 100) : null;

      $('kpi-total-ventas').textContent = formatCOP(vb);
      $('kpi-total-cmv').textContent = formatCOP(cmv);
      $('kpi-total-utilidad-bruta').textContent = formatCOP(utilidadBruta);
      $('kpi-total-margen-bruto').textContent = margenBruto + '%';
      $('kpi-total-gastos').textContent = formatCOP(gc);
      $('kpi-total-utilidad-neta').textContent = formatCOP(utilidadNeta);
      $('kpi-total-margen-neto').textContent = margenNeto + '%';
      $('kpi-total-roi').textContent = roi !== null ? roi + '%' : '---';

      var meses = res.data.meses_operacion;
      var gastosPct = vb > 0 ? Math.round((gc / vb) * 100) : 0;
      var cmvPct = vb > 0 ? Math.round((cmv / vb) * 100) : 0;
      var utilidadPromedio = meses > 0 ? utilidadNeta / meses : 0;
      var breakeven = ii > 0 && utilidadPromedio > 0
        ? Math.round(ii / utilidadPromedio)
        : null;

      $('kpi-total-inversion').textContent = formatCOP(ii);
      $('kpi-total-gastos-pct').textContent = gastosPct + '%';
      $('kpi-total-cmv-pct').textContent = cmvPct + '%';
      $('kpi-total-breakeven').textContent = breakeven !== null ? breakeven + ' meses' : '---';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
