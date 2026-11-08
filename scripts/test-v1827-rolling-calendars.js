'use strict';
/** Real Firebase callable handlers against an in-memory RTDB mock; no Firebase credentials. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const types = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/ts/study/types.ts'), 'utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports:types,Date,Number,Object,Array,Math,String,JSON});
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const store = {};
function dbRef(pathName = '') {
  function read() { return pathName.split('/').filter(Boolean).reduce((v,part) => v?.[part],store); }
  function write(value) { const parts = pathName.split('/').filter(Boolean); let current = store;
    for (const part of parts.slice(0,-1)) current = current[part] ||= {};
    if (!parts.length) throw Error('Root write not supported');
    if (value === null || value === undefined) delete current[parts.at(-1)]; else current[parts.at(-1)] = clone(value);
  }
  return { child: name => dbRef([pathName,name].filter(Boolean).join('/')),
    get: async () => ({val: () => clone(read()),exists: () => read() !== undefined}),
    set: async value => write(value), remove: async () => write(null),
    update: async updates => { for (const [key,val] of Object.entries(updates)) await dbRef([pathName,key].filter(Boolean).join('/')).set(val); },
    transaction: async callback => { const proposed = callback(clone(read()));
      if (proposed === undefined) return {committed:false,snapshot:{val:() => clone(read())}};
      write(proposed); return {committed:true,snapshot:{val:() => clone(read())}};
    }
  };
}
const auth = {getUser: async () => ({disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z'})};
let apps=[];
const mod = {exports:{}};
class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
const mockRequire = name => {
  if (name === 'firebase-functions/v2/https') return {onCall: (_,callback)=>callback,HttpsError};
  if (name === 'firebase-admin') return {};
  if (name === 'firebase-admin/app') return {getApps:()=>apps,initializeApp:(options={},id='[DEFAULT]') => {const app={options,id};apps.push(app);return app;},applicationDefault:()=>({})};
  if (name === 'firebase-admin/database') return {getDatabase:()=>({ref:dbRef})};
  if (name === 'firebase-admin/auth') return {getAuth:()=>auth};
  if (name === 'node:crypto') return require('node:crypto');
  if (name.startsWith('./')) return require(path.join(root,'functions',name));
  throw Error(name);
};
vm.runInNewContext(fs.readFileSync(path.join(root,'functions/index.js'),'utf8'),
  {exports:mod.exports,module:mod,require:mockRequire,URL,Buffer,Date,Math,Number,Object,Array,String,Set,JSON});
const api=mod.exports;
const nowSeconds=Math.floor(Date.now()/1000);
const request=(uid,data={},authTime=1)=>({auth:{uid,token:{auth_time:authTime}},data});
const today=new Date().toISOString().slice(0,10);
const offset = days => new Date(Date.parse(`${today}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
const level={type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1};
const levels={'1':[{type:'start',text:'Welcome'},level,{type:'end',text:'Done'}],
  '2':[{type:'start',text:'Welcome'},level,{type:'end',text:'Done'}],
  '3':[{type:'start',text:'Welcome'},level,{type:'end',text:'Done'}],
  '-1':[level]};
const fixed={title:'Fixed',enabled:true,startDate:offset(-35),endDate:'',durationWeeks:3,
  weeklyEnabled:true,scheduleMode:'fixed',maxSessionsPerWeek:2,weeks:levels};
const individual={...fixed,title:'Individual',scheduleMode:'individual',startDate:today};
const admin={uid:'admin',username:'admin',role:'admin',active:true};
const participant=(uid,studyId,startDate='') => ({uid,username:uid,participantId:uid,role:'participant',active:true,studyId,startDate});
(async () => {
  await dbRef('accounts/admin').set(admin);
  await dbRef('studies/fixed/settings').set(fixed);
  await dbRef('studies/individual/settings').set(individual);
  await dbRef('accounts/fixed-user').set(participant('fixed-user','fixed'));
  await dbRef('accounts/individual-user').set(participant('individual-user','individual',offset(-14)));
  assert.equal(types.validateSettings(fixed).length,0,'Fixed duration, without an endDate, is valid');
  const savedStudy=await api.saveStudy(request('admin',{id:'new-fixed-study',settings:fixed,expectedRevision:0}));
  assert(savedStudy,'Firebase accepts a fixed study with a week count and no end date');
  await assert.rejects(api.saveStudy(request('admin',{id:'bad-week-count',settings:{...fixed,durationWeeks:0},expectedRevision:0})),/Invalid study settings/);
  assert(types.validateSettings({...fixed,durationWeeks:0}).some(x=>x.includes('week count')));
  assert(types.validateSettings({...fixed,durationWeeks:1}).some(x=>x.includes('only 1 week')));
  const autoFixed=await api.getParticipantBundle(request('fixed-user'));
  assert.equal(autoFixed.progress.scheduleOverride,undefined,'Automatic is the default');
  assert.equal(types.getNextAssignment(fixed,autoFixed.progress,autoFixed.account.startDate,new Date()).state,'awaiting-posttest',
    'Automatic fixed schedule locks training after the normal shared weeks');
  assert.equal(autoFixed.account.startDate,today,'Fixed participant first regular login date is recorded for information');
  const assigned=await api.setParticipantStage(request('admin',{uid:'fixed-user',stage:1}));
  assert.equal(assigned.progress.scheduleOverride.week,1);
  assert.equal(assigned.progress.scheduleOverride.startDate,undefined);
  const stale=await api.getParticipantBundle(request('fixed-user'));
  assert.equal(stale.progress.scheduleOverride.startDate,undefined,'Refresh with an old authentication must not start a personal calendar');
  assert.equal(types.getNextAssignment(fixed,stale.progress,stale.account.startDate,new Date()).state,'awaiting-login');
  const login=await api.getParticipantBundle(request('fixed-user',{},nowSeconds+1));
  assert.equal(login.progress.scheduleOverride.startDate,today);
  assert.equal(login.account.startDate,today,'Original first-login date remains unchanged');
  const freshPlan=types.getNextAssignment(fixed,login.progress,login.account.startDate,new Date());
  assert.equal(freshPlan.week,1,'Manual Week 1 replaces expired fixed-schedule Week 3');
  assert.equal(freshPlan.capped,false);
  const advance=await api.advanceStudyStep(request('fixed-user',{week:1,sessionId:freshPlan.sessionId,index:0,stepType:'start'}));
  assert(advance.progress.completed['1'].includes(`${freshPlan.sessionId}:0`));
  assert.equal(advance.progress.scheduleOverride.startDate,today,'Continue must preserve personal calendar');
  assert.equal(types.getNextAssignment(fixed,advance.progress,login.account.startDate,new Date(Date.parse(`${today}T00:00:00Z`)+6*86400000)).week,1);
  assert.equal(types.getNextAssignment(fixed,advance.progress,login.account.startDate,new Date(Date.parse(`${today}T00:00:00Z`)+7*86400000)).week,2,
    'The next week unlocks after 7 days, despite the global study end date');
  assert.equal(types.getNextAssignment(fixed,advance.progress,login.account.startDate,new Date(Date.parse(`${today}T00:00:00Z`)+14*86400000)).week,3);
  assert.equal(types.getNextAssignment(fixed,advance.progress,login.account.startDate,new Date(Date.parse(`${today}T00:00:00Z`)+21*86400000)).state,'awaiting-posttest');
  const manualPost=await api.setParticipantStage(request('admin',{uid:'fixed-user',stage:-1}));
  assert.equal(types.getNextAssignment(fixed,manualPost.progress,login.account.startDate,new Date()).week,-1,'Special Post-test stage bypasses the calendar');
  const reset=await api.setParticipantStage(request('admin',{uid:'fixed-user',stage:null}));
  assert.equal(reset.progress.scheduleOverride,undefined,'Automatic cancels the rolling schedule');
  assert.equal(reset.progress.stageOverride,undefined);
  assert.equal(types.getNextAssignment(fixed,reset.progress,login.account.startDate,new Date()).state,'awaiting-posttest');
  // Independent participant calendar follows the same manual mechanism.
  const regular=await api.getParticipantBundle(request('individual-user'));
  assert.equal(types.getNextAssignment(individual,regular.progress,regular.account.startDate,new Date()).week,3);
  await api.setParticipantStage(request('admin',{uid:'individual-user',stage:2}));
  const newIndividual=await api.getParticipantBundle(request('individual-user',{},nowSeconds+1));
  assert.equal(newIndividual.account.startDate,offset(-14),'The original participant start date is immutable');
  const plan=types.getNextAssignment(individual,newIndividual.progress,newIndividual.account.startDate,new Date());
  assert.equal(plan.week,2);
  assert.equal(types.getNextAssignment(individual,newIndividual.progress,newIndividual.account.startDate,new Date(Date.parse(`${today}T00:00:00Z`)+7*86400000)).week,3);
  const restored=await api.setParticipantStage(request('admin',{uid:'individual-user',stage:null}));
  assert.equal(types.getNextAssignment(individual,restored.progress,newIndividual.account.startDate,new Date()).week,3);
  await assert.rejects(api.setParticipant(request('admin',{uid:'individual-user',changes:{startDate:today}})),/cannot be edited/);
  // An incomplete Pre-test must still be completed first, even after Week 2 is manually selected.
  await dbRef('studies/pretest/settings').set({...individual,weeks:{...levels,'0':[level]}});
  await dbRef('accounts/pretest-user').set(participant('pretest-user','pretest'));
  await api.setParticipantStage(request('admin',{uid:'pretest-user',stage:2}));
  const gated=await api.getParticipantBundle(request('pretest-user',{},nowSeconds+1));
  assert.equal(gated.progress.scheduleOverride.startDate,undefined);
  assert.equal(types.getNextAssignment({...individual,weeks:{...levels,'0':[level]}},gated.progress,gated.account.startDate,new Date()).week,0);
  console.log('PASS: fixed week-count validation, automatic vs persistent rolling calendar, fresh-login anchor, week progression past study end, Pre-test gate, special Post-test, automatic reset, original participant start-date preservation');
})().catch(error=>{console.error(error);process.exitCode=1;});
