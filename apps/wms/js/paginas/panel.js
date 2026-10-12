/* ============================================================
   panel.js — Kubit-WMS — Panel (paso B6, HU-11)
   ------------------------------------------------------------
   Solo lectura. Al abrir (y con "Actualizar"):
     1. Sincroniza con el POS (DB.wms.sincronizar). El detalle de los
        eventos que fallan se guarda para explicar los pendientes.
     2. En paralelo carga los cuatro indicadores:
        a) Sin ubicar: unidades y SKUs en SIN_UBICAR, y % del inventario
           fisico ya ubicado (vista wms_v_stock_detalle).
        b) Por despachar: ventas despachables, unidades, bloqueadas y la
           venta mas antigua (DB.wms.bandejaDespacho, regla R-B1).
        c) Diferencias con el POS: SKUs con diferencia (wms_v_reconciliacion).
        d) Movimientos del POS pendientes (wms_v_pos_pendientes):
           los que fallaron al sincronizar y los NO_SOPORTADOS
           (anulaciones, decision D2).
     3. Cada tarjeta enlaza a su pantalla. Cada una maneja su propio
        error sin afectar a las demas.
   C3: "Diferencias" enlaza a Reconciliacion; "Movimientos pendientes"
       enlaza a Bajas y ajustes (salidas) y a Reconciliacion.
   Fechas con WMSFecha (America/Bogota, Z1).
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elSync = $('estado-sync');
  var btnActualizar = $('btn-actualizar');
  var cards = {
    sinUbicar: $('card-sin-ubicar'),
    despacho: $('card-despacho'),
    diferencias: $('card-diferencias'),
    pendientes: $('card-pendientes')
  };

  var cargando = false;
  var MAX_LISTA = 5;
  var LIMITE_FILAS = 10000;

  var TIPO_POS = {
    entrada_compra: 'Compra recibida',
    salida_venta: 'Venta',
    ajuste_incremento: 'Ajuste +',
    ajuste_decremento: 'Ajuste −',
    merma: 'Merma',
    devolucion_venta: 'Devolucion de venta',
    entrada_anulacion: 'Anulacion de venta'
  };

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function num(n) { return Number(n || 0).toLocaleString('es-CO'); }

  function estilo(card, estado) {
    var base = 'rounded-xl border p-4 ';
    card.className = base + (
      estado === 'ok' ? 'border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-slate-900'
      : estado === 'atencion' ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30'
      : estado === 'error' ? 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30'
      : 'border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900');
  }

  function cabecera(titulo, valor, unidad) {
    return '<p class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(titulo) + '</p>' +
      '<div class="mt-2 flex items-baseline gap-2">' +
        '<p class="text-3xl font-semibold leading-none">' + esc(valor) + '</p>' +
        (unidad ? '<p class="text-sm text-slate-500 dark:text-slate-400">' + esc(unidad) + '</p>' : '') +
      '</div>';
  }

  function enlace(href, texto) {
    return '<a href="' + href + '" class="mt-3 mr-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white">' +
      esc(texto) + ' <span aria-hidden="true">›</span></a>';
  }

  function cargandoCard(card, titulo) {
    estilo(card, '');
    card.innerHTML = '<p class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(titulo) + '</p>' +
      '<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>';
  }

  function errorCard(card, titulo, msg) {
    estilo(card, 'error');
    card.innerHTML = '<p class="text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">' + esc(titulo) + '</p>' +
      '<p class="mt-2 text-sm text-red-700 dark:text-red-400">No se pudo cargar: ' + esc(msg) + '</p>';
  }

  /* ════════════════════════════════════════════════════════════
     a) SIN UBICAR
     ════════════════════════════════════════════════════════════ */
  async function indicadorSinUbicar() {
    var card = cards.sinUbicar;
    var res = await DB.select('wms_v_stock_detalle', {
      select: 'producto_detalle_id,estado_fase,cantidad',
      filters: [{ col: 'estado_fase', op: 'in', val: '(SIN_UBICAR,UBICADO)' }],
      incluirEliminados: true,
      limit: LIMITE_FILAS
    });
    if (res.error) { errorCard(card, 'Sin ubicar', res.error); return; }

    var sinUnid = 0, ubicUnid = 0, skus = {};
    res.data.forEach(function (f) {
      var c = Number(f.cantidad) || 0;
      if (f.estado_fase === 'SIN_UBICAR') {
        sinUnid += c;
        if (c > 0) skus[f.producto_detalle_id] = true;
      } else {
        ubicUnid += c;
      }
    });
    var total = sinUnid + ubicUnid;
    var pct = total ? Math.round((ubicUnid / total) * 100) : 0;
    var nSkus = Object.keys(skus).length;

    estilo(card, sinUnid ? 'atencion' : 'ok');
    card.innerHTML =
      cabecera('Sin ubicar', num(sinUnid), sinUnid === 1 ? 'unidad' : 'unidades') +
      '<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">' +
        (sinUnid ? plural(nSkus, 'producto', 'productos') + ' por ubicar' : 'Todo el inventario fisico esta ubicado') + '</p>' +
      '<div class="mt-3">' +
        '<div class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="h-full bg-emerald-500" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">' + pct + '% ubicado · ' + num(ubicUnid) + ' de ' + num(total) + ' unidades en bodega</p>' +
      '</div>' +
      (sinUnid ? enlace('ubicar.html', 'Ir a Ubicar') : '');
  }

  /* ════════════════════════════════════════════════════════════
     b) POR DESPACHAR
     ════════════════════════════════════════════════════════════ */
  async function indicadorDespacho() {
    var card = cards.despacho;
    var res = await DB.wms.bandejaDespacho();
    var ventas = res.data || [];
    if (res.error && !ventas.length) { errorCard(card, 'Por despachar', res.error); return; }

    var despachables = ventas.filter(function (v) { return v.despachable; });
    var bloqueadas = ventas.length - despachables.length;
    var unidades = despachables.reduce(function (s, v) { return s + v.unidades; }, 0);
    var antigua = despachables[0];

    estilo(card, bloqueadas || res.error ? 'error' : (despachables.length ? 'atencion' : 'ok'));
    card.innerHTML =
      cabecera('Por despachar', num(despachables.length), despachables.length === 1 ? 'venta' : 'ventas') +
      '<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">' +
        (despachables.length ? plural(unidades, 'unidad', 'unidades') + ' por sacar de la bodega' : 'No hay ventas por despachar') + '</p>' +
      (antigua ? '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Mas antigua: <span class="font-mono">' + esc(antigua.numeroVenta || '') + '</span> · ' + esc(WMSFecha.relativa(antigua.fechaVenta)) + '</p>' : '') +
      (bloqueadas ? '<p class="mt-1 text-xs font-medium text-red-700 dark:text-red-400">' + plural(bloqueadas, 'venta bloqueada', 'ventas bloqueadas') + ' (anuladas o sin verificar)</p>' : '') +
      (res.error ? '<p class="mt-1 text-xs text-red-700 dark:text-red-400">' + esc(res.error) + '</p>' : '') +
      (ventas.length ? enlace('despachar.html', 'Ir a Despachar') : '');
  }

  /* ════════════════════════════════════════════════════════════
     c) DIFERENCIAS CON EL POS
     ════════════════════════════════════════════════════════════ */
  async function indicadorDiferencias() {
    var card = cards.diferencias;
    var res = await DB.wms.reconciliacion(true);
    if (res.error) { errorCard(card, 'Diferencias con el POS', res.error); return; }
    var filas = res.data || [];

    estilo(card, filas.length ? 'atencion' : 'ok');
    if (!filas.length) {
      card.innerHTML = cabecera('Diferencias con el POS', '0', 'productos') +
        '<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">El WMS cuadra con el stock del POS</p>';
      return;
    }

    var lista = filas.slice()
      .sort(function (a, b) { return Math.abs(b.diferencia) - Math.abs(a.diferencia); })
      .slice(0, MAX_LISTA);

    card.innerHTML =
      cabecera('Diferencias con el POS', num(filas.length), filas.length === 1 ? 'producto' : 'productos') +
      '<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">El stock del WMS no coincide con el del POS.</p>' +
      '<ul class="mt-3 divide-y divide-amber-200/70 dark:divide-amber-800/40 text-sm">' +
        lista.map(function (f) {
          var d = (Number(f.stock_pos) || 0) - (Number(f.stock_wms) || 0);
          return '<li class="py-1.5 flex items-center justify-between gap-3">' +
              '<a href="buscar.html?q=' + encodeURIComponent(f.codigo_interno || '') + '" class="font-mono underline underline-offset-2 truncate">' + esc(f.codigo_interno || '—') + '</a>' +
              '<span class="shrink-0 text-xs text-slate-600 dark:text-slate-300">POS ' + num(f.stock_pos) + ' · WMS ' + num(f.stock_wms) +
                ' · <span class="font-semibold">' + (d > 0 ? '+' : '') + d + '</span></span>' +
            '</li>';
        }).join('') +
      '</ul>' +
      (filas.length > MAX_LISTA ? '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">y ' + (filas.length - MAX_LISTA) + ' mas</p>' : '') +
      enlace('reconciliacion.html', 'Ver causas en Reconciliacion');
  }

  /* ════════════════════════════════════════════════════════════
     d) MOVIMIENTOS DEL POS PENDIENTES
     ════════════════════════════════════════════════════════════ */
  async function indicadorPendientes(motivos) {
    var card = cards.pendientes;
    var res = await DB.wms.posPendientes();
    if (res.error) { errorCard(card, 'Movimientos del POS pendientes', res.error); return; }
    var filas = res.data || [];
    var noSoportados = filas.filter(function (f) { return f.accion_wms === 'NO_SOPORTADO'; });
    var fallidos = filas.filter(function (f) { return f.accion_wms !== 'NO_SOPORTADO'; });
    var salidas = fallidos.filter(function (f) { return f.accion_wms === 'AJUSTE_MENOS' || f.accion_wms === 'BAJA'; });

    estilo(card, fallidos.length ? 'error' : (noSoportados.length ? 'atencion' : 'ok'));
    if (!filas.length) {
      card.innerHTML = cabecera('Movimientos del POS pendientes', '0', '') +
        '<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">Todo lo del POS esta procesado</p>';
      return;
    }

    function item(f, conMotivo) {
      var tipo = TIPO_POS[f.tipo_movimiento] || f.tipo_movimiento;
      var ref = f.referencia || f.motivo || '';
      var motivo = conMotivo && motivos[f.pos_movimiento_id];
      return '<li class="py-1.5">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<p class="text-sm truncate">' + esc(tipo) + (ref ? ' · <span class="text-slate-500 dark:text-slate-400">' + esc(ref) + '</span>' : '') + '</p>' +
            '<p class="text-sm font-semibold shrink-0">' + num(f.cantidad) + '</p>' +
          '</div>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(WMSFecha.relativa(f.fecha)) + '</p>' +
          (motivo ? '<p class="text-xs text-red-700 dark:text-red-400 break-words">' + esc(motivo) + '</p>' : '') +
        '</li>';
    }

    card.innerHTML =
      cabecera('Movimientos del POS pendientes', num(filas.length), '') +
      (fallidos.length
        ? '<p class="mt-2 text-xs font-medium text-red-700 dark:text-red-400">' + plural(fallidos.length, 'por resolver', 'por resolver') + '</p>' +
          '<ul class="mt-1 divide-y divide-red-200/70 dark:divide-red-800/40">' + fallidos.slice(0, MAX_LISTA).map(function (f) { return item(f, true); }).join('') + '</ul>' +
          (fallidos.length > MAX_LISTA ? '<p class="text-xs text-slate-500 dark:text-slate-400">y ' + (fallidos.length - MAX_LISTA) + ' mas</p>' : '')
        : '') +
      (noSoportados.length
        ? '<p class="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">' + plural(noSoportados.length, 'movimiento sin soporte todavia', 'movimientos sin soporte todavia') + ' (anulaciones, D2)</p>' +
          '<ul class="mt-1 divide-y divide-amber-200/70 dark:divide-amber-800/40">' + noSoportados.slice(0, MAX_LISTA).map(function (f) { return item(f, false); }).join('') + '</ul>' +
          (noSoportados.length > MAX_LISTA ? '<p class="text-xs text-slate-500 dark:text-slate-400">y ' + (noSoportados.length - MAX_LISTA) + ' mas</p>' : '')
        : '') +
      (salidas.length ? enlace('ajustes.html', 'Ir a Bajas y ajustes') : '') +
      enlace('reconciliacion.html', 'Ver en Reconciliacion');
  }

  /* ════════════════════════════════════════════════════════════
     CARGA
     ════════════════════════════════════════════════════════════ */
  async function cargar() {
    if (cargando) return;
    cargando = true;
    btnActualizar.disabled = true;
    cargandoCard(cards.sinUbicar, 'Sin ubicar');
    cargandoCard(cards.despacho, 'Por despachar');
    cargandoCard(cards.diferencias, 'Diferencias con el POS');
    cargandoCard(cards.pendientes, 'Movimientos del POS pendientes');
    elSync.textContent = 'Sincronizando con el POS...';

    var motivos = {};
    var sync = await DB.wms.sincronizar();
    if (sync.error) {
      elSync.textContent = 'Sin sincronizar: ' + sync.error;
    } else {
      var filas = sync.data || [];
      var nuevos = filas.filter(function (f) { return f.resultado === 'PROCESADO'; }).length;
      filas.forEach(function (f) { if (f.resultado === 'PENDIENTE') motivos[f.evento_id] = f.detalle; });
      elSync.textContent = 'Sincronizado ' + WMSFecha.hora() + (nuevos ? ' · ' + plural(nuevos, 'movimiento nuevo', 'movimientos nuevos') : '');
    }

    var tareas = [
      [indicadorSinUbicar, cards.sinUbicar, 'Sin ubicar'],
      [indicadorDespacho, cards.despacho, 'Por despachar'],
      [indicadorDiferencias, cards.diferencias, 'Diferencias con el POS'],
      [function () { return indicadorPendientes(motivos); }, cards.pendientes, 'Movimientos del POS pendientes']
    ];
    await Promise.all(tareas.map(function (t) {
      return Promise.resolve().then(t[0]).catch(function (e) {
        console.error('[Panel]', t[2], e);
        errorCard(t[1], t[2], (e && e.message) || String(e));
      });
    }));

    cargando = false;
    btnActualizar.disabled = false;
  }

  btnActualizar.addEventListener('click', cargar);
  cargar();
})();
