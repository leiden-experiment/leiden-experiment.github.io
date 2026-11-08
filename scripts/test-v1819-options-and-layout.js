'use strict';
/** Research Options scene integration without the Phaser/Firebase browser SDKs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const transpile = file => ts.transpileModule(read(file), {fileName:file, compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020}}).outputText;
const mockText = () => ({setOrigin(){return this},setText(value){this.text=value;return this},setFontSize(){return this},setPosition(){return this},setAlign(){return this},setWordWrapWidth(){return this}});
class FakeSprite { setTint(){return this} setScale(value){this.size=value;return this} }
class FakeButton { constructor(scene, label, x, y, handler) {this.label=label;this.x=x;this.y=y;this.handler=handler;this.displayWidth=400;this.text=mockText();scene.buttons.push(this)} setScale(s){this.displayWidth=400*s;return this} fitTextToButton(){this.fitted=true;return this} }
class FakeSlider { constructor(scene,position,size,labelOffset,cfg,key,range,changed) {this.key=key;this.value=cfg[key];this.label=mockText();this.changed=changed;scene.controls.push(this)} getValue(){return this.value} setIsInteger(){return this} reset(cfg){this.value=cfg[this.key];this.changed(this);return this} }
class FakeCheckbox { constructor(scene,pos,size,offset,label,cfg,key,changed){this.key=key;this.isChecked=cfg[key];this.changed=changed;scene.controls.push(this)} reset(cfg){this.isChecked=cfg[this.key];this.changed(this)} }
class HandScene {constructor(){this.width=1920;this.height=1080;this.center={x:960,y:540};this.buttons=[];this.controls=[];this.add={text:()=>mockText(),sprite:()=>new FakeSprite(),existing:()=>{}};this.tweens={add:()=>({})};this.scene={start:target=>this.lastScene=target};this.input={keyboard:{on(){},off(){}}};this.events={once(){}};this.hand={setFingerScale:()=>{}};}create(){}setOpacity(){} }
class Vector2 {constructor(x,y){this.x=x;this.y=y}}
const settingsModule = {};
vm.runInNewContext(transpile('src/ts/study/gameplayFields.ts'), {exports:settingsModule, Object, Number});
const storage={config:{targetSize:1,fingerSize:1,pinchVolume:1,backgroundMusicVolume:1,enableCameraVisibility:false,disableLayerProgression:false,skipLayersAutomaticallyAfterLoop:2}};
const initial={...storage.config};
let saved = null;
const session={settings:{weeks:{'1':[]},defaultConfig:{},groupConfigs:{},participantSettingsAllowed:['targetSize','pinchVolume','disableLayerProgression','skipLayersAutomaticallyAfterLoop']},account:{group:'',participantPreferences:{}},mode:'online'};
const modules={
  '../study/runtime':{getStudySession:()=>session,updateParticipantPreferences:preferences=>{session.account.participantPreferences=preferences}},
  '../study/firebaseClient':{studyApi:{saveParticipantPreferences:async values=>{saved=values; return {preferences:values}}}},
  '../study/offline':{getOfflinePack:()=>null,importOfflinePack:()=>{}},
  '../study/gameplayFields':settingsModule,
  '../scenes/handScene':{default:HandScene},'../ui/button':{Button:FakeButton},'../ui/slider':{Slider:FakeSlider},'../ui/checkbox':{Checkbox:FakeCheckbox},
  '../managers/storageManager':{get config(){return storage.config},get defaultConfig(){return {...initial}},updateConfig:(x)=>{storage.config={...x}},updateConfigValue:(key,value)=>{storage.config[key]=value}},
  '../objects/webcam':{default:{setVisibility:()=>{}}},
  '../core/phaserTypes':{Vector2},
  '../core/config':{escapeKey:'keydown-ESC',fingerColors:{thumb:123},thumbFingerId:'thumb'},
  '../core/common':{assert:()=>{}},
};
const exportsObj={};
vm.runInNewContext(transpile('src/ts/scenes/optionsScene.ts'), {exports:exportsObj,require:name=>{if(!modules[name]) throw Error('Unknown module '+name); return modules[name]},structuredClone:Object=>JSON.parse(JSON.stringify(Object)),Object,Array,Promise,Math,Number,Set});
const Options=exportsObj.default;
(async()=>{
  const cancelled=new Options();cancelled.create();
  assert.equal(cancelled.controls.some(c=>c.key==='skipLayersAutomaticallyAfterLoop'),false,'assigned study loops cannot be edited in Options');
  assert(cancelled.controls.some(c=>c.key==='targetSize'), 'original Phaser target slider is present');
  assert(cancelled.controls.some(c=>c.key==='pinchVolume'), 'original Phaser audio slider is present');
  assert(cancelled.targetExample instanceof FakeSprite,'visual target-size preview is rendered');
  storage.config.targetSize=3;
  cancelled.buttons.find(x=>x.label.startsWith('EXIT WITHOUT')).handler();
  assert.equal(saved,null,'cancel does not write Firebase');
  assert.equal(storage.config.targetSize,initial.targetSize,'cancel restores settings');
  assert.equal(cancelled.lastScene,'studySession');
  assert(cancelled.buttons.every(button=>button.fitted),'Settings buttons use the same dynamic text fit as main menu buttons');
  const edited=new Options();edited.create();
  const target=edited.controls.find(c=>c.key==='targetSize');
  target.value=2.4; target.changed(target);
  const volume=edited.controls.find(c=>c.key==='pinchVolume');
  volume.value=0.35;volume.changed(volume);
  edited.buttons.find(x=>x.label.startsWith('SAVE AND')).handler();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(saved.targetSize,2.4);assert.equal(saved.pinchVolume,0.35);
  assert.equal(saved.skipLayersAutomaticallyAfterLoop,undefined);
  assert.equal(session.account.participantPreferences.targetSize,2.4);
  assert.equal(edited.lastScene,'studySession');
  const settings=read('src/ts/study/gameplayFields.ts');
  assert(!settings.includes("key: 'skipLayersAutomaticallyAfterLoop'"));
  assert(!settings.includes("key: 'skipButtonAppearsAfterLoop'"));
  assert(settings.includes('minimum correctly played notes'));
  const studyScene=read('src/ts/scenes/studySessionScene.ts');
  assert(studyScene.includes("this.scene.start('options')"));
  assert(studyScene.includes('this.centerStudyButtonLabel(finish, 35)'));
  assert(studyScene.includes('isSelectionScreen ? 365 : 620'), 'loading text belongs above Level Selection buttons');
  assert(studyScene.includes('rows === 2 ? 51 : 46'), 'nine-choice typography increased');
  assert(read('src/css/study.css').includes('v1.8.19: calm focus treatment'));
  console.log('PASS: original Options visual preview and sliders, permission filtering, cancel restoration, online save, study-owned loops, centered buttons and non-overlapping selection status');
})().catch(error=>{console.error(error);process.exitCode=1});
