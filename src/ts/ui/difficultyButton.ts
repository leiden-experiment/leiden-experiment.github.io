import {
  buttonPinchFinger,
  difficultyButtonChosenTextTint,
  difficultyButtonChosenTint,
} from '../core/config';
import { PhaserText, Vector2 } from '../core/phaserTypes';
import HandScene from '../scenes/handScene';
import { ToggleButton } from '../ui/toggleButton';

export class DifficultyButton extends ToggleButton {
  private readonly bpmIndex_: number;
  private readonly bpm: number;
  private readonly bpmText: PhaserText;

  constructor(
    bpmIndex: number,
    bpm: number,
    scene: HandScene,
    textContent: string,
    x: number,
    y: number,
    onPinch: () => void = () => {},
    spriteKey: string,
    toggledSpriteKey: string,
    toggled: boolean = false,
    soundKey: string = 'pinch',
  ) {
    super(
      scene,
      textContent,
      x,
      y,
      onPinch,
      spriteKey,
      toggledSpriteKey,
      toggled,
      soundKey,
    );
    this.resetTint = false;
    this.bpmIndex_ = bpmIndex;
    this.bpm = bpm;
    const textCenter: Vector2 = this.getCenter();
    this.bpmText = this.scene.add
      .text(textCenter.x, textCenter.y + 30, 'BPM: ' + this.bpm.toString(), {
        font: '20px Courier New',
      })
      .setOrigin(0.5, 0.5);
    if (this.text) {
      this.text.y -= 10;
    }

    this.updateTint();

    this.on('destroy', () => {
      this.scene.hand.removePinchCheck(buttonPinchFinger, this);
      if (this.sound) {
        if (this.sound.isPlaying) {
          this.sound.on('complete', () => {
            if (this.sound) {
              this.sound.destroy();
            }
          });
        } else {
          this.sound.destroy();
        }
      }
      if (this.text) {
        this.text.destroy();
        this.text = undefined;
      }
      if (this.bpmText) this.bpmText.destroy();
    });
  }

  public updateTint() {
    if (this.toggleState) {
      if (this.text) {
        this.text.setTintFill(difficultyButtonChosenTextTint);
      }
      this.bpmText.setTintFill(difficultyButtonChosenTextTint);
      this.setTintFill(difficultyButtonChosenTint);
    } else {
      if (this.text) {
        this.text.clearTint();
      }
      this.bpmText.clearTint();
      this.clearTint();
    }
  }

  get bpmIndex() {
    return this.bpmIndex_;
  }
}
