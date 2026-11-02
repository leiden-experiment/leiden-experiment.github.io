/* All privileged operations are callable Cloud Functions; the client receives no service account credentials. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { randomBytes } = require('node:crypto');
const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
if (!getApps().length) initializeApp();
const db = getDatabase();
const auth = getAuth();
const options = { region: 'europe-west1', maxInstances: 20 };
const fail = (message, code = 'invalid-argument') => { throw new HttpsError(code, message); };
const idValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const { normalizeUsername, emailForUsername } = require('./username');
const { firebasePassword } = require('./password');
const usernameValid = value => { try { normalizeUsername(value); return true; } catch { return false; } };
const isLevel = step => step && (!step.type || step.type === 'level');
const isSelection = step => step && step.type === 'selection';
// Realtime Database can decode numeric child keys (for example, only week '1')
// as a sparse array: [null, [slides...]]. Never treat this as an empty study;
// doing so silently erases slides the next time a researcher saves settings.
function effectiveWeeks(weeks) {
  if (weeks == null) return { '1': [] }; // Empty timelines are valid.
  if (typeof weeks !== 'object') fail('Study timeline could not be read; nothing was changed');
  const restored = {};
  for (const [week, slides] of Object.entries(weeks)) {
    if (!/^(?:-1|0|[1-9]\d*)$/.test(week)) fail('Invalid week in saved study timeline');
    if (slides == null) continue; // Firebase removes empty weeks.
    if (!Array.isArray(slides)) fail(`Saved week ${week} is not a slide list; nothing was changed`);
    restored[week] = slides;
  }
  if (!restored['1']) restored['1'] = [];
  return restored;
}
const choiceKey = (week, sid, index) => `${week}_${sid}_${index}`;
const unlockedChoice = (step, index, week, counts) => index >= 0 && index < step.choices.length &&
  (step.unlock === 'all' || (step.unlock === 'weekly' && index + 1 <= Math.max(1, week)) ||
    (step.unlock === 'sequential' && (index === 0 || (counts[String(index - 1)] || 0) > 0)));
const validAssignment = a => a && typeof a.levelId === 'string' && /^(legacy|library|uploaded):[\w .-]{1,100}$/.test(a.levelId) &&
  Number.isInteger(a.bpmIndex) && a.bpmIndex >= 0 && a.bpmIndex <= 8 &&
  Number.isInteger(a.loops) && a.loops >= 1 && a.loops <= 100;
// Mirror the public controls in src/ts/study/gameplayFields.ts. Validate API calls as well as the UI.
const numericLimits = {
  targetSize: [0.1, 5], fingerSize: [0.1, 5], skipButtonAppearsAfterLoop: [0, 100],
  skipLayersAutomaticallyAfterLoop: [1, 100], pinchVolume: [0, 1], backgroundMusicVolume: [0, 1],
  onTimeDuration: [0, 5000], lateTimeDuration: [0, 5000], cameraOpacity: [0, 1]
};
const boolConfigFields = new Set([
  'showSkipButton', 'skipLayersAutomatically', 'ignoreMultifingerPinches', 'mousePinchesEnabled',
  'uiPinchesEnabled', 'sonificationEnabled', 'synchronizationEnabled', 'playableBackingTracksEnabled',
  'unplayableBackingTracksEnabled', 'disableLayerProgression', 'indexFingerOnly', 'enableCameraVisibility',
  'postProcessingDisabled', 'displayVisualMetronome', 'autoSaveCSV'
]);
const configValid = config => config && typeof config === 'object' && !Array.isArray(config) &&
  JSON.stringify(config).length <= 12000 && Object.entries(config).every(([key, value]) =>
    boolConfigFields.has(key) ? typeof value === 'boolean' :
    Object.prototype.hasOwnProperty.call(numericLimits, key) && typeof value === 'number' &&
      Number.isFinite(value) && value >= numericLimits[key][0] && value <= numericLimits[key][1] &&
      (!['skipButtonAppearsAfterLoop', 'skipLayersAutomaticallyAfterLoop'].includes(key) || Number.isInteger(value)));
async function profile(req) {
  if (!req.auth) fail('Login required', 'unauthenticated');
  // Check disabled users and revoked sessions on every privileged call, not just at sign-in.
  // Firebase ID tokens can otherwise remain usable for up to an hour after a password reset.
  const authUser = await auth.getUser(req.auth.uid);
  if (authUser.disabled) fail('Account disabled', 'permission-denied');
  const validAfter = Date.parse(authUser.tokensValidAfterTime || '1970-01-01') / 1000;
  if (Number.isFinite(validAfter) && validAfter > (req.auth.token.auth_time || 0))
    fail('Session expired or revoked; sign in again', 'unauthenticated');
  const snap = await db.ref(`accounts/${req.auth.uid}`).get();
  const account = snap.val();
  if (req.auth.token.superadmin === true) return { ...account, uid: req.auth.uid, username: account?.username || authUser.displayName || (authUser.email || '').split('@')[0] || 'administrator', role: 'admin', active: true };
  if (!account || !account.active) fail('Account disabled or not enrolled', 'permission-denied');
  return { ...account, uid: req.auth.uid };
}
function requireAdmin(account) { if (account.role !== 'admin') fail('Administrator permission required', 'permission-denied'); }
function requireResearcher(account, studyId) {
  if (account.role !== 'admin' && !(account.role === 'moderator' && account.studyId === studyId))
    fail('No access to this study', 'permission-denied');
}
function validateSettings(s) {
  if (!s || typeof s !== 'object' || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 120 ||
      typeof s.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate) || Number.isNaN(Date.parse(s.startDate)) ||
      (s.weeklyEnabled !== undefined && typeof s.weeklyEnabled !== 'boolean') ||
      (s.dateRangeEnabled !== undefined && typeof s.dateRangeEnabled !== 'boolean') ||
      (s.durationWeeks !== undefined && (!Number.isInteger(s.durationWeeks) || s.durationWeeks < 1 || s.durationWeeks > 104)) ||
      (s.participantStartMode !== undefined && !['manual','first-login'].includes(s.participantStartMode)) ||
      (s.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(s.endDate) || Number.isNaN(Date.parse(s.endDate)) || s.endDate < s.startDate)) ||
      !Number.isInteger(s.maxSessionsPerWeek) || s.maxSessionsPerWeek < 1 || s.maxSessionsPerWeek > 50 ||
      (s.weeks != null && (typeof s.weeks !== 'object' || Array.isArray(s.weeks)))) fail('Invalid study settings');
  for (const [week, assignments] of Object.entries(effectiveWeeks(s.weeks))) {
    if (!/^-?\d+$/.test(week) || !Array.isArray(assignments) || assignments.length > 40) fail('Invalid weekly schedule');
    if (assignments.length && !assignments.some(a => isLevel(a) || isSelection(a))) fail('Each populated week needs a playable level');
    for (const a of assignments) {
      if (!a || typeof a !== 'object') fail('Invalid study block');
      if (a.configOverride !== undefined && !configValid(a.configOverride)) fail('Invalid level gameplay override');
      if (['start', 'break', 'end'].includes(a.type)) {
        if (typeof a.text !== 'string' || a.text.length > 2000) fail('Screen text must be under 2,000 characters');
      } else if (isSelection(a) && typeof a.text === 'string' && a.text.length <= 2000 &&
        ['all','sequential','weekly'].includes(a.unlock) && Number.isInteger(a.playthroughs) &&
        a.playthroughs >= 0 && a.playthroughs <= 100 && Array.isArray(a.choices) &&
        a.choices.length >= 1 && a.choices.length <= 9 && a.choices.every(choice => validAssignment(choice) && (choice.configOverride === undefined || configValid(choice.configOverride)))) {
        // Levels are picked by the participant; the backend validates unlock and quota per result.
      } else if (validAssignment(a) && (!a.type || a.type === 'level')) {
        // Existing formats without an explicit type remain valid.
      } else fail('Invalid level assignment');
    }
  }
  if (s.defaultConfig !== undefined && !configValid(s.defaultConfig)) fail('Invalid default gameplay settings');
  if (s.groupConfigs && (typeof s.groupConfigs !== 'object' || Array.isArray(s.groupConfigs) ||
      Object.values(s.groupConfigs).some(g => !configValid(g)))) fail('Invalid group configurations');
  if (JSON.stringify(s).length > 200000) fail('Study settings exceed maximum size');
}
function checkedDbUrl(url) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { fail('Invalid Firebase database URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash ||
      !/^[a-z0-9-]+\.(?:firebaseio\.com|(?:[a-z0-9-]+\.)?firebasedatabase\.app)$/i.test(parsed.hostname)) fail('Only Firebase Realtime Database HTTPS roots are accepted');
  return parsed.origin + '/';
}
function destination(url) {
  if (!url) return db;
  const key = `study-${Buffer.from(url).toString('hex').slice(0, 100)}`;
  const app = getApps().find(a => a.name === key) || initializeApp({ credential: applicationDefault(), databaseURL: url }, key);
  return getDatabase(app);
}
function weekOf(start) {
  const date = new Date(`${start}T00:00:00Z`);
  const now = new Date();
  return Math.max(1, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - date.getTime()) / 604800000) + 1);
}
/** The source of truth for calendar restrictions and weekly schedules (also used by both progress endpoints). */
function studyTiming(settings, account, weeks, progress) {
  const weekly = settings.weeklyEnabled !== false; // Legacy saved studies remain weekly.
  const dates = settings.dateRangeEnabled !== false; // Legacy saved studies retain date restrictions.
  const start = account.startDate || settings.startDate;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const beforeStart = (dates && today < Date.parse(`${settings.startDate}T00:00:00Z`)) ||
    (!!settings.durationWeeks && today < Date.parse(`${start}T00:00:00Z`));
  const elapsedWeeks = weekOf(start);
  const afterEnd = (dates && !!settings.endDate && today > Date.parse(`${settings.endDate}T00:00:00Z`)) ||
    (!!settings.durationWeeks && elapsedWeeks > settings.durationWeeks);
  const current = weekly ? weekOf(start) : 1;
  const lastWeek = Math.max(1, ...Object.keys(weeks).map(Number).filter(n => n > 0));
  const week = weekly && weeks['0'] && !(progress.sessions['0'] || 0) ? 0 :
    weekly && current > lastWeek && weeks['-1'] && !(progress.sessions['-1'] || 0) ? -1 : current;
  const cap = weekly ? (week <= 0 ? 1 : settings.maxSessionsPerWeek) : Number.MAX_SAFE_INTEGER;
  return { week, beforeStart, afterEnd: afterEnd || (weekly && current > lastWeek && (!weeks['-1'] || !!progress.sessions['-1'])), cap };
}
exports.getProfile = onCall(options, async req => ({ account: await profile(req) }));
exports.listStudies = onCall(options, async req => {
  const account = await profile(req); if (account.role === 'participant') fail('Researcher permission required', 'permission-denied');
  const all = (await db.ref('studyIndex').get()).val() || {};
  const studies = Object.entries(all).filter(([id]) => account.role === 'admin' || account.studyId === id)
    .map(([id, value]) => ({ id, ...value }));
  return { studies };
});
exports.getStudySettings = onCall(options, async req => {
  const account = await profile(req); const { studyId } = req.data || {};
  if (!idValid(studyId)) fail('Invalid study ID'); requireResearcher(account, studyId);
  const [s, i] = await Promise.all([db.ref(`studies/${studyId}/settings`).get(), db.ref(`studyIndex/${studyId}`).get()]);
  if (!s.exists()) fail('Study not found', 'not-found');
  return { settings: { ...s.val(), weeks: effectiveWeeks(s.val().weeks) },
    databaseURL: account.role === 'admin' ? i.val()?.databaseURL : undefined };
});
exports.saveStudy = onCall(options, async req => {
  const account = await profile(req); requireAdmin(account);
  const { id, settings, databaseURL, confirmClearTimeline } = req.data || {};
  if (!idValid(id)) fail('Study ID must be 1–64 letters, digits, underscores or hyphens');
  validateSettings(settings);
  // Safety check: an accidental empty editor must not erase a populated study.
  // The client must explicitly confirm when a researcher intentionally clears it.
  const oldWeeks = effectiveWeeks((await db.ref(`studies/${id}/settings/weeks`).get()).val());
  const previousSlides = Object.values(oldWeeks).reduce((count, slides) => count + slides.length, 0);
  const updatedSlides = Object.values(effectiveWeeks(settings.weeks)).reduce((count, slides) => count + slides.length, 0);
  if (previousSlides > 0 && updatedSlides === 0 && confirmClearTimeline !== true)
    fail('This save would remove every slide from the study. Confirm clearing the timeline to proceed.', 'failed-precondition');
  const url = checkedDbUrl(databaseURL);
  if (url) {
    // A service account must have permissions on the linked project. This test fails closed.
    try { await destination(url).ref(`studies/${id}/_linkTest`).set({ checkedAt: Date.now() }); }
    catch { fail('Cannot write to linked database; grant the Functions service account access', 'failed-precondition'); }
  }
  await db.ref().update({ [`studies/${id}/settings`]: { ...settings, weeks: effectiveWeeks(settings.weeks) },
    [`studyIndex/${id}`]: { title: settings.title, enabled: !!settings.enabled, databaseURL: url || '' } });
  return { id };
});
/** Remove from the active dashboard without destroying research results.
 * Existing accounts are disabled and linked study results are retained for audit.
 */
exports.removeStudy = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { studyId } = req.data || {};
  if (!idValid(studyId)) fail('Invalid study ID');
  const studyRef = db.ref(`studies/${studyId}/settings`);
  const settings = (await studyRef.get()).val();
  if (!settings || !(await db.ref(`studyIndex/${studyId}`).get()).exists()) fail('Study not found', 'not-found');
  // Disable access before the study disappears from the list. Never delete results/progress.
  await studyRef.child('enabled').set(false);
  const members = Object.keys((await db.ref(`studyMembers/${studyId}`).get()).val() || {});
  const failures = [];
  for (const uid of members) {
    try {
      const member = (await db.ref(`accounts/${uid}`).get()).val();
      if (!member || member.studyId !== studyId || !['participant','moderator'].includes(member.role)) continue;
      await auth.updateUser(uid, { disabled: true });
      await db.ref(`accounts/${uid}/active`).set(false);
    } catch (error) { failures.push(uid); }
  }
  if (failures.length) fail('Could not disable all study accounts; study remains in list. Retry.', 'failed-precondition');
  await db.ref().update({ [`studyIndex/${studyId}`]: null, [`studies/${studyId}/archivedAt`]: new Date().toISOString() });
  return { ok: true };
});
exports.listModerators = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const accounts = (await db.ref('accounts').get()).val() || {};
  const moderators = Object.values(accounts).filter(a => a.role === 'moderator');
  if (moderators.length > 2000) fail('Too many moderators; contact an administrator', 'resource-exhausted');
  return { moderators };
});
exports.listParticipants = onCall(options, async req => {
  const account = await profile(req); const { studyId } = req.data || {};
  if (!idValid(studyId)) fail('Invalid study'); requireResearcher(account, studyId);
  const memberIds = Object.keys((await db.ref(`studyMembers/${studyId}`).get()).val() || {});
  const accounts = (await Promise.all(memberIds.slice(0, 1000).map(id => db.ref(`accounts/${id}`).get())))
    .filter(s => s.exists()).map(s => s.val());
  return { accounts };
});
exports.provisionAccount = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { studyId, username, password, role, group = '', startDate = '', customConfig } = req.data || {};
  if (!idValid(studyId) || !usernameValid(username) || !['participant', 'moderator'].includes(role) ||
      typeof password !== 'string' || password.length < 1 || password.length > 128) fail('Invalid participant or moderator fields');
  if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)))) fail('Invalid participant start date');
  if (typeof group !== 'string' || group.length > 100) fail('Invalid group');
  const settings = (await db.ref(`studies/${studyId}/settings`).get()).val();
  if (!settings) fail('Study not found', 'not-found');
  if (role === 'participant') {
    if (group && !Object.prototype.hasOwnProperty.call(settings.groupConfigs || {}, group)) fail('Unknown study group');
    if (settings.durationWeeks && settings.participantStartMode !== 'first-login' && !startDate) fail('Participant start date required');
  }
  if (customConfig !== undefined && (!configValid(customConfig) || role !== 'participant')) fail('Invalid custom gameplay settings');
  const name = normalizeUsername(username);
  let user;
  try { user = await auth.createUser({ email: emailForUsername(name), password: firebasePassword(password), displayName: name, disabled: false }); }
  catch (error) {
    if (error?.code === 'auth/email-already-exists') fail('Username already exists. Choose a different participant or moderator username.', 'already-exists');
    throw error;
  }
  const account = { uid: user.uid, username: name, role, studyId, participantId: role === 'participant' ? name : '', group, startDate, ...(customConfig ? { customConfig } : {}), active: true };
  try { await db.ref().update({ [`accounts/${user.uid}`]: account, [`studyMembers/${studyId}/${user.uid}`]: true }); }
  catch (error) { await auth.deleteUser(user.uid); throw error; }
  return { uid: user.uid };
});
exports.setAccountActive = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator); const { uid, active } = req.data || {};
  if (!idValid(uid) || typeof active !== 'boolean') fail('Invalid account change');
  const target = (await db.ref(`accounts/${uid}`).get()).val();
  if (!target || target.role === 'admin') fail('Not a managed account');
  await auth.updateUser(uid, { disabled: !active });
  await db.ref(`accounts/${uid}/active`).set(active);
  return { ok: true };
});
/** Only an administrator can remove an account. Results remain retained for the study export. */
exports.removeAccount = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { uid } = req.data || {};
  if (!idValid(uid)) fail('Invalid account');
  const account = (await db.ref(`accounts/${uid}`).get()).val();
  if (!account || !['moderator', 'participant'].includes(account.role) || !idValid(account.studyId)) fail('Not a managed account');
  // Deleting the Firebase Auth user invalidates future sign-ins. Remove access profile and membership.
  await auth.deleteUser(uid);
  await db.ref().update({ [`accounts/${uid}`]: null, [`studyMembers/${account.studyId}/${uid}`]: null });
  return { ok: true };
});
exports.resetModeratorPassword = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { uid, password } = req.data || {};
  if (!idValid(uid) || typeof password !== 'string' || password.length < 1 || password.length > 128) fail('Use a password of 1–128 characters');
  const account = (await db.ref(`accounts/${uid}`).get()).val();
  if (!account || account.role !== 'moderator') fail('Only moderator passwords can be reset here');
  await auth.updateUser(uid, { password: firebasePassword(password) });
  await auth.revokeRefreshTokens(uid);
  return { ok: true };
});

/** Update managed credentials without changing UID, study membership, or participant result key. */
exports.updateAccountCredentials = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { uid, username, password } = req.data || {};
  if (!idValid(uid)) fail('Invalid account');
  const target = (await db.ref(`accounts/${uid}`).get()).val();
  if (!target || !['moderator', 'participant'].includes(target.role)) fail('Not a managed account', 'permission-denied');
  const change = {};
  if (username !== undefined) {
    if (!usernameValid(username)) fail('Invalid username');
    const name = normalizeUsername(username);
    if (name !== target.username) { change.email = emailForUsername(name); change.displayName = name; }
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) fail('Use a password of 1–128 characters');
    change.password = firebasePassword(password);
  }
  if (!Object.keys(change).length) return { ok: true };
  await auth.updateUser(uid, change); // Firebase Auth enforces global username uniqueness.
  if (change.displayName) await db.ref(`accounts/${uid}/username`).set(change.displayName);
  if (change.password) await auth.revokeRefreshTokens(uid);
  return { ok: true };
});
exports.setParticipant = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator); const { uid, changes } = req.data || {};
  const target = (await db.ref(`accounts/${uid}`).get()).val();
  if (!target || target.role !== 'participant' || !changes || typeof changes !== 'object') fail('Invalid participant');
  const permitted = {};
  if (Object.prototype.hasOwnProperty.call(changes, 'group')) {
    if (typeof changes.group !== 'string' || changes.group.length > 100) fail('Invalid group');
    const settings = (await db.ref(`studies/${target.studyId}/settings`).get()).val();
    if (changes.group && !Object.prototype.hasOwnProperty.call(settings?.groupConfigs || {}, changes.group)) fail('Unknown study group');
    permitted.group = changes.group;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'startDate')) {
    if (changes.startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(changes.startDate) || Number.isNaN(Date.parse(changes.startDate)))) fail('Invalid start date');
    permitted.startDate = changes.startDate || '';
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'customConfig')) {
    if (changes.customConfig !== null && !configValid(changes.customConfig)) fail('Invalid custom gameplay settings');
    permitted.customConfig = changes.customConfig;
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'weeksOverride')) {
    if (changes.weeksOverride == null) permitted.weeksOverride = null;
    else {
      const base = (await db.ref(`studies/${target.studyId}/settings`).get()).val();
      validateSettings({ ...base, weeks: changes.weeksOverride });
      permitted.weeksOverride = changes.weeksOverride;
    }
  }
  await db.ref(`accounts/${uid}`).update(permitted); return { ok: true };
});
exports.saveLevel = onCall(options, async req => {
  const operator = await profile(req); requireAdmin(operator);
  const { id, name, data } = req.data || {};
  if (!idValid(id) || typeof name !== 'string' || !name.trim() || name.length > 100 ||
      !data || typeof data !== 'object' || !Array.isArray(data.layers) || !Array.isArray(data.bpm) ||
      JSON.stringify(data).length > 800000) fail('Invalid or oversized unified level');
  if ((await db.ref(`levelLibrary/${id}`).get()).exists()) fail('Published level IDs are immutable; use a new ID to publish a revision', 'already-exists');
  const updatedAt = new Date().toISOString();
  await db.ref().update({
    [`levelLibrary/${id}`]: { id, name, data, updatedAt },
    [`levelIndex/${id}`]: { id, name, updatedAt }
  }); return { id };
});
exports.listLevels = onCall(options, async req => {
  const operator = await profile(req); if (operator.role === 'participant') fail('Researcher permission required', 'permission-denied');
  return { levels: Object.values((await db.ref('levelIndex').get()).val() || {}) };
});
exports.getLevel = onCall(options, async req => {
  const operator = await profile(req); const { id } = req.data || {};
  if (!idValid(id)) fail('Invalid level ID');
  if (operator.role === 'participant') {
    const settings = (await db.ref(`studies/${operator.studyId}/settings`).get()).val();
    const weeks = operator.weeksOverride || settings?.weeks || {};
    if (!settings || !Object.values(weeks).some(arr => Array.isArray(arr) && arr.some(a => (isLevel(a) && a.levelId === `library:${id}`) ||
      (isSelection(a) && a.choices.some(choice => choice.levelId === `library:${id}`)))))
      fail('Level is not assigned to participant study', 'permission-denied');
  }
  const level = (await db.ref(`levelLibrary/${id}`).get()).val();
  if (!level) fail('Level not found', 'not-found');
  return { level };
});
/** Removing shared content must never silently break an existing study. */
exports.removeLevel = onCall(options, async req => {
  const account = await profile(req); requireAdmin(account);
  const { id } = req.data || {};
  if (!idValid(id)) fail('Invalid level ID');
  const level = (await db.ref(`levelLibrary/${id}`).get()).val();
  if (!level) fail('Level not found', 'not-found');
  const all = (await db.ref('studies').get()).val() || {};
  for (const study of Object.values(all)) {
    const weeks = study?.settings?.weeks || {};
    for (const steps of Object.values(weeks)) {
      if (!Array.isArray(steps)) continue;
      if (steps.some(step => (isLevel(step) && step.levelId === `library:${id}`) ||
        (isSelection(step) && step.choices?.some(choice => choice.levelId === `library:${id}`)))) {
        fail('Level is used by a study. Remove its assignments before deleting it.', 'failed-precondition');
      }
    }
  }
  // Also safeguard participant-specific study timelines.
  const accounts = (await db.ref('accounts').get()).val() || {};
  for (const member of Object.values(accounts)) {
    if (!member?.weeksOverride) continue;
    if (Object.values(member.weeksOverride).some(steps => Array.isArray(steps) && steps.some(step =>
      (isLevel(step) && step.levelId === `library:${id}`) ||
      (isSelection(step) && step.choices?.some(choice => choice.levelId === `library:${id}`)))))
      fail('Level is used by a participant-specific timeline.', 'failed-precondition');
  }
  await db.ref().update({ [`levelLibrary/${id}`]: null, [`levelIndex/${id}`]: null });
  return { ok: true };
});
exports.getParticipantBundle = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant login required', 'permission-denied');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study is not enabled', 'failed-precondition');
  if (settings.participantStartMode === 'first-login' && !account.startDate) {
    const today = new Date().toISOString().slice(0, 10);
    const started = await db.ref(`accounts/${account.uid}/startDate`).transaction(value => value || today);
    account.startDate = started.snapshot.val();
  }
  const saved = (await db.ref(`progress/${account.studyId}/${account.uid}`).get()).val() || {};
  const progress = { completed: saved.completed || {}, sessions: saved.sessions || {}, activeSession: saved.activeSession || {}, choices: saved.choices || {} };
  return { account, settings: { ...settings, weeks: effectiveWeeks(account.weeksOverride || settings.weeks) }, progress };
});
/** Advance a non-gameplay slide, with the same server-enforced weekly limits as a level result. */
exports.advanceStudyStep = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant permission required', 'permission-denied');
  const { week, sessionId, index, stepType } = req.data || {};
  if (!Number.isInteger(week) || !Number.isInteger(index) || typeof sessionId !== 'string' ||
      !['start', 'break', 'end', 'selection'].includes(stepType)) fail('Invalid study step');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study disabled', 'failed-precondition');
  const weeks = effectiveWeeks(account.weeksOverride || settings.weeks);
  const ref = db.ref(`progress/${account.studyId}/${account.uid}`);
  const transaction = await ref.transaction(value => {
    const progress = { completed: value?.completed || {}, sessions: value?.sessions || {}, activeSession: value?.activeSession || {}, choices: value?.choices || {}, pendingResults: value?.pendingResults || {} };
    const timing = studyTiming(settings, account, weeks, progress);
    if (week !== timing.week || (timing.beforeStart && week !== 0) || timing.afterEnd) return;
    const assignments = weeks[String(week)] || [];
    const count = progress.sessions[String(week)] || 0;
    if (count >= timing.cap) return;
    const sid = progress.activeSession[String(week)] || `${week}-${count + 1}`;
    const done = progress.completed[String(week)] || [];
    const ix = assignments.findIndex((_, i) => !done.includes(`${sid}:${i}`));
    const step = assignments[ix];
    if (sessionId !== sid || index !== ix || !step || step.type !== stepType) return;
    if (stepType === 'selection') {
      // Unlimited choice screens may be finished after at least one completed play.
      const counts = progress.choices[choiceKey(week, sid, ix)] || {};
      if (step.playthroughs !== 0 || !Object.values(counts).some(n => n > 0)) return;
    }
    const copy = { completed: { ...progress.completed }, sessions: { ...progress.sessions }, activeSession: { ...progress.activeSession }, choices: { ...progress.choices }, pendingResults: { ...progress.pendingResults } };
    const entries = [...done, `${sid}:${ix}`];
    copy.completed[String(week)] = entries;
    if (assignments.every((_, i) => entries.includes(`${sid}:${i}`))) {
      copy.sessions[String(week)] = count + 1;
      delete copy.activeSession[String(week)];
    } else copy.activeSession[String(week)] = sid;
    return copy;
  });
  if (!transaction.committed) fail('This step is no longer available; refresh your session', 'failed-precondition');
  const saved = transaction.snapshot.val() || {};
  return { ok: true, progress: { completed: saved.completed || {}, sessions: saved.sessions || {},
    activeSession: saved.activeSession || {}, choices: saved.choices || {} } };
});
/** Read-only authorization before playing an assigned level. Detects stale tabs,
 * changed study schedules, or a mismatched participant progress record before
 * collecting a play that the backend would later reject. */
exports.preparePlay = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant permission required', 'permission-denied');
  const { week, sessionId, index, levelId, choiceIndex, selectionPlay } = req.data || {};
  if (!Number.isInteger(week) || !Number.isInteger(index) || !idValid(sessionId) ||
      typeof levelId !== 'string' || levelId.length > 120) fail('Invalid play request');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings?.enabled) fail('Study is not enabled', 'failed-precondition');
  const weeks = effectiveWeeks(account.weeksOverride || settings.weeks);
  const saved = (await db.ref(`progress/${account.studyId}/${account.uid}`).get()).val() || {};
  const progress = { completed: saved.completed || {}, sessions: saved.sessions || {},
    activeSession: saved.activeSession || {}, choices: saved.choices || {} };
  const timing = studyTiming(settings, account, weeks, progress);
  const expectedWeek = timing.week;
  const steps = weeks[String(expectedWeek)] || [];
  const sid = progress.activeSession[String(expectedWeek)] ||
    `${expectedWeek}-${(progress.sessions[String(expectedWeek)] || 0) + 1}`;
  const done = progress.completed[String(expectedWeek)] || [];
  const expectedIndex = steps.findIndex((_, i) => !done.includes(`${sid}:${i}`));
  const step = steps[expectedIndex];
  const samePosition = !timing.beforeStart && !timing.afterEnd &&
    (progress.sessions[String(expectedWeek)] || 0) < timing.cap &&
    week === expectedWeek && sessionId === sid && index === expectedIndex;
  const matchedLevel = isLevel(step) && !isSelection(step) && step.levelId === levelId && choiceIndex === undefined;
  const counts = step && isSelection(step) ? (progress.choices[choiceKey(week, sid, index)] || {}) : {};
  const count = Object.values(counts).reduce((sum, n) => sum + Number(n), 0);
  const matchedChoice = isSelection(step) && Number.isInteger(choiceIndex) &&
    Number.isInteger(selectionPlay) && selectionPlay === count &&
    (step.playthroughs === 0 || count < step.playthroughs) &&
    unlockedChoice(step, choiceIndex, week, counts) &&
    step.choices[choiceIndex].levelId === levelId;
  if (!samePosition || (!matchedLevel && !matchedChoice)) {
    fail('Your study progress or assignment has changed. Return to the study screen to resume.', 'failed-precondition');
  }
  // Record an opaque, short-lived authorization for this exact play before gameplay
  // starts. Firebase RTDB progress can change while a level runs (other tabs,
  // researcher edits); the result must still be preserved for review.
  const playToken = randomBytes(24).toString('hex');
  await db.ref(`playAuthorizations/${account.studyId}/${account.uid}/${playToken}`).set({
    week, sessionId, index, levelId,
    ...(choiceIndex !== undefined ? { choiceIndex, selectionPlay } : {}),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  return { ok: true, progress, playToken };
});
/** Save an accepted result in the SAME Realtime Database transaction as progress.
 * Its pendingResults record acts as a durable outbox if delivery to a linked
 * study database fails, so retries cannot lose completed research data.
 */
exports.submitResult = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant permission required', 'permission-denied');
  const { data, playToken } = req.data || {};
  if (typeof playToken !== 'string' || !/^[a-f0-9]{48}$/.test(playToken))
    fail('This play has no valid server authorization. Sign in and start the level again.', 'failed-precondition');
  const authorization = (await db.ref(`playAuthorizations/${account.studyId}/${account.uid}/${playToken}`).get()).val();
  if (!authorization || !Number.isFinite(authorization.expiresAt) || authorization.expiresAt < Date.now() ||
      authorization.week !== data?.week || authorization.sessionId !== data?.sessionId ||
      authorization.index !== data?.assignmentIndex || authorization.levelId !== data?.levelId ||
      authorization.choiceIndex !== data?.choiceIndex || authorization.selectionPlay !== data?.selectionPlay)
    fail('Play authorization expired or does not match the completed level. Contact a researcher and retain a backup.', 'failed-precondition');
  if (!data || JSON.stringify(data).length > 800000 || data.schemaVersion !== 1 || data.studyId !== account.studyId ||
      data.participantId !== account.participantId || data.group !== (account.group || '') ||
      typeof data.sessionId !== 'string' || !/^-?\d+-\d+$/.test(data.sessionId) ||
      !Number.isInteger(data.week) || !Number.isInteger(data.assignmentIndex) ||
      !data.sessionId.startsWith(`${data.week}-`)) fail('Invalid study result');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study disabled', 'failed-precondition');
  const weeks = effectiveWeeks(account.weeksOverride || settings.weeks);
  const sourceSteps = weeks[String(data.week)] || [];
  const sourceStep = sourceSteps[data.assignmentIndex];
  const selection = authorization.choiceIndex !== undefined;
  if (selection) {
    if (!Number.isInteger(data.choiceIndex) || !Number.isInteger(data.selectionPlay) || data.selectionPlay < 0 ||
        data.choiceIndex < 0 || data.choiceIndex > 8 ||
        (isSelection(sourceStep) && sourceStep.choices?.[data.choiceIndex]?.levelId !== data.levelId))
      fail('Invalid selected level result');
  } // The validated play authorization is authoritative for an in-flight play.
  // A researcher may edit the timeline after a level starts: retain its result
  // for manual review rather than reject a real participant's completed play.
  const key = `${data.sessionId}_${data.assignmentIndex}_${selection ? data.selectionPlay : 0}`;
  const record = { ...data, completedAt: new Date().toISOString() };
  const stateRef = db.ref(`progress/${account.studyId}/${account.uid}`);
  const transaction = await stateRef.transaction(value => {
    const progress = {
      completed: { ...(value?.completed || {}) }, sessions: { ...(value?.sessions || {}) },
      activeSession: { ...(value?.activeSession || {}) }, choices: { ...(value?.choices || {}) },
      pendingResults: { ...(value?.pendingResults || {}) }
    };
    // Another attempt may have advanced progress and failed during delivery.
    if (progress.pendingResults[key]) return progress;
    const countsKey = choiceKey(data.week, data.sessionId, data.assignmentIndex);
    const counts = { ...(progress.choices[countsKey] || {}) };
    const count = Object.values(counts).reduce((n, x) => n + x, 0);
    const finishedStep = (progress.completed[String(data.week)] || []).includes(`${data.sessionId}:${data.assignmentIndex}`);
    // An older backend may have committed progress without recording the result.
    // Stage that already-authorized play for recovery, without advancing again.
    if ((selection && count > data.selectionPlay) || (!selection && finishedStep)) {
      progress.pendingResults[key] = record;
      return progress;
    }
    const timing = studyTiming(settings, account, weeks, progress);
    const week = timing.week;
    const steps = weeks[String(week)] || [];
    const sessionsDone = progress.sessions[String(week)] || 0;
    const sessionId = progress.activeSession[String(week)] || `${week}-${sessionsDone + 1}`;
    const done = [...(progress.completed[String(week)] || [])];
    const index = steps.findIndex((_, i) => !done.includes(`${sessionId}:${i}`));
    if ((timing.beforeStart && week !== 0) || timing.afterEnd || sessionsDone >= timing.cap ||
        week !== data.week || sessionId !== data.sessionId || index !== data.assignmentIndex || index < 0 ||
        (selection ? !isSelection(steps[index]) || steps[index].choices?.[data.choiceIndex]?.levelId !== data.levelId :
          !isLevel(steps[index]) || steps[index].levelId !== data.levelId)) {
      // The play was explicitly authorized at launch. Do not invent progress,
      // but durably save the evidence with a review marker, including if a study
      // timeline was edited during play. The researcher can reconcile later.
      progress.pendingResults[key] = { ...record, reviewRequired: true };
      return progress;
    }
    if (selection) {
      const currentChoice = steps[index];
      if (data.selectionPlay !== count || (currentChoice.playthroughs > 0 && count >= currentChoice.playthroughs) ||
          !unlockedChoice(currentChoice, data.choiceIndex, week, counts)) {
        progress.pendingResults[key] = { ...record, reviewRequired: true };
        return progress;
      }
      counts[String(data.choiceIndex)] = (counts[String(data.choiceIndex)] || 0) + 1;
      progress.choices[countsKey] = counts;
      if (sourceStep.playthroughs > 0 && count + 1 >= sourceStep.playthroughs) done.push(`${sessionId}:${index}`);
    } else done.push(`${sessionId}:${index}`);
    progress.completed[String(week)] = done;
    if (steps.every((_, i) => done.includes(`${sessionId}:${i}`))) {
      progress.sessions[String(week)] = sessionsDone + 1;
      delete progress.activeSession[String(week)];
    } else progress.activeSession[String(week)] = sessionId;
    // One atomic commit for both the progress update and the durable result.
    progress.pendingResults[key] = record;
    return progress;
  });
  if (!transaction.committed) {
    const current = (await stateRef.get()).val() || {};
    if (!current.pendingResults?.[key]) {
      const timing = studyTiming(settings, account, weeks, current);
      const sid = current.activeSession?.[String(timing.week)] || `${timing.week}-${(current.sessions?.[String(timing.week)] || 0) + 1}`;
      fail(`Study progress is out of date (server: week ${timing.week}, session ${sid}). Return to the study screen to refresh. Your completed play has not been counted; contact a researcher if this continues.`, 'failed-precondition');
    }
  }
  const latest = transaction.committed ? transaction.snapshot.val() : (await stateRef.get()).val();
  const staged = latest?.pendingResults?.[key];
  if (!staged) fail('Could not stage result safely', 'internal');
  const url = (await db.ref(`studyIndex/${account.studyId}/databaseURL`).get()).val() || null;
  const path = `results/${account.studyId}/${account.uid}/${key}`;
  let queued = false;
  try {
    // Never overwrite the original play on repeat requests.
    await destination(url).ref(path).transaction(previous => previous || staged);
    await stateRef.child(`pendingResults/${key}`).remove();
    await db.ref(`failedDeliveries/${account.studyId}/${account.uid}/${key}`).remove();
  } catch (error) {
    // The record is already committed in progress.pendingResults; do not
    // clear it or lose the participant's valid result when the remote DB fails.
    queued = true;
  }
  const state = (await stateRef.get()).val() || latest;
  return { ok: true, queued, reviewRequired: !!staged.reviewRequired, progress: {
    completed: state.completed || {}, sessions: state.sessions || {},
    activeSession: state.activeSession || {}, choices: state.choices || {}
  } };
});
exports.exportResults = onCall(options, async req => {
  const operator = await profile(req);
  const { studyId, uid } = req.data || {};
  if (!idValid(studyId) || (uid && !idValid(uid))) fail('Invalid export');
  requireResearcher(operator, studyId);
  const databaseURL = (await db.ref(`studyIndex/${studyId}/databaseURL`).get()).val();
  let snap; let destinationUnavailable = false;
  try { snap = await destination(databaseURL).ref(`results/${studyId}${uid ? `/${uid}` : ''}`).get(); }
  catch (err) { destinationUnavailable = true; snap = { val: () => ({}) }; }
  const output = [];
  const data = snap.val() || {};
  const users = uid ? { [uid]: data } : data;
  Object.values(users).forEach(records => Object.values(records || {}).forEach(result => output.push(result)));
  const queued = (await db.ref(`failedDeliveries/${studyId}${uid ? `/${uid}` : ''}`).get()).val() || {};
  const pendingUsers = uid ? { [uid]: queued } : queued;
  const known = new Set(output.map(r => `${r.participantId}:${r.sessionId}:${r.assignmentIndex}:${r.selectionPlay || 0}`));
  Object.values(pendingUsers).forEach(records => Object.values(records || {}).forEach(result => {
    const key = `${result.participantId}:${result.sessionId}:${result.assignmentIndex}:${result.selectionPlay || 0}`;
    if (!known.has(key)) { output.push({ ...result, deliveryStatus: 'recovery-queue' }); known.add(key); }
  }));
  // Include durable submissions awaiting delivery, even if the secondary database is down.
  const progressSnap = (await db.ref(`progress/${studyId}${uid ? `/${uid}` : ''}`).get()).val() || {};
  const progressUsers = uid ? { [uid]: progressSnap } : progressSnap;
  Object.values(progressUsers).forEach(state => Object.entries(state?.pendingResults || {}).forEach(([recordKey, result]) => {
    const resultUid = result.participantId;
    const dedupeKey = `${resultUid}:${result.sessionId}:${result.assignmentIndex}:${result.selectionPlay || 0}`;
    if (!known.has(dedupeKey)) { output.push({ ...result, deliveryStatus: 'awaiting-delivery' }); known.add(dedupeKey); }
  }));
  if (JSON.stringify(output).length > 8000000) fail('Results too large for a single export; export participants separately', 'resource-exhausted');
  return { results: output, partial: destinationUnavailable };
});
