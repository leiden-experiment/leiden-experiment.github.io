import { StudySession, Progress, Assignment, ResultEnvelope, emptyProgress, getNextAssignment, markAssignmentComplete, ScreenStep, isLevelStep, LevelChoiceStep, isSelectionStep, selectionKey, restoreProgressAtLevelCheckpoint } from './types';
import { loadLocalProgress, saveLocalResult, saveLocalProgress } from './offline';
import { studyApi } from './firebaseClient';

let session: StudySession | null = null;
let progress: Progress = emptyProgress();
let pendingSave: Promise<void> | null = null;
let justFinishedSession = false;
let lastSaveQueued = false;
let lastSaveNeedsReview = false;
export function wasLastStudyResultMarkedForReview() { return lastSaveNeedsReview; }
export function wasLastStudyResultQueued() { return lastSaveQueued; }
export function hasJustFinishedSession() { return justFinishedSession; }
let pending: { week: number; sessionId: string; index: number; total: number; assignment: Assignment; choiceIndex?: number; selectionPlay?: number; playToken?: string; levelName?: string } | null = null;
export let publishedLevels: Record<string, unknown> = {};
export function setStudySession(value: StudySession, remoteProgress?: Progress, levels: Record<string, unknown> = {}) {
  session = value; pending = null; pendingSave = null; justFinishedSession = false; lastSaveQueued = false; lastSaveNeedsReview = false;
  const account = value.account;
  progress = value.mode === 'offline'
    ? restoreProgressAtLevelCheckpoint(loadLocalProgress(account.studyId!, account.participantId!), account.weeksOverride || value.settings.weeks)
    : (remoteProgress || emptyProgress());
  publishedLevels = levels;
}
export function getStudySession() { return session; }
export function updateParticipantPreferences(preferences: Record<string, unknown>) {
  if (session) session.account.participantPreferences = { ...preferences };
}
export function getStudyProgress() { return progress; }
export function syncStudyProgress(remote: Progress) { progress = remote; }
export function getStudyPlan(now = new Date()) {
  if (!session) return null;
  return getNextAssignment(session.settings, progress, session.account.startDate || session.settings.startDate, now);
}
export function setPendingAssignment(week: number, sessionId: string, index: number, total: number, assignment: Assignment, choiceIndex?: number, selectionPlay?: number, playToken?: string, levelName?: string) {
  pending = { week, sessionId, index, total, assignment, choiceIndex, selectionPlay, playToken, levelName };
}
export function clearPendingAssignment() { pending = null; }
export function getPendingAssignment() { return pending; }
/** Portable fallback if a backend refuses completion due to a stale session.
 * Preserve the actual unmodified result instead of telling researchers it was saved. */
export function pendingResultBackup(result: unknown): ResultEnvelope | null {
  if (!session || !pending) return null;
  return {
    schemaVersion: 1, studyId: session.account.studyId!, participantId: session.account.participantId!,
    group: session.account.group || '', week: pending.week, sessionId: pending.sessionId,
    assignmentIndex: pending.index, levelId: pending.assignment.levelId,
    levelName: pending.levelName || pending.assignment.levelId.split(':').slice(1).join(':'),
    completedAt: new Date().toISOString(), result,
    ...(pending.choiceIndex !== undefined ? { choiceIndex: pending.choiceIndex, selectionPlay: pending.selectionPlay } : {}),
  };
}
export function recordLevelCompletion(result: unknown): Promise<void> {
  if (pendingSave) return pendingSave;
  if (!session || !pending) return Promise.resolve();
  const activeSession = session;
  const active = pending;
  const data: ResultEnvelope = {
    schemaVersion: 1, studyId: activeSession.account.studyId!, participantId: activeSession.account.participantId!,
    group: activeSession.account.group || '', sessionId: active.sessionId, week: active.week,
    assignmentIndex: active.index, levelId: active.assignment.levelId,
    levelName: active.levelName || active.assignment.levelId.split(':').slice(1).join(':'),
    completedAt: new Date().toISOString(), result,
    ...(active.choiceIndex !== undefined ? { choiceIndex: active.choiceIndex, selectionPlay: active.selectionPlay } : {}),
  };
  const step = (activeSession.account.weeksOverride || activeSession.settings.weeks)[String(active.week)]?.[active.index];
  let updated: Progress;
  if (step && isSelectionStep(step) && active.choiceIndex !== undefined) {
    const key = selectionKey(active.week, active.sessionId, active.index);
    const played = { ...(progress.choices?.[key] || {}) };
    played[String(active.choiceIndex)] = (played[String(active.choiceIndex)] || 0) + 1;
    updated = { ...progress, choices: { ...(progress.choices || {}), [key]: played } };
    if (step.playthroughs > 0 && Object.values(played).reduce((n, count) => n + count, 0) >= step.playthroughs)
      updated = markAssignmentComplete(updated, active.week, active.sessionId, active.index, active.total);
  } else updated = markAssignmentComplete(progress, active.week, active.sessionId, active.index, active.total);
  const promise = (async () => {
    let authoritative: Progress | undefined;
    if (activeSession.mode === 'offline') { await saveLocalResult(data, updated); lastSaveQueued = false; }
    else {
      if (!active.playToken) throw new Error('Missing play authorization; download a backup and contact a researcher.');
      const response = await studyApi.saveResult(data, active.playToken);
      authoritative = response.progress;
      lastSaveQueued = !!response.queued;
      lastSaveNeedsReview = !!response.reviewRequired;
    }
    const confirmed = authoritative || updated;
    if ((confirmed.sessions[String(active.week)] || 0) > (progress.sessions[String(active.week)] || 0)) justFinishedSession = true;
    progress = confirmed;
    if (pending === active) pending = null;
  })();
  pendingSave = promise;
  void promise.finally(() => { if (pendingSave === promise) pendingSave = null; }).catch(() => {});
  return promise;
}

/** Start/break/end blocks are acknowledged without generating fabricated gameplay results. */
export async function advanceScreenStep(step: ScreenStep | LevelChoiceStep) {
  const plan = getStudyPlan();
  if (!session || !plan || plan.index < 0 || plan.capped) throw new Error('No screen is currently available');
  const current = plan.assignments[plan.index];
  if (!current || isLevelStep(current) || current.type !== step.type) throw new Error('Study step changed. Reload your session.');
  if (isSelectionStep(step)) {
    const played = progress.choices?.[selectionKey(plan.week, plan.sessionId, plan.index)] || {};
    if (step.playthroughs !== 0 || !Object.values(played).some(count => count > 0))
      throw new Error('Play at least one level before finishing free play.');
  }
  const updated = markAssignmentComplete(progress, plan.week, plan.sessionId, plan.index, plan.assignments.length);
  if (session.mode === 'offline') saveLocalProgress(session.account.studyId!, session.account.participantId!, updated);
  else {
    let response = await studyApi.advanceStep(plan.week, plan.sessionId, plan.index, step.type);
    // A stale Firebase transaction may return unchanged progress. Refresh, then
    // retry once if this is still the active screen; never fail silently.
    if (!response.progress?.completed?.[String(plan.week)]?.includes(`${plan.sessionId}:${plan.index}`)) {
      const bundle = await studyApi.fetchParticipant();
      const beforeRefresh = progress;
      progress = bundle.progress;
      if (progress.completed?.[String(plan.week)]?.includes(`${plan.sessionId}:${plan.index}`)) {
        if ((progress.sessions[String(plan.week)] || 0) > (beforeRefresh.sessions[String(plan.week)] || 0)) justFinishedSession = true;
        return; // Already accepted by Firebase; show the next slide.
      }
      if (getStudyPlan()?.index === plan.index) response = await studyApi.advanceStep(plan.week, plan.sessionId, plan.index, step.type);
    }
    if (response.progress) {
      if (!response.progress.completed?.[String(plan.week)]?.includes(`${plan.sessionId}:${plan.index}`))
        throw new Error('The screen did not advance. Please try Continue again.');
      if ((response.progress.sessions[String(plan.week)] || 0) > (progress.sessions[String(plan.week)] || 0)) justFinishedSession = true;
      progress = response.progress;
      return;
    }
  }
  if ((updated.sessions[String(plan.week)] || 0) > (progress.sessions[String(plan.week)] || 0)) justFinishedSession = true;
  progress = updated;
}
