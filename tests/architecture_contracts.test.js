const { test } = require('node:test');
const assert = require('node:assert');
const { loadBackend } = require('./helpers/load_backend');

const { rawCode, exports: app } = loadBackend();

test('Public function whitelist matches Apps Script security rules', () => {
  // Public functions exposed to client-side google.script.run
  const allowedPublic = new Set([
    'doGet',
    'include',
    'inicializar',
    'login',
    'validarSesion',
    'logout',
    'api',
    'registrarse'
  ]);

  // Find all top-level function declarations
  const funcRegex = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let match;
  const unexpectedPublic = [];

  while ((match = funcRegex.exec(rawCode)) !== null) {
    const fnName = match[1];
    const isPrivate = fnName.endsWith('_');
    if (!isPrivate && !allowedPublic.has(fnName)) {
      unexpectedPublic.push(fnName);
    }
  }

  assert.deepStrictEqual(
    unexpectedPublic,
    [],
    `Found unwhitelisted public functions (must end with _ to remain private): ${unexpectedPublic.join(', ')}`
  );
});

test('ACCIONES table integrity and role hierarchy', () => {
  const validRoles = new Set(Object.keys(app.ROLES));
  assert.ok(validRoles.has('lector'), 'Missing lector role');
  assert.ok(validRoles.has('editor'), 'Missing editor role');
  assert.ok(validRoles.has('admin'), 'Missing admin role');

  assert.ok(app.ROLES.admin > app.ROLES.editor, 'admin role must outrank editor');
  assert.ok(app.ROLES.editor > app.ROLES.lector, 'editor role must outrank lector');

  const actions = Object.entries(app.ACCIONES);
  assert.ok(actions.length >= 25, 'ACCIONES table should define at least 25 actions');

  actions.forEach(([name, def]) => {
    assert.ok(Array.isArray(def), `Action ${name} definition must be an array [role, handler]`);
    assert.strictEqual(def.length, 2, `Action ${name} must have 2 elements [role, handler]`);
    const [minRole, handler] = def;
    assert.ok(
      validRoles.has(minRole),
      `Action ${name} specifies invalid minimum role: ${minRole}`
    );
    assert.strictEqual(
      typeof handler,
      'function',
      `Action ${name} handler must be an executable function`
    );
  });
});

test('ESQUEMA definition contains required sheets and essential columns', () => {
  const requiredSheets = ['Usuarios', 'Maquinas', 'Guias', 'Documentos', 'Tareas', 'Registro'];
  requiredSheets.forEach(sheet => {
    assert.ok(
      Array.isArray(app.ESQUEMA[sheet]),
      `ESQUEMA is missing definition for sheet: ${sheet}`
    );
    assert.ok(
      app.ESQUEMA[sheet].length > 0,
      `ESQUEMA for ${sheet} must contain at least 1 column`
    );
  });

  // Verify primary key in each domain entity is 'id'
  ['Usuarios', 'Maquinas', 'Guias', 'Documentos', 'Tareas'].forEach(sheet => {
    assert.strictEqual(
      app.ESQUEMA[sheet][0],
      'id',
      `First column of ${sheet} must be 'id'`
    );
  });

  // Verify email and rol in Usuarios
  assert.ok(app.ESQUEMA.Usuarios.includes('email'), 'Usuarios schema must contain email');
  assert.ok(app.ESQUEMA.Usuarios.includes('rol'), 'Usuarios schema must contain rol');
});
