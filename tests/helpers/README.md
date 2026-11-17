# Servicios simulados de prueba

`load_backend.js` carga todos los JavaScript de la raíz en un contexto compartido,
como Apps Script, y expone funciones seleccionadas para las pruebas. Recibe servicios
sustitutos y devuelve contexto, funciones y almacenamiento de prueba; aporta valores
predeterminados ficticios de identidad, propiedades y caché. La habilitación demo en
fixtures es explícita y no representa configuración de producción.

`fake_sheets.js` proporciona hojas, rangos, base de datos y servicios en memoria.
Sus fábricas mantienen propiedades y caché compartidas para ensayar escrituras,
invalidación y revocación entre ejecuciones sin acceso a Google. Las suites pueden
inyectar bloqueos y servicios específicos para sus contratos.

Ambos archivos son exclusivamente de prueba y se excluyen de la sincronización
mediante `.claspignore`. No deben utilizarse como adaptadores del servidor real.

## Contratos principales

- `loadBackend(overrides = {})`: recibe sustitutos de servicios globales, devuelve
  `{rawCode, exports}` con fuente ensamblada y contratos ejecutables. Depende de
  `fs`, `path`, `vm` y los archivos raíz. Cada llamada crea un contexto separado.
- `FakeSheet(rows)`: copia una matriz de filas. Expone dimensiones, rangos con
  coordenadas desde uno, lectura/escritura, anexado y borrado de filas/columnas;
  `header()` devuelve cabecera. `getDataRange()` incrementa `lecturas`. Los métodos
  de formato solo devuelven el rango; no simulan presentación ni permisos.
- `fakeCache()`: devuelve almacenamiento `store` y operaciones `get`, `put`,
  `remove`, `getAll`, `putAll`. Conserva cadenas; no simula expiración ni desalojos
  automáticos. Las suites deben provocarlos explícitamente.
- `fakeServicios(hojas)`: recibe un mapa nombre → matriz y devuelve
  `{sheets, cache, properties, overrides}`. Sus sustitutos de Sheets, CacheService
  y PropertiesService comparten estado entre llamadas a `loadBackend` cuando se
  reutiliza `overrides`. No simula transacciones ni concurrencia real.
