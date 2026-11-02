/** Study records contain pseudonyms, not participant names or passwords. */
export interface Assignment {
  type?: 'level'; // omitted in existing/Leiden study templates
  levelId: string;
  bpmIndex: number;
  loops: number;
  configOverride?: Record<string, unknown>;
}
export interface ScreenStep {
  type: 'start' | 'break' | 'end';
  text: string;
}
export interface LevelChoiceStep {
  type: 'selection';
  text: string;
  choices: Assignment[];
  unlock: 'all' | 'sequential' | 'weekly';
  /** 0 = unlimited until the participant selects Finish; otherwise complete after N plays. */
  playthroughs: number;
}
export type StudyStep = Assignment | ScreenStep | LevelChoiceStep;
export function isSelectionStep(step: StudyStep): step is LevelChoiceStep { return step.type === 'selection'; }
export function selectionKey(week: number, sessionId: string, index: number) { return `${week}_${sessionId}_${index}`; }
export function isChoiceUnlocked(step: LevelChoiceStep, choice: number, week: number, played: Record<string, number>) {
  if (choice < 0 || choice >= step.choices.length) return false;
  if (step.unlock === 'sequential') return choice === 0 || (played[String(choice - 1)] || 0) > 0;
  if (step.unlock === 'weekly') return choice + 1 <= Math.max(1, week);
  return true;
}
export function isLevelStep(step: StudyStep): step is Assignment {
  return !step.type || step.type === 'level';
}
export interface StudySettings {
  title: string;
  description: string; // legacy field; not shown in the dashboard
  introText: string;
  startDate: string; // also acts as the week-1 anchor when date restrictions are off
  weeklyEnabled?: boolean; // absent = true for earlier saved studies
  dateRangeEnabled?: boolean; // absent = true for earlier saved studies
  endDate?: string;
  durationWeeks?: number; // Optional number of weeks allowed after each participant starts.
  participantStartMode?: 'manual' | 'first-login';
  maxSessionsPerWeek: number;
  weeks: Record<string, StudyStep[]>; // 0 = pretest, -1 = posttest, >= 1 = ordinary weeks
  defaultConfig?: Record<string, unknown>;
  groupConfigs?: Record<string, Record<string, unknown>>;
  enabled: boolean;
}
export interface StudySummary {
  id: string;
  title: string;
  enabled: boolean;
  databaseURL?: string;
}
export interface Account {
  uid: string;
  username: string;
  role: 'admin' | 'moderator' | 'participant';
  studyId?: string;
  participantId?: string;
  group?: string;
  startDate?: string;
  weeksOverride?: Record<string, StudyStep[]>;
  customConfig?: Record<string, unknown>;
  active: boolean;
}
export interface StudySession { account: Account; settings: StudySettings; mode: 'online' | 'offline' }
export interface ResultEnvelope {
  schemaVersion: 1; studyId: string; participantId: string; group: string;
  sessionId: string; week: number; assignmentIndex: number; levelId: string;
  completedAt: string; result: unknown; choiceIndex?: number; selectionPlay?: number;
}
export interface Progress {
  completed: Record<string, string[]>;
  sessions: Record<string, number>;
  activeSession: Record<string, string>;
  choices?: Record<string, Record<string, number>>;
}
export interface PublishedLevel { id: string; name: string; data?: unknown; updatedAt?: string }
export function defaultStudySettings(title = 'New study'): StudySettings {
  return {
    title, description: '', introText: 'Welcome to the study.',
    startDate: new Date().toISOString().slice(0, 10), maxSessionsPerWeek: 3, enabled: true,
    weeks: { '1': [
      { type: 'start', text: 'Welcome! When you are ready, press Continue.' },
      { type: 'level', levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 3 },
      { type: 'break', text: 'Take a short break. Press Continue when ready.' },
      { type: 'level', levelId: 'legacy:Birthday Vibes', bpmIndex: 0, loops: 3 },
      { type: 'end', text: 'Thanks for playing! Come back for your next session.' },
    ] },
  };
}
export function validateSettings(value: StudySettings): string[] {
  const issues: string[] = [];
  if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120) issues.push('Study title is required (maximum 120 characters)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value?.startDate || '') || Number.isNaN(Date.parse(value.startDate))) issues.push('Invalid week anchor/start date');
  if (value?.weeklyEnabled !== undefined && typeof value.weeklyEnabled !== 'boolean') issues.push('Invalid weekly study option');
  if (value?.dateRangeEnabled !== undefined && typeof value.dateRangeEnabled !== 'boolean') issues.push('Invalid date limit option');
  if (value?.durationWeeks !== undefined && (!Number.isInteger(value.durationWeeks) || value.durationWeeks < 1 || value.durationWeeks > 104)) issues.push('Participant duration must be 1–104 weeks');
  if (value?.participantStartMode && !['manual', 'first-login'].includes(value.participantStartMode)) issues.push('Invalid participant start mode');
  if (value?.endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(value.endDate) || Number.isNaN(Date.parse(value.endDate)))) issues.push('Invalid end date');
  if (value?.dateRangeEnabled !== false && value?.endDate && value.endDate < value.startDate) issues.push('End date must not precede start date');
  if (!Number.isInteger(value?.maxSessionsPerWeek) || value.maxSessionsPerWeek < 1 || value.maxSessionsPerWeek > 50) issues.push('Sessions per week must be between 1 and 50');
  if (!value?.weeks || typeof value.weeks !== 'object' || Array.isArray(value.weeks)) issues.push('At least one week is required');
  else Object.entries(value.weeks).forEach(([week, steps]) => {
    if (!/^(?:-1|0|[1-9]\d*)$/.test(week) || !Array.isArray(steps) || steps.length > 40) { issues.push(`Invalid week ${week}`); return; }
    steps.forEach((step, i) => {
      if (!step || typeof step !== 'object') { issues.push(`${week}/${i}: invalid block`); return; }
      if (isLevelStep(step)) {
        if (typeof step.levelId !== 'string' || !/^(legacy|library|uploaded):[\w .-]{1,100}$/.test(step.levelId)) issues.push(`${week}/${i}: invalid levelId`);
        if (!Number.isInteger(step.bpmIndex) || step.bpmIndex < 0 || step.bpmIndex > 8) issues.push(`${week}/${i}: invalid bpmIndex`);
        if (!Number.isInteger(step.loops) || step.loops < 1 || step.loops > 100) issues.push(`${week}/${i}: invalid loops`);
      } else if (isSelectionStep(step)) {
        if (typeof step.text !== 'string' || step.text.length > 2000 || !['all', 'sequential', 'weekly'].includes(step.unlock) ||
            !Number.isInteger(step.playthroughs) || step.playthroughs < 0 || step.playthroughs > 100 ||
            !Array.isArray(step.choices) || step.choices.length < 1 || step.choices.length > 9) issues.push(`${week}/${i}: invalid level selection`);
        else step.choices.forEach((choice, j) => {
          if (typeof choice.levelId !== 'string' || !/^(legacy|library|uploaded):[\w .-]{1,100}$/.test(choice.levelId) ||
              !Number.isInteger(choice.bpmIndex) || choice.bpmIndex < 0 || choice.bpmIndex > 8 ||
              !Number.isInteger(choice.loops) || choice.loops < 1 || choice.loops > 100) issues.push(`${week}/${i}/${j}: invalid selectable level`);
        });
      } else if (['start', 'break', 'end'].includes(step.type)) {
        if (typeof step.text !== 'string' || step.text.length > 2000) issues.push(`${week}/${i}: screen message must be at most 2,000 characters`);
      } else issues.push(`${week}/${i}: unknown block type`);
    });
    if (steps.length && !steps.some(step => isLevelStep(step) || isSelectionStep(step))) issues.push(`Week ${week} must contain at least one playable level`);
  });
  if (value?.groupConfigs && (typeof value.groupConfigs !== 'object' || Array.isArray(value.groupConfigs) ||
    Object.values(value.groupConfigs).some(g => !g || typeof g !== 'object' || Array.isArray(g)))) issues.push('Invalid group configurations');
  if (JSON.stringify(value).length > 200000) issues.push('Study exceeds maximum size');
  return issues;
}
export function calculateStudyWeek(startDate: string, now = new Date()): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.valueOf())) throw new Error('Invalid study start date');
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((day - start.getTime()) / 604800000) + 1);
}
export function emptyProgress(): Progress { return { completed: {}, sessions: {}, activeSession: {} }; }
export function getNextAssignment(settings: StudySettings, progress: Progress, startDate: string, now = new Date()) {
  const weekly = settings.weeklyEnabled !== false;
  const dated = settings.dateRangeEnabled !== false;
  const current = weekly ? calculateStudyWeek(startDate, now) : 1;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const beforeStart = (dated && today < Date.parse(`${settings.startDate}T00:00:00Z`)) ||
    (!!settings.durationWeeks && today < Date.parse(`${startDate}T00:00:00Z`));
  const afterEnd = (dated && !!settings.endDate && today > Date.parse(`${settings.endDate}T00:00:00Z`)) ||
    (!!settings.durationWeeks && calculateStudyWeek(startDate, now) > settings.durationWeeks);
  const lastWeek = Math.max(1, ...Object.keys(settings.weeks).map(Number).filter(n => n > 0));
  const finished = weekly && current > lastWeek && (!settings.weeks['-1'] || !!progress.sessions['-1']);
  const week = weekly && settings.weeks['0'] && !(progress.sessions['0'] || 0) ? 0 :
    weekly && current > lastWeek && settings.weeks['-1'] && !(progress.sessions['-1'] || 0) ? -1 : current;
  const assignments = settings.weeks[String(week)] || [];
  const sessionNo = (progress.sessions[String(week)] || 0) + 1;
  const sessionId = progress.activeSession[String(week)] || `${week}-${sessionNo}`;
  const done = progress.completed[String(week)] || [];
  const index = assignments.findIndex((_, i) => !done.includes(`${sessionId}:${i}`));
  return { week, assignments, sessionId, index, complete: assignments.length > 0 && index === -1,
    capped: (beforeStart && week !== 0) || afterEnd || finished || (weekly && (progress.sessions[String(week)] || 0) >= (week <= 0 ? 1 : settings.maxSessionsPerWeek)), beforeStart, afterEnd: afterEnd || finished };
}
export function markAssignmentComplete(progress: Progress, week: number, sessionId: string, index: number, total: number): Progress {
  const next: Progress = JSON.parse(JSON.stringify(progress));
  const key = String(week);
  const list = next.completed[key] || [];
  const entry = `${sessionId}:${index}`;
  if (!list.includes(entry)) list.push(entry);
  next.completed[key] = list;
  if (Array.from({ length: total }, (_, i) => `${sessionId}:${i}`).every(x => list.includes(x))) {
    if (next.activeSession[key] === sessionId || !next.activeSession[key]) {
      next.sessions[key] = (next.sessions[key] || 0) + 1;
      delete next.activeSession[key];
    }
  } else next.activeSession[key] = sessionId;
  return next;
}
