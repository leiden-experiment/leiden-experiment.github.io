import { isStudyTrackKey } from '../study/participantPreload';
import HandScene from '../scenes/handScene';
import Level from '../level/level';
import { escapeKey, initialScene, levelCompletionScene } from '../core/config';
import { getStudySession, clearPendingAssignment } from '../study/runtime';

export default class LevelScene extends HandScene {
  private level: Level;

  constructor() {
    super('level');
  }

  preload() {
    this.level = this.scene.settings.data as Level;
    if (!this.level || typeof this.level.preload !== 'function') {
      this.scene.start(getStudySession() ? 'studySession' : 'mainMenu');
      return;
    }
    if (this.level.trackKey.startsWith('temp_level_')) {
      this.level.preload(this);
      if (this.level.bpmIndex < 0) this.level.setBPM(0);
    }
  }

  create() {
    super.create();
    this.level.init(this);

    if (this.level.hasCustomBackground()) {
      this.setBackgroundTexture(this.level.getBackgroundTextureKey());
    } else {
      this.setBackgroundTexture('levelBackground');
    }

    this.input.keyboard!.on(escapeKey, () => {
      this.level.abort();
    });

    this.level.start(
      () => {
        // Finished level callback.
        this.scene.start(levelCompletionScene, this.level);
      },
      () => {
        // Aborted level callback.
        if (this.level.trackKey.startsWith('temp_level_') && !isStudyTrackKey(this.level.trackKey)) {
          this.level.unload();
          this.cache.json.remove(this.level.trackKey);
        }
        clearPendingAssignment();
        this.scene.start(getStudySession() ? 'studySession' : initialScene);
      },
    );
  }

  update(time: number, delta: number) {
    super.update(time, delta);

    this.level.update(time);
  }
}
