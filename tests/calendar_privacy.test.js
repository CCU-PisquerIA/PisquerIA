const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./helpers/load_backend');

function crearEvento({ id, invitados = [], etiqueta = '', creadores = [], titulo, descripcion = 'detalle confidencial' }) {
  let metadatosLeidos = false;
  const evento = {
    getGuestList: () => invitados.map((email) => ({ getEmail: () => email })),
    getTag: () => etiqueta,
    getCreators: () => creadores,
    getId: () => id,
    getTitle: () => titulo,
    getStartTime: () => new Date('2026-11-17T10:00:00Z'),
    getEndTime: () => new Date('2026-11-17T11:00:00Z'),
    isAllDayEvent: () => false,
    getLocation: () => { metadatosLeidos = true; return 'Sala reservada'; },
    getDescription: () => { metadatosLeidos = true; return descripcion; }
  };
  return { evento, metadatosLeidos: () => metadatosLeidos };
}

test('reuniones filtra antes de leer o serializar metadatos para todo rol', () => {
  const propiosA = crearEvento({ id: 'a', invitados: ['lector.a@ccu.cl'], titulo: 'Reunión A' });
  const propiosB = crearEvento({ id: 'b', etiqueta: 'lector.b@ccu.cl', titulo: 'Reunión B' });
  const legacy = crearEvento({ id: 'legacy', creadores: ['lector.a@ccu.cl'], titulo: 'Legada A' });
  const reservado = crearEvento({
    id: 'secreto', invitados: ['otra.persona@ccu.cl'], etiqueta: 'otra.persona@ccu.cl',
    titulo: 'No debe aparecer: secreto', descripcion: 'detalle privado oculto'
  });
  const eventos = [propiosA.evento, propiosB.evento, legacy.evento, reservado.evento];
  const { exports: app } = loadBackend({
    CalendarApp: { getCalendarById: () => ({ getEvents: () => eventos }) }
  });
  const listar = (email, rol) => app.ACCIONES.reuniones[1](
    { desde: '2026-11-17T00:00:00Z', hasta: '2026-11-18T00:00:00Z' }, { email, rol }
  );
  const lectorA = JSON.stringify(listar('lector.a@ccu.cl', 'lector'));
  const lectorB = JSON.stringify(listar('lector.b@ccu.cl', 'lector'));
  const admin = JSON.stringify(listar('admin@ccu.cl', 'admin'));

  assert.match(lectorA, /Reunión A/);
  assert.match(lectorA, /Legada A/);
  assert.doesNotMatch(lectorA, /Reunión B|No debe aparecer|detalle privado oculto/);
  assert.match(lectorB, /Reunión B/);
  assert.doesNotMatch(lectorB, /Reunión A|Legada A|No debe aparecer/);
  assert.equal(JSON.parse(admin).length, 0);
  assert.equal(reservado.metadatosLeidos(), false);
  assert.equal(propiosA.metadatosLeidos(), true);
});

test('cancelación aplica el mismo criterio de creador heredado y respeta la etiqueta explícita', () => {
  let borrados = 0;
  const legado = crearEvento({ id: 'legado', creadores: ['Persona@ccu.cl'], titulo: 'Legada' }).evento;
  legado.deleteEvent = () => { borrados++; };
  const etiquetado = crearEvento({ id: 'etiquetado', etiqueta: 'otra@ccu.cl', creadores: ['persona@ccu.cl'] }).evento;
  etiquetado.deleteEvent = () => { borrados++; };
  const { exports: app } = loadBackend({
    CalendarApp: { getCalendarById: () => ({ getEventById: (id) => id === 'legado' ? legado : etiquetado }) }
  });
  const cancelar = app.ACCIONES.cancelarReunion[1];
  assert.throws(() => cancelar({ id: 'legado' }, { email: 'ajena@ccu.cl', rol: 'lector' }), /Solo quien/);
  assert.equal(borrados, 0);
  assert.equal(cancelar({ id: 'legado' }, { email: 'persona@ccu.cl', rol: 'lector' }), true);
  assert.throws(() => cancelar({ id: 'etiquetado' }, { email: 'persona@ccu.cl', rol: 'editor' }), /Solo quien/);
  assert.equal(borrados, 1);
  assert.equal(cancelar({ id: 'etiquetado' }, { email: 'admin@ccu.cl', rol: 'admin' }), true);
  assert.equal(borrados, 2);
});
