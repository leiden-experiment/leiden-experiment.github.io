import { loadData, updateDefaultConfig } from '../managers/storageManager';
import { absPath, initVariables } from '../core/common';
import { PhaserText, Scene, Sprite } from '../core/phaserTypes';
import {
  backgroundTextureKey,
  backgroundTexturePath,
  configFilePath,
  defaultConfigFilePath,
  electronScene,
  fingerSpriteKey,
  fingerSpritePath,
  initialScene,
  loadingScene,
  preloadTextStyle,
  webcamDisplayOptions,
} from '../core/config';
import webcam from '../objects/webcam';
import handTracker from '../objects/handTracker';
import { ConfigData } from '../core/interfaces';
import { getWeekNumber } from '../core/game';

export let background: Sprite;

export class ElectronScene extends Scene {
  constructor() {
    super(electronScene);
  }

  public async create() {
    await initVariables().then(() => {
      this.scene.start(loadingScene);
    });
  }
}

export class LoadingScene extends Scene {
  // Synchronous order of Phaser function execution: constructor() -> init() -> preload() -> create() -> update()

  constructor() {
    super(loadingScene);
  }

  preload() {
    this.load.image(fingerSpriteKey, absPath(fingerSpritePath));
    this.load.image(backgroundTextureKey, absPath(backgroundTexturePath));
  }

  async create() {
    background = this.add
      .sprite(0, 0, backgroundTextureKey)
      .setOrigin(0, 0)
      .setVisible(false);
    background.displayWidth = window.innerWidth;
    background.displayHeight =
      (window.innerWidth * background.height) / background.width;

    const loadingText: PhaserText = this.add
      .text(
        this.cameras.main.worldView.x + this.cameras.main.width / 2,
        this.cameras.main.worldView.y + this.cameras.main.height / 2,
        '',
        preloadTextStyle,
      )
      .setShadow(1, 1)
      .setDepth(1000)
      .setOrigin(0.5);

    await webcam
      .init(webcamDisplayOptions, this.updateText.bind(this, loadingText))
      .catch(err => {
        this.updateText(loadingText, err);
      });

    if (!webcam.found()) return;

    this.updateText(loadingText, 'Loading config data...');
    await loadData(configFilePath).catch(err =>
      this.updateText(loadingText, err),
    );

    await loadData(defaultConfigFilePath)
      .then((result: ConfigData) => {
        updateDefaultConfig(result);
      })
      .catch(err => this.updateText(loadingText, err));

    await handTracker
      .init(this.updateText.bind(this, loadingText))
      .catch(err => this.updateText(loadingText, err));

    if (!handTracker.found()) return;

    webcam.setVisibility(webcamDisplayOptions.visible);

    await getWeekNumber()
      .then((week: number) => {
        console.info('INFO: Week number: ' + week.toString());
      })
      .catch(err => this.updateText(loadingText, err));

    // Launching instead of starting ensures background sprite is not destroyed.
    this.scene.launch(initialScene);

    handTracker.precache(this.updateText.bind(this, loadingText));

    this.updateText(loadingText, 'Loading game...');

    this.scene.get(initialScene).load.on('complete', () => {
      loadingText.destroy();
    });
  }

  private updateText(text: PhaserText, err: string | string[]) {
    console.info('INFO: ' + err);
    let content: string | string[] = err;
    if (err instanceof DOMException) {
      if (err.name == 'NotFoundError') {
        content = 'Webcam not found';
      } else if (err.name == 'PermissionError') {
        content = 'Permission denied';
      } else if (err.name == 'NotADirectoryError') {
        content = err.message;
      } else {
        content = err.name + ': ' + err.message;
      }
    }
    text.setText(content);
  }
}
