(function () {
  'use strict';

  var PRODUCTOS = [];
  var PRODUCTOS_FILTRADOS = [];
  var CATEGORIAS = [];
  var EDITANDO_ID = null;
  var EDITANDO_PRODUCTO_ID = null;
  var MULTIMEDIA = [];
  var MULTIMEDIA_ELIMINADOS = [];
  var _guardando = false;
  var PAGE_SIZE = 10;
  var PAGINA = 1;
  var MODO_VARIANTES = false;
  var ATRIBUTOS_DEF = [];
  var VARIANTES = [];
  var VARIANTES_ELIMINADOS = [];

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  /* ───────────────────────────────────────────────
     INIT
     ─────────────────────────────────────────────── */
  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    await Promise.all([cargarCategorias(), cargarProductos()]);
    bindearEventos();
    agregarFilaMultimedia(); // una fila vacia por defecto
    actualizarAyudaStock();
  }

  /* ───────────────────────────────────────────────
     CATEGORIAS
     ─────────────────────────────────────────────── */
  async function cargarCategorias() {
    var res = await DB.categorias.listar();
    if (res.error) { console.error('[Productos] Error categorias:', res.error); return; }
    CATEGORIAS = res.data || [];

    [$('campo-categoria'), $('filtro-categoria')].forEach(function (sel) {
      sel.innerHTML = '<option value="">' + (sel.id === 'filtro-categoria' ? 'Todas las categorias' : 'Seleccionar...') + '</option>';
      CATEGORIAS.forEach(function (c) {
        sel.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
    });
  }

  /* ───────────────────────────────────────────────
     PRODUCTOS
     ─────────────────────────────────────────────── */
  function mostrarErrorTabla(msg) {
    var tbody = $('productos-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10"><div class="flex flex-col items-center gap-2"><svg class="w-8 h-8 text-red-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg><p class="text-sm text-slate-400">' + msg + '</p></div></td></tr>';
  }

  async function cargarProductos() {
    $('productos-tbody').innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Cargando...</td></tr>';
    PAGINA = 1;
    var mostrarInactivos = $('mostrar-inactivos') && $('mostrar-inactivos').checked;
    var res = await DB.productos.listarConDetalle({ skipCache: true, mostrarInactivos: mostrarInactivos });
    if (res.error) {
      console.error('[Productos] Error:', res.error);
      mostrarErrorTabla('Error al cargar productos. Verifica tu conexion.');
      return;
    }
    PRODUCTOS = (res.data || []).map(function (d) {
      var p = d.producto || {};
      return {
        detalleId: d.id,
        productoId: p.id || d.producto_id,
        nombre: p.nombre || 'Sin nombre',
        categoriaId: p.categoria_id || null,
        categoriaNombre: (p.categoria && p.categoria.nombre) || '',
        codigoInterno: d.codigo_interno || '',
        codigoBarras: d.codigo_barras || '',
        marca: p.marca || '',
        modelo: p.modelo || '',
        tipoProducto: p.tipo_producto || '',
        descripcion: p.descripcion || '',
        precio: d.precio_venta || 0,
        precioCompra: d.precio_compra || 0,
        precioOriginal: d.precio_original || 0,
        precioMayorista: d.precio_mayorista || 0,
        descuentoMax: d.descuento_max || 0,
        margen: d.margen_ganancia || 0,
        stock: d.stock_actual || 0,
        stockMin: d.stock_min || 0,
        stockMax: d.stock_max || 0,
        peso: d.peso || null,
        dimensiones: d.dimensiones || '',
        activo: p.activo !== false,
        tags: p.tags || [],
        // Fase 32: el 0 es un valor valido (exento); solo un dato vacio se toma como 0%
        tasaImpuesto: (p.tasa_impuesto !== null && p.tasa_impuesto !== undefined) ? (parseFloat(p.tasa_impuesto) || 0) : 0
      };
    });
    productosFiltrarYRender();
  }

  function renderizarPaginacion() {
    var total = PRODUCTOS_FILTRADOS.length;
    var paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (PAGINA > paginas) PAGINA = paginas;
    var desde = (PAGINA - 1) * PAGE_SIZE + 1;
    var hasta = Math.min(PAGINA * PAGE_SIZE, total);

    var info = $('pag-info');
    var ctrl = $('pag-controles');
    if (total === 0) {
      info.textContent = '0 resultados';
      ctrl.innerHTML = '';
      ctrl.classList.add('hidden');
      return;
    }
    ctrl.classList.remove('hidden');
    info.textContent = desde + '–' + hasta + ' de ' + total;

    var disabledPrev = PAGINA <= 1 ? ' opacity-30 pointer-events-none' : '';
    var disabledNext = PAGINA >= paginas ? ' opacity-30 pointer-events-none' : '';
    ctrl.innerHTML =
      '<button id="pag-prev" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledPrev + '">Anterior</button>' +
      '<span class="text-xs text-slate-400">' + PAGINA + ' / ' + paginas + '</span>' +
      '<button id="pag-next" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + disabledNext + '">Siguiente</button>';
  }

  function renderizarTabla() {
    var tbody = $('productos-tbody');
    var total = PRODUCTOS_FILTRADOS.length;
    $('productos-count').textContent = '(' + total + ')';
    if (!total) {
      tbody.innerHTML = '';
      $('productos-empty').classList.remove('hidden');
      renderizarPaginacion();
      return;
    }
    $('productos-empty').classList.add('hidden');

    var inicio = (PAGINA - 1) * PAGE_SIZE;
    var pagina = PRODUCTOS_FILTRADOS.slice(inicio, inicio + PAGE_SIZE);

    tbody.innerHTML = pagina.map(function (p) {
      var agotado = p.stock <= 0;
      var bajo = p.stockMin > 0 && p.stock <= p.stockMin;
      var badge = agotado ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
        bajo ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
      var badgeTxt = agotado ? 'Agotado' : bajo ? 'Bajo' : p.stock;
      var estadoBadge = p.activo ? '' : '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 ml-2">Inactivo</span>';
      return '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-3 px-2"><div class="flex items-center gap-2"><div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">' + p.nombre.charAt(0).toUpperCase() + '</div><div><p class="text-sm font-medium text-slate-950 dark:text-white">' + p.nombre + estadoBadge + '</p><p class="text-xs text-slate-400 sm:hidden">' + p.categoriaNombre + '</p></div></div></td>' +
        '<td class="py-3 px-2 text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + p.categoriaNombre + '</td>' +
        '<td class="py-3 px-2 text-center text-xs text-slate-400 hidden md:table-cell">' + (p.codigoInterno || p.codigoBarras || '—') + '</td>' +
        '<td class="py-3 px-2 text-center"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + badge + '">' + badgeTxt + '</span></td>' +
        '<td class="py-3 px-2 text-right text-sm font-medium text-slate-950 dark:text-white">' + formatearMoneda(p.precio) + '</td>' +
        '<td class="py-3 px-2 text-right"><div class="flex gap-1 justify-end">' +
        '<button class="btn-ver text-slate-400 hover:text-sky-500 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-id="' + p.detalleId + '" aria-label="Ver producto">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
        '</button>' +
        '<button class="btn-editar text-slate-400 hover:text-sky-500 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" data-id="' + p.detalleId + '" aria-label="Editar producto">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>' +
        '</button>' +
        '<button class="btn-eliminar text-red-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20" data-id="' + p.detalleId + '" aria-label="Eliminar producto">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>' +
        '</button>' +
        '</div></td></tr>';
    }).join('');
    renderizarPaginacion();
  }

  function productosFiltrarYRender() {
    var q = ($('buscador-productos').value || '').toLowerCase().trim();
    var catId = $('filtro-categoria').value;
    PRODUCTOS_FILTRADOS = PRODUCTOS.filter(function (p) {
      var matchCat = !catId || p.categoriaId === catId;
      var matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.codigoInterno || '').toLowerCase().includes(q) || (p.codigoBarras || '').toLowerCase().includes(q) || (p.marca || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
    PAGINA = 1;
    renderizarTabla();
  }

  /* ───────────────────────────────────────────────
     VARIANTES
     ─────────────────────────────────────────────── */
  function toggleModoVariantes() {
    MODO_VARIANTES = $('toggle-variantes').checked;
    $('modo-single').classList.toggle('hidden', MODO_VARIANTES);
    $('modo-multi').classList.toggle('hidden', !MODO_VARIANTES);
    if (MODO_VARIANTES) {
      if (ATRIBUTOS_DEF.length === 0) {
        ATRIBUTOS_DEF = [{ nombre: 'Color' }, { nombre: 'Talla' }];
        renderizarAtributos();
      }
      renderizarTablaVariantes();
    }
  }

  function renderizarAtributos() {
    var container = $('atributos-container');
    container.innerHTML = ATRIBUTOS_DEF.map(function (a, i) {
      return '<div class="atributo-row flex items-center gap-2 bg-slate-50/30 dark:bg-slate-800/20 rounded-xl px-3 py-2">' +
        '<input type="text" class="attr-nombre flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" placeholder="Ej: Color" value="' + a.nombre + '">' +
        '<button type="button" class="btn-eliminar-atributo w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" data-idx="' + i + '">' +
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
  }

  function leerAtributosDesdeDOM() {
    var rows = $('atributos-container').querySelectorAll('.atributo-row');
    ATRIBUTOS_DEF = Array.from(rows).map(function (r) {
      return { nombre: r.querySelector('.attr-nombre').value.trim() };
    }).filter(function (a) { return a.nombre; });
  }

  function syncVariantesFromDOM() {
    var rows = $('variantes-tbody').querySelectorAll('.variant-row');
    if (!rows.length || rows.length !== VARIANTES.length) return;
    rows.forEach(function (row, i) {
      var v = VARIANTES[i];
      if (!v) return;
      var attrs = {};
      row.querySelectorAll('.v-attr').forEach(function (inp) {
        var ai = parseInt(inp.dataset.attrIdx);
        var name = ATRIBUTOS_DEF[ai] ? ATRIBUTOS_DEF[ai].nombre : 'a' + ai;
        attrs[name] = inp.value;
      });
      v.atributos = attrs;
      v.codigo_interno = row.querySelector('.v-codigo').value;
      v.precio_venta = parseFloat(row.querySelector('.v-precio-venta').value) || 0;
      v.precio_compra = parseFloat(row.querySelector('.v-precio-compra').value) || 0;
      v.stock_actual = parseInt(row.querySelector('.v-stock').value) || 0;
      var sec = row.nextElementSibling;
      if (sec && sec.classList.contains('variant-row-secondary')) {
        v.precio_original = parseFloat(sec.querySelector('.v-precio-original').value) || 0;
        v.precio_mayorista = parseFloat(sec.querySelector('.v-precio-mayorista').value) || 0;
        v.descuento_max = parseInt(sec.querySelector('.v-descuento-max').value) || 0;
        v.stock_min = parseInt(sec.querySelector('.v-stock-min').value) || 0;
        v.stock_max = parseInt(sec.querySelector('.v-stock-max').value) || 0;
        v.peso = parseFloat(sec.querySelector('.v-peso').value) || null;
        v.dimensiones = sec.querySelector('.v-dimensiones').value || '';
      }
    });
  }

  function renderizarTablaVariantes() {
    syncVariantesFromDOM();
    leerAtributosDesdeDOM();
    var thead = $('variantes-thead');
    var attrTh = ATRIBUTOS_DEF.map(function (a) {
      return '<th class="text-left py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider min-w-[80px]">' + a.nombre + '</th>';
    }).join('');
    thead.innerHTML = '<tr class="border-b border-slate-200/60 dark:border-slate-800">' +
      '<th class="text-left py-2 px-2 text-xs text-slate-400 font-medium uppercase tracking-wider w-8">#</th>' +
      attrTh +
      '<th class="text-left py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider min-w-[80px]">Codigo</th>' +
      '<th class="text-right py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider min-w-[80px]">P. Venta</th>' +
      '<th class="text-right py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider min-w-[80px]">P. Compra</th>' +
      '<th class="text-center py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider w-16">Stock</th>' +
      '<th class="text-center py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider w-8"></th>' +
      '<th class="text-center py-2 px-1 text-xs text-slate-400 font-medium uppercase tracking-wider w-10"></th>' +
    '</tr>';

    var tbody = $('variantes-tbody');
    if (!VARIANTES.length) {
      tbody.innerHTML = '';
      $('variantes-empty').classList.remove('hidden');
      return;
    }
    $('variantes-empty').classList.add('hidden');

    tbody.innerHTML = VARIANTES.map(function (v, i) {
      var attrTds = ATRIBUTOS_DEF.map(function (a, ai) {
        var val = v.atributos[a.nombre] || '';
        return '<td class="py-1.5 px-1"><input type="text" class="v-attr w-full min-w-[60px] px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" data-attr-idx="' + ai + '" value="' + val + '" placeholder="' + a.nombre + '"></td>';
      }).join('');

      var expanded = v._expandido;
      var chevronClass = expanded ? 'rotate-180' : '';
      // Fase 31: el stock de una variante ya guardada solo se cambia desde Inventario
      var stockSoloLectura = !!v.id;

      return '<tr class="variant-row border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">' +
        '<td class="py-1.5 px-2 text-xs text-slate-400 text-center">' + (i + 1) + '</td>' +
        attrTds +
        '<td class="py-1.5 px-1"><input type="text" class="v-codigo w-full min-w-[60px] px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" value="' + (v.codigo_interno || '') + '" placeholder="SKU"></td>' +
        '<td class="py-1.5 px-1"><input type="number" class="v-precio-venta w-full min-w-[70px] px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="0.01" min="0" value="' + v.precio_venta + '"></td>' +
        '<td class="py-1.5 px-1"><input type="number" class="v-precio-compra w-full min-w-[70px] px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="0.01" min="0" value="' + v.precio_compra + '"></td>' +
        '<td class="py-1.5 px-1"><input type="number" class="v-stock w-full min-w-[50px] px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all' + (stockSoloLectura ? ' opacity-60 cursor-not-allowed' : '') + '" step="1" min="0" value="' + v.stock_actual + '"' + (stockSoloLectura ? ' readonly tabindex="-1" title="Para cambiar el stock usa Inventario"' : '') + '></td>' +
        '<td class="py-1.5 px-1 text-center">' +
          '<button type="button" class="btn-expand-variante w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-idx="' + i + '">' +
            '<svg class="w-3.5 h-3.5 transition-transform duration-200 ' + chevronClass + '" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>' +
          '</button>' +
        '</td>' +
        '<td class="py-1.5 px-1 text-center">' +
          '<button type="button" class="btn-eliminar-variante w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" data-idx="' + i + '">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>' +
          '</button>' +
          '<input type="hidden" class="v-id" value="' + (v.id || '') + '">' +
        '</td>' +
      '</tr>' +
      '<tr class="variant-row-secondary' + (expanded ? '' : ' hidden') + '">' +
        '<td colspan="99" class="p-3 bg-slate-50/50 dark:bg-slate-800/10">' +
          '<div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">' +
            '<div><label class="block text-xs text-slate-400 mb-1">P. Original ($)</label><input type="number" class="v-precio-original w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="0.01" min="0" value="' + (v.precio_original || '') + '" placeholder="0.00"></div>' +
            '<div><label class="block text-xs text-slate-400 mb-1">P. Mayorista ($)</label><input type="number" class="v-precio-mayorista w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="0.01" min="0" value="' + (v.precio_mayorista || '') + '" placeholder="0.00"></div>' +
            '<div><label class="block text-xs text-slate-400 mb-1">Dto. Max (%)</label><input type="number" class="v-descuento-max w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="1" min="0" max="100" value="' + (v.descuento_max || '') + '" placeholder="0"></div>' +
            '<div><label class="block text-xs text-slate-400 mb-1">Stock Min</label><input type="number" class="v-stock-min w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="1" min="0" value="' + (v.stock_min || '') + '" placeholder="0"></div>' +
            '<div><label class="block text-xs text-slate-400 mb-1">Stock Max</label><input type="number" class="v-stock-max w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="1" min="0" value="' + (v.stock_max || '') + '" placeholder="0"></div>' +
            '<div><label class="block text-xs text-slate-400 mb-1">Peso (kg)</label><input type="number" class="v-peso w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" step="0.01" min="0" value="' + (v.peso || '') + '" placeholder="0.00"></div>' +
            '<div class="col-span-2 sm:col-span-2"><label class="block text-xs text-slate-400 mb-1">Dimensiones</label><input type="text" class="v-dimensiones w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" value="' + (v.dimensiones || '') + '" placeholder="Largo x Ancho x Alto (cm)"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function agregarVariante() {
    var attr = {};
    ATRIBUTOS_DEF.forEach(function (a) {
      attr[a.nombre] = '';
    });
      VARIANTES.push({
        id: null,
        atributos: attr,
        codigo_interno: '',
        precio_venta: 0,
        precio_compra: 0,
        stock_actual: 0,
        precio_original: 0,
        precio_mayorista: 0,
        descuento_max: 0,
        stock_min: 2,
        stock_max: 0,
        peso: null,
        dimensiones: ''
      });
    renderizarTablaVariantes();
  }

  function eliminarVariante(idx) {
    var v = VARIANTES[idx];
    if (v && v.id) VARIANTES_ELIMINADOS.push(v.id);
    VARIANTES.splice(idx, 1);
    renderizarTablaVariantes();
  }

  function resetVariantState() {
    MODO_VARIANTES = false;
    ATRIBUTOS_DEF = [];
    VARIANTES = [];
    VARIANTES_ELIMINADOS = [];
    $('atributos-container').innerHTML = '';
    $('variantes-tbody').innerHTML = '';
    $('variantes-empty').classList.add('hidden');
  }

  /* ───────────────────────────────────────────────
     MULTIMEDIA
     ─────────────────────────────────────────────── */
  function agregarFilaMultimedia(data) {
    var container = $('multimedia-container');
    var idx = container.children.length;
    var row = document.createElement('div');
    row.className = 'multimedia-row grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-3 p-4 border border-slate-200/60 dark:border-slate-800 rounded-xl bg-slate-50/30 dark:bg-slate-800/20';

    var urlVal = (data && data.url) || '';
    var tipoVal = (data && data.tipo) || 'imagen';
    var ordenVal = (data && data.orden) || (idx + 1);
    var altVal = (data && data.alt_text) || '';
    var mmId = (data && data.id) || '';

    var btnEliminar = '<button type="button" class="btn-eliminar-mm w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/40 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" aria-label="Eliminar"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg></button>';

    row.innerHTML =
      '<div class="sm:col-span-2">' +
        '<label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">URL del archivo</label>' +
        '<input type="url" class="mm-url w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all placeholder:text-slate-400" placeholder="https://..." value="' + urlVal + '">' +
      '</div>' +
      '<div>' +
        '<label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tipo</label>' +
        '<select class="mm-tipo w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all">' +
          '<option value="imagen"' + (tipoVal === 'imagen' ? ' selected' : '') + '>Imagen</option>' +
          '<option value="video"' + (tipoVal === 'video' ? ' selected' : '') + '>Video</option>' +
          '<option value="documento"' + (tipoVal === 'documento' ? ' selected' : '') + '>Documento</option>' +
        '</select>' +
      '</div>' +
      '<div>' +
        '<label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Orden</label>' +
        '<input type="number" class="mm-orden w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all" value="' + ordenVal + '" min="0">' +
      '</div>' +
      '<div class="sm:col-span-3">' +
        '<label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Texto Alternativo</label>' +
        '<input type="text" class="mm-alt w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-950 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white/20 transition-all placeholder:text-slate-400" placeholder="Breve descripcion de la imagen" value="' + altVal + '">' +
      '</div>' +
      '<div class="flex items-end">' +
        btnEliminar +
      '</div>' +
      '<input type="hidden" class="mm-id" value="' + mmId + '">';

    container.appendChild(row);
    reordenarMM();
  }

  function eliminarFilaMultimedia(row) {
    var mmId = row.querySelector('.mm-id').value;
    if (mmId) MULTIMEDIA_ELIMINADOS.push(mmId);
    row.remove();
    reordenarMM();
  }

  function reordenarMM() {
    var rows = $('multimedia-container').querySelectorAll('.multimedia-row');
    rows.forEach(function (r, i) {
      r.querySelector('.mm-orden').value = i + 1;
    });
  }

  function obtenerMultimediaRows() {
    var rows = $('multimedia-container').querySelectorAll('.multimedia-row');
    var result = [];
    rows.forEach(function (r) {
      var url = r.querySelector('.mm-url').value.trim();
      if (!url) return;
      result.push({
        id: r.querySelector('.mm-id').value || null,
        url: url,
        tipo: r.querySelector('.mm-tipo').value,
        orden: parseInt(r.querySelector('.mm-orden').value) || 0,
        alt_text: r.querySelector('.mm-alt').value.trim() || null
      });
    });
    return result;
  }

  async function cargarMultimedia(productoId) {
    MULTIMEDIA = [];
    MULTIMEDIA_ELIMINADOS = [];
    $('multimedia-container').innerHTML = '';
    if (!productoId) { agregarFilaMultimedia(); return; }
    var res = await DB.productosMultimedia.listar(productoId);
    if (res.error) { console.error('[Productos] Error multimedia:', res.error); agregarFilaMultimedia(); return; }
    var lista = res.data || [];
    if (!lista.length) { agregarFilaMultimedia(); return; }
    lista.forEach(function (m) { agregarFilaMultimedia(m); });
  }

  /* ───────────────────────────────────────────────
     FORMULARIO
     ─────────────────────────────────────────────── */
  /* Fase 31: el stock solo se cambia desde Inventario (queda un movimiento).
     Al editar, el campo es de solo lectura; al crear, es el stock inicial. */
  function actualizarAyudaStock() {
    var editando = !!EDITANDO_ID;
    var inp = $('campo-stock');
    if (inp) {
      inp.readOnly = editando;
      inp.classList.toggle('opacity-60', editando);
      inp.classList.toggle('cursor-not-allowed', editando);
    }
    var ayuda = $('stock-ayuda');
    if (ayuda) {
      ayuda.innerHTML = editando
        ? 'El stock es de solo lectura. Para cambiarlo usa <a href="inventario.html" class="underline">Inventario - Ajuste manual</a>: asi queda registrado el movimiento.'
        : 'Al crear el producto, el stock que escribas se registra como movimiento "Stock inicial".';
    }
  }

  function limpiarFormulario() {
    EDITANDO_ID = null;
    EDITANDO_PRODUCTO_ID = null;
    $('form-titulo').textContent = 'Nuevo Producto';
    $('form-producto-id').textContent = '';
    ['campo-nombre', 'campo-codigo-interno', 'campo-codigo-barras', 'campo-marca', 'campo-modelo', 'campo-tipo-producto',
      'campo-descripcion', 'campo-precio-venta', 'campo-precio-compra', 'campo-precio-mayorista', 'campo-precio-original',
      'campo-stock-min', 'campo-stock-max', 'campo-peso', 'campo-dimensiones'
    ].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    document.querySelectorAll('.tag-chip.active').forEach(function (el) { el.classList.remove('active'); });
    $('campo-stock').value = '';
    $('campo-descuento-max').value = '';
    $('campo-stock-min').value = '2';
    $('campo-margen').value = '';
    $('campo-categoria').value = '';
    $('campo-impuesto').value = '0';
    $('campo-activo').checked = true;

    $('toggle-variantes').checked = false;
    MODO_VARIANTES = false;
    $('modo-single').classList.remove('hidden');
    $('modo-multi').classList.add('hidden');
    resetVariantState();

    MULTIMEDIA_ELIMINADOS = [];
    $('multimedia-container').innerHTML = '';
    agregarFilaMultimedia();
    actualizarAyudaStock();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cargarEnForm(detalleId) {
    var p = PRODUCTOS.find(function (x) { return x.detalleId === detalleId; });
    if (!p) return;
    EDITANDO_ID = detalleId;
    EDITANDO_PRODUCTO_ID = p.productoId;
    actualizarAyudaStock();
    $('form-titulo').textContent = 'Editar Producto';
    $('form-producto-id').textContent = p.nombre;
    $('campo-nombre').value = p.nombre;
    $('campo-marca').value = p.marca;
    $('campo-modelo').value = p.modelo;
    $('campo-tipo-producto').value = p.tipoProducto;
    $('campo-descripcion').value = p.descripcion;
    $('campo-categoria').value = p.categoriaId;
    document.querySelectorAll('.tag-chip').forEach(function (el) {
      if ((p.tags || []).indexOf(el.dataset.tag) !== -1) el.classList.add('active');
    });
    $('campo-activo').checked = p.activo;
    var tasa = Math.round((p.tasaImpuesto || 0) * 100);
    $('campo-impuesto').value = tasa;

    var res = await DB.productos.listarDetalleActivos({
      filters: [{ col: 'producto_id', val: p.productoId }]
    });
    var detalles = res.data ? res.data.filter(function (d) { return !d.deleted_at; }) : [];

    if (detalles.length <= 1) {
      $('toggle-variantes').checked = false;
      MODO_VARIANTES = false;
      $('modo-single').classList.remove('hidden');
      $('modo-multi').classList.add('hidden');
      resetVariantState();

      $('campo-codigo-interno').value = p.codigoInterno;
      $('campo-codigo-barras').value = p.codigoBarras;
      $('campo-precio-venta').value = p.precio;
      $('campo-precio-compra').value = p.precioCompra;
      $('campo-precio-original').value = p.precioOriginal;
      $('campo-precio-mayorista').value = p.precioMayorista;
      $('campo-margen').value = p.margen > 0 ? p.margen + '%' : '';
      $('campo-descuento-max').value = p.descuentoMax;
      $('campo-stock').value = p.stock;
      $('campo-stock-min').value = p.stockMin;
      $('campo-stock-max').value = p.stockMax;
      $('campo-peso').value = p.peso || '';
      $('campo-dimensiones').value = p.dimensiones || '';
    } else {
      $('toggle-variantes').checked = true;
      MODO_VARIANTES = true;
      $('modo-single').classList.add('hidden');
      $('modo-multi').classList.remove('hidden');

      var attrKeys = [];
      detalles.forEach(function (d) {
        if (d.atributos) {
          Object.keys(d.atributos).forEach(function (k) {
            if (attrKeys.indexOf(k) === -1) attrKeys.push(k);
          });
        }
      });
      ATRIBUTOS_DEF = attrKeys.map(function (k) { return { nombre: k }; });
      if (!ATRIBUTOS_DEF.length) ATRIBUTOS_DEF = [{ nombre: 'Color' }, { nombre: 'Talla' }];
      renderizarAtributos();

      VARIANTES = detalles.map(function (d) {
        return {
          id: d.id,
          atributos: d.atributos || {},
          codigo_interno: d.codigo_interno || '',
          codigo_barras: d.codigo_barras || '',
          precio_venta: d.precio_venta || 0,
          precio_compra: d.precio_compra || 0,
          stock_actual: d.stock_actual || 0,
          precio_original: d.precio_original || 0,
          precio_mayorista: d.precio_mayorista || 0,
          descuento_max: d.descuento_max || 0,
          stock_min: d.stock_min || 0,
          stock_max: d.stock_max || 0,
          peso: d.peso || null,
          dimensiones: d.dimensiones || ''
        };
      });
      renderizarTablaVariantes();
    }

    cargarMultimedia(p.productoId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ───────────────────────────────────────────────
     GUARDAR
     ─────────────────────────────────────────────── */
  async function guardarProducto() {
    if (_guardando) return;
    var nombre = $('campo-nombre').value.trim();
    if (!nombre) { mostrarToast('El nombre del producto es obligatorio'); return; }
    var categoriaId = $('campo-categoria').value;
    if (!categoriaId) { mostrarToast('Selecciona una categoria'); return; }

    if (MODO_VARIANTES) {
      var variantRows = document.querySelectorAll('#variantes-tbody .variant-row');
      var skusEnForm = {};
      for (var vi = 0; vi < variantRows.length; vi++) {
        var vSku = variantRows[vi].querySelector('.v-codigo').value.trim();
        if (!vSku) continue;
        if (skusEnForm[vSku]) {
          mostrarToast('El codigo "' + vSku + '" esta repetido en dos variantes', 'error'); return;
        }
        skusEnForm[vSku] = true;
        var vExcluir = variantRows[vi].querySelector('.v-id').value || null;
        var dupCheck = await DB.productos.buscarPorCodigoInterno(vSku, vExcluir);
        if (dupCheck.error) { mostrarToast('Error al validar SKU: ' + dupCheck.error, 'error'); return; }
        if (dupCheck.data) {
          var prodNombre = dupCheck.data.producto ? dupCheck.data.producto.nombre : 'otro producto';
          mostrarToast('El codigo "' + vSku + '" ya existe en: ' + prodNombre, 'error'); return;
        }
      }
    } else {
      var sku = $('campo-codigo-interno').value.trim();
      if (sku) {
        var dupCheck = await DB.productos.buscarPorCodigoInterno(sku, EDITANDO_ID);
        if (dupCheck.error) { mostrarToast('Error al validar SKU: ' + dupCheck.error, 'error'); return; }
        if (dupCheck.data) {
          var prodNombre = dupCheck.data.producto ? dupCheck.data.producto.nombre : 'otro producto';
          mostrarToast('El codigo "' + sku + '" ya existe en: ' + prodNombre, 'error'); return;
        }
      }
    }

    _guardando = true;
    $('btn-guardar').disabled = true;
    $('btn-guardar').textContent = 'Guardando...';

    try {
      var usuario = window.KubitAuth.obtenerUsuario();
      var userId = usuario ? usuario.id : null;

      var productoData = {
        nombre: nombre,
        categoria_id: categoriaId,
        tipo_producto: $('campo-tipo-producto').value.trim() || null,
        marca: $('campo-marca').value.trim() || null,
        modelo: $('campo-modelo').value.trim() || null,
        descripcion: $('campo-descripcion').value.trim() || null,
        // Fase 32: respeta el 0% (exento); un valor invalido se guarda como 0%, nunca como 19%
        tasa_impuesto: (parseFloat($('campo-impuesto').value) || 0) / 100,
        activo: $('campo-activo').checked,
        tags: Array.from(document.querySelectorAll('.tag-chip.active')).map(function (el) { return el.dataset.tag; }),
        updated_by: userId
      };

      var productoId;

      if (EDITANDO_ID) {
        productoData.id = EDITANDO_PRODUCTO_ID;
        var r1 = await DB.productos.actualizar(EDITANDO_PRODUCTO_ID, productoData);
        if (r1.error) { mostrarToast('Error: ' + r1.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
        productoId = EDITANDO_PRODUCTO_ID;
      } else {
        productoData.created_by = userId;
        var r1 = await DB.productos.crear(productoData);
        if (r1.error) { mostrarToast('Error: ' + r1.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
        productoId = r1.data[0].id;
      }

      if (MODO_VARIANTES) {
        leerAtributosDesdeDOM();
        var variantRows = $('variantes-tbody').querySelectorAll('.variant-row');
        if (!variantRows.length) { mostrarToast('Agrega al menos una variante'); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
        var savedIds = [];
        var advertenciasStock = [];

        for (var vi = 0; vi < variantRows.length; vi++) {
          var row = variantRows[vi];
          var vId = row.querySelector('.v-id').value;

          var atributos = {};
          row.querySelectorAll('.v-attr').forEach(function (inp) {
            var ai = parseInt(inp.dataset.attrIdx);
            var attrName = ATRIBUTOS_DEF[ai] ? ATRIBUTOS_DEF[ai].nombre : 'atributo_' + ai;
            atributos[attrName] = inp.value.trim();
          });

          var vPrecioVenta = parseFloat(row.querySelector('.v-precio-venta').value) || 0;
          var vPrecioCompra = parseFloat(row.querySelector('.v-precio-compra').value) || 0;

          var sec = row.nextElementSibling;
          // Fase 31: el stock no se envia al actualizar; en una variante nueva es el stock inicial
          var vStockInicial = parseInt(row.querySelector('.v-stock').value) || 0;
          var detalleData = {
            codigo_interno: row.querySelector('.v-codigo').value.trim() || null,
            precio_venta: vPrecioVenta,
            precio_compra: vPrecioCompra,
            atributos: atributos,
            updated_by: userId
          };

          if (sec && sec.classList.contains('variant-row-secondary')) {
            detalleData.precio_original = parseFloat(sec.querySelector('.v-precio-original').value) || null;
            detalleData.precio_mayorista = parseFloat(sec.querySelector('.v-precio-mayorista').value) || null;
            detalleData.descuento_max = parseInt(sec.querySelector('.v-descuento-max').value) || 0;
            detalleData.stock_min = parseInt(sec.querySelector('.v-stock-min').value) || 0;
            detalleData.stock_max = parseInt(sec.querySelector('.v-stock-max').value) || 0;
            detalleData.peso = parseFloat(sec.querySelector('.v-peso').value) || null;
            detalleData.dimensiones = sec.querySelector('.v-dimensiones').value.trim() || null;
          }

          if (vPrecioVenta > 0 && vPrecioCompra > 0) {
            detalleData.margen_ganancia = Math.round((vPrecioVenta - vPrecioCompra) / vPrecioCompra * 100);
          }

          if (vId) {
            var ru = await DB.productos.detalleActualizar(vId, detalleData);
            if (ru.error) { mostrarToast('Error al actualizar variante: ' + ru.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
            savedIds.push(vId);
          } else {
            detalleData.producto_id = productoId;
            detalleData.created_by = userId;
            detalleData.stock_actual = 0; // Fase 31: el stock inicial se registra con su movimiento
            var rc = await DB.productos.detalleCrear(detalleData);
            if (rc.error) { mostrarToast('Error al crear variante: ' + rc.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
            savedIds.push(rc.data[0].id);
            if (vStockInicial > 0) {
              var rs = await DB.productos.ajustarStock(rc.data[0].id, vStockInicial, 'ajuste_incremento', 'Stock inicial', { usuarioId: userId });
              if (rs.error) advertenciasStock.push((detalleData.codigo_interno || 'variante nueva') + ': ' + rs.error);
            }
          }
        }

        for (var ei = 0; ei < VARIANTES_ELIMINADOS.length; ei++) {
          await DB.productos.detalleEliminar(VARIANTES_ELIMINADOS[ei]);
        }

        EDITANDO_PRODUCTO_ID = productoId;
        if (advertenciasStock.length) {
          mostrarToast('Producto guardado, pero no se pudo registrar el stock inicial de: ' + advertenciasStock.join(' | ') + '. Cargalo desde Inventario.', 'error');
        } else {
          mostrarToast('Producto guardado con variantes');
        }
      } else {
        var precioVenta = parseFloat($('campo-precio-venta').value) || 0;
        if (precioVenta <= 0) { mostrarToast('El precio de venta debe ser mayor a 0'); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }

        var stockInicial = parseInt($('campo-stock').value) || 0; // Fase 31: solo se usa al crear
        var detalleData = {
          codigo_interno: $('campo-codigo-interno').value.trim() || null,
          codigo_barras: $('campo-codigo-barras').value.trim() || null,
          precio_compra: parseFloat($('campo-precio-compra').value) || 0,
          precio_venta: precioVenta,
          precio_original: parseFloat($('campo-precio-original').value) || null,
          precio_mayorista: parseFloat($('campo-precio-mayorista').value) || null,
          descuento_max: parseInt($('campo-descuento-max').value) || 0,
          stock_min: parseInt($('campo-stock-min').value) || 0,
          stock_max: parseInt($('campo-stock-max').value) || 0,
          peso: parseFloat($('campo-peso').value) || null,
          dimensiones: $('campo-dimensiones').value.trim() || null,
          updated_by: userId
        };

        var precioCompra = parseFloat($('campo-precio-compra').value) || 0;
        if (precioVenta > 0 && precioCompra > 0) {
          detalleData.margen_ganancia = Math.round((precioVenta - precioCompra) / precioCompra * 100);
        }

        if (EDITANDO_ID) {
          var r2 = await DB.productos.detalleActualizar(EDITANDO_ID, detalleData);
          if (r2.error) { mostrarToast('Error: ' + r2.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
          mostrarToast('Producto actualizado');
        } else {
          detalleData.producto_id = productoId;
          detalleData.created_by = userId;
          detalleData.stock_actual = 0; // Fase 31: el stock inicial se registra con su movimiento
          var r2 = await DB.productos.detalleCrear(detalleData);
          if (r2.error) { mostrarToast('Error al crear detalle: ' + r2.error); _guardando = false; $('btn-guardar').disabled = false; $('btn-guardar').textContent = 'Guardar Producto'; return; }
          EDITANDO_ID = r2.data[0].id;
          EDITANDO_PRODUCTO_ID = productoId;
          if (stockInicial > 0) {
            var rs2 = await DB.productos.ajustarStock(EDITANDO_ID, stockInicial, 'ajuste_incremento', 'Stock inicial', { usuarioId: userId });
            if (rs2.error) {
              mostrarToast('Producto creado, pero no se pudo registrar el stock inicial: ' + rs2.error + '. Cargalo desde Inventario.', 'error');
            } else {
              mostrarToast('Producto creado con stock inicial de ' + stockInicial);
            }
          } else {
            mostrarToast('Producto creado');
          }
        }
      }

      // Guardar multimedia
      var mmRows = obtenerMultimediaRows();
      var mmPromises = mmRows.map(function (mm) {
        if (mm.id) {
          return DB.productosMultimedia.actualizar(mm.id, {
            url: mm.url,
            tipo: mm.tipo,
            orden: mm.orden,
            alt_text: mm.alt_text
          });
        } else {
          return DB.productosMultimedia.crear({
            producto_id: productoId,
            url: mm.url,
            tipo: mm.tipo,
            orden: mm.orden,
            alt_text: mm.alt_text
          });
        }
      });

      MULTIMEDIA_ELIMINADOS.forEach(function (id) {
        mmPromises.push(DB.productosMultimedia.eliminar(id));
      });

      await Promise.all(mmPromises);
      limpiarFormulario();
      await cargarProductos();
    } catch (e) {
      console.error('[Productos] Error guardar:', e);
      mostrarToast('Error inesperado');
    }

    _guardando = false;
    $('btn-guardar').disabled = false;
    $('btn-guardar').textContent = 'Guardar Producto';
  }

  /* ───────────────────────────────────────────────
     ELIMINAR
     ─────────────────────────────────────────────── */
  async function eliminarProducto(detalleId) {
    if (!confirm('¿Eliminar este producto?')) return;
    var p = PRODUCTOS.find(function (x) { return x.detalleId === detalleId; });
    if (!p) return;
    var r = await DB.productos.eliminar(p.productoId);
    if (r.error) { mostrarToast('Error: ' + r.error); return; }
    mostrarToast('Producto eliminado');
    if (EDITANDO_ID === detalleId) limpiarFormulario();
    await cargarProductos();
  }

  async function verProducto(detalleId) {
    var p = PRODUCTOS.find(function (x) { return x.detalleId === detalleId; });
    if (!p) { mostrarToast('Producto no encontrado'); return; }
    var productoId = p.productoId;

    // Header
    $('det-prod-nombre').textContent = p.nombre;
    var badge = $('det-prod-estado');
    if (p.activo) {
      badge.textContent = 'Activo';
      badge.className = 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
    } else {
      badge.textContent = 'Inactivo';
      badge.className = 'inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
    }

    // Info basica
    $('det-prod-codigo-interno').textContent = p.codigoInterno || '—';
    $('det-prod-codigo-barras').textContent = p.codigoBarras || '—';
    $('det-prod-categoria').textContent = p.categoriaNombre || '—';
    $('det-prod-marca').textContent = p.marca || '—';
    $('det-prod-modelo').textContent = p.modelo || '—';
    $('det-prod-tipo').textContent = p.tipoProducto || '—';

    // Precios
    $('det-prod-precio-venta').textContent = formatearMoneda(p.precio);
    $('det-prod-precio-compra').textContent = formatearMoneda(p.precioCompra);
    $('det-prod-precio-mayorista').textContent = p.precioMayorista > 0 ? formatearMoneda(p.precioMayorista) : '—';
    $('det-prod-precio-original').textContent = p.precioOriginal > 0 ? formatearMoneda(p.precioOriginal) : '—';
    $('det-prod-margen').textContent = p.margen > 0 ? p.margen + '%' : '—';
    $('det-prod-descuento-max').textContent = p.descuentoMax > 0 ? p.descuentoMax + '%' : '—';
    $('det-prod-iva').textContent = Math.round(p.tasaImpuesto * 100) + '%';

    // Inventario
    $('det-prod-stock').textContent = p.stock;
    $('det-prod-stock-min').textContent = p.stockMin || '—';
    $('det-prod-stock-max').textContent = p.stockMax || '—';

    // Descripcion
    var descContainer = $('det-prod-descripcion-container');
    var descEl = $('det-prod-descripcion');
    if (p.descripcion) {
      descEl.textContent = p.descripcion;
      descContainer.classList.remove('hidden');
    } else {
      descContainer.classList.add('hidden');
    }

    // Tags
    var tagsContainer = $('det-prod-tags-container');
    var tagsEl = $('det-prod-tags');
    if (p.tags && p.tags.length) {
      tagsEl.innerHTML = p.tags.map(function (t) { return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">' + t + '</span>'; }).join(' ');
      tagsContainer.classList.remove('hidden');
    } else {
      tagsContainer.classList.add('hidden');
    }

    // Peso y dimensiones
    var pesoDimContainer = $('det-prod-peso-dim');
    if (p.peso || p.dimensiones) {
      $('det-prod-peso').textContent = p.peso ? p.peso + ' kg' : '—';
      $('det-prod-dimensiones').textContent = p.dimensiones || '—';
      pesoDimContainer.classList.remove('hidden');
    } else {
      pesoDimContainer.classList.add('hidden');
    }

    // Imagen (multimedia)
    var imgContainer = $('det-prod-img-container');
    var imgEl = $('det-prod-img');
    try {
      var mmRes = await DB.productosMultimedia.listar(productoId);
      var imagenes = (mmRes.data || []).filter(function (m) { return m.tipo === 'imagen' && m.url; });
      if (imagenes.length) {
        imgEl.src = imagenes[0].url;
        imgEl.alt = imagenes[0].alt_text || p.nombre;
        imgContainer.classList.remove('hidden');
      } else {
        imgContainer.classList.add('hidden');
      }
    } catch (_) {
      imgContainer.classList.add('hidden');
    }

    // Variantes (si tiene multi-variante)
    var varsContainer = $('det-prod-variantes-container');
    var varsTbody = $('det-prod-variantes-tbody');
    try {
      var detRes = await DB.productos.listarDetalleActivos({
        filters: [{ col: 'producto_id', val: productoId }]
      });
      var variantes = (detRes.data || []).filter(function (d) { return !d.deleted_at; });
      if (variantes.length > 1) {
        varsContainer.classList.remove('hidden');
        varsTbody.innerHTML = variantes.map(function (v) {
          var attrStr = v.atributos ? Object.keys(v.atributos).map(function (k) { return k + ': ' + v.atributos[k]; }).join(', ') : '—';
          return '<tr class="border-b border-slate-100 dark:border-slate-800/50">' +
            '<td class="py-2 px-2 text-sm text-slate-700 dark:text-slate-300">' + attrStr + '</td>' +
            '<td class="py-2 px-2 text-center text-sm text-slate-500 dark:text-slate-400">' + (v.codigo_interno || '—') + '</td>' +
            '<td class="py-2 px-2 text-right text-sm text-slate-950 dark:text-white font-medium">' + formatearMoneda(v.precio_venta || 0) + '</td>' +
            '<td class="py-2 px-2 text-right text-sm text-slate-500 dark:text-slate-400 hidden sm:table-cell">' + formatearMoneda(v.precio_compra || 0) + '</td>' +
            '<td class="py-2 px-2 text-center text-sm"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (v.stock_actual > 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400') + '">' + (v.stock_actual || 0) + '</span></td></tr>';
        }).join('');
      } else {
        varsContainer.classList.add('hidden');
      }
    } catch (_) {
      varsContainer.classList.add('hidden');
    }

    // Mostrar modal
    $('modal-detalle-producto').classList.remove('hidden');
    $('modal-detalle-producto').classList.add('flex');
  }

  function cerrarDetalleProducto() {
    $('modal-detalle-producto').classList.add('hidden');
    $('modal-detalle-producto').classList.remove('flex');
  }

  /* ───────────────────────────────────────────────
     PAGINACION
     ─────────────────────────────────────────────── */
  function irPagina(n) {
    var total = PRODUCTOS_FILTRADOS.length;
    var paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (n < 1 || n > paginas) return;
    PAGINA = n;
    renderizarTabla();
    $('productos-tbody').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ───────────────────────────────────────────────
     SIDEBAR
     ─────────────────────────────────────────────── */
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

  /* ───────────────────────────────────────────────
     UTILITY
     ─────────────────────────────────────────────── */
  function formatearMoneda(valor) {
    return '$' + valor.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function calcularMargen() {
    var venta = parseFloat($('campo-precio-venta').value) || 0;
    var compra = parseFloat($('campo-precio-compra').value) || 0;
    if (venta > 0 && compra > 0) {
      $('campo-margen').value = Math.round((venta - compra) / compra * 100) + '%';
    } else {
      $('campo-margen').value = '';
    }
  }

  /* ───────────────────────────────────────────────
     EVENTOS
     ─────────────────────────────────────────────── */
  function bindearEventos() {
    // Dark mode
    $('btn-dark').addEventListener('click', function () {
      html.classList.toggle('dark');
      localStorage.setItem('darkMode', html.classList.contains('dark'));
    });

    // Sidebar
    $('btn-menu').addEventListener('click', toggleSidebar);
    $('btn-cerrar-menu').addEventListener('click', toggleSidebar);
    $('sidebar-overlay').addEventListener('click', toggleSidebar);

    // Formulario
    $('btn-limpiar-form').addEventListener('click', limpiarFormulario);
    $('btn-guardar').addEventListener('click', guardarProducto);

    // Tags
    document.getElementById('tags-container').addEventListener('click', function (e) {
      var chip = e.target.closest('.tag-chip');
      if (chip) chip.classList.toggle('active');
    });

    // Margen auto
    $('campo-precio-venta').addEventListener('input', calcularMargen);
    $('campo-precio-compra').addEventListener('input', calcularMargen);

    // Variantes
    $('toggle-variantes').addEventListener('change', toggleModoVariantes);

    $('btn-agregar-atributo').addEventListener('click', function () {
      ATRIBUTOS_DEF.push({ nombre: '' });
      renderizarAtributos();
      renderizarTablaVariantes();
    });

    $('atributos-container').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-eliminar-atributo');
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx);
      ATRIBUTOS_DEF.splice(idx, 1);
      renderizarAtributos();
      renderizarTablaVariantes();
    });

    $('atributos-container').addEventListener('change', function () {
      renderizarTablaVariantes();
    });

    $('btn-agregar-variante').addEventListener('click', function () {
      syncVariantesFromDOM();
      leerAtributosDesdeDOM();
      agregarVariante();
    });

    $('variantes-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-eliminar-variante');
      if (btn) {
        var idx = parseInt(btn.dataset.idx);
        eliminarVariante(idx);
        return;
      }
      var expandBtn = e.target.closest('.btn-expand-variante');
      if (expandBtn) {
        var idx2 = parseInt(expandBtn.dataset.idx);
        var row = expandBtn.closest('.variant-row');
        var secondary = row ? row.nextElementSibling : null;
        if (secondary && secondary.classList.contains('variant-row-secondary')) {
          secondary.classList.toggle('hidden');
          var svg = expandBtn.querySelector('svg');
          if (svg) svg.classList.toggle('rotate-180');
          if (VARIANTES[idx2]) VARIANTES[idx2]._expandido = !secondary.classList.contains('hidden');
        }
        return;
      }
    });

    $('variantes-tbody').addEventListener('input', function () {
      leerAtributosDesdeDOM();
    });

    // Multimedia
    $('btn-agregar-mm').addEventListener('click', function () { agregarFilaMultimedia(); });
    $('multimedia-container').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-eliminar-mm');
      if (btn) eliminarFilaMultimedia(btn.closest('.multimedia-row'));
    });

    // Filtros
    $('buscador-productos').addEventListener('input', productosFiltrarYRender);
    $('filtro-categoria').addEventListener('change', productosFiltrarYRender);
    $('mostrar-inactivos').addEventListener('change', cargarProductos);

    // Paginacion
    $('pag-controles').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 'pag-prev') irPagina(PAGINA - 1);
      if (btn.id === 'pag-next') irPagina(PAGINA + 1);
    });

    // Tabla (delegacion)
    $('productos-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('btn-ver')) verProducto(btn.dataset.id);
      if (btn.classList.contains('btn-editar')) cargarEnForm(btn.dataset.id);
      if (btn.classList.contains('btn-eliminar')) eliminarProducto(btn.dataset.id);
    });

    // Modal detalle
    $('btn-cerrar-detalle-producto').addEventListener('click', cerrarDetalleProducto);
    $('btn-cerrar-detalle-producto-2').addEventListener('click', cerrarDetalleProducto);
    $('modal-detalle-producto').addEventListener('click', function (e) {
      if (e.target === this) cerrarDetalleProducto();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('modal-detalle-producto').classList.contains('hidden')) cerrarDetalleProducto();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
