/* ============================================================
   layout.js — Navegacion comun de Kubit-WMS (paso A3)
   ============================================================
   Cada pagina protegida declara en el <body>:
     data-pagina="buscar"   (id del menu activo)
     data-titulo="Buscar"   (titulo del header)
   y tiene un <main id="contenido" class="invisible ...">.

   Este archivo:
   1. Protege la pagina: sin sesion o token vencido -> login.html.
   2. Inserta header, sidebar (lg+), barra inferior (< lg),
      panel "Mas" (bottom sheet) y el toast.
   3. Llena los datos del usuario, modo oscuro y cerrar sesion.
   4. Expone window.WMSLayout = { usuario, venceEn }.

   Debe cargarse DESPUES de auth.js y ANTES del JS de la pagina.
   Reemplaza al sidebar.js del POS.
   A6: "Configuracion" pasa a disponible.
   A8: "Ubicar" pasa a disponible.
   B2: "Despachar" pasa a disponible.
   B4: "Traslados" pasa a disponible.
   B6: "Panel" pasa a disponible.
   C1: "Baja" pasa a "Bajas y ajustes" (ajustes.html), disponible (CR1).
   C2: "Inventario" pasa a disponible.
   C3: "Reconciliacion" pasa a disponible. Todo el menu queda disponible.
   ============================================================ */
(function () {
  /* ---------- 1. Proteccion de sesion ---------- */
  function vencimientoToken(token) {
    try {
      var payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var datos = JSON.parse(atob(payload));
      return datos.exp ? datos.exp * 1000 : 0;
    } catch (e) {
      return 0;
    }
  }

  var auth = window.KubitAuth;
  var usuario = auth && auth.obtenerUsuario();
  if (!usuario) {
    window.location.replace('login.html');
    return;
  }
  var vence = vencimientoToken(usuario.accessToken);
  // Margen de 30 segundos para no operar con un token a punto de vencer
  if (!vence || vence <= Date.now() + 30000) {
    auth.manejarErrorAuth(); // limpia la sesion y va a login.html?expired=1
    return;
  }

  /* ---------- 2. Menu ---------- */
  // disponible:false -> se muestra atenuado con "Pronto" (evita enlaces a paginas que no existen)
  var MENU = [
    { id: 'buscar',         texto: 'Buscar',          href: 'buscar.html',         disponible: true,  tab: true,
      icono: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
    { id: 'ubicar',         texto: 'Ubicar',          href: 'ubicar.html',         disponible: true,  tab: true,
      icono: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z' },
    { id: 'despachar',      texto: 'Despachar',       href: 'despachar.html',      disponible: true,  tab: true,
      icono: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12' },
    { id: 'traslados',      texto: 'Traslados',       href: 'traslados.html',      disponible: true,  tab: false,
      icono: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5' },
    { id: 'panel',          texto: 'Panel',           href: 'panel.html',          disponible: true,  tab: false,
      icono: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
    { id: 'inventario',     texto: 'Inventario',      href: 'inventario.html',     disponible: true,  tab: false,
      icono: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z' },
    { id: 'reconciliacion', texto: 'Reconciliacion',  href: 'reconciliacion.html', disponible: true,  tab: false,
      icono: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99' },
    { id: 'ajustes',        texto: 'Bajas y ajustes', href: 'ajustes.html',        disponible: true,  tab: false,
      icono: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0' },
    { id: 'config',         texto: 'Configuracion',   href: 'config.html',         disponible: true,  tab: false,
      icono: 'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }
  ];

  var ICONO_MAS = 'M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z';
  var ICONO_TEMA = 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z';
  var ICONO_SALIR = 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75';

  var body = document.body;
  var paginaActual = body.getAttribute('data-pagina') || '';
  var titulo = body.getAttribute('data-titulo') || 'Kubit WMS';

  function svg(path, clases) {
    return '<svg class="' + (clases || 'w-5 h-5') + '" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">' +
      path.split(' M').map(function (p, i) {
        return '<path stroke-linecap="round" stroke-linejoin="round" d="' + (i === 0 ? p : 'M' + p) + '"/>';
      }).join('') + '</svg>';
  }

  var C_ACTIVO = 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold';
  var C_NORMAL = 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white';

  function itemLista(m) {
    if (!m.disponible) {
      return '<div class="wms-item-pronto flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-400">' +
        svg(m.icono) + '<span class="flex-1">' + m.texto + '</span>' +
        '<span class="text-[10px] uppercase tracking-wider">Pronto</span></div>';
    }
    var activo = m.id === paginaActual;
    return '<a href="' + m.href + '" ' + (activo ? 'aria-current="page" ' : '') +
      'class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ' + (activo ? C_ACTIVO : C_NORMAL) + '">' +
      svg(m.icono) + '<span>' + m.texto + '</span></a>';
  }

  function itemTab(m) {
    var activo = m.id === paginaActual;
    var clases = 'wms-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] ' +
      (activo ? 'text-slate-950 dark:text-white font-semibold' : 'text-slate-500 dark:text-slate-400');
    if (!m.disponible) {
      return '<span class="' + clases + '" aria-disabled="true">' + svg(m.icono, 'w-6 h-6') + '<span>' + m.texto + '</span></span>';
    }
    return '<a href="' + m.href + '" class="' + clases + '"' + (activo ? ' aria-current="page"' : '') + '>' +
      svg(m.icono, 'w-6 h-6') + '<span>' + m.texto + '</span></a>';
  }

  var botonesAccion =
    '<button type="button" data-accion="tema" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ' + C_NORMAL + '">' +
      svg(ICONO_TEMA) + '<span>Modo claro / oscuro</span></button>' +
    '<button type="button" data-accion="salir" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">' +
      svg(ICONO_SALIR) + '<span>Cerrar sesion</span></button>';

  /* ---------- 3. Insertar estructura ---------- */
  var header =
    '<header class="fixed top-0 left-0 right-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/60 dark:border-slate-800">' +
      '<div class="h-full px-4 flex items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3 min-w-0">' +
          '<div class="w-8 h-8 bg-slate-950 dark:bg-white rounded-lg flex items-center justify-center shrink-0">' +
            '<span class="text-white dark:text-slate-950 font-bold text-sm">K</span></div>' +
          '<div class="min-w-0"><p class="text-sm font-semibold truncate">' + titulo + '</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">Kubit WMS</p></div>' +
        '</div>' +
        '<div class="flex items-center gap-3">' +
          '<div class="hidden sm:block text-right">' +
            '<p id="user-name" class="text-sm font-medium leading-tight">---</p>' +
            '<p id="user-rol" class="text-xs text-slate-500 dark:text-slate-400 leading-tight">---</p></div>' +
          '<div id="user-avatar" class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-sm font-semibold">A</div>' +
        '</div>' +
      '</div>' +
    '</header>';

  var sidebar =
    '<aside class="hidden lg:flex fixed top-16 bottom-0 left-0 z-20 w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800">' +
      '<nav class="flex-1 overflow-y-auto p-3 space-y-1">' +
        '<p class="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider text-slate-400">Navegacion</p>' +
        MENU.map(itemLista).join('') +
      '</nav>' +
      '<div class="p-3 space-y-1 border-t border-slate-200/60 dark:border-slate-800">' + botonesAccion + '</div>' +
    '</aside>';

  var barraInferior =
    '<nav class="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200/60 dark:border-slate-800 wms-safe-bottom" aria-label="Navegacion principal">' +
      '<div class="flex items-stretch">' +
        MENU.filter(function (m) { return m.tab; }).map(itemTab).join('') +
        '<button type="button" id="wms-btn-mas" class="wms-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] text-slate-500 dark:text-slate-400" aria-haspopup="dialog">' +
          svg(ICONO_MAS, 'w-6 h-6') + '<span>Mas</span></button>' +
      '</div>' +
    '</nav>';

  var panelMas =
    '<div id="wms-sheet-fondo" class="lg:hidden fixed inset-0 z-40 bg-slate-950/50"></div>' +
    '<div id="wms-sheet" role="dialog" aria-modal="true" aria-label="Mas opciones" class="lg:hidden fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800 wms-safe-bottom">' +
      '<div class="flex justify-center pt-3 pb-1"><div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div></div>' +
      '<div class="p-3 space-y-1">' +
        MENU.filter(function (m) { return !m.tab; }).map(itemLista).join('') +
        '<div class="my-2 border-t border-slate-200/60 dark:border-slate-800"></div>' +
        botonesAccion +
      '</div>' +
    '</div>';

  var toast =
    '<div id="toast" role="status" aria-live="polite" class="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-lg">' +
      '<div id="toast-icon" class="hidden shrink-0"></div>' +
      '<p id="toast-message" class="flex-1 text-sm text-slate-950 dark:text-white"></p>' +
      '<button id="toast-close" type="button" class="shrink-0 text-slate-400 hover:text-slate-950 dark:hover:text-white" aria-label="Cerrar">' +
        '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>';

  body.insertAdjacentHTML('afterbegin', header + sidebar);
  body.insertAdjacentHTML('beforeend', barraInferior + panelMas + toast);

  body.classList.add('lg:pl-64');
  var main = document.getElementById('contenido');
  if (main) {
    main.classList.add('pt-20', 'wms-main');
  }

  /* ---------- 4. Usuario ---------- */
  if (typeof auth.poblarUserHeader === 'function') {
    try { auth.poblarUserHeader(); } catch (e) { /* sigue con el respaldo */ }
  }
  var elNombre = document.getElementById('user-name');
  var elRol = document.getElementById('user-rol');
  var elAvatar = document.getElementById('user-avatar');
  if (elNombre && elNombre.textContent === '---') {
    var nombre = usuario.nombreCompleto || usuario.nombre || usuario.email || 'Usuario';
    elNombre.textContent = nombre;
    if (elRol) elRol.textContent = usuario.rolNombre || '';
    if (elAvatar) elAvatar.textContent = nombre.charAt(0).toUpperCase();
  }

  /* ---------- 5. Panel "Mas" ---------- */
  var sheet = document.getElementById('wms-sheet');
  var fondo = document.getElementById('wms-sheet-fondo');
  function abrirSheet() {
    sheet.classList.add('abierto');
    fondo.classList.add('abierto');
    body.classList.add('wms-sin-scroll');
  }
  function cerrarSheet() {
    sheet.classList.remove('abierto');
    fondo.classList.remove('abierto');
    body.classList.remove('wms-sin-scroll');
  }
  document.getElementById('wms-btn-mas').addEventListener('click', abrirSheet);
  fondo.addEventListener('click', cerrarSheet);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrarSheet();
  });

  /* ---------- 6. Modo oscuro y cerrar sesion ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-accion="tema"]'), function (b) {
    b.addEventListener('click', function () {
      var html = document.documentElement;
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-accion="salir"]'), function (b) {
    b.addEventListener('click', function () {
      auth.logout();
      window.location.replace('login.html');
    });
  });

  /* ---------- 7. API para las paginas ---------- */
  window.WMSLayout = {
    usuario: usuario,
    venceEn: vence,
    cerrarMenu: cerrarSheet
  };

  if (main) main.classList.remove('invisible');
})();
