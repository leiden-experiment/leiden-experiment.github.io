'use strict';
/** Direct regression for the privacy checkbox: do not even sample normalized
 * coordinates on the game client when a research study has opted out. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'src/ts/scenes/studySessionScene.ts'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/ts/study/dashboard.ts'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
assert(game.includes("new Button(this, 'CONTINUE'"), 'Break must show Continue to match the message');
assert(!game.includes('RESUME\\nPLAYING'), 'Break should no longer show Resume Playing');
assert(dashboard.includes('Collect normalized positions and radii'));
assert(backend.includes('const initialValue = (await ref.get()).val()'));
assert(backend.includes('firstAttempt && initialValue != null'));
assert(backend.includes('removeNormalizedCoordinates(result)'));
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/ts/level/score.ts'), 'utf8'), {
  fileName:'score.ts',compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}
}).outputText;
let currentStudy = { settings: { collectFingerPositions:false } };
let normalizedCalls = 0;
const {exports: score} = (() => {
  const mod={exports:{}};
  vm.runInNewContext(compiled, {
    module:mod, exports:mod.exports,
    require:name=>{
      if(name==='../core/config') return {
        pinkyFingerId:1,ringFingerId:2,middleFingerId:3,indexFingerId:4,thumbFingerId:5
      };
      if(name==='../core/interfaces') return {
        LevelStats:class{constructor(){this.layersStats=[];this.maxStreak=0}},
        LayerStats:class{constructor(){this.hits=[];this.loop=1;this.correct=0;this.early=0;this.late=0;this.miss=0}}
      };
      if(name==='../study/runtime') return {getStudySession:()=>currentStudy};
      throw new Error('Unexpected import '+name);
    }
  });
  return mod;
})();
const gameScene={hand:{getNormalizedFingerRadius:()=>{normalizedCalls++;return .04;},getNormalizedFingerPosition:()=>{normalizedCalls++;return [.2,.3];}}};
const target={nodeIndex:0,fingerId:'index',songTime:1000,normalizedRadius:.25,normalizedPosition:[.5,.6]};
const stats=new score.Score(gameScene,{});
stats.delay=0;
stats.onTimePinch(target,1010,1);
const privateHit=stats.layerStats.hits[0];
assert.deepEqual(Object.keys(privateHit).sort(), ['classification','correctTime','loopNumber','noteID','pinchType','playerTime']);
assert.equal(normalizedCalls,0,'the browser must not collect coordinates when opted out');
currentStudy={settings:{collectFingerPositions:true}};
stats.onTimePinch(target,1020,1);
const optedInHit=stats.layerStats.hits[1];
assert.equal(optedInHit.normalizedTargetRadius,.25);
assert.equal(optedInHit.normalizedFingerRadius,.04);
assert.equal(optedInHit.normalizedTargetPosition[0],.5);
assert(normalizedCalls>0);
currentStudy=null; // Guest gameplay retains existing behavior.
stats.onTimePinch(target,1030,1);
assert.equal(stats.layerStats.hits[2].normalizedTargetRadius,.25);
console.log('PASS: Break uses Continue and primes the RTDB transaction; privacy opt-out never samples or stores normalized target/finger positions or radii, opt-in and guest still work');
