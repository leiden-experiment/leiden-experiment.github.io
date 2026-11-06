'use strict';
/** Focused regressions for v1.8.13: result labels, participant refresh, session UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '..');
const text = file => fs.readFileSync(path.join(root, file), 'utf8');
function moduleFrom(file, modules = {}) {
  const compiled = ts.transpileModule(text(file), { fileName:file, compilerOptions:{ target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports:{} };
  vm.runInNewContext(compiled, { module:mod, exports:mod.exports, require:key => {
    if (!(key in modules)) throw new Error(`Missing test dependency: ${key}`);
    return modules[key];
  }, Date, Promise, Math, Array, Object, JSON, Set, Error }, { filename:file });
  return mod.exports;
}
const types = moduleFrom('src/ts/study/types.ts');
(async () => {
  const submitted = [];
  const fakeApi = { saveResult:async (result, token) => {
    submitted.push({ result,token });
    return { progress: { completed:{'1':['1-1:0']}, sessions:{'1':0}, activeSession:{'1':'1-1'}, choices:{} } };
  } };
  const runtime = moduleFrom('src/ts/study/runtime.ts', {
    './types': types,
    './firebaseClient':{ studyApi:fakeApi },
    './offline':{ loadLocalProgress:()=>({completed:{},sessions:{},activeSession:{},choices:{}}),
      saveLocalResult:async ()=>{}, saveLocalProgress:()=>{} }
  });
  const settings = types.defaultStudySettings('Example');
  const assigned = { type:'level',levelId:'library:internal-123',loops:1,bpmIndex:0 };
  settings.weeks = { '1':[assigned] };
  runtime.setStudySession({ mode:'online',settings,account:{ role:'participant', uid:'u1',studyId:'s1',participantId:'p1',username:'p1',active:true } },
    { completed:{},sessions:{},activeSession:{},choices:{} });
  runtime.setPendingAssignment(1,'1-1',0,1,assigned,undefined,undefined,'playtoken','STRUM3 – Intro');
  const backup = runtime.pendingResultBackup({ hits:[] });
  assert.equal(backup.levelId,'library:internal-123');
  assert.equal(backup.levelName,'STRUM3 – Intro');
  await runtime.recordLevelCompletion({ hits:[] });
  assert.equal(submitted.length,1,'exactly one play result should be sent');
  assert.equal(submitted[0].result.levelId,'library:internal-123');
  assert.equal(submitted[0].result.levelName,'STRUM3 – Intro');

  const state = { studies:[{id:'s1',title:'Example',enabled:true,revision:0}], settings:{s1:settings},
    accounts:{s1:[{ uid:'mod', username:'mentor',role:'moderator',studyId:'s1' },
      { uid:'u1', username:'p1',role:'participant',studyId:'s1' }]},
    levels:[], progress:{s1:{u1:{sessions:{'1':0}}}} };
  let fetchedProfiles = 0, fetchedProgress = 0;
  const cacheApi = {
    dashboardSnapshot:async()=>state,
    listParticipants:async()=>{ fetchedProfiles++; return { accounts:[
      { uid:'mod', username:'mentor',role:'moderator',studyId:'s1' },
      { uid:'u1',username:'p1',role:'participant',studyId:'s1',group:'control' },
      { uid:'u2',username:'p2',role:'participant',studyId:'s1' }] }; },
    refreshStudyProgress:async()=>{ fetchedProgress++; return { progress:{
      u1:{ sessions:{'1':1},lastCompletedSessionAt:'2026-11-06T11:01:00.000Z' },
      u2:{ sessions:{'1':0} }
    } }; }
  };
  const { DashboardCache } = moduleFrom('src/ts/study/dashboardCache.ts', { './firebaseClient':{studyApi:cacheApi} });
  const cache = new DashboardCache();
  await cache.load();
  assert.equal(cache.progress('s1','u1').sessions['1'],0,'initial dashboard uses login snapshot');
  await cache.refreshParticipants('s1');
  assert.equal(fetchedProfiles,1);
  assert.equal(fetchedProgress,1);
  assert.equal(cache.accounts('s1').length,3,'refresh finds new participants');
  assert.equal(cache.accounts('s1').find(x=>x.uid==='mod').role,'moderator','moderator is kept');
  assert.equal(cache.progress('s1','u1').lastCompletedSessionAt,'2026-11-06T11:01:00.000Z');
  cache.dispose();

  const scene = text('src/ts/scenes/studySessionScene.ts');
  assert(scene.includes('plays remaining') || scene.includes('play${remaining === 1'), 'selection should show remaining play quota');
  assert(scene.includes('selectable.length === 1 ? 64'), 'level selection text must be larger');
  assert(scene.includes('this.displayLevelName(assignment.levelId)'), 'record actual display name alongside levelId');
  const loading = text('src/ts/scenes/loadingScene.ts');
  assert(loading.includes('PREPARING ${visibleName}') && !loading.includes('PREPARING STUDY LEVEL ${id}'),
    'loading must show display name rather than internal id');
  const dashboard = text('src/ts/study/dashboard.ts');
  assert(dashboard.includes("'Refresh participant data'") && dashboard.includes('cache.refreshParticipants(study.id)'),
    'participants must have explicit current-data refresh');
  assert(text('src/ts/study/flowBoard.ts').includes('Number of plays of any selectable level combined'),
    'play count input requires a combined-quota tooltip');
  assert(text('src/ts/study/types.ts').includes('levelName?: string'), 'result type retains display name');
  console.log('PASS: server-bound level display names, backups, refreshing participant sessions and profiles, named preload, remaining-play indicator and quota help');
})().catch(error=>{console.error(error);process.exitCode=1;});
