// Las sesiones se contrastan con la fila vigente y una versión persistente de revocación.
function demoHabilitada_() {
  return APP.MODO_DEMO && PropertiesService.getScriptProperties()
    .getProperty('DEMO_ACCESS_ENABLED') === 'true';
}

function ttl_() { return Math.min(APP.SESION_HORAS, 6) * 3600; }

function rolValido_(rol) {
  return typeof rol === 'string' && Object.prototype.hasOwnProperty.call(ROLES, rol);
}

function versionSesion_(idUsuario) {
  return PropertiesService.getScriptProperties().getProperty('SESSION_VERSION_' + idUsuario) || '0';
}

function usuarioSesionActual_(idUsuario) {
  const filas = db_().getSheetByName('Usuarios').getDataRange().getValues();
  const columnas = filas.shift().map(String);
  const posId = columnas.indexOf('id');
  if (posId < 0) throw new Error('SESION_EXPIRADA');
  const fila = filas.find(function (r) { return String(r[posId]) === idUsuario; });
  if (!fila) throw new Error('SESION_EXPIRADA');
  const usuario = {};
  ESQUEMA.Usuarios.forEach(function (columna) {
    const valor = fila[columnas.indexOf(columna)];
    usuario[columna] = valor == null ? '' : String(valor);
  });
  return usuario;
}

function abrirSesion_(usuario) {
  if (!rolValido_(usuario.rol)) throw new Error('La cuenta no tiene un rol autorizado.');
  const cache = CacheService.getScriptCache();
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const datos = Object.assign({}, usuario, { versionSesion: versionSesion_(usuario.id) });
  cache.put('s_' + token, JSON.stringify(datos), ttl_());
  const lista = (cache.get('u_' + usuario.id) || '').split(',').filter(String);
  lista.push(token);
  cache.put('u_' + usuario.id, lista.slice(-5).join(','), ttl_());
  return token;
}

function sesion_(token) {
  try {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9]{16,128}$/.test(token)) throw new Error();
    const cache = CacheService.getScriptCache();
    const datos = JSON.parse(cache.get('s_' + token) || 'null');
    if (!datos || datos.versionSesion !== versionSesion_(datos.id)) throw new Error();
    const actual = usuarioSesionActual_(datos.id);
    if (actual.activo !== 'SI' || !rolValido_(actual.rol)) throw new Error();
    if (actual.email !== datos.email || actual.rol !== datos.rol) throw new Error();
    if (dominio_(actual.email) === 'demo.cl' && !demoHabilitada_()) throw new Error();
    cache.put('s_' + token, JSON.stringify(datos), ttl_());
    return publico_(actual);
  } catch (e) {
    if (typeof token === 'string' && token.length <= 128) {
      try { CacheService.getScriptCache().remove('s_' + token); } catch (ignorado) {}
    }
    throw new Error('SESION_EXPIRADA');
  }
}

function cerrarSesionesDe_(idUsuario) {
  // La versión invalida incluso tokens antiguos cuyo índice haya expirado o sido desalojado.
  PropertiesService.getScriptProperties().setProperty('SESSION_VERSION_' + idUsuario, Utilities.getUuid());
  const cache = CacheService.getScriptCache();
  (cache.get('u_' + idUsuario) || '').split(',').filter(String)
    .forEach(function (token) { cache.remove('s_' + token); });
  cache.remove('u_' + idUsuario);
}
