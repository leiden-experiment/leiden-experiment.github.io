import HandScene from './handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { levels } from './loadingScene';
import { LevelConverter } from '../util/levelConverter';
import { restoredPublishedTrack, studyTrackKey, studyTrackKeyForBpm } from '../study/participantPreload';
import { retimeProgrammaticLevel } from '../util/retimeProgrammaticLevel';
import { UploadedLevelManager } from '../managers/uploadedLevelManager';
import { defaultConfig, updateConfig } from '../managers/storageManager';
import { getStudyPlan, getStudyProgress, getStudySession, setPendingAssignment, syncStudyProgress, updateParticipantPreferences, publishedLevels, advanceScreenStep, hasJustFinishedSession, wasLastStudyResultQueued } from '../study/runtime';
import { studyApi } from '../study/firebaseClient';
import { downloadResults } from '../study/offline';
import { TrackData } from '../level/trackTypes';
import { isLevelStep, isSelectionStep, isChoiceUnlocked, selectionKey, Assignment, ScreenStep } from '../study/types';
import { gameplayOptions } from '../study/gameplayFields';
import { displayDate } from '../study/dateFormat';

export default class StudySessionScene extends HandScene {
  private status: Phaser.GameObjects.Text;
  private advancing = false;
  constructor() { super('studySession'); }
  preload() { levels.forEach(level => level.preload(this)); }
  create() {
    super.create();
    this.advancing = false; // Phaser reuses this Scene instance across slides.
    const session = getStudySession();
    if (!session) { this.scene.start('mainMenu'); return; }
    const plan = getStudyPlan();
    const step = plan && plan.index >= 0 ? plan.assignments[plan.index] : null;
    const isSelectionScreen = !!step && isSelectionStep(step);
    this.add.text(this.center.x, isSelectionScreen ? 125 : 180, session.settings.title, { font: '65px Courier New', color: '#ffffff', align: 'center' }).setOrigin(.5);
    const daysUntil = plan?.daysUntilNextWeek || 0;
    const posttestAvailable = !!session.settings.weeks?.['-1']?.length;
    const cappedText = daysUntil > 0
      ? `You have finished this week's sessions. Week ${plan!.week + 1} unlocks in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`
      : plan?.week === plan?.totalWeeks
        ? `The final week of training has ended.${posttestAvailable ? '\nAsk your researcher about the Post-test.' : ''}`
      : 'You have completed the maximum sessions for this week.';
    const message = plan?.state === 'completed'
      ? `${posttestAvailable ? '' : 'You have completed the final week of training.\n'}You have completed the entire study. Thank you for participating.` :
      plan?.state === 'awaiting-posttest' ? 'You have completed the final week of training.\nAsk your researcher about the Post-test.' :
      plan?.state === 'awaiting-login' ? (getStudyProgress().scheduleOverride && !getStudyProgress().scheduleOverride?.startDate ? 'Your researcher has assigned a new weekly schedule. Sign out and sign in again to begin your assigned week.' : 'Pre-test complete. Sign out and sign in again when you are ready to start your weekly programme.') :
      plan?.beforeStart && plan.week !== 0 ?
        `Your training programme has not started yet. Please return on ${displayDate(session.settings.scheduleMode === 'fixed' ? session.settings.startDate : session.account.startDate) || 'your assigned start date'}.` :
      plan?.capped ? cappedText :
      hasJustFinishedSession() ? (wasLastStudyResultQueued() ? 'Thank you for playing. Your result is stored safely for researcher review.' : 'Thank you for playing today! Your progress has been recorded.') :
      !plan?.assignments.length ? 'There are no activities scheduled for this week.' :
      step ? (!isLevelStep(step) ? step.text : `Ready to play: ${this.displayLevelName(step.levelId)}`) :
      'Session complete! Thank you for playing.';
    this.add.text(this.center.x, isSelectionScreen ? 285 : 430, message, { font: '31px Courier New', color: '#ffffff', align: 'center', wordWrap: { width: 1500 } }).setOrigin(.5);
    // Week totals count finished sessions, not individual levels. The End slide
    // updates after its completion is acknowledged by the server.
    const showWeekCount = session.settings.showWeeklySessionProgress !== false &&
      session.settings.weeklyEnabled !== false && session.settings.scheduleMode !== 'single' &&
      plan && plan.week > 0 && plan.week <= plan.totalWeeks &&
      (step?.type === 'start' || step?.type === 'end') &&
      step.showWeeklySessionProgress !== false;
    const weekCountText = showWeekCount ? this.add.text(this.center.x, 535, '', {
      font: '30px Courier New', color: '#aaf4b0', align: 'center'
    }).setOrigin(.5) : null;
    const updateWeekCount = () => {
      if (!weekCountText || !plan) return;
      const count = Math.min(session.settings.maxSessionsPerWeek,
        getStudyProgress().sessions[String(plan.week)] || 0);
      weekCountText.setText(`${count}/${session.settings.maxSessionsPerWeek} weekly sessions completed`);
    };
    updateWeekCount();
    this.status = this.add.text(this.center.x, isSelectionScreen ? 365 : 620, '', { font: '25px Courier New', color: '#ffd676', align: 'center', wordWrap: { width: 1500 } }).setOrigin(.5);
    if (step?.type === 'end' && plan && !plan.capped && !hasJustFinishedSession()) {
      // The End slide must have NO interactive controls, including camera/settings.
      // Its completion is recorded automatically without a Continue button.
      this.status.setText('Saving session completion…');
      void advanceScreenStep(step).then(() => {
        updateWeekCount();
        this.status.setText('Session completed. You may close this page.');
      }).catch(() => {
        this.status.setText('Unable to confirm completion. Please refresh this page to retry saving.');
      });
      return;
    }
    if (plan && !plan.capped && !hasJustFinishedSession() && step) {
      if (isLevelStep(step)) {
        const play = new Button(this, 'PLAY\nLEVEL', this.center.x, 810, () => { void this.playLevel(); });
        this.centerStudyButtonLabel(play, 92);
        this.addStudyUtilityButtons(this.center.x - 520, this.center.x + 520, 810, .63);
      } else if (isSelectionStep(step)) {
        const counts = (getStudyProgress().choices || {})[selectionKey(plan.week, plan.sessionId, plan.index)] || {};
        const plays = Object.values(counts).reduce((total, n) => total + n, 0);
        const selectable = step.choices.map((choice, i) => ({ choice, i })).filter(({ i }) => isChoiceUnlocked(step, i, plan.week, counts));
        const remaining = step.playthroughs === 0 ? null : Math.max(0, step.playthroughs - plays);
        this.add.text(this.center.x, 425,
          remaining === null ? 'Unlimited plays · Choose Finish Session when done' :
            `${remaining} play${remaining === 1 ? '' : 's'} remaining`,
          { font: '34px Courier New', color: '#aaf4b0', align: 'center' }).setOrigin(.5);
        // 1–3 levels fit one row; 4–6 use two rows; 7–9 use three rows.
        // Keep all labels within their buttons without overlapping the Finish action.
        const columns = Math.min(3, selectable.length);
        const rows = Math.ceil(selectable.length / columns);
        const scale = selectable.length === 1 ? 1.08 : rows === 1 ? .96 : rows === 2 ? .79 : .73;
        const rowSpacing = rows === 1 ? 0 : rows === 2 ? 200 : 170;
        // With nine choices, keep a full button height for two name lines and
        // a play-count line. The top area is reserved for status messages.
        const firstY = rows === 1 ? 685 : rows === 2 ? 605 : 535;
        selectable.forEach(({ choice, i }, pos) => {
          const col = pos % columns;
          const row = Math.floor(pos / columns);
          const name = this.displayLevelName(choice.levelId);
          const fontSize = selectable.length === 1 ? 64 : rows === 1 ? 59 : rows === 2 ? 51 : 46;
          // Courier is wide; cap each name line based on the actual button width
          // so the play-count line never gets pushed outside a nine-choice button.
          const charsPerLine = Math.max(5, Math.floor(400 * scale * .9 / (fontSize * .62)));
          const label = this.choiceButtonLabel(name, counts[String(i)] || 0, charsPerLine);
          const x = this.center.x + (col - (columns - 1) / 2) * (columns === 2 ? 510 : 470);
          const button = new Button(this, label, x, firstY + row * rowSpacing,
            () => { void this.playLevel(choice, i, plays); });
          // Give the three-line label enough actual height, especially when
          // nine choices fill the screen. The sprite and its text scale separately.
          button.setScale(scale, rows === 3 ? .83 : rows === 2 ? .89 : selectable.length === 1 ? 1.16 : 1.09);
          // Fit each custom label to the actual button bounds; even a 3×3 grid
          // uses as much text space as is available without clipping.
          this.centerStudyButtonLabel(button, Math.max(fontSize, 100), 3);
        });
        if (step.playthroughs === 0 && plays > 0) {
          let busy = false;
          const finish = new Button(this, 'FINISH\nSESSION', this.center.x, 1018, () => {
            if (busy) return; busy = true;
            void advanceScreenStep(step).then(() => this.scene.restart()).catch(error => {
              busy = false; this.status.setText(error instanceof Error ? error.message : String(error));
            });
          });
          finish.setScale(.43);
          this.centerStudyButtonLabel(finish, 35);
        }
        const canFinish = step.playthroughs === 0 && plays > 0;
        this.addStudyUtilityButtons(this.center.x - (canFinish ? 540 : 325),
          this.center.x + (canFinish ? 540 : 325), 1018, .43);
      } else {
        // Every non-gameplay slide has an explicit server-confirmed transition.
        // Restart only after the returned progress includes this exact step.
        const goNext = async () => {
          if (this.advancing) return;
          this.advancing = true;
          this.status.setText('');
          try {
            await advanceScreenStep(step);
            this.scene.start('studySession');
          } catch (error) {
            this.status.setText(error instanceof Error ? error.message : String(error));
            this.advancing = false;
          }
        };
        const continueButton = new Button(this, 'CONTINUE', this.center.x, 810, () => { void goNext(); });
        this.centerStudyButtonLabel(continueButton, 90);
        this.addStudyUtilityButtons(this.center.x - 520, this.center.x + 520, 810, .63);
      }
    }
    if (session.mode === 'offline' && step?.type !== 'end') {
      const exportButton = new Button(this, 'EXPORT\nRESULTS', 200, 940, () => { void downloadResults(session.account.studyId!, session.account.participantId!); });
      this.centerStudyButtonLabel(exportButton, 76);
    }
  }
  /** Permissions are defined once per study, including older Settings slides. */
  private participantSettingsPermissions(): string[] {
    const session = getStudySession(); if (!session) return [];
    const legacy = Object.values(session.settings.weeks || {}).flat()
      .filter(step => step.type === 'settings') as ScreenStep[];
    const enabled = session.settings.participantSettingsEnabled === true ||
      (session.settings.participantSettingsEnabled === undefined && legacy.length > 0);
    const permitted = session.settings.participantSettingsAllowed ||
      [...new Set(legacy.flatMap(step => step.allowedSettings || []))];
    return enabled ? permitted.filter(key => gameplayOptions.some(option => option.key === key)) : [];
  }

  /** Screen buttons are intentionally mouse-only in a study. */
  private addStudyUtilityButtons(cameraX: number, settingsX: number, y: number, scale: number) {
    const camera = new Button(this, 'SETUP\nCAMERA', cameraX, y, () => this.scene.start('calibration'));
    camera.setScale(scale);
    this.centerStudyButtonLabel(camera, scale <= .45 ? 34 : 46);
    if (this.participantSettingsPermissions().length) {
      const settings = new Button(this, 'SETTINGS', settingsX, y, () => this.openPersonalSettings());
      settings.setScale(scale);
      this.centerStudyButtonLabel(settings, scale <= .45 ? 34 : 46);
    }
  }

  /** The original Phaser Options scene now provides the study settings editor.
   * Leaving this scene also blocks all background mouse and hand interaction. */
  private openPersonalSettings() {
    if (!this.participantSettingsPermissions().length) return;
    this.scene.start('options');
  }

  /** Button labels are separate Phaser text objects (sprite scaling does not scale
   * them). Explicitly position and size them at the center of the visible button. */
  private centerStudyButtonLabel(button: Button, _maximumFontSize: number, maxLines = 2) {
    // Text sizing is centralized in Button: sprite scaling and label scaling
    // must stay in sync, including the smaller utility buttons.
    button.fitTextToButton(maxLines);
  }

  private displayLevelName(levelId: string): string {
    const [kind, ...parts] = levelId.split(':');
    const id = parts.join(':');
    if (kind === 'legacy') {
      return levels.find(level => level.trackKey === id)?.track.data.displayName || id;
    }
    if (kind === 'library') {
      // Published JSON is stored as unknown until its shape is checked. A
      // missing/malformed level should show its identifier, not crash or fail
      // the strict TypeScript build.
      const published = publishedLevels[id];
      return published && typeof published === 'object' && 'displayName' in published &&
        typeof published.displayName === 'string' && published.displayName.trim()
        ? published.displayName : id;
    }
    if (kind === 'uploaded') {
      const track = UploadedLevelManager.loadLevelData(id) as TrackData | null;
      return track?.displayName || id;
    }
    return id;
  }

  /** Preserve the entire name; Button.fitTextToButton scales all three lines
   * to the actual sprite size rather than clipping or inserting an ellipsis. */
  private choiceButtonLabel(name: string, played: number, suggestedChars = 18): string {
    const fullName = name.trim() || 'Unnamed level';
    const words = fullName.split(/\s+/);
    let lines: string[];
    if (words.length === 1 && fullName.length > suggestedChars) {
      const split = Math.ceil(fullName.length / 2);
      lines = [fullName.slice(0, split), fullName.slice(split)];
    } else if (words.length < 2) lines = [fullName];
    else {
      // Choose the break with the smallest longest line, rather than discarding
      // words. Long names simply use a smaller rendered font to fit the button.
      let best = 1;
      let shortestLongest = Infinity;
      for (let i = 1; i < words.length; i++) {
        const first = words.slice(0, i).join(' ');
        const second = words.slice(i).join(' ');
        const longest = Math.max(first.length, second.length);
        if (longest < shortestLongest) { best = i; shortestLongest = longest; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    return `${lines.join('\n')}\n${played} played`;
  }

  private async playLevel(selected?: Assignment, choiceIndex?: number, selectionPlay?: number) {
    const session = getStudySession(); const plan = getStudyPlan();
    if (!session || !plan || plan.capped || plan.index < 0) return;
    const step = plan.assignments[plan.index];
    if (!isLevelStep(step) && !isSelectionStep(step)) return;
    const assignment = selected || (isLevelStep(step) ? step : null);
    if (!assignment) return;
    this.status.setText('Preparing assigned level...');
    try {
      let level: Level;
      let playToken: string | undefined;
      const [kind, id] = [assignment.levelId.slice(0, assignment.levelId.indexOf(':')), assignment.levelId.slice(assignment.levelId.indexOf(':') + 1)];
      if (kind === 'legacy') {
        const candidate = levels.find(item => item.trackKey === id);
        if (!candidate) throw new Error(`Legacy level ${id} is not installed`);
        level = candidate;
      } else {
        let data: unknown;
        if (kind === 'uploaded') {
          if (session.mode === 'online') throw new Error('Uploaded: levels are local to this device. Publish them to the central library for online studies.');
          data = UploadedLevelManager.loadLevelData(id);
        } else if (kind === 'library') {
          data = publishedLevels[id];
        } else throw new Error('Unsupported level identifier');
        if (!data) throw new Error(`Level ${id} was not preloaded. Sign out, check your connection, then sign in again.`);
        const track = data as TrackData;
        if (!Array.isArray(track.bpm) || !Array.isArray(track.layers)) throw new Error('Invalid published level');
        const customBpm = assignment.bpm;
        const key = kind === 'library' ? (customBpm ? studyTrackKeyForBpm(id, customBpm) : studyTrackKey(id))
          : LevelConverter.generateTempLevelKey();
        if (!this.cache.json.exists(key)) {
          const restored = restoredPublishedTrack(track);
          if (customBpm) retimeProgrammaticLevel(restored, customBpm);
          this.cache.json.add(key, restored);
        }
        level = new Level(this, key);
      }
      const bpmIndex = assignment.bpm === undefined ? assignment.bpmIndex : 0;
      if (!level.track.data?.bpm?.[bpmIndex]) throw new Error('Assigned BPM index does not exist in this level');
      updateConfig({ ...defaultConfig, mousePinchesEnabled: false, ...session.settings.defaultConfig, ...(session.settings.groupConfigs?.[session.account.group || ''] || {}), ...(session.account.customConfig || {}), ...(session.account.participantPreferences || {}), ...assignment.configOverride,
        skipLayersAutomatically: true, skipLayersAutomaticallyAfterLoop: assignment.loops,
        autoSaveCSV: false }); // Research results are sent once, between levels; never during gameplay.
      level.setBPM(bpmIndex);
      // Validate the authoritative server position before expensive gameplay begins;
      // preventing stale client progression from losing a completed research play.
      if (session.mode === 'online') {
        const allowed = await studyApi.preparePlay(plan.week, plan.sessionId, plan.index,
          assignment.levelId, choiceIndex, selectionPlay);
        syncStudyProgress(allowed.progress);
        playToken = allowed.playToken;
      }
      setPendingAssignment(plan.week, plan.sessionId, plan.index, plan.assignments.length, assignment, choiceIndex, selectionPlay, playToken, this.displayLevelName(assignment.levelId));
      this.scene.start('level', level);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // An older browser tab can have obsolete progress after a study edit or
      // another sign-in. Refresh before the player spends time on a rejected play.
      if (session.mode === 'online' && (/progress or assignment has changed|failed-precondition/i).test(message)) {
        try {
          const latest = await studyApi.fetchParticipant();
          syncStudyProgress(latest.progress);
          this.scene.restart();
          return;
        } catch (refreshError) {
          this.status.setText(`Study session is out of date. Sign out and sign back in.\n${String(refreshError)}`);
          return;
        }
      }
      this.status.setText(message);
    }
  }
}
