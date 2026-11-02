import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import { config, saveToCSV, autoSaveToCSV } from '../managers/storageManager';
import { LevelStats } from '../core/interfaces';
import Level from '../level/level';
import { Sprite, Vector2 } from '../core/phaserTypes';
import { escapeKey, scoreboardBackgroundAudioFeintness } from '../core/config';

import { ToggleButton } from '../ui/toggleButton';
import { PlayableTrackLayerData } from '../level/trackTypes';
import { getStudySession, recordLevelCompletion, wasLastStudyResultQueued, wasLastStudyResultMarkedForReview, pendingResultBackup } from '../study/runtime';
import { downloadFile } from '../study/offline';

const capitalize = s => (s && s[0].toUpperCase() + s.slice(1)) || '';

export default class Scoreboard extends HandScene {
  private back: Button;
  private save: Button;
  private mute: ToggleButton;
  private level: Level;
  private levelStats: LevelStats;
  private studySaved: boolean = false;

  constructor() {
    super('scoreboard');
  }
  private exit() {
    if (getStudySession() && !this.studySaved) {
      alert('Study results have not been saved yet. Check your connection and retry.');
      return;
    }
    this.level.removeBackgroundAudio();
    if (this.level.trackKey.startsWith('temp_level_')) {
      this.level.unload();
      this.cache.json.remove(this.level.trackKey);
    }
    this.scene.start(getStudySession() ? 'studySession' : 'mainMenu');
  }

  /** Research: show a simple transition, never the guest scoreboard or CSV controls. */
  private createStudyCompletionScreen() {
    this.add.text(this.center.x, 340, 'Level complete', {
      font: '60px Courier New', color: '#ffffff', align: 'center'
    }).setOrigin(.5);
    const status = this.add.text(this.center.x, 480, 'Saving your progress…', {
      font: '28px Courier New', color: '#ffffff', align: 'center', wordWrap: { width: 1400 }
    }).setOrigin(.5);
    let saving = false;
    let retry: Button | null = null;
    let backup: Button | null = null;
    const save = async () => {
      if (saving || this.studySaved) return;
      saving = true;
      if (retry) { retry.setVisible(false); retry.text?.setVisible(false); }
      if (backup) { backup.setVisible(false); backup.text?.setVisible(false); }
      status.setText('Saving your progress…');
      try {
        await recordLevelCompletion(JSON.parse(JSON.stringify(this.levelStats)));
        this.studySaved = true;
        status.setText(wasLastStudyResultMarkedForReview() ? 'Play saved for researcher review. Study progress was not advanced.' :
          wasLastStudyResultQueued() ? 'Result secured in the admin database; transfer pending.' : 'Progress saved.');
        // A valid play can be archived for review without advancing the study
        // timeline. Do not immediately prompt the participant to replay it.
        if (wasLastStudyResultMarkedForReview()) {
          new Button(this, 'RETURN TO\nSTUDY', this.center.x, 790, () => this.exit());
        } else this.exit();
      } catch (reason) {
        status.setText('Result not confirmed by the server. Retry, or download a backup and contact a researcher.\n' +
          (reason instanceof Error ? reason.message : String(reason)));
        if (!retry) retry = new Button(this, 'RETRY SAVE', this.center.x - 300, 760, () => { void save(); });
        retry.setVisible(true); retry.text?.setVisible(true);
        if (!backup) backup = new Button(this, 'DOWNLOAD\nBACKUP', this.center.x + 300, 760, () => {
          const data = pendingResultBackup(JSON.parse(JSON.stringify(this.levelStats)));
          if (data) downloadFile(`pizzicato-unsent-${data.participantId}-${data.sessionId}-${Date.now()}.json`, JSON.stringify(data, null, 2));
        });
        backup.setVisible(true); backup.text?.setVisible(true);
        console.error('Study result submission failed', reason);
      } finally { saving = false; }
    };
    void save();
  }

  preload() {
    this.level = this.scene.settings.data as Level;
    this.levelStats = this.level.score.levelStats;
    if (!getStudySession() && config.autoSaveCSV) {
      autoSaveToCSV(this.level.score.levelStats);
    }
  }

  create() {
    super.create();
    this.studySaved = !getStudySession();
    if (getStudySession()) {
      this.createStudyCompletionScreen();
      return;
    }

    this.back = new Button(
      this,
      'BACK',
      this.center.x,
      this.height - 100,
      () => {
        this.exit();
      },
    );

    const muteOffset: Vector2 = new Vector2(150 / 2);
    this.mute = new ToggleButton(
      this,
      '',
      this.width - muteOffset.x,
      this.height - muteOffset.y,
      () => {
        this.mute.toggle();
      },
      'mute',
      'unmute',
      true,
    );

    this.level.addBackgroundAudio(this, {
      loop: true,
      volume: config.backgroundMusicVolume * scoreboardBackgroundAudioFeintness,
    });
    this.level.playBackgroundAudio();

    this.mute.addToggleCallback((state: boolean) => {
      this.level.setBackgroundAudioMute(!state);
    });

    this.input.keyboard!.on(escapeKey, () => {
      this.exit();
    });

    const isElectronRenderer = typeof window.electron !== 'undefined';
    const isLocalBuild = isElectronRenderer;

    if (!config.autoSaveCSV || !isLocalBuild) {
      this.save = new Button(this, 'SAVE CSV', 200, this.height - 100, () => {
        saveToCSV(this.levelStats);
        // Optionally hide the save CSV button after file is saved.
        //setInteraction(this.saveButton, false)
      });
    }

    //--------------------------------------------------------

    const scoreboardBackgroundOpacity: number = 0.6;

    const _background0l: Sprite = this.add
      .sprite(0, 0, 'scoreboardBackground1')
      .setScale(1.35, 1.25)
      .setAlpha(scoreboardBackgroundOpacity)
      .setPosition(this.center.x, this.height * 0.25);

    //--------------------------------------------------------

    // Title
    const title = this.add.text(this.center.x, 0, 'Scoreboard', {
      color: '#01c303',
      font: `${96}px Courier New`,
    });
    title.setStroke('#000', 6);
    title.setPosition(this.center.x - title.width / 2, this.height * 0.07);

    const totalNotes = this.levelStats.layersStats.reduce(
      (sum, x) => sum + x.total,
      0,
    );
    const hitNotes = this.levelStats.layersStats.reduce(
      (sum, x) => sum + x.correct,
      0,
    );
    const missedNotes = this.levelStats.layersStats.reduce(
      (sum, x) => sum + x.miss,
      0,
    );
    const earlyNotes = this.levelStats.layersStats.reduce(
      (sum, x) => sum + x.early,
      0,
    );
    const lateNotes = this.levelStats.layersStats.reduce(
      (sum, x) => sum + x.late,
      0,
    );

    const infoText = this.add.text(
      this.center.x,
      0,
      `Total Correct: ${hitNotes.toString()}/${totalNotes.toString()}\nLongest Streak: ${
        this.levelStats.maxStreak
      }\nMissed: ${missedNotes}\nEarly: ${earlyNotes}\nLate: ${lateNotes}`,
      {
        color: '#ffffff',
        align: 'center',
        font: `${48}px Courier New`,
      },
    );
    infoText.setPosition(
      this.center.x - infoText.width / 2,
      this.height * 0.19,
    );

    //------------------------------------------
    const playableLayerCount = this.level.playableLayers.length;
    if (playableLayerCount > 3) {
      // Compact rows for imported projects with 4+ tracks. The original
      // three-column layout below is preserved for all legacy levels.
      this.level.track.forEachLayer(undefined, (layer: PlayableTrackLayerData, i: number) => {
        const columns = 3;
        const rows = Math.ceil(playableLayerCount / columns);
        const column = i % columns;
        const row = Math.floor(i / columns);
        const x = this.width * (column + 0.5) / columns;
        const rowHeight = (this.height * 0.46) / rows;
        const y = this.height * 0.51 + row * rowHeight;
        const stats = this.levelStats.layersStats[i];
        this.add.text(x, y, capitalize(layer.id), {
          color: '#01c303', font: '32px Courier New', align: 'center',
        }).setOrigin(0.5, 0);
        this.add.text(x, y + 45, `Correct: ${stats ? stats.correct : 0}/${stats ? stats.total : 0}\nLoops: ${stats ? stats.loop : 0}`, {
          color: '#ffffff', font: '25px Courier New', align: 'center',
        }).setOrigin(0.5, 0);
      });
      return;
    }
    const layerBackgroundOffsets = [0.2 + 0.05, 0.5, 0.8 - 0.05];
    const layerTextOffsets = layerBackgroundOffsets;
    this.level.track.forEachLayer(
      undefined,
      (layer: PlayableTrackLayerData, i: number) => {
        this.add
          .sprite(0, 0, 'scoreboardBackground2')
          .setScale(1.35, 1.15)
          .setAlpha(scoreboardBackgroundOpacity)
          .setPosition(
            this.width * layerBackgroundOffsets[i],
            this.height * 0.63,
          );

        const layerTitle = this.add.text(0, 0, `${capitalize(layer.id)}`, {
          color: '#01c303',
          align: 'center',
          font: `${72}px Courier New`,
          fontStyle: 'bold',
        });

        layerTitle.setStroke('#000', 4);

        layerTitle.setPosition(
          this.width * layerTextOffsets[i] - layerTitle.width / 2,
          this.height * 0.53,
        );
        const stats = this.levelStats.layersStats[i];
        let correct = 0;
        let total = 0;
        let loops = 0;
        if (stats) {
          correct = stats.correct;
          total = stats.total;
          loops = stats.loop;
        }

        const layerText = this.add.text(
          0,
          0,
          `\nCorrect: ${correct.toString()}/${total.toString()}\nLoops: ${loops.toString()}`,
          {
            color: '#ffffff',
            align: 'center',
            font: `${48}px Courier New`,
          },
        );
        layerText.setPosition(
          this.width * layerTextOffsets[i] - layerText.width / 2,
          this.height * 0.575 + 0.01,
        );
      },
    );
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
