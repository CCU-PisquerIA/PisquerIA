const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

test('Código.js syntax is valid V8 JavaScript', () => {
  const code = fs.readFileSync(path.join(ROOT, 'Código.js'), 'utf8');
  assert.doesNotThrow(() => {
    new vm.Script(code);
  }, 'Código.js contains syntax errors');
});

test('appsscript.json manifest contains required configuration', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8');
  const manifest = JSON.parse(raw);

  assert.strictEqual(manifest.runtimeVersion, 'V8', 'Runtime must be V8');
  assert.strictEqual(manifest.timeZone, 'America/Santiago', 'Timezone must be America/Santiago');
  assert.ok(manifest.webapp, 'Webapp block must exist');
  assert.strictEqual(manifest.webapp.executeAs, 'USER_DEPLOYING', 'Must execute as owner to protect Sheets/Drive access');

  const requiredScopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  requiredScopes.forEach(scope => {
    assert.ok(
      manifest.oauthScopes.includes(scope),
      `Manifest is missing required OAuth scope: ${scope}`
    );
  });
});

test('All HTML template files exist and are readable', () => {
  const requiredFiles = ['Index.html', 'App.html', 'Styles.html', 'LogoCompleto.html'];
  requiredFiles.forEach(file => {
    const fullPath = path.join(ROOT, file);
    assert.ok(fs.existsSync(fullPath), `Required template file missing: ${file}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Template file cannot be empty: ${file}`);
  });
});

test('All include() calls resolve to existing HTML files', () => {
  const filesToScan = ['Código.js', 'Index.html', 'App.html'];
  const includePattern = /include\(\s*['"]([^'"]+)['"]\s*\)/g;

  filesToScan.forEach(file => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    let match;
    while ((match = includePattern.exec(content)) !== null) {
      const targetName = match[1];
      const targetPath = path.join(ROOT, `${targetName}.html`);
      assert.ok(
        fs.existsSync(targetPath),
        `include('${targetName}') in ${file} points to non-existent ${targetName}.html`
      );
    }
  });
});
