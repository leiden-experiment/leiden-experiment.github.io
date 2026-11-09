import HandScene from '../scenes/handScene';
import { assert } from '../core/common';
import { config } from '../managers/storageManager';
import {
  GameObject,
  PhaserText,
  Sprite,
  TimerEvent,
  Tween,
} from '../core/phaserTypes';
import {
  countdownTextureOptions,
  metronomeMinimumBarCount,
  undefinedText,
} from '../core/config';

export default class Metronome extends GameObject {
  private beat: number = 0;
  private timer: TimerEvent;

  private countdownText: PhaserText;
  private countdownTexture: Sprite;
  private shrinkTween: Tween;

  constructor(scene: HandScene) {
    super(scene, 'metronome');
    this.timer = new TimerEvent({});

    this.countdownText = this.scene.add
      .text(scene.center.x, scene.center.y, undefinedText, {
        font: '240px Courier New',
        color: 'white',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(30);
    this.setVisible(false);
  }

  public setup() {
    this.countdownTexture = this.scene.add
      .sprite(
        this.countdownText.getCenter().x,
        this.countdownText.getCenter().y,
        'countdown',
      )
      .setScale(countdownTextureOptions.scale)
      .setVisible(false)
      .setAlpha(countdownTextureOptions.opacity)
      .setDepth(countdownTextureOptions.depth);
  }

  public setVisible(visible: boolean) {
    if (this.countdownText) this.countdownText.setVisible(visible);
    if (this.countdownTexture) this.countdownTexture.setVisible(visible);
  }

  public stop() {
    this.setVisible(false);
    this.scene?.time.removeEvent(this.timer);
    this.scene?.sound.stopByKey('metronomeHigh');
    this.scene?.sound.stopByKey('metronomeLow');
    if (this.scene) {
      this.shrinkTween?.remove();
    }
  }

  /**
   * @param beatDuration Time in ms between beats.
   * @param barCount amount of bars this should play.
   */
  public play(beatsPerBar: number, beatDuration: number, barCount: number) {
    this.beat = 0;
    this.stop();
    this.timer = this.scene.time.addEvent({
      callback: this.tick.bind(this, beatsPerBar, beatDuration, barCount),
      delay: beatDuration,
      loop: true,
      startAt: beatDuration,
    });
  }

  private tick(beatsPerBar: number, beatDuration: number, barCount: number) {
    assert(
      barCount >= metronomeMinimumBarCount,
      'Cannot display metronome for less than minimum bar count',
    );
    // Only display countdown text on the last bar of the metronome.

    const totalBeats = beatsPerBar * barCount;
    const beatInBar = this.beat % beatsPerBar;
    const finalBeat = beatInBar == 0;
    const soundKey = finalBeat ? 'metronomeHigh' : 'metronomeLow';

    if (this.beat >= totalBeats) {
      this.setVisible(false);
      return;
    } else {
      // Check metronome has not exited early.
      if (this.countdownText.active) {
        this.scene.sound.play(soundKey, {
          volume: config.backgroundMusicVolume,
        });
      }
    }

    // Display countdown on the final bar.
    assert(totalBeats - beatsPerBar >= 0);
    if (this.beat >= totalBeats - beatsPerBar) {
      // Check metronome has not exited early.
      if (this.countdownText.active && config.displayVisualMetronome) {
        this.display(beatInBar + metronomeMinimumBarCount, beatDuration);
      }
    }

    this.beat++;
  }

  private display(beat: number, beatDuration: number) {
    this.countdownText.setText(beat.toString());
    this.countdownText.setScale(1);
    this.countdownTexture.setScale(countdownTextureOptions.scale);
    this.setVisible(true);
    this.shrinkTween = this.scene.tweens.add({
      targets: [this.countdownText, this.countdownTexture],
      ease: 'Power0',
      duration: beatDuration * 0.9, // 0.9 provides a short buffer for next countdown number to spawn
      scale: 0,
      repeat: 0,
    });
  }
}
