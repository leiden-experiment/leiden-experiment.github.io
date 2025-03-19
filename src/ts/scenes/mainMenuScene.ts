import HandScene from '../scenes/handScene';
import { Button } from '../ui/button';
import Level from '../level/level';
import { Sprite } from '../core/phaserTypes';
import { levels } from './loadingScene';

export default class MainMenu extends HandScene {
  private title: Sprite;
  private calibration: Button;
  private levelSelect: Button;
  private options: Button;

  constructor() {
    super('mainMenu');
  }

  preload() {
    // Levels are preloaded in the main menu to eliminate preload
    // buffering time when switching to level select.
    levels.forEach((level: Level) => {
      level.preload(this);
    });
  }

  create() {
    super.create();

    levels.forEach((level: Level) => {
      level.setBPM(0);
    });

    const buttonsY: number = 800;
    const buttonGapX: number = 500;

    this.calibration = new Button(
      this,
      'SETUP\nCAMERA',
      this.center.x - buttonGapX,
      buttonsY,
      () => {
        this.scene.start('calibration');
      },
    );
    this.options = new Button(
      this,
      'OPTIONS',
      this.center.x + buttonGapX,
      buttonsY,
      () => {
        this.scene.start('options');
      },
    );

    this.levelSelect = new Button(
      this,
      'SELECT\nLEVEL',
      this.center.x,
      buttonsY,
      () => {
        this.scene.start('levelSelect');
      },
    );

    this.title = this.add.sprite(this.center.x, 270, 'title');
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
  }
}
