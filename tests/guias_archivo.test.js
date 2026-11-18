const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

const b64 = (txt) => Buffer.from(txt, 'binary').toString('base64');
const PDF = { nombre: 'Guía transportador.pdf', mime: 'application/pdf', base64: b64('%PDF-1.7 guía ficticia') };

// Drive y Utilities simulados: la carpeta guarda los archivos en memoria.
function driveFalso() {
  const archivos = new Map();
  let n = 0;
  const archivo = (blob) => {
    const id = 'DRIVE_PRIVADO_' + (++n);
    const f = {
      id, blob, trashed: false,
      getId: () => id, getName: () => blob.getName(), getBlob: () => blob,
      isTrashed: () => f.trashed, setTrashed: (v) => { f.trashed = v; }, setDescription: () => {}
    };
    archivos.set(id, f);
    return f;
  };
  return {
    archivos,
    DriveApp: {
      getFolderById: () => ({ createFile: archivo }),
      getFileById: (id) => { if (!archivos.has(id)) throw new Error('no existe'); return archivos.get(id); }
    },
    Utilities: {
      formatDate: () => '2026-11-18',
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, mime, nombre) => ({ getBytes: () => bytes, getContentType: () => mime, getName: () => nombre })
    }
  };
}

function entorno(hojasExtra = {}) {
  const esquema = loadBackend().exports.ESQUEMA;
  const hojas = Object.fromEntries(Object.entries(esquema).map(([nombre, columnas]) => [nombre, [Array.from(columnas)]]));
  const servicios = fakeServicios({ ...hojas, ...hojasExtra });
  servicios.properties.set('DOCS_FOLDER_ID', 'CARPETA');
  const drive = driveFalso();
  const app = loadBackend({ ...servicios.overrides, DriveApp: drive.DriveApp, Utilities: drive.Utilities }).exports;
  app.sembrar_({ getSheetByName: (nombre) => servicios.sheets[nombre] });
  const token = (correo) => JSON.parse(app.login(correo)).token;
  const tokens = { admin: token('admin@demo.cl'), lector: token('lector@demo.cl') };
  const llamar = (accion, datos, quien = 'admin') => JSON.parse(app.api(tokens[quien], accion, datos));
  const exigir = (r) => { assert.equal(r.ok, true, r.error); return r.data; };
  const guia = (extra = {}) => ({ titulo: 'Guía ficticia', maquinaId: 'DEM-101', resumen: 'Resumen de prueba', ...extra });
  return { app, servicios, drive, llamar, exigir, guia };
}

test('el esquema de Guías tiene título, máquina, resumen y metadatos del archivo', () => {
  const { ESQUEMA } = loadBackend().exports;
  assert.deepEqual(Array.from(ESQUEMA.Guias),
    ['id', 'titulo', 'maquinaId', 'resumen', 'autor', 'actualizado', 'fileId', 'nombreArchivo', 'mimeType', 'tamano']);
});

test('una guía con archivo lo guarda en Drive y lo entrega sin exponer el fileId', () => {
  const e = entorno();
  const { id } = e.exigir(e.llamar('guardarGuia', e.guia({ archivo: PDF })));
  assert.equal(e.drive.archivos.size, 1);

  const vista = e.exigir(e.llamar('guia', { id }, 'lector'));
  assert.equal(vista.archivo, true);
  assert.equal(vista.nombreArchivo, 'Guía transportador.pdf');
  assert.equal(vista.maquinaNombre, 'Transportador modular');
  const listado = e.exigir(e.llamar('guias', {}, 'lector'));
  assert.doesNotMatch(JSON.stringify([vista, listado]), /DRIVE_PRIVADO/);

  const a = e.exigir(e.llamar('archivoGuia', { id }, 'lector'));
  assert.equal(a.mime, 'application/pdf');
  assert.equal(Buffer.from(a.base64, 'base64').toString('binary'), '%PDF-1.7 guía ficticia');
});

test('el archivo es opcional y una guía sin archivo avisa al pedirlo', () => {
  const e = entorno();
  const { id } = e.exigir(e.llamar('guardarGuia', e.guia()));
  assert.equal(e.exigir(e.llamar('guia', { id }, 'lector')).archivo, false);
  const r = e.llamar('archivoGuia', { id }, 'lector');
  assert.equal(r.ok, false);
  assert.match(r.error, /no tiene un archivo adjunto/);
});

test('título, máquina válida y resumen son obligatorios', () => {
  const e = entorno();
  assert.match(e.llamar('guardarGuia', e.guia({ titulo: '' })).error, /título/);
  assert.match(e.llamar('guardarGuia', e.guia({ maquinaId: '' })).error, /máquina válida/);
  assert.match(e.llamar('guardarGuia', e.guia({ maquinaId: 'NO-EXISTE' })).error, /máquina válida/);
  assert.match(e.llamar('guardarGuia', e.guia({ resumen: '  ' })).error, /resumen/);
});

test('un archivo que no corresponde a su extensión se rechaza sin tocar Drive ni la hoja', () => {
  const e = entorno();
  const filas = e.servicios.sheets.Guias.rows.length;
  const r = e.llamar('guardarGuia', e.guia({ archivo: { ...PDF, base64: b64('no es un pdf') } }));
  assert.equal(r.ok, false);
  assert.equal(e.drive.archivos.size, 0);
  assert.equal(e.servicios.sheets.Guias.rows.length, filas);
});

test('editar sin archivo lo conserva; reemplazarlo envía el anterior a la papelera', () => {
  const e = entorno();
  const { id } = e.exigir(e.llamar('guardarGuia', e.guia({ archivo: PDF })));
  e.exigir(e.llamar('guardarGuia', e.guia({ id, titulo: 'Título corregido' })));
  const vista = e.exigir(e.llamar('guia', { id }));
  assert.equal(vista.titulo, 'Título corregido');
  assert.equal(vista.archivo, true);

  e.exigir(e.llamar('guardarGuia', e.guia({ id, archivo: { ...PDF, nombre: 'v2.pdf' } })));
  const [primero, segundo] = [...e.drive.archivos.values()];
  assert.equal(primero.trashed, true);
  assert.equal(segundo.trashed, false);
  assert.equal(e.exigir(e.llamar('guia', { id })).nombreArchivo, 'v2.pdf');
});

test('eliminar una guía envía su archivo a la papelera de Drive', () => {
  const e = entorno();
  const { id } = e.exigir(e.llamar('guardarGuia', e.guia({ archivo: PDF })));
  e.exigir(e.llamar('eliminarGuia', { id }));
  assert.equal([...e.drive.archivos.values()][0].trashed, true);
  assert.equal(e.llamar('guia', { id }).ok, false);
});

test('todas las guías son visibles para el lector y solo el admin las gestiona', () => {
  const e = entorno();
  const lista = e.exigir(e.llamar('guias', {}, 'lector'));
  assert.deepEqual(lista.map((g) => g.id), ['GUI-001', 'GUI-002', 'GUI-003', 'GUI-004']);
  assert.equal(e.app.ACCIONES.archivoGuia[0], 'lector');
  assert.equal(e.app.ACCIONES.guardarGuia[0], 'admin');
  assert.equal(e.app.ACCIONES.eliminarGuia[0], 'admin');
  assert.match(e.llamar('eliminarGuia', { id: 'GUI-001' }, 'lector').error, /permiso/);
});

test('con una hoja anterior sin migrar, el guardado falla y el archivo subido va a la papelera', () => {
  const vieja = ['id', 'titulo', 'maquinaId', 'version', 'estado', 'resumen', 'contenido', 'autor', 'actualizado'];
  const e = entorno({ Guias: [vieja] });
  // La semilla respeta los nombres de columna de la hoja anterior
  const fila = e.servicios.sheets.Guias.rows[1];
  assert.equal(fila[vieja.indexOf('resumen')], 'Cómo una banda continua traslada envases entre módulos de la línea.');
  assert.equal(fila[vieja.indexOf('estado')], '');

  const r = e.llamar('guardarGuia', e.guia({ archivo: PDF }));
  assert.equal(r.ok, false);
  assert.match(r.error, /inicializar\(\)/);
  assert.equal([...e.drive.archivos.values()][0].trashed, true);
});
