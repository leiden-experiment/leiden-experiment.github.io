import {
  PlayableTrackLayerData,
  TrackLayerData,
  TrackNode,
  TrackPinchNode,
} from '../level/trackTypes';
import Level from '../level/level';
import Metronome from '../level/metronome';
import Progress from '../level/progress';
import HandScene from '../scenes/handScene';
import InfoHUD from '../level/infoHud';
import { config, autoSaveToCSV } from '../managers/storageManager';
import { assert, Vector2 } from '../core/common';
import { TargetManager } from '../managers/targetManager';
import Target from '../objects/target';
import {
  fingerColors,
  indexFingerId,
  targetHitEarlyProgressImpact,
  targetHitLateProgressImpact,
  targetHitOnTimeProgressImpact,
  targetHitOnTimeStreakImpact,
  targetMissProgressImpact,
  targetSkipProgressImpact,
} from '../core/config';

export class Layer {
  public readonly level: Level;
  public readonly data: TrackLayerData;

  constructor(level: Level, data: TrackLayerData) {
    this.level = level;
    this.data = data;
  }

  public getDuration(): number {
    return this.level.track.songTimePositionToTime({
      bar: this.data.lengthInBars + 1,
      step: 1,
      tick: 0,
    });
  }
}

export class PlayableLayer extends Layer {
  public readonly data: PlayableTrackLayerData;
  public progress: Progress;
  public infoHud: InfoHUD;

  private targetManager: TargetManager;

  private scene: HandScene;
  private metronome: Metronome;

  private nextNodeIndex: number = 0;
  private songTime_: number = 0;
  private oldTimePosition: number = 0;
  private startTime: number = 0;
  private time: number = 0;
  private ready: boolean = false;

  constructor(scene: HandScene, level: Level, data: PlayableTrackLayerData) {
    super(level, data);
    this.scene = scene;
    this.data = data;
    this.targetManager = new TargetManager();
  }

  public init(scene: HandScene) {
    this.scene = scene;
    this.metronome = new Metronome(this.scene);
    this.progress = new Progress(this.scene);
    this.infoHud = new InfoHUD(this.scene, this.level);
  }

  get songTime() {
    return this.songTime_;
  }

  public unload() {
    if (this.infoHud) {
      this.infoHud.destroy();
    }
  }

  public start(delay: number) {
    this.targetManager.start();
    this.level.score.delay = delay;

    this.ready = true;
    this.startTime = this.time + delay;
    this.nextNodeIndex = 0;
    this.oldTimePosition = 0;

    const barCount = Math.max(this.data.previewTime.bar, 1);

    const tints: number[] = [];
    this.data.nodes.forEach((node: TrackNode, _index: number) => {
      const finger = config.indexFingerOnly
        ? indexFingerId
        : (node as TrackPinchNode).finger;
      tints.push(fingerColors[finger]);
    });

    this.progress.setup(
      0,
      this.data.nodes.length,
      this.data.progressCount,
      tints,
    );
    this.metronome.setup();
    this.infoHud.setup();

    this.progress.setVisible(true);
    this.infoHud.setVisible(true);
    this.metronome.play(
      this.level.track.data.timeSignatureNumerator,
      this.level.track.beatLength,
      barCount,
    );
  }

  public createTarget(
    node: TrackPinchNode,
    layerIndex: number,
    nodeIndex: number,
  ) {
    const finger: string = config.indexFingerOnly ? indexFingerId : node.finger;

    const target = new Target(
      this.scene,
      this.songTime_,
      new Vector2(
        node.normalizedPosition[0],
        node.normalizedPosition[1],
      ) /* screenPosition */,
      this.getPreviewTime() /* lifetime */,
      this.level.track.getSoundKey(
        this.data,
        node.soundKey,
      ) /* targetSoundKey */,
      this,
      finger,
      nodeIndex,
    );

    target.setOnTargetMiss(() => {
      // Target miss.
      this.level.score.missedPinch(target);

      this.progress.changeBy(targetMissProgressImpact);
      this.progress.redraw();

      this.level.streak.stop();

      this.targetManager.destroyTarget(target);

      // If the missed target is the last node, increment loop counter.
      this.checkForTransition(layerIndex, nodeIndex);
    });

    target.setOnTargetHit(() => {
      const previousTargets: Target[] =
        this.targetManager.getPreviousTargets(target);
      // Count each previous undestroyed target as a skip.
      for (const previousTarget of previousTargets) {
        assert(previousTarget != target);
        // Only skip targets that appeared before the current target.
        this.progress.changeBy(targetSkipProgressImpact);

        this.level.score.skippedPinch(previousTarget);

        this.checkForTransition(layerIndex, previousTarget.nodeIndex);

        this.targetManager.destroyTarget(previousTarget);
      }
      if (previousTargets.length > 0) {
        this.level.streak.stop();
      }

      // Hit called after previous targets are skipped.
      // This ensures that a streak always start on the first hit target.

      const hitTime = this.songTime - target.songTime;
      const onTimeMargin = target.onTimeDuration / 2;

      const early: boolean = hitTime < -onTimeMargin;
      const late: boolean = hitTime > onTimeMargin;

      if (early) {
        this.level.streak.stop();
        this.progress.changeBy(targetHitEarlyProgressImpact);
        this.level.score.earlyPinch(target, this.songTime);
      } else if (late) {
        this.level.streak.stop();
        this.progress.changeBy(targetHitLateProgressImpact);
        this.level.score.latePinch(target, this.songTime);
      } else {
        // on time.
        this.level.streak.changeBy(targetHitOnTimeStreakImpact);
        this.progress.changeBy(targetHitOnTimeProgressImpact);
        this.level.score.onTimePinch(
          target,
          this.songTime,
          this.level.streak.current,
        );
      }

      this.progress.redraw();

      this.level.streak.check();

      if (config.sonificationEnabled) {
        target.sound.play({
          volume: config.pinchVolume,
        });
      }

      this.targetManager.destroyTarget(target);

      this.checkForTransition(layerIndex, nodeIndex);
    });

    this.targetManager.addTarget(target);
  }

  private checkForTransition(layerIndex: number, nodeIndex: number) {
    if (
      // Last node is being destroyed (by hit or miss).
      nodeIndex == this.data.nodes.length - 1 &&
      // TODO: Find a better way to do this.
      // Check that layer has not been skipped.
      this.level.activeLayerIndex == layerIndex
    ) {
      // Transition if auto skip is enabled, and the desired loop-count has been reached,
      // or if the player's progress is sufficient
      if (
        (config.skipLayersAutomatically &&
          this.level.score.getLoopCount() >=
            config.skipLayersAutomaticallyAfterLoop) ||
        (this.progress.canProgress() && !config.disableLayerProgression)
      ) {
        // Enough progress, transition to next layer / end scene.
        this.level.transitionLayers();
      } else {
        // Not enough progress, increment loop counter.
        this.level.score.incrementLoopCount();
        this.progress.setToStarting();
        this.infoHud.updateLoopText();

        if (config.autoSaveCSV) {
          autoSaveToCSV(this.level.score.levelStats);
        }
      }
    }
  }

  /**
   * Handles spawning nodes, it will spawn those that would happen soon according to the previewtime set in the layer.
   */
  private handleTargetCreation() {
    if (!this.ready) return;

    const layerTime = this.getDuration();

    let previewTime = this.songTime_ + this.getPreviewTime();
    if (this.songTime_ > 0) {
      previewTime %= layerTime;
    }

    if (this.data.nodes.length <= this.nextNodeIndex) {
      if (previewTime < this.oldTimePosition) {
        this.nextNodeIndex = 0;
      } else {
        return;
      }
    }

    const nextNode = this.data.nodes[this.nextNodeIndex];

    // Calculate the time position of the next node in terms of the looped layer time
    const nextNodeLoopTime =
      this.level.track.songTimePositionToTime(nextNode.timePosition) %
      layerTime;

    if (nextNodeLoopTime <= previewTime) {
      if ((nextNode as TrackPinchNode).finger != undefined) {
        this.createTarget(
          nextNode as TrackPinchNode,
          this.level.activeLayerIndex,
          this.nextNodeIndex,
        );
      }
      this.nextNodeIndex++;
    }
    this.oldTimePosition = previewTime;
  }

  public preDelayStop() {
    this.ready = false;
    this.metronome.stop();
    this.targetManager.destroyTargets();
  }

  public postDelayStop() {
    this.infoHud.setVisible(false);
    this.progress.setVisible(false);
  }

  public stop() {
    this.preDelayStop();
    this.postDelayStop();
  }

  public update(time: number) {
    this.time = time;
    this.songTime_ = this.ready ? this.time - this.startTime : 0;
    this.handleTargetCreation();
  }

  public getPreviewTime(): number {
    return this.level.track.songTimePositionToTime({
      bar: this.data.previewTime.bar + 1,
      step: this.data.previewTime.step + 1,
      tick: this.data.previewTime.tick,
    });
  }
}
