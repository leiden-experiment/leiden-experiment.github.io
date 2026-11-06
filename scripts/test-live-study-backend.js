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
  let coldProgressTransactionOnce = false;
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
      if (coldProgressTransactionOnce && path.startsWith('progress/') && at(path)) {
        coldProgressTransactionOnce = false;
        const optimistic = updater(null);
        if (optimistic === undefined) return { committed:false, snapshot:{ val: () => clone(at(path)) } };
        // Simulate Firebase retrying against the authoritative remote value.
      }
      const next = updater(clone(at(path)));
      if (next === undefined) return { committed:false, snapshot:{ val: () => clone(at(path)) } };
      put(path,next);
      return { committed:true, snapshot:{ val: () => clone(at(path)) } };
    }
  }; }
  return { ref:reference, store, setFailDelivery:value=> { failDelivery=value; }, setColdTransactionOnce:value=> { coldTransactionOnce=value; },
    setColdProgressTransactionOnce:value=> { coldProgressTransactionOnce=value; } };
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
  levelId:'legacy:Trained',result:{layersStats:[{total:30, correct:20, hits:[{
    classification:'correct', playerTime:1000, correctTime:1000,
    normalizedTargetPosition:[.25,.5], normalizedTargetRadius:.1, normalizedFingerRadius:.05,
    normalizedIndexFingerPosition:[.2,.3], normalizedThumbFingerPosition:[.6,.7]
  }]}]},completedAt:'2026-11-02T12:00:00Z'};
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
  })), /newer changes|changed in another session/);

  // Reproduce the user's false conflict: an old/lagging studyIndex revision
  // differs from the version on the actual transactional study record.
  const actualRevision = (await central.ref('studies/emptytest/revision').get()).val();
  await central.ref('studyIndex/emptytest/revision').set(0);
  const corrected = await api.getDashboardSnapshot(request('admin-one'));
  const observedRevision = corrected.studies.find(study => study.id === 'emptytest').revision;
  assert.equal(observedRevision, actualRevision, 'snapshot must expose real study revision, not stale index version');
  central.setColdTransactionOnce(true);
  const edited = await originalSaveStudy(request('admin-one', {
    id: 'emptytest', expectedRevision: observedRevision, settings: {...settings, title: 'Edited using live revision', weeks: null}
  }));
  assert.equal(central.store.studies.emptytest.settings.title, 'Edited using live revision',
    'RTDB transaction must not abort when its first callback receives null for an existing study');
  assert.equal(edited.revision, actualRevision + 1, 'normal save must work after index revision diverges');

  // Regression: cache/index revision can be stale even though the researcher
  // is editing the identical study settings they originally downloaded.
  // Accept that harmless mismatch, never a genuinely changed study.
  const unchangedBaseline = clone(central.store.studies.emptytest.settings);
  const outdatedRevision = edited.revision - 1;
  const reconciled = await originalSaveStudy(request('admin-one', {
    id: 'emptytest', expectedRevision: outdatedRevision,
    originalSettings: unchangedBaseline, originalDatabaseURL: '',
    settings: {...unchangedBaseline, title: 'Selection level updated', weeks: null}
  }));
  assert.equal(reconciled.revision, edited.revision + 1,
    'unchanged baseline should reconcile a stale cached revision');
  assert.equal(central.store.studies.emptytest.settings.title, 'Selection level updated');
  await assert.rejects(originalSaveStudy(request('admin-one', {
    id: 'emptytest', expectedRevision: outdatedRevision,
    originalSettings: {...unchangedBaseline, title: 'A different researcher modified this'},
    originalDatabaseURL: '',
    settings: {...unchangedBaseline, title: 'Would overwrite another researcher'}
  })), /newer changes/, 'stale edits must never overwrite genuinely changed settings');
  // Study records now always save to the administrator database; linked results databases are not configurable.
  // Reproduce the exact reported action: edit a choice in an existing level
  // selection slide and save from a dashboard with an old index revision.
  const selectionSettings = {...settings, title:'Selection study', weeks:{1:[
    {type:'start',text:'Welcome'},
    {type:'selection',text:'Pick a song',unlock:'all',playthroughs:1, choices:[
      {type:'level',levelId:'legacy:Cheerful Bliss',bpmIndex:0,loops:1},
      {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}
    ]},
    {type:'end',text:'Thanks'}
  ]}};
  await central.ref('studies/choiceedit').set({settings:selectionSettings, revision:4});
  await central.ref('studyIndex/choiceedit').set({title:'Selection study', revision:2, databaseURL:''});
  const selectionBaseline=clone(selectionSettings);
  const editedSelection=clone(selectionSettings);
  editedSelection.weeks[1][1].choices[0].levelId='legacy:Birthday Vibes';
  const afterSelectionSave=await originalSaveStudy(request('admin-one', {
    id:'choiceedit', expectedRevision:2, originalSettings:selectionBaseline,
    originalDatabaseURL:'', settings:editedSelection
  }));
  assert.equal(afterSelectionSave.revision,5);
  assert.equal(central.store.studies.choiceedit.settings.weeks[1][1].choices[0].levelId,
    'legacy:Birthday Vibes', 'editing one selected level must save instead of raising a false conflict');
  await assert.rejects(originalSaveStudy(request('admin-one', {
    id:'choiceedit', expectedRevision:2, originalSettings:selectionBaseline,
    originalDatabaseURL:'', settings:{...selectionBaseline,title:'Should fail'}
  })),/newer changes/, 'stale choice edits must not overwrite a genuinely changed study');

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
  const privateHit = (await central.ref('results/research1/user-one/1-1_1_0').get()).val().result.layersStats[0].hits[0];
  assert.deepEqual(Object.keys(privateHit).sort(), ['classification','correctTime','playerTime'],
    'opt-out must remove normalized target positions, target radius, finger radius and all finger positions');
  const repeat=await api.submitResult(request('user-one',{data:result,playToken:permitted.playToken}));
  assert(repeat.ok);
  assert.equal(repeat.progress.completed['1'].length,2,'a duplicate cannot advance the study');
  // Break regression from the default timeline: a participant has completed
  // Start + Level. A different Cloud Functions instance may start with no
  // local RTDB transaction cache, yielding `null` for the first callback.
  // Continue must still advance from Break (2) to the next Level (3).
  authUsers.set('break-user',{disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z'});
  await central.ref('accounts/break-user').set({uid:'break-user',username:'breakparticipant',participantId:'breakparticipant',studyId:'breakstudy',role:'participant',active:true});
  await central.ref('studies/breakstudy/settings').set({...settings, title:'Break Regression', weeks:{'1':[
    {type:'start',text:'Welcome'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1},
    {type:'break',text:'Take a short break. Press Continue when ready.'},
    {type:'level',levelId:'legacy:Nosound',bpmIndex:0,loops:1}, {type:'end',text:'Thanks'}
  ]}});
  await central.ref('progress/breakstudy/break-user').set({
    completed:{'1':['1-1:0','1-1:1']},sessions:{},activeSession:{'1':'1-1'}, choices:{}
  });
  central.setColdProgressTransactionOnce(true);
  const breakAdvance=await api.advanceStudyStep(request('break-user',{
    week:1,sessionId:'1-1',index:2,stepType:'break'
  }));
  assert(breakAdvance.ok && !breakAdvance.resynced, 'Break should commit even if RTDB first passes null');
  assert(breakAdvance.progress.completed['1'].includes('1-1:2'), 'Continue must mark Break completed');
  const breakNext=await api.preparePlay(request('break-user', {
    week:1,sessionId:'1-1',index:3,levelId:'legacy:Nosound'
  }));
  assert(breakNext.ok, 'participant must be able to start the level after the Break');
  const breakAgain=await api.advanceStudyStep(request('break-user',{
    week:1,sessionId:'1-1',index:2,stepType:'break'
  }));
  assert(breakAgain.resynced && breakAgain.alreadyCompleted, 'repeated Continue must be idempotent');
  console.log('PASS: cold Firebase progress transaction advances a Break after the first level');

  // All studies (including previously linked ones) write new results to the admin DB.
  await central.ref('studyIndex/research1/databaseURL').set('https://old-external-db.firebaseio.com/');
  const firstEnd = await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:2,stepType:'end'}));
  assert.match(firstEnd.progress.lastCompletedSessionAt, /^\d{4}-\d{2}-\d{2}T/);
  const repeatEnd = await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-1',index:2,stepType:'end'}));
  assert(repeatEnd.resynced, 'repeated step must return progress, not a 400');
  const nextSessionStart = await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:0,stepType:'start'}));
  assert(nextSessionStart.ok);
  studyDatabase.setFailDelivery(true); // The unused old database is offline.
  // Turning on the same checkbox retains ALL normalized target and finger fields.
  await central.ref('studies/research1/settings/collectFingerPositions').set(true);
  const nextPermit = await api.preparePlay(request('user-one', {week:1,sessionId:'1-2',index:1,levelId:'legacy:Trained'}));
  const nextResult = {...result,sessionId:'1-2'};
  const saved = await api.submitResult(request('user-one',{data:nextResult,playToken:nextPermit.playToken}));
  assert(saved.ok && !saved.queued && saved.progress.completed['1'].includes('1-2:1'));
  const consentedHit=(await central.ref('results/research1/user-one/1-2_1_0').get()).val().result.layersStats[0].hits[0];
  assert.equal(consentedHit.normalizedTargetRadius,.1);
  assert.equal(consentedHit.normalizedFingerRadius,.05);
  assert.deepEqual(Array.from(consentedHit.normalizedTargetPosition),[.25,.5]);
  await central.ref('studies/research1/settings/collectFingerPositions').set(false);
  assert((await central.ref('results/research1/user-one/1-2_1_0').get()).exists(),
    'central results must not depend on an old linked study database');
  const exported = await api.exportResults(request('admin-one',{studyId:'research1'}));
  assert(exported.results.some(v=>v.sessionId==='1-2'));
  assert.equal(exported.partial,false);
  const repeatSaved = await api.submitResult(request('user-one',{data:nextResult,playToken:nextPermit.playToken}));
  assert(repeatSaved.ok, 'same result can be submitted twice safely');
  await api.advanceStudyStep(request('user-one',{week:1,sessionId:'1-2',index:2,stepType:'end'}));
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
  // v1.8.18: participant settings apply to every study screen, including migrated old studies.
  authUsers.set('preferences-one', {disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z'});
  const settingsStudy={...settings, collectFingerPositions:false,
    participantSettingsEnabled:true, participantSettingsAllowed:['targetSize','enableCameraVisibility'], weeks:{'1':[
    {type:'start',text:'Set your preferences'},
    {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}
  ]}};
  await central.ref('studies/preferences-study/settings').set(settingsStudy);
  await central.ref('studyIndex/preferences-study').set({title:'Preferences',enabled:true});
  await central.ref('accounts/preferences-one').set({uid:'preferences-one',username:'settingsplayer',participantId:'settingsplayer',role:'participant',studyId:'preferences-study',active:true});
  const preferences=await api.saveParticipantPreferences(request('preferences-one',{preferences:{targetSize:0.5,enableCameraVisibility:true}}));
  assert.equal(preferences.preferences.targetSize,0.5);
  assert.equal((await central.ref('accounts/preferences-one/participantPreferences').get()).val().enableCameraVisibility,true);
  await assert.rejects(api.saveParticipantPreferences(request('preferences-one',{preferences:{fingerSize:0.5}})), /not enabled/);
  const settingsContinue=await api.advanceStudyStep(request('preferences-one',{week:1,sessionId:'1-1',index:0,stepType:'start'}));
  assert(settingsContinue.progress.completed['1'].includes('1-1:0'), 'Start screen must advance like Break');
  const laterPreference = await api.saveParticipantPreferences(request('preferences-one',{preferences:{targetSize:2}}));
  assert.equal(laterPreference.preferences.targetSize, 2, 'settings remain available from the next level screen');
  const bundle=await api.getParticipantBundle(request('preferences-one'));
  assert.equal(bundle.account.participantPreferences.targetSize,2, 'saved settings reappear after login');


  // Login checkpoint: text screens do not advance the stored resume point.
  authUsers.set('checkpoint-one', {disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00.000Z'});
  const checkpointSteps=[{type:'start',text:'Welcome'}, {type:'break',text:'Prepare'},
    {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'break',text:'Take a break'},
    {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}, {type:'end',text:'Finished'}];
  await central.ref('studies/checkpoint-study/settings').set({...settings,weeks:{'1':checkpointSteps}});
  await central.ref('studyIndex/checkpoint-study').set({title:'Checkpoint',enabled:true});
  await central.ref('accounts/checkpoint-one').set({uid:'checkpoint-one',username:'checkpoint',participantId:'checkpoint',role:'participant',studyId:'checkpoint-study',active:true});
  await central.ref('progress/checkpoint-study/checkpoint-one').set({
    completed:{'1':['1-1:0','1-1:1']}, activeSession:{'1':'1-1'}, sessions:{}
  });
  const firstLogin=await api.getParticipantBundle(request('checkpoint-one',{resume:true}));
  assert.deepEqual(Array.from(firstLogin.progress.completed['1']), [], 'No completed level: replay Start and Break on restart');
  await central.ref('progress/checkpoint-study/checkpoint-one').set({
    completed:{'1':['1-1:0','1-1:1','1-1:2','1-1:3']}, activeSession:{'1':'1-1'}, sessions:{},
    pendingResults:{saved:{status:'accepted'}}
  });
  const afterLevel=await api.getParticipantBundle(request('checkpoint-one',{resume:true}));
  assert.deepEqual(Array.from(afterLevel.progress.completed['1']), ['1-1:0','1-1:1','1-1:2'],
    'After a level, a restarted participant must see the next Break again');
  assert.equal((await central.ref('progress/checkpoint-study/checkpoint-one/pendingResults/saved/status').get()).val(), 'accepted',
    'Rollback must not delete accepted result records');
  const livePosition=await api.getParticipantBundle(request('checkpoint-one'));
  assert.equal(livePosition.progress.completed['1'].length,3,'Ordinary progress refresh must not rewind screens');
  await central.ref('progress/checkpoint-study/checkpoint-one').set({
    completed:{'1':['1-1:0','1-1:1','1-1:2','1-1:3','1-1:4','1-1:5']},
    activeSession:{},sessions:{'1':1},lastCompletedSessionAt:'2026-11-06T16:00:00Z'
  });
  const afterFull=await api.getParticipantBundle(request('checkpoint-one',{resume:true}));
  assert.equal(afterFull.progress.completed['1'].length,6,'Full sessions must never be replayed');
  console.log('PASS: backend login checkpoint replays instructions, preserves completed levels and full sessions');

  // Upload names are unique without regard to capitalization; deleting a level frees its name.
  const dummyLevel={bpm:[120],layers:[]};
  await api.saveLevel(request('admin-one',{id:'strum-1',name:'Strum3',data:dummyLevel}));
  await assert.rejects(api.saveLevel(request('admin-one',{id:'strum-2',name:'strum3',data:dummyLevel})), /display name already exists|with this display name already exists/);
  await api.removeLevel(request('admin-one',{id:'strum-1'}));
  await api.saveLevel(request('admin-one',{id:'strum-3',name:'strum3',data:dummyLevel}));

  // Renaming a participant changes prior exported participant IDs, not the stable UID path.
  const previous=(await central.ref('results/research1/user-one/1-1_1_0').get()).val();
  assert.equal(previous.participantId,'participant01');
  await api.updateAccountCredentials(request('admin-one',{uid:'user-one',username:'newplayer01'}));
  assert.equal((await central.ref('accounts/user-one/participantId').get()).val(),'newplayer01');
  assert.equal((await central.ref('results/research1/user-one/1-1_1_0').get()).val().participantId,'newplayer01');
  const postRename=await api.exportResults(request('admin-one',{studyId:'research1',uid:'user-one'}));
  assert(postRename.results.every(record=>record.participantId==='newplayer01'), 'exports must use current pseudonym');
  await api.removeStudy(request('admin-one',{studyId:'research1'}));
  assert(!(await central.ref('studyIndex/research1').get()).exists());
  assert((await central.ref('studies/research1/settings').get()).val().enabled===false);
  assert((await central.ref('results/research1/user-one/1-2_1_0').get()).val(),'archiving must retain research data in the admin database');
  assert(authUsers.get('user-one').disabled === true);
  console.log('PASS: real Cloud Functions handlers: first play, repeat, single admin database, duplicate saves, export, and safe study removal');
})().catch(err=>{console.error(err);process.exitCode=1;});
