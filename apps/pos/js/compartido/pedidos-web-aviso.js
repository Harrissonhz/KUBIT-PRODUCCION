/* ============================================================
   pedidos-web-aviso.js — Kubit POS — T4: aviso de pedidos web
   ------------------------------------------------------------
   Lo carga database.js (cargarLinkTienda -> cargarAvisoPedidosWeb) en todas
   las paginas del POS que tienen menu. Archivo independiente y de SOLO LECTURA:
     - Agrega "Pedidos web (N)" al menu lateral (debajo de Dashboard).
     - Si hay pedidos PENDIENTE muestra un aviso emergente UNA vez por sesion
       (por inicio de sesion) y una tarjeta en el Panel.
   Si algo falla (sin sesion, sin red, funcion inexistente) no muestra nada,
   no redirige y no toca el resto de la pagina.
   Datos: rpc pos_pedidos_web_contar (specs/18-pos-pedidos-web.sql).
   ============================================================ */
(function () {
  'use strict';

  var CLAVE_AVISO = 'kubit_aviso_pedidos_web';   // sessionStorage: loginAt del aviso ya mostrado

  function paginaActual() {
    return (window.location.pathname.split('/').pop() || '').toLowerCase();
  }

  function rutaPedidosWeb() {
    // Desde subcarpetas (ej. herramientas/) se sube un nivel
    var path = window.location.pathname;
    return /\/herramientas\/[^\/]*$/.test(path) ? '../pedidos-web.html' : 'pedidos-web.html';
  }

  function textoPedidos(n) {
    return n === 1 ? '1 pedido web' : n + ' pedidos web';
  }

  /* ─── Menu lateral ─── */
  function asegurarLinkMenu() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return null;
    var existente = document.getElementById('link-pedidos-web');
    if (existente) return existente;
    var dashboard = sidebar.querySelector('a[href="panel.html"], a[href="../panel.html"]');
    var activo = paginaActual() === 'pedidos-web.html';
    var a = document.createElement('a');
    a.id = 'link-pedidos-web';
    a.href = rutaPedidosWeb();
    a.className = activo
      ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium transition-colors'
      : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors';
    // Marcado fijo (icono de bolsa + texto + contador): no incluye datos de la base
    a.innerHTML =
      '<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"/>' +
      '</svg>' +
      '<span class="flex-1">Pedidos web</span>' +
      '<span id="badge-pedidos-web" class="hidden min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center"></span>';
    if (dashboard && dashboard.parentNode) {
      dashboard.parentNode.insertBefore(a, dashboard.nextSibling);
    } else {
      var lista = sidebar.querySelector('.overflow-y-auto') || sidebar;
      lista.insertBefore(a, lista.firstChild);
    }
    return a;
  }

  function pintarContador(n) {
    var badge = document.getElementById('badge-pedidos-web');
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }

  /* ─── Tarjeta en el Panel ─── */
  function pintarTarjetaPanel(n) {
    if (paginaActual() !== 'panel.html') return;
    var existente = document.getElementById('card-pedidos-web');
    if (n <= 0) { if (existente) existente.remove(); return; }
    var subtitulo = document.getElementById('panel-subtitulo');
    var encabezado = subtitulo && subtitulo.parentNode && subtitulo.parentNode.parentNode;
    if (!encabezado || !encabezado.parentNode) return;
    var card = existente || document.createElement('a');
    card.id = 'card-pedidos-web';
    card.href = rutaPedidosWeb();
    card.className = 'flex items-center justify-between gap-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 sm:p-5 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors';
    card.innerHTML =
      '<div class="min-w-0">' +
        '<p class="text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">Pedidos web por gestionar</p>' +
        '<p class="text-sm text-slate-700 dark:text-slate-300 mt-0.5">Contacta a los clientes por WhatsApp y cierra cada pedido al gestionarlo.</p>' +
      '</div>' +
      '<span class="text-2xl font-bold text-amber-600 dark:text-amber-400 shrink-0">' + n + '</span>';
    if (!existente) encabezado.parentNode.insertBefore(card, encabezado.nextSibling);
  }

  /* ─── Aviso emergente (una vez por inicio de sesion) ─── */
  function yaSeMostro(user) {
    try { return sessionStorage.getItem(CLAVE_AVISO) === String(user.loginAt || user.id || '1'); }
    catch (e) { return false; }
  }

  function marcarMostrado(user) {
    try { sessionStorage.setItem(CLAVE_AVISO, String(user.loginAt || user.id || '1')); } catch (e) { /* nada */ }
  }

  function mostrarAviso(n, user) {
    if (paginaActual() === 'pedidos-web.html') return;
    if (yaSeMostro(user)) return;
    if (document.getElementById('modal-aviso-pedidos-web')) return;
    marcarMostrado(user);

    var modal = document.createElement('div');
    modal.id = 'modal-aviso-pedidos-web';
    modal.className = 'fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6">' +
        '<div class="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mb-4">' +
          '<svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"/></svg>' +
        '</div>' +
        '<h2 class="text-base font-semibold text-slate-950 dark:text-white">Pedidos web por gestionar</h2>' +
        '<p class="text-sm text-slate-600 dark:text-slate-400 mt-1">Tienes <strong>' + textoPedidos(n) + '</strong> de la Tienda Virtual por gestionar por WhatsApp.</p>' +
        '<div class="flex flex-col sm:flex-row gap-2 mt-5">' +
          '<button type="button" data-aviso="cerrar" class="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Ahora no</button>' +
          '<a href="' + rutaPedidosWeb() + '" class="flex-1 py-2.5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 text-sm font-medium text-center hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">Ver pedidos</a>' +
        '</div>' +
      '</div>';

    function cerrar() {
      modal.remove();
      document.removeEventListener('keydown', alTeclear);
    }
    function alTeclear(e) { if (e.key === 'Escape') cerrar(); }
    modal.addEventListener('click', function (e) {
      if (e.target === modal || (e.target.closest && e.target.closest('[data-aviso="cerrar"]'))) cerrar();
    });
    document.addEventListener('keydown', alTeclear);
    document.body.appendChild(modal);
  }

  /* ─── Inicio ─── */
  async function iniciar() {
    try {
      if (paginaActual() === 'login.html' || paginaActual() === 'index.html') return;
      var user = window.KubitAuth && window.KubitAuth.obtenerUsuario && window.KubitAuth.obtenerUsuario();
      if (!user || !user.accessToken) return;
      if (!asegurarLinkMenu()) return;   // pagina sin menu (ej. impresion)
      if (!window.__supabase || !window.__supabase.rpc) return;

      // Llamada directa (no DB): ante un error NO se redirige al login
      var n = Number(await window.__supabase.rpc('pos_pedidos_web_contar', {})) || 0;
      pintarContador(n);
      pintarTarjetaPanel(n);
      if (n > 0) mostrarAviso(n, user);
    } catch (e) {
      /* sin aviso: el POS sigue igual */
    }
  }

  // Para que pedidos-web.js actualice el contador al cerrar un pedido
  window.KubitPedidosWebAviso = {
    actualizarContador: function (n) { pintarContador(Number(n) || 0); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
