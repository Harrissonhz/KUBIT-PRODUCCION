/* ============================================================
   traslados.js — Kubit-WMS — Traslados (pasos B4-B5, HU-06)
   ------------------------------------------------------------
   Decision T1: el traslado empieza por el CONTENEDOR DE ORIGEN.
   Decision T2: no se sincroniza con el POS (solo se mueve UBICADO).

   B4 — Origen:
     1. Se digita el codigo del contenedor de origen (5 digitos).
     2. Validacion en pantalla: formato ^[1-9]\d{4}$, existe, activo,
        aloja stock (bolsa, caja o zona suelta).
     3. Lugar y bodega (V1) y contenido agrupado por producto:
        UBICADO (movible) y RESERVADO (se informa, no se mueve).
     4. Se elige el producto (solo si hay uno movible, se elige solo).
   B5 — Destino, cantidad y confirmacion:
     5. Se digita el destino; validacion en pantalla: formato, existe,
        activo, aloja stock, distinto del origen y, si es bolsa o caja
        (mono-SKU), sin otro producto (asignado o con mercancia).
        Se muestra lugar, bodega y cuanto hay ya de ese producto.
     6. Cantidad con − / + / Todo, maximo = UBICADO en el origen.
     7. "Mover N de XXXXX a YYYYY" → DB.wms.trasladar() (la base
        revalida todo en una transaccion).
     8. Se recarga el origen; si al producto le quedan unidades, sigue
        elegido y el destino se conserva para repetir el movimiento.
   Parametro opcional: traslados.html?origen=30110
   ============================================================ */
(function () {
  if (!window.WMSLayout) return;

  var $ = function (id) { return document.getElementById(id); };
  // Origen
  var inOrigen = $('origen-codigo');
  var elInfo = $('origen-info');
  var elContenido = $('origen-contenido');
  var elResumen = $('origen-resumen');
  var elLista = $('origen-lista');
  // Seleccion y destino
  var elSel = $('seleccion');
  var form = $('form-traslado');
  var inDestino = $('destino-codigo');
  var elDestInfo = $('destino-info');
  var inCantidad = $('cantidad');
  var elCantInfo = $('cant-info');
  var btnMover = $('btn-mover');

  var origen = null;        // contenedor de origen validado
  var contenido = [];       // [{ producto_detalle_id, codigo_interno, producto, ubicado, reservado }]
  var sel = null;           // linea elegida
  var destino = null;       // contenedor de destino validado
  var consulta = 0;         // descarta respuestas viejas (origen)
  var consultaDest = 0;     // descarta respuestas viejas (destino)
  var ocupado = false;

  /* ---------- Utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function mensaje(el, html, tipo) {
    var color = tipo === 'error' ? 'text-red-500'
      : tipo === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';
    el.className = 'mt-2 min-h-[2.5rem] text-xs ' + color;
    el.innerHTML = html;
  }
  function info(html, tipo) { mensaje(elInfo, html, tipo); }
  function infoDestino(html, tipo) { mensaje(elDestInfo, html, tipo); }

  function limpiar() {
    origen = null;
    contenido = [];
    sel = null;
    elContenido.classList.add('hidden');
    elLista.innerHTML = '';
    elSel.classList.add('hidden');
  }

  /* ════════════════════════════════════════════════════════════
     B4 — ORIGEN
     ════════════════════════════════════════════════════════════ */
  // mantenerSku: tras un traslado, volver a elegir el mismo producto si le quedan unidades
  async function validarOrigen(mantenerSku) {
    inOrigen.value = String(inOrigen.value || '').replace(/\D/g, '').slice(0, 5);
    var codigo = inOrigen.value;
    limpiar();
    var n = ++consulta;

    if (codigo.length < 5) {
      info(codigo.length ? 'Escribe los 5 digitos del adhesivo.' : 'Digita el codigo del adhesivo de la bolsa, caja o zona suelta de donde vas a sacar.');
      return;
    }
    if (!/^[1-9]\d{4}$/.test(codigo)) {
      info('Codigo invalido: el primer digito es la bodega (1 a 9).', 'error');
      return;
    }
    info('Verificando...');

    var res = await DB.wms.ubicacionPorCodigo(codigo);
    if (n !== consulta) return;
    if (res.error) { info(esc(res.error), 'error'); return; }
    var u = res.data;
    if (!u) { info('No existe el contenedor ' + esc(codigo) + '.', 'error'); return; }
    var etiqueta = WMSUbicacion.etiqueta(u.tipo).toLowerCase();
    if (u.activo === false) { info('El contenedor ' + esc(codigo) + ' esta inactivo.', 'error'); return; }
    if (!u.es_hoja) {
      info(esc(codigo) + ' es un puesto (' + etiqueta + '). Digita la bolsa, caja o zona suelta de donde vas a sacar.', 'error');
      return;
    }

    // Lugar y bodega (V1) + contenido, en paralelo
    var r = await Promise.all([
      WMSUbicacion.cargar([u.id]),
      DB.select('wms_v_stock_detalle', {
        select: 'producto_detalle_id,codigo_interno,producto,estado_fase,cantidad',
        filters: [{ col: 'ubicacion_id', op: 'eq', val: u.id }],
        incluirEliminados: true,
        orderBy: 'producto'
      })
    ]);
    if (n !== consulta) return;
    var det = r[0].data && r[0].data[u.id];
    var st = r[1];
    if (st.error) { info(esc(st.error), 'error'); return; }

    origen = u;
    info(
      (det
        ? '<span class="block text-sm font-medium">' + esc(WMSUbicacion.lugar(det)) + '</span>' +
          '<span class="block">' + esc(WMSUbicacion.bodega(det)) + '</span>'
        : '') +
      '<span class="block">' + (u.mono_sku ? 'Un solo producto' : 'Varios productos') + '</span>',
      'ok');

    // Agrupar por producto: ubicado (se puede mover) y reservado (no)
    var porSku = {};
    (st.data || []).forEach(function (f) {
      var p = porSku[f.producto_detalle_id] || (porSku[f.producto_detalle_id] = {
        producto_detalle_id: f.producto_detalle_id,
        codigo_interno: f.codigo_interno,
        producto: f.producto,
        ubicado: 0,
        reservado: 0
      });
      if (f.estado_fase === 'UBICADO') p.ubicado += Number(f.cantidad) || 0;
      else if (f.estado_fase === 'RESERVADO') p.reservado += Number(f.cantidad) || 0;
    });
    contenido = Object.keys(porSku).map(function (k) { return porSku[k]; })
      .sort(function (a, b) { return String(a.producto || '').localeCompare(String(b.producto || ''), 'es'); });

    pintarContenido();

    // Elegir: el mismo de antes (si le quedan unidades) o el unico movible
    var movibles = contenido.filter(function (c) { return c.ubicado > 0; });
    var previo = mantenerSku && movibles.filter(function (c) { return c.producto_detalle_id === mantenerSku; })[0];
    if (previo) elegir(previo.producto_detalle_id, true);
    else if (movibles.length === 1) elegir(movibles[0].producto_detalle_id);
  }

  function pintarContenido() {
    elContenido.classList.remove('hidden');
    var unidades = contenido.reduce(function (s, c) { return s + c.ubicado; }, 0);
    elResumen.textContent = plural(contenido.length, 'producto', 'productos') + ' · ' + plural(unidades, 'unidad', 'unidades');

    if (!contenido.length) {
      elLista.innerHTML =
        '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">' +
          '<p class="text-sm font-medium">Contenedor vacio</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">No hay nada ubicado en ' + esc(origen.codigo) + '.</p>' +
        '</div>';
      return;
    }

    elLista.innerHTML = contenido.map(function (c) {
      var elegido = sel && sel.producto_detalle_id === c.producto_detalle_id;
      var movible = c.ubicado > 0;
      var clases = elegido
        ? 'border-slate-950 dark:border-white ring-2 ring-slate-950 dark:ring-white'
        : 'border-slate-200/60 dark:border-slate-800';
      var cuerpo =
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-medium">' + esc(c.producto || '') + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">' + esc(c.codigo_interno || '') + '</p>' +
            (c.reservado ? '<p class="text-xs text-sky-700 dark:text-sky-400 mt-1">' + plural(c.reservado, 'unidad reservada', 'unidades reservadas') + ' (no se trasladan)</p>' : '') +
          '</div>' +
          '<div class="text-right shrink-0">' +
            '<p class="text-2xl font-semibold leading-none">' + c.ubicado + '</p>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">ubicadas</p>' +
          '</div>' +
        '</div>';
      if (!movible) {
        return '<div class="bg-white dark:bg-slate-900 border rounded-xl p-4 opacity-60 ' + clases + '">' + cuerpo + '</div>';
      }
      return '<button type="button" data-sku="' + esc(c.producto_detalle_id) + '" aria-pressed="' + elegido + '" ' +
        'class="w-full text-left bg-white dark:bg-slate-900 border rounded-xl p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 ' + clases + '">' +
        cuerpo + '</button>';
    }).join('');
  }

  // sinDesplazar: no mover la pantalla (se usa al recargar tras un traslado)
  function elegir(id, sinDesplazar) {
    sel = contenido.filter(function (c) { return c.producto_detalle_id === id; })[0] || null;
    if (!sel || sel.ubicado < 1) { sel = null; return; }
    pintarContenido();
    $('sel-producto').textContent = sel.producto || '';
    $('sel-codigo').textContent = (sel.codigo_interno || '') + ' · desde ' + origen.codigo;
    $('sel-cantidad').textContent = sel.ubicado;
    inCantidad.value = String(sel.ubicado);
    elSel.classList.remove('hidden');
    actualizarCantidad();
    validarDestino();
    if (!sinDesplazar) elSel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ════════════════════════════════════════════════════════════
     B5 — DESTINO
     ════════════════════════════════════════════════════════════ */
  async function validarDestino() {
    inDestino.value = String(inDestino.value || '').replace(/\D/g, '').slice(0, 5);
    var codigo = inDestino.value;
    destino = null;
    actualizarBoton();
    var n = ++consultaDest;

    if (!sel) { infoDestino(''); return; }
    if (codigo.length < 5) {
      infoDestino(codigo.length ? 'Escribe los 5 digitos del adhesivo.' : 'Digita el codigo del adhesivo de la bolsa, caja o zona suelta donde vas a dejar.');
      return;
    }
    if (!/^[1-9]\d{4}$/.test(codigo)) {
      infoDestino('Codigo invalido: el primer digito es la bodega (1 a 9).', 'error');
      return;
    }
    if (origen && codigo === origen.codigo) {
      infoDestino('El destino es el mismo contenedor de origen.', 'error');
      return;
    }
    infoDestino('Verificando...');

    var res = await DB.wms.ubicacionPorCodigo(codigo);
    if (n !== consultaDest) return;
    if (res.error) { infoDestino(esc(res.error), 'error'); return; }
    var u = res.data;
    if (!u) { infoDestino('No existe el contenedor ' + esc(codigo) + '. Crealo en Configuracion.', 'error'); return; }
    var etiqueta = WMSUbicacion.etiqueta(u.tipo).toLowerCase();
    if (u.activo === false) { infoDestino('El contenedor ' + esc(codigo) + ' esta inactivo.', 'error'); return; }
    if (!u.es_hoja) {
      infoDestino(esc(codigo) + ' es un puesto (' + etiqueta + '). Usa una bolsa, caja o zona suelta de ese puesto.', 'error');
      return;
    }
    if (u.mono_sku && u.producto_detalle_id && u.producto_detalle_id !== sel.producto_detalle_id) {
      infoDestino('La ' + etiqueta + ' ' + esc(codigo) + ' ya tiene otro producto. Una ' + etiqueta + ' guarda un solo producto.', 'error');
      return;
    }

    // Lugar y bodega (V1) + lo que ya hay en el destino
    var r = await Promise.all([
      WMSUbicacion.cargar([u.id]),
      DB.wms.stockEnUbicaciones([u.id])
    ]);
    if (n !== consultaDest) return;
    var det = r[0].data && r[0].data[u.id];
    var st = r[1];
    if (st.error) { infoDestino(esc(st.error), 'error'); return; }

    var filas = (st.data || []).filter(function (f) { return (Number(f.cantidad) || 0) > 0; });
    var otros = filas.filter(function (f) { return f.producto_detalle_id !== sel.producto_detalle_id; });
    if (u.mono_sku && otros.length) {
      infoDestino('La ' + etiqueta + ' ' + esc(codigo) + ' tiene otro producto. Una ' + etiqueta + ' guarda un solo producto.', 'error');
      return;
    }
    var yaHay = filas.filter(function (f) {
      return f.producto_detalle_id === sel.producto_detalle_id && f.estado_fase === 'UBICADO';
    }).reduce(function (s, f) { return s + (Number(f.cantidad) || 0); }, 0);

    destino = u;
    infoDestino(
      (det
        ? '<span class="block text-sm font-medium">' + esc(WMSUbicacion.lugar(det)) + '</span>' +
          '<span class="block">' + esc(WMSUbicacion.bodega(det)) + '</span>'
        : '') +
      '<span class="block">' + (u.mono_sku ? 'Un solo producto' : 'Varios productos') +
        (yaHay ? ' · ya tiene ' + plural(yaHay, 'unidad', 'unidades') + ' de este producto' : (filas.length ? '' : ' · vacio')) +
      '</span>',
      'ok');
    actualizarBoton();
  }

  /* ---------- Cantidad ---------- */
  function leerCantidad() {
    var v = parseInt(String(inCantidad.value || '').replace(/\D/g, ''), 10);
    return isNaN(v) ? 0 : v;
  }

  function actualizarCantidad() {
    if (!sel) return;
    inCantidad.value = String(inCantidad.value || '').replace(/\D/g, '').slice(0, 5);
    var max = sel.ubicado;
    var c = leerCantidad();
    if (c > max) {
      elCantInfo.textContent = 'Maximo ' + max + ' (ubicadas en el origen).';
      elCantInfo.className = 'text-xs text-red-500';
    } else {
      elCantInfo.textContent = 'Disponible para mover: ' + max;
      elCantInfo.className = 'text-xs text-slate-500 dark:text-slate-400';
    }
    actualizarBoton();
  }

  function cambiarCantidad(delta) {
    if (!sel) return;
    var c = Math.min(Math.max(leerCantidad() + delta, 1), Math.max(sel.ubicado, 1));
    inCantidad.value = String(c);
    actualizarCantidad();
  }

  function actualizarBoton() {
    var max = sel ? sel.ubicado : 0;
    var c = leerCantidad();
    var listo = !ocupado && sel && origen && destino && c >= 1 && c <= max;
    btnMover.disabled = !listo;
    btnMover.textContent = ocupado ? 'Moviendo...'
      : (listo ? 'Mover ' + plural(c, 'unidad', 'unidades') + ' de ' + origen.codigo + ' a ' + destino.codigo : 'Mover');
  }

  /* ---------- Confirmar traslado ---------- */
  async function mover(e) {
    e.preventDefault();
    if (btnMover.disabled) return;
    var c = leerCantidad();
    var de = origen.codigo;
    var a = destino.codigo;
    var sku = sel.producto_detalle_id;
    ocupado = true;
    actualizarBoton();

    var res = await DB.wms.trasladar(sku, de, a, c);
    ocupado = false;
    if (res.error) {
      actualizarBoton();
      window.mostrarToast(res.error, 'error');
      return;
    }
    window.mostrarToast(plural(c, 'unidad movida', 'unidades movidas') + ' de ' + de + ' a ' + a, 'success');

    // Recargar el origen; el destino se conserva para repetir con otro producto
    await validarOrigen(sku);
    if (!sel) {
      elSel.classList.add('hidden');
    }
  }

  /* ---------- Eventos ---------- */
  inOrigen.addEventListener('input', function () { validarOrigen(); });
  elLista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sku]');
    if (b) elegir(b.getAttribute('data-sku'));
  });
  $('btn-cambiar').addEventListener('click', function () {
    sel = null;
    destino = null;
    elSel.classList.add('hidden');
    pintarContenido();
    elContenido.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  inDestino.addEventListener('input', validarDestino);
  inCantidad.addEventListener('input', actualizarCantidad);
  $('btn-menos').addEventListener('click', function () { cambiarCantidad(-1); });
  $('btn-mas').addEventListener('click', function () { cambiarCantidad(1); });
  $('btn-todo').addEventListener('click', function () {
    if (!sel) return;
    inCantidad.value = String(sel.ubicado);
    actualizarCantidad();
  });
  form.addEventListener('submit', mover);

  /* ---------- Inicio ---------- */
  var o = new URLSearchParams(window.location.search).get('origen');
  if (o) {
    inOrigen.value = o;
    validarOrigen();
  } else if (window.matchMedia('(min-width: 1024px)').matches) {
    inOrigen.focus();
  }
})();
