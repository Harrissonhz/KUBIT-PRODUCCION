/* ============================================================
   ajustes.js — Kubit-WMS — Bajas y ajustes del POS (paso C1, HU-08)
   ------------------------------------------------------------
   Reglas:
     CR1: el WMS solo LEE el POS. Las mermas y ajustes - se registran
          en el POS; aqui solo se descuenta el stock fisico del WMS.
     CR2: si el producto no tiene unidades ubicadas, la sincronizacion
          descuenta sola de SIN_UBICAR. Si las tiene, la salida queda
          pendiente y el usuario indica de donde salio.
   Flujo:
     1. Al abrir (y con "Actualizar") sincroniza con el POS y guarda el
        motivo de cada evento que queda pendiente.
     2. Lista las salidas pendientes (DB.wms.salidasPendientes): fecha
        en Bogota (Z1), tipo, producto, cantidad y nota del POS.
     3. Para cada una muestra los posibles origenes con el formato V1:
        "Sin ubicar" y cada contenedor donde esta el producto. Solo se
        pueden elegir los que tienen unidades suficientes (la funcion
        descuenta todo de un solo origen).
     4. "Descontar N de XXXXX" (con confirmacion) → DB.wms.resolverDecremento.
        Merma → la unidad pasa a BAJA. Ajuste - → sale del stock del WMS.
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elLista = $('lista');
  var elResumen = $('resumen');
  var elSync = $('estado-sync');
  var elAviso = $('aviso');
  var btnActualizar = $('btn-actualizar');

  var salidas = [];      // salidas pendientes
  var stockPorSku = {};  // producto_detalle_id -> filas (SIN_UBICAR, UBICADO)
  var mapaUbic = {};     // ubicacion_id -> detalle (V1)
  var motivos = {};      // pos_movimiento_id -> motivo del pendiente (sincronizacion)
  var elegido = {};      // pos_movimiento_id -> clave de origen ('SIN' o ubicacion_id)
  var cargando = false;
  var ocupado = false;

  var TIPO = {
    merma: { texto: 'Merma', clases: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
    ajuste_decremento: { texto: 'Ajuste −', clases: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' }
  };

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function textoAtributos(a) {
    if (!a || typeof a !== 'object') return '';
    return Object.keys(a).filter(function (k) { return a[k] !== null && a[k] !== ''; })
      .map(function (k) { return k + ': ' + a[k]; }).join(', ');
  }
  function aviso(html) {
    if (!html) { elAviso.classList.add('hidden'); elAviso.innerHTML = ''; return; }
    elAviso.innerHTML = html;
    elAviso.classList.remove('hidden');
  }
  function porId(id) { return salidas.filter(function (s) { return s.pos_movimiento_id === id; })[0]; }

  // Origenes posibles de una salida: [{ clave, codigo|null, cantidad, info }]
  function origenes(s) {
    var filas = stockPorSku[s.producto_detalle_id] || [];
    var sinUbicar = filas.filter(function (f) { return f.estado_fase === 'SIN_UBICAR'; })
      .reduce(function (t, f) { return t + (Number(f.cantidad) || 0); }, 0);
    var lista = filas.filter(function (f) { return f.estado_fase === 'UBICADO' && f.ubicacion_id && Number(f.cantidad) > 0; })
      .map(function (f) {
        var info = mapaUbic[f.ubicacion_id];
        return { clave: f.ubicacion_id, codigo: info ? info.codigo : null, cantidad: Number(f.cantidad) || 0, info: info };
      })
      .sort(function (a, b) { return String(a.codigo || '').localeCompare(String(b.codigo || '')); });
    if (sinUbicar > 0) lista.push({ clave: 'SIN', codigo: null, cantidad: sinUbicar, info: null });
    return lista;
  }

  /* ---------- Carga ---------- */
  async function cargar() {
    if (cargando || ocupado) return;
    cargando = true;
    btnActualizar.disabled = true;
    aviso('');
    elSync.textContent = 'Sincronizando con el POS...';

    var avisos = [];
    motivos = {};
    var sync = await DB.wms.sincronizar();
    if (sync.error) {
      elSync.textContent = 'Sin sincronizar';
      avisos.push('<p class="font-medium">No se pudo sincronizar con el POS</p><p class="text-xs mt-1">' + esc(sync.error) + '</p>');
    } else {
      var filas = sync.data || [];
      var nuevos = filas.filter(function (f) { return f.resultado === 'PROCESADO'; }).length;
      filas.forEach(function (f) { if (f.resultado === 'PENDIENTE') motivos[f.evento_id] = f.detalle; });
      elSync.textContent = 'Sincronizado ' + WMSFecha.hora() + (nuevos ? ' · ' + plural(nuevos, 'movimiento nuevo', 'movimientos nuevos') : '');
    }

    var res = await DB.wms.salidasPendientes();
    if (res.error) avisos.push('<p class="text-xs">' + esc(res.error) + '</p>');
    salidas = res.data || [];

    var st = await DB.wms.stockPorSkus(salidas.map(function (s) { return s.producto_detalle_id; }));
    if (st.error) avisos.push('<p class="text-xs">' + esc(st.error) + '</p>');
    stockPorSku = {};
    (st.data || []).forEach(function (f) {
      if (f.estado_fase !== 'SIN_UBICAR' && f.estado_fase !== 'UBICADO') return;
      (stockPorSku[f.producto_detalle_id] = stockPorSku[f.producto_detalle_id] || []).push(f);
    });

    var det = await WMSUbicacion.cargar((st.data || []).map(function (f) { return f.ubicacion_id; }));
    mapaUbic = det.data || {};

    // Conservar la eleccion solo si sigue siendo valida
    var vigentes = {};
    salidas.forEach(function (s) { vigentes[s.pos_movimiento_id] = true; });
    Object.keys(elegido).forEach(function (k) { if (!vigentes[k]) delete elegido[k]; });

    aviso(avisos.join('<hr class="my-2 border-amber-300/60 dark:border-amber-800/60">'));
    pintar();
    cargando = false;
    btnActualizar.disabled = false;
  }

  /* ---------- Pintar ---------- */
  function pintar() {
    var unidades = salidas.reduce(function (t, s) { return t + s.cantidad; }, 0);
    if (!salidas.length) {
      elResumen.textContent = 'Sin salidas pendientes';
      elLista.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">No hay bajas ni ajustes pendientes</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Las mermas y ajustes − del POS de productos ubicados apareceran aqui.</p>' +
        '</div>';
      return;
    }
    elResumen.textContent = plural(salidas.length, 'salida pendiente', 'salidas pendientes') + ' · ' + plural(unidades, 'unidad', 'unidades');
    elLista.innerHTML = salidas.map(tarjeta).join('');
  }

  function tarjeta(s) {
    var t = TIPO[s.tipo_movimiento] || { texto: s.tipo_movimiento, clases: '' };
    var sub = [s.codigo_interno, textoAtributos(s.atributos)].filter(Boolean).map(esc).join(' · ');
    var nota = [s.motivo, s.referencia].filter(Boolean).map(esc).join(' · ');
    var motivo = motivos[s.pos_movimiento_id];
    var ops = origenes(s);
    var sel = elegido[s.pos_movimiento_id];
    var validas = ops.filter(function (o) { return o.cantidad >= s.cantidad; });
    if (sel && !validas.some(function (o) { return o.clave === sel; })) sel = null;
    if (!sel && validas.length === 1) sel = validas[0].clave;     // un solo origen posible: preseleccionado
    if (sel) elegido[s.pos_movimiento_id] = sel; else delete elegido[s.pos_movimiento_id];

    var listaOps = ops.length
      ? ops.map(function (o) { return opcion(s, o, sel); }).join('')
      : '<p class="py-2 text-xs text-red-700 dark:text-red-400">El WMS no tiene unidades de este producto. Revisa la diferencia en el Panel.</p>';

    var sinOrigen = ops.length && !validas.length
      ? '<p class="mt-2 text-xs text-red-700 dark:text-red-400">Ningun origen tiene ' + plural(s.cantidad, 'unidad', 'unidades') +
        '. Junta las unidades con un traslado y vuelve aqui.</p>'
      : '';

    var oSel = ops.filter(function (o) { return o.clave === sel; })[0];
    var textoBoton = oSel
      ? 'Descontar ' + plural(s.cantidad, 'unidad', 'unidades') + ' de ' + (oSel.codigo || 'Sin ubicar')
      : 'Elige de donde salio';

    return '<article class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4" data-mov="' + esc(s.pos_movimiento_id) + '">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ' + t.clases + '">' + esc(t.texto) + '</span>' +
            '<p class="mt-1 text-sm font-medium">' + esc(s.nombre || 'Producto') + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 break-words">' + sub + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(WMSFecha.relativa(s.fecha)) + (nota ? ' · ' + nota : '') + '</p>' +
          '</div>' +
          '<div class="text-right shrink-0">' +
            '<p class="text-2xl font-semibold leading-none">' + s.cantidad + '</p>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">' + (s.cantidad === 1 ? 'unidad' : 'unidades') + '</p>' +
          '</div>' +
        '</div>' +
        (motivo && motivo.indexOf('REQUIERE_CONTENEDOR') !== 0
          ? '<p class="mt-2 text-xs text-red-700 dark:text-red-400 break-words">' + esc(motivo) + '</p>' : '') +
        '<p class="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">¿De donde salio?</p>' +
        '<div class="divide-y divide-slate-200/60 dark:divide-slate-800">' + listaOps + '</div>' +
        sinOrigen +
        '<button type="button" data-descontar class="mt-3 w-full py-3.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-medium text-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"' +
          (oSel && !ocupado ? '' : ' disabled') + '>' + esc(textoBoton) + '</button>' +
      '</article>';
  }

  function opcion(s, o, sel) {
    var alcanza = o.cantidad >= s.cantidad;
    var marcado = o.clave === sel;
    var titulo, lugar = '', bodega = '';
    if (o.clave === 'SIN') {
      titulo = '<p class="text-sm font-medium">Sin ubicar</p>';
      lugar = 'Sin contenedor asignado';
    } else {
      titulo = '<p class="font-mono text-xl font-semibold tracking-wider leading-none">' + esc(o.codigo || '-----') + '</p>';
      if (o.info) { lugar = WMSUbicacion.lugar(o.info); bodega = WMSUbicacion.bodega(o.info); }
    }
    return '<label class="py-2.5 flex items-center gap-3 select-none ' + (alcanza ? 'cursor-pointer' : 'opacity-50') + '">' +
        '<input type="radio" name="origen-' + esc(s.pos_movimiento_id) + '" data-origen="' + esc(o.clave) + '" class="w-5 h-5 shrink-0 accent-slate-950 dark:accent-white"' +
          (marcado ? ' checked' : '') + (alcanza ? '' : ' disabled') + '>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-baseline justify-between gap-3">' + titulo +
            '<p class="text-sm font-semibold shrink-0">' + o.cantidad + '</p>' +
          '</div>' +
          (lugar ? '<p class="mt-0.5 text-xs truncate">' + esc(lugar) + '</p>' : '') +
          (bodega ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(bodega) + '</p>' : '') +
          (alcanza ? '' : '<p class="text-xs text-slate-500 dark:text-slate-400">No alcanza</p>') +
        '</div>' +
      '</label>';
  }

  /* ---------- Descontar ---------- */
  async function descontar(movId, boton) {
    var s = porId(movId);
    var clave = elegido[movId];
    if (!s || !clave || ocupado) return;
    var o = origenes(s).filter(function (x) { return x.clave === clave; })[0];
    if (!o) return;

    var destino = s.tipo_movimiento === 'merma' ? 'pasaran a BAJA (averia).' : 'saldran del stock del WMS.';
    var msg = 'Descontar ' + plural(s.cantidad, 'unidad', 'unidades') + ' de ' + (s.codigo_interno || 'producto') +
      ' desde ' + (o.codigo || 'Sin ubicar') + '?\n\nLas unidades ' + destino + '\nEl POS no se modifica.';
    if (!window.confirm(msg)) return;

    ocupado = true;
    btnActualizar.disabled = true;
    if (boton) { boton.disabled = true; boton.textContent = 'Descontando...'; }

    var res = await DB.wms.resolverDecremento(movId, o.codigo);
    ocupado = false;
    btnActualizar.disabled = false;
    if (res.error) {
      window.mostrarToast(res.error, 'error');
      await cargar();
      return;
    }
    window.mostrarToast(plural(s.cantidad, 'unidad descontada', 'unidades descontadas') + ' de ' + (o.codigo || 'Sin ubicar'), 'success');
    delete elegido[movId];
    await cargar();
  }

  /* ---------- Eventos ---------- */
  elLista.addEventListener('change', function (e) {
    if (!e.target.matches || !e.target.matches('input[data-origen]')) return;
    var art = e.target.closest('[data-mov]');
    elegido[art.getAttribute('data-mov')] = e.target.getAttribute('data-origen');
    pintar();
  });
  elLista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-descontar]');
    if (b) descontar(b.closest('[data-mov]').getAttribute('data-mov'), b);
  });
  btnActualizar.addEventListener('click', cargar);

  cargar();
})();
