/* All privileged operations are callable Cloud Functions; the client receives no service account credentials. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
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
      !s.weeks || typeof s.weeks !== 'object' || Array.isArray(s.weeks)) fail('Invalid study settings');
  for (const [week, assignments] of Object.entries(s.weeks)) {
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
  return { settings: s.val(), databaseURL: account.role === 'admin' ? i.val()?.databaseURL : undefined };
});
exports.saveStudy = onCall(options, async req => {
  const account = await profile(req); requireAdmin(account);
  const { id, settings, databaseURL } = req.data || {};
  if (!idValid(id)) fail('Study ID must be 1–64 letters, digits, underscores or hyphens');
  validateSettings(settings);
  const url = checkedDbUrl(databaseURL);
  if (url) {
    // A service account must have permissions on the linked project. This test fails closed.
    try { await destination(url).ref(`studies/${id}/_linkTest`).set({ checkedAt: Date.now() }); }
    catch { fail('Cannot write to linked database; grant the Functions service account access', 'failed-precondition'); }
  }
  await db.ref().update({ [`studies/${id}/settings`]: settings,
    [`studyIndex/${id}`]: { title: settings.title, enabled: !!settings.enabled, databaseURL: url || '' } });
  return { id };
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
  const user = await auth.createUser({ email: emailForUsername(name), password: firebasePassword(password), displayName: name, disabled: false });
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
  return { account, settings: account.weeksOverride ? { ...settings, weeks: account.weeksOverride } : settings, progress };
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
  const weeks = account.weeksOverride || settings.weeks;
  const ref = db.ref(`progress/${account.studyId}/${account.uid}`);
  const transaction = await ref.transaction(value => {
    const progress = { completed: value?.completed || {}, sessions: value?.sessions || {}, activeSession: value?.activeSession || {}, choices: value?.choices || {} };
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
    const copy = { completed: { ...progress.completed }, sessions: { ...progress.sessions }, activeSession: { ...progress.activeSession }, choices: { ...progress.choices } };
    const entries = [...done, `${sid}:${ix}`];
    copy.completed[String(week)] = entries;
    if (assignments.every((_, i) => entries.includes(`${sid}:${i}`))) {
      copy.sessions[String(week)] = count + 1;
      delete copy.activeSession[String(week)];
    } else copy.activeSession[String(week)] = sid;
    return copy;
  });
  if (!transaction.committed) fail('This step is no longer available; refresh your session', 'failed-precondition');
  return { ok: true };
});
exports.submitResult = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant permission required', 'permission-denied');
  const { data } = req.data || {};
  if (!data || JSON.stringify(data).length > 800000 || data.schemaVersion !== 1 || data.studyId !== account.studyId ||
      data.participantId !== account.participantId || data.group !== (account.group || '') || !/^-?\d+-\d+$/.test(data.sessionId) ||
      !Number.isInteger(data.week) || !Number.isInteger(data.assignmentIndex)) fail('Invalid result');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study disabled', 'failed-precondition');
  const weeks = account.weeksOverride || settings.weeks;
  const stateRef = db.ref(`progress/${account.studyId}/${account.uid}`);
  const transaction = await stateRef.transaction(value => {
    const progress = { completed: { ...(value?.completed || {}) }, sessions: { ...(value?.sessions || {}) },
      activeSession: { ...(value?.activeSession || {}) }, choices: { ...(value?.choices || {}) } };
    const timing = studyTiming(settings, account, weeks, progress);
    const week = timing.week;
    const steps = weeks[String(week)] || [];
    const sessionsDone = progress.sessions[String(week)] || 0;
    const sessionId = progress.activeSession[String(week)] || `${week}-${sessionsDone + 1}`;
    const done = [...(progress.completed[String(week)] || [])];
    const index = steps.findIndex((_, i) => !done.includes(`${sessionId}:${i}`));
    if (timing.beforeStart && week !== 0 || timing.afterEnd || sessionsDone >= timing.cap ||
        week !== data.week || sessionId !== data.sessionId || index !== data.assignmentIndex || index < 0) return;
    const step = steps[index];
    const selection = isSelection(step);
    const key = choiceKey(week, sessionId, index);
    const counts = { ...(progress.choices[key] || {}) };
    const count = Object.values(counts).reduce((n, x) => n + x, 0);
    const choice = data.choiceIndex;
    if (selection) {
      if (!Number.isInteger(choice) || !Number.isInteger(data.selectionPlay) || data.selectionPlay !== count ||
          (step.playthroughs > 0 && count >= step.playthroughs) ||
          !unlockedChoice(step, choice, week, counts) || data.levelId !== step.choices[choice].levelId) return;
      counts[String(choice)] = (counts[String(choice)] || 0) + 1;
      progress.choices[key] = counts;
      if (step.playthroughs > 0 && count + 1 >= step.playthroughs) done.push(`${sessionId}:${index}`);
    } else if (!isLevel(step) || data.choiceIndex !== undefined || data.levelId !== step.levelId) return;
    else done.push(`${sessionId}:${index}`);
    progress.completed[String(week)] = done;
    if (steps.every((_, i) => done.includes(`${sessionId}:${i}`))) {
      progress.sessions[String(week)] = sessionsDone + 1;
      delete progress.activeSession[String(week)];
    } else progress.activeSession[String(week)] = sessionId;
    return progress;
  });
  const key = `${data.sessionId}_${data.assignmentIndex}_${Number.isInteger(data.selectionPlay) ? data.selectionPlay : 0}`;
  if (!transaction.committed) {
    const latest = (await stateRef.get()).val() || {};
    const played = latest.choices?.[choiceKey(data.week, data.sessionId, data.assignmentIndex)] || {};
    const total = Object.values(played).reduce((n, x) => n + x, 0);
    // Retries for an already committed play are idempotent, even if progression has moved on.
    if ((latest.completed?.[String(data.week)] || []).includes(`${data.sessionId}:${data.assignmentIndex}`) ||
        (Number.isInteger(data.selectionPlay) && total > data.selectionPlay)) return { ok: true, duplicate: true };
    fail('Study progress changed in another session. Sign in again before retrying.', 'failed-precondition');
  }
  const record = { ...data, completedAt: new Date().toISOString() };
  const url = (await db.ref(`studyIndex/${account.studyId}/databaseURL`).get()).val();
  const path = `results/${account.studyId}/${account.uid}/${key}`;
  try { await destination(url).ref(path).set(record); }
  catch (error) {
    await db.ref(`failedDeliveries/${account.studyId}/${account.uid}/${key}`).set(record);
    return { ok: true, queued: true };
  }
  return { ok: true };
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
  const known = new Set(output.map(r => `${r.participantId}:${r.sessionId}:${r.assignmentIndex}`));
  Object.values(pendingUsers).forEach(records => Object.values(records || {}).forEach(result => {
    const key = `${result.participantId}:${result.sessionId}:${result.assignmentIndex}`;
    if (!known.has(key)) { output.push({ ...result, deliveryStatus: 'recovery-queue' }); known.add(key); }
  }));
  if (JSON.stringify(output).length > 8000000) fail('Results too large for a single export; export participants separately', 'resource-exhausted');
  return { results: output, partial: destinationUnavailable };
});
