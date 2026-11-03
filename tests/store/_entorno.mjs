/* ============================================================
   tests/store/_entorno.mjs — utilidades compartidas por los tests de la tienda
   ------------------------------------------------------------
   NO es un test (no termina en .test.mjs): lo importan store-t1, store-t2 y ambiente.
   Carga el codigo REAL de apps/store en un contexto de node:vm con un navegador y un
   Supabase simulados. No toca la base de datos ni la red.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(__dirname, '..', '..');
export const STORE = path.join(REPO, 'apps', 'store');

export const leer = (rel) => fs.readFileSync(path.join(STORE, rel), 'utf8');
export const leerRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
// Los objetos creados dentro de vm son de otro contexto: se comparan como JSON
export const plano = (x) => JSON.parse(JSON.stringify(x));

/* ---------- DOM simulado (lo minimo que usa la tienda) ---------- */
function crearElemento(id) {
  const listeners = {};
  const el = {
    id, value: '', checked: true, disabled: false, textContent: '', placeholder: '',
    className: '', dataset: {}, children: [], _html: '',
    classList: { add() {}, remove() {}, contains: () => false },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    addEventListener(tipo, fn) { (listeners[tipo] = listeners[tipo] || []).push(fn); },
    _disparar(tipo, ev) { (listeners[tipo] || []).forEach((fn) => fn(ev)); },
    querySelector() { return el._boton || (el._boton = crearElemento('btn')); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getAttribute() { return null; },
    remove() {}
  };
  return el;
}

const RESPUESTA_PEDIDO = {
  numero_pedido: 'KBT-202610-000001', subtotal: 50000, costo_envio: 9900, total: 59900, total_items: 3, lineas: []
};

/**
 * opciones:
 *   pago : valor del radio de pago seleccionado (default 'contraentrega')
 *   get  : (url) => respuesta de __supabase.get   (default [])
 *   rpc  : (nombre, params) => respuesta o lanza  (default RESPUESTA_PEDIDO)
 */
export function crearEntorno(opciones = {}) {
  const almacen = {};
  const elementos = {};
  const modales = [];
  const posts = [];
  const gets = [];
  const rpcs = [];
  const docListeners = {};
  const sandbox = {
    console, Intl, JSON, Math, Date, Object, Array, String, Number, Promise, URLSearchParams, encodeURIComponent,
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; }
    },
    document: {
      getElementById: (id) => elementos[id] || (elementos[id] = crearElemento(id)),
      createElement: () => crearElemento('nuevo'),
      querySelector: (sel) => (sel.includes('pago') ? { value: opciones.pago || 'contraentrega' } : null),
      querySelectorAll: () => [],
      addEventListener(tipo, fn) { (docListeners[tipo] = docListeners[tipo] || []).push(fn); }
    },
    Modal: (m) => { modales.push(m); },
    actualizarBadgeCarrito: () => {},
    __modales: modales,
    __posts: posts,
    __gets: gets,
    __rpcs: rpcs,
    __docListeners: docListeners
  };
  sandbox.window = sandbox;
  sandbox.window.location = { href: '', search: '' };
  sandbox.__supabase = {
    get: async (url) => {
      gets.push(url);
      return opciones.get ? opciones.get(url) : [];
    },
    post: async (tabla, datos) => {
      posts.push({ tabla, datos });
      return [{ id: tabla + '-1' }];
    },
    rpc: async (nombre, params) => {
      rpcs.push({ nombre, params });
      return opciones.rpc ? opciones.rpc(nombre, params) : RESPUESTA_PEDIDO;
    }
  };
  vm.createContext(sandbox);
  return sandbox;
}

export function cargar(ctx, ...archivos) {
  archivos.forEach((rel) => vm.runInContext(leer(rel), ctx, { filename: rel }));
}

/* ---------- Datos de prueba: Funda Cojin Navidena (2 variantes) ---------- */
export function filaCojin(extra = {}) {
  return Object.assign({
    id: 'prod-cojin',
    nombre: 'Funda Cojín Navideña Felpa (Reno / Muñeco Nieve)',
    slug: 'funda-cojin-navidena',
    descripcion: 'Funda para cojín navideña.',
    tipo_producto: 'Fisico',
    tags: [],
    categoria: { nombre: 'Hogar' },
    multimedia: [],
    detalles: [
      { id: 'det-muneco', codigo_interno: 'SEG011', atributos: { 'Diseño': 'Muñeco Nieve' }, stock_actual: 2, precio_venta: 25000, precio_original: null },
      { id: 'det-reno', codigo_interno: 'SEG011-Reno', atributos: { 'Diseño': 'Reno' }, stock_actual: 2, precio_venta: 25000, precio_original: null }
    ]
  }, extra);
}

export const carrito = (ctx) => JSON.parse(ctx.localStorage.getItem('kubit_carrito') || '[]');

/** Llena el formulario del checkout con datos validos (se pueden sobreescribir) */
export function llenarFormulario(ctx, datos = {}) {
  const campos = Object.assign({
    'checkout-nombre': 'Cliente Prueba',
    'checkout-email': 'prueba@correo.com',
    'checkout-telefono': '300 123 4567',
    'checkout-direccion': 'Calle 1 # 2-3',
    'checkout-ciudad': 'Itagüí',
    'checkout-departamento': 'Antioquia'
  }, datos);
  Object.keys(campos).forEach((id) => { ctx.document.getElementById(id).value = campos[id]; });
}
