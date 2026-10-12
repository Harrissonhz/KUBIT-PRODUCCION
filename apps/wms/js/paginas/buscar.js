/* ============================================================
   buscar.js — Kubit-WMS — Buscar producto (paso A5, HU-03)
   ------------------------------------------------------------
   1. Al abrir: sincroniza con el POS (DB.wms.sincronizar) y avisa
      si quedan eventos PENDIENTES.
   2. Busca SKUs fisicos (DB.productos.buscar) por codigo interno,
      codigo de barras o nombre, mientras se escribe.
   3. Para cada SKU muestra:
      - Disponible = SIN_UBICAR + UBICADO (lo que cuenta en el POS)
      - Reservado (vendido, pendiente de despacho)
      - Cada ubicacion con el formato V1 (codigo grande, puesto y
        posicion, bodega) — ver js/compartido/ubicacion-vista.js
      - "Sin existencias" si no hay nada disponible
      - Aviso si el disponible no coincide con el stock del POS
   Parametro opcional: buscar.html?q=AL048
   ============================================================ */
(function () {
  // layout.js redirigio al login: no hay nada que hacer
  if (!window.WMSLayout) return;

  var LIMITE = 30;
  var ESPERA_MS = 350;

  var $ = function (id) { return document.getElementById(id); };
  var input = $('busqueda');
  var btnLimpiar = $('btn-limpiar');
  var resultados = $('resultados');
  var estadoBusqueda = $('estado-busqueda');
  var estadoSync = $('estado-sync');
  var avisoSync = $('aviso-sync');
  var ayudaHtml = $('ayuda') ? $('ayuda').outerHTML : '';

  var temporizador = null;
  var consulta = 0;          // descarta respuestas viejas si el usuario sigue escribiendo

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hora() {
    return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function textoAtributos(atributos) {
    if (!atributos || typeof atributos !== 'object') return '';
    return Object.keys(atributos)
      .filter(function (k) { return atributos[k] !== null && atributos[k] !== ''; })
      .map(function (k) { return k + ': ' + atributos[k]; })
      .join(', ');
  }

  /* ---------- 1. Sincronizacion con el POS ---------- */
  async function sincronizar() {
    estadoSync.textContent = 'Sincronizando con el POS...';
    avisoSync.classList.add('hidden');

    var res = await DB.wms.sincronizar();

    if (res.error) {
      estadoSync.textContent = 'Sin sincronizar';
      avisoSync.innerHTML = '<p class="font-medium">No se pudo sincronizar con el POS</p>' +
        '<p class="text-xs mt-1">' + esc(res.error) + '. Las cantidades pueden no estar al dia.</p>';
      avisoSync.classList.remove('hidden');
      return;
    }

    var filas = res.data || [];
    var procesados = filas.filter(function (f) { return f.resultado === 'PROCESADO'; }).length;
    var pendientes = filas.filter(function (f) { return f.resultado === 'PENDIENTE'; });

    estadoSync.textContent = 'Sincronizado ' + hora() +
      (procesados ? ' · ' + procesados + (procesados === 1 ? ' movimiento nuevo' : ' movimientos nuevos') : '');

    if (pendientes.length) {
      avisoSync.innerHTML =
        '<p class="font-medium">' + pendientes.length +
          (pendientes.length === 1 ? ' movimiento del POS quedo pendiente' : ' movimientos del POS quedaron pendientes') + '</p>' +
        '<p class="text-xs mt-1">Las cantidades de esos productos pueden no coincidir con el POS hasta resolverlos.</p>' +
        '<details class="mt-2"><summary class="text-xs cursor-pointer select-none">Ver detalle</summary>' +
        '<ul class="mt-2 space-y-1 text-xs">' +
          pendientes.map(function (p) {
            return '<li>' + esc(p.tipo_pos) + ': ' + esc(p.detalle) + '</li>';
          }).join('') +
        '</ul></details>';
      avisoSync.classList.remove('hidden');
    }

    // Las cantidades pudieron cambiar: refrescar la busqueda actual
    if (input.value.trim().length >= 2) buscar();
  }

  /* ---------- 2. Busqueda ---------- */
  function programarBusqueda() {
    btnLimpiar.classList.toggle('hidden', !input.value);
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, ESPERA_MS);
  }

  async function buscar() {
    clearTimeout(temporizador);
    var texto = input.value.trim();
    var n = ++consulta;

    if (texto.length < 2) {
      estadoBusqueda.textContent = texto.length ? 'Escribe al menos 2 caracteres' : '';
      resultados.innerHTML = texto.length ? '' : ayudaHtml;
      return;
    }

    estadoBusqueda.textContent = 'Buscando...';

    var res = await DB.productos.buscar(texto, LIMITE);
    if (n !== consulta) return;
    if (res.error) {
      estadoBusqueda.textContent = '';
      window.mostrarToast(res.error, 'error');
      return;
    }

    var lista = res.data || [];
    if (!lista.length) {
      estadoBusqueda.textContent = '';
      resultados.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">Sin resultados</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">No hay productos fisicos que coincidan con "' + esc(texto) + '".</p>' +
        '</div>';
      return;
    }

    var stock = await DB.wms.stockPorSkus(lista.map(function (p) { return p.id; }));
    if (n !== consulta) return;
    if (stock.error) {
      window.mostrarToast(stock.error, 'error');
    }

    // Detalle de los contenedores para mostrarlos con el formato V1
    var idsUbic = (stock.data || []).map(function (s) { return s.ubicacion_id; });
    var det = await WMSUbicacion.cargar(idsUbic);
    if (n !== consulta) return;
    if (det.error) window.mostrarToast(det.error, 'error');
    var mapa = det.data || {};

    // Agrupar el stock por SKU
    var porSku = {};
    (stock.data || []).forEach(function (s) {
      (porSku[s.producto_detalle_id] = porSku[s.producto_detalle_id] || []).push(s);
    });

    resultados.innerHTML = lista.map(function (p) {
      return tarjeta(p, porSku[p.id] || [], mapa, !!stock.error);
    }).join('');

    estadoBusqueda.textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos') +
      (res.hayMas ? ' · se muestran los primeros ' + LIMITE + ', afina la busqueda' : '');
  }

  /* ---------- 3. Tarjeta de producto ---------- */
  function tarjeta(p, filas, mapa, sinStockWms) {
    var disponible = 0;
    var reservado = 0;
    filas.forEach(function (f) {
      if (f.estado_fase === 'RESERVADO') reservado += f.cantidad;
      else disponible += f.cantidad;
    });

    var atributos = textoAtributos(p.atributos);
    var subtitulo = [p.codigo_interno, atributos].filter(Boolean).map(esc).join(' · ');

    var cantidadHtml = disponible > 0
      ? '<p class="text-2xl font-semibold leading-none">' + disponible + '</p>' +
        '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">disponibles</p>'
      : '<span class="inline-block px-2 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400">Sin existencias</span>';

    var ubicacionesHtml = filas.length
      ? '<div class="mt-3 border-t border-slate-200/60 dark:border-slate-800">' + WMSUbicacion.lista(filas, mapa) + '</div>'
      : '';

    var avisos = [];
    if (reservado > 0) {
      avisos.push('<p class="text-xs text-sky-700 dark:text-sky-400">' + reservado +
        (reservado === 1 ? ' unidad reservada' : ' unidades reservadas') + ' por despachar</p>');
    }
    if (!sinStockWms && disponible !== p.stock_actual) {
      avisos.push('<p class="text-xs text-amber-700 dark:text-amber-400">Stock en el POS: ' + p.stock_actual +
        '. No coincide con el WMS; revisar la reconciliacion.</p>');
    }
    if (!p.activo) {
      avisos.push('<p class="text-xs text-slate-500 dark:text-slate-400">Producto inactivo en el POS</p>');
    }

    return '<article class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-medium">' + esc(p.nombre) + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">' + subtitulo + '</p>' +
          '</div>' +
          '<div class="text-right shrink-0">' + cantidadHtml + '</div>' +
        '</div>' +
        (avisos.length ? '<div class="mt-2 space-y-1">' + avisos.join('') + '</div>' : '') +
        ubicacionesHtml +
      '</article>';
  }

  /* ---------- Eventos ---------- */
  input.addEventListener('input', programarBusqueda);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscar();
      input.blur(); // cierra el teclado del celular
    }
  });
  btnLimpiar.addEventListener('click', function () {
    input.value = '';
    btnLimpiar.classList.add('hidden');
    buscar();
    input.focus();
  });

  /* ---------- Inicio ---------- */
  var q = new URLSearchParams(window.location.search).get('q');
  if (q) {
    input.value = q;
    btnLimpiar.classList.remove('hidden');
  }
  sincronizar();          // si hay texto, al terminar vuelve a buscar con datos frescos
  if (q) buscar();
  if (!q && window.matchMedia('(min-width: 1024px)').matches) {
    input.focus();        // en computador; en celular no se abre el teclado solo
  }
})();
