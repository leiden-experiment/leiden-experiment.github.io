/** Dependency-free regressions for the dashboard contract and the protected schedule flags. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const dashboard = source('src/ts/study/dashboard.ts');
const board = source('src/ts/study/flowBoard.ts');
const css = source('src/css/study.css');
const functions = source('functions/index.js');
const app = source('src/ts/core/game.ts');
for (const label of ["'← Back'", "'Studies'", "'Levels'", '`Sign Out (']) assert(dashboard.includes(label), label);
assert(dashboard.includes('crypto.getRandomValues'), 'Study and library IDs must be random');
assert(dashboard.includes("newId('study')") && dashboard.includes("newId('level')"));
assert(!dashboard.includes('Study ID (letters'), 'No manual study ID field');
assert(!dashboard.includes("'Description'"), 'No study description editor');
assert(dashboard.includes('showModerators(study)'), 'Moderators must be managed in a study');
assert(dashboard.includes('dateRangeEnabled: dateEnabled.checked') && dashboard.includes('weeklyEnabled: weekly.checked'));
assert(dashboard.includes('Override default gameplay settings') && dashboard.includes('Use group-specific gameplay settings'));
assert(board.includes('study-drop-indicator') && board.includes('slides.insertBefore(indicator, target)'));
assert(board.includes('Delete this slide') && !board.includes('Delete selected slide'));
assert(!board.includes("button(controls, '→'"), 'Movement arrows must be removed');
assert(css.includes('.study-admin-dashboard .study-nav') && css.includes('.study-drop-indicator'));
assert(app.includes("root.classList.remove('study-shell', 'study-login', 'study-admin-dashboard')"), 'Leaving the gateway must remove dashboard and login themes');
assert(functions.includes('studyTiming(settings, account, weeks, progress)'));
assert(functions.includes('studyTiming(settings, account, weeks, progress)'));
console.log('PASS: immediate navbar, random IDs, study-scoped moderators, visual slide insertion, per-field configs, date/week server enforcement');
// Revised research UX, credential management and JSON-only exports.
const sessionScene = source('src/ts/scenes/studySessionScene.ts');
const scoreboard = source('src/ts/scenes/scoreboardScene.ts');
const runtime = source('src/ts/study/runtime.ts');
const types = source('src/ts/study/types.ts');
const frontend = source('src/ts/study/firebaseClient.ts');
assert(!dashboard.includes('Import study template'), 'Study template import must be removed');
assert(!dashboard.includes('Export study results'), 'Export action belongs on participant page');
assert(!dashboard.includes('Offline pack'), 'Offline pack button must not appear in participant roster');
assert(!dashboard.includes('resultsCSV('), 'Researcher export should be JSON only');
assert(dashboard.includes('Download all participant data') && dashboard.includes("'Download participant results (JSON)'"));
assert(dashboard.includes('groupSelect(') && dashboard.includes('Save participant settings'));
assert(dashboard.includes('Change username') && dashboard.includes('Change password'));
assert(dashboard.includes('...(perParticipant.checked ? { durationWeeks:') && dashboard.includes('participantStartMode: startMode.value'));
assert(!dashboard.includes('Enable participant access'), 'New studies must be enabled automatically');
assert(dashboard.includes('user.username'));
assert(app.includes('study-login-card') && app.includes('Show password'), 'Leiden login must be adopted');
assert(app.includes("root.style.display = 'block'"), 'Dashboard must not retain centered login flex display');
assert(css.includes('.study-login-card') && css.includes('.study-signout'));
assert(frontend.includes('updateAccountCredentials'), 'Credential updates must use a protected API');
assert(functions.includes('exports.updateAccountCredentials') && functions.includes('auth.updateUser(uid, change)'));
assert(functions.includes("settings.participantStartMode === 'first-login'"));
assert(functions.includes('pendingResults[key]'), 'Duplicate result submissions must recover from a staged record');
assert(functions.includes('progress.pendingResults[key] = record'), 'Progress and result must be committed atomically');
assert(functions.includes('previous => previous || staged'), 'Duplicate retries must not overwrite delivered results');
assert(functions.includes('exports.removeStudy') && functions.includes('archivedAt'), 'Removing studies must preserve an audit trail');
assert(dashboard.includes('Remove study') && dashboard.includes('confirm('), 'Study removal must require confirmation');
assert(css.includes('study-full-actions') && css.includes('background:#0d1421'), 'Create button and dark theme must be present');
assert(types.includes('durationWeeks?: number') && types.includes("participantStartMode?: 'manual' | 'first-login'"));
assert(sessionScene.includes('autoSaveCSV: false'), 'Study CSV must not be written during gameplay');
assert(sessionScene.includes('hasJustFinishedSession()'), 'Finished participant sessions must show a thank-you screen');
assert(scoreboard.includes('createStudyCompletionScreen()') && scoreboard.includes("'RETRY SAVE'"));
assert(scoreboard.indexOf('this.createStudyCompletionScreen();') < scoreboard.indexOf('this.back = new Button('),
  'Research sessions must bypass guest scoreboard controls');
assert(runtime.includes('pendingSave = promise'), 'Duplicate completion clicks must coalesce');
console.log('PASS: clean research login, participant credentials, JSON exports, per-user duration, study-only result submission and retry');

// Research dashboard regression checks: consistent action sizes, no level IDs, and informative disabled login.
assert(css.includes('.study-list-card') && css.includes('.study-remove-study') && css.includes('.study-remove-level'), 'Study and library row sizing missing');
assert(dashboard.includes("node('strong', label, level.name);"), 'Uploaded levels should show their display name');
assert(!dashboard.includes("node('small', label, `library:${level.id}`)"), 'Uploaded level ID should not be displayed');
assert(fs.readFileSync(path.resolve(__dirname, '../src/ts/core/game.ts'), 'utf8').includes('Account disabled by admin.'), 'Disabled-account message missing');


// v1.8.5 timeline and login UI regression: editor follows its own week; actions use
// accessible intent colors with square X buttons and no inherited input glow.
assert(board.includes("toolbar.className = 'study-flow-toolbar'"));
assert(board.includes("toolbarActions.className = 'study-flow-toolbar-actions'"));
for (const label of ["'+ Add week'", "'+ Pre-test'", "'+ Post-test'"]) {
  assert(board.includes(`button(toolbarActions, ${label}`), `Week control ${label} not in common toolbar row`);
}
assert(board.includes('if (selected?.week === week) section.appendChild(editor)'), 'Selected slide editor must be inside its week');
assert(!board.includes("parent.appendChild(editor)"), 'Editor must not appear after all weeks');
assert(!board.includes('Use the × on a slide to delete it.'), 'Obsolete slide help text');
assert(board.includes("removeRow.classList.add('study-week-delete')"), 'Square week delete icon missing');
assert(board.includes("remove.classList.add('study-slide-delete')"), 'Square slide delete icon missing');
assert(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), 'Week toolbar buttons need equal widths');
assert(css.includes('button.study-week-delete') && css.includes('button.study-slide-delete'), 'Red square delete style missing');
for (const type of ['start','level','selection','break','end']) {
  assert(css.includes(`.study-slide.study-slide-${type}`), `${type} slide must have a distinct tint`);
}
assert(dashboard.includes("button.classList.add('study-action-save')"));
assert(dashboard.includes("button.classList.add('study-action-add')"));
assert(css.includes('background:#1b5138!important') && css.includes('background:#193c65!important'), 'Save and add accents missing');
assert(css.includes('.study-shell.study-login .study-login-card input:not([type=checkbox]):focus') && css.includes('box-shadow:none!important; text-shadow:none!important;'), 'Research login input must not glow');
console.log('PASS: centered research login fields, equal week buttons, red square delete, inline slide editor, action colors and slide tints');

// v1.8.6: study slides can assign exact imported-level tempos without changing
// the canonical JSON; bundle-backed legacy levels still use BPM indexes.
assert(board.includes("slider.type = 'range'") && board.includes("slider.max = '200'"));
assert(board.includes('tempoSlider(editor, step)') && board.includes('tempoSlider(row, choice)'));
assert(types.includes('bpm?: number'));
assert(functions.includes('a.bpm >= 60 && a.bpm <= 200'));
assert(source('src/ts/scenes/studySessionScene.ts').includes('studyTrackKeyForBpm(id, customBpm)'));
console.log('PASS: study-level and selection-level exact BPM sliders and server-side tempo validation');
