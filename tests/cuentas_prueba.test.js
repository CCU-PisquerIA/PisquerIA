const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

// Las cuentas documentadas en CUENTAS_DE_PRUEBA.md. Si cambian en sembrar_(), actualiza ambos.
const CUENTAS = [
  { email: 'admin@demo.cl', rol: 'admin' },
  { email: 'editor@demo.cl', rol: 'editor' },
  { email: 'lector@demo.cl', rol: 'lector' }
];

function planillaSembrada() {
  const base = loadBackend().exports;
  const hojas = Object.fromEntries(Object.entries(base.ESQUEMA).map(([n, cols]) => [n, [Array.from(cols)]]));
  const s = fakeServicios(hojas);
  s.overrides.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  const app = loadBackend(s.overrides).exports;
  app.sembrar_({ getSheetByName: (n) => s.sheets[n] });
  return { s, app };
}

test('sembrar_ creates exactly one test account per role', () => {
  const { s } = planillaSembrada();
  const filas = s.sheets.Usuarios.rows.slice(1).map((r) => ({ email: r[1], rol: r[4], activo: r[5] }));
  assert.deepStrictEqual(filas.map(({ email, rol }) => ({ email, rol })), CUENTAS);
  filas.forEach((f) => assert.strictEqual(f.activo, 'SI', f.email));
});

test('each documented test account logs in with its role and respects its permissions', () => {
  const { app } = planillaSembrada();
  const sesion = {};
  CUENTAS.forEach(({ email, rol }) => {
    const o = JSON.parse(app.login(email));
    assert.strictEqual(o.ok, true, email + ': ' + o.error);
    assert.strictEqual(o.usuario.rol, rol);
    sesion[rol] = o.token;
  });
  const puede = (rol, accion, datos = {}) => {
    const o = JSON.parse(app.api(sesion[rol], accion, datos));
    return o.ok || !/No tienes permisos/.test(o.error);
  };
  // lector: solo consulta
  assert.strictEqual(puede('lector', 'maquinas'), true);
  assert.strictEqual(puede('lector', 'guardarMaquina', { id: 'DEM-999' }), false);
  // editor: crea y edita, pero no elimina ni administra usuarios
  assert.strictEqual(puede('editor', 'guardarMaquina', { id: 'DEM-999' }), true);
  assert.strictEqual(puede('editor', 'eliminarMaquina', { id: 'DEM-101' }), false);
  assert.strictEqual(puede('editor', 'usuarios'), false);
  // admin: control total
  assert.strictEqual(puede('admin', 'usuarios'), true);
  assert.strictEqual(puede('admin', 'guardarUsuario', { email: 'x@demo.cl', nombre: 'X', rol: 'lector' }), true);
});
