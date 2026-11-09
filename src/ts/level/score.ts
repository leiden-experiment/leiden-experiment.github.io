import {
  correctTargetId,
  earlyTargetId,
  indexFingerId,
  lateTargetId,
  middleFingerId,
  missedTargetId,
  pinkyFingerId,
  ringFingerId,
  skippedTargetId,
  thumbFingerId,
} from '../core/config';
import { LayerStats, LevelStats } from '../core/interfaces';
import Target from '../objects/target';
import { Track } from '../level/track';
import HandScene from '../scenes/handScene';
import { getStudySession } from '../study/runtime';

export class Score {
  public layerStats: LayerStats;
  public levelStats: LevelStats;
  public delay: number;
  public scene: HandScene;

  constructor(scene: HandScene, track: Track) {
    this.scene = scene;
    this.levelStats = new LevelStats(track);
    this.layerStats = new LayerStats();
  }

  public getLoopCount(): number {
    return this.layerStats.loop;
  }

  public incrementLoopCount() {
    this.layerStats.correct = 0;
    this.layerStats.early = 0;
    this.layerStats.late = 0;
    this.layerStats.miss = 0;
    this.layerStats.loop++;
  }

  public saveLayerScores() {
    this.levelStats.layersStats.push(this.layerStats);
  }

  public resetLayerScores(newNodeCount: number, newRequiredProgress: number) {
    this.layerStats = new LayerStats();
    this.layerStats.total = newNodeCount;
    this.layerStats.required = newRequiredProgress;
  }

  private addHit(
    target: Target,
    playerSongTime: number,
    classification: string,
  ) {
    const study = getStudySession();
    const includeNormalized = !study || study.settings.collectFingerPositions === true;
    this.layerStats.hits.push({
      loopNumber: this.getLoopCount(),
      noteID: target.nodeIndex + 1,
      pinchType: target.fingerId,
      correctTime: target.songTime + this.delay,
      playerTime: playerSongTime,
      classification,
      ...(includeNormalized ? {
        normalizedTargetRadius: target.normalizedRadius,
        normalizedTargetPosition: target.normalizedPosition,
        normalizedFingerRadius: this.scene.hand.getNormalizedFingerRadius(),
        normalizedPinkyFingerPosition: this.scene.hand.getNormalizedFingerPosition(pinkyFingerId),
        normalizedRingFingerPosition: this.scene.hand.getNormalizedFingerPosition(ringFingerId),
        normalizedMiddleFingerPosition: this.scene.hand.getNormalizedFingerPosition(middleFingerId),
        normalizedIndexFingerPosition: this.scene.hand.getNormalizedFingerPosition(indexFingerId),
        normalizedThumbFingerPosition: this.scene.hand.getNormalizedFingerPosition(thumbFingerId),
      } : {}),
    });
  }

  public onTimePinch(target: Target, playerSongTime: number, streak: number) {
    this.addHit(target, playerSongTime + this.delay, correctTargetId);
    this.layerStats.correct++;
    this.levelStats.maxStreak = Math.max(streak, this.levelStats.maxStreak);
  }

  public earlyPinch(target: Target, playerSongTime: number) {
    this.addHit(target, playerSongTime + this.delay, earlyTargetId);
    this.layerStats.early++;
  }

  public latePinch(target: Target, playerSongTime: number) {
    this.addHit(target, playerSongTime + this.delay, lateTargetId);
    this.layerStats.late++;
  }

  // Called when a player hits a target ahead of time,
  // causing all previous targets to be destroyed and "skipped"
  public skippedPinch(target: Target) {
    this.addHit(target, -1000, skippedTargetId);
    this.layerStats.miss++;
  }

  public missedPinch(target: Target) {
    this.addHit(target, -1000, missedTargetId);
    this.layerStats.miss++;
  }
}
