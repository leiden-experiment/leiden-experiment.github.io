'use strict';
/** Reproduce cross-week drag previews and the fixed-calendar Continue request.
 * The Firebase stub rejects undefined transaction fields like real RTDB does.
 * These are source-level simulations, not a deployed Firebase/browser test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const compile = rel => ts.transpileModule(source(rel), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

// Deliberately minimal DOM: moving the same element between two parents works
// exactly as appendChild/insertBefore do in the browser.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.className = ''; this.textContent = ''; this.hidden = false;
    this.classList = {
      add: (...tokens) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...tokens])].join(' '); },
      remove: (...tokens) => { this.className = this.className.split(/\s+/).filter(c => c && !tokens.includes(c)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name)
    };
  }
  appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
  insertBefore(child, reference) {
    child.remove(); const index = this.children.indexOf(reference);
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child); child.parentNode = this; return child;
  }
  remove() { if (this.parentNode) { const index = this.parentNode.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); this.parentNode = null; } }
  replaceChildren(...items) { for (const child of this.children) child.parentNode = null; this.children = []; items.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, fn) { this[`on_${name}`] = fn; }
  getBoundingClientRect() { const index = this.parentNode?.children.indexOf(this) || 0; return { left: index * 110, width: 100 }; }
  querySelectorAll(selector) {
    assert(selector.startsWith('.'), `Unexpected selector ${selector}`);
    const result = [];
    const visit = node => { for (const child of node.children) { if (child.classList.contains(selector.slice(1))) result.push(child); visit(child); } };
    visit(this); return result;
  }
}
const document = { createElement: tag => new Element(tag) };
const types = {};
vm.runInNewContext(compile('src/ts/study/types.ts'), { exports: types, Date, Number, JSON, Math, Object, String, Array, Set });
const gameplay = {};
vm.runInNewContext(compile('src/ts/study/gameplayFields.ts'), { exports: gameplay, Object });
const flow = {};
vm.runInNewContext(compile('src/ts/study/flowBoard.ts'), {
  exports: flow, document, JSON, Array, Object, Number, Math, Set, confirm: () => true,
  require: name => name === './types' ? types : name === './gameplayFields' ? gameplay : (() => { throw Error(name); })()
});
const parent = new Element('div');
const updates = [];
const slides = {
  1: [{ type: 'start', text: 'A' }, { type: 'level', levelId: 'legacy:Trained', bpmIndex: 0, loops: 1 }],
  2: [{ type: 'start', text: 'B' }, { type: 'level', levelId: 'legacy:Trained', bpmIndex: 0, loops: 1 }]
};
const board = flow.createFlowBoard(parent, slides, weeks => updates.push(weeks), true);
const rows = () => parent.querySelectorAll('.study-week-row');
const rowSlides = n => rows()[n].querySelectorAll('.study-slides')[0];
const markers = () => parent.querySelectorAll('.study-drop-indicator');
const dragEvent = clientX => ({ clientX, preventDefault() {}, stopPropagation() {}, dataTransfer: { setData() {}, dropEffect: null } });
assert.equal(rows().length, 2);
rowSlides(1).querySelectorAll('.study-slide')[0].ondragstart(dragEvent(0));
rowSlides(0).ondragover(dragEvent(-999));
assert.equal(rowSlides(0).querySelectorAll('.study-drop-indicator').length, 1);
rowSlides(1).ondragover(dragEvent(999));
assert.equal(rowSlides(0).querySelectorAll('.study-drop-indicator').length, 0, 'Moving hover back to Week 2 must remove Week 1 marker');
assert.equal(markers().length, 1, 'Only one drop indicator can exist anywhere');
rowSlides(0).ondragover(dragEvent(-999));
rowSlides(0).ondrop(dragEvent(-999));
assert.equal(markers().length, 0, 'Drop removes the shared indicator');
assert.equal(board.getWeeks()['1'][0].text, 'B', 'Slide moved from Week 2 into Week 1');
rowSlides(0).querySelectorAll('.study-slide')[0].ondragstart(dragEvent(0));
rowSlides(1).ondragover(dragEvent(999));
rowSlides(1).ondrop(dragEvent(999));
assert.equal(markers().length, 0, 'Dragging a slide back must leave no marker in Week 1');
assert.equal(board.getWeeks()['2'].at(-1).text, 'B', 'Slide moved back into Week 2');
rowSlides(0).querySelectorAll('.study-slide')[0].ondragstart(dragEvent(0));
rowSlides(1).ondragover(dragEvent(999));
assert.equal(markers().length, 1);
rowSlides(0).querySelectorAll('.study-slide')[0].ondragend();
assert.equal(markers().length, 0, 'Cancelled cross-week drag removes indicator');
console.log('PASS: cross-week drag hover, move there and back, and cancel leave no Drop here markers');

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const database = () => {
  const store = {};
  const at = key => key.split('/').filter(Boolean).reduce((obj, part) => obj?.[part], store);
  function put(key, value) {
    const parts = key.split('/').filter(Boolean); let current = store;
    for (const part of parts.slice(0, -1)) current = current[part] ||= {};
    current[parts.at(-1)] = clone(value);
  }
  const assertValid = (value, location = 'data') => {
    if (value === undefined) throw Error(`Bad Request: INVALID_ARGUMENT: undefined at ${location}`);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) assertValid(child, `${location}.${key}`);
  };
  let coldNext = false;
  return { store, setCold: () => { coldNext = true; }, ref: key => ({
    get: async () => ({ val: () => clone(at(key)), exists: () => at(key) !== undefined }),
    set: async value => { assertValid(value); put(key, value); },
    transaction: async updater => {
      if (coldNext) {
        coldNext = false;
        const optimistic = updater(null);
        if (optimistic !== undefined) assertValid(optimistic, 'optimistic transaction');
      }
      const next = updater(clone(at(key)));
      if (next === undefined) return { committed: false, snapshot: { val: () => clone(at(key)) } };
      assertValid(next, 'transaction');
      put(key, next);
      return { committed: true, snapshot: { val: () => clone(at(key)) } };
    }
  }) };
};
const central = database();
const auth = { getUser: async () => ({ disabled: false, tokensValidAfterTime: '1970-01-01T00:00:00.000Z' }) };
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const functions = { exports: {} };
vm.runInNewContext(source('functions/index.js'), {
  exports: functions.exports, module: functions, require: name => {
    if (name === 'firebase-functions/v2/https') return { onCall: (_, handler) => handler, HttpsError };
    if (name === 'firebase-admin') return {};
    if (name === 'firebase-admin/app') return { getApps: () => [true], initializeApp() {} };
    if (name === 'firebase-admin/database') return { getDatabase: () => central };
    if (name === 'firebase-admin/auth') return { getAuth: () => auth };
    if (name === 'node:crypto') return require(name);
    if (name.startsWith('./')) return require(path.join(root, 'functions', name));
    throw Error(name);
  }, Buffer, URL, Date, JSON, Number, Object, Array, Math, Set, String
});
const request = data => ({ auth: { uid: 'participant-1', token: { auth_time: 1 } }, data });
(async () => {
  const today = new Date();
  const iso = date => date.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + 13 * 86400000);
  await central.ref('accounts/participant-1').set({ uid: 'participant-1', role: 'participant', active: true, studyId: 'study-1', participantId: 'p1', group: '' });
  await central.ref('studies/study-1/settings').set({ enabled: true, scheduleMode: 'fixed', weeklyEnabled: true,
    startDate: iso(today), endDate: iso(endDate), maxSessionsPerWeek: 2,
    weeks: { '1': [{ type: 'start', text: 'Continue' }, { type: 'break', text: 'Continue when ready' },
      { type: 'level', levelId: 'legacy:Trained', loops: 1, bpmIndex: 0 }] } });
  // Before any completed study session, totalCompletedSessions is intentionally absent.
  central.setCold();
  const first = await functions.exports.advanceStudyStep(request({ week: 1, sessionId: '1-1', index: 0, stepType: 'start' }));
  assert.equal(first.ok, true);
  assert.equal(first.progress.completed['1'][0], '1-1:0');
  assert.equal(Object.hasOwn(first.progress, 'totalCompletedSessions'), false);
  const second = await functions.exports.advanceStudyStep(request({ week: 1, sessionId: '1-1', index: 1, stepType: 'break' }));
  assert.equal(second.ok, true);
  assert.equal(second.progress.completed['1'][1], '1-1:1');
  assert.equal(Object.hasOwn(central.store.progress['study-1']['participant-1'], 'totalCompletedSessions'), false);
  const repeated = await functions.exports.advanceStudyStep(request({ week: 1, sessionId: '1-1', index: 1, stepType: 'break' }));
  assert.equal(repeated.resynced, true, 'Repeat Continue must resync instead of skipping a slide');
  console.log('PASS: fixed weekly schedule Continue writes valid Firebase transaction without an undefined total, including cold cache and repeated requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
