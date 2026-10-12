/* ============================================================
   ubicar.js — Kubit-WMS — Ubicar (paso A8, HU-02)
   ------------------------------------------------------------
   SIN_UBICAR -> UBICADO mediante DB.wms.ubicar() (rpc wms_ubicar).

   Paso 1: al abrir sincroniza con el POS; busca el producto
           (DB.productos.buscar) y muestra sus unidades SIN_UBICAR.
   Paso 2: el usuario digita el contenedor (B CC PP) y la cantidad.
           Antes de enviar se valida el contenedor en pantalla:
             - existe, esta activo y aloja stock (bolsa, caja o zona suelta)
             - si es mono-SKU (bolsa/caja) no tiene otro producto asignado
           La funcion wms_ubicar vuelve a validar todo en la base.
   V1: "Ya ubicado en" y el contenedor validado se muestran con el
       formato de js/compartido/ubicacion-vista.js.
   El ultimo contenedor usado se recuerda (localStorage) para ubicar
   varios productos seguidos en el mismo lugar (inventario general).
   Parametro opcional: ubicar.html?q=AL048
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var LIMITE = 20;
  var ESPERA_MS = 350;
  var CLAVE_ULTIMO = 'wms_ultimo_contenedor';

  var $ = function (id) { return document.getElementById(id); };
  // Paso 1
  var input = $('busqueda');
  var btnLimpiar = $('btn-limpiar');
  var elResultados = $('resultados');
  var elEstado = $('estado-busqueda');
  var elSync = $('estado-sync');
  var elPaso1 = $('paso-buscar');
  var ayudaHtml = $('ayuda') ? $('ayuda').outerHTML : '';
  // Paso 2
  var elPaso2 = $('paso-ubicar');
  var form = $('form-ubicar');
  var inCodigo = $('cont-codigo');
  var elContInfo = $('cont-info');
  var inCantidad = $('cantidad');
  var elCantInfo = $('cant-info');
  var btnUbicar = $('btn-ubicar');

  var lista = [];          // productos del ultimo resultado
  var stockPorSku = {};    // producto_detalle_id -> filas de wms_v_stock_detalle
  var mapaUbic = {};       // ubicacion_id -> detalle (V1)
  var sel = null;          // producto elegido
  var contenedor = null;   // contenedor validado (o null)
  var consulta = 0;        // descarta respuestas viejas de la busqueda
  var consultaCont = 0;    // descarta respuestas viejas de la validacion
  var temporizador = null;
  var ocupado = false;

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function hora() {
    return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  function textoAtributos(a) {
    if (!a || typeof a !== 'object') return '';
    return Object.keys(a)
      .filter(function (k) { return a[k] !== null && a[k] !== ''; })
      .map(function (k) { return k + ': ' + a[k]; }).join(', ');
  }
  function subtitulo(p) {
    return [p.codigo_interno, textoAtributos(p.atributos)].filter(Boolean).map(esc).join(' · ');
  }
  function sinUbicar(id) {
    return (stockPorSku[id] || []).reduce(function (s, f) {
      return s + (f.estado_fase === 'SIN_UBICAR' ? f.cantidad : 0);
    }, 0);
  }
  function ubicados(id) {
    return (stockPorSku[id] || []).filter(function (f) { return f.estado_fase === 'UBICADO'; });
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  // Carga el stock de los SKUs y el detalle de sus contenedores
  async function cargarStock(ids) {
    var st = await DB.wms.stockPorSkus(ids);
    if (st.error) { window.mostrarToast(st.error, 'error'); return false; }
    stockPorSku = {};
    (st.data || []).forEach(function (f) {
      (stockPorSku[f.producto_detalle_id] = stockPorSku[f.producto_detalle_id] || []).push(f);
    });
    var det = await WMSUbicacion.cargar((st.data || []).map(function (f) { return f.ubicacion_id; }));
    if (det.error) window.mostrarToast(det.error, 'error');
    mapaUbic = det.data || {};
    return true;
  }

  /* ════════════════════════════════════════════════════════════
     PASO 1 — sincronizar y buscar
     ════════════════════════════════════════════════════════════ */
  async function sincronizar() {
    elSync.textContent = 'Sincronizando con el POS...';
    var res = await DB.wms.sincronizar();
    if (res.error) {
      elSync.textContent = 'Sin sincronizar';
      window.mostrarToast('No se pudo sincronizar con el POS: ' + res.error, 'error');
      return;
    }
    var filas = res.data || [];
    var pendientes = filas.filter(function (f) { return f.resultado === 'PENDIENTE'; }).length;
    elSync.textContent = 'Sincronizado ' + hora() + (pendientes ? ' · ' + plural(pendientes, 'pendiente', 'pendientes') : '');
    if (input.value.trim().length >= 2) buscar();
  }

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
      elEstado.textContent = texto.length ? 'Escribe al menos 2 caracteres' : '';
      elResultados.innerHTML = texto.length ? '' : ayudaHtml;
      lista = [];
      return;
    }
    elEstado.textContent = 'Buscando...';
    var res = await DB.productos.buscar(texto, LIMITE);
    if (n !== consulta) return;
    if (res.error) { elEstado.textContent = ''; window.mostrarToast(res.error, 'error'); return; }
    lista = res.data || [];
    if (!lista.length) {
      elEstado.textContent = '';
      elResultados.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">Sin resultados</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">No hay productos fisicos que coincidan con "' + esc(texto) + '".</p>' +
        '</div>';
      return;
    }
    await cargarStock(lista.map(function (p) { return p.id; }));
    if (n !== consulta) return;
    pintarLista();
    elEstado.textContent = plural(lista.length, 'producto', 'productos') +
      (res.hayMas ? ' · se muestran los primeros ' + LIMITE + ', afina la busqueda' : '');
  }

  function pintarLista() {
    elResultados.innerHTML = lista.map(function (p) {
      var pend = sinUbicar(p.id);
      var nUbic = ubicados(p.id).length;
      return '<article class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<p class="text-sm font-medium">' + esc(p.nombre) + '</p>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">' + subtitulo(p) + '</p>' +
              (nUbic ? '<p class="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Ya ubicado en ' + plural(nUbic, 'contenedor', 'contenedores') + '</p>' : '') +
            '</div>' +
            '<div class="text-right shrink-0">' +
              '<p class="text-2xl font-semibold leading-none">' + pend + '</p>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">sin ubicar</p>' +
            '</div>' +
          '</div>' +
          (pend > 0
            ? '<button type="button" data-sku="' + esc(p.id) + '" class="mt-3 w-full py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-100 active:scale-[0.98]">Ubicar</button>'
            : '<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">Nada por ubicar.</p>') +
        '</article>';
    }).join('');
  }

  /* ════════════════════════════════════════════════════════════
     PASO 2 — contenedor y cantidad
     ════════════════════════════════════════════════════════════ */
  function seleccionar(id) {
    sel = lista.filter(function (p) { return p.id === id; })[0];
    if (!sel) return;
    elPaso1.classList.add('hidden');
    elPaso2.classList.remove('hidden');
    window.scrollTo(0, 0);
    pintarSeleccion();
    inCantidad.value = String(sinUbicar(sel.id));
    inCodigo.value = localStorage.getItem(CLAVE_ULTIMO) || '';
    validarContenedor();
    if (!inCodigo.value) inCodigo.focus();
  }

  function volver() {
    sel = null;
    contenedor = null;
    elPaso2.classList.add('hidden');
    elPaso1.classList.remove('hidden');
    if (lista.length) pintarLista();
  }

  function pintarSeleccion() {
    $('sel-nombre').textContent = sel.nombre;
    $('sel-codigo').innerHTML = subtitulo(sel);
    $('sel-sin-ubicar').textContent = sinUbicar(sel.id);
    var filas = ubicados(sel.id);
    $('sel-ubicaciones').innerHTML = filas.length
      ? '<div class="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">' +
          '<p class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Ya ubicado en</p>' +
          WMSUbicacion.lista(filas, mapaUbic, { sinEstado: true }) +
        '</div>'
      : '';
    actualizarCantidad();
  }

  function infoContenedor(html, tipo) {
    var color = tipo === 'error' ? 'text-red-500'
      : tipo === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';
    elContInfo.className = 'mt-2 min-h-[2.5rem] text-xs ' + color;
    elContInfo.innerHTML = html;
  }

  async function validarContenedor() {
    inCodigo.value = String(inCodigo.value || '').replace(/\D/g, '').slice(0, 5);
    var codigo = inCodigo.value;
    contenedor = null;
    actualizarBoton();
    var n = ++consultaCont;

    if (codigo.length < 5) {
      infoContenedor(codigo.length ? 'Escribe los 5 digitos del adhesivo.' : 'Digita el codigo del adhesivo de la bolsa, caja o zona suelta.');
      return;
    }
    if (!/^[1-9]\d{4}$/.test(codigo)) {
      infoContenedor('Codigo invalido: el primer digito es la bodega (1 a 9).', 'error');
      return;
    }
    infoContenedor('Verificando...');

    var res = await DB.wms.ubicacionPorCodigo(codigo);
    if (n !== consultaCont) return;
    if (res.error) { infoContenedor(esc(res.error), 'error'); return; }
    var u = res.data;
    var etiqueta = u ? WMSUbicacion.etiqueta(u.tipo).toLowerCase() : '';
    if (!u) { infoContenedor('No existe el contenedor ' + esc(codigo) + '. Crealo en Configuracion.', 'error'); return; }
    if (u.activo === false) { infoContenedor('El contenedor ' + esc(codigo) + ' esta inactivo.', 'error'); return; }
    if (!u.es_hoja) {
      infoContenedor(esc(codigo) + ' es un puesto (' + etiqueta + '). Usa una bolsa, caja o zona suelta de ese puesto.', 'error');
      return;
    }
    if (u.mono_sku && u.producto_detalle_id && u.producto_detalle_id !== sel.id) {
      infoContenedor('La ' + etiqueta + ' ' + esc(codigo) + ' ya tiene otro producto. Una ' + etiqueta + ' guarda un solo producto.', 'error');
      return;
    }

    // Lugar y bodega con el formato V1
    var det = await WMSUbicacion.cargar([u.id]);
    if (n !== consultaCont) return;
    var info = det.data && det.data[u.id];

    contenedor = u;
    infoContenedor(
      (info
        ? '<span class="block text-sm font-medium">' + esc(WMSUbicacion.lugar(info)) + '</span>' +
          '<span class="block">' + esc(WMSUbicacion.bodega(info)) + '</span>'
        : '') +
      '<span class="block">' + (u.mono_sku ? 'Un solo producto' : 'Varios productos') + '</span>',
      'ok');
    actualizarBoton();
  }

  function leerCantidad() {
    var v = parseInt(String(inCantidad.value || '').replace(/\D/g, ''), 10);
    return isNaN(v) ? 0 : v;
  }

  function actualizarCantidad() {
    if (!sel) return;
    inCantidad.value = String(inCantidad.value || '').replace(/\D/g, '').slice(0, 5);
    var max = sinUbicar(sel.id);
    var c = leerCantidad();
    if (max === 0) {
      elCantInfo.textContent = 'Este producto ya no tiene unidades sin ubicar.';
      elCantInfo.className = 'text-xs text-slate-500 dark:text-slate-400';
    } else if (c > max) {
      elCantInfo.textContent = 'Maximo ' + max + ' (unidades sin ubicar).';
      elCantInfo.className = 'text-xs text-red-500';
    } else {
      elCantInfo.textContent = 'Disponible para ubicar: ' + max;
      elCantInfo.className = 'text-xs text-slate-500 dark:text-slate-400';
    }
    actualizarBoton();
  }

  function cambiarCantidad(delta) {
    var max = sinUbicar(sel.id);
    var c = Math.min(Math.max(leerCantidad() + delta, 1), Math.max(max, 1));
    inCantidad.value = String(c);
    actualizarCantidad();
  }

  function actualizarBoton() {
    var max = sel ? sinUbicar(sel.id) : 0;
    var c = leerCantidad();
    btnUbicar.disabled = ocupado || !sel || !contenedor || c < 1 || c > max;
    btnUbicar.textContent = ocupado ? 'Ubicando...'
      : (contenedor && c >= 1 && c <= max ? 'Ubicar ' + plural(c, 'unidad', 'unidades') + ' en ' + contenedor.codigo : 'Ubicar');
  }

  async function ubicar(e) {
    e.preventDefault();
    if (btnUbicar.disabled) return;
    var c = leerCantidad();
    var codigo = contenedor.codigo;
    ocupado = true;
    actualizarBoton();

    var res = await DB.wms.ubicar(sel.id, codigo, c);
    ocupado = false;
    if (res.error) {
      actualizarBoton();
      window.mostrarToast(res.error, 'error');
      return;
    }
    localStorage.setItem(CLAVE_ULTIMO, codigo);
    window.mostrarToast(plural(c, 'unidad ubicada', 'unidades ubicadas') + ' en ' + codigo, 'success');

    // Refrescar el stock del producto (y del resto de la lista)
    await cargarStock(lista.length ? lista.map(function (p) { return p.id; }) : [sel.id]);
    inCantidad.value = String(sinUbicar(sel.id));
    pintarSeleccion();
    validarContenedor();   // el contenedor mono-SKU ahora queda asignado a este producto
  }

  /* ---------- Eventos ---------- */
  input.addEventListener('input', programarBusqueda);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); buscar(); input.blur(); }
  });
  btnLimpiar.addEventListener('click', function () {
    input.value = '';
    btnLimpiar.classList.add('hidden');
    buscar();
    input.focus();
  });
  elResultados.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sku]');
    if (b) seleccionar(b.getAttribute('data-sku'));
  });
  $('btn-volver').addEventListener('click', volver);
  inCodigo.addEventListener('input', validarContenedor);
  inCantidad.addEventListener('input', actualizarCantidad);
  $('btn-menos').addEventListener('click', function () { cambiarCantidad(-1); });
  $('btn-mas').addEventListener('click', function () { cambiarCantidad(1); });
  $('btn-todo').addEventListener('click', function () {
    inCantidad.value = String(sinUbicar(sel.id));
    actualizarCantidad();
  });
  form.addEventListener('submit', ubicar);

  /* ---------- Inicio ---------- */
  var q = new URLSearchParams(window.location.search).get('q');
  if (q) {
    input.value = q;
    btnLimpiar.classList.remove('hidden');
  }
  sincronizar();          // si hay texto, al terminar vuelve a buscar con datos frescos
  if (q) buscar();
  if (!q && window.matchMedia('(min-width: 1024px)').matches) input.focus();
})();
