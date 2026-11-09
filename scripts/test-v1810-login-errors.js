/** Regression coverage for researcher-friendly login errors (no Firebase required). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = (() => { try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'src/ts/study/loginErrors.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
  fileName:sourceFile,
  compilerOptions:{ target:ts.ScriptTarget.ES2018,module:ts.ModuleKind.CommonJS,strict:true },
  reportDiagnostics:true
});
assert(!compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error), 'Login error mapper must parse as TypeScript');
const mod = new Module(sourceFile, module); mod.filename = sourceFile; mod._compile(compiled.outputText, sourceFile);
const format = mod.exports.friendlyLoginError;
for (const code of ['auth/invalid-credential','auth/invalid-login-credentials','auth/user-not-found',
  'auth/wrong-password','auth/invalid-email']) {
  assert.equal(format({ code, message:`Firebase: Error (${code}).` }), 'Invalid username or password.');
}
const cases = [
  ['auth/user-disabled','Account disabled by admin.'],
  ['auth/too-many-requests','Too many login attempts. Please try again later.'],
  ['auth/network-request-failed','Unable to connect. Check your internet connection and try again.'],
  ['functions/unavailable','Unable to connect. Check your internet connection and try again.'],
  ['auth/operation-not-allowed','Login is not enabled. Please contact an administrator.'],
  ['auth/unauthorized-domain','This website is not configured for login. Please contact an administrator.'],
  ['functions/unauthenticated','Your login session expired. Please sign in again.'],
  ['functions/permission-denied','You do not have access to this study. Please contact a researcher.'],
  ['functions/resource-exhausted','The login service is temporarily busy. Please try again later.'],
];
for (const [code, expected] of cases) assert.equal(format({code}),expected);
assert.equal(format(new Error('Invalid offline account')), 'Invalid username or password.');
assert.equal(format(new Error('Enter a username (4–40 characters).')), 'Enter a username (4–40 characters).');
assert(!format({code:'auth/not-a-real-code',message:'Firebase: Error (auth/not-a-real-code).'}).includes('auth/'));
assert.equal(format(null),'Could not sign in. Please try again.');
const game = fs.readFileSync(path.join(root,'src/ts/core/game.ts'),'utf8');
assert(game.includes("import { friendlyLoginError } from '../study/loginErrors'"));
assert.equal((game.match(/friendlyLoginError\(reason\)/g)||[]).length,2,
  'Both online/offline login and offline-pack import must display friendly errors');
assert(/^1\.8\.(?:10|1[1-9]|[2-9]\d)$/.test(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version));
console.log('PASS: readable Firebase login errors, enumeration-safe invalid credentials, offline errors, login UI wiring');
