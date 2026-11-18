# Pruebas locales

Esta carpeta valida contratos y lógica del servidor mediante `node:test` y servicios
simulados. Desde la raíz se ejecuta `npm test`, sin instalar dependencias adicionales.
No conecta cuentas, no envía correos y no modifica Google Sheets, Drive o Calendar.

Las suites existentes cubren autenticación corporativa/demo, esquema y migración,
caché, listas, validación de archivos, permisos, asistente y plantillas.

| Archivo añadido | Responsabilidad |
|---|---|
| `document_permissions.test.js` | Denegación de lector/editor sin efectos y creación/edición permitida a administrador. |
| `session_revocation.test.js` | Revocación con índice truncado/ausente, rol vigente, desactivación, eliminación, demo habilitada por defecto, apagado explícito, prioridad de MODO_DEMO y claves heredadas del prototipo. |
| `calendar_privacy.test.js` | Dos identidades y administrador; no leer ni serializar metadatos de eventos ajenos. |
| `initialization_security.test.js` | Guarda de identidad antes de acceder a recursos; identidad ausente o distinta se rechaza. |
| `id_reservation.test.js` | Ejecuciones separadas reservan antes de insertar; no reutilización, filas manuales, caché antigua y contadores inválidos. |

Las pruebas no acreditan permisos corporativos, invitaciones reales, disponibilidad de
identidad Google, cuotas o comportamiento simultáneo del servicio LockService.
Los helpers se documentan en `helpers/README.md`.

## Biblioteca documental

`guias_archivo.test.js` valida por API el esquema de Guías (título, máquina, resumen y
archivo en Drive simulado): subida, entrega sin exponer el `fileId`, archivo opcional,
reemplazo y eliminación con papelera, campos obligatorios, permisos y hoja sin migrar.
`guide_ui.test.js` ejecuta el módulo de biblioteca en un contexto JavaScript aislado:
comprueba escape de texto, ficha con y sin archivo y formularios por rol.
No sustituye una revisión visual o una prueba completa en navegador.

`metadatos_sheets.test.js` verifica que la migración agregue también la columna
`alcance` y conserve las columnas manuales existentes.
