const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');

const { exports: app } = loadBackend();
const b64 = (txt) => Buffer.from(txt, 'binary').toString('base64');

test('validarArchivo_ accepts an allowed file and normalizes the MIME type by extension', () => {
  const r = app.validarArchivo_({ nombre: 'Manual DEM-101.pdf', mime: '', base64: b64('%PDF-1.7 contenido') });
  assert.strictEqual(r.ext, 'pdf');
  assert.strictEqual(r.mime, 'application/pdf');
  assert.strictEqual(r.nombre, 'Manual DEM-101.pdf');
});

test('validarArchivo_ rejects disallowed extensions and missing files', () => {
  assert.throws(() => app.validarArchivo_({ nombre: 'virus.exe', base64: b64('MZ') }), /Tipo de archivo no permitido/);
  assert.throws(() => app.validarArchivo_({ nombre: 'grafico.svg', base64: b64('<svg/>') }), /Tipo de archivo no permitido/);
  assert.throws(() => app.validarArchivo_({ nombre: 'sin-extension', base64: b64('x') }), /Tipo de archivo no permitido/);
  assert.throws(() => app.validarArchivo_({ nombre: 'vacio.pdf', base64: '' }), /vacío/);
  assert.throws(() => app.validarArchivo_(null), /Adjunta un archivo/);
  assert.throws(() => app.validarArchivo_({ nombre: 'roto.pdf', base64: '@@@' }), /dañado/);
});

test('validarArchivo_ enforces the maximum size', () => {
  const max = app.APP.MAX_ARCHIVO_MB * 1024 * 1024;
  const grande = 'A'.repeat(Math.ceil((max + 3) / 3) * 4);
  assert.throws(() => app.validarArchivo_({ nombre: 'grande.pdf', base64: grande }), /supera el máximo/);
});

test('validarArchivo_ sanitizes dangerous characters in file names', () => {
  const r = app.validarArchivo_({ nombre: '../..\\ficha<1>.png', base64: b64('\x89PNG') });
  assert.ok(!/[\\/<>]/.test(r.nombre), r.nombre);
});

test('firmaValida_ detects files whose content does not match the extension', () => {
  const bytes = (txt) => Array.from(Buffer.from(txt, 'binary')).map((x) => (x > 127 ? x - 256 : x));
  assert.strictEqual(app.firmaValida_('pdf', bytes('%PDF-1.4')), true);
  assert.strictEqual(app.firmaValida_('pdf', bytes('<html>')), false);
  assert.strictEqual(app.firmaValida_('png', bytes('\x89PNG\r\n')), true);
  assert.strictEqual(app.firmaValida_('jpg', bytes('\xFF\xD8\xFF')), true);
  assert.strictEqual(app.firmaValida_('jpg', bytes('GIF89a')), false);
  assert.strictEqual(app.firmaValida_('docx', bytes('PK')), true);
});

test('docPublico_ never exposes the Drive file id to the client', () => {
  const p = app.docPublico_({ id: 'DOC-001', fileId: 'secreto', nombreArchivo: 'a.pdf' });
  assert.strictEqual(p.fileId, undefined);
  assert.strictEqual(p.archivo, true);
  assert.strictEqual(app.docPublico_({ id: 'DOC-002', fileId: '' }).archivo, false);
});

test('Documentos schema keeps legacy columns first so inicializar() can migrate', () => {
  const cols = app.ESQUEMA.Documentos;
  assert.deepStrictEqual(Array.from(cols.slice(0, 7)), ['id', 'titulo', 'maquinaId', 'tipo', 'url', 'version', 'actualizado']);
  ['fileId', 'nombreArchivo', 'mimeType', 'tamano', 'autor'].forEach((c) => assert.ok(cols.includes(c), c));
});

test('archivoDocumento is only reachable through api() with at least lector role', () => {
  assert.strictEqual(app.ACCIONES.archivoDocumento[0], 'lector');
  assert.strictEqual(app.ACCIONES.guardarDocumento[0], 'editor');
  assert.strictEqual(app.ACCIONES.eliminarDocumento[0], 'admin');
});
