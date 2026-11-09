/** Regression checks for the 1.8.9 TypeScript, study-group UI and conflict fixes.
 * No Firebase or browser dependencies are required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const scene = read('src/ts/scenes/studySessionScene.ts');
const types = read('src/ts/level/trackTypes.ts');
const libraryNameCase = scene.match(/if \(kind === 'library'\) \{([\s\S]*?)\n    \}/);
assert(libraryNameCase, 'Published level display-name lookup must exist');
assert(!libraryNameCase[1].includes('publishedLevels[id]?.displayName'), 'Cannot access displayName directly on unknown');
// Use TypeScript's real semantic checker to catch the original TS2339 failure.
const stub = `
  const publishedLevels: Record<string, unknown> = {};
  const id: string = '';
  const published = publishedLevels[id];
  const visibleName = ${libraryNameCase[1].match(/return ([\s\S]*?);/)[1]};
  void visibleName;
`;
const opts = { noEmit:true, strict:true, target:ts.ScriptTarget.ES2020, lib:['lib.es2020.d.ts'], types:[] };
const virtualName = path.join(root, 'scripts', '__v189_name_check.ts');
const host = ts.createCompilerHost(opts);
const getOriginal = host.getSourceFile.bind(host);
host.getSourceFile = (name, version, ...args) => name === virtualName ? ts.createSourceFile(name, stub, version) : getOriginal(name,version,...args);
const program = ts.createProgram([virtualName],opts,host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
const board = read('src/ts/study/dashboard.ts');
assert(board.includes("action(heading, '×'"),'Group removal must be in the heading');
assert(board.includes("'study-group-remove'"),'Group X must have a dedicated class');
assert(!board.includes("'Remove group'"),'No full-width Remove group action');
const css = read('src/css/study.css');
assert(css.includes('.study-admin-dashboard .study-group-heading > .study-group-remove'));
const funcs = read('functions/index.js');
assert(funcs.includes('current == null && existing != null ? existing : current'),
  'RTDB transaction must use the read revision when the first callback is null');
assert(funcs.includes('if (revision !== acceptedRevision) return;'),
  'Genuine concurrent revisions must still be rejected');
assert(/^1\.8\.(?:9|[1-9][0-9]+)$/.test(JSON.parse(read('package.json')).version));
console.log('PASS: semantic TypeScript published-level lookup, top-right group delete, cold-cache revision fallback and true-conflict guard');
