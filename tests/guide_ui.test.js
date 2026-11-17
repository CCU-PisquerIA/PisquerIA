const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function interfaz({ administrador = false, guia = {} } = {}) {
  const formularios = [], mensajes = [], enlaces = [], llamadas = [];
  const contexto = {
    call: async (accion, datos) => {
      llamadas.push({ accion, datos });
      return accion === 'guia' ? guia : [];
    },
    can: () => administrador,
    esc: (valor) => String(valor || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]),
    ic: () => '', badgeEstado: () => '', md: () => '',
    linkDoc: (doc) => { enlaces.push(doc.id); return '<button>Consultar</button>'; },
    opcionesMaquinas: async () => [], cargarListas: async () => {}, opcionesForm: () => [],
    formModal: (opciones) => formularios.push(opciones), toast: (mensaje) => mensajes.push(mensaje),
    CFG: {}, go: () => {}, refrescar: () => {}, leerArchivo: async () => ({})
  };
  vm.createContext(contexto);
  const fuente = fs.readFileSync(path.join(__dirname, '../BibliotecaUI.html'), 'utf8');
  vm.runInContext(fuente.replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''), contexto);
  return { contexto, formularios, mensajes, enlaces, llamadas };
}

test('consulta transversal muestra revisión, documento y texto escapado sin enlace a máquina inexistente', async () => {
  const e = interfaz({ guia: {
    id: 'GUI-001', titulo: '<img src=x>', alcance: 'Línea ficticia 3',
    revisionTecnica: 'En revisión', documento: { id: 'DOC-001', titulo: 'Material ficticio', version: '0.1' }
  } });
  const html = await e.contexto.vistaGuiaDocumental('GUI-001');
  assert.match(html, /Transversal \/ línea · Línea ficticia 3/);
  assert.match(html, /Revisión técnica: En revisión/);
  assert.match(html, /no acredita aprobación para uso operacional/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /data-go="maquina"|data-act="editarGuia"/);
  assert.deepEqual(e.enlaces, ['DOC-001']);
});

test('vínculo inexistente tiene mensaje de recuperación y no genera botón de archivo', async () => {
  const e = interfaz({ guia: { id: 'GUI-001', documentoId: 'DOC-AUSENTE', documento: null } });
  assert.match(await e.contexto.vistaGuiaDocumental('GUI-001'), /Avisa a un administrador/);
  assert.equal(e.enlaces.length, 0);
});

test('formularios conservan la autorización y ofrecen clasificación y revisión separadas', async () => {
  const lector = interfaz();
  await lector.contexto.formGuia();
  await lector.contexto.formDocumento();
  assert.equal(lector.formularios.length, 0);
  assert.equal(lector.llamadas.length, 0);
  assert.equal(lector.mensajes.length, 2);
  const admin = interfaz({ administrador: true });
  await admin.contexto.formGuia();
  await admin.contexto.formDocumento();
  const campos = admin.formularios[0].campos;
  assert.ok(campos.some(c => c.k === 'documentoId'));
  assert.ok(campos.some(c => c.k === 'revisionTecnica'));
  assert.ok(campos.some(c => c.k === 'estado'));
  assert.equal(campos.find(c => c.k === 'maquinaId').req, undefined);
  assert.ok(admin.formularios[1].campos.some(c => c.k === 'alcance'));
});
