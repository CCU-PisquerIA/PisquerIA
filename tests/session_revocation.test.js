const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

const cabUsuarios = ['id', 'email', 'nombre', 'area', 'rol', 'activo', 'creado', 'ultimoAcceso', 'prefs'];

function backend() {
  const servicios = fakeServicios({
    Usuarios: [cabUsuarios,
      ['USR-ADMIN', 'admin@demo.cl', 'Admin Ficticio', 'Pruebas', 'admin', 'SI', '', '', '{}'],
      ['USR-001', 'editor@demo.cl', 'Editor Ficticio', 'Pruebas', 'editor', 'SI', '', '', '{}']
    ],
    Registro: [['fecha', 'email', 'accion', 'detalle']]
  });
  const app = loadBackend(servicios.overrides).exports;
  return { app, servicios };
}

const resultado = (texto) => JSON.parse(texto);
const iniciar = (app, correo) => resultado(app.login(correo));

test('revoca todas las sesiones incluso si el índice fue truncado o eliminado', () => {
  const { app, servicios } = backend();
  const tokens = Array.from({ length: 8 }, () => iniciar(app, 'editor@demo.cl').token);
  const admin = iniciar(app, 'admin@demo.cl').token;
  assert.ok(tokens.every(Boolean));
  const indice = servicios.cache.get('u_USR-001').split(',');
  assert.strictEqual(indice.length, 5);
  assert.ok(tokens.slice(0, 3).every((token) => !indice.includes(token)));
  servicios.cache.remove('u_USR-001');

  const cambio = resultado(app.api(admin, 'guardarUsuario', {
    id: 'USR-001', nombre: 'Editor Ficticio', area: 'Pruebas', rol: 'lector', activo: 'SI'
  }));
  assert.strictEqual(cambio.ok, true, cambio.error);
  tokens.forEach((token) => assert.strictEqual(resultado(app.validarSesion(token)).ok, false));
});

test('una sesión refleja el rol actual después de cambiar la fila sin invalidar cachés', () => {
  const { app, servicios } = backend();
  const token = iniciar(app, 'admin@demo.cl').token;
  assert.strictEqual(resultado(app.validarSesion(token)).usuario.rol, 'admin');
  const hoja = servicios.sheets.Usuarios;
  hoja.rows[1][hoja.header().indexOf('rol')] = 'editor';

  const validacion = resultado(app.validarSesion(token));
  if (validacion.ok) {
    assert.strictEqual(validacion.usuario.rol, 'editor');
    assert.match(resultado(app.api(token, 'usuarios')).error, /permiso/i);
  } else {
    assert.strictEqual(validacion.expirada, true);
  }
});

test('una sesión no sobrevive a la desactivación ni a la eliminación del usuario', () => {
  for (const cambio of ['NO', null]) {
    const { app, servicios } = backend();
    const token = iniciar(app, 'editor@demo.cl').token;
    const hoja = servicios.sheets.Usuarios;
    if (cambio === null) hoja.rows.splice(2, 1);
    else hoja.rows[2][hoja.header().indexOf('activo')] = cambio;
    assert.strictEqual(resultado(app.validarSesion(token)).ok, false);
    assert.strictEqual(resultado(app.api(token, 'maquinas')).ok, false);
  }
});

test('el token demo vigente expira cuando se apagan las cuentas demo', () => {
  const { app, servicios } = backend();
  const token = iniciar(app, 'admin@demo.cl').token;
  const actual = loadBackend(servicios.overrides).exports;
  assert.strictEqual(resultado(actual.validarSesion(token)).ok, true);
  servicios.properties.set('DEMO_ACCESS_ENABLED', 'false');
  assert.strictEqual(resultado(actual.validarSesion(token)).ok, false);
  assert.strictEqual(resultado(actual.api(token, 'maquinas')).ok, false);
});

test('el acceso demo está habilitado por defecto salvo propiedad false exacta', () => {
  for (const valor of [null, '', 'true', 'false', 'FALSE', 'otro']) {
    const { app, servicios } = backend();
    if (valor === null) servicios.properties.delete('DEMO_ACCESS_ENABLED');
    else servicios.properties.set('DEMO_ACCESS_ENABLED', valor);
    const acceso = iniciar(app, 'admin@demo.cl');
    assert.strictEqual(acceso.ok, valor !== 'false', `Propiedad: ${valor}`);
    if (acceso.ok) assert.strictEqual(resultado(app.validarSesion(acceso.token)).ok, true);
    else assert.match(acceso.error, /deshabilitadas/);
  }
});

test('MODO_DEMO apagado bloquea ingreso y sesión previa sin importar la propiedad', () => {
  for (const valor of [null, 'true', 'false']) {
    const { app, servicios } = backend();
    const token = iniciar(app, 'admin@demo.cl').token;
    if (valor === null) servicios.properties.delete('DEMO_ACCESS_ENABLED');
    else servicios.properties.set('DEMO_ACCESS_ENABLED', valor);
    app.APP.MODO_DEMO = false;
    assert.match(iniciar(app, 'admin@demo.cl').error, /deshabilitadas/);
    assert.strictEqual(resultado(app.validarSesion(token)).ok, false);
  }
});

test('roles heredados del prototipo y acciones no registradas se rechazan', () => {
  const { app, servicios } = backend();
  const token = iniciar(app, 'admin@demo.cl').token;
  assert.match(resultado(app.api(token, 'constructor')).error, /Acción no válida/);
  assert.match(resultado(app.api(token, 'guardarUsuario', {
    email: 'nuevo@demo.cl', nombre: 'Prueba', rol: 'constructor'
  })).error, /rol válido/);
  servicios.sheets.Usuarios.rows[1][4] = 'constructor';
  assert.strictEqual(resultado(app.validarSesion(token)).ok, false);
  assert.strictEqual(iniciar(app, 'admin@demo.cl').ok, false);
});
