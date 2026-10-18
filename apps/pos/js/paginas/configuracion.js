(function () {
  'use strict';

  var EDITANDO_ID = null;

  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  async function init() {
    if (localStorage.getItem('darkMode') === 'true') html.classList.add('dark');
    window.KubitAuth.cargarSesion();
    if (!window.KubitAuth.obtenerUsuario()) { window.location.href = 'login.html'; return; }
    window.KubitAuth.aplicarRestriccionesUI();

    await cargarConfig();
    bindearEventos();
  }

  async function cargarConfig() {
    var res = await DB.configuracionEmpresa.obtener();
    if (res.error) {
      console.error('[Config] Error:', res.error);
      return;
    }
    var c = res.data;
    if (!c) return;

    EDITANDO_ID = c.id;
    $('campo-nombre-empresa').value = c.nombre_empresa || '';
    $('campo-nit').value = c.nit || '';
    $('campo-telefono').value = c.telefono || '';
    $('campo-email').value = c.email || '';
    $('campo-direccion').value = c.direccion || '';
    $('campo-sitio-web').value = c.sitio_web || '';
    $('campo-logo-url').value = c.logo_url || '';
    $('campo-store-url').value = c.store_url || '';
    $('campo-resolucion').value = c.resolucion_dian || '';
    $('campo-prefijo').value = c.prefijo_facturacion || '';
    $('campo-rango-desde').value = c.rango_desde || '';
    $('campo-rango-hasta').value = c.rango_hasta || '';
    $('campo-vencimiento').value = c.fecha_vencimiento_resolucion ? c.fecha_vencimiento_resolucion.slice(0, 10) : '';
    $('campo-mensaje-legal').value = c.mensaje_legal || '';
    // Fase 33: el 0 (exento) es un valor valido; solo se usa 0 si no hay dato
    var imp = parseFloat(c.impuesto_default);
    $('campo-impuesto').value = String(isNaN(imp) ? 0 : imp);
  }

  function obtenerDatosForm() {
    return {
      nombre_empresa: $('campo-nombre-empresa').value.trim(),
      nit: $('campo-nit').value.trim(),
      telefono: $('campo-telefono').value.trim() || null,
      email: $('campo-email').value.trim() || null,
      direccion: $('campo-direccion').value.trim() || null,
      sitio_web: $('campo-sitio-web').value.trim() || null,
      logo_url: $('campo-logo-url').value.trim() || null,
      store_url: $('campo-store-url').value.trim() || null,
      resolucion_dian: $('campo-resolucion').value.trim(),
      prefijo_facturacion: $('campo-prefijo').value.trim() || null,
      rango_desde: parseInt($('campo-rango-desde').value) || null,
      rango_hasta: parseInt($('campo-rango-hasta').value) || null,
      fecha_vencimiento_resolucion: $('campo-vencimiento').value || null,
      mensaje_legal: $('campo-mensaje-legal').value.trim() || null,
      impuesto_default: parseFloat($('campo-impuesto').value) || 0
    };
  }

  async function guardar() {
    var nombre = $('campo-nombre-empresa').value.trim();
    var nit = $('campo-nit').value.trim();
    var resolucion = $('campo-resolucion').value.trim();
    if (!nombre) { mostrarToast('El nombre de la empresa es obligatorio'); return; }
    if (!nit) { mostrarToast('El NIT es obligatorio'); return; }

    var data = obtenerDatosForm();
    var res = await DB.configuracionEmpresa.guardar(data);
    if (res.error) { mostrarToast('Error: ' + res.error); return; }
    mostrarToast('Configuraci\u00f3n guardada');
    await cargarConfig();
  }

  function reiniciar() {
    EDITANDO_ID = null;
    cargarConfig();
  }

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

    $('btn-guardar').addEventListener('click', guardar);
    $('btn-reiniciar').addEventListener('click', reiniciar);
  }

  document.addEventListener('DOMContentLoaded', init);
})();