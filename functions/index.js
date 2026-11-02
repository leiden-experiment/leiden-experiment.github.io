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
const usernameValid = value => { try { normalizeUsername(value); return true; } catch { return false; } };
const isLevel = step => step && (!step.type || step.type === 'level');
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
    if (assignments.length && !assignments.some(a => a && (!a.type || a.type === 'level'))) fail('Each populated week needs a playable level');
    for (const a of assignments) {
      if (!a || typeof a !== 'object') fail('Invalid study block');
      if (['start', 'break', 'end'].includes(a.type)) {
        if (typeof a.text !== 'string' || a.text.length > 2000) fail('Screen text must be under 2,000 characters');
      } else if ((!a.type || a.type === 'level') && typeof a.levelId === 'string' && /^(legacy|library|uploaded):[\w .-]{1,100}$/.test(a.levelId) &&
          Number.isInteger(a.bpmIndex) && a.bpmIndex >= 0 && a.bpmIndex <= 8 &&
          Number.isInteger(a.loops) && a.loops >= 1 && a.loops <= 100) {
        // Existing formats without an explicit type remain valid.
      } else fail('Invalid level assignment');
    }
  }
  if (s.groupConfigs && (typeof s.groupConfigs !== 'object' || Array.isArray(s.groupConfigs) ||
      Object.values(s.groupConfigs).some(g => !g || typeof g !== 'object' || Array.isArray(g)))) fail('Invalid group configurations');
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
  const { studyId, username, password, role, group = '', startDate = '' } = req.data || {};
  if (!idValid(studyId) || !usernameValid(username) || !['participant', 'moderator'].includes(role) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128) fail('Invalid participant or moderator fields');
  if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)))) fail('Invalid participant start date');
  if (typeof group !== 'string' || group.length > 100) fail('Invalid group');
  const settings = (await db.ref(`studies/${studyId}/settings`).get()).val();
  if (!settings) fail('Study not found', 'not-found');
  if (role === 'participant') {
    if (group && !Object.prototype.hasOwnProperty.call(settings.groupConfigs || {}, group)) fail('Unknown study group');
    if (settings.durationWeeks && settings.participantStartMode !== 'first-login' && !startDate) fail('Participant start date required');
  }
  const name = normalizeUsername(username);
  const user = await auth.createUser({ email: emailForUsername(name), password, displayName: name, disabled: false });
  const account = { uid: user.uid, username: name, role, studyId, participantId: role === 'participant' ? name : '', group, startDate, active: true };
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
  if (!idValid(uid) || typeof password !== 'string' || password.length < 12 || password.length > 128) fail('Use a password of 12–128 characters');
  const account = (await db.ref(`accounts/${uid}`).get()).val();
  if (!account || account.role !== 'moderator') fail('Only moderator passwords can be reset here');
  await auth.updateUser(uid, { password });
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
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail('Use a password of 12–128 characters');
    change.password = password;
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
    if (!settings || !Object.values(weeks).some(arr => Array.isArray(arr) && arr.some(a => isLevel(a) && a.levelId === `library:${id}`)))
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
  const progress = { completed: saved.completed || {}, sessions: saved.sessions || {}, activeSession: saved.activeSession || {} };
  return { account, settings: account.weeksOverride ? { ...settings, weeks: account.weeksOverride } : settings, progress };
});
/** Advance a non-gameplay slide, with the same server-enforced weekly limits as a level result. */
exports.advanceStudyStep = onCall(options, async req => {
  const account = await profile(req);
  if (account.role !== 'participant') fail('Participant permission required', 'permission-denied');
  const { week, sessionId, index, stepType } = req.data || {};
  if (!Number.isInteger(week) || !Number.isInteger(index) || typeof sessionId !== 'string' ||
      !['start', 'break', 'end'].includes(stepType)) fail('Invalid study step');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study disabled', 'failed-precondition');
  const weeks = account.weeksOverride || settings.weeks;
  const ref = db.ref(`progress/${account.studyId}/${account.uid}`);
  const transaction = await ref.transaction(value => {
    const progress = { completed: value?.completed || {}, sessions: value?.sessions || {}, activeSession: value?.activeSession || {} };
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
    const copy = { completed: { ...progress.completed }, sessions: { ...progress.sessions }, activeSession: { ...progress.activeSession } };
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
      data.participantId !== account.participantId || data.group !== (account.group || '') || !/^\-?\d+-\d+$/.test(data.sessionId) ||
      !Number.isInteger(data.week) || !Number.isInteger(data.assignmentIndex)) fail('Invalid result');
  const settings = (await db.ref(`studies/${account.studyId}/settings`).get()).val();
  if (!settings || !settings.enabled) fail('Study disabled', 'failed-precondition');
  const assignedWeeks = account.weeksOverride || settings.weeks;
  const savedProgress = (await db.ref(`progress/${account.studyId}/${account.uid}`).get()).val() || {};
  const current = { completed: savedProgress.completed || {}, sessions: savedProgress.sessions || {}, activeSession: savedProgress.activeSession || {} };
  const timing = studyTiming(settings, account, assignedWeeks, current);
  const { week } = timing;
  const assignments = assignedWeeks[String(week)] || [];
  if ((current.completed[String(data.week)] || []).includes(`${data.sessionId}:${data.assignmentIndex}`)) return { ok: true, duplicate: true };
  const count = current.sessions[String(week)] || 0;
  const maxSessions = timing.cap;
  const expectedSessionId = current.activeSession[String(week)] || `${week}-${count + 1}`;
  const expectedIndex = assignments.findIndex((a, i) => !(current.completed[String(week)] || []).includes(`${expectedSessionId}:${i}`));
  if ((timing.beforeStart && week !== 0) || timing.afterEnd || count >= maxSessions || expectedIndex < 0 || data.week !== week || data.sessionId !== expectedSessionId ||
      data.assignmentIndex !== expectedIndex || !isLevel(assignments[expectedIndex]) || data.levelId !== assignments[expectedIndex].levelId)
    fail('Result is outside the assigned study schedule', 'failed-precondition');
  const key = `${expectedSessionId}:${expectedIndex}`;
  const progress = JSON.parse(JSON.stringify(current));
  if (!progress.completed[String(week)]) progress.completed[String(week)] = [];
  progress.completed[String(week)].push(key);
  if (progress.completed[String(week)].filter(k => k.startsWith(expectedSessionId + ':')).length === assignments.length) {
    progress.sessions[String(week)] = count + 1;
    delete progress.activeSession[String(week)];
  } else progress.activeSession[String(week)] = expectedSessionId;
  const safeRecord = { ...data, completedAt: new Date().toISOString() };
  const indexPath = `progress/${account.studyId}/${account.uid}`;
  const resultPath = `results/${account.studyId}/${account.uid}/${expectedSessionId}_${expectedIndex}`;
  // Use a lock to prevent double submissions / concurrent sessions sharing one progression state.
  // The transaction runs on the progress node, preventing clients from writing it directly.
  const stateRef = db.ref(indexPath);
  const transaction = await stateRef.transaction(value => {
    const actual = { completed: value?.completed || {}, sessions: value?.sessions || {}, activeSession: value?.activeSession || {} };
    const n = actual.sessions?.[String(week)] || 0;
    const sid = actual.activeSession?.[String(week)] || `${week}-${n + 1}`;
    const done = actual.completed?.[String(week)] || [];
    const ix = assignments.findIndex((a, i) => !done.includes(`${sid}:${i}`));
    if (sid !== expectedSessionId || ix !== expectedIndex || n >= maxSessions) return;
    return progress;
  });
  if (!transaction.committed) {
    const latest = (await stateRef.get()).val() || {};
    if ((latest.completed?.[String(data.week)] || []).includes(`${data.sessionId}:${data.assignmentIndex}`))
      return { ok: true, duplicate: true };
    fail('Study progress changed in another session. Sign in again before retrying.', 'failed-precondition');
  }
  const destinationDB = destination((await db.ref(`studyIndex/${account.studyId}/databaseURL`).get()).val());
  try { await destinationDB.ref(resultPath).set(safeRecord); }
  catch (err) {
    // Reconciliation record prevents silent data loss if a linked destination is unavailable.
    await db.ref(`failedDeliveries/${account.studyId}/${account.uid}/${expectedSessionId}_${expectedIndex}`).set(safeRecord);
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
