import { absPath, assert, initVariables } from '../core/common';
import { PhaserText, Scene, Sprite } from '../core/phaserTypes';
import {
  defaultConfigFilePath,
  initialScene,
  levelListPath,
  webcamDisplayOptions,
} from '../core/config';
import webcam from '../objects/webcam';
import handTracker from '../objects/handTracker';
import Level from '../level/level';
import { getStudySession, publishedLevels } from '../study/runtime';
import { studyTrackKey, restoredPublishedTrack } from '../study/participantPreload';
import { Track } from '../level/track';
import { retimeProgrammaticLevel } from '../util/retimeProgrammaticLevel';
import { assignedLibraryBpms, studyTrackKeyForBpm } from '../study/participantPreload';
import HandScene from './handScene';
import {
  defaultConfig,
  updateConfig,
  updateDefaultConfig,
} from '../managers/storageManager';

export let background: Sprite;
export const levels: Level[] = [];

export class ElectronScene extends Scene {
  constructor() {
    super('electron');
  }

  public async create() {
    await initVariables().then(() => {
      this.scene.start('loading');
    });
  }
}

export class LoadingScene extends Scene {
  // Synchronous order of Phaser function execution: constructor() -> init() -> preload() -> create() -> update()

  constructor() {
    super({
      key: 'loading',
      pack: {
        files: [
          { type: 'json', key: 'levelList', url: absPath(levelListPath) },
          {
            type: 'json',
            key: 'defaultConfig',
            url: absPath(defaultConfigFilePath),
          },
        ],
      },
    });
  }

  preload() {
    this.load.image('finger', absPath('assets/sprites/finger.png'));
    this.load.image('button', absPath('assets/ui/button.png'));
    this.load.image('targetOuter', absPath('assets/sprites/target_outer.png'));
    this.load.image('targetInner', absPath('assets/sprites/target_inner.png'));
    this.load.audio('pinch', absPath('assets/sounds/ui/menu_ding.mp3'));
    this.load.audio('designerDrumBeat', absPath('assets/sounds/beat.wav'));
    this.load.image('title', absPath('assets/ui/title.png'));
    this.load.image('background', absPath('assets/ui/background.png'));
    this.load.image(
      'levelBackground',
      absPath('assets/ui/level_background.png'),
    );
    this.load.image('levelChange', absPath('assets/ui/level_change.png'));
    this.load.image('mute', absPath('assets/ui/mute.png'));
    this.load.image('unmute', absPath('assets/ui/unmute.png'));
    this.load.image(
      'videoBackground',
      absPath('assets/ui/video_background.png'),
    );
    this.load.image(
      'optionsBackground',
      absPath('assets/ui/options_background.png'),
    );
    this.load.image(
      'calibrationBackground',
      absPath('assets/ui/calibration_background.png'),
    );
    this.load.image(
      'defaultVideoBackground',
      absPath('assets/ui/default_video_background.png'),
    );
    this.load.image(
      'songNameBackground',
      absPath('assets/ui/song_name_background.png'),
    );
    this.load.image(
      'trackInfoBackground',
      absPath('assets/ui/track_info_background.png'),
    );
    this.load.image('countdown', absPath('assets/sprites/countdown.png'));
    this.load.audio(
      'metronomeHigh',
      absPath('assets/sounds/metronome/high.mp3'),
    );
    this.load.audio('metronomeLow', absPath('assets/sounds/metronome/low.mp3'));

    this.load.image(
      'scoreboardBackground1',
      absPath('assets/ui/scoreboard_background1.png'),
    );
    this.load.image(
      'scoreboardBackground2',
      absPath('assets/ui/scoreboard_background2.png'),
    );
    this.load.image(
      'progressSegment',
      absPath('assets/ui/progress_segment.png'),
    );
    this.load.image('flare', absPath('assets/sprites/flare.png'));

    this.load.image('flare', absPath('assets/sprites/flare.png'));

    this.cache.json
      .get('levelList')
      .forEach((track: string, _index: number) => {
        levels.push(new Level(this, track));
      });
  }

  async create() {
    background = this.add
      .sprite(this.scale.width / 2, this.scale.height / 2, 'background')
      .setVisible(false);
    // TODO: Check if necessary.
    // background.displayWidth = window.innerWidth;
    // background.displayHeight =
    //   (window.innerWidth * background.height) / background.width;

    const loadingText: PhaserText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        font: '50px Courier New',
        color: '#00ff00',
      })
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1)
      .setDepth(1000);

    await webcam
      .init(
        webcamDisplayOptions,
        this.game.canvas.clientWidth,
        this.game.canvas.clientHeight,
        this.updateText.bind(this, loadingText),
      )
      .catch(err => {
        this.updateText(loadingText, err);
      });

    if (!webcam.found()) return;

    await handTracker
      .init(this.updateText.bind(this, loadingText))
      .catch(err => this.updateText(loadingText, err));

    if (!handTracker.found()) return;

    webcam.setVisibility(webcamDisplayOptions.visible);

    this.updateText(loadingText, 'LOADING CONFIG DATA...');
    assert(this.cache.json.has('defaultConfig'), 'Failed to load default config data');
    updateDefaultConfig(this.cache.json.get('defaultConfig'));
    updateConfig({ ...defaultConfig, ...(getStudySession()?.settings.defaultConfig || {}) });

    // Generate each assigned library level's audio in the initial loading screen.
    // Its stable key stays in Phaser's audio cache between plays, so there is no
    // repeated JSON download or heavy note synthesis during a study session.
    if (getStudySession()) {
      for (const [id, data] of Object.entries(publishedLevels)) {
        this.updateText(loadingText, `PREPARING STUDY LEVEL ${id}...`);
        const key = studyTrackKey(id);
        const preparedTrack = restoredPublishedTrack(data);
        if (!this.cache.json.exists(key)) this.cache.json.add(key, preparedTrack);
        const track = new Track(this, key);
        track.preload(this as unknown as HandScene);
        track.setBPM(0);
        track.generateProgrammaticLoops(track.data.layers.filter(layer => layer.playable).map(layer => layer.id));
        // Prepare any custom tempo chosen on study slides now, rather than
        // synthesizing its notes when the participant clicks Play.
        for (const tempo of assignedLibraryBpms(getStudySession()!.settings, id)) {
          if (tempo === preparedTrack.bpm[0]) continue;
          const bpmKey = studyTrackKeyForBpm(id, tempo);
          if (!this.cache.json.exists(bpmKey)) {
            const adjusted = restoredPublishedTrack(data);
            retimeProgrammaticLevel(adjusted, tempo);
            this.cache.json.add(bpmKey, adjusted);
          }
          const bpmTrack = new Track(this, bpmKey);
          bpmTrack.preload(this as unknown as HandScene);
          bpmTrack.setBPM(0);
          bpmTrack.generateProgrammaticLoops(bpmTrack.data.layers.filter(layer => layer.playable).map(layer => layer.id));
        }
        // Yield between levels so the loading screen can update, instead of
        // blocking one long frame while synthesizing every level's piano notes.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    // Launch after config is available; studySession.preload relies on it.
    const startScene = getStudySession() ? 'studySession' : initialScene;
    this.scene.launch(startScene);
    handTracker.precache(this.updateText.bind(this, loadingText));

    this.updateText(loadingText, 'LOADING GAME DATA...');

    this.scene.get(startScene).load.on('complete', () => {
      this.updateText(loadingText, 'STARTING INITIAL SCENE...');
      loadingText?.destroy();
    });
  }

  private updateText(text: PhaserText, err: string | string[]) {
    console.info('INFO: ' + err);
    let content: string | string[] = err;
    if (err instanceof DOMException) {
      if (err.name == 'NotFoundError') {
        content = 'WEBCAM NOT FOUND';
      } else if (err.name == 'PermissionError') {
        content = 'WEBCAM PERMISSION DENIED';
      } else if (err.name == 'NotADirectoryError') {
        content = err.message;
      } else {
        content = err.name + ': ' + err.message;
      }
    }
    text.setText(content);
  }
}
