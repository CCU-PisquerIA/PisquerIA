// Clasificación de Documentos: una máquina existente o, sin máquina, un alcance transversal o de línea.
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
