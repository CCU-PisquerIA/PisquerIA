const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');

const { exports: app } = loadBackend();

test('txt_ helper trims whitespace and respects maximum length', () => {
  const result = app.txt_('   Texto de prueba con espacios   ', 15, false);
  assert.strictEqual(result, 'Texto de prueba');
});

test('txt_ helper validates required fields', () => {
  assert.throws(
    () => app.txt_('   ', 50, true, 'título'),
    /El campo título es obligatorio\./
  );
  assert.throws(
    () => app.txt_(null, 50, true, 'descripción'),
    /El campo descripción es obligatorio\./
  );
});

test('seguro_ mitigates formula injection in Google Sheets', () => {
  // Dangerous formula prefixes in spreadsheet cells
  assert.strictEqual(app.seguro_('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.strictEqual(app.seguro_('+12345'), "'+12345");
  assert.strictEqual(app.seguro_('-9999'), "'-9999");
  assert.strictEqual(app.seguro_('@IMPORTXML(...)'), "'@IMPORTXML(...)");

  // Harmless text should remain untouched
  assert.strictEqual(app.seguro_('DEM-101'), 'DEM-101');
  assert.strictEqual(app.seguro_('Transportador modular'), 'Transportador modular');
});

test('validarDominio_ enforces corporate domain whitelist', () => {
  assert.deepStrictEqual(Array.from(app.APP.DOMINIOS_REGISTRO), ['ccu.cl']);

  assert.doesNotThrow(() => {
    app.validarDominio_('mantencion@ccu.cl');
  });

  assert.doesNotThrow(() => {
    app.validarDominio_('  Operador@CCU.cl ');
  });

  assert.throws(
    () => app.validarDominio_('operador@pisqueradechile.cl'),
    /Dominio no autorizado \(@pisqueradechile\.cl\)/
  );

  // Solo coincidencia exacta del dominio: sin subdominios ni dominios que lo imiten
  assert.throws(() => app.validarDominio_('x@otro.ccu.cl'), /Dominio no autorizado/);
  assert.throws(() => app.validarDominio_('x@ccu.cl.evil.com'), /Dominio no autorizado/);
  assert.throws(() => app.validarDominio_('x@fakeccu.cl'), /Dominio no autorizado/);

  // Allowed when MODO_DEMO is true
  assert.doesNotThrow(() => {
    app.validarDominio_('admin@demo.cl');
  });

  assert.throws(
    () => app.validarDominio_('intruso@gmail.com'),
    /Dominio no autorizado \(@gmail\.com\)/
  );

  assert.throws(
    () => app.validarDominio_('sin-arroba'),
    /Ingresa un correo electrónico válido/
  );
});

test('formatearNombreEmail_ capitalizes name parts from email address', () => {
  assert.strictEqual(
    app.formatearNombreEmail_('claudio.palta@pisqueradechile.cl'),
    'Claudio Palta'
  );
  assert.strictEqual(
    app.formatearNombreEmail_('benjamin_cuello@ccu.cl'),
    'Benjamin Cuello'
  );
  assert.strictEqual(
    app.formatearNombreEmail_('javier-catalan@ccu.cl'),
    'Javier Catalan'
  );
});
