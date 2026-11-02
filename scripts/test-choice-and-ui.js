const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
function loadTypes() {
  const file = path.join(__dirname, '../src/ts/study/types.ts');
  const transformed = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', transformed)(mod, mod.exports); return mod.exports;
}
const { defaultStudySettings, validateSettings, isSelectionStep, isChoiceUnlocked, selectionKey } = loadTypes();
const settings = defaultStudySettings('Selection test');
const choice = { type:'selection', text:'Pick a difficulty', choices:[
  { type:'level', levelId:'legacy:Cheerful Bliss', bpmIndex:0, loops:1 },
  { type:'level', levelId:'legacy:Birthday Vibes', bpmIndex:1, loops:3 },
  { type:'level', levelId:'library:testlevel', bpmIndex:0, loops:2 }
], unlock:'sequential', playthroughs:3 };
settings.weeks['1']=[{ type:'start', text:'Hello' }, choice, { type:'end', text:'Thanks' }];
assert.deepEqual(validateSettings(settings), []);
assert(isSelectionStep(choice));
assert.equal(isChoiceUnlocked(choice,0,1,{}), true);
assert.equal(isChoiceUnlocked(choice,1,1,{}), false);
assert.equal(isChoiceUnlocked(choice,1,1,{0:1}), true);
assert.equal(isChoiceUnlocked(choice,2,1,{0:1}), false);
assert.equal(isChoiceUnlocked({...choice,unlock:'weekly'},2,2,{}),false);
assert.equal(isChoiceUnlocked({...choice,unlock:'weekly'},1,2,{}),true);
assert.equal(isChoiceUnlocked({...choice,unlock:'all'},2,1,{}),true);
assert.equal(selectionKey(2,'2-1',0),'2_2-1_0');
for (const invalid of [{...choice,playthroughs:-1},{...choice,choices:[]}, {...choice,unlock:'surprise'}]) {
  const candidate={...settings,weeks:{'1':[invalid]}}; assert(validateSettings(candidate).length>0);
}
const backend = fs.readFileSync(path.join(__dirname,'../functions/index.js'),'utf8');
assert(backend.includes('unlockedChoice(currentChoice, data.choiceIndex, week, counts)'));
assert(backend.includes('progress.choices[countsKey] = counts'));
assert(backend.includes("stepType === 'selection'"));
assert(backend.includes('firebasePassword(password)'));
assert(backend.includes('customConfig:') || backend.includes('permitted.customConfig'));
const pw = require('../functions/password');
assert.equal(pw.firebasePassword('p').length,64);
assert.equal(pw.firebasePassword('longer-passphrase'), 'longer-passphrase');
assert.throws(()=>pw.firebasePassword(''));
const dashboard = fs.readFileSync(path.join(__dirname,'../src/ts/study/dashboard.ts'),'utf8');
assert(dashboard.includes('exportName(study, member.username)') && dashboard.includes('exportName(study)'));
assert(dashboard.includes('study-search') && dashboard.includes('Save participant settings'));
assert(dashboard.includes('customConfig: customToggle.checked'));
assert(dashboard.includes("navigate('Levels'"));
assert(!dashboard.includes("node('p', frame); breadcrumb"));
const flow = fs.readFileSync(path.join(__dirname,'../src/ts/study/flowBoard.ts'),'utf8');
assert(flow.includes('Level selection') && flow.includes('Unlock levels') && flow.includes('Number of plays'));
const css = fs.readFileSync(path.join(__dirname,'../src/css/study.css'),'utf8');
assert(css.includes('.study-level-upload') && css.includes('.study-study-tabs') && css.includes('.study-roster-item'));
console.log('PASS: selection modes, choice validation, progress keys, short-password transformation, compact participant UI, filenames and study timeline');
