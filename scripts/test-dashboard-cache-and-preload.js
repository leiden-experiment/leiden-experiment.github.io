/** Dependency-free behavioral tests for login-time snapshot and participant preloading. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const base = path.join(__dirname, '../src/ts/study');
function compiled(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(base, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error('Unexpected dependency ' + name);
    return modules[name];
  }, Date, Math, JSON, Object, Array, Promise, Set, Error });
  return exports;
}
const types = compiled('types.ts');
const study = types.defaultStudySettings('Demo');
study.weeks = { '1': [
  { type: 'level', levelId: 'library:alpha', loops: 1, bpmIndex: 0 },
  { type: 'selection', choices: [
    { levelId: 'library:beta', loops: 1, bpmIndex: 0 },
    { levelId: 'library:alpha', loops: 2, bpmIndex: 0 },
    { levelId: 'legacy:Cheerful Bliss', loops: 1, bpmIndex: 0 }
  ], unlock: 'all', text: 'Pick a level', playthroughs: 0 }
], '2': [{ type: 'level', levelId: 'library:beta', loops: 1, bpmIndex: 0 }] };
const sampleLevel = () => ({ bpm: [120], layers: [{ id: 'programmatic', playable: true, nodes: [] }] });
let levelCalls = [];
const mocked = { getLevel: async id => { levelCalls.push(id); return { level: { data: sampleLevel() } }; } };
const preloader = compiled('participantPreload.ts', { './types': types, './firebaseClient': { studyApi: mocked }, '../util/restoreDesignerLevel': { restoreDesignerLevel: track => track } });
assert.deepEqual(Array.from(preloader.assignedLibraryLevelIds(study)), ['alpha', 'beta']);
(async () => {
  const reports = [];
  const loaded = await preloader.preloadAssignedLevels(study, (done, total) => reports.push([done, total]));
  assert.equal(Object.keys(loaded).length, 2);
  assert.deepEqual([...levelCalls].sort(), ['alpha','beta']);
  assert.equal(reports.at(-1)[0], 2);
  assert.equal(reports.at(-1)[1], 2);
  assert.equal(loaded.alpha.layers[0].soundLoopKeys.length, 0);
  assert.equal(loaded.alpha.layers[0].backgroundLayers.length, 0);
  assert.equal(preloader.studyTrackKey('alpha'), 'temp_level_library_alpha');
  assert.equal(preloader.studyTrackKeyForBpm('alpha', 147), 'temp_level_library_alpha_bpm_147');
  const customTempoStudy = structuredClone(study);
  customTempoStudy.weeks['1'][0].bpm = 147;
  customTempoStudy.weeks['1'][1].choices[1].bpm = 90;
  assert.deepEqual([...preloader.assignedLibraryBpms(customTempoStudy, 'alpha')].sort((a,b)=>a-b), [90,147]);
  assert(preloader.isStudyTrackKey(preloader.studyTrackKey('alpha')));
  levelCalls = [];
  mocked.getLevel = async () => { throw new Error('network unavailable'); };
  await assert.rejects(preloader.preloadAssignedLevels(study), /Could not download study level/);

  const account = { uid:'u1', studyId:'s1', username:'user1', role:'participant', active:true };
  const initial = { studies:[{ id:'s1', title:'One', enabled:true, revision:0 }], settings:{s1:study}, accounts:{s1:[account]},
    levels:[{id:'alpha',name:'Alpha'}], progress:{s1:{u1:{sessions:{'1':1}}}} };
  let snapshotCalls = 0, refreshCalls = 0;
  const mockedApi = {
    dashboardSnapshot: async () => { snapshotCalls++; await Promise.resolve(); return initial; },
    refreshStudyProgress: async () => { refreshCalls++; return { progress:{u1:{sessions:{'1':2}}} }; }
  };
  const { DashboardCache } = compiled('dashboardCache.ts', { './firebaseClient': { studyApi: mockedApi } });
  const cache = new DashboardCache();
  await Promise.all([cache.load(),cache.load(),cache.load()]);
  assert.equal(snapshotCalls, 1, 'concurrent page visits coalesce into one login fetch');
  await cache.load();
  assert.equal(snapshotCalls, 1, 'subsequent page visits do not hit Firebase');
  const draft = cache.settings('s1'); draft.title = 'Unsaved';
  assert.equal(cache.settings('s1').title, 'Demo', 'unsaved edits may not mutate the cached source');
  cache.saveStudy('s1', {...draft, title: 'Saved'}, '', 1);
  assert.equal(cache.studies()[0].title, 'Saved');
  cache.addAccount('s1', {uid:'u2',username:'user2',role:'participant',active:true});
  cache.updateAccount('u2', {group:'control'});
  assert.equal(cache.accounts('s1')[1].group, 'control');
  cache.removeAccount('u2'); assert.equal(cache.accounts('s1').length, 1);
  cache.addLevel({id:'beta',name:'Beta'}); cache.removeLevel('alpha');
  assert.equal(cache.levels()[0].id, 'beta');
  assert.equal(cache.progress('s1','u1').sessions['1'], 1);
  await cache.refreshProgress('s1');
  assert.equal(refreshCalls, 1);
  assert.equal(cache.progress('s1','u1').sessions['1'], 2);
  assert.equal(snapshotCalls, 1, 'progress refresh must not re-fetch the dashboard');
  cache.dispose();
  assert.throws(() => cache.studies(), /not loaded/);
  await assert.rejects(cache.load(), /session has ended/);
  console.log('PASS: dashboard snapshot coalescing, unsaved edits, in-memory mutations, progress refresh, logout clearing, deduplicated participant level preload, and failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
