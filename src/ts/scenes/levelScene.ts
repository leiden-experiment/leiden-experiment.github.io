import HandScene from '../scenes/handScene';
import Level from '../level/level';
import { escapeKey, initialScene, levelCompletionScene } from '../core/config';
import { setIncrementIndex } from './continueScene';

export default class LevelScene extends HandScene {
  private level: Level;

  constructor() {
    super('level');
  }

  preload() {
    this.level = this.scene.settings.data as Level;
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
        setIncrementIndex(true);
        this.scene.start(levelCompletionScene, this.level);
      },
      () => {
        // Aborted level callback.
        this.scene.start(initialScene);
      },
    );
  }

  update(time: number, delta: number) {
    super.update(time, delta);

    this.level.update(time);
  }
}
