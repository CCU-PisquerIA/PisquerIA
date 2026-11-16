# Consulta de guías y documentos asociados

La biblioteca diferencia la guía (título, resumen, contenido y estado de publicación)
del documento de consulta (archivo protegido o enlace). La ficha de guía utiliza el
visor/descarga documental existente: PDF e imágenes se visualizan; PPTX se descarga.
No se incorpora lectura automática de adjuntos ni un importador de presentaciones.

## Archivos y responsabilidades

| Archivo | Contratos principales y conexiones |
|---|---|
| `Guias.js` | `verGuia_(datos, usuario)` recibe el ID, respeta visibilidad y devuelve la guía con `documento` público o `null`. `guardarGuia_(datos, usuario)` valida clasificación, documento y revisión; guarda y devuelve `{id}`. Ambas dependen del catálogo, persistencia y helpers de `Biblioteca.js`. La escritura se autoriza como administrador mediante `api`. |
| `Biblioteca.js` | `revisionTecnicaGuia_(valor)` normaliza a pendiente un estado vacío/desconocido heredado. `clasificacionDocumental_(datos)` devuelve `{maquinaId, alcance}` y exige una máquina existente o alcance transversal. `mismaClasificacion_(a,b)` compara máquina o alcance normalizado. `validarDocumentoGuia_(id, clasificacion)` devuelve el documento existente con archivo/enlace y clasificación coincidente o lanza error. `validarCambioDocumento_(previo,nuevo,reemplazaArchivo)` impide romper vínculos existentes. `exigirDocumentoSinGuias_(id)` rechaza eliminación con referencias. Dependen de lectura de hojas, normalización y validación existentes. |
| `BibliotecaUI.html` | `vistaGuiaDocumental(id)` solicita la guía y devuelve HTML escapado con clasificación, revisión y acceso documental. `formGuia(valores)` prepara formulario y guarda mediante API; `formDocumento(valores)` permite archivo/enlace y alcance. Reutiliza `call`, `can`, `formModal`, escape, Markdown y visor de `App.html`. `Index.html` incluye este módulo después de `App`. |

`Código.js` conserva el catálogo, búsqueda y operaciones documentales; ahora utiliza
los helpers de clasificación y referencia. `App.html` conserva listados, navegación,
controles del visor y tratamiento de errores; delega ficha/formularios al módulo nuevo.

## Datos y compatibilidad

Se añaden columnas al final, conservando las anteriores y las columnas manuales:

| Hoja | Columna | Significado |
|---|---|---|
| `Guias` | `alcance` | Nombre de línea o material transversal cuando no tiene máquina. |
| `Guias` | `documentoId` | ID de `Documentos`; vacío si aún no se asocia material. |
| `Guias` | `revisionTecnica` | `Pendiente de revisión` o `En revisión`, independiente de `estado`. |
| `Documentos` | `alcance` | Clasificación transversal que debe coincidir con la guía. |

Seleccionar una máquina limpia el alcance transversal. Sin máquina, el alcance es
obligatorio; no se crea un equipo ficticio. La comparación ignora mayúsculas y acentos
con la normalización existente. El texto debe acordarse con el responsable del material.

Los registros antiguos conservan su visibilidad y muestran revisión pendiente. Una
guía publicada puede estar pendiente de revisión; su disponibilidad no acredita
aprobación operacional. Esta entrega no registra ni certifica aprobaciones técnicas.
Las guías en borrador siguen ocultas a lectores. Los documentos mantienen su política
de lectura existente: el estado de una guía no vuelve privado su documento asociado.

Cambiar la clasificación o quitar el único enlace de un documento vinculado se
rechaza. Para eliminarlo, primero se desvincula en las guías. Si una modificación
manual deja una referencia inexistente/incompatible, la ficha muestra recuperación
sin entregar metadatos del documento incompatible. El identificador de Drive no se
devuelve al navegador. Las comprobaciones de referencia no constituyen transacciones
entre hojas; ediciones simultáneas deben revisarse en el entorno autorizado.

## Aplicación manual y prueba

1. Revisar primero el PR base de seguridad: esta rama depende de ese commit.
2. Comparar la versión remota con el equipo antes de aplicar archivos. Incluir
   `Guias.js`, `Biblioteca.js`, `BibliotecaUI.html` y las modificaciones de raíz.
3. La cuenta responsable debe revisar y ejecutar la migración existente mediante
   `inicializar()` antes de escribir con las columnas nuevas. También revisa/crea
   recursos y semillas: no ejecutar sin comprobar propiedades y entorno.
4. En un entorno autorizado con datos ficticios, crear documento de prueba y asociarlo
   a una guía. Verificar consulta como lector, denegación de escritura y errores de
   referencia. Repetir para alcance transversal y estados de revisión/publicación.

`npm test` verifica contratos del servidor y renderizado/formularios con sustitutos
locales. No prueba visualmente el navegador ni Google real. No se sincronizó,
publicó o cargó documentación corporativa. Los nueve originales siguen sin modificar;
su conversión a PDF, inspección visual, clasificación definitiva y carga autorizada
constituyen un trabajo posterior. No se incluyen guías reales como semillas.
