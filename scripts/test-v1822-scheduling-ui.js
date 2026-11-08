'use strict';
/** Focused verification of v1.8.22 date formatting, weekly rows and button sizing.
 * Runs without browser SDKs; full browser/Firebase validation is separate. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const text=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
function transpile(rel) {return ts.transpileModule(text(rel),{fileName:rel,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;}
function load(rel,mods={}) {
  const exports={};vm.runInNewContext(transpile(rel),{exports,require:id=>{if(!(id in mods)) throw Error('Missing mock '+id);return mods[id]},Date,Math,Number,Object,Array,JSON,String,Set},{filename:rel});return exports;
}
const dates=load('src/ts/study/dateFormat.ts');
assert.equal(dates.displayDate('2026-11-14'),'14-11-2026');
assert.equal(dates.displayDate('2026-11-14T10:22:00Z'),'14-11-2026');
assert.equal(dates.isoDate('14-11-2026'),'2026-11-14');
assert.equal(dates.isoDate('29-02-2028'),'2028-02-29');
assert.equal(dates.isoDate(''), '');
for(const value of ['31-02-2026','29-02-2027','99-11-2026','2026-11-14','12/11/2026']) assert.throws(()=>dates.isoDate(value));
assert.match(dates.displayDateTime('2026-11-14T10:22:00Z'),/^14-11-2026 \d\d:\d\d$/);
const dashboard=text('src/ts/study/dashboard.ts');
const flow=text('src/ts/study/flowBoard.ts');
const css=text('src/css/study.css');
assert(dashboard.includes("status.classList.add('study-compact-toggle')"));
assert(dashboard.includes("studyActions.classList.add('study-study-row-actions')"));
assert(dashboard.includes("const remove = action(studyActions, '×'"));
assert(css.includes('.study-study-row-actions') && css.includes('.study-compact-toggle'));
const start=dashboard.indexOf('const weeklyRow = node('),datesIndex=dashboard.indexOf('const dates = node('),durationIndex=dashboard.indexOf('const durationBlock = node('),limitIndex=dashboard.indexOf('const limitRow = node(');
assert(start>0 && start<datesIndex && datesIndex<durationIndex && durationIndex<limitIndex,'Expected schedule order: mode → dates/duration → weekly cap');
assert(!dashboard.includes('If a Pre-test exists, it must be completed first. The next login starts Week 1.'));
assert(dashboard.includes('const fixedWeeks = field(dates') && dashboard.includes('Calculated end date:')); // End date is now computed from a week count.
assert(css.includes('study-schedule-week-count') && css.includes('align-items:center'));
assert(!dashboard.includes('dateField(assignmentFields') && !dashboard.includes('dateField(create'), 'Participant start date is now read-only info');
assert(dashboard.includes('displayDateTime(recordedAt)'));
assert(dashboard.includes('displayDate(member.startDate)') && dashboard.includes('isoDate(start.value)'));
assert(dashboard.includes('persistent personal seven-day schedule')); 
const types=load('src/ts/study/types.ts');
const level={type:'level',levelId:'legacy:Trained',loops:1,bpmIndex:0};
const firstWeek=[{type:'start',text:'Hello'},{type:'selection',text:'Choose',choices:[level],unlock:'all',playthroughs:2},{type:'end',text:'Goodbye'}];
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this._text='';this.className='';this.value='';this.listeners={};this.attributes={};this.classList={add:(...names)=>{this.className+=' '+names.join(' ');},remove:()=>{}};}
  set textContent(text){this.children.forEach(child=>child.parentNode=null);this.children=[];this._text=String(text);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  appendChild(child){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this;return child;}
  replaceChildren(...children){this.children.forEach(c=>c.parentNode=null);this.children=[];this._text='';for(const child of children)this.appendChild(child);}
  remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}
  addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
  setAttribute(name,value){this.attributes[name]=value;}
  find(predicate){for(const child of this.children){if(predicate(child))return child;const descendant=child.find(predicate);if(descendant)return descendant;}}
}
const boardModule={};
vm.runInNewContext(transpile('src/ts/study/flowBoard.ts'),{exports:boardModule,require:name=>name==='./types'?types:{gameplayOptions:[]},document:{createElement:tag=>new Element(tag)},JSON,Object,Number,Array,Math,String});
const rootNode=new Element('div');
const board=boardModule.createFlowBoard(rootNode,{'1':firstWeek},()=>{},true);
let addWeek=rootNode.find(node=>node.tagName==='button' && node.textContent==='+ Add week');
assert(addWeek);
addWeek.onclick();
let saved=board.getWeeks();
assert.equal(saved['2'].length,3);
assert.deepEqual(JSON.parse(JSON.stringify(saved['1'])),JSON.parse(JSON.stringify(saved['2'])));
saved['2'][1].choices[0].loops=99;
assert.equal(saved['1'][1].choices[0].loops,1,'Cloning must not share nested selections');
// A real editing change in Week 2 must not affect Week 1.
const updated=board.getWeeks(); updated['2'][0].text='Changed in Week 2';board.setWeeks(updated);
assert.equal(board.getWeeks()['1'][0].text,'Hello');
assert.equal(board.getWeeks()['2'][0].text,'Changed in Week 2');
// v1.8.23: Fixed study date range bounds the number of timeline weeks,
// and shrinking the range removes only out-of-range weeks, not Pre/Post-tests.
board.setWeekLimit(2);
saved = board.getWeeks();
assert.equal(saved['3'], undefined);
const limitedAdd = rootNode.find(node => node.tagName === 'button' && node.textContent === '+ Add week');
assert.equal(limitedAdd.disabled,true,'Add week should be disabled at the date-derived cap');
board.setWeekLimit(1);
assert.equal(board.getWeeks()['2'], undefined,'Shortening the study must remove Week 2');
assert.equal(board.getWeeks()['1'].length,3,'Week 1 must remain intact');
board.setWeekLimit(3);
assert.equal(rootNode.find(node => node.tagName === 'button' && node.textContent === '+ Add week').disabled,false);
assert(dashboard.includes("['single', 'Single session"),'Single session must be a visible dropdown option');
assert(!dashboard.includes('const weekly = check(options'),'Weekly study checkbox should be gone');
assert(dashboard.includes('setParticipantWeekSessions('),'Researchers need an editable weekly session count');
const fixedData = {...types.defaultStudySettings(),weeklyEnabled:true,scheduleMode:'fixed',
  startDate:'2026-11-15',endDate:'',durationWeeks:1,weeks:{'1':[level],'2':[level]}};
assert(types.validateSettings(fixedData).some(message => message.includes('only 1 week')),
  'The saved timeline must not exceed the fixed date range');
assert.equal(types.validateSettings({...fixedData,weeks:{'1':[level]}}).length,0);
const old=types.emptyProgress();
const reassigned={...old,stageOverride:{week:1,sessionNumber:1}};
const finished=types.markAssignmentComplete(reassigned,1,'1-1',0,1);
assert.equal(finished.stageOverride,undefined,'Temporary stage returns to automatic after complete session');
const calendar={...types.defaultStudySettings(),weeklyEnabled:true,scheduleMode:'individual',durationWeeks:3,maxSessionsPerWeek:2,weeks:{'1':[level],'2':[level],'3':[level]}};
const current=types.getNextAssignment(calendar,finished,'2026-11-01',new Date('2026-11-10T11:00:00Z'));
assert.equal(current.week,2,'After the forced Week 1 session, the next login returns to calendar week 2');
const buttonSrc=text('src/ts/ui/button.ts');
assert(buttonSrc.includes('public fitTextToButton(')&&buttonSrc.includes('public setScale('));
assert(buttonSrc.includes('this.displayWidth') && buttonSrc.includes('this.displayHeight'));
assert(buttonSrc.includes('label.setScale(scale)') && buttonSrc.includes('label.setFontSize(renderSize)'), 'The visible label must now be sized by a real Phaser Text scale');
const scene=text('src/ts/scenes/studySessionScene.ts');
assert(scene.includes('button.fitTextToButton(maxLines)'));
console.log('PASS: DD-MM-YYYY validation/display, fixed schedule layout, end-date minimum, participant overrides, independent cloned weeks, proportional button labels');
