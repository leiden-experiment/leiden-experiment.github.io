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
// Focused stage-management tests against the real callable handlers and an in-memory RTDB.
(async () => {
  const stages = {
    '-1': [{type:'start',text:'Posttest'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'end',text:'Done'}],
    '0': [{type:'start',text:'Pretest'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'end',text:'Done'}],
    '1': [{type:'start',text:'Week 1'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'end',text:'Done'}],
    '2': [{type:'start',text:'Week 2'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'end',text:'Done'}]
  };
  const settings={title:'Study stages',description:'',introText:'Hello',enabled:true,weeklyEnabled:true,dateRangeEnabled:true,
    startDate:'2027-01-01',endDate:'2027-03-01',participantStartMode:'first-login',durationWeeks:2,
    maxSessionsPerWeek:1,weeks:stages};
  await central.ref('studies/research1/settings').set(settings);
  await central.ref('studyIndex/research1').set({title:'Study stages',enabled:true,databaseURL:''});
  await central.ref('accounts/user-one').set({uid:'user-one',username:'participant01',role:'participant',participantId:'participant01',
    studyId:'research1',active:true,group:''});
  await central.ref('accounts/admin-one').set({uid:'admin-one',username:'owner',role:'admin',active:true});
  await central.ref('studyMembers/research1/user-one').set(true);
  const beforePretest=await api.getParticipantBundle(request('user-one'));
  assert.equal(beforePretest.account.startDate,undefined,'Pre-test login should not establish first regular login date');
  assert.equal(beforePretest.progress.sessions['0'],undefined);
  const originalDate=beforePretest.account.startDate;
  // A researcher can force a future week even when its calendar date has not arrived.
  const reassigned=await api.setParticipantStage(request('admin-one',{uid:'user-one',stage:2}));
  assert.equal(reassigned.progress.scheduleOverride.week,2);
  const stillPretest=await api.getParticipantBundle(request('user-one',{},Math.floor(Date.now()/1000)+1));
  assert.equal(stillPretest.progress.scheduleOverride.startDate,undefined,'Personal weeks cannot bypass a required Pre-test');
  assert.equal(studyTypesExports.getNextAssignment(settings,stillPretest.progress,'',new Date()).week,0);
  // Represent a completed lab Pre-test before the subsequent regular login.
  await central.ref('progress/research1/user-one/sessions/0').set(1);
  const during=await api.getParticipantBundle(request('user-one',{},Math.floor(Date.now()/1000)+1));
  assert.equal(during.progress.scheduleOverride.week,2,'a rolling calendar begins on the next authenticated login');
  assert.equal(during.progress.scheduleOverride.startDate,new Date().toISOString().slice(0,10));
  const typedPlan=studyTypesExports.getNextAssignment(settings,during.progress,during.account.startDate,new Date());
  assert.equal(typedPlan.week,2);
  assert.equal(typedPlan.capped,false);
  const overrideSession=typedPlan.sessionId;
  await api.advanceStudyStep(request('user-one',{week:2,sessionId:overrideSession,index:0,stepType:'start'}));
  const permit=await api.preparePlay(request('user-one',{week:2,sessionId:overrideSession,index:1,levelId:'legacy:Trained'}));
  const play={schemaVersion:1,studyId:'research1',participantId:'participant01',group:'',week:2,sessionId:overrideSession,
    assignmentIndex:1,levelId:'legacy:Trained',completedAt:new Date().toISOString(),result:{hits:[1,2,3]}};
  const result=await api.submitResult(request('user-one',{data:play,playToken:permit.playToken}));
  assert.equal(result.ok,true,'forced weekly session should still be authorized and saved');
  assert.equal(result.reviewRequired,false,'correctly authorized forced session should not be rejected for review');
  await api.advanceStudyStep(request('user-one',{week:2,sessionId:overrideSession,index:2,stepType:'end'}));
  let stored=(await central.ref('progress/research1/user-one').get()).val();
  assert.equal(stored.sessions['2'],1);
  assert.equal(stored.scheduleOverride.week,2,'the manually assigned weekly calendar persists after a completed session');
  assert.equal(stored.lastCompletedSessionAt !== undefined,true);
  assert.equal((await central.ref('results/research1/user-one').get()).exists(),true,'forced play is saved permanently');
  assert.equal((await central.ref('accounts/user-one/startDate').get()).val(),new Date().toISOString().slice(0,10),'first regular login is recorded even when the week is assigned manually');
  // Existing participants may gain and later remove personal gameplay settings.
  await api.setParticipant(request('admin-one',{uid:'user-one',changes:{customConfig:{targetSize:1.2}}}));
  assert.equal((await central.ref('accounts/user-one/customConfig').get()).val().targetSize,1.2);
  await api.setParticipant(request('admin-one',{uid:'user-one',changes:{customConfig:null}}));
  assert.equal((await central.ref('accounts/user-one/customConfig').get()).val(),undefined);
  // A forced Pre-test must complete before the next regular login starts Week 1.
  const pre=await api.setParticipantStage(request('admin-one',{uid:'user-one',stage:0}));
  const psid=`0-${pre.progress.stageOverride.sessionNumber}`;
  await api.advanceStudyStep(request('user-one',{week:0,sessionId:psid,index:0,stepType:'start'}));
  const pauth=await api.preparePlay(request('user-one',{week:0,sessionId:psid,index:1,levelId:'legacy:Trained'}));
  await api.submitResult(request('user-one',{data:{...play,week:0,sessionId:psid},playToken:pauth.playToken}));
  await api.advanceStudyStep(request('user-one',{week:0,sessionId:psid,index:2,stepType:'end'}));
  stored=(await central.ref('progress/research1/user-one').get()).val();
  assert.equal(stored.pretestPendingLogin,true,'completed pre-test must wait until another login');
  assert.equal(stored.stageOverride,undefined,'pre-test manual assignment should be consumed');
  assert.equal(studyTypesExports.getNextAssignment(settings,stored,settings.startDate,new Date('2026-11-06')).capped,true,
    'participant cannot continue to Week 1 without logging in again');
  const nextLogin=await api.getParticipantBundle(request('user-one',{},2));
  assert.equal(nextLogin.progress.pretestPendingLogin,undefined,'new login releases post-pretest hold');
  assert.equal(nextLogin.account.startDate,new Date().toISOString().slice(0,10),'the original first regular login date remains unchanged after Pre-test is reassigned');
  // The researcher may force a post-test independently of the calendar while preserving earlier results.
  const post=await api.setParticipantStage(request('admin-one',{uid:'user-one',stage:-1}));
  assert.equal(post.progress.stageOverride.week,-1);
  const postPlan=studyTypesExports.getNextAssignment(settings,post.progress,nextLogin.account.startDate,new Date('2026-11-06'));
  assert.equal(postPlan.week,-1);
  assert.equal(postPlan.capped,false);
  const reset=await api.setParticipantStage(request('admin-one',{uid:'user-one',stage:null}));
  assert.equal(reset.progress.stageOverride,undefined,'researcher can return to automatic scheduling');
  // Confirm access restrictions and nonconfigured stages.
  await assert.rejects(api.setParticipantStage(request('user-one',{uid:'user-one',stage:2})),/Administrator permission required/);
  await assert.rejects(api.setParticipantStage(request('admin-one',{uid:'user-one',stage:3})),/Stage is not configured/);
  // Current participant UI includes stage and custom settings controls for ALL existing users.
  const dashboard=fs.readFileSync(path.join(root,'src/ts/study/dashboard.ts'),'utf8');
  assert(dashboard.includes('Next session stage') && dashboard.includes('setParticipantStage(member.uid, selectedStage)'));
  assert(dashboard.includes('const customToggle = check(edit') && !dashboard.includes('if (member.customConfig) {'));
  const flow=fs.readFileSync(path.join(root,'src/ts/study/flowBoard.ts'),'utf8');
  assert(flow.includes('Pre-test · before Week 1') && flow.includes('Post-test · after final week'));
  assert(flow.includes("a === '-1' ? Infinity"), 'post-test must appear AFTER the final week, not first');
  console.log('PASS: forced week, pre-test, post-test, first-login anchor, historical results retained, stage reset, permissions and existing-user custom configs');
})().catch(error => { console.error(error); process.exitCode=1; });
