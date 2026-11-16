# Seguridad y organización del servidor

Los archivos de ejecución están planos en la raíz y comparten el ámbito global de
Google Apps Script. `Código.js` conserva configuración, esquema, acceso, despacho
de acciones, persistencia, catálogo, tareas, documentos y asistente. `Index.html`
contiene la estructura, `App.html` las vistas y llamadas al servidor, `Styles.html`
los estilos y `LogoCompleto.html` el recurso gráfico. `appsscript.json` declara el
entorno y los permisos; `.claspignore` excluye pruebas y documentación.

## Responsabilidades extraídas

| Archivo | Funciones principales y contratos |
|---|---|
| `Sesiones.js` | `demoHabilitada_()` devuelve si coinciden modo demo y propiedad explícita. `ttl_()` limita la duración a seis horas. `rolValido_(rol)` acepta solo claves propias de `ROLES`. `versionSesion_(id)` consulta la versión persistente. `usuarioSesionActual_(id)` lee la fila vigente sin caché. `abrirSesion_(usuario)` devuelve un token y conserva su versión. `sesion_(token)` devuelve el perfil vigente o lanza `SESION_EXPIRADA`. `cerrarSesionesDe_(id)` invalida todos sus tokens mediante cambio de versión. Depende de Sheets, CacheService, PropertiesService y utilidades del servidor. |
| `Identificadores.js` | `siguienteId_(hoja, prefijo)` devuelve un identificador correlativo reservado bajo bloqueo, considerando contador persistente y filas actuales. Libera el bloqueo aun si falla; rechaza contadores corruptos o agotados. Depende de LockService, PropertiesService, `db_()` y `pad_()`. Las reservas fallidas dejan saltos deliberados. Los usuarios usan UUID. |
| `Inicializacion.js` | `exigirInicializacion_()` exige identidad Google activa igual a la efectiva antes de tocar recursos. `inicializar()` prepara/migra hojas, calendario, carpeta documental y semillas; no devuelve datos al cliente. Depende del esquema y helpers del servidor y de los servicios de Google. No habilita el acceso demo automáticamente. |
| `Calendario.js` | `calendario_()` obtiene el calendario configurado. `eventos_(desde,hasta,usuario)` filtra invitados/creador antes de construir resultados. `reuniones_(datos,usuario)` valida rango y devuelve eventos personales. `crearReunion_()` valida datos, crea e invita; `cancelarReunion_()` permite creador o administrador. Ambas devuelven `true`. `recordatorios_()` devuelve minutos/eventos conforme a preferencias. Depende de CalendarApp, perfiles, validación y bitácora. |

## Acceso y configuración

`esCreadorReunion_(evento, email)` centraliza la atribución: la etiqueta explícita
prevalece; solo en su ausencia consulta creadores de Calendar. Devuelve booleano y
se utiliza tanto al listar como al autorizar cancelación de reuniones heredadas.

- El acceso corporativo verifica la cuenta Google activa; escribir un correo ajeno
  no autentica a su titular. La disponibilidad de identidad depende del entorno Google.
- Solo administrador crea o edita guías y documentos, tanto por API como por interfaz.
  Editor mantiene edición de máquinas y lectura de borradores según política existente.
- Una sesión comprueba estado, correo, rol y versión en cada petición. Cambiar el rol,
  desactivar o eliminar la cuenta impide seguir usando el perfil anterior. La revocación
  no depende de conservar todos los tokens en un índice de caché.
- Las reuniones listadas son personales, también para administrador. Las antiguas sin
  etiqueta se atribuyen por creadores del evento. Cancelar conserva la facultad
  administrativa existente; no concede visibilidad global en los listados.
- Las cuentas `@demo.cl` requieren `APP.MODO_DEMO` y la propiedad del script
  `DEMO_ACCESS_ENABLED` con valor exacto `true`. No tienen contraseña: cualquiera que
  conozca el correo de una cuenta habilitada puede usarla. Solo sirven en un proyecto
  aislado con datos ficticios. El indicador demo no separa bases ni sanea datos.
- `SESSION_VERSION_<id>` y `SEQUENCE_<DB_ID>_<hoja>_<prefijo>` son propiedades internas;
  no deben reiniciarse como parte de mantenimiento ordinario.

## Validación y aplicación posterior

`npm test` ejecuta pruebas locales con servicios simulados; ver `tests/README.md`.
La lectura actual de perfiles aumenta las lecturas de Sheets por petición: se prioriza
revocación fiable, y las cuotas/rendimiento reales deben verificarse en Google.

Los módulos nuevos deben acompañar al servidor al aplicar manualmente los cambios.
Las sesiones antiguas sin versión dejan de ser válidas y requieren ingresar otra vez.
No se ha sincronizado ni publicado esta modificación, ni se han cambiado propiedades,
cuentas, permisos o recursos remotos. La cuenta administrativa, las identidades,
las invitaciones y la concurrencia real requieren comprobación en un entorno autorizado.
Los monolitos heredados conservan su estructura fuera de las responsabilidades extraídas.
