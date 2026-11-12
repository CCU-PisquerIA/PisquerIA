const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBackend(overrides = {}) {
  const codePath = path.resolve(__dirname, '../../Código.js');
  const code = fs.readFileSync(codePath, 'utf8');

  // Apps Script globals mocked for headless Node execution
  const sandbox = {
    Logger: { log: () => {} },
    Session: {
      getActiveUser: () => ({ getEmail: () => 'usuario@ccu.cl' })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => 'CAL_123',
        setProperty: () => {}
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

  // Return top-level declarations needed for verification
  const exportsScript = `
;({
  APP,
  ROLES,
  ESQUEMA,
  ACCIONES,
  ESTADOS_GUIA,
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
  guardarGuia_
});
`;

  return {
    rawCode: code,
    exports: vm.runInContext(code + '\n' + exportsScript, sandbox)
  };
}

module.exports = { loadBackend };
