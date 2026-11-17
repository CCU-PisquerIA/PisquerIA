// Reserva correlativos bajo bloqueo. Los números consumidos no se reutilizan tras fallos o borrados.
function siguienteId_(hoja, prefijo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    const clave = 'SEQUENCE_' + props.getProperty('DB_ID') + '_' + hoja + '_' + prefijo;
    const guardado = Number(props.getProperty(clave) || 0);
    if (!Number.isSafeInteger(guardado) || guardado < 0) throw new Error('Contador no válido. Contacta al administrador.');
    // La lectura directa evita que una caché antigua ignore registros creados en otra ejecución.
    const filas = db_().getSheetByName(hoja).getDataRange().getValues();
    const columna = filas.shift().map(String).indexOf('id');
    if (columna < 0) throw new Error('La hoja no tiene una columna de identificación válida.');
    const inicio = prefijo + '-';
    const max = filas.reduce(function (mayor, fila) {
      const id = String(fila[columna] || '');
      if (id.indexOf(inicio) !== 0 || !/^\d+$/.test(id.slice(inicio.length))) return mayor;
      const numero = Number(id.slice(inicio.length));
      return Number.isSafeInteger(numero) ? Math.max(mayor, numero) : mayor;
    }, guardado);
    if (max >= Number.MAX_SAFE_INTEGER) throw new Error('Se agotó el rango de identificadores.');
    props.setProperty(clave, String(max + 1));
    return inicio + pad_(max + 1);
  } finally {
    lock.releaseLock();
  }
}
