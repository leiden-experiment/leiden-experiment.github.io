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
import { getStudySession } from '../study/runtime';

export class Button extends MatterSprite {
  public readonly scene: HandScene;
  protected sound: AudioTrack;
  public text: PhaserText | undefined;
  protected resetTint: boolean = true;

  private pointerDownHandler?: () => void;
  private pointerMoveHandler?: () => void;
  private pointerOutHandler?: () => void;

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
    this.scene.hand.removePinchCheck(buttonPinchFinger, this);

    if (this.pointerDownHandler) {
      this.off('pointerdown', this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) {
      this.off('pointermove', this.pointerMoveHandler);
    }
    if (this.pointerOutHandler) {
      this.off('pointerout', this.pointerOutHandler);
    }

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

    // Research UI menus should be mouse-only: a tracked hand must not
    // accidentally activate Continue, Setup Camera, Retry or other controls.
    // Guest mode retains its legacy pinch-to-click behavior.
    if (!getStudySession()) this.scene.hand.addPinchCheck(buttonPinchFinger, this, newCallbacks);

    this.pointerDownHandler = onTriggerStart;
    this.on('pointerdown', this.pointerDownHandler);

    this.pointerMoveHandler = pinchCallbacks.startHover;
    if (this.pointerMoveHandler) {
      this.on('pointermove', this.pointerMoveHandler);
    }

    this.pointerOutHandler = pinchCallbacks.endHover;
    if (this.pointerOutHandler) {
      this.on('pointerout', this.pointerOutHandler);
    }
  }
}
