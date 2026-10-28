// T1: escape de texto para nombres de variantes
function escHtml(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  var _lightboxImagenes = [];
  var _lightboxIndice = 0;
  var _autoplayTimer = null;
  var _autoplayActivo = false;
  var _tiempoFuera = null;

  try {
    var slug = obtenerParametroURL('slug');
    if (!slug) {
      document.getElementById('contenedor-producto').innerHTML = '\
        <div class="col-span-full text-center py-16">\
          <p class="text-slate-500 text-lg">Producto no encontrado</p>\
          <a href="index.html" class="inline-block mt-4 text-sm text-slate-950 underline">Volver a la tienda</a>\
        </div>\
      ';
      return;
    }

    var producto = await StoreAPI.productos.obtenerPorSlug(slug);
    if (!producto) {
      document.getElementById('contenedor-producto').innerHTML = '\
        <div class="col-span-full text-center py-16">\
          <p class="text-slate-500 text-lg">Producto no encontrado</p>\
          <a href="index.html" class="inline-block mt-4 text-sm text-slate-950 underline">Volver a la tienda</a>\
        </div>\
      ';
      return;
    }

  async function renderizarProducto(producto) {
    var categoria = await StoreAPI.categorias.obtenerPorSlug(producto.categoria);

    document.title = `${producto.nombre} - OutletShop`;

    document.getElementById('breadcrumb').innerHTML = `
      <a href="index.html" class="hover:text-slate-950 transition-colors">Inicio</a>
      <span>/</span>
      <a href="?categoria=${producto.categoria}" class="hover:text-slate-950 transition-colors">${categoria?.nombre || producto.categoria}</a>
      <span class="text-slate-600">/</span>
      <span class="text-slate-600">${producto.nombre}</span>
    `;

    const imgPrincipal = document.getElementById('img-principal');
    imgPrincipal.src = producto.imagen;
    imgPrincipal.alt = producto.nombre;

    _lightboxImagenes = [producto.imagen, ...(producto.imagenes || [])].filter(function(v, i, a) { return a.indexOf(v) === i; });
    const $thumbnails = document.getElementById('thumbnails');
    if (_lightboxImagenes.length > 1) {
      $thumbnails.innerHTML = _lightboxImagenes.map(function(img, i) { return '\
        <button class="w-16 h-16 shrink-0 rounded-lg border-2 overflow-hidden transition-all hover:border-slate-950 ' + (i === 0 ? 'border-slate-950' : 'border-slate-200') + '"\
                data-img="' + img + '" data-index="' + i + '">\
          <img src="' + img + '" alt="" class="w-full h-full object-cover" loading="lazy">\
        </button>\
      '; }).join('');

      $thumbnails.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn || btn.dataset.img === undefined) return;
        document.querySelectorAll('#thumbnails button').forEach(function(b) { b.classList.remove('border-slate-950'); });
        btn.classList.add('border-slate-950');
        imgPrincipal.src = btn.dataset.img;
        _lightboxIndice = parseInt(btn.dataset.index, 10);
      });

      document.getElementById('imagen-principal').classList.add('cursor-pointer');
      document.getElementById('imagen-principal').addEventListener('click', function() {
        abrirLightbox(_lightboxIndice);
      });
    }

    if (producto.videos && producto.videos.length > 0) {
      var posicion = Math.min(2, $thumbnails.children.length);
      producto.videos.forEach(function(videoId) {
        var btn = document.createElement('button');
        btn.className = 'video-thumb-wrapper w-16 h-16 shrink-0 rounded-lg border-2 border-slate-200 overflow-hidden';
        btn.innerHTML = '<img src="https://img.youtube.com/vi/' + videoId + '/default.jpg" alt="" class="w-full h-full object-cover" loading="lazy">' +
          '<svg class="video-play-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        btn.addEventListener('click', function() {
          abrirVideoModal(videoId);
        });
        var ref = $thumbnails.children[posicion];
        if (ref) {
          $thumbnails.insertBefore(btn, ref);
          posicion++;
        } else {
          $thumbnails.appendChild(btn);
        }
      });
    }

    document.getElementById('producto-categoria').textContent = categoria?.nombre || producto.categoria;
    document.getElementById('producto-nombre').textContent = producto.nombre;
    document.getElementById('producto-precio').innerHTML = renderPrecio(producto);
    document.getElementById('producto-descripcion').textContent = producto.descripcion_larga;

    if (producto.variantes && producto.variantes.length > 0) {
      const $variantes = document.getElementById('producto-variantes');
      const $lista = document.getElementById('variantes-lista');
      $variantes.classList.remove('hidden');

      // T1 (ST-03/26): variantes agotadas deshabilitadas, precio por variante
      const $precio = document.getElementById('producto-precio');
      const $btnAgregar = document.getElementById('btn-agregar');
      const primeraConStock = producto.variantes.find(function(v) { return (v.stock || 0) > 0; }) || null;
      let seleccionada = primeraConStock ? primeraConStock.id : null;

      const CLS_ACTIVA = ['border-slate-950', 'bg-slate-950', 'text-white'];
      const CLS_NORMAL = ['border-slate-200', 'text-slate-600', 'hover:border-slate-950'];

      $lista.innerHTML = producto.variantes.map(function(v) {
        var agotada = (v.stock || 0) <= 0;
        var activa = v.id === seleccionada;
        var cls = agotada
          ? 'border-slate-200 text-slate-300 line-through cursor-not-allowed'
          : (activa ? CLS_ACTIVA.join(' ') : CLS_NORMAL.join(' '));
        return '<button type="button" class="px-4 py-2 text-sm rounded-lg border transition-all ' + cls + '"' +
          ' data-variante-id="' + v.id + '"' + (agotada ? ' disabled aria-disabled="true" title="Agotado"' : '') + '>' +
          escHtml(v.nombre) +
          (agotada
            ? ' <span class="no-underline text-[10px] ml-1">Agotado</span>'
            : (v.stock <= 5 ? '<span class="text-red-400 text-[10px] ml-1">!</span>' : '')) +
          '</button>';
      }).join('');

      function pintarPrecioVariante() {
        var v = producto.variantes.find(function(x) { return x.id === seleccionada; });
        if (v) {
          $precio.innerHTML = renderPrecio({ precio: v.precio, precio_original: v.precio_original });
        } else if (producto.preciosDistintos) {
          $precio.innerHTML = '<span class="text-slate-400">Desde ' + formatearMoneda(producto.precioMin) + '</span>';
        }
        $btnAgregar.disabled = !v;
        $btnAgregar.textContent = v ? 'Agregar al carrito' : 'Agotado';
      }
      pintarPrecioVariante();

      $lista.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || btn.disabled) return;
        document.querySelectorAll('#variantes-lista button:not([disabled])').forEach(b => {
          b.classList.remove.apply(b.classList, CLS_ACTIVA);
          b.classList.add.apply(b.classList, CLS_NORMAL);
        });
        btn.classList.remove.apply(btn.classList, CLS_NORMAL);
        btn.classList.add.apply(btn.classList, CLS_ACTIVA);
        seleccionada = btn.dataset.varianteId;
        pintarPrecioVariante();
      });

      $btnAgregar.addEventListener('click', function() {
        // agregarAlCarrito valida la variante y su stock (nunca agrega sin variante)
        agregarAlCarrito(producto, { detalleId: seleccionada });
      });
    } else {
      document.getElementById('btn-agregar').addEventListener('click', function() {
        agregarAlCarrito(producto);
      });
    }

    const $especs = document.getElementById('especificaciones-lista');
    if (producto.especificaciones && producto.especificaciones.length > 0) {
      $especs.innerHTML = producto.especificaciones.map(e => `
        <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
          <span class="text-sm text-slate-500">${e.nombre}</span>
          <span class="text-sm text-slate-950 font-medium">${e.valor}</span>
        </div>
      `).join('');
    }
  }

  function abrirVideoModal(videoId) {
    var overlay = document.createElement('div');
    overlay.className = 'video-modal-overlay';
    overlay.innerHTML = '<div class="video-modal-content">' +
      '<button class="video-modal-close">&times;</button>' +
      '<div class="video-container">' +
      '<iframe src="https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' +
      '</div></div>';

    overlay.querySelector('.video-modal-close').addEventListener('click', function() {
      overlay.remove();
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  /* ════════════════════════════════════════
     LIGHTBOX MODAL
     ════════════════════════════════════════ */
  function abrirLightbox(indice) {
    _lightboxIndice = indice;

    var overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = '\
      <div class="lightbox-toolbar">\
        <div class="lightbox-toolbar-left"></div>\
        <div class="lightbox-toolbar-right">\
          <button class="lightbox-btn" id="btn-autoplay" aria-label="Autoplay">\
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>\
          </button>\
          <span class="lightbox-autoplay-indicator" id="autoplay-indicator"></span>\
          <button class="lightbox-close" id="btn-cerrar-lightbox" aria-label="Cerrar">&times;</button>\
        </div>\
      </div>\
      <div class="lightbox-img-wrapper">\
        <button class="lightbox-arrow lightbox-prev" id="btn-prev" aria-label="Anterior">\
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>\
        </button>\
        <img class="lightbox-imagen" id="lightbox-img" src="" alt="">\
        <button class="lightbox-arrow lightbox-next" id="btn-next" aria-label="Siguiente">\
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>\
        </button>\
      </div>\
      <div class="lightbox-dots" id="lightbox-dots"></div>\
    ';

    document.body.appendChild(overlay);

    // Force reflow for transition
    overlay.offsetHeight;
    overlay.classList.add('abierto');

    renderizarDots(indice);
    actualizarImagen(indice, true);
    bindearEventosLightbox(overlay);
    iniciarAutoplay();
  }

  function cerrarLightbox() {
    detenerAutoplay();
    var overlay = document.querySelector('.lightbox-overlay');
    if (!overlay) return;
    overlay.classList.remove('abierto');
    setTimeout(function() { overlay.remove(); }, 250);
  }

  function renderizarDots(activo) {
    var container = document.getElementById('lightbox-dots');
    if (!container) return;
    container.innerHTML = _lightboxImagenes.map(function(_, i) {
      return '<button class="lightbox-dot' + (i === activo ? ' active' : '') + '" data-index="' + i + '" aria-label="Imagen ' + (i + 1) + '"></button>';
    }).join('');
  }

  function actualizarImagen(indice, immediate) {
    if (indice < 0) indice = _lightboxImagenes.length - 1;
    if (indice >= _lightboxImagenes.length) indice = 0;
    _lightboxIndice = indice;

    var img = document.getElementById('lightbox-img');
    if (!img) return;

    if (immediate) {
      img.classList.remove('desvanecer');
      img.src = _lightboxImagenes[indice];
    } else {
      img.classList.add('desvanecer');
      setTimeout(function() {
        img.src = _lightboxImagenes[indice];
        img.classList.remove('desvanecer');
      }, 300);
    }

    renderizarDots(indice);
  }

  function navegarLightbox(delta) {
    actualizarImagen(_lightboxIndice + delta, false);
    pausarAutoplayTemporal();
  }

  function toggleAutoplay() {
    if (_autoplayActivo) { detenerAutoplay(); }
    else { iniciarAutoplay(); }
  }

  function iniciarAutoplay() {
    if (_lightboxImagenes.length <= 1) return;
    detenerAutoplay();
    _autoplayActivo = true;
    _autoplayTimer = setInterval(function() { actualizarImagen(_lightboxIndice + 1, false); }, 3000);
    actualizarBotonAutoplay();
  }

  function detenerAutoplay() {
    _autoplayActivo = false;
    if (_autoplayTimer) { clearInterval(_autoplayTimer); _autoplayTimer = null; }
    if (_tiempoFuera) { clearTimeout(_tiempoFuera); _tiempoFuera = null; }
    actualizarBotonAutoplay();
  }

  function pausarAutoplayTemporal() {
    if (!_autoplayActivo) return;
    if (_autoplayTimer) { clearInterval(_autoplayTimer); _autoplayTimer = null; }
    if (_tiempoFuera) { clearTimeout(_tiempoFuera); }
    _tiempoFuera = setTimeout(function() {
      if (_autoplayActivo) {
        _autoplayTimer = setInterval(function() { actualizarImagen(_lightboxIndice + 1, false); }, 3000);
      }
      _tiempoFuera = null;
    }, 3000);
  }

  function actualizarBotonAutoplay() {
    var btn = document.getElementById('btn-autoplay');
    var indicator = document.getElementById('autoplay-indicator');
    if (!btn) return;
    if (_autoplayActivo) {
      btn.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
      if (indicator) indicator.classList.add('activo');
    } else {
      btn.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      if (indicator) indicator.classList.remove('activo');
    }
  }

  function bindearEventosLightbox(overlay) {
    overlay.querySelector('#btn-cerrar-lightbox').addEventListener('click', cerrarLightbox);
    overlay.addEventListener('click', function(e) {
      var target = e.target;
      if (target.closest('.lightbox-imagen')) return;
      if (target.closest('.lightbox-arrow')) return;
      if (target.closest('.lightbox-dot')) return;
      if (target.closest('.lightbox-btn')) return;
      if (target.closest('.lightbox-close')) return;
      cerrarLightbox();
    });

    overlay.querySelector('#btn-prev').addEventListener('click', function() { navegarLightbox(-1); });
    overlay.querySelector('#btn-next').addEventListener('click', function() { navegarLightbox(1); });

    overlay.querySelector('#lightbox-dots').addEventListener('click', function(e) {
      var dot = e.target.closest('.lightbox-dot');
      if (!dot) return;
      actualizarImagen(parseInt(dot.dataset.index, 10), false);
      pausarAutoplayTemporal();
    });

    overlay.querySelector('#btn-autoplay').addEventListener('click', toggleAutoplay);

    function onKeydown(e) {
      if (e.key === 'Escape') { cerrarLightbox(); }
      if (e.key === 'ArrowLeft') { navegarLightbox(-1); }
      if (e.key === 'ArrowRight') { navegarLightbox(1); }
    }
    document.addEventListener('keydown', onKeydown);

    var _touchStartX = 0;
    overlay.addEventListener('touchstart', function(e) {
      _touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function(e) {
      var delta = _touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(delta) > 50) {
        navegarLightbox(delta > 0 ? 1 : -1);
      }
    }, { passive: true });

    var _observer = new MutationObserver(function() {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', onKeydown);
        _observer.disconnect();
      }
    });
    _observer.observe(document.body, { childList: true });
  }

  async function renderizarRelacionados(producto) {
    var relacionados = await StoreAPI.productos.obtenerRelacionados(producto, 4);
    if (!relacionados.length) return;

    document.getElementById('seccion-relacionados').classList.remove('hidden');
    const $grid = document.getElementById('grid-relacionados');
    relacionados.forEach(p => $grid.appendChild(CardProducto(p)));
  }

    await renderizarProducto(producto);
    await renderizarRelacionados(producto);
  } catch (e) {
    document.getElementById('contenedor-producto').innerHTML = '\
      <div class="col-span-full text-center py-16">\
        <p class="text-slate-500 text-lg">Error al cargar el producto</p>\
        <p class="text-slate-400 text-sm mt-2">Intentalo de nuevo mas tarde</p>\
        <a href="index.html" class="inline-block mt-4 text-sm text-slate-950 underline">Volver a la tienda</a>\
      </div>\
    ';
  }
});
