import HandScene from '../scenes/handScene';
import { assert } from '../core/common';
import { config } from '../managers/storageManager';
import {
  ColorObject,
  GameObject,
  ParticleEmitter,
  PhaserText,
  Tween,
} from '../core/phaserTypes';
import {
  streakFireOptions,
  streakInfoText,
  streakOnFireColorWheelExtent,
  streakOnFireDuration,
  streakOnFireRequirement,
  streakStartRequirement,
  streakTextOptions,
  undefinedText,
} from '../core/config';

export class Streak extends GameObject {
  private readonly hsv: ColorObject[];

  private current_: number = 0;

  private onFire: boolean = false;

  private onFireTween: Tween | undefined;
  private streakText: PhaserText;
  private flame: ParticleEmitter;

  constructor(scene: HandScene) {
    super(scene, 'streak');

    this.hsv = Phaser.Display.Color.HSVColorWheel();

    this.streakText = this.scene.add
      .text(scene.width * 0.05, scene.height * 0.05, undefinedText, {
        font: streakTextOptions.font,
        color: streakTextOptions.color,
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setScale(streakTextOptions.scale)
      .setDepth(streakTextOptions.depth)
      .setStroke(streakTextOptions.color, streakTextOptions.strokeThickness)
      .setShadow(
        streakTextOptions.shadowOffset.x,
        streakTextOptions.shadowOffset.y,
        streakTextOptions.shadowColor,
        streakTextOptions.shadowBlurRadius,
        true,
        true,
      );
  }

  get current() {
    return this.current_;
  }

  public changeBy(value: number) {
    this.current_ = Math.max(0, this.current + value);
  }

  public check() {
    if (this.current_ === streakStartRequirement) {
      this.start();
    } else if (this.current_ > streakStartRequirement) {
      this.continue();
    } else {
      this.stop();
    }
  }

  private updateStreakText() {
    this.streakText.setText(streakInfoText + this.current_.toString());
  }

  private start() {
    // TODO: Possibly play sound.
    this.updateStreakText();
    this.streakText.setVisible(true);
  }

  public stop() {
    // TODO: Potentially play sound.
    this.current_ = 0;
    this.onFire = false;
    this.onFireTween?.remove();
    this.streakText?.clearTint();
    this.streakText?.setVisible(false);
    this.flame?.destroy();
  }

  private continue() {
    this.updateStreakText();
    const wasOnFire: boolean = this.onFire;
    this.onFire = this.current_ >= streakOnFireRequirement;
    if (!wasOnFire && this.onFire) {
      assert(
        streakOnFireColorWheelExtent > 0 && streakOnFireColorWheelExtent <= 255,
        'Streak color wheel extent must be from 1 to 255',
      );
      this.onFireTween = this.scene.tweens.addCounter({
        from: 0,
        to: streakOnFireColorWheelExtent,
        duration: streakOnFireDuration,
        yoyo: true,
        onUpdate: tween => {
          if (this && this.hsv) {
            // Phaser's counter can return null while the tween is inactive.
            // Clamp the index so both color-wheel lookups stay valid.
            const value = Math.max(0, Math.min(
              streakOnFireColorWheelExtent,
              Math.floor(tween.getValue() ?? 0),
            ));
            const top = this.hsv[value].color;
            const bottom = this.hsv[streakOnFireColorWheelExtent - value].color;
            if (this.streakText)
              this.streakText.setTint(top, top, bottom, bottom);
          }
        },
        onStop: () => {
          this.onFireTween?.remove();
        },
      });
      if (!config.postProcessingDisabled) {
        this.flame?.destroy();
        if (this.streakText) {
          // Create particles for flame
          this.flame = this.scene.add.particles(
            this.streakText.x,
            this.streakText.y,
            'flare',
            streakFireOptions,
          );
          assert(streakTextOptions.depth != 0);
          this.flame.setDepth(streakTextOptions.depth - 1);
        }
      }
    }
  }
}
