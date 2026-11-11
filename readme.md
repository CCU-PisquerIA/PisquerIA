# Intranet Pisquera de Chile

Intranet de Pisquera de Chile (CCU) construida en **Google Apps Script**. Reúne en un solo lugar las máquinas de la planta, sus guías de funcionamiento, la documentación técnica, las reuniones del equipo y las tareas, con login propio, roles de usuario y la identidad visual de la empresa.

El proyecto se desarrolla en VS Code, se versiona en este repositorio y se sincroniza con Apps Script mediante [clasp](https://github.com/google/clasp).

---

## Módulos

| Módulo | Qué permite |
|---|---|
| **Inicio** | Saludo personalizado, buscador y acceso a los seis módulos. |
| **Máquinas** | Catálogo de equipos por área, clase y estado. Vista en tarjetas o en listado. |
| **Guías de Funcionamiento** | Guías por máquina con versión y estado (Borrador, En revisión, Publicada). Vista en tarjetas o en listado. |
| **Documentación** | Manuales, fichas técnicas y procedimientos asociados a cada máquina. |
| **Reuniones** | Calendario mensual del equipo. Agendar reuniones con invitación automática y enlace de Meet. |
| **Tareas** | Tablero Pendiente, En curso y Completada, con responsable, prioridad, vencimiento y aviso por correo. |
| **Mi Perfil** | Datos de la cuenta, cambio de contraseña y preferencias de notificación. |
| **Usuarios y accesos** | (Solo administradores) Crear usuarios, asignar roles, activar o desactivar cuentas y restablecer contraseñas. |

### Roles

| Rol | Puede |
|---|---|
| **Lector** | Consultar máquinas, guías publicadas y documentos; agendar reuniones; gestionar sus tareas; cambiar su contraseña. |
| **Editor** | Todo lo del lector, más crear y editar máquinas, guías y documentos, y ver guías en borrador o en revisión. |
| **Administrador** | Todo lo del editor, más eliminar registros y administrar usuarios y roles. |

Las cuentas creadas con **Registrarse** parten como Lector; un administrador puede subirles el rol.

---

## Tecnologías

- **Backend:** Google Apps Script (V8).
- **Frontend:** HTML, CSS y JavaScript servidos con HtmlService.
- **Datos:** Google Sheets (una planilla con una hoja por entidad).
- **Reuniones:** Google Calendar (calendario del equipo).
- **Correos:** MailApp.
- **Sesiones:** CacheService (máximo 6 horas).

---

## Estructura del repositorio

```
intranet-pisquera/
├── .clasp.json          Conecta la carpeta con el proyecto de Apps Script ("rootDir": "src")
├── .gitignore
├── README.md
├── docs/
│   └── COMANDOS-CLASP.txt   Guía rápida de comandos
└── src/                 Todo lo que se sube a Apps Script
    ├── appsscript.json      Manifiesto: zona horaria, permisos y configuración de la web app
    ├── Código.js            Backend (en Apps Script aparece como Código.gs)
    ├── Index.html           Estructura: login, registro, menú y contenedor de vistas
    ├── Styles.html          Estilos y paleta institucional
    ├── App.html             Lógica del frontend y vistas de cada módulo
    └── LogoCompleto.html    Logo de la empresa en base64
```

Los archivos dentro de `src/` deben quedar planos, sin subcarpetas: Apps Script no tiene carpetas y `include('App')` dejaría de encontrar los archivos.

---

## Puesta en marcha

### Requisitos

- [Node.js](https://nodejs.org) (versión LTS).
- clasp: `npm install -g @google/clasp`
- API de Apps Script activada en https://script.google.com/home/usersettings con la cuenta de la empresa.
- Permiso de **editor** sobre el proyecto de Apps Script.

### Primera vez

```bash
git clone https://github.com/USUARIO/intranet-pisquera.git
cd intranet-pisquera
clasp login              # con la cuenta de la empresa
clasp push               # sube el código al proyecto indicado en .clasp.json
```

Luego, en el editor de Apps Script (`clasp open-script`):

1. Selecciona la función `inicializar` y presiona **Ejecutar**. Autoriza los permisos que pida.
   Crea la planilla de datos, el calendario del equipo y los datos de demostración. Se puede volver a ejecutar sin borrar datos: solo agrega lo que falte.
2. **Implementar → Nueva implementación → Aplicación web**, con:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario del dominio (o con cuenta de Google)

La app debe ejecutarse **como el dueño** del proyecto: así los usuarios no necesitan acceso a la planilla y todo pasa por el login de la intranet. Esto ya está definido en `appsscript.json` (`"executeAs": "USER_DEPLOYING"`).

---

## Flujo de trabajo

```bash
git pull                                   # 1. Traer los cambios del equipo
# ... editar en VS Code ...
clasp push                                 # 2. Subir a Apps Script
                                           # 3. Probar en la URL /dev
git add .
git commit -m "Qué cambió"                 # 4. Guardar en el historial
git push                                   # 5. Compartir en GitHub
clasp deploy -i ID_IMPLEMENTACION -d "Qué cambió"   # 6. Publicar en el link oficial
```

- La URL de prueba está en **Implementar → Implementaciones de prueba** (termina en `/dev`) y siempre usa el último código subido.
- `clasp deployments` muestra el ID de la implementación (usa el que no dice `@HEAD`). Publicar con `-i` mantiene el mismo link.
- Si tu versión de clasp no reconoce `deploy -i`, usa `clasp update-deployment ID_IMPLEMENTACION`.

Más comandos en [`docs/COMANDOS-CLASP.txt`](docs/COMANDOS-CLASP.txt).

### Reglas del equipo

1. **GitHub es la versión oficial del código.** Haz siempre `git pull` antes de `clasp push`.
2. **`clasp push` reemplaza todo lo que hay en Apps Script.** No editen en el navegador mientras otros trabajan en VS Code.
3. Si alguien editó en el navegador, rescata el cambio con `clasp pull`, luego `git commit` y `git push`.
4. Prueba en `/dev` antes de publicar en el link oficial.
5. Nunca subas el archivo `~/.clasprc.json`: contiene el acceso a tu cuenta de Google.

---

## Configuración

Al inicio de `src/Código.js`, en el objeto `APP`:

| Opción | Para qué sirve |
|---|---|
| `NOMBRE` | Nombre que aparece en la intranet. |
| `LOGO_URL` | URL pública de un logo. Si queda vacío, se usa `LogoCompleto.html`. |
| `MODO_DEMO` | Muestra el aviso de "datos ficticios". Cambiar a `false` en producción. |
| `SESION_HORAS` | Duración de la sesión (máximo 6). |
| `MAX_INTENTOS` / `BLOQUEO_MIN` | Intentos fallidos antes de bloquear una cuenta y minutos de bloqueo. |
| `REGISTRO_ABIERTO` | Muestra u oculta la pestaña **Registrarse**. |
| `DOMINIOS_REGISTRO` | Limita el registro a ciertos dominios, por ejemplo `['pisquera.cl']`. Vacío = cualquiera. |
| `CALENDARIO` | Nombre del calendario del equipo que crea `inicializar()`. |

Los créditos y la versión del modal **Acerca de este sistema** se editan en la constante `ACERCA`, al inicio de `src/App.html`.

---

## Datos

`inicializar()` crea una planilla con estas hojas:

| Hoja | Contenido |
|---|---|
| `Usuarios` | Cuentas, rol, estado y preferencias. Las contraseñas se guardan cifradas con sal, nunca en texto plano. |
| `Maquinas` | Catálogo de equipos. |
| `Guias` | Guías de funcionamiento y su contenido. |
| `Documentos` | Enlaces a manuales y fichas técnicas. |
| `Tareas` | Tareas, responsables y estados. |
| `Registro` | Bitácora de acciones (ingresos, cambios, eliminaciones). |

---

## Seguridad

- Cada acción del frontend pasa por una única función del servidor que valida la sesión y el rol antes de ejecutarse.
- Tras 5 intentos fallidos, la cuenta se bloquea 15 minutos.
- La planilla de datos es privada del dueño del proyecto; los usuarios no tienen acceso directo a ella.
- **Antes de usar la intranet con datos reales:** cambia la contraseña o desactiva las cuentas de demostración (definidas en `sembrar_()`, en `src/Código.js`) y deja `MODO_DEMO` en `false`.

---

## Equipo

- Javier Catalán
- Claudio Palta
- Benjamin Cuello