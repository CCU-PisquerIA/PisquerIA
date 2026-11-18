const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBackend(overrides = {}) {
  const root = path.resolve(__dirname, '../..');
  const code = fs.readdirSync(root).filter((name) => name.endsWith('.js')).sort()
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  const properties = new Map([['DB_ID', 'CAL_123'], ['CAL_ID', 'CAL_123'], ['DEMO_ACCESS_ENABLED', 'true']]);

  // Servicios simulados para ejecutar las pruebas sin acceso a Google.
  const sandbox = {
    Logger: { log: () => {} },
    Session: {
      getActiveUser: () => ({ getEmail: () => 'usuario@ccu.cl' }),
      getEffectiveUser: () => ({ getEmail: () => 'usuario@ccu.cl' })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) || null,
        setProperty: (key, value) => properties.set(key, String(value))
      })
    },
    CacheService: {
      getScriptCache: () => {
        const store = new Map();
        return {
          get: (k) => store.get(k) || null,
          put: (k, v) => store.set(k, String(v)),
          remove: (k) => store.delete(k)
        };
      }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {}
      })
    },
    Utilities: {
      formatDate: (d, tz, f) => '2026-11-11',
      getUuid: () => 'mock-uuid-' + Math.random().toString(36).slice(2),
      computeDigest: () => [1, 2, 3],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    },
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: () => ({ addMetaTag: () => {} })
        })
      }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' })
    }
  };

  Object.assign(sandbox, overrides);
  vm.createContext(sandbox);

  // Expone los contratos necesarios para verificar el backend.
  const exportsScript = `
;({
  APP,
  ROLES,
  ESQUEMA,
  ACCIONES,
  ESTADOS_TAREA,
  PRIORIDADES,
  doGet,
  include,
  inicializar,
  login,
  validarSesion,
  logout,
  api,
  registrarse,
  txt_,
  seguro_,
  ssoPerfil_,
  validarDominio_,
  formatearNombreEmail_,
  ARCHIVOS_PERMITIDOS,
  validarArchivo_,
  firmaValida_,
  docPublico_,
  COLUMNAS_OBSOLETAS,
  HOJAS_CACHE,
  migrarHoja_,
  leer_,
  guardar_,
  borrar_,
  trozos_,
  sembrar_,
  asistente_,
  respuestaGemini_,
  historialChat_,
  contextoAsistente_,
  LISTAS,
  listas_,
  listasAdmin_,
  guardarOpcion_,
  eliminarOpcion_,
  guardarMaquina_,
  guardarGuia_,
  verGuia_,
  archivoGuia_,
  siguienteId_,
  exigirInicializacion_
});
`;

  return {
    rawCode: code,
    exports: vm.runInContext(code + '\n' + exportsScript, sandbox)
  };
}

module.exports = { loadBackend };
