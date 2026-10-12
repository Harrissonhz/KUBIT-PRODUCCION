/* ============================================================
   login.js — Kubit-WMS
   Adaptado de apps/pos/js/paginas/login.js:
   - SIN selector de caja (el WMS no la usa).
   - Destino despues del login: buscar.html.
   - Modo oscuro por defecto (lo maneja el anti-flash del <head>).
   - Si ya hay sesion, entra directo a buscar.html.
   ============================================================ */
(function () {
  var html = document.documentElement;
  var toggleBtn = document.getElementById('toggle-dark');
  var form = document.getElementById('form-login');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var errorEl = document.getElementById('login-error');
  var btnIngresar = document.getElementById('btn-ingresar');
  var DESTINO = 'buscar.html';
  var params = new URLSearchParams(window.location.search);

  // Si ya hay sesion guardada, ir directo (buscar.html valida si el token vencio)
  if (params.get('expired') !== '1' && window.KubitAuth && window.KubitAuth.obtenerUsuario()) {
    window.location.replace(DESTINO);
    return;
  }

  // Cargar logo de empresa con cache en localStorage (copia del POS)
  (function () {
    var container = document.querySelector('.w-14.h-14.bg-slate-950.rounded-2xl');
    if (!container) return;
    function cargarLogo(url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'Logo';
      img.className = 'h-14 w-auto max-w-[240px]';
      img.onerror = function () {
        container.innerHTML = '<span class="text-white dark:text-slate-950 text-2xl font-bold">K</span>';
        container.className = 'w-14 h-14 bg-slate-950 dark:bg-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm';
      };
      container.innerHTML = '';
      container.className = 'h-14 flex items-center justify-center mx-auto mb-5';
      container.appendChild(img);
    }
    var cachedLogo = localStorage.getItem('logo_url');
    if (cachedLogo) cargarLogo(cachedLogo);
    DB.configuracionEmpresa.obtener().then(function (res) {
      if (res.data && res.data.logo_url) {
        localStorage.setItem('logo_url', res.data.logo_url);
        if (!cachedLogo || cachedLogo !== res.data.logo_url) cargarLogo(res.data.logo_url);
      }
    }).catch(function () {});
  })();

  // Mensaje si viene de sesion expirada
  if (params.get('expired') === '1') {
    errorEl.textContent = 'Tu sesion ha expirado. Inicia sesion de nuevo.';
    errorEl.classList.remove('hidden');
  }

  toggleBtn.addEventListener('click', function () {
    html.classList.toggle('dark');
    localStorage.setItem('darkMode', html.classList.contains('dark'));
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.classList.add('hidden');
    var email = emailInput.value.trim();
    var password = passwordInput.value.trim();
    if (!email || !password) {
      errorEl.textContent = 'Email y contrasena son requeridos';
      errorEl.classList.remove('hidden');
      return;
    }
    btnIngresar.disabled = true;
    btnIngresar.textContent = 'Ingresando...';
    var resultado = await window.KubitAuth.login(email, password);
    if (!resultado.exito) {
      errorEl.textContent = resultado.error;
      errorEl.classList.remove('hidden');
      btnIngresar.disabled = false;
      btnIngresar.textContent = 'Ingresar';
      return;
    }
    window.location.replace(DESTINO);
  });
})();
