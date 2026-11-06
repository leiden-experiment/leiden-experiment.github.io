const participantSettingKeys = new Set([
  'targetSize', 'fingerSize', 'showSkipButton',
  'skipLayersAutomatically', 'ignoreMultifingerPinches',
  'mousePinchesEnabled', 'uiPinchesEnabled', 'sonificationEnabled', 'synchronizationEnabled',
  'playableBackingTracksEnabled', 'unplayableBackingTracksEnabled', 'disableLayerProgression',
  'indexFingerOnly', 'pinchVolume', 'backgroundMusicVolume', 'onTimeDuration', 'lateTimeDuration',
  'enableCameraVisibility', 'cameraOpacity', 'postProcessingDisabled',
  'displayVisualMetronome', 'autoSaveCSV'
]);
const validParticipantSetting = (key: unknown) => typeof key === 'string' && participantSettingKeys.has(key);
/** Study records contain pseudonyms, not participant names or passwords. */
export interface Assignment {
  type?: 'level'; // omitted in existing/Leiden study templates
  levelId: string;
  bpmIndex: number;
  /** Optional exact tempo for imported JSON levels; omitted means the authored tempo. */
  bpm?: number;
  loops: number;
  configOverride?: Record<string, unknown>;
}
export interface ScreenStep {
  type: 'start' | 'break' | 'end' | 'settings';
  text: string;
  /** Participant may edit only these fields on this slide. */
  allowedSettings?: string[];
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
/** Restore week-number keys after Firebase RTDB decodes a numeric-keyed object as an array.
 * A single-session study with only week 1 may arrive as [null, slides].
 * Throw instead of silently replacing unexpected data and risking data loss.
 */
export function normalizeStudyWeeks(input: unknown): Record<string, StudyStep[]> {
  if (input == null) return { '1': [] };
  if (typeof input !== 'object') throw new Error('Cannot read saved study timeline');
  const restored: Record<string, StudyStep[]> = {};
  for (const [week, slides] of Object.entries(input)) {
    if (!/^(?:-1|0|[1-9]\d*)$/.test(week)) throw new Error(`Invalid saved study week ${week}`);
    if (slides == null) continue;
    if (!Array.isArray(slides)) throw new Error(`Cannot read saved slides for week ${week}`);
    restored[week] = slides as StudyStep[];
  }
  if (!restored['1']) restored['1'] = [];
  return restored;
}

export interface StudySettings {
  title: string;
  description: string; // legacy field; not shown in the dashboard
  introText: string; // Legacy compatibility only; never shown as a separate screen.
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
  collectFingerPositions?: boolean; // Opt-in for ALL normalized target/finger positions and radii; absent means none are recorded.
  /** Show participant Settings on all study screens, not as a dedicated slide. */
  participantSettingsEnabled?: boolean;
  /** Researcher-controlled list of options participants may change. */
  participantSettingsAllowed?: string[];
  enabled: boolean;
}
export interface StudySummary {
  id: string;
  title: string;
  enabled: boolean;
  revision?: number;
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
  participantPreferences?: Record<string, unknown>;
  active: boolean;
}
export interface StudySession { account: Account; settings: StudySettings; mode: 'online' | 'offline' }
export interface ResultEnvelope {
  schemaVersion: 1; studyId: string; participantId: string; group: string;
  sessionId: string; week: number; assignmentIndex: number; levelId: string;
  completedAt: string; result: unknown; levelName?: string; choiceIndex?: number; selectionPlay?: number;
}
export interface Progress {
  completed: Record<string, string[]>;
  sessions: Record<string, number>;
  activeSession: Record<string, string>;
  choices?: Record<string, Record<string, number>>;
  /** ISO timestamp when the most recent FULL study session was completed. */
  lastCompletedSessionAt?: string;
  /** One-session researcher stage override; automatically cleared on completion. */
  stageOverride?: { week: number; sessionNumber: number };
  /** A completed pre-test is followed by a fresh login before regular weeks begin. */
  pretestPendingLogin?: boolean;
}
export interface PublishedLevel { id: string; name: string; data?: unknown; updatedAt?: string; bpm?: number }
export function defaultStudySettings(title = 'New study'): StudySettings {
  return {
    title, description: '', introText: '', collectFingerPositions: false,
    participantSettingsEnabled: false, participantSettingsAllowed: [],
    startDate: new Date().toISOString().slice(0, 10), maxSessionsPerWeek: 3, enabled: true,
    weeks: { '1': [
      { type: 'start', text: 'Welcome! When you are ready, press Continue.' },
      { type: 'level', levelId: 'legacy:Cheerful Bliss', bpmIndex: 0, loops: 1 },
      { type: 'break', text: 'Take a short break. Press Continue when ready.' },
      { type: 'level', levelId: 'legacy:Birthday Vibes', bpmIndex: 0, loops: 1 },
      { type: 'end', text: 'Thanks for playing! Come back for your next session.' },
    ] },
  };
}
function timelineStageName(week: string): string {
  return week === '0' ? 'Pre-test' : week === '-1' ? 'Post-test' : `Week ${week}`;
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
  if (value?.collectFingerPositions !== undefined && typeof value.collectFingerPositions !== 'boolean') issues.push('Invalid finger position collection option');
  if (value?.participantSettingsEnabled !== undefined && typeof value.participantSettingsEnabled !== 'boolean') issues.push('Invalid participant settings option');
  if (value?.participantSettingsAllowed !== undefined && (!Array.isArray(value.participantSettingsAllowed) ||
      value.participantSettingsAllowed.length > 30 || value.participantSettingsAllowed.some(key => !validParticipantSetting(key)))) issues.push('Invalid participant setting permissions');
  if (value?.participantSettingsEnabled && !value.participantSettingsAllowed?.length) issues.push('Select at least one setting participants may change');
  if (value?.weeks != null && (typeof value.weeks !== 'object' || Array.isArray(value.weeks))) issues.push('Invalid study timeline');
  else Object.entries(value.weeks || {}).forEach(([week, steps]) => {
    if (!/^(?:-1|0|[1-9]\d*)$/.test(week) || !Array.isArray(steps) || steps.length > 40) { issues.push(`Invalid ${timelineStageName(week)}`); return; }
    steps.forEach((step, i) => {
      if (!step || typeof step !== 'object') { issues.push(`${week}/${i}: invalid block`); return; }
      if (isLevelStep(step)) {
        if (typeof step.levelId !== 'string' || !/^(legacy|library|uploaded):[\w .-]{1,100}$/.test(step.levelId)) issues.push(`${week}/${i}: invalid levelId`);
        if (!Number.isInteger(step.bpmIndex) || step.bpmIndex < 0 || step.bpmIndex > 8) issues.push(`${week}/${i}: invalid bpmIndex`);
        if (step.bpm !== undefined && (!Number.isInteger(step.bpm) || step.bpm < 60 || step.bpm > 200 || step.levelId.startsWith('legacy:'))) issues.push(`${week}/${i}: invalid custom tempo`);
        if (!Number.isInteger(step.loops) || step.loops < 1 || step.loops > 100) issues.push(`${week}/${i}: invalid loops`);
      } else if (isSelectionStep(step)) {
        if (typeof step.text !== 'string' || step.text.length > 2000 || !['all', 'sequential', 'weekly'].includes(step.unlock) ||
            !Number.isInteger(step.playthroughs) || step.playthroughs < 0 || step.playthroughs > 100 ||
            !Array.isArray(step.choices) || step.choices.length < 1 || step.choices.length > 9) issues.push(`${week}/${i}: invalid level selection`);
        else step.choices.forEach((choice, j) => {
          if (typeof choice.levelId !== 'string' || !/^(legacy|library|uploaded):[\w .-]{1,100}$/.test(choice.levelId) ||
              !Number.isInteger(choice.bpmIndex) || choice.bpmIndex < 0 || choice.bpmIndex > 8 ||
              !Number.isInteger(choice.loops) || choice.loops < 1 || choice.loops > 100 ||
              (choice.bpm !== undefined && (!Number.isInteger(choice.bpm) || choice.bpm < 60 || choice.bpm > 200 || choice.levelId.startsWith('legacy:')))) issues.push(`${week}/${i}/${j}: invalid selectable level`);
        });
      } else if (['start', 'break', 'end', 'settings'].includes(step.type)) {
        if (typeof step.text !== 'string' || step.text.length > 2000) issues.push(`${week}/${i}: screen message must be at most 2,000 characters`);
        if (step.type === 'settings' && (!Array.isArray(step.allowedSettings) || step.allowedSettings.length < 1 || step.allowedSettings.length > 30 ||
          step.allowedSettings.some(key => !validParticipantSetting(key)))) issues.push(`${week}/${i}: choose at least one valid participant setting`);
      } else issues.push(`${week}/${i}: unknown block type`);
    });
    if (steps.length && !steps.some(step => isLevelStep(step) || isSelectionStep(step))) issues.push(`${timelineStageName(week)} must contain at least one playable level`);
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
  const lastWeek = Math.max(1, ...Object.keys(settings.weeks || {}).map(Number).filter(n => n > 0));
  const finished = weekly && current > lastWeek && (!settings.weeks?.['-1'] || !!progress.sessions['-1']);
  const manual = progress.stageOverride;
  const week = manual ? manual.week : weekly && settings.weeks?.['0'] && !(progress.sessions['0'] || 0) ? 0 :
    weekly && current > lastWeek && settings.weeks?.['-1'] && !(progress.sessions['-1'] || 0) ? -1 : current;
  const assignments = settings.weeks?.[String(week)] || [];
  const sessionNo = manual ? manual.sessionNumber : (progress.sessions[String(week)] || 0) + 1;
  const sessionId = manual ? `${week}-${sessionNo}` : progress.activeSession[String(week)] || `${week}-${sessionNo}`;
  const done = progress.completed[String(week)] || [];
  const index = assignments.findIndex((_, i) => !done.includes(`${sessionId}:${i}`));
  return { week, assignments, sessionId, index, complete: assignments.length > 0 && index === -1,
    capped: !!progress.pretestPendingLogin || (!manual && ((beforeStart && week !== 0) ||
      (afterEnd && week !== -1) || finished || (weekly && (progress.sessions[String(week)] || 0) >= (week <= 0 ? 1 : settings.maxSessionsPerWeek)))),
    beforeStart: !!progress.pretestPendingLogin || (!manual && beforeStart),
    afterEnd: !!progress.pretestPendingLogin || (!manual && (afterEnd && week !== -1 || finished)) };
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
      next.lastCompletedSessionAt = new Date().toISOString();
      delete next.activeSession[key];
      if (next.stageOverride?.week === week && `${week}-${next.stageOverride.sessionNumber}` === sessionId) delete next.stageOverride;
      if (week === 0) next.pretestPendingLogin = true;
    }
  } else next.activeSession[key] = sessionId;
  return next;
}

/** Migrate older dedicated Settings slides into ordinary instruction screens.
 * The saved text is kept. Inherit their permissions only when a study-wide
 * setting has not already been explicitly configured. */
export function migrateLegacySettingsSlides(value: StudySettings): StudySettings {
  const weeks = normalizeStudyWeeks(value.weeks);
  const legacy = Object.values(weeks).flat().filter(step => step.type === 'settings') as ScreenStep[];
  if (!legacy.length) return value;
  const allowed = [...new Set(legacy.flatMap(step => step.allowedSettings || []))];
  const migrated = Object.fromEntries(Object.entries(weeks).map(([week, slides]) => [week, slides.map(step =>
    step.type === 'settings' ? { type: 'start', text: step.text } : step)])) as Record<string, StudyStep[]>;
  return { ...value, weeks: migrated,
    participantSettingsEnabled: value.participantSettingsEnabled ?? true,
    participantSettingsAllowed: value.participantSettingsAllowed ?? allowed };
}

/** Client-side counterpart of the backend's login checkpoint restoration. */
export function restoreProgressAtLevelCheckpoint(progress: Progress, weeks: Record<string, StudyStep[]>): Progress {
  const completed = { ...progress.completed };
  let changed = false;
  for (const [week, sid] of Object.entries(progress.activeSession || {})) {
    const slides = weeks[week]; const done = completed[week];
    if (!sid || !Array.isArray(slides) || !Array.isArray(done)) continue;
    const prefix = `${sid}:`;
    const doneIndices = new Set(done.filter(x => x.startsWith(prefix)).map(x => Number(x.slice(prefix.length))));
    const lastPlay = slides.reduce((last, step, index) => doneIndices.has(index) && (isLevelStep(step) || isSelectionStep(step)) ? index : last, -1);
    const kept = done.filter(entry => {
      if (!entry.startsWith(prefix)) return true;
      const index = Number(entry.slice(prefix.length));
      return !Number.isInteger(index) || index <= lastPlay || (slides[index] && (isLevelStep(slides[index]) || isSelectionStep(slides[index])));
    });
    if (kept.length !== done.length) { completed[week] = kept; changed = true; }
  }
  return changed ? { ...progress, completed } : progress;
}
