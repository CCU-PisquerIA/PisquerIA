// La inicialización exige identidad Google del responsable que ejecuta el proyecto.
function exigirInicializacion_() {
  const activo = correoActivo_();
  let responsable = '';
  try { responsable = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (e) { /* sin identidad verificable: acceso denegado */ }
  if (!activo || !responsable || activo !== responsable) {
    throw new Error('Solo la cuenta responsable del proyecto puede inicializar sus recursos.');
  }
}

function inicializar() {
  exigirInicializacion_();
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

