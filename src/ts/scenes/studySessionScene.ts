import HandScene from './handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { levels } from './loadingScene';
import { LevelConverter } from '../util/levelConverter';
import { UploadedLevelManager } from '../managers/uploadedLevelManager';
import { defaultConfig, updateConfig } from '../managers/storageManager';
import { getStudyPlan, getStudySession, setPendingAssignment, publishedLevels, advanceScreenStep, hasJustFinishedSession } from '../study/runtime';
import { studyApi } from '../study/firebaseClient';
import { downloadResults } from '../study/offline';
import { TrackData } from '../level/trackTypes';
import { isLevelStep } from '../study/types';

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
      hasJustFinishedSession() ? 'Thank you for playing today! Your progress has been recorded. Please come back for your next session.' :
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
      } else {
        const buttonText = step.type === 'end' ? 'FINISH\nSESSION' : step.type === 'break' ? 'RESUME\nPLAYING' : 'CONTINUE';
        let busy = false;
        new Button(this, buttonText, this.center.x, 810, () => {
          if (busy) return; busy = true; this.status.setText('Continuing…');
          void advanceScreenStep(step).then(() => this.scene.restart()).catch(reason => {
            busy = false; this.status.setText(reason instanceof Error ? reason.message : String(reason));
          });
        });
      }
    }
    if (session.mode === 'offline') new Button(this, 'EXPORT\nRESULTS', 200, 940, () => { void downloadResults(session.account.studyId!, session.account.participantId!); });
  }
  private async playLevel() {
    const session = getStudySession(); const plan = getStudyPlan();
    if (!session || !plan || plan.capped || plan.index < 0) return;
    const step = plan.assignments[plan.index];
    if (!isLevelStep(step)) return;
    const assignment = step;
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
        this.cache.json.add(key, JSON.parse(JSON.stringify(track)));
        level = new Level(this, key);
      }
      if (!level.track.data?.bpm?.[assignment.bpmIndex]) throw new Error('Assigned BPM index does not exist in this level');
      updateConfig({ ...defaultConfig, ...session.settings.defaultConfig, ...(session.settings.groupConfigs?.[session.account.group || ''] || {}), ...assignment.configOverride,
        skipLayersAutomatically: true, skipLayersAutomaticallyAfterLoop: assignment.loops,
        autoSaveCSV: false }); // Research results are sent once, between levels; never during gameplay.
      level.setBPM(assignment.bpmIndex);
      setPendingAssignment(plan.week, plan.sessionId, plan.index, plan.assignments.length, assignment);
      this.scene.start('level', level);
    } catch (error) {
      this.status.setText(error instanceof Error ? error.message : String(error));
    }
  }
}
