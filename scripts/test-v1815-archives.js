/** Regressions for archived-study isolation, username reuse and human-readable stage errors.
 * Run real Cloud Function handlers using deterministic in-memory Firebase doubles.
 * No live database or browser services are accessed. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const store = {};
const getAt = path => path.split('/').filter(Boolean).reduce((p,k) => p?.[k], store);
function put(path, value) {
  const keys = path.split('/').filter(Boolean);
  let ptr = store;
  for (const key of keys.slice(0,-1)) ptr = (ptr[key] ||= {});
  const key = keys.at(-1);
  if (!key) throw Error('Root write not supported');
  if (value == null) delete ptr[key]; else ptr[key] = clone(value);
}
const database = { ref(path='') { return {
  get: async () => ({ val: () => clone(getAt(path)), exists: () => getAt(path) !== undefined }),
  set: async value => put(path,value),
  update: async value => { for (const [key,v] of Object.entries(value)) put([path,key].filter(Boolean).join('/'),v); },
  child: key => database.ref([path,key].filter(Boolean).join('/')),
  transaction: async update => { const next=update(clone(getAt(path))); if (next === undefined) return {committed:false,snapshot:{val:()=>clone(getAt(path))}}; put(path,next); return {committed:true,snapshot:{val:()=>clone(getAt(path))}}; }
}; }};
const authUsers = new Map();
let counter = 0;
const auth = {
  getUser: async uid => { const user=authUsers.get(uid); if (!user) throw Object.assign(Error('not found'),{code:'auth/user-not-found'}); return clone(user); },
  getUserByEmail: async email => { const user=[...authUsers.values()].find(user=>user.email === email); if (!user) throw Object.assign(Error('not found'),{code:'auth/user-not-found'}); return clone(user); },
  createUser: async args => {
    if ([...authUsers.values()].some(user=>user.email === args.email)) throw Object.assign(Error('duplicate'),{code:'auth/email-already-exists'});
    const uid=`created-${++counter}`;
    const user={uid, ...clone(args), tokensValidAfterTime:'1970-01-01T00:00:00Z'};
    authUsers.set(uid,user); return clone(user);
  },
  updateUser: async (uid,changes) => {
    const user=authUsers.get(uid); if (!user) throw Object.assign(Error('not found'),{code:'auth/user-not-found'});
    if (changes.email && [...authUsers.values()].some(other=>other.uid !== uid && other.email === changes.email)) throw Object.assign(Error('duplicate'),{code:'auth/email-already-exists'});
    Object.assign(user,clone(changes)); return clone(user);
  },
  deleteUser: async uid => {authUsers.delete(uid);},
  revokeRefreshTokens: async () => {}
};
const apps=[];
const exportsMock = {};
class HttpsError extends Error { constructor(code,message){super(message); this.code=code;} }
const fauxRequire = name => {
  if (name === 'firebase-functions/v2/https') return {onCall: (_, fn) => fn, HttpsError};
  if (name === 'firebase-admin') return {};
  if (name === 'node:crypto') return require(name);
  if (name === 'firebase-admin/app') return {getApps:()=>apps, initializeApp:(args={},name='[DEFAULT]')=>{const app={name,options:args}; apps.push(app); return app;}, applicationDefault:()=>({})};
  if (name === 'firebase-admin/database') return {getDatabase:()=>database};
  if (name === 'firebase-admin/auth') return {getAuth:()=>auth};
  if (name.startsWith('./')) return require(path.join(root,'functions',name));
  throw new Error('Unexpected import '+name);
};
const moduleObject={exports:exportsMock};
vm.runInNewContext(fs.readFileSync(path.join(root,'functions/index.js'),'utf8'), {
  require:fauxRequire, module:moduleObject, exports:exportsMock, URL, Buffer, Date, JSON, Math, Object, Number, String, Set, console
}, {filename:'functions/index.js'});
const api=moduleObject.exports;
const request=(uid,data={})=>({auth:{uid,token:{auth_time:1,superadmin:uid==='admin-one'}},data});
const settings=(title, levelId='library:lev-1')=>({
  title, description:'', introText:'', startDate:'2026-11-01', maxSessionsPerWeek:3,
  enabled:true, weeklyEnabled:false, dateRangeEnabled:false,
  weeks:{'1':[{type:'start',text:'Start'},{type:'level',levelId,bpmIndex:0,loops:1},{type:'end',text:'End'}]}
});
(async()=>{
  authUsers.set('admin-one',{uid:'admin-one',email:'lead@pizzicato.com',disabled:false,tokensValidAfterTime:'1970-01-01T00:00:00Z'});
  put('accounts/admin-one',{uid:'admin-one',role:'admin',active:true});
  put('levelLibrary/lev-1',{id:'lev-1',name:'Legacy library item'});
  put('levelIndex/lev-1',{id:'lev-1',name:'Legacy library item'});
  put('studies/old/settings',settings('Reused Title'));
  put('studyIndex/old',{title:'Reused Title',revision:0});
  // Set up a participant with a personal level assignment and archived data.
  const first=await api.provisionAccount(request('admin-one',{studyId:'old',username:'studentone',password:'example',role:'participant'}));
  const firstMod=await api.provisionAccount(request('admin-one',{studyId:'old',username:'teacherone',password:'example',role:'moderator'}));
  put(`accounts/${first.uid}/weeksOverride`,{'1':[{type:'level',levelId:'library:lev-1',bpmIndex:0,loops:1}]});
  put(`results/old/${first.uid}/session`,{points:42});
  await assert.rejects(api.removeLevel(request('admin-one',{id:'lev-1'})),/used by a study/);
  await api.removeStudy(request('admin-one',{studyId:'old'}));
  assert.equal(getAt('studyIndex/old'),undefined,'archived study should disappear from active index');
  assert.equal(getAt('results/old/'+first.uid+'/session').points,42,'archive must retain results');
  assert.equal(authUsers.get(first.uid).disabled,true);
  assert.equal(authUsers.get(first.uid).email,`archived+${first.uid}@pizzicato.com`,'participant username must be released');
  assert.equal(authUsers.get(firstMod.uid).email,`archived+${firstMod.uid}@pizzicato.com`,'moderator username must be released');
  await assert.rejects(api.setAccountActive(request('admin-one',{uid:first.uid,active:true})),/archived study/);
  const second=await api.saveStudy(request('admin-one',{id:'new',settings:settings('Reused Title'),expectedRevision:0}));
  assert.equal(second.id,'new','archived study title can be used by a new study');
  const renewed=await api.provisionAccount(request('admin-one',{studyId:'new',username:'studentone',password:'password2',role:'participant'}));
  const renewedMod=await api.provisionAccount(request('admin-one',{studyId:'new',username:'teacherone',password:'password2',role:'moderator'}));
  assert.notEqual(renewed.uid,first.uid);
  assert.notEqual(renewedMod.uid,firstMod.uid);
  assert.equal(getAt('results/old/'+first.uid+'/session').points,42,'username reuse must not erase historical data');
  assert.equal(authUsers.get(renewed.uid).email,'studentone@pizzicato.com');
  await assert.rejects(api.provisionAccount(request('admin-one',{studyId:'new',username:'studentone',password:'x',role:'participant'})),/already used by study/);
  await assert.rejects(api.provisionAccount(request('admin-one',{studyId:'old',username:'shouldfail',password:'x',role:'participant'})),/archived/);
  await assert.rejects(api.saveStudy(request('admin-one',{id:'old',settings:settings('Reused Title'),expectedRevision:0})),/archived study/);
  // A legacy archived study made before the new email-release behavior still holds usernames.
  put('studies/legacy-archive',{settings:settings('Archived Old Version'),archivedAt:'2026-11-01T10:00:00Z'});
  put('accounts/legacy-one',{uid:'legacy-one',username:'oldstaff',role:'moderator',studyId:'legacy-archive',active:false});
  authUsers.set('legacy-one',{uid:'legacy-one',email:'oldstaff@pizzicato.com',disabled:true,tokensValidAfterTime:'1970-01-01T00:00:00Z'});
  const oldReused=await api.provisionAccount(request('admin-one',{studyId:'new',username:'oldstaff',password:'x',role:'moderator'}));
  assert.equal(authUsers.get('legacy-one').email,'archived+legacy-one@pizzicato.com','legacy archived login released on demand');
  assert.equal(authUsers.get(oldReused.uid).email,'oldstaff@pizzicato.com');
  // Editing a participant username follows the same safe archive reclamation rules.
  put('accounts/oldrename',{uid:'oldrename',username:'oldrename',role:'participant',studyId:'legacy-archive',active:false});
  authUsers.set('oldrename',{uid:'oldrename',email:'oldrename@pizzicato.com',disabled:true,tokensValidAfterTime:'1970-01-01T00:00:00Z'});
  await api.updateAccountCredentials(request('admin-one',{uid:renewed.uid,username:'oldrename'}));
  assert.equal(authUsers.get(renewed.uid).email,'oldrename@pizzicato.com');
  assert.equal(authUsers.get('oldrename').email,'archived+oldrename@pizzicato.com');
  // Active studies, including participant-specific overrides, must still block deleting a referenced level.
  await assert.rejects(api.removeLevel(request('admin-one',{id:'lev-1'})),/used by a study/);
  await api.removeStudy(request('admin-one',{studyId:'new'}));
  assert((await api.removeLevel(request('admin-one',{id:'lev-1'}))).ok,'archived-only references must not prevent level deletion');
  assert.equal(getAt('levelLibrary/lev-1'),undefined);
  // Stage validation must use researcher-facing stage names rather than internal keys.
  const ts = (()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
  const types={};
  const output=ts.transpileModule(fs.readFileSync(path.join(root,'src/ts/study/types.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(output,{exports:types,Date,Number,Object,Array,JSON,Math});
  const pre=types.validateSettings({...settings('Pre'),weeks:{'0':[{type:'start',text:'Hello'}]}});
  const post=types.validateSettings({...settings('Post'),weeks:{'-1':[{type:'end',text:'Bye'}]}});
  assert(pre.includes('Pre-test must contain at least one playable level'),JSON.stringify(pre));
  assert(post.includes('Post-test must contain at least one playable level'),JSON.stringify(post));
  assert(!pre.some(m=>m.includes('Week 0')) && !post.some(m=>m.includes('Week -1')));
  console.log('PASS: archived studies release shared levels, archived usernames and titles are reusable, old UIDs/results preserved, active collisions remain protected, friendly stage labels');
})().catch(e=>{console.error(e);process.exitCode=1;});
