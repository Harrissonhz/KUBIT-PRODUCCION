/* ============================================================
   pedidos-web.js — Kubit POS — T4: pedidos de la Tienda Virtual
   ------------------------------------------------------------
   Muestra los pedidos web (pestanas "Por gestionar" y "Gestionados 30 dias")
   con los datos para gestionarlos por WhatsApp, y permite cerrarlos:
     - "Venta registrada" (CONFIRMADO) con numero de venta opcional
     - "No se concreto"   (CANCELADO)
     y una nota opcional.
   Cada pedido es una tarjeta colapsable (<details>), cerrada por defecto:
   el encabezado muestra numero, antiguedad, cliente, total, medio de pago y
   el aviso de stock; al abrirla se ven los datos completos y los botones.
   NO crea ventas, clientes ni movimientos de inventario: la venta y el cliente
   se registran a mano en el POS (canal Web; cliente real o 222222222222).
   Datos: DB.pedidosWeb (specs/18-pos-pedidos-web.sql).
   ============================================================ */
(function () {
  'use strict';

  var VISTA = 'pendientes';
  var PEDIDOS = [];
  var CERRANDO = null;     // pedido que se esta cerrando
  var _guardando = false;

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  /* ─── Utilidades ─── */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function moneda(v) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v) || 0);
  }

  function fechaHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function haceCuanto(iso, ahora) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var min = Math.max(0, Math.floor(((ahora || Date.now()) - d.getTime()) / 60000));
    if (min < 1) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    var dias = Math.floor(h / 24);
    return 'hace ' + dias + (dias === 1 ? ' dia' : ' dias');
  }

  var MEDIOS = {
    transferencia: 'Transferencia Bre-B',
    mercado_pago: 'Tarjeta (Mercado Pago)',
    tarjeta: 'Tarjeta (Mercado Pago)',
    contraentrega: 'Contraentrega'
  };
  function textoMedio(m) { return MEDIOS[m] || (m ? String(m) : 'Sin dato'); }

  function primerNombre(nombre) {
    var p = String(nombre || '').trim().split(/\s+/)[0];
    return p || '';
  }

  // Celular colombiano de 10 digitos -> 57XXXXXXXXXX para wa.me
  function celularWhatsApp(cel) {
    var d = String(cel || '').replace(/\D/g, '');
    if (d.length === 10) return '57' + d;
    if (d.length === 12 && d.indexOf('57') === 0) return d;
    return null;
  }

  function mensajeWhatsApp(p) {
    var nombre = primerNombre(p.comprador && p.comprador.nombre);
    return 'Hola' + (nombre ? ' ' + nombre : '') + ', te escribimos de OutletShop por tu pedido ' +
      p.numero_pedido + ' por ' + moneda(p.total);
  }

  function urlWhatsApp(p) {
    var cel = celularWhatsApp(p.comprador && p.comprador.celular);
    if (!cel) return null;
    return 'https://wa.me/' + cel + '?text=' + encodeURIComponent(mensajeWhatsApp(p));
  }

  function textoAtributos(a) {
    if (!a || typeof a !== 'object') return '';
    return Object.keys(a).map(function (k) { return a[k]; })
      .filter(function (v) { return v && typeof v === 'string'; }).join(' / ');
  }

  function datosCliente(p) {
    var c = p.comprador || {};
    var lineas = [
      'Nombre: ' + (c.nombre || ''),
      'Celular: ' + (c.celular || '')
    ];
    if (c.email) lineas.push('Correo: ' + c.email);
    lineas.push('Direccion: ' + (c.direccion || ''));
    lineas.push('Ciudad: ' + (c.ciudad || '') + (c.departamento ? ', ' + c.departamento : ''));
    lineas.push('Pedido web: ' + p.numero_pedido);
    return lineas.join('\n');
  }

  function etiquetaEstado(p) {
    if (p.estado === 'CONFIRMADO') return 'Venta registrada';
    if (p.estado === 'CANCELADO') return 'No se concreto';
    return p.estado;
  }

  /* ─── Render ─── */
  // Colores de texto explicitos para modo claro y oscuro (sin depender del color heredado)
  var TXT = 'text-slate-700 dark:text-slate-200';
  var TXT_FUERTE = 'text-slate-900 dark:text-white';

  function htmlPedido(p, ahora) {
    var c = p.comprador || {};
    var wa = urlWhatsApp(p);
    var pendiente = p.estado === 'PENDIENTE';

    var lineas = (p.lineas || []).map(function (l) {
      var falta = Number(l.stock_actual) < Number(l.cantidad);
      var attrs = textoAtributos(l.atributos);
      return '<tr class="border-t border-slate-100 dark:border-slate-800">' +
        '<td class="py-2 pr-3"><p class="text-sm ' + TXT_FUERTE + '">' + esc(l.nombre || 'Producto') + '</p>' +
          (attrs ? '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(attrs) + '</p>' : '') +
          '<p class="text-[11px] font-mono text-slate-400">SKU: ' + esc(l.codigo || '-') + '</p></td>' +
        '<td class="py-2 px-2 text-sm text-center ' + TXT + '">' + esc(l.cantidad) + '</td>' +
        '<td class="py-2 px-2 text-sm text-right whitespace-nowrap ' + TXT + '">' + moneda(l.precio_unitario) + '</td>' +
        '<td class="py-2 pl-2 text-sm text-right whitespace-nowrap font-medium ' + TXT_FUERTE + '">' + moneda(l.total) +
          '<p class="text-[11px] font-normal ' + (falta ? 'text-red-500 font-medium' : 'text-slate-400') + '">Stock hoy: ' + esc(l.stock_actual == null ? '-' : l.stock_actual) + '</p></td>' +
      '</tr>';
    }).join('');

    var gestion = '';
    if (!pendiente) {
      gestion = '<div class="mt-3 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">' +
        '<p><strong class="text-slate-700 dark:text-slate-300">' + esc(etiquetaEstado(p)) + '</strong>' +
          (p.gestionado_at ? ' · ' + esc(fechaHora(p.gestionado_at)) : '') +
          (p.gestionado_por ? ' · ' + esc(p.gestionado_por) : '') + '</p>' +
        (p.numero_venta ? '<p>Venta: <span class="font-mono">' + esc(p.numero_venta) + '</span></p>' : '') +
        (p.nota_gestion ? '<p>Nota: ' + esc(p.nota_gestion) + '</p>' : '') +
      '</div>';
    }

    // Encabezado (siempre visible): numero, antiguedad, cliente, total, medio, aviso de stock
    var resumen =
      '<summary class="flex items-start justify-between gap-3 p-4 sm:p-5 cursor-pointer select-none list-none">' +
        '<div class="min-w-0">' +
          '<p class="text-sm font-semibold ' + TXT_FUERTE + ' font-mono">' + esc(p.numero_pedido) + '</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(fechaHora(p.created_at)) + ' · ' + esc(haceCuanto(p.created_at, ahora)) + '</p>' +
          '<p class="text-sm ' + TXT + ' mt-1 truncate">' + esc(c.nombre || '') +
            (c.ciudad ? ' <span class="text-slate-400">· ' + esc(c.ciudad) + '</span>' : '') + '</p>' +
          '<div class="flex flex-wrap gap-1.5 mt-1.5">' +
            (p.stock_insuficiente ? '<span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400">Stock insuficiente</span>' : '') +
            (!pendiente ? '<span class="text-[11px] font-medium px-2 py-0.5 rounded-full ' +
              (p.estado === 'CONFIRMADO' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') +
              '">' + esc(etiquetaEstado(p)) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="flex items-start gap-3 shrink-0">' +
          '<div class="text-right">' +
            '<p class="text-lg font-bold ' + TXT_FUERTE + '">' + moneda(p.total) + '</p>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(textoMedio(p.medio_pago)) + '</p>' +
          '</div>' +
          '<svg class="chevron w-5 h-5 mt-1 text-slate-400 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>' +
        '</div>' +
      '</summary>';

    // Detalle (al expandir)
    var detalle =
      '<div class="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-slate-100 dark:border-slate-800">' +
      (p.stock_insuficiente
        ? '<div class="mt-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400"><strong>Stock insuficiente:</strong> ' + esc(p.aviso_stock || '') + '</div>'
        : '') +
      '<div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div class="text-sm space-y-0.5">' +
          '<p class="text-xs font-medium uppercase tracking-wider text-slate-400">Cliente</p>' +
          '<p class="' + TXT_FUERTE + ' font-medium">' + esc(c.nombre || '') + '</p>' +
          '<p class="' + TXT + '">Cel. <span class="font-mono">' + esc(c.celular || '') + '</span></p>' +
          (c.email ? '<p class="' + TXT + ' break-all">' + esc(c.email) + '</p>' : '') +
        '</div>' +
        '<div class="text-sm space-y-0.5">' +
          '<p class="text-xs font-medium uppercase tracking-wider text-slate-400">Envio</p>' +
          '<p class="' + TXT + '">' + esc(c.direccion || '') + '</p>' +
          '<p class="' + TXT + '">' + esc(c.ciudad || '') + (c.departamento ? ', ' + esc(c.departamento) : '') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 overflow-x-auto"><table class="w-full">' +
        '<thead><tr class="text-[11px] uppercase tracking-wider text-slate-400"><th class="text-left font-medium pb-1">Producto</th><th class="font-medium pb-1">Cant.</th><th class="text-right font-medium pb-1">Precio</th><th class="text-right font-medium pb-1">Total</th></tr></thead>' +
        '<tbody>' + lineas + '</tbody>' +
      '</table></div>' +
      '<div class="mt-3 text-sm flex flex-wrap justify-end gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">' +
        '<span>Subtotal: ' + moneda(p.subtotal) + '</span>' +
        '<span>Envio: ' + (Number(p.costo_envio) === 0 ? 'Gratis' : moneda(p.costo_envio)) + '</span>' +
        '<span class="font-semibold ' + TXT_FUERTE + '">Total: ' + moneda(p.total) + '</span>' +
      '</div>' +
      gestion +
      '<div class="mt-4 flex flex-col sm:flex-row gap-2">' +
        (wa
          ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener" class="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium text-center hover:bg-green-700 transition-colors">Escribir por WhatsApp</a>'
          : '<span class="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 text-sm text-center">Celular no valido</span>') +
        '<button type="button" data-accion="copiar" data-id="' + esc(p.id) + '" class="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Copiar datos del cliente</button>' +
        (pendiente
          ? '<button type="button" data-accion="cerrar" data-id="' + esc(p.id) + '" class="flex-1 py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">Cerrar pedido</button>'
          : '') +
      '</div>' +
      '</div>';

    // Colapsada por defecto (sin atributo "open"); grupo-card ya existe en css/estilo.css
    return '<details class="grupo-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl" data-pedido="' + esc(p.id) + '">' +
      resumen + detalle +
    '</details>';
  }

  function pintarTabs() {
    document.querySelectorAll('.tab-pw').forEach(function (b) {
      var activa = b.getAttribute('data-vista') === VISTA;
      b.className = 'tab-pw flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ' +
        (activa ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white');
      b.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
  }

  function pintarLista() {
    var ahora = Date.now();
    $('pw-lista').innerHTML = PEDIDOS.map(function (p) { return htmlPedido(p, ahora); }).join('');
    if (!PEDIDOS.length) {
      $('pw-estado').textContent = VISTA === 'pendientes'
        ? 'No hay pedidos web por gestionar.'
        : 'No hay pedidos gestionados en los ultimos 30 dias.';
    } else {
      $('pw-estado').textContent = (PEDIDOS.length === 1 ? '1 pedido' : PEDIDOS.length + ' pedidos') + ' · toca un pedido para ver el detalle';
    }
    if (VISTA === 'pendientes') {
      $('tab-contador').textContent = PEDIDOS.length ? '(' + PEDIDOS.length + ')' : '';
      if (window.KubitPedidosWebAviso) window.KubitPedidosWebAviso.actualizarContador(PEDIDOS.length);
    }
  }

  async function cargar() {
    pintarTabs();
    $('pw-estado').textContent = 'Cargando...';
    $('pw-lista').innerHTML = '';
    var res = await DB.pedidosWeb.listar(VISTA);
    if (res.error) {
      PEDIDOS = [];
      $('pw-estado').textContent = res.error;
      return;
    }
    PEDIDOS = res.data || [];
    pintarLista();
  }

  /* ─── Copiar datos ─── */
  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(false);
  }

  /* ─── Cerrar pedido ─── */
  function abrirCerrar(id) {
    CERRANDO = PEDIDOS.find(function (p) { return p.id === id; }) || null;
    if (!CERRANDO) return;
    $('cerrar-numero').textContent = CERRANDO.numero_pedido;
    document.querySelectorAll('input[name="cerrar-resultado"]').forEach(function (r) { r.checked = false; });
    $('cerrar-numero-venta').value = '';
    $('cerrar-nota').value = '';
    $('cerrar-venta-wrap').classList.add('hidden');
    $('cerrar-error').classList.add('hidden');
    $('btn-cerrar-confirmar').disabled = true;
    $('modal-cerrar').classList.remove('hidden');
  }

  function cerrarModal() {
    $('modal-cerrar').classList.add('hidden');
    CERRANDO = null;
  }

  function resultadoElegido() {
    var r = document.querySelector('input[name="cerrar-resultado"]:checked');
    return r ? r.value : null;
  }

  async function confirmarCierre() {
    if (_guardando || !CERRANDO) return;
    var resultado = resultadoElegido();
    if (!resultado) return;
    _guardando = true;
    $('btn-cerrar-confirmar').disabled = true;
    $('cerrar-error').classList.add('hidden');
    var numeroVenta = resultado === 'venta' ? $('cerrar-numero-venta').value : '';
    var res = await DB.pedidosWeb.cerrar(CERRANDO.id, resultado, numeroVenta, $('cerrar-nota').value);
    _guardando = false;
    if (res.error) {
      $('cerrar-error').textContent = res.error;
      $('cerrar-error').classList.remove('hidden');
      $('btn-cerrar-confirmar').disabled = false;
      return;
    }
    var numero = CERRANDO.numero_pedido;
    cerrarModal();
    if (window.mostrarToast) window.mostrarToast('Pedido ' + numero + ' cerrado', 'success');
    await cargar();
  }

  /* ─── Eventos ─── */
  function toggleSidebar() {
    var sidebar = $('sidebar');
    var overlay = $('sidebar-overlay');
    var abierto = sidebar.classList.contains('translate-x-0');
    if (abierto) {
      sidebar.classList.remove('translate-x-0');
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    } else {
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
      overlay.classList.remove('hidden');
    }
  }

  function bindearEventos() {
    $('btn-dark').addEventListener('click', function () {
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });
    $('btn-menu').addEventListener('click', toggleSidebar);
    $('btn-cerrar-menu').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', toggleSidebar);
    $('btn-recargar').addEventListener('click', cargar);

    document.querySelectorAll('.tab-pw').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-vista');
        if (v === VISTA) return;
        VISTA = v;
        cargar();
      });
    });

    $('pw-lista').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-accion]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-accion') === 'cerrar') abrirCerrar(id);
      if (btn.getAttribute('data-accion') === 'copiar') {
        var p = PEDIDOS.find(function (x) { return x.id === id; });
        if (!p) return;
        copiar(datosCliente(p)).then(function (ok) {
          if (window.mostrarToast) window.mostrarToast(ok ? 'Datos del cliente copiados' : 'No se pudo copiar', ok ? 'success' : 'error');
        });
      }
    });

    document.querySelectorAll('input[name="cerrar-resultado"]').forEach(function (r) {
      r.addEventListener('change', function () {
        $('cerrar-venta-wrap').classList.toggle('hidden', resultadoElegido() !== 'venta');
        $('btn-cerrar-confirmar').disabled = !resultadoElegido();
      });
    });
    $('btn-cerrar-cancelar').addEventListener('click', cerrarModal);
    $('btn-cerrar-confirmar').addEventListener('click', confirmarCierre);
    $('modal-cerrar').addEventListener('click', function (e) { if (e.target === $('modal-cerrar')) cerrarModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal-cerrar').classList.contains('hidden')) cerrarModal();
    });
  }

  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();
    bindearEventos();
    await cargar();
  }

  // Para pruebas automatizadas
  window.__pedidosWebPagina = {
    htmlPedido: htmlPedido, mensajeWhatsApp: mensajeWhatsApp, urlWhatsApp: urlWhatsApp,
    celularWhatsApp: celularWhatsApp, datosCliente: datosCliente, haceCuanto: haceCuanto, textoMedio: textoMedio
  };

  document.addEventListener('DOMContentLoaded', init);
})();
