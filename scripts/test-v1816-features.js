'use strict';
/** Focused safety checks for the unified research database and settings slide. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname,'..');
const source = name => fs.readFileSync(path.join(root,name),'utf8');
const backend = source('functions/index.js');
const dashboard = source('src/ts/study/dashboard.ts');
const flow = source('src/ts/study/flowBoard.ts');
const game = source('src/ts/scenes/studySessionScene.ts');
const scoreboard = source('src/ts/level/score.ts');
const preferences = source('src/ts/study/participantSettingsMenu.ts');
const api = source('src/ts/study/firebaseClient.ts');
assert(!dashboard.includes('Study results database URL'));
assert(!dashboard.includes("'Welcome message'"));
assert(!backend.includes('destination(url)'));
assert(backend.includes('db.ref(path).transaction(previous => previous || staged)'));
assert(backend.includes('exports.saveParticipantPreferences'));
assert(backend.includes('levelNameIndex'));
assert(backend.includes("normalize('NFKC').trim().toLowerCase()"));
assert(backend.includes('participantId: account.participantId'));
assert(backend.includes('removeNormalizedCoordinates(result)'));
assert(backend.includes("'settings'].includes(stepType)"));
assert(dashboard.includes('Collect normalized positions and radii'));
assert(!flow.includes("'+ Settings'" ) && !flow.includes("'settings', 'end'"), 'Dedicated Settings slide no longer offered');
assert(dashboard.includes('Allow participants to edit settings'));
assert(dashboard.includes('participantSettingsAllowed:'));
assert(game.includes("new Button(this, 'CONTINUE'"));
assert(game.includes('this.scene.start(\'studySession\')'));
assert(game.includes("this.scene.start('options')"), 'research Settings opens the original Options scene');
assert(source('src/ts/scenes/optionsScene.ts').includes('saveParticipantPreferences(changes)')); 
assert(game.includes('participantPreferences'));
assert(scoreboard.includes('collectFingerPositions === true'));
assert(preferences.includes('Exit without saving'));
assert(preferences.includes('Reset to defaults'));
assert(preferences.includes('Save and Exit'));
assert(api.includes("'saveParticipantPreferences'"));
// Full real TypeScript check of the new DOM settings menu, its schema and the timeline.
const files = ['src/ts/study/participantSettingsMenu.ts','src/ts/study/types.ts',
  'src/ts/study/flowBoard.ts','src/ts/study/gameplayFields.ts'].map(file=>path.join(root,file));
const settings = {
  noEmit:true, target:ts.ScriptTarget.ES2015, module:ts.ModuleKind.ES2015,
  moduleResolution:ts.ModuleResolutionKind.Node10, strict:true, skipLibCheck:true,
  lib:['lib.dom.d.ts','lib.esnext.d.ts'], types:[]
};
const program = ts.createProgram(files, settings);
const errors = ts.getPreEmitDiagnostics(program);
assert.equal(errors.length,0,ts.formatDiagnostics(errors,{
  getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n' }));
console.log('PASS: real Typescript settings menu/timeline type-check; centralized result storage, privacy defaults, settings permission enforcement, no hardcoded welcome, unique level names, rename migration');

// Regression: clicking Resume on a Break must not appear to do nothing when
// Firebase accepted the step but returned a stale/reconciled response.
(async () => {
  const vm = require('node:vm');
  const transpile = file => ts.transpileModule(source(file), {
    fileName:file, compilerOptions:{ target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS }
  }).outputText;
  const typeExports = {};
  vm.runInNewContext(transpile('src/ts/study/types.ts'), {exports:typeExports, Date, Number, Math, Object, Array, JSON, Set});
  const prior = { completed:{'1':['1-1:0']}, sessions:{}, activeSession:{'1':'1-1'}, choices:{} };
  const advanced = { completed:{'1':['1-1:0','1-1:1']}, sessions:{}, activeSession:{'1':'1-1'}, choices:{} };
  const step={type:'break',text:'Take a break'};
  let advances=0;
  const backendApi={
    advanceStep:async()=> { advances++; return {progress:prior}; },
    fetchParticipant:async()=>({progress:advanced})
  };
  const runtimeExports={};
  vm.runInNewContext(transpile('src/ts/study/runtime.ts'), {
    exports:runtimeExports,
    require:name=> {
      if(name==='./types') return typeExports;
      if(name==='./firebaseClient') return {studyApi:backendApi};
      if(name==='./offline') return {loadLocalProgress:()=>prior,saveLocalProgress:()=>{},saveLocalResult:async()=>{}};
      throw Error('Unknown module '+name);
    }, Promise, Date, Number, Math, Object, Array, JSON, Set, Error,
  });
  const study=typeExports.defaultStudySettings('Break test');
  study.weeklyEnabled=false;study.dateRangeEnabled=false;
  study.weeks={'1':[{type:'start',text:'Welcome'},step,{type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1}]};
  runtimeExports.setStudySession({account:{uid:'u',username:'p',participantId:'p',studyId:'s',role:'participant',active:true},settings:study,mode:'online'},prior);
  assert.equal(runtimeExports.getStudyPlan().index,1);
  await runtimeExports.advanceScreenStep(step);
  assert.equal(runtimeExports.getStudyPlan().index,2,'Resume advances to the next slide after backend reconciliation');
  assert.equal(advances,1);
  console.log('PASS: Break screen advancement when the server already accepted Continue');
})().catch(err=>{console.error(err); process.exitCode=1;});
