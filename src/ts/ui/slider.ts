import Phaser from 'phaser';
import Vector2 = Phaser.Math.Vector2;
import HandScene from '../scenes/handScene';
import { Graphics, PhaserText, Pointer, Rectangle } from '../core/phaserTypes';
import { ConfigData } from '../core/interfaces';
import { assert } from '../core/common';
import RoundTo = Phaser.Math.RoundTo;
import { undefinedText } from '../core/config';

export class Slider extends Graphics {
  private value: number;
  private box: Rectangle;
  private handle: Rectangle;
  private isDragging: boolean = false;
  public label: PhaserText | undefined;
  public range: Vector2 = new Vector2(0, 1);
  private isInteger: boolean = false;
  public readonly key: keyof ConfigData;
  private width: number;
  private height: number;
  private updateSliderCallback: (slider: Slider) => void;

  private readonly onScenePointerUp = () => {
    this.stopDrag();
    this.stopDragCallback?.();
  };

  private readonly onScenePointerMove = (pointer: Pointer) => {
    this.doDrag(pointer);
  };

  private stopDragCallback?: () => void;

  constructor(
    scene: HandScene,
    boxPosition: Vector2,
    boxSize: Vector2,
    labelOffset: Vector2 | undefined,
    configData: ConfigData,
    key: keyof ConfigData,
    range: Vector2,
    updateSliderCallback: (slider: Slider) => void,
    stopDragCallback?: () => void,
  ) {
    super(scene);
    this.x = boxPosition.x;
    this.y = boxPosition.y;
    this.width = boxSize.x;
    this.height = boxSize.y;
    this.key = key;
    this.updateSliderCallback = updateSliderCallback;
    this.range = range;
    this.value = 0.5; // Start in the middle.
    this.box = new Rectangle(0, 0, boxSize.x, boxSize.y);
    this.handle = new Rectangle(0, 0, boxSize.y, boxSize.y); // Make the handle a square

    this.updateHandle();

    // Add the labels
    if (labelOffset) {
      this.label = this.scene.add.text(
        this.x + labelOffset.x,
        this.y + labelOffset.y,
        undefinedText,
        {
          color: '#ffffff',
          fontSize: '24px',
        },
      );
    }

    this.setInteractive(this.box, Rectangle.Contains);

    this.stopDragCallback = stopDragCallback;

    this.on('pointerdown', this.startDrag, this);
    this.scene.input.on('pointerup', this.onScenePointerUp, this);
    this.scene.input.on('pointermove', this.onScenePointerMove, this);

    assert(
      typeof configData[this.key] == 'number',
      'Type must be number, instead it was: ' + typeof configData[this.key],
    );
    this.setValue(configData[this.key] as number);

    this.draw();
  }

  public reset(configData: ConfigData) {
    assert(typeof configData[this.key] == 'number', 'Type must be number');
    this.setValue(configData[this.key] as number);
    this.draw();
  }

  private startDrag() {
    this.isDragging = true;
  }

  private doDrag(pointer: Pointer) {
    if (!this.isDragging) {
      return;
    }
    this.value = Phaser.Math.Clamp(
      (pointer.x - this.x - this.handle.width / 2) /
        (this.width - this.handle.width),
      0,
      1,
    );
    this.updateHandle();
    this.draw();
  }

  private stopDrag() {
    this.isDragging = false;
  }

  private updateHandle() {
    this.handle.x = this.value * (this.width - this.handle.width);
  }

  public draw() {
    this.clear();
    if (this.input) {
      if (!this.input.enabled) {
        this.setInteractive(this.box, Rectangle.Contains);
      }
      this.updateSliderCallback(this);
    }
    this.fillStyle(0xaaaaaa);
    this.fillRectShape(this.box);
    this.fillStyle(0xffffff);
    this.fillRectShape(this.handle);
  }

  public getStringValue() {
    const v = this.getValue();
    if (this.isInteger) {
      return v.toFixed(0);
    }
    return v.toFixed(2);
  }

  public getValue() {
    const value = this.value * (this.range.y - this.range.x) + this.range.x;
    if (this.isInteger) {
      return RoundTo(value, 0);
    }
    return value;
  }

  public setIsInteger(isInteger: boolean): Slider {
    this.isInteger = isInteger;
    this.draw();
    return this;
  }

  public setValue(value: number) {
    this.value = (value - this.range.x) / (this.range.y - this.range.x);
    this.updateHandle();
    this.draw();
  }

  public hide(newLabelText?: string): Slider {
    this.clear();
    if (this.input) {
      this.disableInteractive();
    }
    if (this.label && this.label.active) {
      if (newLabelText) {
        this.label.setText(newLabelText);
      } else {
        this.label.setText('');
      }
    }
    return this;
  }
}
