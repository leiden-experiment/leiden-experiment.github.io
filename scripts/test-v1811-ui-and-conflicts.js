/** Functional no-browser regression: bundled BPM sliders/one-loop defaults and safe save conflicts.
 * Live Firebase and Webpack still require a real deployment/build to verify. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = (() => { try { return require('typescript'); }
  catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const transpile = p => ts.transpileModule(read(p), { fileName:p,
  compilerOptions: { target:ts.ScriptTarget.ES2020, module:ts.ModuleKind.CommonJS, strict:true }
}).outputText;
const typesExports = {};
vm.runInNewContext(transpile('src/ts/study/types.ts'),
  { exports:typesExports, Date, Number, Math, Object, Array, JSON });
assert.equal(typesExports.defaultStudySettings().weeks['1'].filter(typesExports.isLevelStep)[0].loops, 1,
  'new studies must start with a one-loop play slide');

class Element {
  constructor(tag) {
    this.tagName=tag; this.children=[]; this.parentNode=null; this._text='';
    this.className=''; this.value=''; this.listeners={}; this.hidden=false; this.attributes={};
    this.classList={add: (...items)=>{for(const item of items) this.className+=' '+item;},
      remove: (...items)=>{this.className=this.className.split(' ').filter(x=>!items.includes(x)).join(' ');}};
  }
  set textContent(text) { this.children.forEach(x=>x.parentNode=null); this.children=[]; this._text=String(text); }
  get textContent() { return this._text+this.children.map(x=>x.textContent).join(''); }
  appendChild(child) {
    if(child.parentNode) child.remove();
    this.children.push(child); child.parentNode=this; return child;
  }
  replaceChildren(...children) {
    this.children.forEach(c=>c.parentNode=null); this.children=[]; this._text='';
    children.forEach(child=>this.appendChild(child));
  }
  remove() { if(this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this),1); this.parentNode=null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name) { for(const callback of this.listeners[name]||[]) callback({ type:name }); }
  setAttribute(name,val) { this.attributes[name]=val; }
  querySelectorAll(selector) {
    const nodes=[]; const search=node=>{for(const child of node.children){
      if(selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) nodes.push(child);
      search(child);
    }}; search(this); return nodes;
  }
  find(predicate) { for(const child of this.children) {
    if(predicate(child)) return child;
    const found=child.find(predicate); if(found) return found;
  } }
}
const mockDocument = {createElement:tag=>new Element(tag)};
const boardExports = {};
vm.runInNewContext(transpile('src/ts/study/flowBoard.ts'), {
  exports:boardExports, require:name=>{assert.equal(name,'./types'); return typesExports;},
  document:mockDocument, JSON, Object, Number, Array, Math, String
});
const {createFlowBoard}=boardExports;
function build(kind) {
  const holder=new Element('div');
  const board=createFlowBoard(holder, {'1':[]}, ()=>{}, false);
  const add=holder.find(x=>x.tagName==='button' && x.textContent===`+ ${kind}`);
  assert(add,`missing Add ${kind} button`);
  add.onclick();
  const slide=holder.find(x=>x.className.split(' ').includes('study-slide'));
  assert(slide);
  slide.dispatch('click');
  const slider=holder.find(x=>x.tagName==='input' && x.type==='range');
  assert(slider,'bundled BPM slider should be present');
  assert.deepEqual([slider.min,slider.max,slider.step],['0','2','1']);
  assert.equal(slider.value,'0','new slide should start at 90 BPM');
  return {holder,board,slider};
}
const level=build('Play level');
assert.equal(level.board.getWeeks()['1'][0].loops,1);
level.slider.value='2'; level.slider.dispatch('input');
assert.equal(level.board.getWeeks()['1'][0].bpmIndex,2);
assert(level.holder.textContent.includes('BPM: 130'),'slider must display actual BPM, not index');
const selection=build('Level selection');
assert.equal(selection.board.getWeeks()['1'][0].choices[0].loops,1);
selection.slider.value='1'; selection.slider.dispatch('input');
assert.equal(selection.board.getWeeks()['1'][0].choices[0].bpmIndex,1);
assert(selection.holder.textContent.includes('BPM: 115'));
selection.holder.find(x=>x.tagName==='button' && x.textContent==='+ Add selectable level').onclick();
assert.equal(selection.board.getWeeks()['1'][0].choices[1].loops,1);

const client=read('src/ts/study/dashboard.ts');
const api=read('src/ts/study/firebaseClient.ts');
const server=read('functions/index.js');
assert(client.includes('id ? data : undefined, databaseURL'),
  'the dashboard must include the original settings and results DB link on save');
assert(api.includes('originalSettings, originalDatabaseURL'),
  'the client must send the saved baseline to the server');
assert(server.includes('sameStudySettings(existing?.settings, originalSettings)'),
  'reconcile stale revisions only when baseline matches current study content');
assert(server.includes("storedLink !== String(originalDatabaseURL || '').trim()"),
  'a changed linked results database must remain a true conflict');
assert(server.includes('if (revision !== acceptedRevision) return;'),
  'Firebase transaction must recheck the accepted revision to avoid overwrites');
console.log('PASS: DOM-tested three-position bundled BPM sliders (90/115/130), new one-loop slides and choices, safe revision reconciliation');
