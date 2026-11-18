/* =====================================================================
 * GUÍAS DE FUNCIONAMIENTO
 * Igual que Documentación: título, máquina, resumen y un archivo opcional en la
 * carpeta protegida de Drive. El archivo se entrega solo vía api('archivoGuia').
 * ===================================================================*/
function verGuia_(d, u) {
  const g = catalogo_(u).G.find(function (x) { return x.id === d.id; });
  if (!g) throw new Error('La guía no existe.');
  return g;
}

function guardarGuia_(d, u) {
  const maquinaId = txt_(d.maquinaId, 20);
  if (!leer_('Maquinas').some(function (m) { return m.id === maquinaId; })) throw new Error('Selecciona una máquina válida.');
  const nuevo = !d.id;
  const previa = nuevo ? null : buscarPorId_('Guias', d.id, 'La guía no existe.');
  const fila = {
    titulo: txt_(d.titulo, 160, true, 'título'),
    maquinaId: maquinaId,
    resumen: txt_(d.resumen, 300, true, 'resumen'),
    actualizado: hoy_()
  };
  const blob = d.archivo ? blobArchivo_(d.archivo) : null;
  fila.id = nuevo ? siguienteId_('Guias', 'GUI') : previa.id;
  if (nuevo) fila.autor = u.nombre;

  const creado = blob ? adjuntarArchivo_(blob, fila) : null;
  try {
    guardar_('Guias', fila);
  } catch (e) {
    if (creado) creado.setTrashed(true);
    throw e;
  }
  if (creado && previa && previa.fileId) papelera_(previa.fileId);
  log_(u.email, nuevo ? 'crear guía' : 'editar guía', fila.id + (blob ? ' (archivo: ' + fila.nombreArchivo + ')' : ''));
  return { id: fila.id };
}

function eliminarGuia_(d, u) {
  const g = buscarPorId_('Guias', d.id, 'La guía no existe.');
  borrar_('Guias', g.id);
  if (g.fileId) papelera_(g.fileId);
  log_(u.email, 'eliminar guía', g.id);
  return true;
}

function archivoGuia_(d, u) {
  const g = buscarPorId_('Guias', d.id, 'La guía no existe.');
  if (!g.fileId) throw new Error('Esta guía no tiene un archivo adjunto.');
  log_(u.email, 'ver guía', g.id);
  return entregarArchivo_(g);
}
