import {
  PlayableTrackLayerData,
  SongTimePosition,
  TrackData,
  TrackLayerData,
  ProgrammaticTrackNode,
} from '../level/trackTypes';
import HandScene from '../scenes/handScene';
import { absPath, assert } from '../core/common';
import { AudioTrack, Scene, SoundConfig } from '../core/phaserTypes';
import {
  levelDir,
  levelJsonFileName,
  minuteInMilliseconds,
  soundFileExtension,
  ticksPerBar,
  undefinedText,
} from '../core/config';
import { config } from '../managers/storageManager';
import { NoteGenerator } from '../util/noteGenerator';
import { restoreDesignerLevel } from '../util/restoreDesignerLevel';

export class Track {
  public data: TrackData;
  public scene: Scene;

  private readonly trackKey: string = undefinedText;
  private trackDir?: string;

  // Default placeholders until bpm is set.
  private bpm: number = 0;
  private beatLength_: number = 1;

  // Note generator for programmatic notes
  private noteGenerator: NoteGenerator = new NoteGenerator();


  constructor(scene: Scene, trackKey: string) {
    this.scene = scene;
    this.trackKey = trackKey;
    this.trackDir = levelDir + this.trackKey + '/';

    // Check if this is a temporary level (already in cache)
    if (this.scene.cache.json.exists(trackKey)) {
      // Data is already loaded in cache, no need to load from file
      this.data = this.scene.cache.json.get(trackKey);
    } else if (trackKey.startsWith('temp_level_')) {
      // This is a temporary level but data isn't in cache yet
      // Don't try to load from file system
    } else {
      // Load from file as usual for regular levels
      this.scene.load.json(
        this.trackKey,
        absPath(this.trackDir + levelJsonFileName),
      );
    }
  }

  public get beatLength() {
    return this.beatLength_;
  }

  public setBPM(bpmIndex: number) {
    assert(this.data != undefined, 'preload JSON before setting BPM');
    assert(bpmIndex < this.data.bpm.length, 'BPM index out of range');
    this.bpm = this.data.bpm[bpmIndex];

    const ticksPerBeat: number =
      ticksPerBar / this.data.timeSignatureDenominator;

    this.beatLength_ = this.songTimePositionToTime({
      bar: 1,
      step: 1 + ticksPerBeat,
      tick: 0,
    });
  }

  public getBPM() {
    assert(this.data != undefined, 'preload JSON before retrieving BPM');
    assert(this.bpm != 0, 'Track BPM has not been set');
    return this.bpm;
  }

  // Preloads all the notes in levelDir/<trackKey>/<layer_id>/<soundKey>.<soundFileExtension>
  // or generates programmatic notes
  private preloadNotes() {
    assert(this.trackDir != undefined, 'Preload track before preloading notes');
    this.forEachLayer(undefined, (layer: PlayableTrackLayerData) => {
      // If layer has nodes, preload all the node sounds.
      const l = layer as PlayableTrackLayerData;
      l.nodes.forEach((node, _nodeIndex) => {
        const soundKey: string = this.getSoundKey(layer, node.soundKey);

        // Check if this is a programmatic note, chord, or sequence chord
        const programmaticNode = node as ProgrammaticTrackNode;
        if (programmaticNode.programmaticSequenceChord) {
          // Generate programmatic sequence chord
          this.noteGenerator.createPhaserSequenceChordSource(
            this.scene,
            soundKey,
            programmaticNode.programmaticSequenceChord,
          );
        } else if (programmaticNode.programmaticChord) {
          // Generate programmatic chord
          this.noteGenerator.createPhaserChordSource(
            this.scene,
            soundKey,
            programmaticNode.programmaticChord,
          );
        } else if (programmaticNode.programmaticNote) {
          // Generate programmatic note
          this.noteGenerator.createPhaserAudioSource(
            this.scene,
            soundKey,
            programmaticNode.programmaticNote,
          );
        } else {
          // Load traditional audio file
          const soundPath: string =
            this.trackDir + layer.id + '/' + node.soundKey + soundFileExtension;
          if (
            !this.scene.cache.audio.exists(soundKey) &&
            node.soundKey !== ''
          ) {
            this.scene.load.audio(soundKey, absPath(soundPath));
          }
        }
      });
    });
  }

  private unloadNotes() {
    this.forEachLayer(undefined, (layer: PlayableTrackLayerData) => {
      const l = layer as PlayableTrackLayerData;
      l.nodes.forEach((node, _nodeIndex) => {
        this.scene.cache.audio.remove(this.getSoundKey(layer, node.soundKey));
      });
    });
  }

  // Preloads all the audio loop track in levelDir/<trackKey>/<layer_id>/<soundKey>.<soundFileExtension>
  private preloadLoops() {
    this.forEachLayer((layer: TrackLayerData) => {
      // Realtime Database omits zero-length arrays when it serializes JSON.
      // A generated-only layer legitimately has no recorded backing loops.
      const loopKeys = layer.soundLoopKeys || [];
      if (!layer.soundLoopKeys && !(layer.playable &&
          (layer as PlayableTrackLayerData).nodes?.every(node =>
            !!(node as ProgrammaticTrackNode).programmaticNote ||
            !!(node as ProgrammaticTrackNode).programmaticChord ||
            !!(node as ProgrammaticTrackNode).programmaticSequenceChord))) {
        throw new Error(`Missing audio loops in recorded layer ${layer.id}`);
      }
      if (loopKeys.length === 0) {
        return;
      }

      if (this.trackKey.startsWith('temp_level_') && layer.id === 'drums') return;
      loopKeys.forEach(loopKey => {
        const soundKey = this.getSoundKey(layer, loopKey);
        if (!this.scene.cache.audio.exists(soundKey) && loopKey !== '') {
          const soundPath = this.trackDir + layer.id + '/' + loopKey + soundFileExtension;
          this.scene.load.audio(soundKey, absPath(soundPath));
        }
      });
    });
  }

  private unloadLoops() {
    this.forEachLayer((layer: TrackLayerData) => {
      (layer.soundLoopKeys || []).forEach(loopKey => {
        this.scene.cache.audio.remove(this.getSoundKey(layer, loopKey));
      });
    });
  }

  public getSoundKey(layer: TrackLayerData, soundKey: string): string {
    assert(soundKey != undefined);
    return this.trackKey + '/' + layer.id + '/' + soundKey;
  }

  // layerCallback is called first for all layers.
  // playableLayerCallback is called after layerCallback for each layer with the playable property set to true.
  public forEachLayer(
    layerCallback?: (layer: TrackLayerData, index: number) => void,
    playableLayerCallback?: (
      playableLayer: PlayableTrackLayerData,
      index: number,
    ) => void,
  ) {
    assert(this.data != undefined, 'JSON has not finished preloading');
    // Ensures playable layers get indexes starting from 0.
    let unplayableIndexOffset: number = 0;
    this.data.layers.forEach((layer, index) => {
      if (!layer.playable) {
        unplayableIndexOffset++;
      }
      layerCallback?.(layer, index);
      if (layer.playable) {
        const l = layer as PlayableTrackLayerData;
        playableLayerCallback?.(l, index - unplayableIndexOffset);
      }
    });
  }

  public addBackgroundAudioTracks(
    scene: HandScene,
    soundConfig: SoundConfig,
    bpmIndex: number,
    predicate?: (layer: TrackLayerData, index: number) => boolean,
  ): AudioTrack[] {
    const audioTracks: AudioTrack[] = [];
    this.forEachLayer((layer: TrackLayerData, index: number) => {
      if (predicate == undefined || predicate(layer, index)) {
        if (
          (layer.playable && config.playableBackingTracksEnabled) ||
          (!layer.playable && config.unplayableBackingTracksEnabled)
        ) {
          // The Level Editor uses its bundled 4-bar beat.wav loop, recorded at
          // 90 BPM. Tempo-adjust it instead of looking for nonexistent MP3s.
          if (this.trackKey.startsWith('temp_level_') && layer.id === 'drums') {
            if (scene.cache.audio.exists('designerDrumBeat')) {
              const drums = scene.sound.add('designerDrumBeat', soundConfig);
              drums.setRate(this.data.bpm[bpmIndex] / 90);
              drums.setVolume(0.3);
              audioTracks.push(drums);
            }
            return;
          }
          // Missing/empty soundLoopKeys denotes generated backing audio.
          if (!(layer.soundLoopKeys || []).length) {
            // For programmatic layers, try to find generated loop audio
            if (bpmIndex < this.data.bpm.length) {
              const loopKey = `loop${this.data.bpm[bpmIndex]}`;
              const soundKey = this.getSoundKey(layer, loopKey);

              if (scene.cache.audio.exists(soundKey)) {
                audioTracks.push(scene.sound.add(soundKey, soundConfig));
              }
            }
            return;
          }

          assert(
            bpmIndex < layer.soundLoopKeys.length,
            'BPM index out of range of layer sound loop keys',
          );
          const soundKey = this.getSoundKey(
            layer,
            layer.soundLoopKeys[bpmIndex],
          );

          // Only add audio track if the sound exists in cache
          if (scene.cache.audio.exists(soundKey)) {
            audioTracks.push(scene.sound.add(soundKey, soundConfig));
          }
        }
      }
    });
    return audioTracks;
  }

  /**
   * Convert time in seconds into a SongTimePosition object.
   * @param time time in milliseconds from song start to convert.
   * @return a new SongTimePosition object.
   */
  timeToSongTimePosition(time: number): SongTimePosition {
    assert(this.bpm != 0, 'set BPM before retrieving song times');
    const beats = time / (minuteInMilliseconds / this.bpm);
    // Designer note times are in MIDI quarter-note beats. The denominator
    // changes measure length, not the duration of a quarter note.
    const beatsPerBar = this.data.timeSignatureNumerator * 4 / this.data.timeSignatureDenominator;
    const bar = Math.floor(beats / beatsPerBar) + 1;
    const beatsInBar = beats - (bar - 1) * beatsPerBar;
    const steps = beatsInBar * 4;
    const step = Math.floor(steps + 1e-8) + 1;
    const tick = Math.round((steps - Math.floor(steps + 1e-8)) * this.data.timeBasePPQ / 4);
    return { bar, step, tick };
  }

  /**
   * Convert a SongTimePosition object into time in seconds.
   * @param position, a SongTimePosition instance to convert
   * @return time in milliseconds.
   */
  songTimePositionToTime(position: SongTimePosition): number {
    assert(this.bpm != 0, 'set BPM before retrieving song times');
    const beatsPerBar = this.data.timeSignatureNumerator * 4 / this.data.timeSignatureDenominator;
    const beats = (position.bar - 1) * beatsPerBar +
      (position.step - 1) / 4 +
      position.tick / this.data.timeBasePPQ;
    const time = beats * (minuteInMilliseconds / this.bpm);
    return time;
  }

  public preload(scene: HandScene) {
    this.scene = scene;

    // Only try to get data from cache if we don't already have it
    if (!this.data) {
      this.data = this.scene.cache.json.get(this.trackKey);
    }

    // For temporary levels, provide more helpful error message
    if (this.data == undefined) {
      if (this.trackKey.startsWith('temp_level_')) {
        throw new Error(
          `Temporary level ${this.trackKey} data not found in cache. Make sure to call overrideTrackDataLoading first.`,
        );
      } else {
        throw new Error(
          `Failed to retrieve JSON for track ${this.trackKey}. Make sure the level file exists.`,
        );
      }
    }
    if (this.trackKey.startsWith('temp_level_')) restoreDesignerLevel(this.data);
    this.parseJson();
    this.preloadLoops();
    this.preloadNotes();

  }

  public unload() {
    this.unloadLoops();
    this.unloadNotes();
    if (this.trackKey.startsWith('temp_level_')) {
      this.forEachLayer(layer => {
        if (layer.playable) {
          for (const bpm of this.data.bpm) {
            this.scene.cache.audio.remove(this.getSoundKey(layer, `loop${bpm}`));
          }
        }
      });
    }
  }

  /**
   * Generate loop audio for programmatic layers that don't have pre-recorded loop files
   */
  public generateProgrammaticLoops(layerIds: string[]) {
    layerIds.forEach(layerId => {
      const layer = this.data.layers.find(l => l.id === layerId);
      if (!layer || !layer.playable) return;

      const playableLayer = layer as PlayableTrackLayerData;

      // Check if this layer has programmatic nodes
      const hasProgrammaticNodes = playableLayer.nodes.some(node => {
        const programmaticNode = node as ProgrammaticTrackNode;
        return (
          programmaticNode.programmaticChord ||
          programmaticNode.programmaticSequenceChord ||
          programmaticNode.programmaticNote
        );
      });

      if (!hasProgrammaticNodes) return;

      // Generate only the tempo currently selected by the player.
      const soundKey = this.getSoundKey(layer, `loop${this.bpm}`);
      if (!this.scene.cache.audio.exists(soundKey)) {
        this.generateLayerLoop(playableLayer, this.bpm, soundKey);
      }
    });
  }

  /**
   * Generate a looping audio track for a programmatic layer
   */
  private generateLayerLoop(
    layer: PlayableTrackLayerData,
    bpm: number,
    soundKey: string,
  ) {
    const duration =
      this.songTimePositionToTime({
        bar: layer.lengthInBars + 1,
        step: 1,
        tick: 0,
      }) / 1000; // Include the final bar; convert to seconds

    // Create a sequence of all notes in the layer
    const noteSequence: Array<{ time: number; node: ProgrammaticTrackNode }> =
      [];

    layer.nodes.forEach(node => {
      const programmaticNode = node as ProgrammaticTrackNode;
      if (
        programmaticNode.programmaticChord ||
        programmaticNode.programmaticSequenceChord ||
        programmaticNode.programmaticNote
      ) {
        const nodeTime =
          this.songTimePositionToTime({
            bar: node.timePosition.bar,
            step: node.timePosition.step || 1,
            tick: node.timePosition.tick || 0,
          }) / 1000; // Convert to seconds

        noteSequence.push({ time: nodeTime, node: programmaticNode });
      }
    });

    // Generate the loop audio
    const durationScale = this.data.bpm[0] / bpm;
    this.noteGenerator.createLayerLoop(
      this.scene,
      soundKey,
      noteSequence.map(({ time, node }) => ({
        time,
        node: {
          ...node,
          programmaticNote: node.programmaticNote && {
            ...node.programmaticNote,
            duration: node.programmaticNote.duration * durationScale,
          },
          programmaticChord: node.programmaticChord && {
            ...node.programmaticChord,
            duration: node.programmaticChord.duration * durationScale,
          },
          programmaticSequenceChord: node.programmaticSequenceChord && {
            ...node.programmaticSequenceChord,
            totalDuration: node.programmaticSequenceChord.totalDuration * durationScale,
            notes: node.programmaticSequenceChord.notes.map(note => ({
              ...note,
              startTime: note.startTime * durationScale,
              duration: note.duration * durationScale,
            })),
          },
        },
      })),
      duration,
      bpm,
    );
  }

  private parseJson() {
    this.setTimePositionDefaults();
    this.sortNodes();
  }

  private setTimePositionDefaults() {
    this.forEachLayer(undefined, (layer: PlayableTrackLayerData) => {
      const setDefaults = (
        timePosition: SongTimePosition,
        barDefault: number,
        stepDefault: number,
        tickDefault: number,
      ) => {
        if (!timePosition.bar) timePosition.bar = barDefault;
        if (!timePosition.step) timePosition.step = stepDefault;
        if (!timePosition.tick) timePosition.tick = tickDefault;
      };

      assert(
        layer.progressCount <= layer.nodes.length,
        "Progress count threshold for layer '" +
          layer.id +
          "' of track '" +
          this.trackKey +
          "' cannot be higher than the node count.",
      );

      // Preview time is not a time position, hence bar and step set to 0.
      setDefaults(layer.previewTime, 0, 0, 0);

      layer.nodes.forEach(node => {
        // For time positions, 1 and 1 for bar and step are more human readable.
        // Tick range starts from 0.
        setDefaults(node.timePosition, 1, 1, 0);
      });
    });
  }

  private sortNodes() {
    this.forEachLayer(undefined, (layer: PlayableTrackLayerData) => {
      layer.nodes.sort((a, b) => {
        // Compare bars
        if (a.timePosition.bar !== b.timePosition.bar)
          return a.timePosition.bar - b.timePosition.bar;
        // Bars are equal, compare steps
        if (a.timePosition.step !== b.timePosition.step)
          return a.timePosition.step - b.timePosition.step;
        // Steps are equal, compare ticks
        return a.timePosition.tick - b.timePosition.tick;
      });
    });
  }
}
