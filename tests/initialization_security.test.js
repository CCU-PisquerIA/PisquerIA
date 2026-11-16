const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/load_backend');

function entorno(activo, responsable) {
  let accesos = 0;
  const { exports: app } = loadBackend({
    Session: {
      getActiveUser: () => ({ getEmail: () => activo }),
      getEffectiveUser: () => ({ getEmail: () => responsable })
    },
    PropertiesService: { getScriptProperties: () => { accesos++; throw new Error('Efecto inesperado'); } },
    SpreadsheetApp: { create: () => { accesos++; } },
    CalendarApp: { createCalendar: () => { accesos++; } },
    DriveApp: { createFolder: () => { accesos++; } }
  });
  return { app, accesos: () => accesos };
}

test('la inicialización pública deniega identidades ajenas o ausentes antes de tocar recursos', () => {
  for (const [activo, responsable] of [
    ['', 'responsable@ejemplo.test'],
    ['lector@ejemplo.test', 'responsable@ejemplo.test'],
    ['responsable@ejemplo.test', ''],
    ['', '']
  ]) {
    const caso = entorno(activo, responsable);
    assert.throws(() => caso.app.inicializar(), /Solo la cuenta responsable/);
    assert.equal(caso.accesos(), 0);
  }
});

test('la identidad Google del responsable satisface la guarda sin crear recursos', () => {
  const caso = entorno('Responsable@Ejemplo.test', 'responsable@ejemplo.test');
  assert.doesNotThrow(() => caso.app.exigirInicializacion_());
  assert.equal(caso.accesos(), 0);
});

test('sin el servicio de identidad efectiva no se permite inicializar', () => {
  const { exports: app } = loadBackend({
    Session: { getActiveUser: () => ({ getEmail: () => 'responsable@ejemplo.test' }) }
  });
  assert.throws(() => app.inicializar(), /Solo la cuenta responsable/);
});
