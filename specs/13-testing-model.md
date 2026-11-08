# Especificacion de Testing Automatico - Ecosistema Kubit

## 1. Proposito

Este documento define el modelo de pruebas automaticas que toda **IA debe seguir** al realizar cualquier cambio, ajuste o nueva funcionalidad en el codigo de `/apps/`. Su objetivo es garantizar que:

- Todo cambio en logica de negocio este cubierto por pruebas automatizadas
- Cualquier regression sea detectada antes de que el cambio se considere completado
- El proyecto sea mantenible a largo plazo con un conjunto creciente de desarrolladores e IAs

**Leer este documento completo antes de escribir o modificar cualquier codigo en `apps/`.**

---

## 2. Stack de Testing

| Componente | Tecnologia | Version Minima |
|---|---|---|
| Test runner | **Vitest** | v3.x |
| DOM simulator | **jsdom** | v26.x |
| Node.js | v18+ (v24+ recomendada) | v18.0.0 |
| Package manager | npm (incluido con Node) | 9+ |

No se permite Jest, Mocha, Cypress, karma, u otros runners sin autorizacion explicita.

---

## 3. Estructura de Directorios

```
/
├── tests/
│   ├── setup.js                     ← Setup global: mocks de window.*, localStorage, etc.
│   ├── helpers/
│   │   └── calculos-pos.js          ← Funciones puras de calculo POS (sin dep. externas)
│   ├── compartido/                  ← Tests para js/compartido/
│   │   ├── database.test.js         ← Tests de database.js (obligatorio mantener)
│   │   └── auth.test.js             ← Tests de auth.js
│   ├── calculos/                    ← Tests de funciones de calculo
│   │   ├── compras.test.js          ← Tests de IVA, descuentos, totales (P1)
│   │   ├── caja.test.js             ← Tests de diferencia caja, formato moneda (P1)
│   │   └── productos.test.js        ← Tests de stock_min, atributos JSONB (P1)
│   └── paginas/                     ← Tests para js/paginas/ (futuro)
│       ├── ventas.test.js
│       ├── productos.test.js
│       └── ...
├── vitest.config.js
├── package.json
```

Reglas:
- Los tests **viven fuera de `apps/`** para no mezclarse con codigo de produccion
- La estructura de `tests/` **mira** a la de `apps/pos/js/`
- Cada archivo de produccion tiene su correspondiente `*.test.js`
- No se permiten tests dentro de `apps/`

---

## 4. Convenciones de Nomenclatura

| Aspecto | Regla | Ejemplo |
|---|---|---|
| Archivos de test | `{nombre-modulo}.test.js` | `database.test.js`, `ventas.test.js` |
| Describir suites | `describe('DB.productos')` | Nombre del objeto/funcion bajo prueba |
| Describir casos | `it('listar() retorna array de productos')` | Verbo en presente, describe comportamiento |
| Variables mock | Prefijo `mock` | `mockProductos`, `mockVenta`, `mockSupabase` |
| Archivos de fixture | `tests/fixtures/{nombre}.js` | `tests/fixtures/productos.js` (opcional) |

---

## 5. Mocking Strategy

### 5.1 Regla Fundamental

**No se modifica ni una linea del codigo fuente de produccion para hacerlo testeable.** Los mocks se inyectan desde afuera via `window.*`, que es como el codigo real consume sus dependencias.

### 5.2 Mocks Obligatorios en `tests/setup.js`

El archivo `tests/setup.js` crea estos mocks globales **antes** de que cualquier test se ejecute:

```javascript
// Mock del DOM basico
document = window.document;

// Mock de localStorage
localStorage = {
  _store: {},
  getItem: (key) => localStorage._store[key] ?? null,
  setItem: (key, val) => { localStorage._store[key] = String(val); },
  removeItem: (key) => { delete localStorage._store[key]; },
  clear: () => { localStorage._store = {}; }
};

// Mock de window.__supabase (API de supabase.js)
window.__supabase = {
  get: vi.fn(),
  getWithMeta: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
};

// Mock de window.KubitAuth
window.KubitAuth = {
  login: vi.fn(),
  logout: vi.fn(),
  cargarSesion: vi.fn(),
  tienePermiso: vi.fn()
};

// Mock de CONFIG (config.js)
window.CONFIG = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key'
};
```

### 5.3 Reset entre Tests

Cada test debe limpiar los mocks para evitar contaminacion entre pruebas:

```javascript
beforeEach(function () {
  vi.clearAllMocks();
  localStorage.clear();
  window.DB._cache?.clear?.();
});
```

---

## 6. Capas de Testing (Prioridad)

El testing se aborda por capas, de la mas pura a la mas acoplada:

| Prioridad | Capa | Archivo | Tipo | Dependencia de Mocks |
|---|---|---|---|---|
| **P1** | Funciones puras | `tests/helpers/calculos-pos.js` | Unit | Ninguna |
| **P1** | Calculos de negocio | `tests/calculos/*.test.js` | Unit | `tests/helpers/calculos-pos.js` |
| **P2** | Capa de datos | `database.js` | Integration | `window.__supabase` |
| **P3** | Autenticacion | `auth.js` | Integration | `window.__supabase`, `localStorage` |
| **P4** | Paginas CRUD | `productos.js`, `clientes.js`, etc. | DOM + Integration | jsdom + `window.__supabase` |
| **P5** | Paginas complejas | `ventas.js`, `caja.js` | DOM + Integration | jsdom + `window.__supabase` |

**Regla de prioridad:** Una IA nunca debe saltarse P1-P2-P3. Si un cambio afecta solo a la UI (P4-P5), los tests de P1-P2-P3 deben seguir pasando.

---

## 7. Workflow Obligatorio para la IA

Antes de que la IA marque **cualquier cambio como completado**, debe ejecutar este workflow:

```
PASO 1: npm run test
  - Todos los tests existentes deben pasar SIN ERRORES
  - Si falla algun test → la IA debe corregir el test o el codigo, nunca silenciar el error

PASO 2: Evaluar cobertura del cambio
  - Si el cambio agrega NUEVA logica de negocio → deben existir tests que la cubran
  - Si el cambio MODIFICA logica existente → los tests de esa funcion/suite deben seguir pasando

PASO 3: Verificar lint (si existe)
  - npm run lint (si esta configurado)
```

**Excepciones justificadas:**
- Cambios puramente cosmeticos (CSS, HTML sin logica asociada)
- Cambios en documentacion o configuracion
- Cambios que la IA demuestra que no pueden ser probados automaticamente (previa consulta al usuario)

---

## 8. Comandos

| Comando | Proposito |
|---|---|
| `npx vitest run` | Ejecutar todos los tests una vez (CI) |
| `npx vitest` | Ejecutar en modo watch (desarrollo) |
| `npx vitest run --reporter=verbose` | Ejecutar con salida detallada |
| `npx vitest run tests/compartido/database.test.js` | Ejecutar un archivo especifico |

---

## 9. Cobertura Esperada

No se exige un porcentaje de cobertura fijo. En su lugar, se exige:

- **Cobertura funcional:** Cada metodo publico de `DB.*` debe tener al menos un test feliz (happy path) y un test de error (sad path)
- **Cobertura de regresion:** Cada bug corregido debe agregar un test que lo prevenga
- **Cobertura de validacion:** Toda validacion de datos (stock negativo, campos requeridos, permisos) debe tener test

---

## 10. Patrones de Test

### 10.1 Happy Path

```javascript
it('listar() retorna productos activos', async function () {
  window.__supabase.get.mockResolvedValue(mockProductos);

  var res = await DB.productos.listar();

  expect(res.error).toBeNull();
  expect(res.data).toHaveLength(2);
  expect(res.data[0].nombre).toBe('Producto A');
});
```

### 10.2 Sad Path (Error de API)

```javascript
it('listar() maneja error de API', async function () {
  window.__supabase.get.mockRejectedValue(new Error('API Error'));

  var res = await DB.productos.listar();

  expect(res.error).toBe('API Error');
  expect(res.data).toEqual([]);
});
```

### 10.3 Validacion de Cache

```javascript
it('listarConDetalle() usa cache en segunda llamada', async function () {
  window.__supabase.get.mockResolvedValue(mockDetalle);

  await DB.productos.listarConDetalle();       // primera llamada → API
  window.__supabase.get.mockClear();
  await DB.productos.listarConDetalle();       // segunda llamada → cache

  expect(window.__supabase.get).not.toHaveBeenCalled();
});
```

### 10.4 Mutacion con Cache Invalidation

```javascript
it('crear() invalida cache de productos', async function () {
  window.__supabase.post.mockResolvedValue([{ id: 'new-1' }]);

  await DB.productos.listarConDetalle();       // poblar cache
  await DB.productos.crear({ nombre: 'Nuevo' });

  var stats = DB._cacheGet('productos');
  expect(stats).toBeNull();
});
```

---

## 11. Tests de Integracion Reales (Opcional)

Para pruebas que requieren una base de datos real (no mocks):

- Se usa un schema `test_*` en Supabase QA
- Se ejecutan con script especial: `npm run test:integration`
- No forman parte del workflow obligatorio de la IA
- Requieren variable de entorno `SUPABASE_TEST_URL` y `SUPABASE_TEST_KEY`

---

## 12. Resumen de Reglas para la IA

1. **No modificar codigo fuente para hacerlo testeable** — los mocks se inyectan via `window.*`
2. **Mantener `tests/setup.js`** actualizado con nuevos mocks conforme se agreguen dependencias
3. **Todo cambio de logica debe tener test** — P1 y P2 son obligatorios, P3-P5 segun alcance
4. **Los calculos de negocio (IVA, descuentos, diferencias) van en `tests/calculos/*.test.js`** usando helpers de `tests/helpers/calculos-pos.js`
4. **`npm run test` debe pasar** antes de marcar cualquier cambio como completado
5. **Un bug corregido = un test nuevo** que prevenga la regresion
6. **Los tests se escriben en el mismo estilo que el codigo fuente** — IIFE, `var`, funciones planas, sin ES modules

---

## 12.1 Tests de la Tienda (`tests/store/`, desde 2026-10-28)

La tienda tiene su propia suite, separada de Vitest:

| Aspecto | Regla |
|---|---|
| Ubicación | `tests/store/*.test.mjs` (módulos ES; el `package.json` usa `"type": "module"`) |
| Runner | `node --test tests/store/*.test.mjs` (sin dependencias: `node:test`, `node:assert`, `node:vm`) |
| Vitest | Solo toma `tests/**/*.test.js`; **no** crear tests de la tienda con extensión `.js` (en oct-2026 un duplicado `store-t1.test.js` hizo fallar `npm test`) |
| Entorno | `tests/store/_entorno.mjs` carga el código real de `apps/store` en `node:vm` con DOM, `localStorage` y `__supabase` simulados (`get`, `post`, `rpc`). No es un test |
| Base de datos | Los tests **no** tocan la base. Los scripts SQL de la tienda (15, 16, 17, 03) se validan como texto; su ejecución real se prueba a mano en QA |
| Ambiente | `ambiente.test.mjs` falla si `supabase-client.js` apunta a otro proyecto que el POS/WMS del mismo repo o si su llave no es `anon` (ST-29) |
| Archivos actuales | `store-t1` (20), `store-t2` (35), `ambiente` (4), `store-t3a` (15), `store-t3b` (37) = **111 casos** |
| Regla por fase | Cada fase de la tienda agrega su `store-<fase>.test.mjs`; los anteriores deben seguir pasando |

**Antes de cualquier commit** se corren las dos suites:
```bash
node --test tests/store/*.test.mjs   # tienda: pass 111, fail 0
npm test                             # POS (Vitest): 119 passed
```

## 13. Referencias

- `vitest.config.js` — Configuracion del test runner
- `tests/setup.js` — Setup global con mocks
- `tests/compartido/database.test.js` — Ejemplo funcional de tests de DB
- `tests/compartido/auth.test.js` — Tests de permisos y autenticacion
- `tests/calculos/compras.test.js` — Tests de calculo de IVA y descuentos
- `tests/helpers/calculos-pos.js` — Funciones auxiliares de calculo POS
- `apps/pos/js/compartido/database.js` — Codigo bajo prueba
- `apps/pos/js/supabase.js` — API que se mockea
