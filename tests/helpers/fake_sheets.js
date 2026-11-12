// Planilla y caché falsos para probar la capa de datos sin Google Apps Script.
class FakeSheet {
  constructor(rows) { this.rows = rows.map((r) => r.slice()); this.lecturas = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; }
  getDataRange() { this.lecturas++; return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    const rango = {
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => { const v = (sh.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
      setValues: (v) => {
        v.forEach((fila, i) => {
          const R = sh.rows[r - 1 + i] || (sh.rows[r - 1 + i] = []);
          fila.forEach((x, j) => { R[c - 1 + j] = x; });
        });
        return rango;
      },
      setValue: (x) => rango.setValues([[x]]),
      setFontWeight: () => rango, setBackground: () => rango, setFontColor: () => rango, setNumberFormat: () => rango
    };
    return rango;
  }
  appendRow(a) { this.rows.push(a.slice()); }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  deleteColumn(c) { this.rows.forEach((r) => r.splice(c - 1, 1)); }
  header() { return this.rows[0]; }
}

function fakeCache() {
  const store = new Map();
  return {
    store,
    get: (k) => (store.has(k) ? store.get(k) : null),
    put: (k, v) => { store.set(k, String(v)); },
    remove: (k) => { store.delete(k); },
    getAll: (keys) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
    putAll: (o) => { Object.entries(o).forEach(([k, v]) => store.set(k, String(v))); }
  };
}

// Servicios de Apps Script que comparten dos "ejecuciones" distintas del backend
function fakeServicios(hojas) {
  const sheets = Object.fromEntries(Object.entries(hojas).map(([n, rows]) => [n, new FakeSheet(rows)]));
  const cache = fakeCache();
  return {
    sheets,
    cache,
    overrides: {
      SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] }), flush: () => {} },
      CacheService: { getScriptCache: () => cache },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'DB_TEST', setProperty: () => {} }) }
    }
  };
}

module.exports = { FakeSheet, fakeCache, fakeServicios };
