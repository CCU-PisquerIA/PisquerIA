// Publicación para consulta y revisión técnica son procesos diferentes.
const REVISIONES_GUIA = ['Pendiente de revisión', 'En revisión'];

function revisionTecnicaGuia_(valor) {
  return REVISIONES_GUIA.indexOf(valor) >= 0 ? valor : REVISIONES_GUIA[0];
}

function clasificacionDocumental_(datos) {
  const maquinaId = txt_(datos.maquinaId, 20);
  if (maquinaId) {
    if (!leer_('Maquinas').some(function (m) { return m.id === maquinaId; })) {
      throw new Error('Selecciona una máquina válida.');
    }
    return { maquinaId: maquinaId, alcance: '' };
  }
  return { maquinaId: '', alcance: txt_(datos.alcance, 120, true, 'alcance transversal o línea') };
}

function mismaClasificacion_(a, b) {
  if (a.maquinaId || b.maquinaId) return Boolean(a.maquinaId && a.maquinaId === b.maquinaId);
  return Boolean(norm_(a.alcance) && norm_(a.alcance) === norm_(b.alcance));
}

function validarDocumentoGuia_(id, clasificacion) {
  const documento = buscarPorId_('Documentos', id, 'El documento asociado no existe.');
  if (!mismaClasificacion_(clasificacion, documento)) {
    throw new Error('La guía y el documento deben corresponder a la misma máquina o alcance.');
  }
  if (!documento.fileId && !/^https:\/\//i.test(documento.url || '')) {
    throw new Error('El documento asociado debe tener un archivo o enlace de consulta.');
  }
  return documento;
}

function validarCambioDocumento_(previo, nuevo, reemplazaArchivo) {
  if (!previo) return;
  const asociadas = leer_('Guias').filter(function (g) { return g.documentoId === previo.id; });
  if (asociadas.some(function (g) { return !mismaClasificacion_(g, nuevo); })) {
    throw new Error('Desvincula primero las guías antes de cambiar la clasificación del documento.');
  }
  if (asociadas.length && !previo.fileId && !reemplazaArchivo && !nuevo.url) {
    throw new Error('El documento asociado debe conservar un archivo o enlace de consulta.');
  }
}

function exigirDocumentoSinGuias_(id) {
  if (leer_('Guias').some(function (g) { return g.documentoId === id; })) {
    throw new Error('Desvincula primero las guías que utilizan este documento.');
  }
}
