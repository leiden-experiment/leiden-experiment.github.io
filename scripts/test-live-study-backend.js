/** Exercise the real Functions handlers with an in-memory RTDB/Auth stub.
 * Covers the reported post-play 400, idempotency, and study-DB delivery failure.
 * This is NOT a live Firebase integration test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function database() {
  const store = {};
  let failDelivery = false;
  function at(path) { const keys = path.split('/').filter(Boolean); return keys.reduce((item, key) => item?.[key], store); }
  function put(path, value) {
    const keys = path.split('/').filter(Boolean);
    if (!keys.length) { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, clone(value) || {}); return; }
    let ptr = store;
    for (const key of keys.slice(0,-1)) ptr = (ptr[key] ||= {});
    const last = keys.at(-1);
    if (value === null || value === undefined) delete ptr[last];
    else ptr[last] = clone(value);
  }
  function reference(path='') { return {
    child: key => reference([path,key].filter(Boolean).join('/')),
    get: async () => ({ val: () => clone(at(path)), exists: () => at(path) !== undefined }),
    set: async value => { if (failDelivery && path.includes('results/')) throw Error('Destination unavailable'); put(path,value); },
    remove: async () => put(path,null),
    update: async changes => { for (const [key,value] of Object.entries(changes)) put([path,key].filter(Boolean).join('/'),value); },
    transaction: async updater => {
      if (failDelivery && path.includes('results/')) throw Error('Destination unavailable');
      const next = updater(clone(at(path)));
      if (next === undefined) return { committed:false, snapshot:{ val: () => clone(at(path)) } };
      put(path,next);
      return { committed:true, snapshot:{ val: () => clone(at(path)) } };
    }
  }; }
  return { ref:reference, store, setFailDelivery:value=> { failDelivery=value; } };
}
const central=database();
const studyDatabase=database();
let apps=[];
const authUsers=new Map([['user-one', { disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z' }],
  ['admin-one',{disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z'}]]);
const authentication = {
  getUser: async uid => ({ uid, ...authUsers.get(uid) }),
  updateUser: async (uid, change) => Object.assign(authUsers.get(uid), change)
};
const code=fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
class HttpsError extends Error { constructor(code,msg){ super(msg); this.code=code; } }
const moduleObject={exports:{}};
const fauxRequire=name => {
  if (name === 'firebase-functions/v2/https') return { onCall: (_, handler) => handler, HttpsError };
  if (name === 'firebase-admin') return {};
  if (name === 'node:crypto') return require('node:crypto');
  if (name === 'firebase-admin/app') return {
    getApps: () => apps, initializeApp: (args={}, name='[DEFAULT]') => { const app={name,options:args}; apps.push(app); return app; },
    applicationDefault: () => ({})
  };
  if (name === 'firebase-admin/database') return { getDatabase: app => app?.options?.databaseURL ? studyDatabase : central };
  if (name === 'firebase-admin/auth') return { getAuth: () => authentication };
  if (name.startsWith('./')) return require(path.join(root,'functions', name));
  throw Error('Unexpected import '+name);
};
vm.runInNewContext(code, {require:fauxRequire, exports:moduleObject.exports,module:moduleObject,URL,Buffer,Date,Number,JSON,Math,Object,Array,String,Set}, {filename:'functions/index.js'});
const api=moduleObject.exports;
const originalSaveStudy = api.saveStudy;
// Simulate the current browser sending the revision it received at login.
api.saveStudy = req => originalSaveStudy({ ...req, data: { ...req.data, expectedRevision: Number(central.store.studies?.[req.data.id]?.revision || 0) } });
const request=(uid,data={})=>({auth:{uid,token:{auth_time:1}},data});
// Test the actual TypeScript normalization used by the visual timeline editor.
const typescript = (() => { try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const studyTypesSource = fs.readFileSync(path.join(root, 'src/ts/study/types.ts'), 'utf8');
const compiledTypes = typescript.transpileModule(studyTypesSource,
  { compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS } }).outputText;
const studyTypesExports = {};
vm.runInNewContext(compiledTypes, { exports: studyTypesExports, Date, Number, Math, Object, Array, JSON },
  { filename: 'study/types.ts' });
const { normalizeStudyWeeks, defaultStudySettings } = studyTypesExports;
const sampleSteps = defaultStudySettings().weeks['1'];
assert.equal(sampleSteps.length, 5, 'new single-session studies should have a visible default timeline');
assert.equal(normalizeStudyWeeks([null, sampleSteps])['1'].length, 5,
  'the editor must show slides decoded from a numeric-keyed Firebase array');
assert.equal(normalizeStudyWeeks({ 1: sampleSteps })['1'].length, 5);
assert.throws(() => normalizeStudyWeeks({ 1: { broken: true } }), /Cannot read saved slides/,
  'malformed saved timelines must fail visibly instead of silently clearing slides');
const settings={title:'Test',enabled:true,weeklyEnabled:false,dateRangeEnabled:false,startDate:'2026-10-28',
  maxSessionsPerWeek:3,weeks:{1:[{type:'start',text:'Welcome'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:2},{type:'end',text:'Thank you'}]}};
const result={schemaVersion:1,studyId:'research1',participantId:'participant01',group:'',sessionId:'1-1',week:1,assignmentIndex:1,
  levelId:'legacy:Trained',result:{layersStats:[{total:30, correct:20}]},completedAt:'2026-11-02T12:00:00Z'};
(async()=>{
  await central.ref('studies/research1/settings').set(settings);
  await central.ref('studyIndex/research1').set({title:'Test',enabled:true,databaseURL:''});
  await central.ref('accounts/user-one').set({uid:'user-one',username:'participant01',participantId:'participant01',studyId:'research1',role:'participant',active:true});
  await central.ref('accounts/admin-one').set({uid:'admin-one',username:'owner',role:'admin',active:true});
  await central.ref('studyMembers/research1/user-one').set(true);
  // An RTDB-empty timeline can be returned as null. No-schedule studies must
  // still save/reload cleanly with the central database as their default.
  const emptyStudy = await api.saveStudy(request('admin-one', {
    id: 'emptytest', settings: {...settings, title:'No weekly restrictions',weeks:null}
  }));
  assert.equal(emptyStudy.id,'emptytest');
  const snapshot = await api.getDashboardSnapshot(request('admin-one'));
  assert(snapshot.studies.some(study => study.id === 'research1'));
  assert(snapshot.accounts.research1.some(account => account.username === 'participant01'));
  assert(snapshot.settings.research1.weeks['1'].length === 3);
  assert.equal(snapshot.levels.length, 0);
  assert(!Object.values(snapshot.progress.research1 || {}).some(item => Object.hasOwn(item, 'pendingResults')));
  const moderatorOnly = await api.refreshStudyProgress(request('admin-one',{studyId:'research1'}));
  assert.deepEqual(Object.keys(moderatorOnly.progress), []);
  // A stale editor must not overwrite a newer study configuration.
  await assert.rejects(originalSaveStudy(request('admin-one', {
    id: 'emptytest', expectedRevision: 0, settings: { ...settings, title: 'Stale version' }
  })), /changed in another session/);

  const emptySaved = await api.getStudySettings(request('admin-one',{studyId:'emptytest'}));
  assert.deepEqual(JSON.parse(JSON.stringify(emptySaved.settings.weeks)), {'1':[]});
  assert(!emptySaved.databaseURL, 'linked results database is optional');
  // Firebase RTDB returns an array rather than an object when all week keys
  // are numeric. This was dropping every slide when reopening single-session studies.
  const authoredSlides = clone(settings.weeks[1]);
  await central.ref('studies/numericweek/settings').set({ ...settings,
    weeks: [null, authoredSlides] }); // Exactly what RTDB can return for week '1'.
  await central.ref('studyIndex/numericweek').set({title: 'Numeric', enabled:true});
  const loaded = await api.getStudySettings(request('admin-one',{studyId:'numericweek'}));
  assert.equal(loaded.settings.weeks['1'].length, 3, 'the week-1 slides must survive Firebase array decoding');
  assert.equal(loaded.settings.weeks['1'][1].levelId, 'legacy:Trained');
  await api.saveStudy(request('admin-one',{id:'numericweek',settings:{...loaded.settings,title:'Renamed'}}));
  const reopened = await api.getStudySettings(request('admin-one',{studyId:'numericweek'}));
  assert.equal(reopened.settings.weeks['1'].length, 3, 'editing and saving must preserve slides');
  await api.saveStudy(request('admin-one',{id:'numericweek',settings:{...reopened.settings, weeklyEnabled:true}}));
  const weeklyReload = await api.getStudySettings(request('admin-one',{studyId:'numericweek'}));
  assert.equal(weeklyReload.settings.weeks['1'].length, 3, 'switching to weekly must preserve slides');
  await assert.rejects(api.saveStudy(request('admin-one',{id:'numericweek',settings:{...weeklyReload.settings,weeks:{'1':[]}}})),
    /Confirm clearing the timeline/, 'accidental empty saves must be rejected');
  const stillIntact = await api.getStudySettings(request('admin-one',{studyId:'numericweek'}));
  assert.equal(stillIntact.settings.weeks['1'].length, 3, 'rejected save must not change slides');
  await api.saveStudy(request('admin-one',{id:'numericweek',settings:{...weeklyReload.settings,weeks:{'1':[]}},confirmClearTimeline:true}));
  assert.deepEqual(JSON.parse(JSON.stringify((await api.getStudySettings(request('admin-one',{studyId:'numericweek'}))).settings.weeks)),{'1':[]});
  await assert.rejects(api.preparePlay(request('user-one', {week:1,sessionId:'1-1',index:1,levelId:'legacy:Trained'})),
    /progress or assignment has changed/, 'Server must not authorize playing a later slide');
  let done=await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:0,stepType:'start'}));
  assert(done.ok && done.progress.completed['1'].includes('1-1:0'));
  const permitted = await api.preparePlay(request('user-one', {week:1,sessionId:'1-1',index:1,levelId:'legacy:Trained'}));
  assert(permitted.ok && permitted.progress.completed['1'].includes('1-1:0'));
  await assert.rejects(api.preparePlay(request('user-one', {week:1,sessionId:'1-1',index:1,levelId:'legacy:Nosound'})),
    /progress or assignment has changed/, 'Server must reject a different level');
  await assert.rejects(api.submitResult(request('user-one',{data:result,playToken:'0'.repeat(48)})), /authorization/, 'forged plays must be rejected');
  const first=await api.submitResult(request('user-one',{data:result,playToken:permitted.playToken}));
  assert(first.ok && !first.queued);
  assert(first.progress.completed['1'].includes('1-1:1'));
  assert.equal((await central.ref('results/research1/user-one/1-1_1_0').get()).val().result.layersStats[0].correct,20);
  const repeat=await api.submitResult(request('user-one',{data:result,playToken:permitted.playToken}));
  assert(repeat.ok);
  assert.equal(repeat.progress.completed['1'].length,2,'a duplicate cannot advance the study');
  // Linked results database is unavailable: central durable outbox retains submission.
  await central.ref('studyIndex/research1/databaseURL').set('https://study-test-default-rtdb.europe-west1.firebasedatabase.app/');
  const firstEnd = await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:2,stepType:'end'}));
  assert.match(firstEnd.progress.lastCompletedSessionAt, /^\d{4}-\d{2}-\d{2}T/, 'full-session completion must record timestamp');
  const repeatEnd = await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:2,stepType:'end'}));
  assert(repeatEnd.resynced, 'repeating an already-completed screen must return current progress instead of 400');
  assert.equal(repeatEnd.progress.lastCompletedSessionAt, firstEnd.progress.lastCompletedSessionAt);

  const nextSessionStart=await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:0,stepType:'start'}));
  assert(nextSessionStart.ok);
  studyDatabase.setFailDelivery(true);
  const nextPermit=await api.preparePlay(request('user-one', {week:1,sessionId:'1-2',index:1,levelId:'legacy:Trained'}));
  const nextResult={...result,sessionId:'1-2'};
  const queued=await api.submitResult(request('user-one',{data:nextResult,playToken:nextPermit.playToken}));
  assert(queued.ok && queued.queued && queued.progress.completed['1'].includes('1-2:1'));
  assert((await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val(), 'result is durable while study database is offline');
  // Navigating past the level must not erase pending results.
  await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:2,stepType:'end'}));
  assert((await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val(), 'advancing a screen must retain the undelivered result');
  const exported=await api.exportResults(request('admin-one',{studyId:'research1'}));
  assert(exported.results.some(v=>v.sessionId==='1-2' && v.deliveryStatus==='awaiting-delivery'), 'pending result must be exportable');
  studyDatabase.setFailDelivery(false);
  const retry=await api.submitResult(request('user-one',{data:nextResult,playToken:nextPermit.playToken}));
  assert(retry.ok && !retry.queued);
  assert(!(await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val());
  assert((await studyDatabase.ref('results/research1/user-one/1-2_1_0').get()).val());
  // A play authorized before a researcher edits the schedule must never be lost:
  // it is saved for review without inventing a matching progression update.
  await central.ref('studyIndex/research1/databaseURL').set('');
  await central.ref('studies/research1/settings/weeks/1').set(settings.weeks[1]);
  await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-3',index:0,stepType:'start'}));
  const stalePermit = await api.preparePlay(request('user-one',{week:1,sessionId:'1-3',index:1,levelId:'legacy:Trained'}));
  // Reproduce the reported 400: another session moves the server progress
  // after this level was authorized, without erasing its recorded result.
  const progressBefore = (await central.ref('progress/research1/user-one').get()).val();
  await central.ref('progress/research1/user-one/activeSession/1').set('1-99');
  const retained = await api.submitResult(request('user-one',{data:{...result,sessionId:'1-3'},playToken:stalePermit.playToken}));
  assert(retained.ok && retained.reviewRequired, 'progress drift must archive a play for review instead of returning 400');
  const archived=(await central.ref('results/research1/user-one/1-3_1_0').get()).val();
  assert(archived && archived.reviewRequired, 'the admin database must store pre-authorized plays with reviewRequired flag');
  assert(!(await central.ref('progress/research1/user-one').get()).val().completed['1'].includes('1-3:1'), 'progress mismatch must not fabricate completion');
  await central.ref('progress/research1/user-one/activeSession/1').set(progressBefore.activeSession['1']);
  await central.ref('levelLibrary/testlevel').set({id:'testlevel',name:'Test'});
  await central.ref('levelIndex/testlevel').set({id:'testlevel',name:'Test'});
  await central.ref('studies/research1/settings/weeks/1').set([{type:'level',levelId:'library:testlevel'}]);
  await assert.rejects(api.removeLevel(request('admin-one',{id:'testlevel'})), /used by a study/);
  await central.ref('studies/research1/settings/weeks/1').set([{type:'level',levelId:'legacy:Trained'}]);
  assert((await api.removeLevel(request('admin-one',{id:'testlevel'}))).ok);
  assert(!(await central.ref('levelIndex/testlevel').get()).exists());
  await api.removeStudy(request('admin-one',{studyId:'research1'}));
  assert(!(await central.ref('studyIndex/research1').get()).exists());
  assert((await central.ref('studies/research1/settings').get()).val().enabled===false);
  assert((await studyDatabase.ref('results/research1/user-one/1-2_1_0').get()).val(),'removal must retain research data');
  assert(authUsers.get('user-one').disabled === true);
  console.log('PASS: real Cloud Functions handlers: first play, repeat, temporary database failure, export recovery, retry, and safe study removal');
})().catch(err=>{console.error(err);process.exitCode=1;});
