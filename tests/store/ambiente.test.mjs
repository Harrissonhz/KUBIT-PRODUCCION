/* ============================================================
   tests/store/ambiente.test.mjs — coherencia de ambiente de la tienda (ST-29)
   ------------------------------------------------------------
   Evita repetir el incidente del 2026-10-28: al copiar archivos de Produccion a Pruebas, la
   tienda de Pruebas quedo apuntando a la base de PRODUCCION y una prueba creo un pedido real.
   Regla: la tienda debe apuntar al MISMO proyecto de Supabase que el POS y el WMS de ESTE repo
   (en KUBIT-Pruebas = QA, en KUBIT-PRODUCCION = produccion), y su llave debe ser "anon".
   El test lee las URLs y el rol de la llave; NUNCA imprime llaves.
   Los placeholders (por ejemplo TU_PROYECTO_PROD) se ignoran: solo cuentan referencias reales
   de Supabase (20 letras minusculas).
   Ejecutar desde la raiz del repo:
     node --test tests/store/ambiente.test.mjs
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, leer } from './_entorno.mjs';

const REF = /https:\/\/([a-z]{20})\.supabase\.co/g;
const refs = (texto) => [...new Set([...texto.matchAll(REF)].map((m) => m[1]))];
const leerSiExiste = (rel) => {
  const p = path.join(REPO, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

const cliente = leer('js/api/supabase-client.js');
const refTienda = refs(cliente);

test('ST-29: la tienda apunta a un unico proyecto de Supabase', () => {
  assert.equal(refTienda.length, 1, 'supabase-client.js debe tener exactamente una URL de Supabase');
});

for (const [nombre, rel] of [['POS', 'apps/pos/js/config.js'], ['WMS', 'apps/wms/js/config.js']]) {
  test('ST-29: la tienda apunta al mismo proyecto que el ' + nombre + ' de este repositorio', (t) => {
    const texto = leerSiExiste(rel);
    if (!texto) return t.skip(rel + ' no existe en este repositorio');
    const refsApp = refs(texto);
    if (!refsApp.length) return t.skip(rel + ' no tiene una URL real de Supabase');
    assert.ok(refsApp.includes(refTienda[0]),
      'La tienda apunta a "' + refTienda[0] + '" pero ' + nombre + ' usa [' + refsApp.join(', ') + ']. ' +
      'Probablemente se copio supabase-client.js de otro ambiente. Restauralo con git restore.');
  });
}

test('ST-29: la llave de la tienda es "anon" y pertenece al mismo proyecto que su URL', () => {
  const jwt = cliente.match(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/);
  assert.ok(jwt, 'no se encontro la llave en supabase-client.js');
  const payload = JSON.parse(Buffer.from(jwt[1], 'base64url').toString('utf8'));
  assert.equal(payload.role, 'anon', 'la tienda nunca debe llevar una llave distinta de anon');
  assert.equal(payload.ref, refTienda[0], 'la llave es de otro proyecto que la URL');
});
