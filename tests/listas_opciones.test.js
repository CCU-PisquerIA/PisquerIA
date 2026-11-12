const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

const ADMIN = { email: 'admin@demo.cl', nombre: 'Administrador', rol: 'admin' };

// Planilla vacía con todas las hojas del ESQUEMA, sembrada como lo hace inicializar()
function planilla() {
  const base = loadBackend().exports;
  const hojas = Object.fromEntries(Object.entries(base.ESQUEMA).map(([n, cols]) => [n, [Array.from(cols)]]));
  const s = fakeServicios(hojas);
  const app = loadBackend(s.overrides).exports;
  app.sembrar_({ getSheetByName: (n) => s.sheets[n] });
  return { s, app };
}

const opcion = (app, lista, nombre) => app.listasAdmin_().listas.find((l) => l.clave === lista).opciones.find((o) => o.nombre === nombre);
const columna = (s, hoja, campo) => {
  const [cab, ...filas] = s.sheets[hoja].rows;
  return filas.map((r) => r[cab.indexOf(campo)]);
};

test('list actions are registered with the right roles', () => {
  const { exports: app } = loadBackend();
  assert.strictEqual(app.ACCIONES.listas[0], 'lector');
  assert.strictEqual(app.ACCIONES.listasAdmin[0], 'admin');
  assert.strictEqual(app.ACCIONES.guardarOpcion[0], 'admin');
  assert.strictEqual(app.ACCIONES.eliminarOpcion[0], 'admin');
  assert.ok(app.HOJAS_CACHE.includes('Listas'));
});

test('without the Listas sheet the defaults are used and editing asks to run inicializar()', () => {
  const { ESQUEMA } = loadBackend().exports;
  const s = fakeServicios({ Maquinas: [Array.from(ESQUEMA.Maquinas)], Guias: [Array.from(ESQUEMA.Guias)], Documentos: [Array.from(ESQUEMA.Documentos)] });
  const app = loadBackend(s.overrides).exports;
  const l = app.listas_();
  assert.deepStrictEqual(Array.from(l.clases, (o) => o.nombre), ['A', 'B', 'C']);
  assert.ok(l.estadosGuia.some((o) => o.nombre === 'Publicada'));
  assert.strictEqual(app.listasAdmin_().configurada, false);
  assert.throws(() => app.guardarOpcion_({ lista: 'areas', nombre: 'Laboratorio' }, ADMIN), /inicializar\(\)/);
});

test('sembrar_ seeds every list once', () => {
  const { s, app } = planilla();
  const n = s.sheets.Listas.rows.length;
  assert.strictEqual(n - 1, Object.values(app.LISTAS).reduce((t, l) => t + l.opciones.length, 0));
  app.sembrar_({ getSheetByName: (x) => s.sheets[x] });
  assert.strictEqual(s.sheets.Listas.rows.length, n, 'no debe duplicar opciones');
  assert.strictEqual(app.listas_().clases[0].descripcion, 'crítica');
});

test('adding an option makes it valid in the forms and rejects duplicates', () => {
  const { app } = planilla();
  assert.throws(() => app.guardarMaquina_({ id: 'LAB-001', nuevo: true, nombre: 'Equipo', area: 'Laboratorio', clase: 'A', descripcion: 'x' }, ADMIN), /área válida/);
  app.guardarOpcion_({ lista: 'areas', nombre: 'Laboratorio' }, ADMIN);
  app.guardarMaquina_({ id: 'LAB-001', nuevo: true, nombre: 'Equipo', area: 'Laboratorio', clase: 'A', descripcion: 'x' }, ADMIN);
  assert.throws(() => app.guardarOpcion_({ lista: 'areas', nombre: 'laboratorio' }, ADMIN), /Ya existe/);
  assert.throws(() => app.guardarOpcion_({ lista: 'inventada', nombre: 'X' }, ADMIN), /Lista no válida/);
});

test('renaming an option updates every record that uses it', () => {
  const { s, app } = planilla();
  const o = opcion(app, 'areas', 'Envasado');
  assert.strictEqual(o.usos, 4);
  const r = app.guardarOpcion_({ lista: 'areas', id: o.id, nombre: 'Envasado y etiquetado', descripcion: '' }, ADMIN);
  assert.strictEqual(r.actualizados, 4);
  assert.strictEqual(columna(s, 'Maquinas', 'area').filter((a) => a === 'Envasado y etiquetado').length, 4);
  assert.ok(!columna(s, 'Maquinas', 'area').includes('Envasado'));
  assert.ok(!app.listas_().areas.some((a) => a.nombre === 'Envasado'));
});

test('an option in use or a system option cannot be deleted', () => {
  const { app } = planilla();
  assert.throws(() => app.eliminarOpcion_({ id: opcion(app, 'areas', 'Destilación').id }, ADMIN), /la usan 2 máquinas/);
  assert.throws(() => app.eliminarOpcion_({ id: opcion(app, 'estadosGuia', 'Publicada').id }, ADMIN), /no se puede eliminar/);
  const pub = opcion(app, 'estadosGuia', 'Publicada');
  assert.throws(() => app.guardarOpcion_({ lista: 'estadosGuia', id: pub.id, nombre: 'Aprobada' }, ADMIN), /no se puede renombrar/);
  app.guardarOpcion_({ lista: 'estadosGuia', id: pub.id, nombre: 'Publicada', descripcion: 'visible para todos' }, ADMIN);

  const libre = opcion(app, 'areas', 'Bodega');
  assert.strictEqual(libre.usos, 0);
  app.eliminarOpcion_({ id: libre.id }, ADMIN);
  assert.ok(!app.listas_().areas.some((a) => a.nombre === 'Bodega'));
});

test('editing a record keeps a value that is no longer in the list', () => {
  const { s, app } = planilla();
  const cab = s.sheets.Maquinas.rows[0];
  s.sheets.Maquinas.rows[1][cab.indexOf('area')] = 'Área antigua';
  const base = { id: 'DEM-101', nombre: 'Transportador', clase: 'A', descripcion: 'x' };
  const fresco = loadBackend(s.overrides).exports;
  fresco.guardarMaquina_({ ...base, area: 'Área antigua' }, ADMIN);
  assert.throws(() => fresco.guardarMaquina_({ ...base, area: 'Otra inventada' }, ADMIN), /área válida/);
  assert.throws(() => fresco.guardarGuia_({ titulo: 'T', maquinaId: 'DEM-101', version: '1', estado: 'Inventado', contenido: 'x' }, ADMIN), /Estado no válido/);
});
