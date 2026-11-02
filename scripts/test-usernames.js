/** Username-only Firebase Auth mapping tests, offline-safe (no SDK or credentials). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const Module = require('node:module');
const { emailForUsername: serverEmail, normalizeUsername: serverName } = require('../functions/username');
const frontendPath = path.join(__dirname, '../src/ts/study/username.ts');
const output = ts.transpileModule(fs.readFileSync(frontendPath, 'utf8'), {
  fileName: frontendPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const client = new Module(frontendPath, module); client.filename = frontendPath;
client._compile(output.outputText, frontendPath);
for (const [input, expected] of [
  ['leadresearcher', 'leadresearcher@pizzicato.com'],
  ['LeadResearcher', 'leadresearcher@pizzicato.com'],
  ['TESTplayer_01', 'testplayer_01@pizzicato.com'],
  ['mod-1234', 'mod-1234@pizzicato.com'],
]) {
  assert.equal(serverEmail(input), expected);
  assert.equal(client.exports.emailForUsername(input), expected);
  assert.equal(client.exports.normalizeUsername(input), serverName(input));
}
for (const invalid of ['', 'abc', '9player', 'user.name', 'admin@example.org', 'a@pizzicato.com', ' space', 'name ',
  'name with spaces', 'x'.repeat(41), '\u0060exploit', 'u/s/e/r', 'Éric']) {
  assert.throws(() => serverEmail(invalid), undefined, `Server accepted ${JSON.stringify(invalid)}`);
  assert.throws(() => client.exports.emailForUsername(invalid), undefined, `Client accepted ${JSON.stringify(invalid)}`);
}
const functions = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
assert(functions.includes('email: emailForUsername(name)'), 'Provisioning does not use username mapping');
assert(functions.includes("const { normalizeUsername, emailForUsername } = require('./username')"));
const browser = fs.readFileSync(path.join(__dirname, '../src/ts/study/firebaseClient.ts'), 'utf8');
assert(browser.includes('signInWithEmailAndPassword(auth!, email, password)'), 'Login must use Firebase Auth');
assert(browser.includes('emailForUsername(username)'), 'Login not using username mapping');
const adminCreate = fs.readFileSync(path.join(__dirname, 'create-admin.js'), 'utf8');
assert(adminCreate.includes('emailForUsername(username)'));
assert(adminCreate.includes('superadmin !== true'), 'Admin creation must not promote non-admin accounts accidentally');
const vault = fs.readFileSync(path.join(__dirname, 'admin-vault.js'), 'utf8');
assert(vault.includes('const account = { username,'), 'Vault preparation must accept usernames');
assert(vault.includes('emailForUsername(username)'), 'Vault activation must map username');
const migrate = fs.readFileSync(path.join(__dirname, 'migrate-username.js'), 'utf8');
assert(migrate.includes('auth.updateUser(user.uid'), 'Migration must keep existing UID');
assert(migrate.includes('await ref.update({ username })'), 'Migration must update profile display');
assert(migrate.includes('await auth.revokeRefreshTokens(user.uid)'), 'Migration should revoke old sessions');
assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../functions/package.json'))).engines.node, '22');
const guide = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
assert(guide.includes('npm run admin:create -- leadresearcher'));
assert(guide.includes('npm run account:migrate --'));
assert(guide.includes('not an email address'));
console.log('PASS: server/client username mapping, case normalization, input validation, admin creation/vault, migration safety guards, Node 22, researcher guide');
