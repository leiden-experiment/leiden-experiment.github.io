import Phaser from 'phaser';
import { assert } from '../core/common';
import { Graphics, PhaserText, Rectangle, Vector2 } from '../core/phaserTypes';
import { ConfigData } from '../core/interfaces';
import { undefinedText } from '../core/config';

export class Checkbox extends Graphics {
  private isChecked_: boolean;
  private box: Rectangle;
  private check: Rectangle;
  private label: PhaserText | undefined;
  private readonly labelText: string = undefinedText;
  private toggleCallback: (checkbox: Checkbox) => void;
  public readonly key: keyof ConfigData;

  constructor(
    scene: Phaser.Scene,
    boxPosition: Vector2,
    boxSize: number,
    labelOffset: Vector2 | undefined,
    labelText: string,
    configData: ConfigData,
    key: keyof ConfigData,
    toggleCallback: (checkbox: Checkbox) => void,
  ) {
    super(scene);

    this.x = boxPosition.x;
    this.y = boxPosition.y;
    this.key = key;

    if (labelOffset) {
      this.labelText = labelText;
      this.label = this.scene.add.text(
        boxPosition.x + labelOffset.x,
        boxPosition.y + labelOffset.y,
        this.labelText,
        {
          color: '#ffffff',
          fontSize: '24px',
        },
      );
    }
    this.toggleCallback = toggleCallback;
    assert(typeof configData[this.key] == 'boolean');
    this.isChecked_ = configData[this.key] as boolean;
    this.box = new Rectangle(0, 0, boxSize, boxSize);
    this.check = new Rectangle(
      boxSize * 0.25,
      boxSize * 0.25,
      boxSize * 0.5,
      boxSize * 0.5,
    );

    this.setInteractive(this.box, Rectangle.Contains);

    this.toggleCallback(this);

    this.on('pointerdown', this.toggleCheck, this);
    this.draw();
  }

  public reset(configData: ConfigData) {
    assert(typeof configData[this.key] == 'boolean');
    this.isChecked_ = configData[this.key] as boolean;
    this.toggleCallback(this);
    this.draw();
  }

  public resetLabel() {
    if (this.label) {
      this.label.setText(this.labelText);
    }
  }

  public setLabel(text: string) {
    if (this.label) {
      this.label.setText(text);
    }
    this.draw();
  }

  private toggleCheck() {
    this.isChecked_ = !this.isChecked_;
    this.toggleCallback(this);
    this.draw();
  }

  public draw() {
    this.clear();
    if (this.input && !this.input.enabled) {
      this.setInteractive(this.box, Rectangle.Contains);
    }
    this.lineStyle(2, 0xffffff);
    this.strokeRectShape(this.box);
    if (this.isChecked_) {
      this.fillStyle(0xffffff);
      this.fillRectShape(this.check);
    }
  }

  public setToggled(value: number | boolean | string) {
    if (typeof value != 'boolean') return;
    this.isChecked_ = value;
    this.toggleCallback(this);
    this.draw();
  }

  public hide(): Checkbox {
    this.clear();
    this.disableInteractive();
    if (this.label) this.label.setText('');
    return this;
  }

  get isChecked(): boolean {
    return this.isChecked_;
  }
}
