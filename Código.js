
const APP = {
  NOMBRE: 'Intranet · Pisquera de Chile',
  LOGO_URL: '',
  MODO_DEMO: true,
  SESION_HORAS: 6,
  ZONA: 'America/Santiago',
  MAX_INTENTOS: 5,
  BLOQUEO_MIN: 15,
  REGISTRO_ABIERTO: true,
  DOMINIOS_REGISTRO: ['pisqueradechile.cl', 'ccu.cl'],
  CALENDARIO: 'Intranet · Pisquera de Chile',
  CARPETA_DOCS: 'Documentos Técnicos PisquerIA',
  MAX_ARCHIVO_MB: 10
};

// Archivos que se aceptan en el repositorio documental (extensión → tipos MIME válidos)
const ARCHIVOS_PERMITIDOS = {
  pdf:  ['application/pdf'],
  png:  ['image/png'],
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt:  ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  dwg:  ['application/acad', 'image/vnd.dwg', 'application/octet-stream']
};

const ROLES = { lector: 1, editor: 2, admin: 3 };
const ESTADOS_GUIA = ['Borrador', 'En revisión', 'Publicada'];
const ESTADOS_TAREA = ['Pendiente', 'En curso', 'Completada'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const PREFS_DEFECTO = { recordatorio: 10, avisoTareas: true };

const ESQUEMA = {
  Usuarios:   ['id', 'email', 'nombre', 'area', 'rol', 'activo', 'creado', 'ultimoAcceso', 'prefs'],
  Maquinas:   ['id', 'nombre', 'area', 'clase', 'descripcion', 'ubicacion', 'fabricante', 'estado', 'actualizado'],
  Guias:      ['id', 'titulo', 'maquinaId', 'version', 'estado', 'resumen', 'contenido', 'autor', 'actualizado'],
  Documentos: ['id', 'titulo', 'maquinaId', 'tipo', 'url', 'version', 'actualizado', 'fileId', 'nombreArchivo', 'mimeType', 'tamano', 'autor'],
  Tareas:     ['id', 'titulo', 'descripcion', 'estado', 'prioridad', 'vence', 'asignadoA', 'creadoPor', 'creado', 'actualizado'],
  Registro:   ['fecha', 'email', 'accion', 'detalle']
};

// Columnas que ya no se usan y que inicializar() elimina de la planilla (datos sensibles heredados)
const COLUMNAS_OBSOLETAS = { Usuarios: ['salt', 'hash'] };

// Hojas cuya lectura se guarda en CacheService entre ejecuciones (Registro solo se escribe)
const HOJAS_CACHE = ['Usuarios', 'Maquinas', 'Guias', 'Documentos', 'Tareas'];
const CACHE_HOJA_SEG = 10 * 60; // cambios hechos a mano en la planilla se ven en máx. 10 min

/* =====================================================================
 * WEB APP
 * ===================================================================*/
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  let ssoUser = null;
  let ssoToken = null;
  let ssoError = null;
  let activeEmail = '';

  try {
    activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (activeEmail) {
      const u = ssoPerfil_(activeEmail);
      ssoUser = publico_(u);
      ssoToken = abrirSesion_(ssoUser);
      guardar_('Usuarios', { id: u.id, ultimoAcceso: ahora_() });
      log_(activeEmail, 'login sso', '');
    }
  } catch (e) {
    ssoError = e.message;
  }

  t.cfg = JSON.stringify({
    nombre: APP.NOMBRE,
    logo: APP.LOGO_URL || include('LogoCompleto').trim(),
    demo: APP.MODO_DEMO,
    registro: APP.REGISTRO_ABIERTO,
    dominios: APP.DOMINIOS_REGISTRO,
    maxArchivoMb: APP.MAX_ARCHIVO_MB,
    extensiones: Object.keys(ARCHIVOS_PERMITIDOS),
    ssoEmail: activeEmail,
    ssoUser: ssoUser,
    ssoToken: ssoToken,
    ssoError: ssoError
  }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return t.evaluate()
    .setTitle(APP.NOMBRE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function inicializar() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  const id = props.getProperty('DB_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('BD · Intranet Pisquera de Chile');
    props.setProperty('DB_ID', ss.getId());
  }

  Object.keys(ESQUEMA).forEach(function (nombre) {
    let sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    const cols = ESQUEMA[nombre];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // todo como texto
      sh.getRange(1, 1, 1, cols.length).setValues([cols])
        .setFontWeight('bold').setBackground('#0B1F44').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    } else {
      migrarHoja_(sh, nombre);
    }
    invalidarHoja_(nombre);
  });

  let cal = props.getProperty('CAL_ID') && CalendarApp.getCalendarById(props.getProperty('CAL_ID'));
  if (!cal) {
    cal = CalendarApp.createCalendar(APP.CALENDARIO, { timeZone: APP.ZONA, color: CalendarApp.Color.BLUE });
    props.setProperty('CAL_ID', cal.getId());
  }

  // Carpeta del repositorio documental. Para usar la Unidad Compartida, crea ahí la carpeta
  // y guarda su ID en la propiedad DOCS_FOLDER_ID antes de ejecutar inicializar().
  let carpeta = null;
  try { carpeta = props.getProperty('DOCS_FOLDER_ID') && DriveApp.getFolderById(props.getProperty('DOCS_FOLDER_ID')); }
  catch (e) { carpeta = null; }
  if (!carpeta) {
    carpeta = DriveApp.createFolder(APP.CARPETA_DOCS);
    carpeta.setDescription('Repositorio documental de la intranet. No compartir: la intranet entrega los archivos.');
    props.setProperty('DOCS_FOLDER_ID', carpeta.getId());
  }

  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  sembrar_(ss);
  Object.keys(ESQUEMA).forEach(invalidarHoja_);
  Logger.log('Base de datos lista: ' + ss.getUrl());
  Logger.log('Calendario del equipo: ' + cal.getName());
  Logger.log('Carpeta de documentos: ' + carpeta.getUrl());
}

// Migración por nombre de columna: elimina las obsoletas y agrega al final las que falten.
// No depende del orden de la hoja, así que no puede pisar columnas existentes.
function migrarHoja_(sh, nombre) {
  const cabecera = function () { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); };
  const obsoletas = COLUMNAS_OBSOLETAS[nombre] || [];
  const eliminadas = [];
  for (let i = cabecera().length - 1; i >= 0; i--) {
    const c = cabecera()[i];
    if (obsoletas.indexOf(c) >= 0) { sh.deleteColumn(i + 1); eliminadas.push(c); }
  }
  const agregadas = [];
  ESQUEMA[nombre].forEach(function (c) {
    if (cabecera().indexOf(c) >= 0) return;
    const col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue(c).setFontWeight('bold').setBackground('#0B1F44').setFontColor('#ffffff');
    if (sh.getMaxRows() > 1) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    agregadas.push(c);
  });
  if (eliminadas.length) Logger.log(nombre + ': columnas eliminadas → ' + eliminadas.join(', '));
  if (agregadas.length) Logger.log(nombre + ': columnas agregadas → ' + agregadas.join(', '));
  return { eliminadas: eliminadas, agregadas: agregadas };
}

function sembrar_(ss) {
  const hoy = hoy_();

  const shU = ss.getSheetByName('Usuarios');
  if (shU.getLastRow() < 2) {
    const usuarios = [
      ['admin@demo.cl',  'Administrador',  'TI',         'admin'],
      ['editor@demo.cl', 'Editor Técnico', 'Mantención', 'editor'],
      ['lector@demo.cl', 'Operador Demo',  'Envasado',   'lector']
    ].map(function (u, i) {
      return ['USR-00' + (i + 1), u[0], u[1], u[2], u[3], 'SI', ahora_(), ''];
    });
    shU.getRange(2, 1, usuarios.length, usuarios[0].length).setValues(usuarios);
  }

  const shM = ss.getSheetByName('Maquinas');
  if (shM.getLastRow() < 2) {
    const m = [
      ['DEM-101', 'Transportador modular', 'Envasado', 'A', 'Equipo ficticio que representa el traslado de envases entre dos módulos. La banda y sus apoyos ilustran cómo un movimiento continuo puede vincular distintas etapas.', 'Línea 1 · Sala de envasado', 'Fabricante ficticio', 'Operativa', hoy],
      ['DEM-102', 'Unidad de llenado', 'Envasado', 'A', 'Modelo didáctico de un depósito conectado a un conjunto de distribución. Sirve para describir el recorrido conceptual de un líquido hacia recipientes.', 'Línea 1 · Sala de envasado', 'Fabricante ficticio', 'Operativa', hoy],
      ['DEM-103', 'Etiquetadora de envases', 'Envasado', 'B', 'Equipo de ejemplo que relaciona una bobina de etiquetas con envases en movimiento. No representa una configuración instalada ni una marca comercial.', 'Línea 1 · Fin de línea', 'Fabricante ficticio', 'Operativa', hoy],
      ['DEM-104', 'Taponadora rotativa', 'Envasado', 'B', 'Equipo ilustrativo que muestra cómo un cabezal giratorio coloca y ajusta tapas sobre envases que avanzan en fila.', 'Línea 2 · Sala de envasado', 'Fabricante ficticio', 'En mantención', hoy],
      ['DEM-105', 'Bomba de trasiego', 'Destilación', 'A', 'Modelo conceptual de una bomba que traslada líquido entre estanques, útil para explicar caudal, presión y sentido de flujo.', 'Bodega de destilados', 'Fabricante ficticio', 'Operativa', hoy],
      ['DEM-106', 'Intercambiador de calor', 'Destilación', 'C', 'Ejemplo didáctico de dos circuitos que intercambian temperatura sin mezclarse, para explicar el principio de transferencia térmica.', 'Sala de destilación', 'Fabricante ficticio', 'Operativa', hoy]
    ];
    shM.getRange(2, 1, m.length, m[0].length).setValues(m);
  }

  const shG = ss.getSheetByName('Guias');
  if (shG.getLastRow() < 2) {
    const aviso = '\n## Aviso\n**Contenido ficticio.** No utilizar para operar, mantener ni intervenir equipos.';
    const g = [
      ['GUI-001', 'Principios de funcionamiento · Transportador modular', 'DEM-101', '1.0', 'Publicada',
        'Cómo una banda continua traslada envases entre módulos de la línea.',
        '## Propósito\nDescribir de forma conceptual cómo el transportador traslada envases entre dos módulos.\n## Principio de funcionamiento\nUna banda continua, impulsada por un motorreductor, avanza sobre apoyos que mantienen los envases alineados.\n- La velocidad de la banda marca el ritmo de toda la línea.\n- Las guías laterales evitan que los envases se desvíen.\n- Los sensores de presencia detienen el avance si se acumulan envases.' + aviso,
        'Editor Técnico', hoy],
      ['GUI-002', 'Principios de funcionamiento · Unidad de llenado', 'DEM-102', '0.3', 'Borrador',
        'Recorrido conceptual del líquido desde el depósito hasta cada recipiente.',
        '## Propósito\nExplicar el recorrido del líquido desde el depósito hasta los recipientes.\n## Principio de funcionamiento\nEl depósito superior alimenta un distribuidor que reparte el líquido en varias boquillas.\n- El nivel del depósito se mantiene estable.\n- Cada boquilla abre solo cuando detecta un envase.\n- El volumen se controla por tiempo o por nivel.' + aviso,
        'Editor Técnico', hoy],
      ['GUI-003', 'Principios de funcionamiento · Etiquetadora de envases', 'DEM-103', '1.1', 'Publicada',
        'Sincronía entre la bobina de etiquetas y el avance de los envases.',
        '## Propósito\nMostrar cómo se sincroniza la etiqueta con el envase en movimiento.\n## Principio de funcionamiento\nUna bobina libera etiquetas que se desprenden en un borde de pelado justo cuando pasa un envase.\n- Un sensor detecta el espacio entre etiquetas.\n- Otro sensor detecta la llegada del envase.\n- Rodillos presionan la etiqueta para fijarla.' + aviso,
        'Editor Técnico', hoy],
      ['GUI-004', 'Principios de funcionamiento · Bomba de trasiego', 'DEM-105', '0.1', 'Borrador',
        'Conceptos de caudal, presión y sentido de flujo entre estanques.',
        '## Propósito\nIntroducir los conceptos de caudal y presión al trasladar líquido entre estanques.\n## Principio de funcionamiento\nEl rotor de la bomba transfiere energía al líquido, que se desplaza desde la succión hacia la descarga.\n- La succión debe permanecer llena de líquido.\n- Las válvulas definen el sentido del trasiego.' + aviso,
        'Editor Técnico', hoy]
    ];
    shG.getRange(2, 1, g.length, g[0].length).setValues(g);
  }

  const shT = ss.getSheetByName('Tareas');
  if (shT.getLastRow() < 2) {
    const ahora = ahora_();
    const vence = function (dias) { return Utilities.formatDate(new Date(Date.now() + dias * 86400000), APP.ZONA, 'yyyy-MM-dd'); };
    const t = [
      ['TAR-001', 'Revisar guía del transportador modular', 'Validar que los pasos coincidan con la línea 1.', 'Pendiente', 'Alta', vence(2), 'editor@demo.cl', 'admin@demo.cl', ahora, ahora],
      ['TAR-002', 'Subir ficha técnica de la bomba de trasiego', '', 'En curso', 'Media', vence(5), 'editor@demo.cl', 'editor@demo.cl', ahora, ahora],
      ['TAR-003', 'Leer protocolo de la unidad de llenado', '', 'Pendiente', 'Baja', vence(7), 'lector@demo.cl', 'admin@demo.cl', ahora, ahora]
    ];
    shT.getRange(2, 1, t.length, t[0].length).setValues(t);
  }

  const shD = ss.getSheetByName('Documentos');
  if (shD.getLastRow() < 2) {
    const d = [];
    let n = 1;
    ['DEM-101', 'DEM-102', 'DEM-103', 'DEM-104', 'DEM-105', 'DEM-106'].forEach(function (mid) {
      d.push(['DOC-' + pad_(n++), 'Manual de operación ' + mid, mid, 'Manual de operación', '', '1.0', hoy]);
      d.push(['DOC-' + pad_(n++), 'Ficha técnica ' + mid, mid, 'Ficha técnica', '', '1.0', hoy]);
    });
    shD.getRange(2, 1, d.length, d[0].length).setValues(d);
  }
}

/* =====================================================================
 * AUTENTICACIÓN Y SESIONES
 * ===================================================================*/
function login(email) {
  try {
    email = String(email || '').trim().toLowerCase();
    if (!email) throw new Error('Ingresa tu correo corporativo.');

    const cache = CacheService.getScriptCache();
    const kf = 'f_' + email;
    const fallos = Number(cache.get(kf) || 0);
    if (fallos >= APP.MAX_INTENTOS) {
      throw new Error('Demasiados intentos. Espera ' + APP.BLOQUEO_MIN + ' minutos.');
    }

    const u = ssoPerfil_(email);
    cache.remove(kf);
    const usuario = publico_(u);
    const token = abrirSesion_(usuario);
    guardar_('Usuarios', { id: u.id, ultimoAcceso: ahora_() });
    log_(email, 'login', '');
    return JSON.stringify({ ok: true, token: token, usuario: usuario });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message });
  }
}

function ssoPerfil_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) throw new Error('Ingresa un correo electrónico válido.');
  validarDominio_(email);
  let u = leer_('Usuarios').find(function (x) { return x.email.toLowerCase() === email; });
  if (!u) {
    if (!APP.REGISTRO_ABIERTO) {
      throw new Error('La cuenta ' + email + ' no está registrada. Solicita acceso a un administrador.');
    }
    const nombre = formatearNombreEmail_(email);
    u = {
      id: 'USR-' + Date.now().toString(36).toUpperCase(),
      email: email,
      nombre: nombre,
      area: '',
      rol: 'lector',
      activo: 'SI',
      creado: ahora_(),
      ultimoAcceso: ahora_(),
      prefs: JSON.stringify(PREFS_DEFECTO)
    };
    guardar_('Usuarios', u);
    log_(email, 'registro sso', 'cuenta creada automáticamente (lector)');
  }
  if (u.activo !== 'SI') throw new Error('Tu cuenta está desactivada. Contacta al administrador.');
  return u;
}

function validarDominio_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) throw new Error('Ingresa un correo electrónico válido.');
  const permitidos = (APP.DOMINIOS_REGISTRO || []).map(function (d) { return d.toLowerCase(); });
  if (APP.MODO_DEMO && permitidos.indexOf('demo.cl') < 0) {
    permitidos.push('demo.cl');
  }
  if (permitidos.length === 0) return;
  const partes = email.split('@');
  const dom = partes.length > 1 ? partes[1].toLowerCase() : '';
  if (permitidos.indexOf(dom) < 0) {
    throw new Error('Dominio no autorizado (@' + dom + '). Usa tu cuenta corporativa.');
  }
}

function formatearNombreEmail_(email) {
  const usuario = email.split('@')[0];
  return usuario.split(/[\._\-]/).filter(Boolean).map(function (p) {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');
}

function validarSesion(token) {
  try {
    return JSON.stringify({ ok: true, usuario: sesion_(token) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message, expirada: true });
  }
}

function logout(token) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get('s_' + token);
    if (raw) log_(JSON.parse(raw).email, 'logout', '');
    cache.remove('s_' + token);
  } catch (e) { /* sin acción */ }
  return JSON.stringify({ ok: true });
}

function ttl_() { return Math.min(APP.SESION_HORAS, 6) * 3600; }

function abrirSesion_(usuario) {
  const cache = CacheService.getScriptCache();
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('s_' + token, JSON.stringify(usuario), ttl_());
  const lista = (cache.get('u_' + usuario.id) || '').split(',').filter(String);
  lista.push(token);
  cache.put('u_' + usuario.id, lista.slice(-5).join(','), ttl_());
  return token;
}

function sesion_(token) {
  if (!token) throw new Error('SESION_EXPIRADA');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('s_' + token);
  if (!raw) throw new Error('SESION_EXPIRADA');
  cache.put('s_' + token, raw, ttl_()); // renovación deslizante
  return JSON.parse(raw);
}

function cerrarSesionesDe_(idUsuario) {
  const cache = CacheService.getScriptCache();
  (cache.get('u_' + idUsuario) || '').split(',').filter(String)
    .forEach(function (t) { cache.remove('s_' + t); });
  cache.remove('u_' + idUsuario);
}


function publico_(u) {
  return { id: u.id, email: u.email, nombre: u.nombre, area: u.area, rol: u.rol };
}

const ACCIONES = {
  inicio:            ['lector', inicio_],
  buscar:            ['lector', buscar_],
  maquinas:          ['lector', function (d, u) { return catalogo_(u).M; }],
  maquina:           ['lector', verMaquina_],
  guardarMaquina:    ['editor', guardarMaquina_],
  eliminarMaquina:   ['admin',  eliminarMaquina_],
  guias:             ['lector', function (d, u) { return catalogo_(u).G.map(sinContenido_); }],
  guia:              ['lector', verGuia_],
  guardarGuia:       ['editor', guardarGuia_],
  eliminarGuia:      ['admin',  eliminarGuia_],
  documentos:        ['lector', function (d, u) { return catalogo_(u).D; }],
  documento:         ['lector', function (d) { return docPublico_(buscarPorId_('Documentos', d.id, 'El documento no existe.')); }],
  archivoDocumento:  ['lector', archivoDocumento_],
  guardarDocumento:  ['editor', guardarDocumento_],
  eliminarDocumento: ['admin',  eliminarDocumento_],
  perfil:            ['lector', perfil_],
  usuarios:          ['admin',  usuarios_],
  guardarUsuario:    ['admin',  guardarUsuario_],
  registro:          ['admin',  registro_],
  personas:          ['lector', personas_],
  tareas:            ['lector', tareas_],
  guardarTarea:      ['lector', guardarTarea_],
  moverTarea:        ['lector', moverTarea_],
  eliminarTarea:     ['lector', eliminarTarea_],
  reuniones:         ['lector', reuniones_],
  crearReunion:      ['lector', crearReunion_],
  cancelarReunion:   ['lector', cancelarReunion_],
  recordatorios:     ['lector', recordatorios_],
  guardarPrefs:      ['lector', guardarPrefs_]
};

function api(token, accion, datos) {
  try {
    const def = ACCIONES[accion];
    if (!def) throw new Error('Acción no válida.');
    const u = sesion_(token);
    if (ROLES[u.rol] < ROLES[def[0]]) throw new Error('No tienes permisos para realizar esta acción.');
    return JSON.stringify({ ok: true, data: def[1](datos || {}, u) });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message, expirada: e.message === 'SESION_EXPIRADA' });
  }
}

/* =====================================================================
 * CATÁLOGO
 * ===================================================================*/
function guiasVisibles_(u) {
  const g = leer_('Guias');
  return ROLES[u.rol] >= ROLES.editor ? g : g.filter(function (x) { return x.estado === 'Publicada'; });
}

function catalogo_(u) {
  const M = leer_('Maquinas'), G = guiasVisibles_(u), D = leer_('Documentos');
  const mapa = {};
  M.forEach(function (m) { mapa[m.id] = m; });
  M.forEach(function (m) {
    m.nGuias = G.filter(function (g) { return g.maquinaId === m.id; }).length;
    m.nDocs = D.filter(function (d) { return d.maquinaId === m.id; }).length;
  });
  G.forEach(function (g) {
    const m = mapa[g.maquinaId] || {};
    g.maquinaNombre = m.nombre || '—';
    g.area = m.area || '—';
  });
  const docs = D.map(function (d) {
    const p = docPublico_(d);
    p.maquinaNombre = (mapa[d.maquinaId] || {}).nombre || '—';
    return p;
  });
  return { M: M, G: G, D: docs };
}

function sinContenido_(g) {
  const c = Object.assign({}, g);
  delete c.contenido;
  return c;
}

function inicio_(d, u) {
  const c = catalogo_(u);
  const guias = c.G.slice().sort(function (a, b) {
    return (a.estado === 'Publicada' ? 0 : 1) - (b.estado === 'Publicada' ? 0 : 1);
  });
  return {
    stats: {
      maquinas: c.M.length,
      guias: c.G.length,
      documentos: c.D.length,
      claseA: c.M.filter(function (m) { return m.clase === 'A'; }).length
    },
    maquinas: c.M.slice(0, 3),
    guias: guias.slice(0, 3).map(sinContenido_),
    tareas: tareas_({}, u).filter(function (t) { return t.asignadoA === u.email && t.estado !== 'Completada'; })
      .sort(function (a, b) { return (a.vence || '9').localeCompare(b.vence || '9'); }).slice(0, 4),
    reuniones: (function () {
      try {
        const desde = new Date();
        return eventos_(desde, new Date(desde.getTime() + 14 * 86400000), u)
          .filter(function (e) { return new Date(e.fin) > desde; }).slice(0, 3);
      } catch (e) { return []; }
    })()
  };
}

function buscar_(d, u) {
  const q = norm_(d.q);
  if (q.length < 2) throw new Error('Escribe al menos 2 caracteres.');
  const c = catalogo_(u);
  const hay = function (o, campos) {
    return campos.some(function (k) { return norm_(o[k]).indexOf(q) >= 0; });
  };
  return {
    maquinas: c.M.filter(function (m) { return hay(m, ['id', 'nombre', 'area', 'descripcion', 'ubicacion']); }),
    guias: c.G.filter(function (g) { return hay(g, ['id', 'titulo', 'resumen', 'contenido', 'maquinaId']); }).map(sinContenido_),
    documentos: c.D.filter(function (x) { return hay(x, ['id', 'titulo', 'tipo', 'maquinaId']); })
  };
}

function verMaquina_(d, u) {
  const c = catalogo_(u);
  const m = c.M.find(function (x) { return x.id === d.id; });
  if (!m) throw new Error('La máquina no existe.');
  return {
    maquina: m,
    guias: c.G.filter(function (g) { return g.maquinaId === m.id; }).map(sinContenido_),
    documentos: c.D.filter(function (x) { return x.maquinaId === m.id; })
  };
}

function guardarMaquina_(d, u) {
  const id = String(d.id || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(id)) throw new Error('Código inválido. Usa mayúsculas, números y guiones (ej. DEM-107).');
  const existe = leer_('Maquinas').some(function (m) { return m.id === id; });
  if (d.nuevo && existe) throw new Error('Ya existe una máquina con el código ' + id + '.');
  if (!d.nuevo && !existe) throw new Error('La máquina no existe.');
  if (['A', 'B', 'C'].indexOf(d.clase) < 0) throw new Error('Selecciona una clase válida.');

  guardar_('Maquinas', {
    id: id,
    nombre: txt_(d.nombre, 120, true, 'nombre'),
    area: txt_(d.area, 60, true, 'área'),
    clase: d.clase,
    descripcion: txt_(d.descripcion, 600, true, 'descripción'),
    ubicacion: txt_(d.ubicacion, 120),
    fabricante: txt_(d.fabricante, 120),
    estado: txt_(d.estado, 40) || 'Operativa',
    actualizado: hoy_()
  });
  log_(u.email, d.nuevo ? 'crear máquina' : 'editar máquina', id);
  return { id: id };
}

function eliminarMaquina_(d, u) {
  const tiene = leer_('Guias').some(function (g) { return g.maquinaId === d.id; }) ||
                leer_('Documentos').some(function (x) { return x.maquinaId === d.id; });
  if (tiene) throw new Error('Esta máquina tiene guías o documentos asociados. Elimínalos primero.');
  borrar_('Maquinas', d.id);
  log_(u.email, 'eliminar máquina', d.id);
  return true;
}

function verGuia_(d, u) {
  const g = catalogo_(u).G.find(function (x) { return x.id === d.id; });
  if (!g) throw new Error('La guía no existe o aún no está publicada.');
  return g;
}

function guardarGuia_(d, u) {
  if (!leer_('Maquinas').some(function (m) { return m.id === d.maquinaId; })) throw new Error('Selecciona una máquina válida.');
  if (ESTADOS_GUIA.indexOf(d.estado) < 0) throw new Error('Estado no válido.');
  const nuevo = !d.id;
  if (!nuevo) buscarPorId_('Guias', d.id, 'La guía no existe.');
  const id = nuevo ? siguienteId_('Guias', 'GUI') : d.id;
  const obj = {
    id: id,
    titulo: txt_(d.titulo, 160, true, 'título'),
    maquinaId: d.maquinaId,
    version: txt_(d.version, 12, true, 'versión'),
    estado: d.estado,
    resumen: txt_(d.resumen, 300),
    contenido: txt_(d.contenido, 20000, true, 'contenido'),
    actualizado: hoy_()
  };
  if (nuevo) obj.autor = u.nombre;
  guardar_('Guias', obj);
  log_(u.email, nuevo ? 'crear guía' : 'editar guía', id);
  return { id: id };
}

function eliminarGuia_(d, u) {
  borrar_('Guias', d.id);
  log_(u.email, 'eliminar guía', d.id);
  return true;
}

function guardarDocumento_(d, u) {
  if (!leer_('Maquinas').some(function (m) { return m.id === d.maquinaId; })) throw new Error('Selecciona una máquina válida.');
  const url = txt_(d.url, 500);
  if (url && !/^https:\/\//i.test(url)) throw new Error('El enlace debe comenzar con https://');
  const nuevo = !d.id;
  const previo = nuevo ? null : buscarPorId_('Documentos', d.id, 'El documento no existe.');
  const fila = {
    titulo: txt_(d.titulo, 160, true, 'título'),
    maquinaId: d.maquinaId,
    tipo: txt_(d.tipo, 60, true, 'tipo'),
    url: url,
    version: txt_(d.version, 12) || '1.0',
    actualizado: hoy_()
  };
  const blob = d.archivo ? blobArchivo_(d.archivo) : null;
  fila.id = nuevo ? siguienteId_('Documentos', 'DOC') : d.id;

  // El binario va a la carpeta protegida de Drive; en la hoja solo quedan los metadatos
  let creado = null;
  if (blob) {
    creado = carpetaDocs_().createFile(blob);
    creado.setDescription(fila.id + ' · ' + fila.titulo);
    fila.fileId = creado.getId();
    fila.nombreArchivo = blob.getName();
    fila.mimeType = blob.getContentType();
    fila.tamano = String(blob.getBytes().length);
    fila.autor = u.email;
  }
  try {
    guardar_('Documentos', fila);
  } catch (e) {
    if (creado) creado.setTrashed(true);
    throw e;
  }
  if (creado && previo && previo.fileId) papelera_(previo.fileId);
  log_(u.email, nuevo ? 'crear documento' : 'editar documento', fila.id + (blob ? ' (archivo: ' + fila.nombreArchivo + ')' : ''));
  return { id: fila.id };
}

function eliminarDocumento_(d, u) {
  const doc = buscarPorId_('Documentos', d.id, 'El documento no existe.');
  borrar_('Documentos', d.id);
  if (doc.fileId) papelera_(doc.fileId);
  log_(u.email, 'eliminar documento', d.id);
  return true;
}

// Entrega controlada: el usuario nunca recibe acceso a Drive, solo el contenido vía la intranet
function archivoDocumento_(d, u) {
  const doc = buscarPorId_('Documentos', d.id, 'El documento no existe.');
  if (!doc.fileId) throw new Error('Este documento no tiene un archivo adjunto.');
  let file;
  try {
    file = DriveApp.getFileById(doc.fileId);
    if (file.isTrashed()) file = null;
  } catch (e) {
    file = null;
  }
  if (!file) throw new Error('No se encontró el archivo en el repositorio. Avisa a un administrador.');
  const blob = file.getBlob();
  log_(u.email, 'ver documento', doc.id);
  return {
    nombre: doc.nombreArchivo || file.getName(),
    mime: doc.mimeType || blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function docPublico_(d) {
  const p = Object.assign({}, d, { archivo: !!d.fileId });
  delete p.fileId;
  return p;
}

function carpetaDocs_() {
  const id = PropertiesService.getScriptProperties().getProperty('DOCS_FOLDER_ID');
  if (!id) throw new Error('El repositorio de documentos no está configurado. Ejecuta inicializar() en el editor.');
  return DriveApp.getFolderById(id);
}

// Valida nombre, extensión y tamaño declarado. No toca servicios de Google (se prueba con Node).
function validarArchivo_(a) {
  if (!a || typeof a !== 'object') throw new Error('Adjunta un archivo válido.');
  const nombre = txt_(a.nombre, 180, true, 'archivo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  const ext = ((nombre.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const tipos = ARCHIVOS_PERMITIDOS[ext];
  if (!tipos) throw new Error('Tipo de archivo no permitido. Usa PDF, imágenes (PNG, JPG, WEBP), Word, Excel, PowerPoint o DWG.');
  const base64 = String(a.base64 || '').replace(/\s/g, '');
  if (!base64) throw new Error('El archivo está vacío.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('El archivo llegó dañado. Vuelve a intentarlo.');
  const bytes = Math.floor(base64.length * 3 / 4) - (base64.match(/=+$/) || [''])[0].length;
  if (bytes > APP.MAX_ARCHIVO_MB * 1024 * 1024) throw new Error('El archivo supera el máximo de ' + APP.MAX_ARCHIVO_MB + ' MB.');
  const mime = String(a.mime || '').toLowerCase();
  return { nombre: nombre, ext: ext, mime: tipos.indexOf(mime) >= 0 ? mime : tipos[0], base64: base64 };
}

// Comprueba la firma de los formatos que la intranet muestra en su visor
function firmaValida_(ext, bytes) {
  const b = function (i) { return bytes[i] & 0xFF; };
  if (ext === 'pdf') return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
  if (ext === 'png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47;
  if (ext === 'jpg' || ext === 'jpeg') return b(0) === 0xFF && b(1) === 0xD8;
  if (ext === 'webp') return b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46;
  return true;
}

function blobArchivo_(a) {
  const v = validarArchivo_(a);
  const bytes = Utilities.base64Decode(v.base64);
  if (!firmaValida_(v.ext, bytes)) throw new Error('El contenido del archivo no corresponde a su extensión (.' + v.ext + ').');
  return Utilities.newBlob(bytes, v.mime, v.nombre);
}

function papelera_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); }
  catch (e) { log_('sistema', 'error al enviar archivo a la papelera', fileId + ': ' + e.message); }
}

/* =====================================================================
 * PERFIL Y USUARIOS
 * ===================================================================*/
function perfil_(d, u) {
  const r = buscarPorId_('Usuarios', u.id, 'Usuario no encontrado.');
  return Object.assign(publico_(r), { creado: r.creado, ultimoAcceso: r.ultimoAcceso, prefs: prefs_(r) });
}


function usuarios_() {
  return leer_('Usuarios').map(function (r) {
    return Object.assign(publico_(r), { activo: r.activo, creado: r.creado, ultimoAcceso: r.ultimoAcceso });
  });
}

function guardarUsuario_(d, u) {
  if (!ROLES[d.rol]) throw new Error('Selecciona un rol válido.');
  const nombre = txt_(d.nombre, 80, true, 'nombre');
  const area = txt_(d.area, 60);

  if (!d.id) {
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo corporativo no válido.');
    validarDominio_(email);
    if (leer_('Usuarios').some(function (x) { return x.email.toLowerCase() === email; })) {
      throw new Error('Ya existe un usuario con ese correo.');
    }
    guardar_('Usuarios', {
      id: 'USR-' + Date.now().toString(36).toUpperCase(),
      email: email, nombre: nombre, area: area, rol: d.rol,
      activo: 'SI', creado: ahora_(), ultimoAcceso: ''
    });
    log_(u.email, 'crear usuario', email + ' (' + d.rol + ')');
    return true;
  }

  const t = buscarPorId_('Usuarios', d.id, 'Usuario no encontrado.');
  const activo = d.activo === 'NO' ? 'NO' : 'SI';
  if (t.id === u.id && (d.rol !== 'admin' || activo === 'NO')) {
    throw new Error('No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.');
  }
  guardar_('Usuarios', { id: t.id, nombre: nombre, area: area, rol: d.rol, activo: activo });
  if (t.id !== u.id) cerrarSesionesDe_(t.id);
  log_(u.email, 'editar usuario', t.email + ' → ' + d.rol + ' / ' + activo);
  return true;
}


function registro_() {
  return leer_('Registro').slice(-60).reverse();
}


/* =====================================================================
 * ACCESO A DATOS
 * ===================================================================*/
let _db = null;
const _memo = {};

function db_() {
  if (_db) return _db;
  const id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  if (!id) throw new Error('La base de datos no está configurada. Ejecuta inicializar() en el editor.');
  _db = SpreadsheetApp.openById(id);
  return _db;
}

function leer_(hoja) {
  if (!_memo[hoja]) _memo[hoja] = leerCache_(hoja) || leerHoja_(hoja);
  return _memo[hoja].map(function (o) { return Object.assign({}, o); });
}

// Lee la hoja por nombre de columna y devuelve solo las columnas del ESQUEMA (todo como texto)
function leerHoja_(hoja) {
  const version = versionHoja_(hoja); // se toma antes de leer, para no cachear datos más nuevos con una versión vieja
  const v = db_().getSheetByName(hoja).getDataRange().getValues();
  const cab = v.shift().map(String);
  const cols = ESQUEMA[hoja];
  const pos = cols.map(function (c) { return cab.indexOf(c); });
  const filas = v.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    cols.forEach(function (k, i) {
      const x = pos[i] < 0 ? '' : r[pos[i]];
      o[k] = x instanceof Date ? Utilities.formatDate(x, APP.ZONA, 'yyyy-MM-dd') : String(x);
    });
    return o;
  });
  guardarCache_(hoja, version, filas);
  return filas;
}

function buscarPorId_(hoja, id, msg) {
  const r = leer_(hoja).find(function (x) { return x.id === String(id); });
  if (!r) throw new Error(msg || 'Registro no encontrado.');
  return r;
}

// Inserta o actualiza por id. Escribe por nombre de columna: el orden de la hoja no importa
// y las columnas que no están en el ESQUEMA se dejan intactas.
function guardar_(hoja, obj) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = db_().getSheetByName(hoja);
    const cols = ESQUEMA[hoja];
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const faltan = cols.filter(function (c) { return obj[c] !== undefined && cab.indexOf(c) < 0; });
    if (faltan.length) {
      throw new Error('La hoja ' + hoja + ' no tiene las columnas ' + faltan.join(', ') + '. Ejecuta inicializar() en el editor.');
    }
    const valor = function (c, actual) {
      return cols.indexOf(c) >= 0 && obj[c] !== undefined ? seguro_(obj[c]) : actual;
    };
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); });
    const idx = ids.indexOf(String(obj.id));
    if (idx > 0) {
      const rango = sh.getRange(idx + 1, 1, 1, cab.length);
      const actual = rango.getValues()[0];
      rango.setValues([cab.map(function (c, i) { return valor(c, actual[i]); })]);
    } else {
      sh.appendRow(cab.map(function (c) { return valor(c, ''); }));
    }
    SpreadsheetApp.flush();
    invalidarHoja_(hoja);
  } finally {
    lock.releaseLock();
  }
}

function borrar_(hoja, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = db_().getSheetByName(hoja);
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); });
    const idx = ids.indexOf(String(id));
    if (idx < 1) throw new Error('Registro no encontrado.');
    sh.deleteRow(idx + 1);
    SpreadsheetApp.flush();
    invalidarHoja_(hoja);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Caché de lecturas entre ejecuciones ----------
 * Cada hoja tiene una versión en CacheService. Escribir cambia la versión, así que las
 * lecturas cacheadas con la versión anterior dejan de usarse. Los datos se guardan en
 * trozos porque CacheService acepta como máximo 100 KB por valor. */
function versionHoja_(hoja) {
  if (HOJAS_CACHE.indexOf(hoja) < 0) return null;
  try { return CacheService.getScriptCache().get('dbv_' + hoja) || '0'; }
  catch (e) { return null; }
}

function claveCache_(hoja, version) {
  return 'db_' + hoja + '_' + version;
}

function leerCache_(hoja) {
  const version = versionHoja_(hoja);
  if (version === null) return null;
  try {
    const cache = CacheService.getScriptCache();
    const base = claveCache_(hoja, version);
    const n = Number(cache.get(base + '_n') || 0);
    if (!n) return null;
    const claves = [];
    for (let i = 0; i < n; i++) claves.push(base + '_' + i);
    const partes = cache.getAll(claves);
    let json = '';
    for (let i = 0; i < n; i++) {
      if (partes[claves[i]] == null) return null;
      json += partes[claves[i]];
    }
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function trozos_(texto, largo) {
  const out = [];
  let i = 0;
  while (i < texto.length) {
    let fin = Math.min(i + largo, texto.length);
    const c = texto.charCodeAt(fin - 1);
    if (fin < texto.length && c >= 0xD800 && c <= 0xDBFF) fin--; // no partir un emoji en dos
    out.push(texto.slice(i, fin));
    i = fin;
  }
  return out.length ? out : [''];
}

function guardarCache_(hoja, version, filas) {
  if (version === null) return;
  try {
    // 30.000 caracteres ≤ 90 KB aun si todos ocupan 3 bytes en UTF-8
    const partes = trozos_(JSON.stringify(filas), 30000);
    if (partes.length > 30) return; // hoja muy grande: no vale la pena cachearla
    const cache = CacheService.getScriptCache();
    const base = claveCache_(hoja, version);
    const valores = {};
    partes.forEach(function (p, i) { valores[base + '_' + i] = p; });
    cache.putAll(valores, CACHE_HOJA_SEG);
    cache.put(base + '_n', String(partes.length), CACHE_HOJA_SEG); // al final: nunca se lee un caché a medias
  } catch (e) { /* el caché es opcional */ }
}

function invalidarHoja_(hoja) {
  delete _memo[hoja];
  if (HOJAS_CACHE.indexOf(hoja) < 0) return;
  try {
    const cache = CacheService.getScriptCache();
    const anterior = cache.get('dbv_' + hoja) || '0';
    cache.remove(claveCache_(hoja, anterior) + '_n');
    cache.put('dbv_' + hoja, Utilities.getUuid(), 21600);
  } catch (e) { /* si falla, el caché expira solo en CACHE_HOJA_SEG */ }
}

function siguienteId_(hoja, prefijo) {
  const max = leer_(hoja).reduce(function (m, r) {
    const n = parseInt(String(r.id).replace(prefijo + '-', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefijo + '-' + pad_(max + 1);
}

function log_(email, accion, detalle) {
  try {
    db_().getSheetByName('Registro').appendRow([ahora_(), seguro_(email), accion, seguro_(detalle || '')]);
  } catch (e) { /* el registro nunca debe romper la acción principal */ }
}

/* =====================================================================
 * UTILIDADES
 * ===================================================================*/
function txt_(v, max, requerido, etiqueta) {
  const s = String(v == null ? '' : v).trim();
  if (requerido && !s) throw new Error('El campo ' + etiqueta + ' es obligatorio.');
  return s.slice(0, max);
}

// Evita que un texto se interprete como fórmula en la hoja
function seguro_(v) {
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pad_(n) { return String(n).padStart(3, '0'); }
function hoy_() { return Utilities.formatDate(new Date(), APP.ZONA, 'yyyy-MM-dd'); }
function ahora_() { return Utilities.formatDate(new Date(), APP.ZONA, 'yyyy-MM-dd HH:mm'); }

/* =====================================================================
 * REGISTRO DE USUARIOS
 * ===================================================================*/
function registrarse(d) {
  try {
    if (!APP.REGISTRO_ABIERTO) throw new Error('El registro está cerrado. Pide una cuenta al administrador.');
    d = d || {};
    const nombre = txt_(d.nombre, 80, true, 'nombre');
    const area = txt_(d.area, 60);
    const email = String(d.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo corporativo no válido.');
    validarDominio_(email);

    const cache = CacheService.getScriptCache();
    const intentos = Number(cache.get('reg_' + email) || 0);
    if (intentos >= 3) throw new Error('Demasiados intentos. Espera unos minutos.');
    cache.put('reg_' + email, String(intentos + 1), 10 * 60);

    if (leer_('Usuarios').some(function (x) { return x.email.toLowerCase() === email; })) {
      throw new Error('Ya existe una cuenta con ese correo. Inicia sesión.');
    }
    const nuevo = {
      id: 'USR-' + Date.now().toString(36).toUpperCase(),
      email: email, nombre: nombre, area: area, rol: 'lector',
      activo: 'SI', creado: ahora_(), ultimoAcceso: ahora_(), prefs: JSON.stringify(PREFS_DEFECTO)
    };
    guardar_('Usuarios', nuevo);
    log_(email, 'registro', 'cuenta creada (lector)');
    const usuario = publico_(nuevo);
    return JSON.stringify({ ok: true, token: abrirSesion_(usuario), usuario: usuario });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message });
  }
}

/* =====================================================================
 * PREFERENCIAS Y PERSONAS
 * ===================================================================*/
function prefs_(r) {
  let p = {};
  try { p = JSON.parse(r.prefs || '{}'); } catch (e) {}
  return Object.assign({}, PREFS_DEFECTO, p);
}

function guardarPrefs_(d, u) {
  const limpia = {
    recordatorio: [0, 5, 10, 15, 30].indexOf(Number(d.recordatorio)) >= 0 ? Number(d.recordatorio) : 10,
    avisoTareas: !!d.avisoTareas
  };
  guardar_('Usuarios', { id: u.id, prefs: JSON.stringify(limpia) });
  return limpia;
}

/** Personas activas a las que se puede asignar una tarea o invitar a una reunión. */
function personas_() {
  return leer_('Usuarios').filter(function (r) { return r.activo === 'SI'; })
    .map(function (r) { return { email: r.email, nombre: r.nombre, area: r.area }; })
    .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
}

/* =====================================================================
 * TAREAS
 * ===================================================================*/
function tareas_(d, u) {
  const nombres = {};
  leer_('Usuarios').forEach(function (r) { nombres[r.email] = r.nombre; });
  return leer_('Tareas')
    .filter(function (t) { return t.asignadoA === u.email || t.creadoPor === u.email; })
    .map(function (t) {
      t.asignadoNombre = nombres[t.asignadoA] || t.asignadoA;
      t.creadorNombre = nombres[t.creadoPor] || t.creadoPor;
      return t;
    });
}

function guardarTarea_(d, u) {
  const asignado = String(d.asignadoA || u.email).trim().toLowerCase();
  const destino = leer_('Usuarios').find(function (r) { return r.email === asignado && r.activo === 'SI'; });
  if (!destino) throw new Error('Selecciona un responsable válido.');
  if (PRIORIDADES.indexOf(d.prioridad) < 0) throw new Error('Selecciona una prioridad válida.');
  const vence = String(d.vence || '');
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw new Error('Fecha de vencimiento no válida.');
  const t = {
    id: siguienteId_('Tareas', 'TAR'),
    titulo: txt_(d.titulo, 160, true, 'título'),
    descripcion: txt_(d.descripcion, 1000),
    estado: 'Pendiente',
    prioridad: d.prioridad,
    vence: vence,
    asignadoA: asignado,
    creadoPor: u.email,
    creado: ahora_(),
    actualizado: ahora_()
  };
  guardar_('Tareas', t);
  log_(u.email, 'crear tarea', t.id + ' → ' + asignado);
  if (d.notificar && asignado !== u.email) avisarTarea_(t, u, destino);
  return { id: t.id };
}

function puedeTarea_(t, u) {
  return t.asignadoA === u.email || t.creadoPor === u.email || ROLES[u.rol] >= ROLES.admin;
}

function moverTarea_(d, u) {
  if (ESTADOS_TAREA.indexOf(d.estado) < 0) throw new Error('Estado no válido.');
  const t = buscarPorId_('Tareas', d.id, 'La tarea no existe.');
  if (!puedeTarea_(t, u)) throw new Error('Solo el responsable o quien creó la tarea puede cambiarla.');
  guardar_('Tareas', { id: t.id, estado: d.estado, actualizado: ahora_() });
  log_(u.email, 'mover tarea', t.id + ' → ' + d.estado);
  return true;
}

function eliminarTarea_(d, u) {
  const t = buscarPorId_('Tareas', d.id, 'La tarea no existe.');
  if (t.creadoPor !== u.email && ROLES[u.rol] < ROLES.admin) throw new Error('Solo quien creó la tarea puede eliminarla.');
  borrar_('Tareas', t.id);
  log_(u.email, 'eliminar tarea', t.id);
  return true;
}

function avisarTarea_(t, u, destino) {
  try {
    if (!prefs_(destino).avisoTareas) return;
    MailApp.sendEmail({
      to: t.asignadoA,
      subject: 'Nueva tarea asignada: ' + t.titulo,
      body: u.nombre + ' te asignó una tarea en la intranet de Pisquera de Chile.\n\n' +
            t.titulo + '\nPrioridad: ' + t.prioridad + (t.vence ? '\nVence: ' + t.vence : '') +
            '\n\nRevísala aquí: ' + ScriptApp.getService().getUrl()
    });
  } catch (e) { /* el aviso nunca debe impedir crear la tarea */ }
}

/* =====================================================================
 * REUNIONES 
 * ===================================================================*/
function calendario_() {
  const id = PropertiesService.getScriptProperties().getProperty('CAL_ID');
  const cal = id && CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('El calendario del equipo no está configurado. Ejecuta inicializar() en el editor.');
  return cal;
}

function eventos_(desde, hasta, u) {
  const cal = calendario_();
  return cal.getEvents(desde, hasta).map(function (ev) {
    const invitados = ev.getGuestList().map(function (g) { return String(g.getEmail()).toLowerCase(); });
    const creador = String(ev.getTag('creadoPor') || '').toLowerCase();
    const texto = (ev.getLocation() || '') + ' ' + (ev.getDescription() || '');
    const meet = (texto.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i) || [''])[0];
    return {
      id: ev.getId(),
      titulo: ev.getTitle() || '(Sin título)',
      inicio: ev.getStartTime().toISOString(),
      fin: ev.getEndTime().toISOString(),
      todoElDia: ev.isAllDayEvent(),
      lugar: ev.getLocation(),
      descripcion: ev.getDescription(),
      participantes: invitados.length,
      meet: meet,
      soyInvitado: invitados.indexOf(u.email) >= 0,
      organizo: creador === u.email,
      creador: creador
    };
  });
}

function reuniones_(d, u) {
  const desde = new Date(d.desde), hasta = new Date(d.hasta);
  if (isNaN(desde) || isNaN(hasta) || hasta <= desde) throw new Error('Rango de fechas no válido.');
  if (hasta - desde > 62 * 86400000) throw new Error('El rango no puede superar dos meses.');
  return eventos_(desde, hasta, u);
}

function crearReunion_(d, u) {
  const titulo = txt_(d.titulo, 160, true, 'título');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) throw new Error('Selecciona una fecha.');
  const inicio = Utilities.parseDate(d.fecha + ' ' + d.horaInicio, APP.ZONA, 'yyyy-MM-dd HH:mm');
  const fin = Utilities.parseDate(d.fecha + ' ' + d.horaFin, APP.ZONA, 'yyyy-MM-dd HH:mm');
  if (!(fin > inicio)) throw new Error('La hora de término debe ser posterior a la de inicio.');
  const invitados = String(d.invitados || '').toLowerCase().split(/[,;\s]+/)
    .filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); });
  if (invitados.indexOf(u.email) < 0) invitados.unshift(u.email);
  if (invitados.length > 50) throw new Error('Máximo 50 invitados.');
  const ev = calendario_().createEvent(titulo, inicio, fin, {
    description: txt_(d.descripcion, 2000) + '\n\nAgendada por ' + u.nombre + ' desde la intranet.',
    location: txt_(d.lugar, 160),
    guests: invitados.join(','),
    sendInvites: true
  });
  ev.setTag('creadoPor', u.email);
  log_(u.email, 'agendar reunión', titulo + ' (' + d.fecha + ')');
  return true;
}

function cancelarReunion_(d, u) {
  const ev = calendario_().getEventById(String(d.id || ''));
  if (!ev) throw new Error('La reunión ya no existe.');
  const creador = String(ev.getTag('creadoPor') || '').toLowerCase();
  if (creador !== u.email && ROLES[u.rol] < ROLES.admin) throw new Error('Solo quien agendó la reunión puede cancelarla.');
  log_(u.email, 'cancelar reunión', ev.getTitle());
  ev.deleteEvent();
  return true;
}

function recordatorios_(d, u) {
  const r = buscarPorId_('Usuarios', u.id, 'Usuario no encontrado.');
  const minutos = prefs_(r).recordatorio;
  if (!minutos) return { minutos: 0, eventos: [] };
  const desde = new Date();
  let eventos = [];
  try {
    eventos = eventos_(desde, new Date(desde.getTime() + 86400000), u)
      .filter(function (e) { return !e.todoElDia && (e.soyInvitado || e.organizo); });
  } catch (e) {}
  return { minutos: minutos, eventos: eventos };
}