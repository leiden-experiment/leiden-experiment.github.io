/** Regression checks for loop wrapping/caps, single-choice layout, passive End and study revisions. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.join(__dirname, '..');
const text = file => fs.readFileSync(path.join(root, file), 'utf8');
const compiled = file => {
  const result = ts.transpileModule(text(file), {fileName: file,reportDiagnostics:true,
    compilerOptions:{ target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,strict:true }});
  assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0,0,file);
  return result.outputText;
};
const settings = { skipLayersAutomatically:true, skipLayersAutomaticallyAfterLoop:3,
  disableLayerProgression:false, autoSaveCSV:false, lateTimeDuration:250 };
const fakeModule = { exports:{} };
const mockRequire = name => {
  if (name === '../managers/storageManager') return { config:settings,autoSaveToCSV() {} };
  if (name === '../core/config') return { fingerColors:{},indexFingerId:'index',targetDeathDuration:400 };
  if (name === '../core/common') return {assert,Vector2:class {}};
  if (name === '../level/metronome' || name === '../level/progress' || name === '../level/infoHud' ||
      name === '../managers/targetManager' || name === '../objects/target') return {default:class {},TargetManager:class {}};
  throw new Error('Unexpected module '+name);
};
vm.runInNewContext(compiled('src/ts/level/layer.ts'), {module:fakeModule,exports:fakeModule.exports,
  require:mockRequire,Math,Set,Array}, {filename:'layer.ts'});
const {PlayableLayer} = fakeModule.exports;
let transitions = 0, incremented = 0, resets = 0, created = [], onTime = false, loopNumber = 1;
const layer = Object.create(PlayableLayer.prototype);
Object.assign(layer,{ready:true,songTime_:2900,oldTimePosition:3900,nextNodeIndex:2,
  data:{lengthInBars:4,nodes:[{timePosition:{bar:1,step:1,tick:0},finger:'index'},
    {timePosition:{bar:1,step:2,tick:0},finger:'index'}]},
  level:{getActiveLayer:()=>layer, activeLayerIndex:0,track:{songTimePositionToTime:position=>
    (position.bar-1)*1000+(position.step-1)*250},transitionLayers:()=>{transitions++;layer.ready=false;},
    streak:{stop(){}}, score:{getLoopCount:()=>loopNumber,incrementLoopCount:()=>{incremented++;loopNumber++;}}},
  progress:{canProgress:()=>onTime,setToStarting(){resets++;}},infoHud:{updateLoopText(){}},
  getPreviewTime:()=>1000,createTarget:(_node,_layer,index)=>created.push(index)});
layer.handleTargetCreation();
assert.equal(layer.nextNodeIndex,2,'queued final notes remain until wrap');
layer.songTime_=3150;
layer.handleTargetCreation();
assert.equal(layer.nextNodeIndex,1,'next loop must restart on first boundary');
assert.deepEqual(created,[0],'first node respawns at musical wrap');
layer.songTime_=3250;
layer.handleTargetCreation();
assert.deepEqual(created,[0,1],'subsequent nodes respawn');
layer.handleTargetCreation=()=>{};
layer.startTime=0;
layer.time=0;
// Previously the final note or hitting the threshold could advance early.
onTime = true;
layer.songTime_=3500;
layer.finishCompletedLoop();
assert.equal(transitions,0,'meeting the threshold mid-loop must not advance');
layer.songTime_=4000;
layer.finishCompletedLoop();
assert.equal(transitions,1,'threshold advances after the musical loop ends');
layer.ready=true; transitions=0; loopNumber=1; onTime=false;
layer.songTime_=4000;
layer.finishCompletedLoop();
assert.equal(incremented,1,'failed loop increments loop counter');
assert.equal(resets,1,'failed loop resets progress');
assert.equal(transitions,0,'failed loop continues when below cap');
layer.songTime_=8000;
layer.finishCompletedLoop();
assert.equal(incremented,2);
assert.equal(resets,2);
assert.equal(transitions,0);
layer.songTime_=12000;
layer.finishCompletedLoop();
assert.equal(transitions,1,'maximum complete loops advance even without threshold');
// A late final note must still be adjudicated before the loop is closed.
layer.ready=true; transitions=0; loopNumber=1; onTime=true;
layer.data.nodes[1].timePosition = {bar:4,step:4,tick:0};
layer.cachedCompletionGrace=null;
const grace = layer.getLoopCompletionGrace();
assert(grace > 0, 'near-boundary notes require a grace period');
layer.songTime_=4000;
layer.finishCompletedLoop();
assert.equal(transitions,0, 'do not cut off the last target before its miss callback');
layer.songTime_=4000+grace;
layer.finishCompletedLoop();
assert.equal(transitions,1,'resolve last target then advance');
const scene = text('src/ts/scenes/studySessionScene.ts');
assert(scene.includes("if (step?.type === 'end'"),'End screens finish automatically');
assert(scene.includes('await advanceScreenStep(step)'),'End advances authoritative session state');
assert(scene.includes('const scale = selectable.length === 1 ? 1.08'),'one-choice selection is larger and centered');
const editor = text('src/ts/study/flowBoard.ts');
assert(editor.includes('there is no Continue button.'),'End editor documentation should be correct');
const backend = text('functions/index.js');
assert(backend.includes('summary.revision = Number(studyRecord.revision || 0)'),
  'dashboard revision must come from the same record as the save transaction');
assert(backend.includes('const existing = (await studyRef.get()).val()'),
  'save transaction must use the current study revision');
assert.match(JSON.parse(text('package.json')).version,/^1\.8\.(?:[89]|[1-9][0-9]+)$/);
console.log('PASS: target-loop wrap and respawn, loop cap, boundary-only progression and loop reset, terminal End, centered single-choice layout, authoritative study revision');
