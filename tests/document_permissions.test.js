const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

function backend() {
  const base = loadBackend().exports;
  const hojas = Object.fromEntries(Object.entries(base.ESQUEMA).map(([nombre, columnas]) => [nombre, [Array.from(columnas)]]));
  const servicios = fakeServicios(hojas);
  const llamadasDrive = [];
  servicios.overrides.DriveApp = {
    getFolderById: (...args) => { llamadasDrive.push(args); throw new Error('No debe acceder a Drive'); }
  };
  const app = loadBackend(servicios.overrides).exports;
  app.sembrar_({ getSheetByName: (nombre) => servicios.sheets[nombre] });
  return { app, servicios, llamadasDrive };
}

const resultado = (texto) => JSON.parse(texto);

test('guardarGuia y guardarDocumento requieren admin y rechazan lector/editor sin efectos', () => {
  const { app, servicios, llamadasDrive } = backend();
  const tokens = {};
  for (const correo of ['lector@demo.cl', 'editor@demo.cl']) {
    const acceso = resultado(app.login(correo));
    assert.strictEqual(acceso.ok, true, acceso.error);
    tokens[correo.split('@')[0]] = acceso.token;
  }
  const payloads = {
    guardarGuia: { titulo: 'Guía ficticia', maquinaId: 'DEM-101', version: '1.0', estado: 'Publicada', contenido: 'Prueba' },
    guardarDocumento: { titulo: 'Documento ficticio', maquinaId: 'DEM-101', tipo: 'Manual', url: 'https://ejemplo.test/manual', version: '1.0' }
  };
  for (const rol of ['lector', 'editor']) {
    for (const accion of Object.keys(payloads)) {
      const antes = JSON.stringify(Object.fromEntries(Object.entries(servicios.sheets).map(([n, hoja]) => [n, hoja.rows])));
      const respuesta = resultado(app.api(tokens[rol], accion, payloads[accion]));
      assert.strictEqual(respuesta.ok, false, `${rol} no debe ejecutar ${accion}`);
      assert.match(respuesta.error, /permiso/i);
      const despues = JSON.stringify(Object.fromEntries(Object.entries(servicios.sheets).map(([n, hoja]) => [n, hoja.rows])));
      assert.strictEqual(despues, antes, `${accion} modificó una hoja con rol ${rol}`);
      assert.deepStrictEqual(llamadasDrive, []);
    }
  }
  assert.strictEqual(app.ACCIONES.guardarGuia[0], 'admin');
  assert.strictEqual(app.ACCIONES.guardarDocumento[0], 'admin');
});

test('administrador crea y edita guías y metadatos documentales', () => {
  const { app, servicios } = backend();
  const token = resultado(app.login('admin@demo.cl')).token;
  const guia = {
    titulo: 'Guía ficticia', maquinaId: 'DEM-101', version: '1.0', estado: 'Publicada', contenido: 'Contenido de prueba'
  };
  const creada = resultado(app.api(token, 'guardarGuia', guia));
  assert.strictEqual(creada.ok, true, creada.error);
  const editada = resultado(app.api(token, 'guardarGuia', { ...guia, id: creada.data.id, titulo: 'Guía actualizada' }));
  assert.strictEqual(editada.ok, true, editada.error);
  const documento = resultado(app.api(token, 'guardarDocumento', {
    titulo: 'Manual ficticio', maquinaId: 'DEM-101', tipo: 'Manual de operación', version: '1.0', url: 'https://ejemplo.test/manual'
  }));
  assert.strictEqual(documento.ok, true, documento.error);
  assert.ok(servicios.sheets.Guias.rows.some((fila) => fila.includes('Guía actualizada')));
  assert.ok(servicios.sheets.Documentos.rows.some((fila) => fila.includes('Manual ficticio')));
});
