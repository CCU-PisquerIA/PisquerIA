const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

function entorno() {
  const esquema = loadBackend().exports.ESQUEMA;
  const hojas = Object.fromEntries(Object.entries(esquema).map(([nombre, columnas]) => [nombre, [Array.from(columnas)]]));
  const servicios = fakeServicios(hojas);
  const app = loadBackend(servicios.overrides).exports;
  app.sembrar_({ getSheetByName: (nombre) => servicios.sheets[nombre] });
  const admin = JSON.parse(app.login('admin@demo.cl')).token;
  const lector = JSON.parse(app.login('lector@demo.cl')).token;
  const llamar = (accion, datos, token = admin) => JSON.parse(app.api(token, accion, datos));
  const exigir = (respuesta) => { assert.equal(respuesta.ok, true, respuesta.error); return respuesta.data; };
  const documento = (extra = {}) => exigir(llamar('guardarDocumento', {
    titulo: 'Documento ficticio', maquinaId: 'DEM-101', tipo: 'Manual de operación',
    version: '1.0', url: 'https://ejemplo.test/consulta', ...extra
  })).id;
  const guia = (extra = {}) => ({
    titulo: 'Guía ficticia', maquinaId: 'DEM-101', version: '1.0', estado: 'Publicada',
    contenido: 'Contenido de prueba sin datos operacionales.', ...extra
  });
  return { app, servicios, lector, llamar, exigir, documento, guia };
}

test('guía publicada vincula el documento de su equipo sin exponer el identificador de Drive', () => {
  const e = entorno();
  const documentoId = e.documento();
  e.app.guardar_('Documentos', { id: documentoId, fileId: 'ARCHIVO_PRIVADO_FICTICIO', nombreArchivo: 'consulta.pdf' });
  const id = e.exigir(e.llamar('guardarGuia', e.guia({ documentoId }))).id;
  const vista = e.exigir(e.llamar('guia', { id }, e.lector));
  assert.equal(vista.documento.id, documentoId);
  assert.equal(vista.documento.archivo, true);
  assert.equal(Object.hasOwn(vista.documento, 'fileId'), false);
  assert.doesNotMatch(JSON.stringify(vista), /ARCHIVO_PRIVADO_FICTICIO/);
  assert.equal(vista.revisionTecnica, 'Pendiente de revisión');
});

test('el vínculo rechaza documento inexistente, ajeno o sin contenido disponible', () => {
  const e = entorno();
  const ajeno = e.documento({ maquinaId: 'DEM-102' });
  const vacio = e.documento({ url: '' });
  for (const documentoId of ['DOC-INEXISTENTE', ajeno, vacio]) {
    const respuesta = e.llamar('guardarGuia', e.guia({ documentoId }));
    assert.equal(respuesta.ok, false, `No debe aceptar ${documentoId}`);
  }
});

test('material transversal exige alcance y permite vincular la misma línea sin máquina ficticia', () => {
  const e = entorno();
  const documentoId = e.documento({ maquinaId: '', alcance: 'Línea ficticia 3' });
  const id = e.exigir(e.llamar('guardarGuia', e.guia({
    maquinaId: '', alcance: '  LÍNEA FICTICIA 3  ', documentoId
  }))).id;
  const vista = e.exigir(e.llamar('guia', { id }, e.lector));
  assert.equal(vista.maquinaId, '');
  assert.equal(vista.documento.id, documentoId);
  assert.equal(e.llamar('guardarGuia', e.guia({ maquinaId: '', alcance: '' })).ok, false);
  assert.equal(e.llamar('guardarDocumento', {
    titulo: 'Sin alcance', maquinaId: '', tipo: 'Manual de operación', url: 'https://ejemplo.test/consulta'
  }).ok, false);
  assert.equal(e.llamar('guardarGuia', e.guia({
    maquinaId: '', alcance: 'Otra línea', documentoId
  })).ok, false);
});

test('editar y eliminar un documento no puede romper el vínculo existente', () => {
  const e = entorno();
  const documentoId = e.documento();
  e.exigir(e.llamar('guardarGuia', e.guia({ documentoId })));
  assert.equal(e.llamar('eliminarDocumento', { id: documentoId }).ok, false);
  assert.equal(e.llamar('guardarDocumento', {
    id: documentoId, titulo: 'Cambio incompatible', maquinaId: 'DEM-102',
    tipo: 'Manual de operación', version: '1.1', url: 'https://ejemplo.test/otra'
  }).ok, false);
  assert.equal(e.llamar('guardarDocumento', {
    id: documentoId, titulo: 'Sin consulta', maquinaId: 'DEM-101',
    tipo: 'Manual de operación', version: '1.1', url: ''
  }).ok, false);
  assert.equal(e.exigir(e.llamar('documento', { id: documentoId })).maquinaId, 'DEM-101');
});

test('revisión técnica se conserva al editar y no acepta aprobación inventada', () => {
  const e = entorno();
  const id = e.exigir(e.llamar('guardarGuia', e.guia({ revisionTecnica: 'En revisión' }))).id;
  e.exigir(e.llamar('guardarGuia', e.guia({ id, titulo: 'Título corregido' })));
  const vista = e.exigir(e.llamar('guia', { id }, e.lector));
  assert.equal(vista.revisionTecnica, 'En revisión');
  assert.equal(vista.documento, null);
  assert.equal(e.llamar('guardarGuia', e.guia({ revisionTecnica: 'Aprobada' })).ok, false);
});

test('revisión técnica no publica borradores ni cambia permisos de carga', () => {
  const e = entorno();
  const id = e.exigir(e.llamar('guardarGuia', e.guia({ estado: 'Borrador', revisionTecnica: 'En revisión' }))).id;
  assert.equal(e.llamar('guia', { id }, e.lector).ok, false);
  const listado = e.exigir(e.llamar('guias', {}, e.lector));
  assert.equal(listado.some((g) => g.id === id), false);
  assert.equal(e.llamar('guardarGuia', e.guia(), e.lector).ok, false);
});

test('registros heredados sin revisión explícita se muestran pendientes sin inventar un vínculo', () => {
  const e = entorno();
  e.app.guardar_('Guias', {
    id: 'GUI-HEREDADA', titulo: 'Guía heredada ficticia', maquinaId: 'DEM-101',
    version: '0.1', estado: 'Publicada', contenido: 'Contenido heredado'
  });
  const vista = e.exigir(e.llamar('guia', { id: 'GUI-HEREDADA' }, e.lector));
  assert.equal(vista.revisionTecnica, 'Pendiente de revisión');
  assert.equal(vista.documento, null);
});

test('una referencia alterada manualmente no entrega metadatos incompatibles ni rompe la consulta', () => {
  const e = entorno();
  const documentoId = e.documento();
  const id = e.exigir(e.llamar('guardarGuia', e.guia({ documentoId }))).id;
  e.app.guardar_('Documentos', { id: documentoId, maquinaId: 'DEM-102', titulo: 'Material incompatible' });
  const incompatible = e.exigir(e.llamar('guia', { id }, e.lector));
  assert.equal(incompatible.documento, null);
  assert.doesNotMatch(JSON.stringify(incompatible), /Material incompatible/);
  e.app.borrar_('Documentos', documentoId);
  const ausente = e.exigir(e.llamar('guia', { id }, e.lector));
  assert.equal(ausente.documento, null);
  assert.equal(ausente.documentoId, documentoId);
});
