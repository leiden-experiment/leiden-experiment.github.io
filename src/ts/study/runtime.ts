import { StudySession, Progress, Assignment, ResultEnvelope, emptyProgress, getNextAssignment, markAssignmentComplete, ScreenStep, isLevelStep, LevelChoiceStep, isSelectionStep, selectionKey } from './types';
import { loadLocalProgress, saveLocalResult, saveLocalProgress } from './offline';
import { studyApi } from './firebaseClient';

let session: StudySession | null = null;
let progress: Progress = emptyProgress();
let pendingSave: Promise<void> | null = null;
let justFinishedSession = false;
let lastSaveQueued = false;
export function wasLastStudyResultQueued() { return lastSaveQueued; }
export function hasJustFinishedSession() { return justFinishedSession; }
let pending: { week: number; sessionId: string; index: number; total: number; assignment: Assignment; choiceIndex?: number; selectionPlay?: number } | null = null;
export let publishedLevels: Record<string, unknown> = {};
export function setStudySession(value: StudySession, remoteProgress?: Progress, levels: Record<string, unknown> = {}) {
  session = value; pending = null; pendingSave = null; justFinishedSession = false; lastSaveQueued = false;
  const account = value.account;
  progress = value.mode === 'offline' ? loadLocalProgress(account.studyId!, account.participantId!) : (remoteProgress || emptyProgress());
  publishedLevels = levels;
}
export function getStudySession() { return session; }
export function getStudyProgress() { return progress; }
export function getStudyPlan(now = new Date()) {
  if (!session) return null;
  return getNextAssignment(session.settings, progress, session.account.startDate || session.settings.startDate, now);
}
export function setPendingAssignment(week: number, sessionId: string, index: number, total: number, assignment: Assignment, choiceIndex?: number, selectionPlay?: number) {
  pending = { week, sessionId, index, total, assignment, choiceIndex, selectionPlay };
}
export function clearPendingAssignment() { pending = null; }
export function getPendingAssignment() { return pending; }
export function recordLevelCompletion(result: unknown): Promise<void> {
  if (pendingSave) return pendingSave;
  if (!session || !pending) return Promise.resolve();
  const activeSession = session;
  const active = pending;
  const data: ResultEnvelope = {
    schemaVersion: 1, studyId: activeSession.account.studyId!, participantId: activeSession.account.participantId!,
    group: activeSession.account.group || '', sessionId: active.sessionId, week: active.week,
    assignmentIndex: active.index, levelId: active.assignment.levelId,
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
      const response = await studyApi.saveResult(data, updated);
      authoritative = response.progress;
      lastSaveQueued = !!response.queued;
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
    const response = await studyApi.advanceStep(plan.week, plan.sessionId, plan.index, step.type);
    if (response.progress) {
      if ((response.progress.sessions[String(plan.week)] || 0) > (progress.sessions[String(plan.week)] || 0)) justFinishedSession = true;
      progress = response.progress;
      return;
    }
  }
  if ((updated.sessions[String(plan.week)] || 0) > (progress.sessions[String(plan.week)] || 0)) justFinishedSession = true;
  progress = updated;
}
