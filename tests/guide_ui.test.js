const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function interfaz({ administrador = false, guia = {} } = {}) {
  const formularios = [], mensajes = [], llamadas = [];
  const contexto = {
    call: async (accion, datos) => {
      llamadas.push({ accion, datos });
      return accion === 'guia' ? guia : { id: 'GUI-009' };
    },
    can: () => administrador,
    esc: (valor) => String(valor == null ? '' : valor).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]),
    ic: () => '',
    opcionesMaquinas: async () => [['DEM-101', 'Transportador']], cargarListas: async () => {}, opcionesForm: () => [],
    formModal: (opciones) => formularios.push(opciones), toast: (mensaje) => mensajes.push(mensaje),
    CFG: { extensiones: ['pdf'], maxArchivoMb: 10 }, go: () => {}, refrescar: () => {},
    leerArchivo: async (f) => ({ nombre: f.name, base64: 'JVBERg==' })
  };
  vm.createContext(contexto);
  const fuente = fs.readFileSync(path.join(__dirname, '../BibliotecaUI.html'), 'utf8');
  vm.runInContext(fuente.replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''), contexto);
  return { contexto, formularios, mensajes, llamadas };
}

test('la ficha muestra máquina, resumen y el botón del visor con texto escapado', async () => {
  const e = interfaz({ guia: {
    id: 'GUI-001', titulo: '<img src=x>', maquinaId: 'DEM-101', maquinaNombre: 'Transportador', area: 'Envasado',
    resumen: 'Resumen ficticio', archivo: true, nombreArchivo: 'guia.pdf', tamano: '2048'
  } });
  const html = await e.contexto.vistaGuiaDocumental('GUI-001');
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /data-go="maquina" data-id="DEM-101"/);
  assert.match(html, /Resumen ficticio/);
  assert.match(html, /guia\.pdf<\/strong> · 2 KB/);
  assert.match(html, /data-act="verGuia" data-id="GUI-001"/);
  assert.doesNotMatch(html, /data-act="editarGuia"/);
});

test('una guía sin archivo lo indica y no ofrece el visor', async () => {
  const e = interfaz({ guia: { id: 'GUI-002', titulo: 'T', maquinaId: 'DEM-101', archivo: false } });
  const html = await e.contexto.vistaGuiaDocumental('GUI-002');
  assert.match(html, /aún no tiene un archivo adjunto/);
  assert.doesNotMatch(html, /data-act="verGuia"/);
});

test('el formulario pide título, máquina, resumen y archivo opcional, y lo envía al servidor', async () => {
  const lector = interfaz();
  await lector.contexto.formGuia();
  assert.equal(lector.formularios.length, 0);
  assert.equal(lector.llamadas.length, 0);

  const admin = interfaz({ administrador: true });
  await admin.contexto.formGuia();
  const { campos, onSubmit } = admin.formularios[0];
  assert.deepEqual(Array.from(campos, c => c.k), ['titulo', 'maquinaId', 'resumen', 'archivo']);
  assert.equal(campos.find(c => c.k === 'maquinaId').req, true);
  assert.equal(campos.find(c => c.k === 'resumen').req, true);
  assert.equal(campos.find(c => c.k === 'archivo').req, undefined);

  await onSubmit({ titulo: 'T', maquinaId: 'DEM-101', resumen: 'R', archivo: { name: 'g.pdf', size: 4 } });
  const envio = admin.llamadas.find(l => l.accion === 'guardarGuia').datos;
  assert.equal(envio.archivo.nombre, 'g.pdf');
  assert.equal(envio.id, '');
});

test('el formulario de documentos conserva la autorización', async () => {
  const lector = interfaz();
  await lector.contexto.formDocumento();
  assert.equal(lector.formularios.length, 0);
  assert.equal(lector.mensajes.length, 1);
  const admin = interfaz({ administrador: true });
  await admin.contexto.formDocumento();
  assert.ok(admin.formularios[0].campos.some(c => c.k === 'alcance'));
});
