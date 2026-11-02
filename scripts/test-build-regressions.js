/** Type-check the affected TypeScript files with isolated stand-ins for SDK imports.
 * This runs without installing Firebase, Phaser, or webpack and therefore does NOT
 * replace a full `npm run build` with installed dependencies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => {
  try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
})();

const root = path.resolve(__dirname, '..');
const studyDir = path.join(root, 'src/ts/study');
const dashboard = path.join(studyDir, 'dashboard.ts');
const runtime = path.join(studyDir, 'runtime.ts');
const types = path.join(studyDir, 'types.ts');
const demo = path.join(studyDir, '__build-regression-check.ts');
const source = (file) => fs.readFileSync(file, 'utf8');

const webpackConfig = source(path.join(root, 'webpack/webpack.common.js'));
assert(webpackConfig.includes('ignoreWarnings:'), 'MediaPipe warning filter missing');
const mediaPipeWarning = /[\\/]@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.mjs$/;
assert(mediaPipeWarning.test('/build/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'));
assert(mediaPipeWarning.test('C:\\app\\node_modules\\@mediapipe\\tasks-vision\\vision_bundle.mjs'));
assert(!mediaPipeWarning.test('/build/node_modules/other/vision_bundle.mjs'));
assert(webpackConfig.includes('message: /Critical dependency: the request of a dependency is an expression/'));
assert(!source(dashboard).includes('await import('), 'ES2015 module target cannot use dynamic imports');

const streak = source(path.join(root, 'src/ts/level/streak.ts'));
const match = streak.match(/Math\.floor\(tween\.getValue\(\) \?\? 0\)/);
assert(match, 'Null-safe Phaser tween value missing');

// Keep the real dashboard, runtime and types files. Only external SDK / UI
// dependencies are replaced by minimal declaration-compatible test modules.
const mockModules = new Map([
  [path.join(studyDir, 'firebaseClient.ts'), `
    export const studyApi: any = {};
    export async function callBackend<T>(name: string, data: object): Promise<T> { return null as T; }
  `],
  [path.join(studyDir, 'offline.ts'), `
    import { Progress, ResultEnvelope } from './types';
    export function loadLocalProgress(studyId: string, participantId: string): Progress { return null as any; }
    export function saveLocalProgress(studyId: string, participantId: string, progress: Progress): void {}
    export async function saveLocalResult(result: ResultEnvelope, progress: Progress): Promise<void> {}
    export async function createOfflinePack(...args: any[]): Promise<any> { return null; }
    export function downloadFile(...args: any[]): void {}
  `],
  [path.join(studyDir, 'results.ts'), 'export function resultsCSV(...args: any[]): string { return ""; }'],
  [path.join(root, 'src/ts/util/levelConverter.ts'), 'export const LevelConverter: any = {};'],
]);
const extra = `
  declare function testTween(): { getValue(): number | null };
  const index: number = ${match[0].replace('tween', 'testTween()')};
`;
const compilerOptions = {
  target: ts.ScriptTarget.ES2015,
  module: ts.ModuleKind.ES2015,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  strict: true,
  noImplicitAny: false,
  skipLibCheck: true,
  noEmit: true,
  types: [],
  lib: ['lib.dom.d.ts', 'lib.esnext.d.ts'],
};
const host = ts.createCompilerHost(compilerOptions);
const baseGetSourceFile = host.getSourceFile.bind(host);
host.fileExists = ((original) => (file) => file === demo || original(file))(host.fileExists.bind(host));
host.readFile = ((original) => (file) => file === demo ? extra : mockModules.get(file) || original(file))(host.readFile.bind(host));
host.getSourceFile = (file, version, onError, createNew) => {
  if (file === demo) return ts.createSourceFile(file, extra, version);
  if (mockModules.has(file)) return ts.createSourceFile(file, mockModules.get(file), version);
  return baseGetSourceFile(file, version, onError, createNew);
};
const program = ts.createProgram([dashboard, runtime, types, demo], compilerOptions, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
console.log('PASS: dashboard, flow board, gameplay fields and runtime TS type-check under ES2015; nullable tween value; MediaPipe warning filter limited to its own bundle');
