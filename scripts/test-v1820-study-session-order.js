'use strict';
/** Compile the actual StudySessionScene step-selection declarations.
 * Guards against TS2448/TS2454 (use of `step` before declaration) even when
 * full Phaser/Webpack dependencies cannot be installed in CI. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/ts/scenes/studySessionScene.ts');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'StudySessionScene');
assert(cls, 'Expected StudySessionScene class');
const create = cls.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === 'create');
assert(create?.body, 'Expected create() method');
const statements = create.body.statements.filter(ts.isVariableStatement);
function findDeclaration(name) {
  const stmt = statements.find(s => s.declarationList.declarations.some(d => d.name.getText(ast) === name));
  assert(stmt, `Missing ${name} declaration in create()`);
  return stmt;
}
const step = findDeclaration('step');
const selection = findDeclaration('isSelectionScreen');
const prefix = 'declare function isSelectionStep(x: unknown): boolean; declare const plan: any;\n';
function diagnostics(snippet) {
  const virtualFile = path.join(root, 'scripts', '__temporary_study_session.ts');
  const options = {target:ts.ScriptTarget.ES2015, module:ts.ModuleKind.ES2015,
    strict:true, noEmit:true, skipLibCheck:true, types:[], lib:['lib.esnext.d.ts']};
  const host=ts.createCompilerHost(options);
  const original=host.getSourceFile.bind(host);
  host.getSourceFile=(name,...rest) => name===virtualFile
    ? ts.createSourceFile(name, snippet, ts.ScriptTarget.Latest, true)
    : original(name,...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([virtualFile], options, host));
}
const originalDeclarations = [step, selection].sort((a,b)=>a.pos-b.pos)
  .map(s=>s.getText(ast)).join('\n');
assert.equal(diagnostics(prefix + originalDeclarations).length, 0,
  'StudySessionScene create() has a TypeScript error in its step-selection declarations');
const deliberateRegression = prefix + selection.getText(ast) + '\n' + step.getText(ast);
assert(diagnostics(deliberateRegression).some(d=>d.code===2448 || d.code===2454),
  'Regression test must catch a use-before-declaration ordering');
console.log('PASS: StudySessionScene step declaration type-checks before selection-screen usage');
