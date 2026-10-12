/* ============================================================
   reconciliacion.js — Kubit-WMS — Reconciliacion (paso C3, HU-07)
   ------------------------------------------------------------
   SOLO LECTURA (CR1). No corrige nada: explica cada diferencia y
   dice donde resolverla.
   Al abrir (y con "Actualizar"):
     1. Sincroniza con el POS y guarda el motivo de los pendientes.
     2. Carga en paralelo:
        - wms_v_reconciliacion (diferencia <> 0)
        - salidas del POS pendientes (DB.wms.salidasPendientes)
        - conteos con sobrante pendiente (DB.wms.conteosAbiertos)
        - movimientos del POS sin procesar (DB.wms.posPendientes)
     3. Diferencia por producto: POS, WMS y "POS − WMS". Causa y accion:
        a) tiene una salida pendiente (ajuste − / merma)  -> Bajas y ajustes
        b) tiene otro movimiento del POS sin procesar     -> se muestra el motivo
        c) POS > WMS sin movimiento que lo explique        -> causa frecuente:
           venta anulada (D2); hoy no se iguala desde el WMS (T-521)
        d) WMS > POS sin movimiento que lo explique        -> cambio directo
           del stock en el POS; hoy no se iguala desde el WMS (T-521)
     4. Sobrantes de conteo: no generan diferencia (el WMS no los crea,
        CR3); se listan para registrar el ajuste + en el POS.
   Fechas con WMSFecha (America/Bogota, Z1).
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elResumen = $('resumen');
  var elSync = $('estado-sync');
  var elAviso = $('aviso');
  var btnActualizar = $('btn-actualizar');
  var cargando = false;

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
  function vacio(texto) {
    return '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(texto) + '</p>';
  }
  function enlace(href, texto) {
    return '<a href="' + href + '" class="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white">' +
      esc(texto) + ' <span aria-hidden="true">›</span></a>';
  }
  function tarjeta(clase, html) {
    var borde = clase === 'rojo' ? 'border-red-200 dark:border-red-800/60'
      : clase === 'ambar' ? 'border-amber-300 dark:border-amber-800/60'
      : 'border-slate-200/60 dark:border-slate-800';
    return '<article class="bg-white dark:bg-slate-900 border rounded-xl p-4 ' + borde + '">' + html + '</article>';
  }
  function aviso(html) {
    if (!html) { elAviso.classList.add('hidden'); elAviso.innerHTML = ''; return; }
    elAviso.innerHTML = html;
    elAviso.classList.remove('hidden');
  }

  /* ---------- Carga ---------- */
  async function cargar() {
    if (cargando) return;
    cargando = true;
    btnActualizar.disabled = true;
    aviso('');
    elResumen.textContent = 'Cargando...';
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

    var r = await Promise.all([
      DB.wms.reconciliacion(true),
      DB.wms.salidasPendientes(),
      DB.wms.conteosAbiertos(),
      DB.wms.posPendientes()
    ]);
    var dif = r[0], sal = r[1], sob = r[2], pen = r[3];
    var errores = [dif, sal, sob, pen].filter(function (x) { return x.error; }).map(function (x) { return x.error; });
    if (errores.length) aviso('<p class="font-medium">Parte de la informacion no se pudo cargar</p><p class="text-xs mt-1">' + esc(errores.join(' · ')) + '</p>');

    var salidas = sal.data || [];
    var salidaIds = {};
    var salidasPorSku = {};
    salidas.forEach(function (s) {
      salidaIds[s.pos_movimiento_id] = true;
      (salidasPorSku[s.producto_detalle_id] = salidasPorSku[s.producto_detalle_id] || []).push(s);
    });
    var otros = (pen.data || []).filter(function (p) { return !salidaIds[p.pos_movimiento_id]; });
    var otrosPorSku = {};
    otros.forEach(function (p) { (otrosPorSku[p.producto_detalle_id] = otrosPorSku[p.producto_detalle_id] || []).push(p); });

    // Nombres de los productos con diferencia u otros pendientes
    var difs = dif.data || [];
    var ids = difs.map(function (d) { return d.producto_detalle_id; })
      .concat(otros.map(function (p) { return p.producto_detalle_id; }));
    var prod = await DB.productos.porIds(ids);
    var pm = prod.data || {};

    pintarDiferencias(difs, pm, salidasPorSku, otrosPorSku, motivos);
    pintarSalidas(salidas);
    pintarSobrantes(sob.data || []);
    pintarOtros(otros, pm, motivos);

    var total = difs.length + salidas.length + (sob.data || []).length + otros.length;
    elResumen.textContent = total
      ? plural(difs.length, 'diferencia', 'diferencias') + ' · ' + plural(salidas.length + (sob.data || []).length + otros.length, 'pendiente', 'pendientes')
      : 'Todo cuadra con el POS';

    cargando = false;
    btnActualizar.disabled = false;
  }

  /* ---------- 1. Diferencias ---------- */
  function causa(d, salidasPorSku, otrosPorSku, motivos) {
    var pos = Number(d.stock_pos) || 0;
    var wms = Number(d.stock_wms) || 0;
    var n = Math.abs(pos - wms);
    var s = salidasPorSku[d.producto_detalle_id];
    if (s && s.length) {
      var u = s.reduce(function (t, x) { return t + x.cantidad; }, 0);
      return { clase: 'ambar',
        texto: 'Hay ' + plural(s.length, 'salida del POS', 'salidas del POS') + ' (' + plural(u, 'unidad', 'unidades') + ') esperando que indiques de donde salio.',
        accion: enlace('ajustes.html', 'Resolver en Bajas y ajustes') };
    }
    var o = otrosPorSku[d.producto_detalle_id];
    if (o && o.length) {
      var m = motivos[o[0].pos_movimiento_id];
      return { clase: 'rojo',
        texto: 'Un movimiento del POS no se pudo procesar' + (m ? ': ' + m : '') + '. Revisalo abajo, en "Otros movimientos del POS sin procesar".',
        accion: '' };
    }
    if (pos > wms) {
      return { clase: 'rojo',
        texto: 'El POS tiene ' + plural(n, 'unidad', 'unidades') + ' mas, sin un movimiento que lo explique. Causa frecuente: una venta anulada en el POS (pendiente D2) o un cambio directo del stock en el POS. Hoy el WMS no puede igualarse por si solo (T-521).',
        accion: '' };
    }
    return { clase: 'rojo',
      texto: 'El WMS tiene ' + plural(n, 'unidad', 'unidades') + ' mas, sin un movimiento del POS que lo explique. Causa frecuente: el stock se cambio directamente en el POS sin registrar ajuste. Hoy el WMS no puede igualarse por si solo (T-521).',
      accion: '' };
  }

  function pintarDiferencias(difs, pm, salidasPorSku, otrosPorSku, motivos) {
    $('dif-resumen').textContent = difs.length ? plural(difs.length, 'producto', 'productos') : '';
    if (!difs.length) {
      $('dif-lista').innerHTML = tarjeta('', '<p class="text-sm font-medium text-emerald-700 dark:text-emerald-400">El stock del WMS cuadra con el del POS</p>');
      return;
    }
    var orden = difs.slice().sort(function (a, b) {
      return Math.abs((b.stock_pos || 0) - (b.stock_wms || 0)) - Math.abs((a.stock_pos || 0) - (a.stock_wms || 0));
    });
    $('dif-lista').innerHTML = orden.map(function (d) {
      var p = pm[d.producto_detalle_id] || {};
      var pos = Number(d.stock_pos) || 0, wms = Number(d.stock_wms) || 0, delta = pos - wms;
      var c = causa(d, salidasPorSku, otrosPorSku, motivos);
      var cod = d.codigo_interno || p.codigo_interno || '';
      return tarjeta(c.clase,
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<a href="buscar.html?q=' + encodeURIComponent(cod) + '" class="font-mono text-sm font-semibold underline underline-offset-2">' + esc(cod || '—') + '</a>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + esc(p.nombre || '') + '</p>' +
          '</div>' +
          '<div class="text-right shrink-0">' +
            '<p class="text-2xl font-semibold leading-none">' + (delta > 0 ? '+' : '') + delta + '</p>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">POS ' + num(pos) + ' · WMS ' + num(wms) + '</p>' +
          '</div>' +
        '</div>' +
        '<p class="mt-2 text-xs text-slate-700 dark:text-slate-200">' + esc(c.texto) + '</p>' +
        (c.accion ? '<div class="mt-2">' + c.accion + '</div>' : ''));
    }).join('');
  }

  /* ---------- 2. Salidas pendientes ---------- */
  function pintarSalidas(salidas) {
    var u = salidas.reduce(function (t, s) { return t + s.cantidad; }, 0);
    $('sal-resumen').textContent = salidas.length ? plural(salidas.length, 'salida', 'salidas') + ' · ' + plural(u, 'unidad', 'unidades') : '';
    if (!salidas.length) { $('sal-lista').innerHTML = vacio('No hay salidas por resolver.'); return; }
    $('sal-lista').innerHTML = salidas.map(function (s) {
      return tarjeta('ambar',
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-medium">' + esc(TIPO_POS[s.tipo_movimiento] || s.tipo_movimiento) + ' · ' + esc(s.codigo_interno) + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + esc(s.nombre) + ' · ' + esc(WMSFecha.relativa(s.fecha)) + '</p>' +
          '</div>' +
          '<p class="text-2xl font-semibold leading-none shrink-0">' + s.cantidad + '</p>' +
        '</div>');
    }).join('') + '<div class="pt-1">' + enlace('ajustes.html', 'Ir a Bajas y ajustes') + '</div>';
  }

  /* ---------- 3. Sobrantes de conteo ---------- */
  function pintarSobrantes(sobs) {
    var u = sobs.reduce(function (t, c) { return t + c.sobrante; }, 0);
    $('sob-resumen').textContent = sobs.length ? plural(sobs.length, 'conteo', 'conteos') + ' · ' + plural(u, 'unidad', 'unidades') : '';
    if (!sobs.length) { $('sob-lista').innerHTML = vacio('No hay sobrantes pendientes.'); return; }
    $('sob-lista').innerHTML = sobs.map(function (c) {
      var cod = c.ubicacion ? c.ubicacion.codigo : '';
      return tarjeta('ambar',
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-medium">' + esc(c.codigo_interno) + (cod ? ' · <span class="font-mono">' + esc(cod) + '</span>' : '') + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + esc(c.nombre) + ' · ' + esc(WMSFecha.relativa(c.fecha)) + '</p>' +
          '</div>' +
          '<p class="text-2xl font-semibold leading-none shrink-0">+' + c.sobrante + '</p>' +
        '</div>' +
        '<p class="mt-2 text-xs text-slate-700 dark:text-slate-200">Registra en el POS un ajuste + de ' + c.sobrante + ' y luego ubicalo en Inventario. Si fue un error de conteo, descartalo alli.</p>');
    }).join('') + '<div class="pt-1">' + enlace('inventario.html', 'Ir a Inventario') + '</div>';
  }

  /* ---------- 4. Otros pendientes ---------- */
  function pintarOtros(otros, pm, motivos) {
    $('otr-resumen').textContent = otros.length ? plural(otros.length, 'movimiento', 'movimientos') : '';
    if (!otros.length) { $('otr-lista').innerHTML = vacio('Todo lo del POS esta procesado.'); return; }
    $('otr-lista').innerHTML = otros.map(function (o) {
      var p = pm[o.producto_detalle_id] || {};
      var noSop = o.accion_wms === 'NO_SOPORTADO';
      var motivo = motivos[o.pos_movimiento_id];
      var explica = noSop
        ? 'El WMS aun no procesa este tipo de movimiento (anulaciones, D2). Puede generar una diferencia con el POS.'
        : (motivo || 'No se pudo procesar. Toca Actualizar para ver el motivo.');
      return tarjeta(noSop ? 'ambar' : 'rojo',
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-medium">' + esc(TIPO_POS[o.tipo_movimiento] || o.tipo_movimiento) + ' · ' + esc(p.codigo_interno || '') + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + esc([o.referencia, o.motivo].filter(Boolean).join(' · ')) + ' · ' + esc(WMSFecha.relativa(o.fecha)) + '</p>' +
          '</div>' +
          '<p class="text-2xl font-semibold leading-none shrink-0">' + num(o.cantidad) + '</p>' +
        '</div>' +
        '<p class="mt-2 text-xs ' + (noSop ? 'text-amber-800 dark:text-amber-300' : 'text-red-700 dark:text-red-400') + ' break-words">' + esc(explica) + '</p>');
    }).join('');
  }

  btnActualizar.addEventListener('click', cargar);
  cargar();
})();
