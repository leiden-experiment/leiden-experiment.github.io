import { Track } from '../level/track';
import { absPath, assert } from '../core/common';
import HandScene from '../scenes/handScene';
import { PlayableTrackLayerData, TrackLayerData } from '../level/trackTypes';
import { PlayableLayer } from '../level/layer';
import { Streak } from '../level/streak';
import { Score } from '../level/score';
import { config, autoSaveToCSV } from '../managers/storageManager';
import { AudioTrack, Scene, SoundConfig } from '../core/phaserTypes';
import {
  invalidBpmIndex,
  layerStartTimeDelay,
  levelBackgroundFileName,
  levelDir,
  levelPreviewFileName,
  levelStartTimeDelay,
  metronomeMinimumBarCount,
  undefinedText,
} from '../core/config';

export default class Level {
  private trackKey_: string = undefinedText;
  private finishCallback: () => void = () => {};
  private abortCallback: () => void = () => {};

  public track: Track;
  public scene: HandScene | Scene;
  public streak: Streak;
  public score: Score;

  public activeLayerIndex: number = 0;
  public playableLayers: PlayableLayer[] = [];
  public activeAudioTracks: AudioTrack[] = [];
  private bpmIndex_: number = invalidBpmIndex;
  private completedLayerIds: string[] = []; // Track completed layers for progressive audio

  constructor(scene: Scene, trackKey: string) {
    this.scene = scene;
    this.trackKey_ = trackKey;
    this.track = new Track(scene, this.trackKey_);
  }

  public preload(scene: HandScene) {
    this.scene = scene;
    this.track.preload(scene);
    this.preloadPreview();
    this.preloadLayers();
  }

  public unload() {
    this.track.unload();
  }

  public setBPM(bpmIndex: number) {
    assert(
      bpmIndex != invalidBpmIndex,
      'BPM must be set before starting the level',
    );
    this.track.setBPM(bpmIndex);
    this.bpmIndex_ = bpmIndex;
  }

  get bpmIndex() {
    return this.bpmIndex_;
  }

  get trackKey() {
    return this.trackKey_;
  }

  public init(scene: HandScene) {
    this.scene = scene;
    this.streak = new Streak(this.scene as HandScene);
    this.score = new Score(scene, this.track);
    this.playableLayers.forEach((layer: PlayableLayer) => {
      layer.init(this.scene as HandScene);
    });
  }

  public getBackgroundTextureKey(): string {
    return this.trackKey + '/' + levelBackgroundFileName;
  }

  public getPreviewVideoKey(): string {
    return this.trackKey + '/' + levelPreviewFileName;
  }

  public hasCustomBackground(): boolean {
    return this.scene.textures.exists(this.getBackgroundTextureKey());
  }

  public hasPreviewVideo(): boolean {
    return this.scene.cache.video.has(this.getPreviewVideoKey());
  }

  private preloadPreview() {
    // Designer levels contain no preview MP4 or background image. Legacy
    // levels still load both files exactly as they did before the merge.
    if (this.trackKey_.startsWith('temp_level_')) return;
    const previewFile = levelDir + this.getPreviewVideoKey();
    const backgroundFile = levelDir + this.getBackgroundTextureKey();
    if (!this.scene.cache.video.has(this.getPreviewVideoKey())) {
      this.scene.load.video(this.getPreviewVideoKey(), absPath(previewFile), true);
    }
    if (!this.scene.textures.exists(this.getBackgroundTextureKey())) {
      this.scene.load.image(this.getBackgroundTextureKey(), absPath(backgroundFile));
    }
  }

  private preloadLayers() {
    this.playableLayers = [];

    this.track.forEachLayer(
      undefined,
      (layer: PlayableTrackLayerData, _layerIndex: number) => {
        const playableLayer = new PlayableLayer(
          this.scene as HandScene,
          this,
          layer,
        );
        this.playableLayers.push(playableLayer);
      },
    );
  }

  private unloadLayers() {
    this.playableLayers.forEach((layer: PlayableLayer) => {
      layer.unload();
    });

    this.track.unload();
  }

  public start(finishCallback: () => void, abortCallback: () => void) {
    this.activeLayerIndex = 0;
    this.completedLayerIds = [];

    this.removeBackgroundAudio();

    this.playableLayers.forEach((layer: PlayableLayer) => {
      layer.stop();
    });

    this.streak.stop();

    this.setBPM(this.bpmIndex_);
    this.finishCallback = finishCallback;
    this.abortCallback = abortCallback;


    // TODO: Consider showing something before first layer starts.
    this.scene.time.delayedCall(levelStartTimeDelay, () => {
      this.startLayer();
    });
  }

  public addBackgroundAudio(
    scene: HandScene,
    soundConfig: SoundConfig,
    predicate?: (layer: TrackLayerData, index: number) => boolean,
  ) {
    assert(
      this.bpmIndex_ != invalidBpmIndex,
      'Set BPM before adding background audio to level',
    );
    this.removeBackgroundAudio();
    this.activeAudioTracks = this.track.addBackgroundAudioTracks(
      scene,
      soundConfig,
      this.bpmIndex_,
      predicate,
    );
  }

  public removeBackgroundAudio() {
    this.activeAudioTracks.forEach((track: AudioTrack) => {
      track.stop();
      this.scene.sound.remove(track);
    });
    this.activeAudioTracks = [];
  }

  public playBackgroundAudio() {
    this.activeAudioTracks.forEach((track: AudioTrack) => {
      track.setMute(false);
      track.play();
    });
  }

  public setBackgroundAudioMute(state: boolean) {
    this.activeAudioTracks.forEach((track: AudioTrack) => {
      track.setMute(state);
    });
  }

  private startLayer() {
    const layer: PlayableLayer = this.getActiveLayer();
    const activeIndex: number = this.activeLayerIndex;

    // Must be called before layer start, otherwise infoHud.start will not have correct loop count.
    this.score.resetLayerScores(
      layer.data.nodes.length,
      layer.data.progressCount,
    );

    // Make sure the delay is at least 1 bar, even with lower preview time.
    const barLength = this.track.songTimePositionToTime({
      bar: 1 + metronomeMinimumBarCount,
      step: 1,
      tick: 0,
    });
    const delay = Math.max(barLength, layer.getPreviewTime());

    layer.start(delay);

    // Progressive audio building: include original background layers + completed layers
    const backgroundLayers: string[] = [...(layer.data.backgroundLayers || [])];

    // Add all previously completed playable layers to background
    if (this.trackKey_.startsWith('temp_level_')) {
      this.completedLayerIds.forEach(completedLayerId => {
        if (!backgroundLayers.includes(completedLayerId)) {
          backgroundLayers.push(completedLayerId);
        }
      });
    }

    if (config.synchronizationEnabled) {
      // Only add current layer to background if it has pre-recorded loop files
      const currentLayerData = this.track.data.layers.find(
        l => l.id === layer.data.id,
      );
      if (
        currentLayerData &&
        currentLayerData.soundLoopKeys &&
        currentLayerData.soundLoopKeys.length > 0
      ) {
        backgroundLayers.push(layer.data.id);
      }
    }

    this.addBackgroundAudio(
      this.scene as HandScene,
      {
        loop: true,
        volume: config.backgroundMusicVolume,
      },
      (otherLayer: TrackLayerData, _index: number) => {
        return backgroundLayers.includes(otherLayer.id);
      },
    );

    this.scene.time.delayedCall(delay, () => {
      // Ensure that layer has not been skipped.
      if (this.activeLayerIndex == activeIndex) {
        this.playBackgroundAudio();
      }
    });
  }

  public getActiveLayer(): PlayableLayer {
    assert(
      this.activeLayerIndex < this.playableLayers.length,
      'Active layer index cannot exceed number of playable layers',
    );
    return this.playableLayers[this.activeLayerIndex];
  }

  public transitionLayers() {
    if (config.autoSaveCSV) {
      autoSaveToCSV(this.score.levelStats);
    }

    if (this.activeLayerIndex < this.playableLayers.length) {
      const previousLayer: PlayableLayer = this.getActiveLayer();

      // Add the completed layer to the list for progressive audio building
      if (
        this.trackKey_.startsWith('temp_level_') &&
        previousLayer.data.playable &&
        !this.completedLayerIds.includes(previousLayer.data.id)
      ) {
        this.completedLayerIds.push(previousLayer.data.id);

        // Immediately generate programmatic loops for the completed layer
        this.track.generateProgrammaticLoops([previousLayer.data.id]);
      }

      previousLayer.preDelayStop();
      this.removeBackgroundAudio();

      this.activeLayerIndex++;
      const activeIndex: number = this.activeLayerIndex;

      if (this.activeLayerIndex >= this.playableLayers.length) {
        this.score.saveLayerScores();
        previousLayer.postDelayStop();
        this.end();
        return;
      } else {
        // No extra delay needed since programmatic audio is now cached synchronously
        this.scene.time.delayedCall(layerStartTimeDelay, () => {
          // Ensure that layer has not been skipped.
          if (this.activeLayerIndex == activeIndex) {
            this.score.saveLayerScores();
            previousLayer.postDelayStop();
            this.startLayer();
          }
        });
      }
    }
  }

  private stop() {
    this.removeBackgroundAudio();
    this.streak.stop();
  }

  public end() {
    this.stop();
    this.finishCallback();
  }

  public abort() {
    if (config.autoSaveCSV) {
      this.score.saveLayerScores();
      autoSaveToCSV(this.score.levelStats);
    }
    this.stop();
    this.abortCallback();
  }

  public update(time: number) {
    if (this.activeLayerIndex < this.playableLayers.length) {
      this.getActiveLayer().update(time);
    }
  }

  public getAudioLoopTime(): number {
    assert(
      this.activeAudioTracks.length >= 1,
      'Cannot retrieve audio loop time when there are no active audio tracks',
    );
    return this.activeAudioTracks.at(-1)!.duration;
  }
}
