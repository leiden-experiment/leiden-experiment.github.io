/* Dependency-free when TypeScript is installed globally; uses project's TypeScript otherwise. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const cache = new Map();
function requireTS(filename) {
  const file = path.resolve(__dirname, filename);
  if (cache.has(file)) return cache.get(file).exports;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = new Module(file, module); m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, m); m.require = function (id) { if (id.startsWith('.')) return requireTS(path.resolve(path.dirname(file), `${id}.ts`)); return require(id); };
  m._compile(code, file); return m.exports;
}
const types = requireTS('../src/ts/study/types.ts');
const { defaultStudySettings, validateSettings, calculateStudyWeek, emptyProgress, getNextAssignment, markAssignmentComplete } = types;
const study = defaultStudySettings('Study A');
study.startDate = '2026-10-26'; study.maxSessionsPerWeek = 2;
study.weeks['1'] = [{ levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 3 }];
study.weeks['0'] = [{ levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 2 }];
study.weeks['2'] = [{ levelId: 'library:newOne', bpmIndex: 1, loops: 3 }];
study.weeks['-1'] = [{ levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 2 }];
assert.deepEqual(validateSettings(study), []);
assert.equal(calculateStudyWeek('2026-10-26', new Date('2026-10-26T10:00Z')), 1);
assert.equal(calculateStudyWeek('2026-10-26', new Date('2026-11-02T10:00Z')), 2);
assert.equal(calculateStudyWeek('2026-03-23', new Date('2026-03-30T13:00Z')), 2);
assert.equal(getNextAssignment(study, emptyProgress(), study.startDate, new Date('2026-10-25T12:00:00Z')).week, 0);
assert.equal(getNextAssignment(study, { ...emptyProgress(), sessions: { '0': 1 } }, study.startDate, new Date('2026-11-16T12:00:00Z')).week, -1);
let p = { ...emptyProgress(), sessions: { '0': 1 } };
let step = getNextAssignment(study, p, study.startDate, new Date('2026-10-28T12:00Z'));
assert.equal(step.index, 0); assert.equal(step.sessionId, '1-1');
p = markAssignmentComplete(p, step.week, step.sessionId, step.index, step.assignments.length);
assert.equal(p.sessions['1'], 1);
step = getNextAssignment(study, p, study.startDate, new Date('2026-10-28T12:00Z'));
assert.equal(step.sessionId, '1-2');
p = markAssignmentComplete(p, step.week, step.sessionId, step.index, step.assignments.length);
assert.equal(getNextAssignment(study, p, study.startDate, new Date('2026-10-28T12:00Z')).capped, true);
// Non-weekly studies always use week 1 and are not limited to weekly sessions.
const freeStudy = { ...study, weeklyEnabled: false, dateRangeEnabled: false, weeks: { '1': [{ levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 2 }] } };
assert.deepEqual(validateSettings(freeStudy), []);
assert.equal(getNextAssignment(freeStudy, { ...emptyProgress(), sessions: { '1': 100 } }, freeStudy.startDate, new Date('2027-05-01T00:00:00Z')).week, 1);
assert.equal(getNextAssignment({ ...freeStudy, weeks: { ...freeStudy.weeks, '0': study.weeks['0'] } }, emptyProgress(), freeStudy.startDate, new Date('2027-05-01T00:00:00Z')).week, 1);
assert.equal(getNextAssignment(freeStudy, { ...emptyProgress(), sessions: { '1': 100 } }, freeStudy.startDate, new Date('2027-05-01T00:00:00Z')).capped, false);
const boundedStudy = { ...freeStudy, dateRangeEnabled: true, endDate: '2026-11-01' };
assert.equal(getNextAssignment(boundedStudy, emptyProgress(), boundedStudy.startDate, new Date('2026-11-02T00:00:00Z')).capped, true);
assert.equal(getNextAssignment(boundedStudy, emptyProgress(), boundedStudy.startDate, new Date('2026-11-02T00:00:00Z')).afterEnd, true);
assert(validateSettings({ ...boundedStudy, endDate: '2026-01-01' }).length > 0);
// Participant-specific duration, first-login anchored scheduling and completion.
const perPerson = { ...freeStudy, durationWeeks: 3, participantStartMode: 'first-login' };
assert.deepEqual(validateSettings(perPerson), []);
assert.equal(getNextAssignment(perPerson, emptyProgress(), '2026-10-26', new Date('2026-11-09T12:00:00Z')).afterEnd, false);
assert.equal(getNextAssignment(perPerson, emptyProgress(), '2026-10-26', new Date('2026-11-16T12:00:00Z')).afterEnd, true);
assert.equal(getNextAssignment(perPerson, emptyProgress(), '2026-11-09', new Date('2026-11-09T12:00:00Z')).afterEnd, false);
assert.equal(getNextAssignment(perPerson, emptyProgress(), '2026-11-09', new Date('2026-11-08T12:00:00Z')).beforeStart, true);
assert.equal(getNextAssignment({ ...perPerson, dateRangeEnabled: true, startDate: '2026-11-15' }, emptyProgress(), '2026-11-09', new Date('2026-11-10T12:00:00Z')).beforeStart, true); // global start still enforced
assert(validateSettings({ ...perPerson, durationWeeks: 0 }).length > 0);
assert(validateSettings({ ...perPerson, durationWeeks: 105 }).length > 0);
const finite = { ...study, weeks: { '1': [{ levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 2 }] }, weeklyEnabled: true,
  dateRangeEnabled: false, durationWeeks: 1 };
assert.equal(getNextAssignment(finite, emptyProgress(), '2026-11-02', new Date('2026-11-10T12:00:00Z')).afterEnd, true);
const backendCode = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
assert(backendCode.includes('studyTiming(settings, account, weeks, progress)'));
assert(backendCode.includes('studyTiming(settings, account, weeks, progress)'));
const screens = defaultStudySettings('Visual study');
assert.deepEqual(validateSettings(screens), []);
assert.equal(screens.weeks['1'][0].type, 'start');
let screenProgress = emptyProgress();
for (let i = 0; i < screens.weeks['1'].length - 1; i++) {
  const currentStep = getNextAssignment(screens, screenProgress, screens.startDate, new Date(`${screens.startDate}T10:00:00Z`));
  assert.equal(currentStep.index, i);
  screenProgress = markAssignmentComplete(screenProgress, 1, '1-1', i, screens.weeks['1'].length);
}
assert.equal(screenProgress.sessions['1'], undefined);
screenProgress = markAssignmentComplete(screenProgress, 1, '1-1', screens.weeks['1'].length - 1, screens.weeks['1'].length);
assert.equal(screenProgress.sessions['1'], 1);
const malformedScreen = { ...screens, weeks: { '1': [{ type: 'break', text: 'Only a break' }] } };
assert(validateSettings(malformedScreen).length > 0);
const multi = { ...study, weeks: { '1': [{ levelId: 'legacy:One', bpmIndex: 0, loops: 2 }, { levelId: 'library:Second', bpmIndex: 1, loops: 2 }] } };
let m = emptyProgress(); m = markAssignmentComplete(m, 1, '1-1', 0, 2);
assert.equal(m.sessions['1'], undefined); assert.equal(m.activeSession['1'], '1-1');
m = markAssignmentComplete(m, 1, '1-1', 1, 2); assert.equal(m.sessions['1'], 1);
const invalid = { ...study, weeks: { '1': [{ levelId: '../secret', bpmIndex: -1, loops: 0 }] } };
assert.equal(validateSettings(invalid).length, 3);
assert.match(requireTS('../src/ts/study/results.ts').resultsCSV([{ participantId: '=HYPERLINK("oops")', result: { a: 1 } }]), /'\=HYPERLINK/);

const leiden = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../configs/leiden-study-template.json')));
assert.deepEqual(validateSettings(leiden), []);
for (const week of Object.values(leiden.weeks)) for (const a of week) if (a.levelId.startsWith('legacy:'))
  assert(fs.existsSync(path.resolve(__dirname, '../src/levels', a.levelId.slice(7), 'info.json')));
const oldConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../configs/leiden-conditions.json')));
assert.deepEqual(Object.keys(oldConfig).sort(), ['both', 'nosound', 'sonification', 'synchronization']);

const dbRules = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../database.rules.json')));
assert.equal(dbRules.rules['.read'], false); assert.equal(dbRules.rules['.write'], false);
const source = fs.readFileSync(path.resolve(__dirname, '../functions/index.js'), 'utf8');
assert(source.includes('req.auth.token.superadmin === true'));
assert(source.includes('requireResearcher(operator, studyId)'));
const files = [];
function walk(folder) { for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
  const p = path.join(folder, item.name); if (item.isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p);
} }
walk(path.resolve(__dirname, '../src/ts'));
const diagnostics = files.flatMap(file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ES2015, target: ts.ScriptTarget.ES2015 }
}).diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).map(d => `${file}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`));
assert.equal(diagnostics.length, 0, diagnostics.join('\n'));
(async () => {
  const { webcrypto } = require('node:crypto');
  global.crypto = webcrypto;
  global.window = {};
  const store = new Map();
  global.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, val) => store.set(key, val),
    removeItem: key => store.delete(key)
  };
  const offline = requireTS('../src/ts/study/offline.ts');
  const account = { uid: 'uid1', username: 'subject0001', studyId: 'pilot', participantId: 'subject0001',
    role: 'participant', group: 'both', active: true };
  const pack = await offline.createOfflinePack(account, study, 'this-is-a-long-secret');
  assert(!JSON.stringify(pack).includes('this-is-a-long-secret'));
  offline.importOfflinePack(pack);
  assert.equal((await offline.loginOffline('subject0001', 'this-is-a-long-secret')).account.uid, 'uid1');
  await assert.rejects(offline.loginOffline('subject0001', 'bad-password'));
  const result = { schemaVersion: 1, studyId: 'pilot', participantId: 'subject0001', group: 'both',
    sessionId: '1-1', assignmentIndex: 0, week: 1, levelId: 'legacy:Trained',
    completedAt: '2026-10-28T12:00:00Z', result: { score: 17 } };
  await offline.saveLocalResult(result, emptyProgress());
  assert.deepEqual(await offline.getLocalResults('pilot', 'subject0001'), [result]);
  console.log(`PASS: study schedules, progression, Leiden template/media, offline pack login/results, rules, CSV escaping, and ${files.length} TypeScript sources parse`);
})().catch(err => { console.error(err); process.exitCode = 1; });
