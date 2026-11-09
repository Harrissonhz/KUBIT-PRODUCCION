document.addEventListener('DOMContentLoaded', () => {
  const $navbar = document.getElementById('navbar');
  if (!$navbar) return;

  $navbar.innerHTML = `
    <nav class="bg-slate-950 border-b border-slate-800 fixed top-0 left-0 right-0 z-50 w-full">
      <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-14">
          <a href="index.html" class="flex items-center gap-2 shrink-0">
            <img src="img/LogoTodasPublicaciones.jpg" alt="OutletShop" class="h-8 w-auto rounded">
          </a>

          <div class="hidden md:flex items-center flex-1 max-w-md mx-6">
            <div class="relative w-full">
              <input type="text" id="buscador"
                     class="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-white placeholder:text-slate-500 text-white"
                     placeholder="Buscar productos...">
              <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
          </div>

          <div class="hidden md:flex items-center gap-2 mr-2">
            <a href="https://www.facebook.com/outletshop.tiendavirtual/" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Facebook">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.35 3.24 9.35 5.47v1.99H6.85v4.57h2.5V23h5.15v-10.5h3.47l.7-4.57z"/></svg>
            </a>
            <a href="https://www.instagram.com/OutletShop_for_my/" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Instagram">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke-width="1.5"/><circle cx="12" cy="12" r="5" stroke-width="1.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
            </a>
            <a href="https://www.tiktok.com/@outletshoptienda" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="TikTok">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.9 2.89 2.89 0 01-2.88-2.89 2.89 2.89 0 012.88-2.89c.32 0 .62.06.92.14V9.43a6.35 6.35 0 00-.92-.07A6.34 6.34 0 004.3 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.17a8.27 8.27 0 004.02 1.36v-3.4c-.27.01-.54-.02-.81-.04z"/></svg>
            </a>
            <a href="https://www.threads.com/@outletshop_for_my" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Threads">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5.5 11.5c-.08 1.2-.6 2.3-1.4 3.1-1.1 1.1-2.7 1.7-4.6 1.7-1.8 0-3.4-.5-4.6-1.5-1.1-.9-1.7-2.1-1.7-3.4 0-1.2.6-2.4 1.7-3.3 1.2-1 2.7-1.5 4.5-1.5 1.8 0 3.3.5 4.5 1.5.7.6 1.2 1.3 1.5 2.1.1.3.1.6 0 .9-.1.2-.3.4-.5.4-.1 0-.3-.1-.4-.2-.1-.2-.2-.5-.3-.7-.2-.7-.7-1.3-1.3-1.7-.8-.6-1.9-.9-3.2-.9-1.4 0-2.6.4-3.5 1.2-.9.8-1.3 1.8-1.3 3 0 1.2.4 2.2 1.3 3 .9.8 2 1.2 3.4 1.2 1.2 0 2.2-.3 3-.8.5-.3.9-.7 1.2-1.2h-2.3c-.2 0-.3-.1-.4-.3-.1-.3-.1-.6 0-.9 0-.2.2-.4.4-.4h3.1c.1 0 .2.1.2.2.1.6.1 1.2 0 1.8z"/></svg>
            </a>
            <a href="https://www.youtube.com/@OutletShopTiendaVirtual" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="YouTube">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.5 6.2c-.3-1-1.1-1.8-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6c-1 .3-1.8 1.1-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1.1 1.8 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.8-1.1 2.1-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.5V8.5l6.3 3.5z"/></svg>
            </a>
          </div>

          <div class="flex items-center gap-1">
            <button class="md:hidden p-1.5 text-slate-400 hover:text-white" id="btn-buscar-movil" aria-label="Buscar">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </button>

            <a href="carrito.html" class="relative p-1.5 text-slate-400 hover:text-white" aria-label="Carrito">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
              </svg>
              <span id="cart-badge" class="absolute -top-0.5 -right-0.5 bg-white text-slate-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">0</span>
            </a>
            <button class="md:hidden p-1.5 text-slate-400 hover:text-white" id="btn-menu-movil" aria-label="Menú">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="md:hidden hidden" id="menu-movil">
          <div class="py-2 border-t border-slate-800">
            <input type="text" id="buscador-movil"
                   class="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-white placeholder:text-slate-500 text-white mb-2"
                   placeholder="Buscar productos...">
            <div class="flex items-center gap-4 py-2">
              <a href="https://www.facebook.com/outletshop.tiendavirtual/" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Facebook">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.35 3.24 9.35 5.47v1.99H6.85v4.57h2.5V23h5.15v-10.5h3.47l.7-4.57z"/></svg>
              </a>
              <a href="https://www.instagram.com/OutletShop_for_my/" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Instagram">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke-width="1.5"/><circle cx="12" cy="12" r="5" stroke-width="1.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
              </a>
              <a href="https://www.tiktok.com/@outletshoptienda" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="TikTok">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.9 2.89 2.89 0 01-2.88-2.89 2.89 2.89 0 012.88-2.89c.32 0 .62.06.92.14V9.43a6.35 6.35 0 00-.92-.07A6.34 6.34 0 004.3 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.17a8.27 8.27 0 004.02 1.36v-3.4c-.27.01-.54-.02-.81-.04z"/></svg>
              </a>
              <a href="https://www.threads.com/@outletshop_for_my" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="Threads">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm5.5 11.5c-.08 1.2-.6 2.3-1.4 3.1-1.1 1.1-2.7 1.7-4.6 1.7-1.8 0-3.4-.5-4.6-1.5-1.1-.9-1.7-2.1-1.7-3.4 0-1.2.6-2.4 1.7-3.3 1.2-1 2.7-1.5 4.5-1.5 1.8 0 3.3.5 4.5 1.5.7.6 1.2 1.3 1.5 2.1.1.3.1.6 0 .9-.1.2-.3.4-.5.4-.1 0-.3-.1-.4-.2-.1-.2-.2-.5-.3-.7-.2-.7-.7-1.3-1.3-1.7-.8-.6-1.9-.9-3.2-.9-1.4 0-2.6.4-3.5 1.2-.9.8-1.3 1.8-1.3 3 0 1.2.4 2.2 1.3 3 .9.8 2 1.2 3.4 1.2 1.2 0 2.2-.3 3-.8.5-.3.9-.7 1.2-1.2h-2.3c-.2 0-.3-.1-.4-.3-.1-.3-.1-.6 0-.9 0-.2.2-.4.4-.4h3.1c.1 0 .2.1.2.2.1.6.1 1.2 0 1.8z"/></svg>
              </a>
              <a href="https://www.youtube.com/@OutletShopTiendaVirtual" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors" aria-label="YouTube">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.5 6.2c-.3-1-1.1-1.8-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6c-1 .3-1.8 1.1-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1.1 1.8 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.8-1.1 2.1-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.5V8.5l6.3 3.5z"/></svg>
              </a>
          </div>
            <div class="space-y-1">
              <a href="index.html" class="block px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 rounded-lg">Productos</a>
              <a href="preguntas-frecuentes.html" class="block px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 rounded-lg">Ayuda</a>
              <a href="carrito.html" class="block px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 rounded-lg">Carrito</a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;

  actualizarBadgeCarrito();

  // T5a (ST-32): el buscador muestra lo que se busco (?q=...)
  const qActual = new URLSearchParams(window.location.search).get('q');
  if (qActual) {
    const $buscadorEscritorio = document.getElementById('buscador');
    const $buscadorMovil = document.getElementById('buscador-movil');
    if ($buscadorEscritorio) $buscadorEscritorio.value = qActual;
    if ($buscadorMovil) $buscadorMovil.value = qActual;
  }

  const btnMenu = document.getElementById('btn-menu-movil');
  const menuMovil = document.getElementById('menu-movil');
  btnMenu.addEventListener('click', () => {
    menuMovil.classList.toggle('hidden');
  });

  const btnBuscarMovil = document.getElementById('btn-buscar-movil');
  btnBuscarMovil.addEventListener('click', () => {
    menuMovil.classList.remove('hidden');
    document.getElementById('buscador-movil')?.focus();
  });

  document.getElementById('buscador')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const termino = e.target.value.trim();
      if (termino) window.location.href = `index.html?q=${encodeURIComponent(termino)}`;
    }
  });

  document.getElementById('buscador-movil')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const termino = e.target.value.trim();
      if (termino) window.location.href = `index.html?q=${encodeURIComponent(termino)}`;
    }
  });
});

function actualizarBadgeCarrito() {
  const carrito = JSON.parse(localStorage.getItem('kubit_carrito') || '[]');
  const total = carrito.reduce((sum, item) => sum + (item.cantidad || 1), 0);
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
  }
}
