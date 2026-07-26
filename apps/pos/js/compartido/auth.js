/* ============================================================
   auth.js — Autenticacion real contra Supabase Auth
   Basado en pos_usuarios, pos_roles, pos_rol_permisos, pos_permisos
   Requiere: config.js, supabase.js (window.__supabase)
   ============================================================ */

window.KubitAuth = (function () {
  var USUARIO_ACTUAL = null;

  /* ─── STORAGE ─── */
  function _guardarSesion() {
    if (USUARIO_ACTUAL) {
      localStorage.setItem('kubit_sesion', JSON.stringify(USUARIO_ACTUAL));
    }
  }

  function _cargarStorage() {
    var data = localStorage.getItem('kubit_sesion');
    if (data) {
      try { return JSON.parse(data); } catch (e) { /* ignora */ }
    }
    return null;
  }

  function _limpiarStorage() {
    localStorage.removeItem('kubit_sesion');
    localStorage.removeItem('pos_caja');
    localStorage.removeItem('pos_caja_nombre');
  }

  /* ─── QUERIES A SUPABASE ─── */
  async function _cargarPermisos(rolId) {
    try {
      var data = await window.__supabase.get(
        'pos_rol_permisos?select=permiso_id(clave)&rol_id=eq.' + rolId
      );
      if (!data || !data.length) return [];
      return data.map(function (rp) { return rp.permiso_id ? rp.permiso_id.clave : null; }).filter(Boolean);
    } catch (e) {
      console.error('[auth] Error cargando permisos:', e);
      return [];
    }
  }

  async function _cargarUsuario(email) {
    try {
      var data = await window.__supabase.get(
        'pos_usuarios?select=*,rol_id(id,nombre,descripcion)&email=eq.' + encodeURIComponent(email)
      );
      if (!data || !data.length) return null;
      return data[0];
    } catch (e) {
      console.error('[auth] Error cargando usuario:', e);
      return null;
    }
  }

  /* ─── LOGIN ─── */
  async function login(email, password) {
    try {
      if (!window.__supabase) {
        return { exito: false, error: 'Cliente Supabase no disponible' };
      }

      // 1. Autenticar contra Supabase Auth (REST API)
      var res = await fetch(
        window.__supabase.supabaseUrl + '/auth/v1/token?grant_type=password',
        {
          method: 'POST',
          headers: {
            'apikey': window.__supabase.supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: email, password: password })
        }
      );

      if (!res.ok) {
        var errText = await res.text();
        return { exito: false, error: 'Credenciales invalidas. Verifica tu email y contrasena.' };
      }

      var authData = await res.json();

      // 2. Configurar el token en el cliente
      window.__supabase.setAuth(authData.access_token);

      // 3. Cargar datos del usuario desde pos_usuarios
      var usuario = await _cargarUsuario(email);
      if (!usuario) {
        window.__supabase.clearAuth();
        return { exito: false, error: 'Usuario no encontrado en el sistema. Contacta al administrador.' };
      }

      // 4. Cargar permisos del rol
      var rolId = typeof usuario.rol_id === 'object' ? usuario.rol_id.id : usuario.rol_id;
      var permisos = await _cargarPermisos(rolId);

      // 5. Extraer datos del rol
      var rolNombre = 'Vendedor';
      if (typeof usuario.rol_id === 'object' && usuario.rol_id) {
        rolNombre = usuario.rol_id.nombre || 'Vendedor';
      }

      // 6. Armar sesion
      USUARIO_ACTUAL = {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        usuario: usuario.usuario,
        rolNombre: rolNombre,
        rolId: rolId,
        permisos: permisos,
        cajaId: null,
        cajaNombre: null,
        accessToken: authData.access_token,
        refreshToken: authData.refresh_token,
        loginAt: new Date().toISOString()
      };

      _guardarSesion();
      poblarUserHeader();
      return { exito: true, sesion: USUARIO_ACTUAL };

    } catch (e) {
      console.error('[auth] Error en login:', e);
      return { exito: false, error: 'Error de conexion. Intenta de nuevo.' };
    }
  }

  /* ─── LOGOUT ─── */
  function logout() {
    window.__supabase && window.__supabase.clearAuth();
    USUARIO_ACTUAL = null;
    _limpiarStorage();
  }

  /* ─── SESION ─── */
  function cargarSesion() {
    var s = _cargarStorage();
    if (s && s.accessToken) {
      if (window.__supabase) {
        window.__supabase.setAuth(s.accessToken);
      }
      USUARIO_ACTUAL = s;
    }
    poblarUserHeader();
    if (typeof DB !== 'undefined' && DB.cargarLinkTienda) {
      DB.cargarLinkTienda();
    }
    return USUARIO_ACTUAL;
  }

  function obtenerUsuario() {
    return USUARIO_ACTUAL;
  }

  /* ─── PERMISOS ─── */
  function tienePermiso(permiso) {
    if (!USUARIO_ACTUAL) return false;
    if (USUARIO_ACTUAL.rolNombre === 'Administrador') return true;
    var p = USUARIO_ACTUAL.permisos || [];
    if (p.indexOf(permiso) !== -1) return true;
    if (p.indexOf(permiso.split('.')[0] + '.*') !== -1) return true;
    var parts = permiso.split('.');
    if (parts.length >= 2) {
      var wildcard = parts[0] + '.' + parts[1] + '.*';
      if (p.indexOf(wildcard) !== -1) return true;
    }
    return false;
  }

  function requierePermiso(permiso) {
    if (!tienePermiso(permiso)) {
      _mostrarError('No tienes permiso para realizar esta accion');
      return false;
    }
    return true;
  }

  /* ─── UI ─── */
  function aplicarRestriccionesUI() {
    if (!USUARIO_ACTUAL) return;

    document.querySelectorAll('[data-permiso]').forEach(function (el) {
      if (!tienePermiso(el.dataset.permiso)) {
        el.classList.add('hidden');
      }
    });
  }

  function poblarUserHeader() {
    var avatar = document.getElementById('user-avatar');
    var nameEl = document.getElementById('user-name');
    var rolEl = document.getElementById('user-rol');
    if (!avatar || !nameEl || !rolEl) return;
    if (!USUARIO_ACTUAL) return;
    nameEl.textContent = USUARIO_ACTUAL.nombre || 'Admin';
    rolEl.textContent = USUARIO_ACTUAL.rolNombre || '';
    avatar.textContent = (USUARIO_ACTUAL.nombre || 'A').charAt(0).toUpperCase();
  }

  function _mostrarError(msg) {
    var toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }
  }

  /* ─── AUTO-CARGAR ─── */
  cargarSesion();

  /* ─── ERROR DE AUTENTICACION ─── */
  function manejarErrorAuth() {
    _limpiarStorage();
    window.__supabase && window.__supabase.clearAuth();
    USUARIO_ACTUAL = null;
    var actual = window.location.pathname.split('/').pop();
    if (actual !== 'login.html') {
      window.location.href = 'login.html?expired=1';
    }
  }

  /* ─── API PUBLICA ─── */
  return {
    login: login,
    logout: logout,
    cargarSesion: cargarSesion,
    obtenerUsuario: obtenerUsuario,
    tienePermiso: tienePermiso,
    requierePermiso: requierePermiso,
    aplicarRestriccionesUI: aplicarRestriccionesUI,
    poblarUserHeader: poblarUserHeader,
    manejarErrorAuth: manejarErrorAuth
  };
})();
