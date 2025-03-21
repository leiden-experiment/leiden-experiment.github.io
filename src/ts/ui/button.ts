import {
  buttonDepth,
  buttonHoverTint,
  buttonPinchFinger,
  buttonTextHoverTint,
  buttonTextStyle,
} from '../core/config';
import { PinchCallbacks } from '../core/interfaces';
import {
  AudioTrack,
  MatterSprite,
  PhaserText,
  Vector2,
} from '../core/phaserTypes';
import { config } from '../managers/storageManager';
import HandScene from '../scenes/handScene';
import setInteraction from '../util/interaction';

export class Button extends MatterSprite {
  public readonly scene: HandScene;
  protected sound: AudioTrack;
  public text: PhaserText | undefined;
  protected resetTint: boolean = true;

  constructor(
    scene: HandScene,
    textContent: string,
    x: number,
    y: number,
    onPinch: () => void = () => {},
    spriteKey: string = 'button',
    soundKey: string = 'pinch',
    originX: number = 0.5,
    originY: number = 0.5,
  ) {
    super(scene.matter.world, x, y, spriteKey, undefined, {
      render: {
        visible: true,
      },
      label: 'button-' + spriteKey,
    });
    this.scene = scene;

    this.scene.add.existing(this);

    this.setOrigin(originX, originY);

    this.sound = this.scene.sound.add(soundKey, {
      volume: config.pinchVolume,
    });

    if (textContent !== '') {
      const textCenter: Vector2 = this.getCenter();
      this.text = this.scene.add
        .text(textCenter.x, textCenter.y, textContent, buttonTextStyle)
        .setOrigin(0.5, 0.5);
    }

    setInteraction(this, true);

    this.setSensor(true);
    this.setDepth(buttonDepth);

    this.setOnPinch(onPinch);

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
    });
  }

  public removePinchCallbacks() {
    this.scene.hand.removePinchCheck(buttonPinchFinger, this);
  }

  public setOnPinch(onPinch: () => void) {
    this.setPinchCallbacks({
      startPinch: onPinch,
      startHover: () => {
        if (this.resetTint || this.tint == 0xffffff) {
          if (this.text && this.text.visible) {
            this.text.setTintFill(buttonTextHoverTint);
          }
          this.setTintFill(buttonHoverTint);
        }
      },
      endHover: () => {
        if (this.resetTint || this.tint == buttonTextHoverTint) {
          if (this.text && this.text.visible) {
            this.text.clearTint();
          }
          this.clearTint();
        }
      },
    });
  }

  public setPinchCallbacks(pinchCallbacks: PinchCallbacks) {
    const onTriggerStart = () => {
      pinchCallbacks.startPinch?.();
      this.sound.play({
        volume: config.pinchVolume,
      });
    };

    const newCallbacks: PinchCallbacks = {
      startPinch: () => {
        if (config.uiPinchesEnabled) {
          onTriggerStart();
        }
      },
      pinched: () => {
        if (config.uiPinchesEnabled) {
          pinchCallbacks.pinched?.();
        }
      },
      endPinch: () => {
        if (config.uiPinchesEnabled) {
          pinchCallbacks.endPinch?.();
        }
      },
      startHover: () => {
        if (config.uiPinchesEnabled) {
          pinchCallbacks.startHover?.();
        }
      },
      endHover: () => {
        if (config.uiPinchesEnabled) {
          pinchCallbacks.endHover?.();
        }
      },
    };

    this.scene.hand.addPinchCheck(buttonPinchFinger, this, newCallbacks);

    this.on('pointerdown', onTriggerStart);

    if (pinchCallbacks.startHover) {
      this.on('pointermove', pinchCallbacks.startHover);
    }

    if (pinchCallbacks.endHover) {
      this.on('pointerout', pinchCallbacks.endHover);
    }
  }
}
