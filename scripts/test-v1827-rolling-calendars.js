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
  // Researchers may reopen any configured stage after a previously completed
  // Post-test. Past results remain stored; a repeated week gets a fresh session
  // epoch and its weekly allowance is reset without reducing lifetime totals.
  const replaySettings={...fixed,weeks:{...levels,'0':[level]}};
  await dbRef('studies/replay/settings').set(replaySettings);
  await dbRef('accounts/replay-user').set(participant('replay-user','replay',offset(-35)));
  await dbRef('progress/replay/replay-user').set({
    sessions:{'0':1,'1':2,'2':2,'3':2,'-1':1},
    completed:{'-1':['-1-old:0'], '3':['3-1:0']},
    totalCompletedSessions:8, activeSession:{},
  });
  const previous=(await dbRef('progress/replay/replay-user').get()).val();
  const repeatPost=await api.setParticipantStage(request('admin',{uid:'replay-user',stage:-1}));
  assert.equal(repeatPost.progress.stageOverride.week,-1);
  assert.equal(types.getNextAssignment(replaySettings,repeatPost.progress,offset(-35),new Date()).capped,false,
    'Post-test history must not block a manually reopened Post-test');
  const repeatPre=await api.setParticipantStage(request('admin',{uid:'replay-user',stage:0}));
  assert.equal(types.getNextAssignment(replaySettings,repeatPre.progress,offset(-35),new Date()).week,0,
    'A completed Pre-test can be repeated after a completed Post-test');
  const repeatWeek=await api.setParticipantStage(request('admin',{uid:'replay-user',stage:3}));
  assert.equal(repeatWeek.progress.sessions['3'],0,'Repeating a week reopens its completion allowance');
  assert.equal(repeatWeek.progress.totalCompletedSessions,8,'Historical completion totals remain intact');
  assert.equal(repeatWeek.progress.completed['3'][0],previous.completed['3'][0],
    'Historical completed steps are preserved');
  assert(repeatWeek.progress.sessionEpoch['3'],'A replay needs a fresh session epoch');
  const relogged=await api.getParticipantBundle(request('replay-user',{},nowSeconds+1));
  assert.equal(types.getNextAssignment(replaySettings,relogged.progress,relogged.account.startDate,new Date()).capped,false,
    'A prior Post-test must not cap the reassigned week');
  await api.setParticipantStage(request('admin',{uid:'replay-user',stage:null}));
  const replayReset=(await dbRef('progress/replay/replay-user').get()).val();
  assert.equal(types.getNextAssignment(replaySettings,replayReset,offset(-35),new Date()).state,'completed',
    'Automatic schedule returns to completed study after replay cancellation');
  const noPostWeeks={...levels}; delete noPostWeeks['-1'];
  const noPost={...fixed,weeks:noPostWeeks};
  assert.equal(types.getNextAssignment(noPost,{...previous,sessions:{...previous.sessions,'-1':0}},offset(-35),new Date()).state,
    'completed','A study without Post-test finishes as soon as the final weekly quota is fulfilled');
  assert.equal(types.getNextAssignment(fixed,{...previous,sessions:{...previous.sessions,'-1':0}},offset(-35),new Date()).state,
    'awaiting-posttest','A study with Post-test instead waits for its researcher');
  assert.equal(types.validateSettings({...fixed,showWeeklySessionProgress:false}).length,0);
  assert(types.validateSettings({...fixed,showWeeklySessionProgress:'yes'}).length>0);
  console.log('PASS: rolling calendars, stage replay after Post-test, fresh session epochs, final-week completion and settings validation');
})().catch(error=>{console.error(error);process.exitCode=1;});
