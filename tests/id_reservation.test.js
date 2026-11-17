const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

function entorno(filas = [['id', 'nombre']]) {
  const servicios = fakeServicios({ Maquinas: filas });
  let bloqueado = false;
  let liberaciones = 0;
  const original = servicios.overrides.PropertiesService.getScriptProperties();
  servicios.overrides.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (clave) => {
        if (clave.startsWith('SEQUENCE_')) assert.equal(bloqueado, true);
        return original.getProperty(clave);
      },
      setProperty: (clave, valor) => {
        assert.equal(bloqueado, true);
        return original.setProperty(clave, valor);
      }
    })
  };
  servicios.overrides.LockService = {
    getScriptLock: () => ({
      waitLock: () => { assert.equal(bloqueado, false); bloqueado = true; },
      releaseLock: () => { assert.equal(bloqueado, true); bloqueado = false; liberaciones++; }
    })
  };
  return { servicios, cargar: () => loadBackend(servicios.overrides).exports, liberaciones: () => liberaciones };
}

test('dos ejecuciones reservan IDs distintos antes de insertar cualquiera de sus filas', () => {
  const e = entorno([['id', 'nombre'], ['DEM-007', 'Equipo ficticio']]);
  const primera = e.cargar(), segunda = e.cargar();
  assert.equal(primera.siguienteId_('Maquinas', 'DEM'), 'DEM-008');
  assert.equal(segunda.siguienteId_('Maquinas', 'DEM'), 'DEM-009');
  assert.equal(e.servicios.sheets.Maquinas.rows.length, 2);
  assert.equal(e.liberaciones(), 2);
});

test('una reserva fallida o el borrado del último registro no reutiliza su número', () => {
  const e = entorno();
  const app = e.cargar();
  assert.equal(app.siguienteId_('Maquinas', 'DEM'), 'DEM-001');
  // La inserción no llega a ocurrir: la reserva queda consumida.
  assert.equal(e.cargar().siguienteId_('Maquinas', 'DEM'), 'DEM-002');
  e.servicios.sheets.Maquinas.appendRow(['DEM-002', 'Equipo temporal']);
  e.servicios.sheets.Maquinas.deleteRow(2);
  assert.equal(e.cargar().siguienteId_('Maquinas', 'DEM'), 'DEM-003');
});

test('el arranque heredado y los cambios manuales se leen sin confiar en caché', () => {
  const e = entorno([['id', 'nombre'], ['DEM-020', 'Heredado'], ['otro', 'Ignorado']]);
  const app = e.cargar();
  app.leer_('Maquinas');
  e.servicios.sheets.Maquinas.appendRow(['DEM-030', 'Carga manual']);
  assert.equal(app.siguienteId_('Maquinas', 'DEM'), 'DEM-031');
});

test('un contador corrupto o agotado deniega la reserva y libera el bloqueo', () => {
  for (const valor of ['invalido', String(Number.MAX_SAFE_INTEGER)]) {
    const e = entorno();
    e.servicios.properties.set('SEQUENCE_DB_TEST_Maquinas_DEM', valor);
    assert.throws(() => e.cargar().siguienteId_('Maquinas', 'DEM'));
    assert.equal(e.liberaciones(), 1);
  }
});
