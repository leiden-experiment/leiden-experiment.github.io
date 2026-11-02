import { StudySession, Progress, Assignment, ResultEnvelope, emptyProgress, getNextAssignment, markAssignmentComplete, ScreenStep, isLevelStep } from './types';
import { loadLocalProgress, saveLocalResult, saveLocalProgress } from './offline';
import { studyApi } from './firebaseClient';

let session: StudySession | null = null;
let progress: Progress = emptyProgress();
let pendingSave: Promise<void> | null = null;
let justFinishedSession = false;
export function hasJustFinishedSession() { return justFinishedSession; }
let pending: { week: number; sessionId: string; index: number; total: number; assignment: Assignment } | null = null;
export let publishedLevels: Record<string, unknown> = {};
export function setStudySession(value: StudySession, remoteProgress?: Progress, levels: Record<string, unknown> = {}) {
  session = value; pending = null; pendingSave = null; justFinishedSession = false;
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
export function setPendingAssignment(week: number, sessionId: string, index: number, total: number, assignment: Assignment) {
  pending = { week, sessionId, index, total, assignment };
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
  };
  const updated = markAssignmentComplete(progress, active.week, active.sessionId, active.index, active.total);
  const promise = (async () => {
    if (activeSession.mode === 'offline') await saveLocalResult(data, updated);
    else await studyApi.saveResult(data, updated);
    if ((updated.sessions[String(active.week)] || 0) > (progress.sessions[String(active.week)] || 0)) justFinishedSession = true;
    progress = updated;
    if (pending === active) pending = null;
  })();
  pendingSave = promise;
  void promise.finally(() => { if (pendingSave === promise) pendingSave = null; }).catch(() => {});
  return promise;
}

/** Start/break/end blocks are acknowledged without generating fabricated gameplay results. */
export async function advanceScreenStep(step: ScreenStep) {
  const plan = getStudyPlan();
  if (!session || !plan || plan.index < 0 || plan.capped) throw new Error('No screen is currently available');
  const current = plan.assignments[plan.index];
  if (!current || isLevelStep(current) || current.type !== step.type) throw new Error('Study step changed. Reload your session.');
  const updated = markAssignmentComplete(progress, plan.week, plan.sessionId, plan.index, plan.assignments.length);
  if (session.mode === 'offline') saveLocalProgress(session.account.studyId!, session.account.participantId!, updated);
  else await studyApi.advanceStep(plan.week, plan.sessionId, plan.index, step.type);
  if ((updated.sessions[String(plan.week)] || 0) > (progress.sessions[String(plan.week)] || 0)) justFinishedSession = true;
  progress = updated;
}
