'use strict';
/** v1.8.18: screen-wide camera/settings, default hand-only target input,
 * and login checkpoint behavior. These tests do not require Firebase credentials. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const typesExports={};
vm.runInNewContext(ts.transpileModule(read('src/ts/study/types.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:typesExports,Date,Number,Math,Object,Array,JSON,Set});
const { defaultStudySettings, validateSettings, restoreProgressAtLevelCheckpoint, migrateLegacySettingsSlides }=typesExports;
const steps=[{type:'start',text:'Instructions'}, {type:'break',text:'Prepare'},
  {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1},
  {type:'break',text:'Rest'}, {type:'level',levelId:'legacy:Trained',bpmIndex:0,loops:1},
  {type:'end',text:'Thanks'}];
const original=defaultStudySettings('Checkpoint tests'); original.weeks={'1':steps};
const progress={completed:{'1':['1-1:0','1-1:1','1-1:2','1-1:3']},sessions:{},activeSession:{'1':'1-1'}};
const restored=restoreProgressAtLevelCheckpoint(progress,original.weeks);
assert.deepEqual(Array.from(restored.completed['1']),['1-1:0','1-1:1','1-1:2']);
assert.equal(progress.completed['1'].length,4,'do not mutate in-memory progress');
const prelevel={...progress,completed:{'1':['1-1:0','1-1:1']}};
assert.deepEqual(Array.from(restoreProgressAtLevelCheckpoint(prelevel,original.weeks).completed['1']),[]);
const full={...progress,sessions:{'1':1},activeSession:{},completed:{'1':['1-1:0','1-1:1','1-1:2','1-1:3','1-1:4','1-1:5']}};
assert.equal(restoreProgressAtLevelCheckpoint(full,original.weeks).completed['1'].length,6);
original.participantSettingsEnabled=true;
original.participantSettingsAllowed=['targetSize','fingerSize'];
assert.deepEqual(Array.from(validateSettings(original)),[]);
assert(validateSettings({...original,participantSettingsAllowed:['unknownField']}).some(x=>x.includes('participant setting')));
const legacy={...original,participantSettingsEnabled:undefined,participantSettingsAllowed:undefined,
  weeks:{'1':[{type:'settings',text:'Keep these instructions',allowedSettings:['targetSize']},...steps.slice(2)]}};
const migrated=migrateLegacySettingsSlides(legacy);
assert.equal(migrated.weeks['1'][0].type,'start');
assert.equal(migrated.weeks['1'][0].text,'Keep these instructions');
assert.deepEqual(Array.from(migrated.participantSettingsAllowed),['targetSize']);
assert.equal(migrated.participantSettingsEnabled,true);
assert.equal(legacy.weeks['1'][0].type,'settings','migrating must not mutate original database baseline');
const dashboard=read('src/ts/study/dashboard.ts');
const board=read('src/ts/study/flowBoard.ts');
const scene=read('src/ts/scenes/studySessionScene.ts');
const modal=read('src/ts/study/participantSettingsMenu.ts');
const style=read('src/css/study.css');
const backend=read('functions/index.js');
assert(dashboard.includes('Allow participants to edit settings'));
assert(dashboard.includes('participantSettingsAllowed: enableParticipantSettings.checked'));
assert(!board.includes("['start', 'level', 'selection', 'break', 'settings', 'end']"));
assert(scene.includes('this.addStudyUtilityButtons(this.center.x - 520, this.center.x + 520, 810'));
assert(scene.includes('this.addStudyUtilityButtons(this.center.x - (canFinish ? 540 : 325)'));
assert(scene.includes("this.scene.start('options')"), 'research Settings leaves the prior scene so background buttons cannot receive input');
const optionsScene=read('src/ts/scenes/optionsScene.ts');
assert(optionsScene.includes('createResearchOptions()'), 'research must reuse visual Options controls');
assert(optionsScene.includes('saveParticipantPreferences(changes)'), 'save action must persist to Firebase');
assert(optionsScene.includes('this.researchOriginal'), 'cancel must restore previous settings');
assert(style.includes('.pizzicato-personal-settings-overlay input:focus'));
assert(scene.includes('mousePinchesEnabled: false, ...session.settings.defaultConfig'));
assert(read('src/ts/study/gameplayFields.ts').includes("key: 'mousePinchesEnabled', label: 'Enable mouse control', defaultValue: false"));
assert(read('src/ts/core/game.ts').includes('studyApi.fetchParticipant(true)'));
assert(read('src/ts/study/firebaseClient.ts').includes('resume ? { resume: true } : {}'));
assert(backend.includes('restoreProgressAtLevelCheckpoint(actual || {}, weeks)'));
assert(backend.includes('settings.participantSettingsAllowed'));
assert(!backend.includes("fail('Open a Settings slide before changing personal settings'"));
console.log('PASS: restart checkpoint, legacy Settings migration, study-wide allowed fields, mouse targets disabled by default, modal input isolation, and selection-camera controls');
