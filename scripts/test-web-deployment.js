const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { guest, validateWebConfig, loadWebConfig } = require('./web-config');
const fake = {
  mode: 'online', allowGuest: false, firebase: {
    apiKey: 'test-public-web-api-key', authDomain: 'test-project.firebaseapp.com',
    projectId: 'test-project', databaseURL: 'https://test-project-default-rtdb.europe-west1.firebasedatabase.app',
    appId: '1:123:web:abc'
  }
};
// Isolate the repository from the developer's local settings without changing them.
const { localPath } = require('./web-config');
const hasLocal = fs.existsSync(localPath);
assert.deepEqual(validateWebConfig(guest), guest);
assert.deepEqual(validateWebConfig(fake), fake);
assert.throws(() => validateWebConfig({ ...fake, firebase: { ...fake.firebase, apiKey: 'REPLACE_ME' } }), /apiKey/);
assert.throws(() => validateWebConfig({ ...fake, allowGuest: true }), /disable guest/);
assert.throws(() => validateWebConfig({ ...fake, firebase: { ...fake.firebase, private_key: 'SECRET' } }), /private key/);
assert.throws(() => validateWebConfig({ ...fake, password: 'unsafe' }), /private keys or passwords/);
assert.throws(() => validateWebConfig({ ...fake, firebase: { ...fake.firebase, databaseURL: 'http://evil.com' } }), /Realtime Database URL/);
assert.equal(loadWebConfig({ PIZZICATO_WEB_CONFIG: JSON.stringify(fake) }).mode, 'online');
assert.deepEqual(loadWebConfig({ PIZZICATO_FORCE_GUEST: '1', PIZZICATO_WEB_CONFIG: '{broken' }), guest);
assert.throws(() => loadWebConfig({ PIZZICATO_FORCE_GUEST: '1', PIZZICATO_REQUIRED_MODE: 'online' }), /Conflicting build flags/);
assert.throws(() => loadWebConfig({ PIZZICATO_WEB_CONFIG: JSON.stringify(fake), PIZZICATO_REQUIRED_MODE: 'guest' }), /Expected guest mode/);
assert.throws(() => loadWebConfig({ PIZZICATO_WEB_CONFIG: '{broken' }), /not valid JSON/);
assert(!fs.readFileSync(path.join(__dirname, '../src/ts/study/deployment.ts'), 'utf8').includes('REPLACE_FROM_FIREBASE_CONSOLE'));
const common = fs.readFileSync(path.join(__dirname, '../webpack/webpack.common.js'), 'utf8');
assert(common.includes("publicPath: 'auto'"));
assert(common.includes('__PIZZICATO_WEB_CONFIG__'));
const sharedPaths = fs.readFileSync(path.join(__dirname, '../src/ts/core/common.ts'), 'utf8');
assert(sharedPaths.includes("new URL(combinedPath, basePath)"));
assert.equal(new URL('levels/Trained/info.json', 'https://example.github.io/pizzicato/').href,
  'https://example.github.io/pizzicato/levels/Trained/info.json');
assert.equal(new URL('assets/ui/button.png', 'http://localhost:8080/').href,
  'http://localhost:8080/assets/ui/button.png');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-pages.yml'), 'utf8');
for (const must of ['workflow_dispatch:', "'refs/heads/main'", "'refs/heads/dev'", 'actions/deploy-pages@v4', 'dist/.nojekyll', 'PIZZICATO_REQUIRED_MODE']) assert(workflow.includes(must), must);
const gitignore = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
assert(gitignore.includes('web-config.local.json'));
assert(hasLocal || !fs.existsSync(localPath), 'Test should never create a local config file');
console.log('PASS: guest/research build config validation, no silent online-mode fallback, Pages workflow and subpath conventions');
