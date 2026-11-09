/**
 * Programmatic note generator for creating audio from pitch and duration
 * Now uses piano sampler instead of synthesizer for more realistic sound
 */

import { PianoSampler } from './pianoSampler';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface NoteDefinition {
  pitch: number; // MIDI note number (0-127)
  duration: number; // Duration in seconds
  volume?: number; // Volume (0-1), defaults to 0.7
}

export interface ProgrammaticNote {
  soundKey: string; // Unique key for the generated sound
  noteDefinition: NoteDefinition;
}

export interface ChordDefinition {
  pitches: number[]; // Array of MIDI note numbers
  duration: number; // Duration in seconds
  volume?: number; // Volume (0-1), defaults to 0.7
}

export interface SequenceChordDefinition {
  notes: Array<{
    pitch: number;
    startTime: number; // Relative to sequence start (in seconds)
    duration: number; // Duration in seconds
  }>;
  totalDuration: number; // Total duration of the sequence in seconds
  volume?: number; // Volume (0-1), defaults to 0.7
}

export class NoteGenerator {
  private audioContext: AudioContext | null = null;
  private generatedNotes: Map<string, AudioBuffer> = new Map();
  private pianoSampler: PianoSampler;

  constructor() {
    // Initialize audio context when first needed
    this.pianoSampler = new PianoSampler();
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported in this browser');
      }
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  /**
   * Generate a sequence chord audio buffer from multiple notes with timing using piano sampler
   */
  private generateSequenceChordBuffer(
    sequenceDefinition: SequenceChordDefinition,
  ): AudioBuffer {
    // Validate inputs
    if (sequenceDefinition.notes.length === 0) {
      throw new Error('Sequence chord must have at least one note');
    }
    if (sequenceDefinition.totalDuration <= 0) {
      throw new Error(
        `Invalid total duration: ${sequenceDefinition.totalDuration}. Must be > 0.`,
      );
    }
    if (
      sequenceDefinition.volume !== undefined &&
      (sequenceDefinition.volume < 0 || sequenceDefinition.volume > 1)
    ) {
      throw new Error(
        `Invalid volume: ${sequenceDefinition.volume}. Must be 0-1.`,
      );
    }

    const audioContext = this.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const totalDuration = sequenceDefinition.totalDuration;
    const volume = sequenceDefinition.volume || 0.7;

    const bufferSize = Math.floor(sampleRate * totalDuration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Initialize the buffer with silence
    for (let i = 0; i < bufferSize; i++) {
      data[i] = 0;
    }

    // Generate each note in the sequence using piano sampler
    for (const note of sequenceDefinition.notes) {
      // Create individual note buffer using piano sampler
      const noteBuffer = this.pianoSampler.createNoteBuffer(
        note.pitch,
        note.duration,
        volume,
      );

      const noteData = noteBuffer.getChannelData(0);
      const startSample = Math.floor(note.startTime * sampleRate);
      const noteLength = Math.min(noteData.length, bufferSize - startSample);

      // Mix the note into the sequence buffer
      for (let i = 0; i < noteLength; i++) {
        const sampleIndex = startSample + i;
        if (sampleIndex >= 0 && sampleIndex < bufferSize) {
          data[sampleIndex] += noteData[i];
        }
      }
    }

    // Normalize the mixed signal to prevent clipping
    let maxSample = 0;
    for (let i = 0; i < bufferSize; i++) {
      const absValue = Math.abs(data[i]);
      if (absValue > maxSample) {
        maxSample = absValue;
      }
    }
    if (maxSample > 0.8) {
      const normalizationFactor = 0.8 / maxSample; // Keep some headroom
      for (let i = 0; i < bufferSize; i++) {
        data[i] *= normalizationFactor;
      }
    }

    return buffer;
  }

  /**
   * Generate a chord audio buffer from multiple pitches using piano sampler
   */
  private generateChordBuffer(chordDefinition: ChordDefinition): AudioBuffer {
    // Validate inputs
    if (chordDefinition.pitches.length === 0) {
      throw new Error('Chord must have at least one pitch');
    }
    for (const pitch of chordDefinition.pitches) {
      if (pitch < 0 || pitch > 127) {
        throw new Error(`Invalid MIDI pitch: ${pitch}. Must be 0-127.`);
      }
    }
    if (chordDefinition.duration <= 0) {
      throw new Error(
        `Invalid duration: ${chordDefinition.duration}. Must be > 0.`,
      );
    }
    if (
      chordDefinition.volume !== undefined &&
      (chordDefinition.volume < 0 || chordDefinition.volume > 1)
    ) {
      throw new Error(
        `Invalid volume: ${chordDefinition.volume}. Must be 0-1.`,
      );
    }

    const volume = chordDefinition.volume || 0.7;

    // Use piano sampler to create the chord buffer
    return this.pianoSampler.createChordBuffer(
      chordDefinition.pitches,
      chordDefinition.duration,
      volume,
    );
  }

  /**
   * Generate a single note audio buffer using piano sampler
   */
  private generateNoteBuffer(noteDefinition: NoteDefinition): AudioBuffer {
    // Validate inputs
    if (noteDefinition.pitch < 0 || noteDefinition.pitch > 127) {
      throw new Error(
        `Invalid MIDI pitch: ${noteDefinition.pitch}. Must be 0-127.`,
      );
    }
    if (noteDefinition.duration <= 0) {
      throw new Error(
        `Invalid duration: ${noteDefinition.duration}. Must be > 0.`,
      );
    }
    if (
      noteDefinition.volume !== undefined &&
      (noteDefinition.volume < 0 || noteDefinition.volume > 1)
    ) {
      throw new Error(`Invalid volume: ${noteDefinition.volume}. Must be 0-1.`);
    }

    const volume = noteDefinition.volume || 0.7;

    // Use piano sampler to create the note buffer
    return this.pianoSampler.createNoteBuffer(
      noteDefinition.pitch,
      noteDefinition.duration,
      volume,
    );
  }

  /**
   * Generate a looping audio buffer from a sequence of programmatic notes/chords
   */
  private generateSequenceLoop(
    noteSequence: Array<{ time: number; node: unknown }>,
    duration: number,
    _bpm: number,
  ): AudioBuffer {
    const audioContext = this.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Initialize the buffer with silence
    for (let i = 0; i < bufferSize; i++) {
      data[i] = 0;
    }

    // Add each note/chord to the sequence
    noteSequence.forEach(({ time, node }) => {
      const startSample = Math.floor(time * sampleRate);

      const nodeTyped = node as {
        programmaticChord?: ChordDefinition;
        programmaticNote?: NoteDefinition;
        programmaticSequenceChord?: SequenceChordDefinition;
      };
      if (nodeTyped.programmaticChord) {
        // Generate chord and mix it into the buffer
        const chordBuffer = this.generateChordBuffer(
          nodeTyped.programmaticChord,
        );
        const chordData = chordBuffer.getChannelData(0);
        const chordLength = Math.min(
          chordData.length,
          bufferSize - startSample,
        );

        for (let i = 0; i < chordLength; i++) {
          if (startSample + i < bufferSize) {
            data[startSample + i] += chordData[i] * 0.5; // Reduce volume to prevent clipping
          }
        }
      } else if (nodeTyped.programmaticSequenceChord) {
        const sequenceBuffer = this.generateSequenceChordBuffer(nodeTyped.programmaticSequenceChord);
        const sequenceData = sequenceBuffer.getChannelData(0);
        const length = Math.min(sequenceData.length, bufferSize - startSample);
        for (let i = 0; i < length; i++) {
          if (startSample + i >= 0 && startSample + i < bufferSize) {
            data[startSample + i] += sequenceData[i] * 0.5;
          }
        }
      } else if (nodeTyped.programmaticNote) {
        // Generate single note and mix it into the buffer
        const noteBuffer = this.generateNoteBuffer(nodeTyped.programmaticNote);
        const noteData = noteBuffer.getChannelData(0);
        const noteLength = Math.min(noteData.length, bufferSize - startSample);

        for (let i = 0; i < noteLength; i++) {
          if (startSample + i < bufferSize) {
            data[startSample + i] += noteData[i] * 0.5; // Reduce volume to prevent clipping
          }
        }
      }
    });

    // Normalize the final mix to prevent clipping
    let maxSample = 0;
    for (let i = 0; i < bufferSize; i++) {
      const absValue = Math.abs(data[i]);
      if (absValue > maxSample) {
        maxSample = absValue;
      }
    }
    if (maxSample > 0) {
      const normalizationFactor = 0.8 / maxSample; // Keep some headroom
      for (let i = 0; i < bufferSize; i++) {
        data[i] *= normalizationFactor;
      }
    }

    return buffer;
  }

  /**
   * Convert MIDI note number to frequency
   */
  private midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Generate and cache a note
   */
  public generateNote(
    soundKey: string,
    noteDefinition: NoteDefinition,
  ): AudioBuffer {
    if (this.generatedNotes.has(soundKey)) {
      return this.generatedNotes.get(soundKey)!;
    }

    const buffer = this.generateNoteBuffer(noteDefinition);
    this.generatedNotes.set(soundKey, buffer);
    return buffer;
  }

  /**
   * Generate and cache a chord
   */
  public generateChord(
    soundKey: string,
    chordDefinition: ChordDefinition,
  ): AudioBuffer {
    if (this.generatedNotes.has(soundKey)) {
      return this.generatedNotes.get(soundKey)!;
    }

    const buffer = this.generateChordBuffer(chordDefinition);
    this.generatedNotes.set(soundKey, buffer);
    return buffer;
  }

  /**
   * Generate multiple notes at once
   */
  public generateNotes(notes: ProgrammaticNote[]): Map<string, AudioBuffer> {
    const buffers = new Map<string, AudioBuffer>();

    for (const note of notes) {
      const buffer = this.generateNote(note.soundKey, note.noteDefinition);
      buffers.set(note.soundKey, buffer);
    }

    return buffers;
  }

  /**
   * Create a Phaser-compatible audio source from generated buffer
   */
  public createPhaserAudioSource(
    scene: Phaser.Scene,
    soundKey: string,
    noteDefinition: NoteDefinition,
  ): void {
    try {
      if (!scene.cache.audio.exists(soundKey)) {
        const buffer = this.generateNote(soundKey, noteDefinition);
        scene.cache.audio.add(soundKey, buffer);
      }
    } catch (error) {
      console.error(
        `Failed to create programmatic audio for ${soundKey}:`,
        error,
      );
      // Fallback: try to load a silent audio file or skip this note
    }
  }

  /**
   * Create a Phaser-compatible audio source from generated chord buffer
   */
  public createPhaserChordSource(
    scene: Phaser.Scene,
    soundKey: string,
    chordDefinition: ChordDefinition,
  ): void {
    try {
      if (!scene.cache.audio.exists(soundKey)) {
        const buffer = this.generateChord(soundKey, chordDefinition);
        scene.cache.audio.add(soundKey, buffer);
      }
    } catch (error) {
      console.error(
        `Failed to create programmatic chord for ${soundKey}:`,
        error,
      );
      // Fallback: try to load a silent audio file or skip this chord
    }
  }

  /**
   * Create a Phaser-compatible audio source from generated sequence chord buffer
   */
  public createPhaserSequenceChordSource(
    scene: Phaser.Scene,
    soundKey: string,
    sequenceDefinition: SequenceChordDefinition,
  ): void {
    try {
      if (!scene.cache.audio.exists(soundKey)) {
        const buffer = this.generateSequenceChordBuffer(sequenceDefinition);
        scene.cache.audio.add(soundKey, buffer);
      }
    } catch (error) {
      console.error(
        `Failed to create programmatic sequence chord for ${soundKey}:`,
        error,
      );
      // Fallback: try to load a silent audio file or skip this sequence
    }
  }

  /**
   * Create a looping audio track from a sequence of programmatic notes/chords
   */
  public createLayerLoop(
    scene: Phaser.Scene,
    soundKey: string,
    noteSequence: Array<{ time: number; node: unknown }>,
    duration: number,
    bpm: number,
  ): void {
    try {
      const buffer = this.generateSequenceLoop(noteSequence, duration, bpm);

      // Directly add to Phaser cache instead of using async loading
      scene.cache.audio.add(soundKey, buffer);
    } catch (error) {
      console.error(
        `Failed to create programmatic loop for ${soundKey}:`,
        error,
      );
    }
  }

  /**
   * Convert AudioBuffer to WAV format
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Convert float samples to 16-bit PCM
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }

    return arrayBuffer;
  }

  /**
   * Get common note names for MIDI numbers
   */
  public static getNoteName(midiNote: number): string {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    return `${notes[noteIndex]}${octave}`;
  }

  /**
   * Common MIDI note numbers for reference
   */
  public static readonly midiNotes = {
    c4: 60,
    c4Sharp: 61,
    d4: 62,
    d4Sharp: 63,
    e4: 64,
    f4: 65,
    f4Sharp: 66,
    g4: 67,
    g4Sharp: 68,
    a4: 69, // Concert pitch
    a4Sharp: 70,
    b4: 71,
    c5: 72,
    // Bass notes
    c3: 48,
    d3: 50,
    e3: 52,
    f3: 53,
    g3: 55,
    a3: 57,
    b3: 59,
  };

  /**
   * Common chord definitions
   */
  public static readonly commonChords = {
    cMajor: [60, 64, 67], // C-E-G
    cMinor: [60, 63, 67], // C-Eb-G
    dMajor: [62, 66, 69], // D-F#-A
    dMinor: [62, 65, 69], // D-F-A
    eMajor: [64, 68, 71], // E-G#-B
    eMinor: [64, 67, 71], // E-G-B
    fMajor: [65, 69, 72], // F-A-C
    fMinor: [65, 68, 72], // F-Ab-C
    gMajor: [67, 71, 74], // G-B-D
    gMinor: [67, 70, 74], // G-Bb-D
    aMajor: [69, 73, 76], // A-C#-E
    aMinor: [69, 72, 76], // A-C-E
    bMajor: [71, 75, 78], // B-D#-F#
    bMinor: [71, 74, 78], // B-D-F#
    // Seventh chords
    cMajor7: [60, 64, 67, 71], // C-E-G-B
    cMinor7: [60, 63, 67, 70], // C-Eb-G-Bb
    cDominant7: [60, 64, 67, 70], // C-E-G-Bb
  };

  /**
   * Clear piano sampler cache to free memory
   */
  public clearSamplerCache(): void {
    this.pianoSampler.clearCache();
  }

  /**
   * Get piano sampler memory usage information
   */
  public getSamplerMemoryInfo(): {
    sampleCount: number;
    estimatedSizeKB: number;
  } {
    return this.pianoSampler.getMemoryInfo();
  }
}
