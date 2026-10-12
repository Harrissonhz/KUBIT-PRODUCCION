/* ============================================================
   fecha.js — Kubit-WMS — Fechas y horas en zona America/Bogota (B2)
   ------------------------------------------------------------
   Regla: TODA fecha que se muestre al usuario usa la zona horaria
   America/Bogota (UTC-5, sin horario de verano), de forma EXPLICITA.
   No se depende de la zona configurada en el celular o el computador.

   La base de datos guarda timestamptz; PostgREST lo entrega en UTC
   (ej. '2026-10-01T21:42:00+00:00' = 4:42 p. m. en Bogota).

   Expone: window.WMSFecha
     .hora(valor?)       -> "4:42 p. m."           (sin valor: la hora actual)
     .fecha(valor)       -> "1 oct 2026"
     .fechaHora(valor)   -> "1 oct 2026, 4:42 p. m."
     .relativa(valor)    -> "Hoy, 4:42 p. m." | "Ayer, 9:10 a. m." | "28 sep, 11:05 a. m."
     .diaBogota(valor)   -> "2026-10-01" (dia calendario en Bogota, para comparar)
   ============================================================ */
window.WMSFecha = (function () {
  var ZONA = 'America/Bogota';
  var LOCALE = 'es-CO';

  function aDate(valor) {
    if (valor == null || valor === '') return null;
    var d = valor instanceof Date ? valor : new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmt(valor, opciones) {
    var d = aDate(valor);
    if (!d) return '';
    var o = { timeZone: ZONA };
    for (var k in opciones) o[k] = opciones[k];
    return new Intl.DateTimeFormat(LOCALE, o).format(d);
  }

  // "2026-10-01" del dia calendario en Bogota
  function diaBogota(valor) {
    var d = aDate(valor);
    if (!d) return '';
    var partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    var m = {};
    partes.forEach(function (p) { m[p.type] = p.value; });
    return m.year + '-' + m.month + '-' + m.day;
  }

  function hora(valor) {
    return fmt(valor == null ? new Date() : valor, { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function fecha(valor) {
    return fmt(valor, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  }

  function fechaHora(valor) {
    var f = fecha(valor);
    return f ? f + ', ' + hora(valor) : '';
  }

  function relativa(valor) {
    var d = aDate(valor);
    if (!d) return '';
    var hoy = diaBogota(new Date());
    var ayer = diaBogota(new Date(Date.now() - 24 * 60 * 60 * 1000));
    var dia = diaBogota(d);
    if (dia === hoy) return 'Hoy, ' + hora(d);
    if (dia === ayer) return 'Ayer, ' + hora(d);
    var mismoAnio = dia.slice(0, 4) === hoy.slice(0, 4);
    var f = fmt(d, mismoAnio ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
    return f + ', ' + hora(d);
  }

  return {
    ZONA: ZONA,
    hora: hora,
    fecha: fecha,
    fechaHora: fechaHora,
    relativa: relativa,
    diaBogota: diaBogota
  };
})();
