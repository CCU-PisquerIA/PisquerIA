const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');
const { fakeServicios } = require('./helpers/fake_sheets');

const CAB_USUARIOS = ['id', 'email', 'nombre', 'area', 'rol', 'activo', 'creado', 'ultimoAcceso', 'prefs'];

// Backend con planilla falsa y una sesión de Google simulada (correoGoogle = '' → sin sesión detectada)
function backend(correoGoogle, extra = []) {
  const s = fakeServicios({
    Usuarios: [
      CAB_USUARIOS,
      ['USR-001', 'admin@demo.cl', 'Administrador', 'TI', 'admin', 'SI', '', '', '{}'],
      ['USR-002', 'jefe@ccu.cl', 'Jefe Planta', 'TI', 'admin', 'SI', '', '', '{}'],
      ['USR-003', 'baja@demo.cl', 'Dado de baja', 'TI', 'lector', 'NO', '', '', '{}'],
      ...extra
    ],
    Registro: [['fecha', 'email', 'accion', 'detalle']]
  });
  s.overrides.Session = { getActiveUser: () => ({ getEmail: () => correoGoogle }) };
  return { s, app: loadBackend(s.overrides).exports };
}
const r = (json) => JSON.parse(json);

test('an @ccu.cl user cannot log in as someone else by typing their email', () => {
  const { app, s } = backend('operador@ccu.cl');
  const o = r(app.login('jefe@ccu.cl'));
  assert.strictEqual(o.ok, false);
  assert.match(o.error, /Tu sesión de Google es operador@ccu\.cl/);
  assert.ok(s.sheets.Registro.rows.some((x) => x[2] === 'login rechazado'));
});

test('without a detected Google session, typed corporate emails are rejected', () => {
  const { app } = backend('');
  const o = r(app.login('jefe@ccu.cl'));
  assert.strictEqual(o.ok, false);
  assert.match(o.error, /No detectamos tu cuenta corporativa/);
  assert.strictEqual(r(app.login()).ok, false);
});

test('the verified Google account logs in and is auto-registered as lector', () => {
  const { app, s } = backend('nuevo.operador@ccu.cl');
  const o = r(app.login());
  assert.strictEqual(o.ok, true);
  assert.strictEqual(o.usuario.email, 'nuevo.operador@ccu.cl');
  assert.strictEqual(o.usuario.rol, 'lector');
  assert.strictEqual(o.usuario.nombre, 'Nuevo Operador');
  assert.ok(s.sheets.Usuarios.rows.some((x) => x[1] === 'nuevo.operador@ccu.cl'));
  assert.strictEqual(r(app.login('nuevo.operador@ccu.cl')).ok, true, 'escribir el mismo correo también vale');
});

test('a Google session outside @ccu.cl is rejected', () => {
  const { app } = backend('alguien@pisqueradechile.cl');
  const o = r(app.login());
  assert.strictEqual(o.ok, false);
  assert.match(o.error, /Dominio no autorizado/);
});

test('a Google account with an @demo.cl address cannot use SSO', () => {
  const { app } = backend('admin@demo.cl');
  assert.strictEqual(r(app.login()).ok, false);
});

test('existing @demo.cl test accounts can log in by email while MODO_DEMO is on', () => {
  const { app } = backend('');
  assert.strictEqual(app.APP.MODO_DEMO, true);
  const o = r(app.login('Admin@Demo.cl'));
  assert.strictEqual(o.ok, true);
  assert.strictEqual(o.usuario.rol, 'admin');
  assert.ok(o.token);
});

test('unknown or disabled @demo.cl accounts are rejected and never auto-created', () => {
  const { app, s } = backend('');
  assert.match(r(app.login('hacker@demo.cl')).error, /No existe la cuenta de prueba/);
  assert.match(r(app.login('baja@demo.cl')).error, /desactivada/);
  assert.ok(!s.sheets.Usuarios.rows.some((x) => x[1] === 'hacker@demo.cl'));
});

test('test accounts are disabled when MODO_DEMO is off', () => {
  const { app } = backend('');
  app.APP.MODO_DEMO = false;
  assert.match(r(app.login('admin@demo.cl')).error, /deshabilitadas/);
});

test('repeated failed test-account logins trigger the lockout', () => {
  const { app } = backend('');
  for (let i = 0; i < app.APP.MAX_INTENTOS; i++) app.login('nadie@demo.cl');
  assert.match(r(app.login('nadie@demo.cl')).error, /Demasiados intentos/);
});

test('registrarse uses the verified Google account, not the email sent by the browser', () => {
  const { app, s } = backend('nueva@ccu.cl');
  const o = r(app.registrarse({ nombre: 'Nueva Persona', email: 'jefe2@ccu.cl', area: 'Bodega' }));
  assert.strictEqual(o.ok, true);
  assert.strictEqual(o.usuario.email, 'nueva@ccu.cl');
  assert.ok(!s.sheets.Usuarios.rows.some((x) => x[1] === 'jefe2@ccu.cl'));

  const sinSesion = backend('').app;
  assert.match(r(sinSesion.registrarse({ nombre: 'X' })).error, /No detectamos tu cuenta corporativa/);
});

// Ejecuta doGet con una sesión de Google simulada y devuelve el CFG que recibe el navegador
function cfgDoGet(correoGoogle) {
  const { s } = backend(correoGoogle);
  let plantilla;
  s.overrides.HtmlService = {
    createTemplateFromFile: () => (plantilla = { evaluate: () => ({ setTitle: () => ({ addMetaTag: () => {} }) }) }),
    createHtmlOutputFromFile: () => ({ getContent: () => '' })
  };
  s.overrides.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ABC/exec' }) };
  loadBackend(s.overrides).exports.doGet();
  return JSON.parse(plantilla.cfg);
}

test('doGet reports a rejected Google account so the user can switch accounts', () => {
  const cfg = cfgDoGet('persona@gmail.com');
  assert.strictEqual(cfg.ssoRechazado, 'persona@gmail.com');
  assert.strictEqual(cfg.ssoEmail, '');
  assert.strictEqual(cfg.ssoToken, null);
  assert.match(cfg.ssoError, /Dominio no autorizado/);
  assert.strictEqual(cfg.appUrl, 'https://script.google.com/macros/s/ABC/exec');
});

test('doGet logs in an accepted @ccu.cl account without offering to switch', () => {
  const cfg = cfgDoGet('operador@ccu.cl');
  assert.strictEqual(cfg.ssoEmail, 'operador@ccu.cl');
  assert.strictEqual(cfg.ssoRechazado, '');
  assert.ok(cfg.ssoToken);
});

test('doGet without a detected Google session rejects nobody', () => {
  const cfg = cfgDoGet('');
  assert.strictEqual(cfg.ssoRechazado, '');
  assert.strictEqual(cfg.ssoError, null);
});
