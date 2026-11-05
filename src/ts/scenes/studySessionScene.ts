import HandScene from './handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { levels } from './loadingScene';
import { LevelConverter } from '../util/levelConverter';
import { restoredPublishedTrack, studyTrackKey, studyTrackKeyForBpm } from '../study/participantPreload';
import { retimeProgrammaticLevel } from '../util/retimeProgrammaticLevel';
import { UploadedLevelManager } from '../managers/uploadedLevelManager';
import { defaultConfig, updateConfig } from '../managers/storageManager';
import { getStudyPlan, getStudyProgress, getStudySession, setPendingAssignment, syncStudyProgress, publishedLevels, advanceScreenStep, hasJustFinishedSession, wasLastStudyResultQueued } from '../study/runtime';
import { studyApi } from '../study/firebaseClient';
import { downloadResults } from '../study/offline';
import { TrackData } from '../level/trackTypes';
import { isLevelStep, isSelectionStep, isChoiceUnlocked, selectionKey, Assignment } from '../study/types';

export default class StudySessionScene extends HandScene {
  private status: Phaser.GameObjects.Text;
  constructor() { super('studySession'); }
  preload() { levels.forEach(level => level.preload(this)); }
  create() {
    super.create();
    const session = getStudySession();
    if (!session) { this.scene.start('mainMenu'); return; }
    const plan = getStudyPlan();
    this.add.text(this.center.x, 180, session.settings.title, { font: '65px Courier New', color: '#ffffff', align: 'center' }).setOrigin(.5);
    const step = plan && plan.index >= 0 ? plan.assignments[plan.index] : null;
    const startDate = session.account.startDate || session.settings.startDate;
    const nextMonday = session.settings.weeklyEnabled !== false && plan && plan.week > 0 ? new Date(Date.parse(`${startDate}T00:00:00Z`) + plan.week * 7 * 86400000) : null;
    const daysUntil = nextMonday ? Math.max(0, Math.ceil((nextMonday.getTime() - Date.now()) / 86400000)) : 0;
    const cappedText = plan?.week && plan.week > 0 && daysUntil > 0
      ? `You have finished this week's sessions. Come back in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`
      : 'You have completed the maximum sessions for this week.';
    const message = plan?.afterEnd ? 'This study has ended. Thank you for participating.' :
      hasJustFinishedSession() ? (wasLastStudyResultQueued() ? 'Thank you for playing. Your result is safely stored in the administrator database and is awaiting transfer to the study database.' : 'Thank you for playing today! Your progress has been recorded. Please come back for your next session.') :
      plan?.beforeStart && plan.week !== 0 ? 'Your training programme has not started yet.' :
      plan?.capped ? cappedText :
      !plan?.assignments.length ? 'There are no activities scheduled for this week.' :
      step ? (!isLevelStep(step) ? step.text : `${session.settings.introText}\nReady to play: ${this.displayLevelName(step.levelId)}`) :
      'Session complete! Thank you for playing.';
    this.add.text(this.center.x, 430, message, { font: '31px Courier New', color: '#ffffff', align: 'center', wordWrap: { width: 1500 } }).setOrigin(.5);
    this.status = this.add.text(this.center.x, 620, '', { font: '25px Courier New', color: '#ffd676', align: 'center', wordWrap: { width: 1500 } }).setOrigin(.5);
    if (plan && !plan.capped && !hasJustFinishedSession() && step) {
      if (isLevelStep(step)) {
        new Button(this, 'PLAY\nLEVEL', this.center.x + 300, 810, () => { void this.playLevel(); });
        new Button(this, 'SETUP\nCAMERA', this.center.x - 300, 810, () => this.scene.start('calibration'));
      } else if (isSelectionStep(step)) {
        const counts = (getStudyProgress().choices || {})[selectionKey(plan.week, plan.sessionId, plan.index)] || {};
        const plays = Object.values(counts).reduce((total, n) => total + n, 0);
        const selectable = step.choices.map((choice, i) => ({ choice, i })).filter(({ i }) => isChoiceUnlocked(step, i, plan.week, counts));
        // 1–3 levels fit one row; 4–6 use two rows; 7–9 use three rows.
        // Keep all labels within their buttons without overlapping the Finish action.
        const columns = Math.min(3, selectable.length);
        const rows = Math.ceil(selectable.length / columns);
        const scale = rows === 1 ? .83 : rows === 2 ? .64 : .52;
        const rowSpacing = rows === 1 ? 0 : rows === 2 ? 155 : 115;
        const firstY = rows === 1 ? 795 : rows === 2 ? 735 : 695;
        selectable.forEach(({ choice, i }, pos) => {
          const col = pos % columns;
          const row = Math.floor(pos / columns);
          const name = this.displayLevelName(choice.levelId);
          const label = this.choiceButtonLabel(name, counts[String(i)] || 0);
          const x = this.center.x + (col - (columns - 1) / 2) * (columns === 2 ? 510 : 470);
          const button = new Button(this, label, x, firstY + row * rowSpacing,
            () => { void this.playLevel(choice, i, plays); });
          button.setScale(scale);
          // Phaser's button label is a separate object, so scale it independently.
          button.text?.setFontSize(rows === 1 ? 35 : rows === 2 ? 29 : 24);
          button.text?.setWordWrapWidth(button.displayWidth * .88, true);
          button.text?.setMaxLines(3);
        });
        if (step.playthroughs === 0 && plays > 0) {
          let busy = false;
          const finish = new Button(this, 'FINISH\nSESSION', this.center.x, 1024, () => {
            if (busy) return; busy = true;
            void advanceScreenStep(step).then(() => this.scene.restart()).catch(error => {
              busy = false; this.status.setText(error instanceof Error ? error.message : String(error));
            });
          });
          finish.setScale(.43);
          finish.text?.setFontSize(25);
        }
      } else {
        const buttonText = step.type === 'end' ? 'FINISH\nSESSION' : step.type === 'break' ? 'RESUME\nPLAYING' : 'CONTINUE';
        let busy = false;
        new Button(this, buttonText, step.type === 'start' ? this.center.x + 300 : this.center.x, 810, () => {
          if (busy) return; busy = true;
          void advanceScreenStep(step).then(() => this.scene.restart()).catch(reason => {
            busy = false; this.status.setText(reason instanceof Error ? reason.message : String(reason));
          });
        });
        if (step.type === 'start') {
          new Button(this, 'SETUP\nCAMERA', this.center.x - 300, 810, () => this.scene.start('calibration'));
        }
      }
    }
    if (session.mode === 'offline') new Button(this, 'EXPORT\nRESULTS', 200, 940, () => { void downloadResults(session.account.studyId!, session.account.participantId!); });
  }
  private displayLevelName(levelId: string): string {
    const [kind, ...parts] = levelId.split(':');
    const id = parts.join(':');
    if (kind === 'legacy') {
      return levels.find(level => level.trackKey === id)?.track.data.displayName || id;
    }
    if (kind === 'library') {
      return publishedLevels[id]?.displayName || id;
    }
    if (kind === 'uploaded') {
      const track = UploadedLevelManager.loadLevelData(id) as TrackData | null;
      return track?.displayName || id;
    }
    return id;
  }

  /** A maximum of two lines for the name, plus one play-count line. */
  private choiceButtonLabel(name: string, played: number): string {
    const words = name.trim().split(/\s+/);
    const lines: string[] = [];
    for (const word of words) {
      if (lines.length >= 2) break;
      const last = lines.length - 1;
      if (last >= 0 && (lines[last] + ' ' + word).length <= 19) lines[last] += ' ' + word;
      else if (word.length > 19) lines.push(word.slice(0, 18) + '…');
      else lines.push(word);
    }
    const visible = lines.join(' ').replace(/…/g, '');
    if (name.trim().length > visible.length && lines.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/…$/, '').slice(0, 18) + '…';
    }
    return `${lines.join('\n') || 'Unnamed level'}\n${played} played`;
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
      updateConfig({ ...defaultConfig, ...session.settings.defaultConfig, ...(session.settings.groupConfigs?.[session.account.group || ''] || {}), ...(session.account.customConfig || {}), ...assignment.configOverride,
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
      setPendingAssignment(plan.week, plan.sessionId, plan.index, plan.assignments.length, assignment, choiceIndex, selectionPlay, playToken);
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
