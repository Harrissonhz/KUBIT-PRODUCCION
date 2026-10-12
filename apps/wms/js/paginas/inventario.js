/* ============================================================
   inventario.js — Kubit-WMS — Inventario general (paso C2, HU-09)
   ------------------------------------------------------------
   Reglas:
     CR1: el WMS solo LEE el POS. El conteo solo mueve stock wms_*.
     CR3: conteo mayor -> primero se ubica lo que haya SIN_UBICAR;
          el sobrante real queda pendiente (conteo ABIERTO) hasta
          registrar un ajuste + en el POS. Conteo menor -> lo que
          falta vuelve a SIN_UBICAR (el POS no cambia).
     IN1: lo RESERVADO (vendido sin despachar) sigue fisicamente en el
          contenedor. Se cuenta lo que se ve y la pantalla resta lo
          reservado antes de registrar. Si el conteo es menor que lo
          reservado, no se registra (despachar o revisar primero).
     IN2: el sobrante pendiente se cierra aqui: "Ubicar" (tras el
          ajuste + en el POS) o "Descartar" (error de conteo).
   Flujo:
     1. Al abrir sincroniza con el POS y carga los sobrantes pendientes.
     2. Digitar el contenedor (validado: existe, activo, aloja stock).
        Se vuelve a sincronizar y se muestra lo esperado por producto.
     3. Escribir lo contado (o "Coincide"); agregar productos encontrados.
     4. "Registrar conteo" -> DB.wms.registrarConteo por producto, con un
        id de sesion comun. Resultado por producto.
   Parametro opcional: inventario.html?contenedor=30110
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  var elSync = $('estado-sync');
  var inCodigo = $('cont-codigo');
  var elInfo = $('cont-info');
  var elSeccion = $('seccion-conteo');
  var elLista = $('conteo-lista');
  var elResumen = $('conteo-resumen');
  var btnAgregar = $('btn-agregar');
  var elBuscarWrap = $('buscar-wrap');
  var inBuscar = $('buscar-producto');
  var elBuscarRes = $('buscar-resultados');
  var elAgregarAviso = $('agregar-aviso');
  var btnRegistrar = $('btn-registrar');
  var btnOtro = $('btn-otro');
  var elSobRes = $('sobrantes-resumen');
  var elSobLista = $('sobrantes-lista');

  var contenedor = null;     // wms_ubicaciones validado
  var filas = [];            // [{ sku, codigo_interno, producto, ubicado, reservado, nuevo, contado, resultado, error }]
  var sesionId = null;
  var registrado = false;
  var consulta = 0;
  var consultaBusca = 0;
  var tBusca = null;
  var ocupado = false;

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function esperado(f) { return f.ubicado + f.reservado; }
  function nuevoId() {
    try { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null; } catch (e) { return null; }
  }
  function leer(v) {
    var s = String(v == null ? '' : v).replace(/\D/g, '');
    return s === '' ? null : parseInt(s, 10);
  }
  function info(html, tipo) {
    var color = tipo === 'error' ? 'text-red-500'
      : tipo === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';
    elInfo.className = 'mt-2 min-h-[2.5rem] text-xs ' + color;
    elInfo.innerHTML = html;
  }

  async function sincronizar() {
    elSync.textContent = 'Sincronizando con el POS...';
    var s = await DB.wms.sincronizar();
    if (s.error) { elSync.textContent = 'Sin sincronizar: ' + s.error; return false; }
    var d = s.data || [];
    var nuevos = d.filter(function (f) { return f.resultado === 'PROCESADO'; }).length;
    var pend = d.filter(function (f) { return f.resultado === 'PENDIENTE'; }).length;
    elSync.textContent = 'Sincronizado ' + WMSFecha.hora() +
      (nuevos ? ' · ' + plural(nuevos, 'movimiento nuevo', 'movimientos nuevos') : '') +
      (pend ? ' · ' + plural(pend, 'pendiente', 'pendientes') : '');
    return true;
  }

  /* ════════════════════════════════════════════════════════════
     1. CONTENEDOR
     ════════════════════════════════════════════════════════════ */
  function limpiarConteo() {
    contenedor = null;
    filas = [];
    registrado = false;
    elSeccion.classList.add('hidden');
    elLista.innerHTML = '';
    cerrarBuscador();
    btnOtro.classList.add('hidden');
    btnRegistrar.classList.remove('hidden');
  }

  async function validarContenedor() {
    inCodigo.value = String(inCodigo.value || '').replace(/\D/g, '').slice(0, 5);
    var codigo = inCodigo.value;
    limpiarConteo();
    var n = ++consulta;

    if (codigo.length < 5) {
      info(codigo.length ? 'Escribe los 5 digitos del adhesivo.' : 'Digita el codigo del adhesivo de la bolsa, caja o zona suelta que vas a contar.');
      return;
    }
    if (!/^[1-9]\d{4}$/.test(codigo)) { info('Codigo invalido: el primer digito es la bodega (1 a 9).', 'error'); return; }
    info('Verificando...');

    var res = await DB.wms.ubicacionPorCodigo(codigo);
    if (n !== consulta) return;
    if (res.error) { info(esc(res.error), 'error'); return; }
    var u = res.data;
    if (!u) { info('No existe el contenedor ' + esc(codigo) + '.', 'error'); return; }
    if (u.activo === false) { info('El contenedor ' + esc(codigo) + ' esta inactivo.', 'error'); return; }
    if (!u.es_hoja) {
      info(esc(codigo) + ' es un puesto (' + WMSUbicacion.etiqueta(u.tipo).toLowerCase() + '). Cuenta cada bolsa, caja o zona suelta por separado.', 'error');
      return;
    }

    await sincronizar();      // lo esperado debe estar al dia con el POS
    if (n !== consulta) return;

    var r = await Promise.all([WMSUbicacion.cargar([u.id]), DB.wms.stockEnContenedor(u.id)]);
    if (n !== consulta) return;
    if (r[1].error) { info(esc(r[1].error), 'error'); return; }
    var det = r[0].data && r[0].data[u.id];

    contenedor = u;
    sesionId = nuevoId();
    filas = (r[1].data || []).map(function (c) {
      return {
        sku: c.producto_detalle_id, codigo_interno: c.codigo_interno, producto: c.producto,
        ubicado: c.ubicado, reservado: c.reservado, nuevo: false, contado: '', resultado: null, error: null
      };
    });
    info(
      (det ? '<span class="block text-sm font-medium">' + esc(WMSUbicacion.lugar(det)) + '</span>' +
             '<span class="block">' + esc(WMSUbicacion.bodega(det)) + '</span>' : '') +
      '<span class="block">' + (u.mono_sku ? 'Un solo producto' : 'Varios productos') + '</span>', 'ok');
    elSeccion.classList.remove('hidden');
    pintar();
  }

  /* ════════════════════════════════════════════════════════════
     2. LISTA DE CONTEO
     ════════════════════════════════════════════════════════════ */
  function puedeAgregar() {
    if (!contenedor || registrado) return { ok: false, msg: '' };
    if (contenedor.mono_sku) {
      var lleno = filas.length > 0 || !!contenedor.producto_detalle_id;
      if (lleno) return { ok: false, msg: 'Este contenedor guarda un solo producto. Si encontraste otro, ubicalo en su propio contenedor.' };
    }
    return { ok: true, msg: '' };
  }

  function pintar() {
    var conValor = filas.filter(function (f) { return !f.resultado && leer(f.contado) !== null; }).length;
    elResumen.textContent = plural(filas.length, 'producto', 'productos') + (registrado ? '' : ' · ' + conValor + ' contados');

    if (!filas.length) {
      elLista.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center">' +
          '<p class="text-sm font-medium">El WMS no tiene nada registrado aqui</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Si encontraste productos, agregalos abajo.</p>' +
        '</div>';
    } else {
      elLista.innerHTML = filas.map(tarjeta).join('');
    }

    var ag = puedeAgregar();
    btnAgregar.disabled = !ag.ok;
    btnAgregar.classList.toggle('opacity-40', !ag.ok);
    elAgregarAviso.textContent = ag.msg;
    elAgregarAviso.classList.toggle('hidden', !ag.msg);

    btnRegistrar.disabled = ocupado || registrado || conValor === 0;
    btnRegistrar.textContent = ocupado ? 'Registrando...'
      : (conValor ? 'Registrar conteo de ' + plural(conValor, 'producto', 'productos') + ' en ' + contenedor.codigo : 'Registrar conteo');
    btnRegistrar.classList.toggle('hidden', registrado);
    btnOtro.classList.toggle('hidden', !registrado);
  }

  function tarjeta(f, i) {
    var esp = esperado(f);
    var detalle = f.nuevo ? 'No estaba registrado aqui'
      : 'Esperado ' + esp + (f.reservado ? ' (' + f.ubicado + ' ubicadas + ' + f.reservado + ' reservadas por despachar)' : '');

    var cuerpo;
    if (f.resultado) {
      cuerpo = '<p class="mt-2 text-sm ' + f.resultado.clase + '">' + f.resultado.texto + '</p>';
    } else {
      cuerpo =
        '<div class="mt-3 flex items-center gap-2">' +
          '<input data-contado="' + i + '" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" placeholder="Contado" value="' + esc(f.contado) + '"' +
            (registrado || ocupado ? ' disabled' : '') +
            ' class="w-28 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 text-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20">' +
          (f.nuevo ? '' :
            '<button type="button" data-coincide="' + i + '" class="px-3 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"' +
            (registrado || ocupado ? ' disabled' : '') + '>Coincide (' + esp + ')</button>') +
          (f.nuevo && !registrado ? '<button type="button" data-quitar="' + i + '" class="ml-auto text-xs underline underline-offset-2 text-slate-500 dark:text-slate-400">Quitar</button>' : '') +
        '</div>' +
        (f.error ? '<p class="mt-2 text-xs text-red-600 dark:text-red-400">' + esc(f.error) + '</p>' : '');
    }

    return '<article class="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4">' +
        '<p class="text-sm font-medium">' + esc(f.producto || '') + '</p>' +
        '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(f.codigo_interno || '') + ' · ' + esc(detalle) + '</p>' +
        cuerpo +
      '</article>';
  }

  /* ---------- Agregar producto ---------- */
  function cerrarBuscador() {
    elBuscarWrap.classList.add('hidden');
    inBuscar.value = '';
    elBuscarRes.innerHTML = '';
  }

  async function buscar() {
    var texto = inBuscar.value.trim();
    var n = ++consultaBusca;
    if (texto.length < 2) { elBuscarRes.innerHTML = ''; return; }
    var res = await DB.productos.buscar(texto, 8);
    if (n !== consultaBusca) return;
    if (res.error) { elBuscarRes.innerHTML = '<p class="text-xs text-red-500">' + esc(res.error) + '</p>'; return; }
    var lista = res.data || [];
    elBuscarRes.innerHTML = lista.length
      ? lista.map(function (p) {
          return '<button type="button" data-elegir="' + esc(p.id) + '" data-cod="' + esc(p.codigo_interno || '') + '" data-nom="' + esc(p.nombre || '') + '" ' +
            'class="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">' +
            '<span class="text-sm font-medium">' + esc(p.codigo_interno || '') + '</span> ' +
            '<span class="text-xs text-slate-500 dark:text-slate-400">' + esc(p.nombre || '') + '</span></button>';
        }).join('')
      : '<p class="text-xs text-slate-500 dark:text-slate-400">Sin resultados.</p>';
  }

  function agregar(sku, cod, nom) {
    if (filas.some(function (f) { return f.sku === sku; })) {
      window.mostrarToast('Ese producto ya esta en la lista', 'info');
      return;
    }
    filas.push({ sku: sku, codigo_interno: cod, producto: nom, ubicado: 0, reservado: 0, nuevo: true, contado: '', resultado: null, error: null });
    cerrarBuscador();
    pintar();
  }

  /* ════════════════════════════════════════════════════════════
     3. REGISTRAR
     ════════════════════════════════════════════════════════════ */
  function textoResultado(f, r) {
    var dif = Number(r.o_diferencia) || 0;
    var desde = Number(r.o_ubicado_desde_sin_ubicar) || 0;
    var sob = Number(r.o_sobrante_pendiente) || 0;
    if (dif === 0) return { clase: 'text-emerald-700 dark:text-emerald-400', texto: 'Coincide.' };
    if (dif < 0) {
      return { clase: 'text-amber-700 dark:text-amber-400',
        texto: 'Faltan ' + (-dif) + ': quedaron en "Sin ubicar". Si se perdieron, registra un ajuste − o una merma en el POS.' };
    }
    var partes = [];
    if (desde) partes.push(plural(desde, 'unidad ubicada', 'unidades ubicadas') + ' desde "Sin ubicar".');
    if (sob) partes.push('<strong>Sobrante de ' + sob + ':</strong> registra un ajuste + en el POS y luego ubicalo abajo en "Sobrantes pendientes".');
    return { clase: sob ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400', texto: partes.join(' ') };
  }

  async function registrar() {
    if (ocupado || registrado || !contenedor) return;

    // Validar (IN1: no se puede contar menos que lo reservado)
    var aEnviar = [];
    filas.forEach(function (f) {
      if (f.resultado) return;            // ya registrado en un intento anterior
      f.error = null;
      var c = leer(f.contado);
      if (c === null) return;
      if (c < f.reservado) {
        f.error = 'Hay ' + f.reservado + ' reservadas para ventas sin despachar; el conteo no puede ser menor. Despacha o revisa primero.';
        return;
      }
      aEnviar.push({ f: f, fisica: c - f.reservado });
    });
    if (!aEnviar.length) { pintar(); return; }

    var omitidos = filas.filter(function (f) { return !f.resultado && leer(f.contado) === null; }).length;
    var msg = 'Registrar el conteo de ' + plural(aEnviar.length, 'producto', 'productos') + ' en ' + contenedor.codigo + '?' +
      (omitidos ? '\n\n' + plural(omitidos, 'producto sin contar no se modifica', 'productos sin contar no se modifican') + '.' : '') +
      '\n\nEl WMS ajusta solo sus ubicaciones. El POS no se modifica.';
    if (!window.confirm(msg)) return;

    ocupado = true;
    pintar();
    var ok = 0, errores = 0, sobrantes = 0;
    for (var i = 0; i < aEnviar.length; i++) {
      var x = aEnviar[i];
      var res = await DB.wms.registrarConteo(x.f.sku, contenedor.codigo, x.fisica, sesionId);
      if (res.error) {
        x.f.error = res.error;
        errores++;
      } else {
        x.f.resultado = textoResultado(x.f, res.data);
        if (Number(res.data.o_sobrante_pendiente) > 0) sobrantes++;
        ok++;
      }
    }
    ocupado = false;
    // Terminado solo si no queda nada por corregir (errores de validacion o de la base)
    registrado = !filas.some(function (f) { return !f.resultado && (f.error || leer(f.contado) !== null); });
    pintar();

    if (errores) window.mostrarToast(plural(ok, 'conteo registrado', 'conteos registrados') + ' · ' + plural(errores, 'con error', 'con error'), 'error');
    else window.mostrarToast(plural(ok, 'conteo registrado', 'conteos registrados') + (sobrantes ? ' · ' + plural(sobrantes, 'sobrante pendiente', 'sobrantes pendientes') : ''), sobrantes ? 'info' : 'success');
    if (sobrantes) cargarSobrantes();
  }

  /* ════════════════════════════════════════════════════════════
     4. SOBRANTES PENDIENTES (IN2)
     ════════════════════════════════════════════════════════════ */
  var sobrantes = [];

  async function cargarSobrantes() {
    var res = await DB.wms.conteosAbiertos();
    if (res.error && !(res.data || []).length) {
      elSobRes.textContent = '';
      elSobLista.innerHTML = '<p class="text-xs text-red-500">No se pudieron cargar: ' + esc(res.error) + '</p>';
      return;
    }
    sobrantes = res.data || [];
    var unidades = sobrantes.reduce(function (t, c) { return t + c.sobrante; }, 0);
    elSobRes.textContent = sobrantes.length ? plural(sobrantes.length, 'conteo', 'conteos') + ' · ' + plural(unidades, 'unidad', 'unidades') : '';
    if (!sobrantes.length) {
      elSobLista.innerHTML = '<p class="text-xs text-slate-500 dark:text-slate-400">No hay sobrantes pendientes.</p>';
      return;
    }
    elSobLista.innerHTML = sobrantes.map(function (c) {
      var u = c.ubicacion;
      return '<article class="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800/60 rounded-xl p-4" data-conteo="' + esc(c.id) + '">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
              '<p class="text-sm font-medium">' + esc(c.nombre || 'Producto') + '</p>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(c.codigo_interno) + ' · ' + esc(WMSFecha.relativa(c.fecha)) + '</p>' +
            '</div>' +
            '<div class="text-right shrink-0"><p class="text-2xl font-semibold leading-none">' + c.sobrante + '</p>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">sobrante</p></div>' +
          '</div>' +
          (u ? '<div class="mt-2"><p class="font-mono text-lg font-semibold tracking-wider leading-none">' + esc(u.codigo) + '</p>' +
               '<p class="text-xs truncate">' + esc(WMSUbicacion.lugar(u)) + '</p>' +
               '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(WMSUbicacion.bodega(u)) + '</p></div>' : '') +
          '<p class="mt-2 text-xs text-slate-600 dark:text-slate-300">1. Registra en el POS un ajuste + de ' + c.sobrante + '. 2. Toca "Ubicar".</p>' +
          '<div class="mt-3 grid grid-cols-2 gap-2">' +
            '<button type="button" data-ubicar class="py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium">Ubicar ' + c.sobrante + '</button>' +
            '<button type="button" data-descartar class="py-2.5 rounded-xl text-sm border border-slate-200 dark:border-slate-700">Descartar</button>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  async function cerrarSobrante(id, accion, boton) {
    var c = sobrantes.filter(function (x) { return x.id === id; })[0];
    if (!c || ocupado) return;
    var cod = c.ubicacion ? c.ubicacion.codigo : '';
    if (accion === 'DESCARTAR' && !window.confirm('Descartar el sobrante de ' + c.sobrante + ' de ' + c.codigo_interno + '?\n\nUsalo si fue un error de conteo. No mueve stock.')) return;

    ocupado = true;
    if (boton) { boton.disabled = true; boton.textContent = '...'; }
    if (accion === 'UBICAR') await sincronizar();        // trae el ajuste + del POS
    var res = await DB.wms.cerrarSobrante(id, accion);
    ocupado = false;
    if (res.error) {
      window.mostrarToast(res.error, 'error');
    } else if (accion === 'UBICAR') {
      window.mostrarToast(plural(Number(res.data) || c.sobrante, 'unidad ubicada', 'unidades ubicadas') + ' en ' + cod, 'success');
    } else {
      window.mostrarToast('Sobrante descartado', 'success');
    }
    await cargarSobrantes();
    if (contenedor && !registrado && cod === contenedor.codigo) validarContenedor();
  }

  /* ---------- Eventos ---------- */
  inCodigo.addEventListener('input', validarContenedor);
  elLista.addEventListener('input', function (e) {
    var i = e.target.getAttribute && e.target.getAttribute('data-contado');
    if (i === null || i === undefined) return;
    e.target.value = String(e.target.value || '').replace(/\D/g, '').slice(0, 5);
    filas[+i].contado = e.target.value;
    filas[+i].error = null;
    var conValor = filas.filter(function (f) { return !f.resultado && leer(f.contado) !== null; }).length;
    btnRegistrar.disabled = ocupado || registrado || conValor === 0;
    btnRegistrar.textContent = conValor ? 'Registrar conteo de ' + plural(conValor, 'producto', 'productos') + ' en ' + contenedor.codigo : 'Registrar conteo';
    elResumen.textContent = plural(filas.length, 'producto', 'productos') + ' · ' + conValor + ' contados';
  });
  elLista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-coincide]');
    if (b) { var f = filas[+b.getAttribute('data-coincide')]; f.contado = String(esperado(f)); f.error = null; pintar(); return; }
    var q = e.target.closest('[data-quitar]');
    if (q) { filas.splice(+q.getAttribute('data-quitar'), 1); pintar(); }
  });
  btnAgregar.addEventListener('click', function () {
    if (!puedeAgregar().ok) return;
    elBuscarWrap.classList.toggle('hidden');
    if (!elBuscarWrap.classList.contains('hidden')) inBuscar.focus();
  });
  inBuscar.addEventListener('input', function () { clearTimeout(tBusca); tBusca = setTimeout(buscar, 350); });
  elBuscarRes.addEventListener('click', function (e) {
    var b = e.target.closest('[data-elegir]');
    if (b) agregar(b.getAttribute('data-elegir'), b.getAttribute('data-cod'), b.getAttribute('data-nom'));
  });
  btnRegistrar.addEventListener('click', registrar);
  btnOtro.addEventListener('click', function () {
    inCodigo.value = '';
    limpiarConteo();
    info('Digita el codigo del adhesivo de la bolsa, caja o zona suelta que vas a contar.');
    inCodigo.focus();
  });
  elSobLista.addEventListener('click', function (e) {
    var art = e.target.closest('[data-conteo]');
    if (!art) return;
    var id = art.getAttribute('data-conteo');
    var u = e.target.closest('[data-ubicar]');
    if (u) { cerrarSobrante(id, 'UBICAR', u); return; }
    var d = e.target.closest('[data-descartar]');
    if (d) cerrarSobrante(id, 'DESCARTAR', d);
  });

  /* ---------- Inicio ---------- */
  (async function () {
    await sincronizar();
    cargarSobrantes();
    var c = new URLSearchParams(window.location.search).get('contenedor');
    if (c) { inCodigo.value = c; validarContenedor(); }
    else if (window.matchMedia('(min-width: 1024px)').matches) inCodigo.focus();
  })();
})();
