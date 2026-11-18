# Biblioteca técnica: Guías y Documentación

Guías de funcionamiento y Documentación siguen el mismo esquema: cada registro tiene
sus datos en la planilla y, si corresponde, un archivo en la carpeta protegida de Drive
(`DOCS_FOLDER_ID`). Los usuarios nunca reciben acceso a Drive: el servidor entrega el
archivo por `api()` y la intranet lo muestra en su visor (PDF e imágenes) o lo descarga
(Office y DWG). El `fileId` de Drive nunca llega al navegador.

## Esquema

| Hoja | Campos que llena el usuario | Campos que llena el sistema |
|---|---|---|
| `Guias` | `titulo`, `maquinaId` (obligatoria), `resumen` (obligatorio, máx. 300), archivo (opcional) | `id` (GUI-###), `autor`, `actualizado`, `fileId`, `nombreArchivo`, `mimeType`, `tamano` |
| `Documentos` | `titulo`, `maquinaId` o `alcance` transversal, `tipo`, `version`, archivo o `url` | `id` (DOC-###), `actualizado`, `fileId`, `nombreArchivo`, `mimeType`, `tamano`, `autor` |

Las guías no tienen estado ni versión: todas son visibles para cualquier rol. Solo el
administrador crea, edita y elimina guías y documentos.

## Archivos y responsabilidades

| Archivo | Contenido |
|---|---|
| `Guias.js` | `verGuia_`, `guardarGuia_`, `eliminarGuia_` y `archivoGuia_` (acciones `guia`, `guardarGuia`, `eliminarGuia`, `archivoGuia`). |
| `Biblioteca.js` | `clasificacionDocumental_`: máquina existente o alcance transversal para Documentos. |
| `Código.js` | Catálogo, búsqueda y Documentos. Helpers compartidos: `adjuntarArchivo_` (sube a Drive y anota metadatos), `entregarArchivo_` (devuelve el archivo en base64), `blobArchivo_`/`validarArchivo_` (tipo, firma y tamaño máx. `MAX_ARCHIVO_MB`), `papelera_` y `docPublico_` (quita el `fileId`). |
| `BibliotecaUI.html` | Ficha de guía (`vistaGuiaDocumental`), `formGuia` y `formDocumento`. |
| `App.html` | Tarjetas y listado de guías, y el visor común `verArchivo(accion, id, etiqueta)` usado por `ACT.verGuia` y `ACT.verDocumento`. |

## Reglas del archivo

- Tipos permitidos: PDF, PNG, JPG, WEBP, Word, Excel, PowerPoint y DWG, hasta 10 MB.
  Se valida que el contenido corresponda a la extensión.
- Al editar sin adjuntar, se conserva el archivo actual. Al reemplazarlo, el anterior
  va a la papelera de Drive. Al eliminar la guía o el documento, su archivo también.
- Si la planilla falla al guardar, el archivo recién subido se envía a la papelera.
- El asistente Gemini solo conoce título, máquina y resumen de cada guía; no lee el
  archivo.

## Migración desde la versión anterior

Las guías antes tenían `version`, `estado`, `contenido` (texto), `alcance`,
`documentoId` y `revisionTecnica`. Esas columnas ya no están en `ESQUEMA`, así que
la intranet las ignora, pero **no se borran de la hoja**: los datos quedan en la
planilla por si se necesitan. Para eliminarlas, agrégalas a `COLUMNAS_OBSOLETAS.Guias`
antes de ejecutar `inicializar()`.

Después del `clasp push`, la cuenta dueña debe ejecutar `inicializar()` (archivo
`Inicializacion.gs`) para agregar `fileId`, `nombreArchivo`, `mimeType` y `tamano` a la
hoja `Guias`. Hasta entonces, guardar una guía muestra un error que pide ejecutarlo.

La lista «Estados de guía» se quitó de Filtros y listas. Sus filas en la hoja `Listas`
quedan sin uso y se pueden borrar a mano.

## Prueba manual en Apps Script

1. Como administrador, crear una guía con un PDF y verla con «Ver guía».
2. Editarla sin adjuntar (el archivo se conserva) y luego reemplazar el archivo.
3. Como lector, abrir la guía y el visor; confirmar que no puede editar.
4. Eliminar la guía y revisar que el archivo quedó en la papelera de Drive.
