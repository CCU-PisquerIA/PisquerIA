function verGuia_(d, u) {
  const g = catalogo_(u).G.find(function (x) { return x.id === d.id; });
  if (!g) throw new Error('La guía no existe o aún no está publicada.');
  g.documento = null;
  if (g.documentoId) {
    const documento = leer_('Documentos').find(function (x) { return x.id === g.documentoId; });
    if (documento && mismaClasificacion_(g, documento)) g.documento = docPublico_(documento);
  }
  return g;
}

function guardarGuia_(d, u) {
  const clasificacion = clasificacionDocumental_(d);
  const nuevo = !d.id;
  const previa = nuevo ? {} : buscarPorId_('Guias', d.id, 'La guía no existe.');
  const estado = opcionValida_('estadosGuia', d.estado, previa.estado, 'Estado no válido.');
  const documentoId = txt_(d.documentoId === undefined ? previa.documentoId : d.documentoId, 40);
  if (documentoId) validarDocumentoGuia_(documentoId, clasificacion);
  const revision = d.revisionTecnica === undefined ? previa.revisionTecnica : d.revisionTecnica;
  if (revision && REVISIONES_GUIA.indexOf(revision) < 0) throw new Error('Selecciona un estado de revisión técnica válido.');
  const id = nuevo ? siguienteId_('Guias', 'GUI') : d.id;
  const obj = {
    id: id,
    titulo: txt_(d.titulo, 160, true, 'título'),
    maquinaId: clasificacion.maquinaId,
    alcance: clasificacion.alcance,
    documentoId: documentoId,
    revisionTecnica: revisionTecnicaGuia_(revision),
    version: txt_(d.version, 12, true, 'versión'),
    estado: estado,
    resumen: txt_(d.resumen, 300),
    contenido: txt_(d.contenido, 20000, true, 'contenido'),
    actualizado: hoy_()
  };
  if (nuevo) obj.autor = u.nombre;
  guardar_('Guias', obj);
  log_(u.email, nuevo ? 'crear guía' : 'editar guía', id);
  return { id: id };
}

