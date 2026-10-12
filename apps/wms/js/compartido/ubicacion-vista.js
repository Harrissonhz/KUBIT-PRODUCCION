/* ============================================================
   ubicacion-vista.js — Kubit-WMS — Como se muestra una ubicacion (V1)
   ------------------------------------------------------------
   Formato aprobado (2026-10-01) para Buscar y Ubicar:

     30191                                11   <- codigo del adhesivo y cantidad, grandes
     Canastilla 01 › Suelto 91 · nombre        <- puesto y posicion (dentro de la bodega)
     Bodega 3 · Cuarto Util Grande             <- bodega (texto pequeno)
     UBICADO                                   <- estado (opcional)

   - El codigo va primero y en fuente de ancho fijo: es lo que se compara
     con el adhesivo escrito a marcador.
   - Lo que esta SIN UBICAR se muestra como una fila aparte, sin codigo.
   - Orden: UBICADO, SIN_UBICAR, RESERVADO.
   Los datos del contenedor (tipo, puesto, bodega) los entrega
   DB.wms.detalleUbicaciones(ids).
   Dependencias: database.js (window.DB)
   Expone: window.WMSUbicacion
   ============================================================ */
window.WMSUbicacion = (function () {
  var ETIQUETA = {
    CANASTILLA: 'Canastilla', ENTREPANO: 'Entrepano', ESTANTERIA: 'Estanteria',
    BOLSA: 'Bolsa', CAJA: 'Caja', SUELTO: 'Suelto'
  };
  var ESTADO = {
    UBICADO: { texto: 'Ubicado', clases: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
    SIN_UBICAR: { texto: 'Sin ubicar', clases: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
    RESERVADO: { texto: 'Reservado', clases: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400' }
  };
  var ORDEN = { UBICADO: 0, SIN_UBICAR: 1, RESERVADO: 2 };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function esPuesto(tipo) { return tipo === 'CANASTILLA' || tipo === 'ENTREPANO' || tipo === 'ESTANTERIA'; }
  function cc(codigo) { return String(codigo || '').slice(1, 3); }
  function pp(codigo) { return String(codigo || '').slice(3, 5); }

  /* "Canastilla 01 › Suelto 91 · nombre" */
  function lugar(info) {
    if (!info) return '';
    var partes = [];
    if (info.puesto) partes.push((ETIQUETA[info.puesto.tipo] || info.puesto.tipo) + ' ' + cc(info.puesto.codigo));
    partes.push((ETIQUETA[info.tipo] || info.tipo) + ' ' + (esPuesto(info.tipo) ? cc(info.codigo) : pp(info.codigo)));
    var texto = partes.join(' › ');
    if (info.nombre) texto += ' · ' + info.nombre;
    return texto;
  }

  /* "Bodega 3 · Cuarto Util Grande" */
  function bodega(info) {
    if (!info || !info.bodega) return '';
    return 'Bodega ' + info.bodega.codigo + (info.bodega.nombre ? ' · ' + info.bodega.nombre : '');
  }

  function insignia(estado) {
    var e = ESTADO[estado] || { texto: estado, clases: '' };
    return '<span class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ' + e.clases + '">' + esc(e.texto) + '</span>';
  }

  /* Bloque de una ubicacion con codigo */
  function bloque(codigo, cantidad, lineaLugar, lineaBodega, estado, opts) {
    opts = opts || {};
    return '<li class="py-2.5">' +
        '<div class="flex items-baseline justify-between gap-3">' +
          '<p class="font-mono text-2xl font-semibold tracking-wider leading-none">' + esc(codigo) + '</p>' +
          (cantidad != null ? '<p class="text-2xl font-semibold leading-none shrink-0">' + cantidad + '</p>' : '') +
        '</div>' +
        (lineaLugar ? '<p class="mt-1 text-sm truncate">' + esc(lineaLugar) + '</p>' : '') +
        (lineaBodega ? '<p class="text-xs text-slate-500 dark:text-slate-400 truncate">' + esc(lineaBodega) + '</p>' : '') +
        (opts.inactivo ? '<p class="text-xs text-amber-700 dark:text-amber-400">Contenedor inactivo</p>' : '') +
        (opts.sinEstado ? '' : insignia(estado)) +
      '</li>';
  }

  /* Fila sin contenedor (SIN_UBICAR, o RESERVADO tomado de lo sin ubicar) */
  function filaSinCodigo(estado, cantidad, opts) {
    var titulo = estado === 'RESERVADO' ? 'Reservado' : 'Sin ubicar';
    var ayuda = estado === 'RESERVADO' ? 'Por despachar, sin contenedor' : 'Sin contenedor asignado';
    return '<li class="py-2.5 flex items-center justify-between gap-3">' +
        '<div class="min-w-0">' +
          '<p class="text-sm font-medium">' + titulo + '</p>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400">' + ayuda + '</p>' +
          ((opts && opts.sinEstado) ? '' : insignia(estado)) +
        '</div>' +
        '<p class="text-2xl font-semibold leading-none shrink-0">' + cantidad + '</p>' +
      '</li>';
  }

  /* Lista de filas de wms_v_stock_detalle.
     filas: [{ estado_fase, cantidad, ubicacion_id, ruta }]
     mapa:  resultado de DB.wms.detalleUbicaciones (id -> info)
     opts:  { sinEstado: true } para no mostrar la insignia de estado */
  function lista(filas, mapa, opts) {
    filas = (filas || []).slice();
    mapa = mapa || {};
    if (!filas.length) return '';
    filas.sort(function (a, b) {
      var e = (ORDEN[a.estado_fase] != null ? ORDEN[a.estado_fase] : 9) - (ORDEN[b.estado_fase] != null ? ORDEN[b.estado_fase] : 9);
      if (e !== 0) return e;
      var ca = (mapa[a.ubicacion_id] || {}).codigo || '';
      var cb = (mapa[b.ubicacion_id] || {}).codigo || '';
      return ca.localeCompare(cb);
    });
    return '<ul class="divide-y divide-slate-200/60 dark:divide-slate-800">' +
      filas.map(function (f) {
        if (!f.ubicacion_id) return filaSinCodigo(f.estado_fase, f.cantidad, opts);
        var info = mapa[f.ubicacion_id];
        if (info) {
          return bloque(info.codigo, f.cantidad, lugar(info), bodega(info), f.estado_fase,
            { sinEstado: opts && opts.sinEstado, inactivo: info.activo === false });
        }
        // Respaldo: sin detalle, se toma el codigo del final de la ruta
        var m = String(f.ruta || '').match(/(\d{5})\s*$/);
        return bloque(m ? m[1] : '-----', f.cantidad, f.ruta, '', f.estado_fase, opts);
      }).join('') +
    '</ul>';
  }

  /* Carga el detalle de los contenedores: { data: mapa, error } */
  function cargar(ids) {
    return DB.wms.detalleUbicaciones(ids);
  }

  return {
    cargar: cargar,
    lista: lista,
    lugar: lugar,
    bodega: bodega,
    etiqueta: function (tipo) { return ETIQUETA[tipo] || tipo; }
  };
})();
