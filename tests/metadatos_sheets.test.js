const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { FakeSheet, fakeServicios } = require('./helpers/fake_sheets');

const USUARIOS_VIEJOS = [
  ['id', 'email', 'nombre', 'area', 'rol', 'salt', 'hash', 'activo', 'creado', 'ultimoAcceso', 'prefs'],
  ['USR-001', 'admin@demo.cl', 'Administrador', 'TI', 'admin', 'sal123', 'abcdef', 'SI', '2026-11-01', '', '{}'],
  ['USR-002', 'lector@demo.cl', 'Operador', 'Envasado', 'lector', 'sal456', '987654', 'SI', '2026-11-02', '', '{}']
];

test('Usuarios schema no longer contains salt or hash', () => {
  const { exports: app } = loadBackend();
  const cols = Array.from(app.ESQUEMA.Usuarios);
  assert.ok(!cols.includes('salt') && !cols.includes('hash'), cols.join(','));
  assert.deepStrictEqual(Array.from(app.COLUMNAS_OBSOLETAS.Usuarios), ['salt', 'hash']);
});

test('migrarHoja_ deletes obsolete columns without shifting the remaining data', () => {
  const { exports: app } = loadBackend();
  const sh = new FakeSheet(USUARIOS_VIEJOS);
  const r = app.migrarHoja_(sh, 'Usuarios');
  assert.deepStrictEqual(Array.from(r.eliminadas).sort(), ['hash', 'salt']);
  assert.deepStrictEqual(sh.header(), Array.from(app.ESQUEMA.Usuarios));
  assert.deepStrictEqual(sh.rows[1], ['USR-001', 'admin@demo.cl', 'Administrador', 'TI', 'admin', 'SI', '2026-11-01', '', '{}']);
  assert.ok(!JSON.stringify(sh.rows).includes('abcdef'));
  const otra = app.migrarHoja_(sh, 'Usuarios');
  assert.strictEqual(otra.eliminadas.length + otra.agregadas.length, 0, 'debe ser idempotente');
});

test('migrarHoja_ appends missing columns at the end even if the sheet has extra columns', () => {
  const { exports: app } = loadBackend();
  const sh = new FakeSheet([
    ['id', 'titulo', 'maquinaId', 'tipo', 'url', 'version', 'actualizado', 'notaManual'],
    ['DOC-001', 'Manual', 'DEM-101', 'Manual de operación', '', '1.0', '2026-11-01', 'no tocar']
  ]);
  const r = app.migrarHoja_(sh, 'Documentos');
  assert.deepStrictEqual(Array.from(r.agregadas), ['fileId', 'nombreArchivo', 'mimeType', 'tamano', 'autor']);
  assert.strictEqual(sh.header()[7], 'notaManual');
  assert.strictEqual(sh.rows[1][7], 'no tocar');
});

test('leer_ only exposes schema columns (legacy salt/hash never leave the sheet)', () => {
  const s = fakeServicios({ Usuarios: USUARIOS_VIEJOS });
  const { exports: app } = loadBackend(s.overrides);
  const u = app.leer_('Usuarios')[0];
  assert.strictEqual(u.salt, undefined);
  assert.strictEqual(u.hash, undefined);
  assert.strictEqual(u.email, 'admin@demo.cl');
  assert.strictEqual(u.activo, 'SI');
});

test('guardar_ writes by column name, whatever the sheet order, and preserves unknown columns', () => {
  const s = fakeServicios({ Usuarios: USUARIOS_VIEJOS });
  const { exports: app } = loadBackend(s.overrides);
  app.guardar_('Usuarios', { id: 'USR-002', rol: 'editor', ultimoAcceso: '2026-11-12 10:00' });
  const fila = s.sheets.Usuarios.rows[2];
  assert.strictEqual(fila[4], 'editor');
  assert.strictEqual(fila[7], 'SI', 'activo no debe desplazarse');
  assert.strictEqual(fila[9], '2026-11-12 10:00');
  assert.strictEqual(fila[5], 'sal456', 'columna fuera del esquema intacta hasta inicializar()');

  app.guardar_('Usuarios', { id: 'USR-003', email: 'nuevo@ccu.cl', nombre: 'Nuevo', area: '', rol: 'lector', activo: 'SI', creado: 'x', ultimoAcceso: '', prefs: '{}' });
  const nueva = s.sheets.Usuarios.rows[3];
  assert.strictEqual(nueva[1], 'nuevo@ccu.cl');
  assert.strictEqual(nueva[7], 'SI');
  assert.strictEqual(nueva[5], '');
});

test('guardar_ refuses to write a schema column the sheet does not have yet', () => {
  const s = fakeServicios({ Documentos: [['id', 'titulo', 'maquinaId', 'tipo', 'url', 'version', 'actualizado']] });
  const { exports: app } = loadBackend(s.overrides);
  assert.throws(() => app.guardar_('Documentos', { id: 'DOC-001', titulo: 'x', fileId: 'abc' }), /no tiene las columnas fileId.*inicializar/);
  assert.strictEqual(s.sheets.Documentos.rows.length, 1);
});

test('reads are cached across executions and invalidated by writes', () => {
  const s = fakeServicios({ Maquinas: [
    ['id', 'nombre', 'area', 'clase', 'descripcion', 'ubicacion', 'fabricante', 'estado', 'actualizado'],
    ['DEM-101', 'Llenadora', 'Envasado', 'A', 'd', 'u', 'f', 'Operativa', '2026-11-01']
  ] });
  const ejec1 = loadBackend(s.overrides).exports;
  assert.strictEqual(ejec1.leer_('Maquinas')[0].nombre, 'Llenadora');
  assert.strictEqual(s.sheets.Maquinas.lecturas, 1);

  const ejec2 = loadBackend(s.overrides).exports;
  assert.strictEqual(ejec2.leer_('Maquinas')[0].nombre, 'Llenadora');
  assert.strictEqual(s.sheets.Maquinas.lecturas, 1, 'la segunda ejecución debe leer del caché');

  ejec2.guardar_('Maquinas', { id: 'DEM-101', nombre: 'Llenadora rotativa' });
  const ejec3 = loadBackend(s.overrides).exports;
  assert.strictEqual(ejec3.leer_('Maquinas')[0].nombre, 'Llenadora rotativa');
  assert.strictEqual(s.sheets.Maquinas.lecturas, 2, 'tras escribir se vuelve a leer la hoja');

  ejec3.borrar_('Maquinas', 'DEM-101');
  assert.strictEqual(loadBackend(s.overrides).exports.leer_('Maquinas').length, 0);
});

test('large sheets are cached in chunks and read back intact', () => {
  const grande = 'Guía con acentos ñ y emoji 🍇 '.repeat(4000);
  const s = fakeServicios({ Guias: [
    ['id', 'titulo', 'maquinaId', 'version', 'estado', 'resumen', 'contenido', 'autor', 'actualizado'],
    ['GUI-001', 'Larga', 'DEM-101', '1.0', 'Publicada', '', grande, 'a', '2026-11-01']
  ] });
  loadBackend(s.overrides).exports.leer_('Guias');
  const trozos = [...s.cache.store.keys()].filter((k) => /^db_Guias_.*_\d+$/.test(k));
  assert.ok(trozos.length > 1, 'debe partirse en varios trozos');
  trozos.forEach((k) => assert.ok(Buffer.byteLength(s.cache.store.get(k), 'utf8') <= 100 * 1024, k));
  const leido = loadBackend(s.overrides).exports.leer_('Guias')[0].contenido;
  assert.strictEqual(s.sheets.Guias.lecturas, 1);
  assert.strictEqual(leido, grande);
});

test('trozos_ never splits a surrogate pair', () => {
  const { exports: app } = loadBackend();
  const partes = Array.from(app.trozos_('ab🍇cd🍇', 3));
  assert.strictEqual(partes.join(''), 'ab🍇cd🍇');
  partes.forEach((p) => assert.ok(!/[\uD800-\uDBFF]$/.test(p), JSON.stringify(p)));
});

test('password actions and helpers were removed', () => {
  const { exports: app, rawCode } = loadBackend();
  assert.strictEqual(app.ACCIONES.cambiarPassword, undefined);
  assert.strictEqual(app.ACCIONES.resetPassword, undefined);
  assert.ok(!/function hash_\(|function validarPassword_\(/.test(rawCode));
});
