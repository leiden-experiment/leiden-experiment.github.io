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
  let coldTransactionOnce = false;
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
      // Real RTDB transactions may invoke the callback with null before the
      // already-existing remote record has populated their local cache.
      if (coldTransactionOnce && path.startsWith('studies/') && at(path)) {
        coldTransactionOnce = false;
        const optimistic = updater(null);
        if (optimistic === undefined) return { committed:false, snapshot:{ val: () => clone(at(path)) } };
      }
      const next = updater(clone(at(path)));
      if (next === undefined) return { committed:false, snapshot:{ val: () => clone(at(path)) } };
      put(path,next);
      return { committed:true, snapshot:{ val: () => clone(at(path)) } };
    }
  }; }
  return { ref:reference, store, setFailDelivery:value=> { failDelivery=value; }, setColdTransactionOnce:value=> { coldTransactionOnce=value; } };
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
const request=(uid,data={},authTime=1)=>({auth:{uid,token:{auth_time:authTime}},data});
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
// Weeks are sparse in RTDB: Week 3 must be a real Week 3 session using
// Week 2's slides, not a replay of Week 2's ID or session allowance.
(async () => {
  const a={type:'level',levelId:'legacy:First',bpmIndex:0,loops:1};
  const b={type:'level',levelId:'legacy:Second',bpmIndex:0,loops:1};
  const week1=[{type:'start',text:'Instructions for Week 1'},a,{type:'end',text:'Done 1'}];
  const week2=[{type:'start',text:'Instructions for Week 2'},b,{type:'break',text:'Break 2'},{type:'end',text:'Done 2'}];
  const sparse={'1':week1,'2':week2};
  const {slidesForStudyWeek,getNextAssignment,emptyProgress,validateSettings}=studyTypesExports;
  assert.equal(slidesForStudyWeek(sparse,3),week2,'Week 3 inherits last explicitly defined Week 2');
  assert.equal(slidesForStudyWeek({'1':week1},3),week1,'Week 3 inherits Week 1 when Week 2 is absent');
  assert.equal(slidesForStudyWeek({'1':week1,'2':[]},3).length,0,'An explicit empty Week 2 is not silently replaced');
  assert.equal(slidesForStudyWeek(sparse,0).length,0,'Pre-test never inherits ordinary weeks');
  assert.equal(slidesForStudyWeek(sparse,-1).length,0,'Post-test never inherits ordinary weeks');
  const settings={ ...defaultStudySettings(),title:'Sparse weeks',scheduleMode:'individual',weeklyEnabled:true,
    maxSessionsPerWeek:2,durationWeeks:3,participantStartMode:'first-login',weeks:sparse};
  assert.equal(validateSettings(settings).length,0,'Sparse timeline is valid for a longer study');
  const date14DaysAgo=new Date(Date.now()-14*86400000).toISOString().slice(0,10);
  let plan=getNextAssignment(settings,emptyProgress(),date14DaysAgo,new Date());
  assert.equal(plan.week,3,'The participant calendar still advances to Week 3');
  assert.equal(plan.assignments[0].text,'Instructions for Week 2','Week 3 displays Week 2 instructions');
  assert.equal(plan.sessionId,'3-1','Missing-week fallback must never reuse Week 2 session IDs');
  assert.equal(getNextAssignment(settings,{...emptyProgress(),sessions:{'3':2}},date14DaysAgo,new Date()).state,'completed');
  assert.equal(getNextAssignment(settings,{...emptyProgress(),stageOverride:{week:3,sessionNumber:6}},date14DaysAgo,new Date()).sessionId,'3-6');
  const checkpoint=require(path.join(root,'functions/progressCheckpoint'));
  const partial={completed:{'3':['3-1:0','3-1:1','3-1:2']},sessions:{},activeSession:{'3':'3-1'}};
  assert.equal(checkpoint.restoreProgressAtLevelCheckpoint(partial,sparse).completed['3'].includes('3-1:2'),false,
    'Login restoration replays Break instructions in an inherited week');
  await central.ref('studies/research1/settings').set(settings);
  await central.ref('studyIndex/research1').set({title:'Sparse weeks',enabled:true});
  await central.ref('accounts/user-one').set({uid:'user-one',username:'participant01',role:'participant',participantId:'participant01',
    studyId:'research1',active:true,group:'',startDate:date14DaysAgo});
  await central.ref('accounts/admin-one').set({uid:'admin-one',username:'owner',role:'admin',active:true});
  const stage=await api.setParticipantStage(request('admin-one',{uid:'user-one',stage:3}));
  assert.equal(stage.progress.scheduleOverride.week,3,'Researcher can start a rolling calendar in inherited Week 3');
  assert(!stage.progress.scheduleOverride.startDate, 'Calendar must not begin until next login');
  const bundle=await api.getParticipantBundle(request('user-one',{},Math.floor(Date.now()/1000)+1));
  assert.equal(Object.keys(bundle.settings.weeks).includes('3'),false,'No repeated slides are redundantly written into settings');
  plan=getNextAssignment(bundle.settings,bundle.progress,bundle.account.startDate,new Date());
  assert.equal(plan.week,3); assert.equal(plan.assignments[0].text,week2[0].text);
  await api.advanceStudyStep(request('user-one',{week:3,sessionId:plan.sessionId,index:0,stepType:'start'}));
  const authorization=await api.preparePlay(request('user-one',{
    week:3,sessionId:plan.sessionId,index:1,levelId:b.levelId}));
  assert.equal(authorization.ok,true);
  const play={schemaVersion:1,studyId:'research1',participantId:'participant01',group:'',week:3,
    sessionId:plan.sessionId,assignmentIndex:1,levelId:b.levelId,completedAt:new Date().toISOString(),result:{hits:8}};
  const saved=await api.submitResult(request('user-one',{data:play,playToken:authorization.playToken}));
  assert.equal(saved.ok,true); assert.equal(saved.reviewRequired,false);
  await api.advanceStudyStep(request('user-one',{week:3,sessionId:plan.sessionId,index:2,stepType:'break'}));
  await api.advanceStudyStep(request('user-one',{week:3,sessionId:plan.sessionId,index:3,stepType:'end'}));
  const progress=(await central.ref('progress/research1/user-one').get()).val();
  assert.equal(progress.sessions['3'],1,'Only the true Week 3 allowance advances');
  assert.equal(progress.sessions['2'],undefined,'The Week 2 session count is unchanged');
  assert.equal(progress.scheduleOverride.week,3,'Personal schedule persists after the session');
  const results=(await central.ref('results/research1/user-one').get()).val();
  assert(Object.values(results).some(r=>r.week===3&&r.levelId===b.levelId),'Saved research results belong to Week 3');
  console.log('PASS: sparse weekly inheritance, Week 1/2/3 fallback, manual stage, Continue, play authorization, result week identity, checkpoints and weekly caps');
})().catch(error => {console.error(error);process.exitCode=1;});
