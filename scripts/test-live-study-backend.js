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
const request=(uid,data={})=>({auth:{uid,token:{auth_time:1}},data});
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
  let done=await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:0,stepType:'start'}));
  assert(done.ok && done.progress.completed['1'].includes('1-1:0'));
  const first=await api.submitResult(request('user-one',{data:result}));
  assert(first.ok && !first.queued);
  assert(first.progress.completed['1'].includes('1-1:1'));
  assert.equal((await central.ref('results/research1/user-one/1-1_1_0').get()).val().result.layersStats[0].correct,20);
  const repeat=await api.submitResult(request('user-one',{data:result}));
  assert(repeat.ok);
  assert.equal(repeat.progress.completed['1'].length,2,'a duplicate cannot advance the study');
  // Linked results database is unavailable: central durable outbox retains submission.
  await central.ref('studyIndex/research1/databaseURL').set('https://study-test-default-rtdb.europe-west1.firebasedatabase.app/');
  await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:2,stepType:'end'}));
  const nextSessionStart=await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:0,stepType:'start'}));
  assert(nextSessionStart.ok);
  studyDatabase.setFailDelivery(true);
  const nextResult={...result,sessionId:'1-2'};
  const queued=await api.submitResult(request('user-one',{data:nextResult}));
  assert(queued.ok && queued.queued && queued.progress.completed['1'].includes('1-2:1'));
  assert((await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val(), 'result is durable while study database is offline');
  // Navigating past the level must not erase pending results.
  await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:2,stepType:'end'}));
  assert((await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val(), 'advancing a screen must retain the undelivered result');
  const exported=await api.exportResults(request('admin-one',{studyId:'research1'}));
  assert(exported.results.some(v=>v.sessionId==='1-2' && v.deliveryStatus==='awaiting-delivery'), 'pending result must be exportable');
  studyDatabase.setFailDelivery(false);
  const retry=await api.submitResult(request('user-one',{data:nextResult}));
  assert(retry.ok && !retry.queued);
  assert(!(await central.ref('progress/research1/user-one/pendingResults/1-2_1_0').get()).val());
  assert((await studyDatabase.ref('results/research1/user-one/1-2_1_0').get()).val());
  await api.removeStudy(request('admin-one',{studyId:'research1'}));
  assert(!(await central.ref('studyIndex/research1').get()).exists());
  assert((await central.ref('studies/research1/settings').get()).val().enabled===false);
  assert((await studyDatabase.ref('results/research1/user-one/1-2_1_0').get()).val(),'removal must retain research data');
  assert(authUsers.get('user-one').disabled === true);
  console.log('PASS: real Cloud Functions handlers: first play, repeat, temporary database failure, export recovery, retry, and safe study removal');
})().catch(err=>{console.error(err);process.exitCode=1;});
