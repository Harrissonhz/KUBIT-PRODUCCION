/* ============================================================
   despachar.js — Kubit-WMS — Despachar (pasos B2-B3, HU-04)
   ------------------------------------------------------------
   B2 — Bandeja:
     1. Al abrir (y con "Actualizar") sincroniza con el POS: las
        ventas nuevas quedan reservadas en el WMS.
     2. Lee DB.wms.bandejaDespacho(): ventas agrupadas, con su
        estado en el POS y la regla R-B1 (despachable / motivo).
     3. Una tarjeta por venta: numero, fecha en America/Bogota
        (WMSFecha), unidades y productos. Las mas antiguas primero.
     4. Venta no despachable: tarjeta en rojo con el motivo.
     5. Sin ventas: "No hay ventas por despachar".
   B3 — Detalle y despacho:
     6. Al tocar una tarjeta se despliega el detalle: cada producto
        con la ubicacion de donde sacarlo en formato V1 (codigo
        grande, puesto y posicion, bodega). Primero lo ubicado
        (ordenado por codigo) y al final lo sin ubicar.
     7. DB2: una casilla por producto para marcarlo al recogerlo.
        Las marcas viven solo en memoria (no se guardan) y no
        bloquean el despacho; si faltan, la confirmacion lo avisa.
     8. DB1: "Despachar venta" despacha la venta completa
        (DB.wms.despachar). Antes se vuelve a verificar en el POS
        que la venta no este anulada ni eliminada (R-B1).
     9. La venta despachada sale de la bandeja.
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elBandeja = $('bandeja');
  var elResumen = $('resumen');
  var elSync = $('estado-sync');
  var elAviso = $('aviso');
  var btnActualizar = $('btn-actualizar');

  var ventas = [];          // resultado de bandejaDespacho()
  var mapaUbic = {};        // ubicacion_id -> detalle (V1)
  var expandidas = {};      // claveVenta -> true
  var marcas = {};          // claveVenta -> { claveLinea: true }   (DB2, solo memoria)
  var cargando = false;
  var ocupado = false;      // despacho en curso

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function claveVenta(v) { return v.ventaId || ('sin-venta-' + (v.numeroVenta || '')); }
  function claveLinea(l) { return l.producto_detalle_id + '|' + (l.ubicacion_origen_id || 'SIN_UBICAR'); }
  function porClave(clave) { return ventas.filter(function (v) { return claveVenta(v) === clave; })[0]; }

  function marcasDe(clave) { return marcas[clave] || (marcas[clave] = {}); }
  function contarMarcas(v) {
    var m = marcas[claveVenta(v)] || {};
    return v.lineas.filter(function (l) { return m[claveLinea(l)]; }).length;
  }

  function codigoDe(l) {
    if (!l.ubicacion_origen_id) return null;
    var info = mapaUbic[l.ubicacion_origen_id];
    if (info) return info.codigo;
    var m = String(l.ruta || '').match(/(\d{5})\s*$/);   // respaldo
    return m ? m[1] : '-----';
  }

  // Ubicado primero (por codigo, para recorrer la bodega en orden); sin ubicar al final
  function lineasOrdenadas(v) {
    return v.lineas.slice().sort(function (a, b) {
      var ca = codigoDe(a), cb = codigoDe(b);
      if (!ca && cb) return 1;
      if (ca && !cb) return -1;
      var c = String(ca || '').localeCompare(String(cb || ''));
      return c !== 0 ? c : String(a.codigo_interno || '').localeCompare(String(b.codigo_interno || ''));
    });
  }

  function aviso(html) {
    if (!html) { elAviso.classList.add('hidden'); elAviso.innerHTML = ''; return; }
    elAviso.innerHTML = html;
    elAviso.classList.remove('hidden');
  }

  /* ---------- Carga: sincronizar + bandeja + ubicaciones ---------- */
  async function cargar() {
    if (cargando || ocupado) return;
    cargando = true;
    btnActualizar.disabled = true;
    aviso('');
    elSync.textContent = 'Sincronizando con el POS...';

    var avisos = [];
    var sync = await DB.wms.sincronizar();
    if (sync.error) {
      elSync.textContent = 'Sin sincronizar';
      avisos.push('<p class="font-medium">No se pudo sincronizar con el POS</p>' +
        '<p class="text-xs mt-1">' + esc(sync.error) + '. Pueden faltar ventas recientes.</p>');
    } else {
      var filas = sync.data || [];
      var nuevos = filas.filter(function (f) { return f.resultado === 'PROCESADO'; }).length;
      var pendientes = filas.filter(function (f) { return f.resultado === 'PENDIENTE'; });
      elSync.textContent = 'Sincronizado ' + WMSFecha.hora() + (nuevos ? ' · ' + plural(nuevos, 'movimiento nuevo', 'movimientos nuevos') : '');
      if (pendientes.length) {
        avisos.push('<p class="font-medium">' + plural(pendientes.length, 'movimiento del POS quedo pendiente', 'movimientos del POS quedaron pendientes') + '</p>' +
          '<p class="text-xs mt-1">Una venta pendiente no aparece en la bandeja hasta resolverla.</p>' +
          '<details class="mt-2"><summary class="text-xs cursor-pointer select-none">Ver detalle</summary>' +
          '<ul class="mt-2 space-y-1 text-xs">' +
            pendientes.map(function (p) { return '<li>' + esc(p.tipo_pos) + ': ' + esc(p.detalle) + '</li>'; }).join('') +
          '</ul></details>');
      }
    }

    var res = await DB.wms.bandejaDespacho();
    if (res.error) {
      avisos.push('<p class="font-medium">No se pudo verificar el estado de las ventas en el POS</p>' +
        '<p class="text-xs mt-1">' + esc(res.error) + '. Por seguridad ninguna venta se puede despachar; toca Actualizar.</p>');
    }
    ventas = res.data || [];

    // Detalle de los contenedores de origen (formato V1)
    var ids = [];
    ventas.forEach(function (v) {
      v.lineas.forEach(function (l) { if (l.ubicacion_origen_id) ids.push(l.ubicacion_origen_id); });
    });
    var det = await WMSUbicacion.cargar(ids);
    if (det.error) avisos.push('<p class="text-xs">No se pudo cargar el detalle de las ubicaciones: ' + esc(det.error) + '</p>');
    mapaUbic = det.data || {};

    // Conservar solo el estado de las ventas que siguen en la bandeja
    var vigentes = {};
    ventas.forEach(function (v) { vigentes[claveVenta(v)] = true; });
    Object.keys(expandidas).forEach(function (k) { if (!vigentes[k]) delete expandidas[k]; });
    Object.keys(marcas).forEach(function (k) { if (!vigentes[k]) delete marcas[k]; });

    aviso(avisos.join('<hr class="my-2 border-amber-300/60 dark:border-amber-800/60">'));
    pintar();
    cargando = false;
    btnActualizar.disabled = false;
  }

  /* ---------- Pintar la bandeja ---------- */
  function pintar() {
    var despachables = ventas.filter(function (v) { return v.despachable; });
    var unidades = despachables.reduce(function (s, v) { return s + v.unidades; }, 0);

    if (!ventas.length) {
      elResumen.textContent = 'Sin ventas por despachar';
      elBandeja.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">No hay ventas por despachar</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Las ventas del POS apareceran aqui al sincronizar.</p>' +
        '</div>';
      return;
    }

    var bloqueadas = ventas.length - despachables.length;
    elResumen.textContent = (despachables.length
        ? plural(despachables.length, 'venta por despachar', 'ventas por despachar') + ' · ' + plural(unidades, 'unidad', 'unidades')
        : 'Sin ventas por despachar') +
      (bloqueadas ? ' · ' + plural(bloqueadas, 'bloqueada', 'bloqueadas') : '');

    elBandeja.innerHTML = ventas.map(tarjeta).join('');
  }

  function tarjeta(v) {
    var clave = claveVenta(v);
    var bloqueada = !v.despachable;
    var abierta = !!expandidas[clave];
    var sinUbicar = v.lineas.filter(function (l) { return !l.ubicacion_origen_id; })
      .reduce(function (s, l) { return s + l.cantidad; }, 0);
    var productos = v.lineas.map(function (l) {
      return esc(l.codigo_interno || '') + (l.cantidad > 1 ? ' x' + l.cantidad : '');
    }).join(' · ');

    var clasesTarjeta = bloqueada
      ? 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30'
      : 'border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900';

    return '<article class="border rounded-xl ' + clasesTarjeta + '" data-clave="' + esc(clave) + '">' +
        // Cabecera tocable (abre/cierra el detalle)
        '<button type="button" data-toggle class="w-full text-left p-4" aria-expanded="' + abierta + '">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<p class="font-mono text-base font-semibold tracking-wide break-all">' + esc(v.numeroVenta || 'Sin numero') + '</p>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">' + esc(WMSFecha.relativa(v.fechaVenta) || 'Sin fecha') + '</p>' +
            '</div>' +
            '<div class="flex items-start gap-2 shrink-0">' +
              '<div class="text-right">' +
                '<p class="text-2xl font-semibold leading-none">' + v.unidades + '</p>' +
                '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">' + (v.unidades === 1 ? 'unidad' : 'unidades') + '</p>' +
              '</div>' +
              '<svg class="w-5 h-5 mt-1 text-slate-400 transition-transform ' + (abierta ? 'rotate-180' : '') + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>' +
            '</div>' +
          '</div>' +
          '<p class="mt-2 text-xs text-slate-600 dark:text-slate-300 break-words">' +
            plural(v.lineas.length, 'producto', 'productos') + ': ' + productos + '</p>' +
          (sinUbicar && !bloqueada
            ? '<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">' + plural(sinUbicar, 'unidad sin ubicar', 'unidades sin ubicar') + '</p>'
            : '') +
          (bloqueada
            ? '<p class="mt-3 text-sm font-medium text-red-700 dark:text-red-400">' + esc(v.motivoBloqueo) + '</p>'
            : (!abierta ? '<p class="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Toca para ver donde recoger</p>' : '')) +
        '</button>' +
        (abierta ? detalle(v) : '') +
      '</article>';
  }

  /* ---------- Detalle (B3) ---------- */
  function detalle(v) {
    var clave = claveVenta(v);
    var bloqueada = !v.despachable;
    var m = marcas[clave] || {};
    var total = v.lineas.length;
    var hechas = contarMarcas(v);

    var lineas = lineasOrdenadas(v).map(function (l) {
      var k = claveLinea(l);
      var marcada = !!m[k];
      var codigo = codigoDe(l);
      var info = l.ubicacion_origen_id ? mapaUbic[l.ubicacion_origen_id] : null;
      var lugar = codigo
        ? (info ? WMSUbicacion.lugar(info) : (l.ruta || ''))
        : 'Sin contenedor asignado';
      var bodega = info ? WMSUbicacion.bodega(info) : '';

      var contenido =
        '<div data-contenido class="flex-1 min-w-0 transition-opacity ' + (marcada ? 'opacity-40' : '') + '">' +
          '<div class="flex items-baseline justify-between gap-3">' +
            (codigo
              ? '<p class="font-mono text-2xl font-semibold tracking-wider leading-none">' + esc(codigo) + '</p>'
              : '<p class="text-sm font-medium">Sin ubicar</p>') +
            '<p class="text-2xl font-semibold leading-none shrink-0">' + l.cantidad + '</p>' +
          '</div>' +
          (lugar ? '<p class="mt-1 text-sm truncate">' + esc(lugar) + '</p>' : '') +
          (bodega ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(bodega) + '</p>' : '') +
          '<p class="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200 break-words">' +
            esc(l.codigo_interno || '') + (l.producto ? ' · ' + esc(l.producto) : '') + '</p>' +
          (info && info.activo === false ? '<p class="text-xs text-amber-700 dark:text-amber-400">Contenedor inactivo</p>' : '') +
        '</div>';

      if (bloqueada) {
        return '<li class="py-2.5 flex gap-3">' + contenido + '</li>';
      }
      return '<li><label class="py-2.5 flex gap-3 cursor-pointer select-none">' +
          '<input type="checkbox" data-linea="' + esc(k) + '" class="mt-1 w-6 h-6 shrink-0 rounded accent-slate-950 dark:accent-white"' +
            (marcada ? ' checked' : '') + ' aria-label="Recogido ' + esc(l.codigo_interno || '') + '">' +
          contenido +
        '</label></li>';
    }).join('');

    var pie = bloqueada
      ? '<p class="pt-3 text-xs text-red-700 dark:text-red-400">No se puede despachar esta venta.</p>'
      : '<div class="pt-3 space-y-2">' +
          '<p data-progreso class="text-xs ' + (hechas === total ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400') + '">' +
            textoProgreso(hechas, total) + '</p>' +
          '<button type="button" data-despachar class="w-full py-3.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-medium text-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"' +
            (ocupado ? ' disabled' : '') + '>' +
            'Despachar venta · ' + plural(v.unidades, 'unidad', 'unidades') +
          '</button>' +
        '</div>';

    return '<div class="px-4 pb-4 border-t border-slate-200/60 dark:border-slate-800">' +
        '<ul class="divide-y divide-slate-200/60 dark:divide-slate-800">' + lineas + '</ul>' +
        pie +
      '</div>';
  }

  function textoProgreso(hechas, total) {
    return hechas === total
      ? 'Todo recogido (' + hechas + ' de ' + total + ')'
      : 'Recogidos ' + hechas + ' de ' + total + ' · marcar es opcional';
  }

  /* ---------- Casillas (DB2: solo memoria, no bloquean) ---------- */
  function marcar(input) {
    var art = input.closest('[data-clave]');
    var clave = art.getAttribute('data-clave');
    var v = porClave(clave);
    if (!v) return;
    var m = marcasDe(clave);
    var k = input.getAttribute('data-linea');
    if (input.checked) m[k] = true; else delete m[k];

    var cont = input.closest('label').querySelector('[data-contenido]');
    if (cont) cont.classList.toggle('opacity-40', input.checked);

    var hechas = contarMarcas(v);
    var total = v.lineas.length;
    var prog = art.querySelector('[data-progreso]');
    if (prog) {
      prog.textContent = textoProgreso(hechas, total);
      prog.className = 'text-xs ' + (hechas === total ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400');
    }
  }

  /* ---------- Despachar (DB1 + verificacion R-B1) ---------- */
  async function despachar(clave, boton) {
    var v = porClave(clave);
    if (!v || !v.despachable || ocupado || cargando) return;

    var total = v.lineas.length;
    var faltan = total - contarMarcas(v);
    var msg = 'Despachar la venta ' + (v.numeroVenta || '') + ' (' + plural(v.unidades, 'unidad', 'unidades') + ')?';
    if (faltan > 0) msg += '\n\nFaltan ' + faltan + ' de ' + total + ' productos por marcar como recogidos.';
    msg += '\n\nEsta accion no se puede deshacer.';
    if (!window.confirm(msg)) return;

    ocupado = true;
    btnActualizar.disabled = true;
    if (boton) { boton.disabled = true; boton.textContent = 'Despachando...'; }

    // R-B1: volver a verificar en el POS justo antes de despachar
    var rv = await DB.select('pos_ventas', {
      select: 'id,estado,deleted_at',
      filters: [{ col: 'id', op: 'eq', val: v.ventaId }],
      incluirEliminados: true,
      limit: 1
    });
    var e = rv.data && rv.data[0];
    if (rv.error || !e || e.deleted_at || e.estado === 'ANULADA') {
      ocupado = false;
      btnActualizar.disabled = false;
      window.mostrarToast(rv.error
        ? 'No se pudo verificar la venta en el POS: ' + rv.error + '. No se despacho.'
        : 'La venta ' + (v.numeroVenta || '') + ' esta anulada o no existe en el POS. No se despacho.', 'error');
      await cargar();
      return;
    }

    var res = await DB.wms.despachar(v.ventaId);
    ocupado = false;
    btnActualizar.disabled = false;
    if (res.error) {
      window.mostrarToast(res.error, 'error');
      await cargar();
      return;
    }

    var unidades = Number(res.data) || v.unidades;
    window.mostrarToast('Venta ' + (v.numeroVenta || '') + ' despachada · ' + plural(unidades, 'unidad', 'unidades'), 'success');
    ventas = ventas.filter(function (x) { return claveVenta(x) !== clave; });
    delete marcas[clave];
    delete expandidas[clave];
    pintar();
  }

  /* ---------- Eventos ---------- */
  elBandeja.addEventListener('click', function (e) {
    var bDesp = e.target.closest('[data-despachar]');
    if (bDesp) {
      despachar(bDesp.closest('[data-clave]').getAttribute('data-clave'), bDesp);
      return;
    }
    var bTog = e.target.closest('[data-toggle]');
    if (bTog) {
      var clave = bTog.closest('[data-clave]').getAttribute('data-clave');
      if (expandidas[clave]) delete expandidas[clave]; else expandidas[clave] = true;
      pintar();
    }
  });
  elBandeja.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('input[data-linea]')) marcar(e.target);
  });
  btnActualizar.addEventListener('click', cargar);

  /* ---------- Inicio ---------- */
  cargar();
})();
