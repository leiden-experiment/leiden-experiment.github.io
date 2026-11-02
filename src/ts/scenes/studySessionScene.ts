import HandScene from './handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { levels } from './loadingScene';
import { LevelConverter } from '../util/levelConverter';
import { UploadedLevelManager } from '../managers/uploadedLevelManager';
import { defaultConfig, updateConfig } from '../managers/storageManager';
import { getStudyPlan, getStudyProgress, getStudySession, setPendingAssignment, syncStudyProgress, publishedLevels, advanceScreenStep, hasJustFinishedSession, wasLastStudyResultQueued } from '../study/runtime';
import { studyApi } from '../study/firebaseClient';
import { downloadResults } from '../study/offline';
import { TrackData, PlayableTrackLayerData } from '../level/trackTypes';
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
      step ? `${!isLevelStep(step) ? step.text : `${session.settings.introText}\nReady to play: ${step.levelId}`}\nWEEK ${plan.week} · SESSION ${plan.sessionId.split('-')[1]} · SLIDE ${plan.index + 1}/${plan.assignments.length}` :
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
        // Display responsive, clickable options without changing the research progression until play completes.
        selectable.forEach(({ choice, i }, pos) => {
          const label = choice.levelId.replace(/^(legacy|library|uploaded):/, '').slice(0, 18);
          const col = pos % 3;
          const row = Math.floor(pos / 3);
          new Button(this, `${label}\n${(counts[String(i)] || 0)} played`, this.center.x - 480 + col * 480, 720 + row * 120,
            () => { void this.playLevel(choice, i, plays); });
        });
        if (step.playthroughs === 0 && plays > 0) {
          let busy = false;
          new Button(this, 'FINISH\nSESSION', this.center.x, 1010, () => {
            if (busy) return; busy = true;
            void advanceScreenStep(step).then(() => this.scene.restart()).catch(error => {
              busy = false; this.status.setText(error instanceof Error ? error.message : String(error));
            });
          });
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
          if (!data && session.mode === 'online') data = (await studyApi.getLevel(id)).level.data;
        } else throw new Error('Unsupported level identifier');
        if (!data) throw new Error(`Level ${id} not found. Check the study library/offline pack.`);
        const track = data as TrackData;
        if (!Array.isArray(track.bpm) || !Array.isArray(track.layers)) throw new Error('Invalid published level');
        const key = LevelConverter.generateTempLevelKey();
        // Firebase RTDB strips empty arrays; restore generated-only loop keys.
        const restored = JSON.parse(JSON.stringify(track)) as TrackData;
        restored.layers.forEach(layer => {
          if (!layer.soundLoopKeys && layer.playable) layer.soundLoopKeys = [];
          if (layer.playable) {
            const playableLayer = layer as PlayableTrackLayerData;
            if (!playableLayer.backgroundLayers) playableLayer.backgroundLayers = [];
          }
        });
        this.cache.json.add(key, restored);
        level = new Level(this, key);
      }
      if (!level.track.data?.bpm?.[assignment.bpmIndex]) throw new Error('Assigned BPM index does not exist in this level');
      updateConfig({ ...defaultConfig, ...session.settings.defaultConfig, ...(session.settings.groupConfigs?.[session.account.group || ''] || {}), ...(session.account.customConfig || {}), ...assignment.configOverride,
        skipLayersAutomatically: true, skipLayersAutomaticallyAfterLoop: assignment.loops,
        autoSaveCSV: false }); // Research results are sent once, between levels; never during gameplay.
      level.setBPM(assignment.bpmIndex);
      // Validate the authoritative server position before expensive gameplay begins;
      // preventing stale client progression from losing a completed research play.
      if (session.mode === 'online') {
        const allowed = await studyApi.preparePlay(plan.week, plan.sessionId, plan.index,
          assignment.levelId, choiceIndex, selectionPlay);
        syncStudyProgress(allowed.progress);
      }
      setPendingAssignment(plan.week, plan.sessionId, plan.index, plan.assignments.length, assignment, choiceIndex, selectionPlay);
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
