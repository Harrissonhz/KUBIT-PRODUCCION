/* ============================================================
   paginas/config.js — Kubit-WMS — Configuracion (A6-A7, HU-10)
   ------------------------------------------------------------
   OJO: no confundir con js/config.js (credenciales de Supabase).

   Regla de codigo B CC PP (decision P1, 2026-10-01):
     Bodega        B            1-9
     Puesto        B CC 00      CC 01-99, compartido: canastilla O entrepano
       Canastilla  tipo CANASTILLA  es_hoja=false mono_sku=false  sin padre (piso)
       Entrepano   tipo ENTREPANO   es_hoja=false mono_sku=false  sin padre
     Contenido     B CC PP      cuelga (parent_id) de su puesto
       Bolsa       PP 01-90  tipo BOLSA   es_hoja=true mono_sku=true   (en canastilla)
       Caja        PP 01-90  tipo CAJA    es_hoja=true mono_sku=true   (en entrepano)
       Zona suelta PP 91-99  tipo SUELTO  es_hoja=true mono_sku=false  (en ambos)
   La estanteria (el mueble) no se registra.

   Activar / desactivar:
     - No se desactiva un contenedor con mercancia ubicada o reservada.
     - Desactivar un puesto desactiva su contenido; activarlo lo reactiva.
     - Un contenido no se activa si su puesto esta inactivo.

   M1 (2026-10-21) — vista de puestos:
     CF1 Los puestos se muestran colapsados SIEMPRE al abrir la pantalla y al
         cambiar de bodega (el estado no se guarda). Se abren solos al buscar
         un codigo, al crear su contenido o al tocar "Editar" del puesto.
     CF2 Bolsa, caja o zona suelta LIBRE = activa y sin unidades UBICADAS ni
         RESERVADAS (lo reservado sigue fisicamente en el contenedor). Se pinta
         en verde con borde punteado; el encabezado muestra "N libres".
         Solo lectura de wms_v_stock_detalle (CR1). Si la lectura falla no se
         marca nada como libre y se avisa en el resumen.
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elBodegas = $('bodegas');
  var elPanelBodega = $('panel-bodega');
  var elLista = $('lista');
  var elResumen = $('resumen');
  var form = $('form-puesto');
  var inNumero = $('puesto-numero');
  var inNombre = $('puesto-nombre');
  var elCodigo = $('puesto-codigo');
  var elError = $('puesto-error');
  var btnCrear = $('btn-crear-puesto');

  var RANGOS = {
    BODEGA: { min: 1, max: 9 },
    PUESTO: { min: 1, max: 99 },
    CONTENIDO: { min: 1, max: 90 },   // bolsa o caja
    SUELTO: { min: 91, max: 99 }
  };
  var ETIQUETA = {
    CANASTILLA: 'Canastilla', ENTREPANO: 'Entrepano',
    BOLSA: 'Bolsa', CAJA: 'Caja', SUELTO: 'Zona suelta'
  };
  var CONTENIDO_DE = { CANASTILLA: 'BOLSA', ENTREPANO: 'CAJA' };

  var bodegas = [];
  var bodegaActual = null;
  var ubicaciones = [];
  var ocupado = false;

  // M1: estado de la vista (solo en memoria: al recargar todo vuelve a colapsado, CF1)
  var abiertos = {};        // id de puesto -> true si esta expandido
  var conStock = {};        // id de contenedor -> true si tiene unidades UBICADAS o RESERVADAS
  var stockOk = false;      // false si no se pudo leer el contenido (no se marcan libres)
  var LOTE_IDS = 80;        // ids por consulta (evita URLs demasiado largas)
  var elBuscar = $('buscar-puesto');
  var elBuscarMsg = $('buscar-msg');

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function soloDigitos(v, max) { return String(v || '').replace(/\D/g, '').slice(0, max || 2); }
  function usuarioId() { return (window.WMSLayout.usuario || {}).id || null; }
  function rangoDe(tipo) {
    if (tipo === 'SUELTO') return RANGOS.SUELTO;
    if (tipo === 'BOLSA' || tipo === 'CAJA') return RANGOS.CONTENIDO;
    if (tipo === 'BODEGA') return RANGOS.BODEGA;
    return RANGOS.PUESTO;
  }
  function numeroValido(n, tipo) {
    var r = rangoDe(tipo);
    return Number.isInteger(n) && n >= r.min && n <= r.max;
  }
  function siguienteLibre(usados, tipo) {
    var r = rangoDe(tipo);
    for (var n = r.min; n <= r.max; n++) {
      if (usados.indexOf(n) === -1) return n;
    }
    return null;
  }
  function esPuesto(u) { return u.tipo === 'CANASTILLA' || u.tipo === 'ENTREPANO'; }
  function puestos() { return ubicaciones.filter(esPuesto); }
  function hijos(p) { return ubicaciones.filter(function (u) { return u.parent_id === p.id; }); }
  function porId(id) { return ubicaciones.filter(function (u) { return u.id === id; })[0]; }
  function numeroCC(codigo) { return parseInt(String(codigo).slice(1, 3), 10); }
  function numeroPP(codigo) { return parseInt(String(codigo).slice(3, 5), 10); }
  function tipoPuestoElegido() {
    var r = form.querySelector('input[name="tipo-puesto"]:checked');
    return r ? r.value : 'CANASTILLA';
  }

  var C_INPUT = 'w-full px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20';
  var C_BTN_SEC = 'px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
  var C_BTN_PRI = 'px-4 py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-100 active:scale-[0.98]';

  /* ════════════════════════════════════════════════════════════
     BODEGAS
     ════════════════════════════════════════════════════════════ */
  async function cargarBodegas(seleccionarCodigo) {
    var res = await DB.wms.bodegas();
    if (res.error) { window.mostrarToast(res.error, 'error'); return; }
    bodegas = res.data || [];
    var preferida = seleccionarCodigo || localStorage.getItem('wms_config_bodega');
    bodegaActual = bodegas.filter(function (b) { return b.codigo === preferida; })[0] || bodegas[0] || null;
    if (bodegaActual) localStorage.setItem('wms_config_bodega', bodegaActual.codigo);
    pintarBodegas();
    if (bodegaActual) cargarUbicaciones();
  }

  function pintarBodegas() {
    var hayCupo = bodegas.length < RANGOS.BODEGA.max;
    elBodegas.innerHTML = bodegas.map(function (b) {
      var activa = bodegaActual && b.id === bodegaActual.id;
      return '<button type="button" data-bodega="' + esc(b.id) + '" class="px-2 py-2.5 rounded-xl border text-left transition-all ' +
        (activa
          ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-slate-950 dark:border-white'
          : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' +
        '<p class="text-lg font-semibold leading-none">' + esc(b.codigo) + '</p>' +
        '<p class="text-[11px] mt-1 leading-tight ' + (activa ? 'opacity-80' : 'text-slate-500 dark:text-slate-400') + '">' + esc(b.nombre) + '</p>' +
      '</button>';
    }).join('') +
    (hayCupo
      ? '<button type="button" id="btn-nueva-bodega" class="px-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">+ Nueva bodega</button>'
      : '');
  }

  elBodegas.addEventListener('click', function (e) {
    if (ocupado) return;
    if (e.target.closest('#btn-nueva-bodega')) { abrirPanelBodega(); return; }
    var b = e.target.closest('[data-bodega]');
    if (!b) return;
    bodegaActual = bodegas.filter(function (x) { return x.id === b.getAttribute('data-bodega'); })[0];
    localStorage.setItem('wms_config_bodega', bodegaActual.codigo);
    abiertos = {};   // CF1: al cambiar de bodega todo vuelve a colapsado
    limpiarBuscador();
    cerrarPanelBodega();
    pintarBodegas();
    cargarUbicaciones();
  });

  function abrirPanelBodega() {
    var usados = bodegas.map(function (b) { return parseInt(b.codigo, 10); });
    var n = siguienteLibre(usados, 'BODEGA');
    if (n === null) {
      window.mostrarToast('Ya existen las 9 bodegas posibles', 'error');
      return;
    }
    elPanelBodega.innerHTML =
      '<form id="form-bodega" class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4 grid grid-cols-[6rem_1fr] gap-3" autocomplete="off">' +
        '<p class="col-span-2 text-sm font-medium">Nueva bodega</p>' +
        '<p class="col-span-2 -mt-2 text-xs text-slate-500 dark:text-slate-400">Numero de 1 a 9. Es el primer digito de todos sus codigos.</p>' +
        '<div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Numero</label>' +
          '<input id="bod-numero" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" value="' + n + '" class="' + C_INPUT + ' text-center font-semibold"></div>' +
        '<div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nombre</label>' +
          '<input id="bod-nombre" type="text" maxlength="60" placeholder="Ej. Bodega local" class="' + C_INPUT + '"></div>' +
        '<div class="col-span-2"><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Descripcion (opcional)</label>' +
          '<input id="bod-desc" type="text" maxlength="160" class="' + C_INPUT + '"></div>' +
        '<div class="col-span-2 flex justify-end gap-2">' +
          '<button type="button" id="bod-cancelar" class="' + C_BTN_SEC + '">Cancelar</button>' +
          '<button type="submit" id="bod-crear" class="' + C_BTN_PRI + '">Crear bodega</button>' +
        '</div>' +
        '<p id="bod-error" class="col-span-2 hidden text-xs text-red-500"></p>' +
      '</form>';
    elPanelBodega.classList.remove('hidden');
    $('bod-numero').addEventListener('input', function () { this.value = soloDigitos(this.value, 1); });
    $('bod-cancelar').addEventListener('click', cerrarPanelBodega);
    $('form-bodega').addEventListener('submit', crearBodega);
    $('bod-nombre').focus();
  }

  function cerrarPanelBodega() {
    elPanelBodega.classList.add('hidden');
    elPanelBodega.innerHTML = '';
  }

  async function crearBodega(e) {
    e.preventDefault();
    if (ocupado) return;
    var n = parseInt($('bod-numero').value, 10);
    var nombre = $('bod-nombre').value.trim();
    var err = $('bod-error');
    if (!numeroValido(n, 'BODEGA')) { err.textContent = 'El numero de bodega debe estar entre 1 y 9'; err.classList.remove('hidden'); return; }
    if (bodegas.some(function (b) { return parseInt(b.codigo, 10) === n; })) { err.textContent = 'La bodega ' + n + ' ya existe'; err.classList.remove('hidden'); return; }
    if (!nombre) { err.textContent = 'El nombre es obligatorio'; err.classList.remove('hidden'); return; }

    ocupado = true;
    var btn = $('bod-crear');
    btn.disabled = true; btn.textContent = 'Creando...';
    var res = await DB.wms.crearBodega({
      codigo: String(n), nombre: nombre, descripcion: $('bod-desc').value, usuarioId: usuarioId()
    });
    ocupado = false;
    if (res.error) {
      btn.disabled = false; btn.textContent = 'Crear bodega';
      window.mostrarToast(res.error, 'error');
      return;
    }
    window.mostrarToast('Bodega ' + n + ' creada', 'success');
    cerrarPanelBodega();
    await cargarBodegas(String(n));
  }

  /* ════════════════════════════════════════════════════════════
     PUESTOS Y CONTENIDO
     ════════════════════════════════════════════════════════════ */
  async function cargarUbicaciones() {
    elLista.innerHTML = '<p class="text-xs text-slate-500 dark:text-slate-400">Cargando...</p>';
    var res = await DB.wms.ubicaciones({ bodegaId: bodegaActual.id });
    if (res.error) {
      window.mostrarToast(res.error, 'error');
      elLista.innerHTML = '';
      return;
    }
    ubicaciones = res.data || [];
    await cargarContenido();
    pintarLista();
    sugerirPuesto();
  }

  // M1 (CF2): marca que contenedores tienen unidades UBICADAS o RESERVADAS.
  // Solo lectura de wms_v_stock_detalle, por lotes de ids.
  async function cargarContenido() {
    conStock = {};
    stockOk = false;
    var ids = ubicaciones.filter(function (u) { return !esPuesto(u); }).map(function (u) { return u.id; });
    if (!ids.length) { stockOk = true; return; }
    for (var i = 0; i < ids.length; i += LOTE_IDS) {
      var r = await DB.wms.stockEnUbicaciones(ids.slice(i, i + LOTE_IDS));
      if (r.error) { conStock = {}; return; }
      (r.data || []).forEach(function (f) {
        if ((f.estado_fase === 'UBICADO' || f.estado_fase === 'RESERVADO') && (Number(f.cantidad) || 0) > 0) {
          conStock[f.ubicacion_id] = true;
        }
      });
    }
    stockOk = true;
  }

  function esLibre(h) {
    return stockOk && h.activo !== false && !conStock[h.id];
  }

  function pintarLista() {
    var ps = puestos();
    var cuenta = function (t) { return ubicaciones.filter(function (u) { return u.tipo === t; }).length; };
    elResumen.textContent = cuenta('CANASTILLA') + ' canastillas · ' + cuenta('ENTREPANO') + ' entrepanos · ' +
      (ps.length) + '/99 puestos' +
      (stockOk ? '' : ' · No se pudo leer el contenido: no se marcan libres');

    if (!ps.length) {
      elLista.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">Sin puestos</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Crea la primera canastilla o entrepano de la bodega ' + esc(bodegaActual.codigo) + '.</p>' +
        '</div>';
      return;
    }

    elLista.innerHTML = ps.map(tarjetaPuesto).join('');
  }

  function tarjetaPuesto(p) {
    var inactivo = p.activo === false;
    var internos = hijos(p).sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
    var tipoContenido = CONTENIDO_DE[p.tipo];
    var abierto = !!abiertos[p.id];

    var nCont = internos.filter(function (h) { return h.tipo !== 'SUELTO'; }).length;
    var nSuelto = internos.length - nCont;
    var nLibres = internos.filter(esLibre).length;
    var nombreCont = ETIQUETA[tipoContenido].toLowerCase();
    var resumenTxt = internos.length
      ? nCont + ' ' + (nCont === 1 ? nombreCont : nombreCont + 's') +
        (nSuelto ? ' · ' + nSuelto + (nSuelto === 1 ? ' suelta' : ' sueltas') : '')
      : 'Sin contenido';

    var chips = internos.length
      ? '<div class="mt-3 flex flex-wrap gap-2">' + internos.map(function (h) {
          var esSuelto = h.tipo === 'SUELTO';
          var libre = esLibre(h);
          var clases = libre
            ? 'wms-libre'
            : (esSuelto
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200');
          return '<button type="button" data-editar="' + esc(h.id) + '" data-codigo-chip="' + esc(h.codigo) + '" title="' +
            (libre ? 'Libre - ' : '') + 'Editar ' + esc(h.codigo) + '" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-transparent ' +
            clases + (h.activo === false ? ' opacity-50 line-through' : '') + '">' +
            (libre ? '<span aria-hidden="true">&#9675;</span>' : '') +
            esc(h.codigo) + '<span class="opacity-70">' + (esSuelto ? 'Suelto' : ETIQUETA[h.tipo]) +
            (libre ? ' libre' : '') +
            (h.nombre ? ' · ' + esc(h.nombre) : '') + '</span></button>';
        }).join('') + '</div>'
      : '<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">Sin contenido.</p>';

    var botones = inactivo
      ? '<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">Puesto inactivo: activalo para agregar contenido.</p>'
      : '<div class="mt-3 grid grid-cols-2 gap-2">' +
          '<button type="button" data-agregar="' + tipoContenido + '" class="' + C_BTN_SEC + ' font-medium">+ ' + ETIQUETA[tipoContenido] + '</button>' +
          '<button type="button" data-agregar="SUELTO" class="' + C_BTN_SEC + ' font-medium">+ Zona suelta</button>' +
        '</div>';

    var idCuerpo = 'cuerpo-' + esc(p.id);
    return '<article class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4' + (inactivo ? ' opacity-70' : '') + '" data-puesto="' + esc(p.id) + '">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<button type="button" data-toggle aria-expanded="' + abierto + '" aria-controls="' + idCuerpo + '" class="wms-toggle flex-1 min-w-0 flex items-center gap-2 text-left -my-1 py-1">' +
            '<svg class="wms-chevron w-4 h-4 shrink-0 text-slate-400' + (abierto ? ' wms-chevron-abierto' : '') + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>' +
            '<span class="min-w-0">' +
              '<span class="block text-base font-semibold tracking-wider">' + esc(p.codigo) + '</span>' +
              '<span class="block text-xs text-slate-500 dark:text-slate-400 truncate">' + ETIQUETA[p.tipo] + ' ' + dos(numeroCC(p.codigo)) +
                (p.nombre ? ' · ' + esc(p.nombre) : '') + '</span>' +
            '</span>' +
            '<span class="ml-auto flex items-center gap-1.5 shrink-0">' +
              '<span class="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">' + resumenTxt + '</span>' +
              (nLibres ? '<span class="wms-pill-libre px-2 py-0.5 rounded-full text-[11px]">' + nLibres + (nLibres === 1 ? ' libre' : ' libres') + '</span>' : '') +
            '</span>' +
          '</button>' +
          '<div class="flex items-center gap-2 shrink-0">' +
            (inactivo ? '<span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Inactivo</span>' : '') +
            '<button type="button" data-editar="' + esc(p.id) + '" class="px-3 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Editar</button>' +
          '</div>' +
        '</div>' +
        '<div id="' + idCuerpo + '" data-cuerpo' + (abierto ? '' : ' class="hidden"') + '>' +
          chips + botones +
        '</div>' +
        '<div data-panel class="hidden"></div>' +
      '</article>';
  }

  /* ---------- M1: expandir / colapsar ---------- */
  function fijarAbierto(art, abrir) {
    if (!art) return;
    var id = art.getAttribute('data-puesto');
    if (abrir) abiertos[id] = true; else delete abiertos[id];
    var cuerpo = art.querySelector('[data-cuerpo]');
    var btn = art.querySelector('[data-toggle]');
    var chev = art.querySelector('.wms-chevron');
    if (cuerpo) cuerpo.classList.toggle('hidden', !abrir);
    if (btn) btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (chev) chev.classList.toggle('wms-chevron-abierto', abrir);
  }
  function articuloDe(id) {
    return elLista.querySelector('[data-puesto="' + id + '"]');
  }
  function todos(abrir) {
    Array.prototype.forEach.call(elLista.querySelectorAll('[data-puesto]'), function (art) { fijarAbierto(art, abrir); });
  }
  var btnExpandir = $('btn-expandir-todo');
  var btnColapsar = $('btn-colapsar-todo');
  if (btnExpandir) btnExpandir.addEventListener('click', function () { todos(true); });
  if (btnColapsar) btnColapsar.addEventListener('click', function () { todos(false); });

  /* ---------- M1: ir a puesto o contenedor ---------- */
  function limpiarBuscador() {
    if (elBuscar) elBuscar.value = '';
    if (elBuscarMsg) { elBuscarMsg.textContent = ''; elBuscarMsg.classList.add('hidden'); }
  }
  function mensajeBuscar(t) {
    if (!elBuscarMsg) return;
    elBuscarMsg.textContent = t;
    elBuscarMsg.classList.toggle('hidden', !t);
  }
  function irACodigo(texto) {
    var c = soloDigitos(texto, 5);
    mensajeBuscar('');
    if (c.length < 3 || !bodegaActual) return;
    // 3 digitos (B CC) = puesto; 5 digitos = puesto o contenedor
    var codigo = c.length === 3 ? c + '00' : c;
    if (c.length === 4) return;
    if (codigo.charAt(0) !== String(bodegaActual.codigo)) {
      mensajeBuscar('El codigo ' + codigo + ' es de la bodega ' + codigo.charAt(0) + '.');
      return;
    }
    var u = ubicaciones.filter(function (x) { return x.codigo === codigo; })[0];
    if (!u) { mensajeBuscar('No existe el codigo ' + codigo + ' en esta bodega.'); return; }
    var puesto = esPuesto(u) ? u : porId(u.parent_id);
    if (!puesto) { mensajeBuscar('No existe el codigo ' + codigo + ' en esta bodega.'); return; }
    var art = articuloDe(puesto.id);
    fijarAbierto(art, true);
    if (art) art.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!esPuesto(u) && art) {
      var chip = art.querySelector('[data-codigo-chip="' + codigo + '"]');
      if (chip) {
        chip.classList.add('wms-resaltado');
        setTimeout(function () { chip.classList.remove('wms-resaltado'); }, 2500);
      }
    }
  }
  if (elBuscar) {
    elBuscar.addEventListener('input', function () {
      this.value = soloDigitos(this.value, 5);
      var v = this.value;
      if (v.length === 5 || v.length === 3) irACodigo(v); else mensajeBuscar('');
    });
    elBuscar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); irACodigo(this.value); }
    });
  }

  /* ---------- Nuevo puesto ---------- */
  function sugerirPuesto() {
    var usados = puestos().map(function (p) { return numeroCC(p.codigo); });
    var n = siguienteLibre(usados, 'PUESTO');
    inNumero.value = n ? dos(n) : '';
    actualizarCodigoPuesto();
  }

  function actualizarCodigoPuesto() {
    inNumero.value = soloDigitos(inNumero.value);
    var n = parseInt(inNumero.value, 10);
    elCodigo.textContent = numeroValido(n, 'PUESTO') ? bodegaActual.codigo + dos(n) + '00' : '-----';
    elError.classList.add('hidden');
    inNombre.placeholder = tipoPuestoElegido() === 'ENTREPANO' ? 'Ej. Entrepano superior' : 'Ej. Canastilla azul';
  }
  inNumero.addEventListener('input', actualizarCodigoPuesto);
  Array.prototype.forEach.call(form.querySelectorAll('input[name="tipo-puesto"]'), function (r) {
    r.addEventListener('change', actualizarCodigoPuesto);
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (ocupado || !bodegaActual) return;
    var tipo = tipoPuestoElegido();
    var n = parseInt(inNumero.value, 10);
    if (!numeroValido(n, 'PUESTO')) {
      elError.textContent = 'El numero de puesto debe estar entre 01 y 99';
      elError.classList.remove('hidden');
      return;
    }
    var existente = puestos().filter(function (p) { return numeroCC(p.codigo) === n; })[0];
    if (existente) {
      elError.textContent = 'El puesto ' + dos(n) + ' ya existe en esta bodega como ' + ETIQUETA[existente.tipo].toLowerCase() + ' (' + existente.codigo + ')';
      elError.classList.remove('hidden');
      return;
    }
    var ok = await crear({
      bodegaId: bodegaActual.id,
      parentId: null,
      tipo: tipo,
      codigo: bodegaActual.codigo + dos(n) + '00',
      nombre: inNombre.value,
      esHoja: false,
      monoSku: false
    }, btnCrear);
    if (ok) inNombre.value = '';
  });

  /* ---------- Acciones dentro de las tarjetas ---------- */
  elLista.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      var artT = toggle.closest('[data-puesto]');
      fijarAbierto(artT, !abiertos[artT.getAttribute('data-puesto')]);
      return;
    }
    if (ocupado) return;
    var agregar = e.target.closest('[data-agregar]');
    if (agregar) { abrirPanelAgregar(agregar); return; }
    var editar = e.target.closest('[data-editar]');
    if (editar) { abrirPanelEditar(editar); return; }
    var cancelar = e.target.closest('[data-cancelar]');
    if (cancelar) { cerrarPanel(cancelar.closest('[data-panel]')); }
  });

  elLista.addEventListener('input', function (e) {
    if (!e.target.matches('[data-numero]')) return;
    var art = e.target.closest('[data-puesto]');
    var f = art.querySelector('[data-panel] form');
    var p = porId(art.getAttribute('data-puesto'));
    var tipo = f.getAttribute('data-tipo');
    e.target.value = soloDigitos(e.target.value);
    var n = parseInt(e.target.value, 10);
    f.querySelector('[data-codigo]').textContent = numeroValido(n, tipo) ? String(p.codigo).slice(0, 3) + dos(n) : '-----';
    f.querySelector('[data-error]').classList.add('hidden');
  });

  elLista.addEventListener('submit', function (e) {
    e.preventDefault();
    if (ocupado) return;
    var f = e.target;
    if (f.hasAttribute('data-form-agregar')) guardarAgregar(f);
    else if (f.hasAttribute('data-form-editar')) guardarEditar(f);
  });

  function cerrarPanel(panel) {
    if (!panel) return;
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }

  function mostrarPanel(art, html) {
    Array.prototype.forEach.call(elLista.querySelectorAll('[data-panel]'), cerrarPanel);
    var panel = art.querySelector('[data-panel]');
    panel.innerHTML = html;
    panel.classList.remove('hidden');
    return panel;
  }

  /* ---------- Agregar bolsa / caja / zona suelta ---------- */
  function abrirPanelAgregar(btn) {
    var art = btn.closest('[data-puesto]');
    var p = porId(art.getAttribute('data-puesto'));
    var tipo = btn.getAttribute('data-agregar');
    var r = rangoDe(tipo);
    var usados = hijos(p).map(function (h) { return numeroPP(h.codigo); });
    var n = siguienteLibre(usados, tipo);
    var ayuda = tipo === 'SUELTO'
      ? 'Numero de 91 a 99. La zona suelta guarda varios productos.'
      : 'Numero de 01 a 90. Una ' + ETIQUETA[tipo].toLowerCase() + ' guarda un solo producto.';

    if (n === null) {
      mostrarPanel(art, '<p class="mt-3 text-xs text-red-500">No quedan numeros libres de ' + dos(r.min) + ' a ' + dos(r.max) + ' en este puesto.</p>');
      return;
    }
    var panel = mostrarPanel(art,
      '<form data-form-agregar data-tipo="' + tipo + '" class="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 grid grid-cols-[6rem_1fr] gap-3" autocomplete="off">' +
        '<p class="col-span-2 text-sm font-medium">Nueva ' + ETIQUETA[tipo].toLowerCase() + '</p>' +
        '<p class="col-span-2 -mt-2 text-xs text-slate-500 dark:text-slate-400">' + ayuda + '</p>' +
        '<div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Numero</label>' +
          '<input data-numero type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="' + dos(n) + '" class="' + C_INPUT + ' text-center font-semibold"></div>' +
        '<div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nombre (opcional)</label>' +
          '<input data-nombre type="text" maxlength="60" class="' + C_INPUT + '"></div>' +
        '<div class="col-span-2 flex items-center justify-between gap-3">' +
          '<p class="text-sm">Codigo: <span data-codigo class="font-semibold tracking-wider">' + String(p.codigo).slice(0, 3) + dos(n) + '</span></p>' +
          '<div class="flex gap-2">' +
            '<button type="button" data-cancelar class="' + C_BTN_SEC + '">Cancelar</button>' +
            '<button type="submit" class="' + C_BTN_PRI + '">Crear</button>' +
          '</div>' +
        '</div>' +
        '<p data-error class="col-span-2 hidden text-xs text-red-500"></p>' +
      '</form>');
    panel.querySelector('[data-numero]').focus();
  }

  async function guardarAgregar(f) {
    var art = f.closest('[data-puesto]');
    var p = porId(art.getAttribute('data-puesto'));
    var tipo = f.getAttribute('data-tipo');
    var n = parseInt(f.querySelector('[data-numero]').value, 10);
    var err = f.querySelector('[data-error]');
    if (!numeroValido(n, tipo)) {
      err.textContent = tipo === 'SUELTO'
        ? 'El numero de zona suelta debe estar entre 91 y 99'
        : 'El numero de ' + ETIQUETA[tipo].toLowerCase() + ' debe estar entre 01 y 90';
      err.classList.remove('hidden');
      return;
    }
    await crear({
      bodegaId: bodegaActual.id,
      parentId: p.id,
      tipo: tipo,
      codigo: String(p.codigo).slice(0, 3) + dos(n),
      nombre: f.querySelector('[data-nombre]').value,
      esHoja: true,
      monoSku: tipo !== 'SUELTO'
    }, f.querySelector('button[type="submit"]'));
  }

  /* ---------- Editar nombre / activar / desactivar ---------- */
  function abrirPanelEditar(btn) {
    var u = porId(btn.getAttribute('data-editar'));
    var art = btn.closest('[data-puesto]');
    fijarAbierto(art, true);   // M1: el formulario se ve aunque el puesto estuviera colapsado
    var activo = u.activo !== false;
    var aviso = esPuesto(u)
      ? 'Desactivar el puesto tambien desactiva su contenido. Activarlo lo vuelve a activar.'
      : 'No se puede desactivar si tiene mercancia ubicada o reservada.';
    var panel = mostrarPanel(art,
      '<form data-form-editar data-id="' + esc(u.id) + '" class="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-3" autocomplete="off">' +
        '<p class="text-sm font-medium">Editar ' + ETIQUETA[u.tipo].toLowerCase() + ' ' + esc(u.codigo) + '</p>' +
        '<div><label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nombre (opcional)</label>' +
          '<input data-nombre type="text" maxlength="60" value="' + esc(u.nombre || '') + '" class="' + C_INPUT + '"></div>' +
        '<label class="flex items-center gap-3 cursor-pointer select-none">' +
          '<input data-activo type="checkbox" class="w-5 h-5 rounded"' + (activo ? ' checked' : '') + '>' +
          '<span class="text-sm">Activo</span>' +
        '</label>' +
        '<p class="text-xs text-slate-500 dark:text-slate-400">' + aviso + '</p>' +
        '<div class="flex justify-end gap-2">' +
          '<button type="button" data-cancelar class="' + C_BTN_SEC + '">Cancelar</button>' +
          '<button type="submit" class="' + C_BTN_PRI + '">Guardar</button>' +
        '</div>' +
        '<p data-error class="hidden text-xs text-red-500"></p>' +
      '</form>');
    panel.querySelector('[data-nombre]').focus();
  }

  async function guardarEditar(f) {
    var u = porId(f.getAttribute('data-id'));
    var err = f.querySelector('[data-error]');
    var btn = f.querySelector('button[type="submit"]');
    var nombre = f.querySelector('[data-nombre]').value.trim();
    var activo = f.querySelector('[data-activo]').checked;
    var activoAntes = u.activo !== false;

    var cambios = {};
    if (nombre !== (u.nombre || '')) cambios.nombre = nombre;
    if (activo !== activoAntes) cambios.activo = activo;
    if (!Object.keys(cambios).length) { cerrarPanel(f.closest('[data-panel]')); return; }

    function mostrarError(t) { err.textContent = t; err.classList.remove('hidden'); }

    // Contenedores afectados por el cambio de estado
    var afectados = [u];
    if ('activo' in cambios && esPuesto(u)) afectados = afectados.concat(hijos(u));

    ocupado = true;
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      if (cambios.activo === false) {
        var st = await DB.wms.stockEnUbicaciones(afectados.map(function (a) { return a.id; }));
        if (st.error) { mostrarError(st.error); return; }
        if ((st.data || []).length) {
          var unidades = st.data.reduce(function (s, x) { return s + x.cantidad; }, 0);
          mostrarError('No se puede desactivar: hay ' + unidades + (unidades === 1 ? ' unidad' : ' unidades') +
            ' ubicadas o reservadas. Trasladalas o despachalas primero.');
          return;
        }
      }
      if (cambios.activo === true && !esPuesto(u)) {
        var padre = porId(u.parent_id);
        if (padre && padre.activo === false) { mostrarError('Activa primero el puesto ' + padre.codigo); return; }
      }

      // 1) El contenedor editado (nombre y/o estado)
      var r = await DB.wms.actualizarUbicacion(u.id, cambios, usuarioId());
      if (r.error) { mostrarError(r.error); return; }

      // 2) Cascada de estado a su contenido (solo puestos)
      var fallos = 0;
      if ('activo' in cambios && esPuesto(u)) {
        var hs = hijos(u).filter(function (h) { return (h.activo !== false) !== activo; });
        for (var i = 0; i < hs.length; i++) {
          var rh = await DB.wms.actualizarUbicacion(hs[i].id, { activo: activo }, usuarioId());
          if (rh.error) fallos++;
        }
      }

      if (fallos) {
        window.mostrarToast(u.codigo + ' guardado, pero ' + fallos + ' de su contenido no se actualizo. Revisalo.', 'error');
      } else {
        window.mostrarToast(ETIQUETA[u.tipo] + ' ' + u.codigo + ' actualizado', 'success');
      }
      await cargarUbicaciones();
    } finally {
      ocupado = false;
      if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = 'Guardar'; }
    }
  }

  /* ---------- Crear contenedor ---------- */
  async function crear(datos, boton) {
    ocupado = true;
    var texto = boton ? boton.textContent : '';
    if (boton) { boton.disabled = true; boton.textContent = 'Creando...'; }
    datos.usuarioId = usuarioId();
    var res = await DB.wms.crearUbicacion(datos);
    ocupado = false;
    if (boton) { boton.disabled = false; boton.textContent = texto; }
    if (res.error) {
      window.mostrarToast(res.error, 'error');
      return false;
    }
    window.mostrarToast(ETIQUETA[datos.tipo] + ' ' + datos.codigo + ' creada', 'success');
    // M1: el puesto donde se creo (o el puesto nuevo) queda abierto para ver el resultado
    if (datos.parentId) abiertos[datos.parentId] = true;
    else if (res.data && res.data.id) abiertos[res.data.id] = true;
    await cargarUbicaciones();
    return true;
  }

  /* ---------- Inicio ---------- */
  cargarBodegas();
})();
