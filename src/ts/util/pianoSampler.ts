/**
 * Piano sampler for playing realistic piano sounds from samples
 */

export interface PianoSample {
  midiNote: number;
  audioBuffer: AudioBuffer;
  sampleRate: number;
}

export class PianoSampler {
  private audioContext: AudioContext | null = null;
  private samples: Map<number, PianoSample> = new Map();
  private loadedSamples: Set<number> = new Set();
  private baseSampleRate = 44100;

  constructor() {
    // Initialize audio context when first needed
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
   * Generate a simple piano-like sample for a given MIDI note
   * This creates a more realistic piano sound than the previous synthesizer approach
   */
  private generatePianoSample(midiNote: number, duration: number = 2.0): PianoSample {
    const audioContext = this.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const frequency = this.midiToFrequency(midiNote);
    
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate a more realistic piano sound with multiple harmonics and decay
    for (let i = 0; i < bufferSize; i++) {
      const time = i / sampleRate;
      let sample = 0;

      // Piano has rich harmonic content with slight inharmonicity
      // Adjust harmonic content based on pitch range for more realistic sound
      let harmonics;
      if (midiNote >= 72) {
        // High notes - much fewer harmonics, very soft to reduce harshness
        harmonics = [
          { freq: 1.0, amp: 1.0 },      // Fundamental
          { freq: 2.0, amp: 0.12 },     // Second harmonic (much reduced)
          { freq: 3.0, amp: 0.04 },     // Third harmonic (much reduced)
          { freq: 4.0, amp: 0.015 },    // Fourth harmonic (minimal)
          { freq: 5.0, amp: 0.006 },    // Fifth harmonic (minimal)
        ];
      } else if (midiNote >= 48) {
        // Mid range - balanced harmonics
        harmonics = [
          { freq: 1.0, amp: 1.0 },      // Fundamental
          { freq: 2.0, amp: 0.5 },      // Second harmonic
          { freq: 3.0, amp: 0.25 },     // Third harmonic
          { freq: 4.0, amp: 0.15 },     // Fourth harmonic
          { freq: 5.0, amp: 0.1 },      // Fifth harmonic
          { freq: 6.0, amp: 0.06 },     // Sixth harmonic
        ];
      } else {
        // Low notes - rich harmonics
        harmonics = [
          { freq: 1.0, amp: 1.0 },      // Fundamental
          { freq: 2.0, amp: 0.6 },      // Second harmonic
          { freq: 3.0, amp: 0.35 },     // Third harmonic
          { freq: 4.0, amp: 0.2 },      // Fourth harmonic
          { freq: 5.0, amp: 0.15 },     // Fifth harmonic
          { freq: 6.0, amp: 0.1 },      // Sixth harmonic
          { freq: 7.0, amp: 0.08 },     // Seventh harmonic
          { freq: 8.0, amp: 0.06 },     // Eighth harmonic
        ];
      }

      for (const harmonic of harmonics) {
        // Add slight inharmonicity - higher harmonics are slightly sharp
        const inharmonicity = 1 + (harmonic.freq - 1) * 0.0005;
        const harmonicFreq = frequency * harmonic.freq * inharmonicity;
        
        if (harmonicFreq < sampleRate / 2) {
          sample += harmonic.amp * Math.sin(2 * Math.PI * harmonicFreq * time);
        }
      }

      // Apply realistic piano envelope with hammer strike simulation
      const envelope = this.getPianoEnvelope(time, duration, midiNote);
      
      // Add subtle noise for hammer strike attack - adjust based on pitch
      let noiseLevel = 0;
      if (time < 0.01) {
        const baseNoise = (Math.random() - 0.5) * 0.05;
        if (midiNote >= 72) {
          // High notes - much less noise to reduce harshness
          noiseLevel = baseNoise * 0.2;
        } else if (midiNote >= 48) {
          // Mid notes - moderate noise
          noiseLevel = baseNoise * 0.8;
        } else {
          // Low notes - more noise for warmth
          noiseLevel = baseNoise;
        }
      }
      
      // Apply gentle low-pass filtering for warmth
      const filteredSample = this.applyPianoFilter(sample, frequency, time);

      // Additional softening for high notes to reduce harshness
      let finalSample = (filteredSample + noiseLevel) * envelope;
      if (midiNote >= 72) {
        // Apply additional gentle smoothing for high notes
        finalSample *= 0.8; // Reduce overall amplitude
        // Apply gentle compression to reduce peaks
        if (Math.abs(finalSample) > 0.5) {
          finalSample = Math.sign(finalSample) * (0.5 + (Math.abs(finalSample) - 0.5) * 0.3);
        }
      }

      data[i] = finalSample;
    }

    // Apply subtle reverb for realism
    this.applyPianoReverb(data, sampleRate, duration);

    // Normalize the sample
    let maxSample = 0;
    for (let i = 0; i < bufferSize; i++) {
      const absValue = Math.abs(data[i]);
      if (absValue > maxSample) {
        maxSample = absValue;
      }
    }
    if (maxSample > 0) {
      const normalizationFactor = 0.8 / maxSample;
      for (let i = 0; i < bufferSize; i++) {
        data[i] *= normalizationFactor;
      }
    }

    return {
      midiNote,
      audioBuffer: buffer,
      sampleRate: sampleRate
    };
  }

  /**
   * Get a piano sample for a given MIDI note, generating it if not already cached
   */
  public getSample(midiNote: number): PianoSample {
    if (!this.samples.has(midiNote)) {
      // Generate a new piano sample
      const sample = this.generatePianoSample(midiNote);
      this.samples.set(midiNote, sample);
    }
    return this.samples.get(midiNote)!;
  }

  /**
   * Play a piano note with optional pitch shifting and duration
   */
  public playNote(
    midiNote: number, 
    startTime: number = 0, 
    duration: number = 2.0,
    volume: number = 0.7,
    pitchShift: number = 0
  ): AudioBufferSourceNode | null {
    try {
      const audioContext = this.getAudioContext();
      const sample = this.getSample(midiNote);
      
      // Create a source node
      const source = audioContext.createBufferSource();
      source.buffer = sample.audioBuffer;
      
      // Apply pitch shifting if needed
      if (pitchShift !== 0) {
        const pitchRatio = Math.pow(2, pitchShift / 12);
        source.playbackRate.value = pitchRatio;
      }
      
      // Set volume
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volume;
      
      // Connect audio graph
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Play the note
      source.start(startTime);
      
      // Stop after duration
      if (duration > 0) {
        source.stop(startTime + duration);
      }
      
      return source;
    } catch (error) {
      console.error('Failed to play piano note:', error);
      return null;
    }
  }

  /**
   * Create an AudioBuffer for a note with specified duration
   */
  public createNoteBuffer(midiNote: number, duration: number, volume: number = 0.7): AudioBuffer {
    const audioContext = this.getAudioContext();
    const sample = this.getSample(midiNote);
    const sampleRate = audioContext.sampleRate;
    
    // If the requested duration is longer than the sample, we'll need to extend it
    const sourceDuration = sample.audioBuffer.duration;
    const targetDuration = Math.max(duration, sourceDuration);
    
    const bufferSize = Math.floor(sampleRate * targetDuration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    const sourceData = sample.audioBuffer.getChannelData(0);
    
    // Copy the source data and apply volume
    for (let i = 0; i < Math.min(sourceData.length, bufferSize); i++) {
      data[i] = sourceData[i] * volume;
    }
    
    // If we need to extend the duration, fade out the end
    if (targetDuration > sourceDuration) {
      const fadeStart = Math.floor(sourceDuration * sampleRate);
      const fadeLength = Math.floor(0.5 * sampleRate); // 0.5 second fade
      
      for (let i = fadeStart; i < Math.min(bufferSize, fadeStart + fadeLength); i++) {
        const fadeProgress = (i - fadeStart) / fadeLength;
        const fadeMultiplier = Math.pow(1 - fadeProgress, 2); // Exponential fade
        data[i] *= fadeMultiplier;
      }
      
      // Fill the rest with silence
      for (let i = fadeStart + fadeLength; i < bufferSize; i++) {
        data[i] = 0;
      }
    }
    
    return buffer;
  }

  /**
   * Create an AudioBuffer for a chord
   */
  public createChordBuffer(
    midiNotes: number[], 
    duration: number, 
    volume: number = 0.7
  ): AudioBuffer {
    const audioContext = this.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Initialize with silence
    for (let i = 0; i < bufferSize; i++) {
      data[i] = 0;
    }
    
    // Mix all notes together
    for (const midiNote of midiNotes) {
      const noteBuffer = this.createNoteBuffer(midiNote, duration, volume);
      const noteData = noteBuffer.getChannelData(0);
      
      for (let i = 0; i < Math.min(noteData.length, bufferSize); i++) {
        data[i] += noteData[i];
      }
    }
    
    // Normalize to prevent clipping
    let maxSample = 0;
    for (let i = 0; i < bufferSize; i++) {
      const absValue = Math.abs(data[i]);
      if (absValue > maxSample) {
        maxSample = absValue;
      }
    }
    if (maxSample > 0.8) {
      const normalizationFactor = 0.8 / maxSample;
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
   * Get realistic piano envelope with hammer strike characteristics
   */
  private getPianoEnvelope(time: number, duration: number, midiNote: number): number {
    // Adjust decay characteristics based on pitch range
    let noteDecayFactor, sustainLevel, attackTime, decayTime, releaseTime;
    
    if (midiNote >= 72) {
      // High notes - much gentler attack and decay to reduce harshness
      noteDecayFactor = 0.9; // Much less aggressive decay
      sustainLevel = 0.5; // Lower sustain level for softer sound
      attackTime = 0.008; // Slower attack to reduce sharpness
      decayTime = Math.min(0.6, duration * 0.4); // Much longer decay
      releaseTime = Math.min(1.2, duration * 0.6); // Very long release for smooth fade
    } else if (midiNote >= 48) {
      // Mid range - balanced
      noteDecayFactor = 0.7;
      sustainLevel = 0.6;
      attackTime = 0.005;
      decayTime = Math.min(0.3, duration * 0.4);
      releaseTime = Math.min(0.5, duration * 0.3);
    } else {
      // Low notes - faster decay (natural for bass)
      noteDecayFactor = 0.6;
      sustainLevel = 0.5;
      attackTime = 0.008;
      decayTime = Math.min(0.2, duration * 0.5);
      releaseTime = Math.min(0.3, duration * 0.2);
    }
    
    const sustainTime = duration - attackTime - decayTime - releaseTime;
    
    if (time < attackTime) {
      // Very fast exponential attack (hammer strike)
      const progress = time / attackTime;
      return Math.pow(progress, 0.2);
    } else if (time < attackTime + decayTime) {
      // Fast decay after hammer strike
      const progress = (time - attackTime) / decayTime;
      return 1.0 - (1.0 - sustainLevel) * Math.pow(progress, 1.2); // Gentler decay curve
    } else if (time < attackTime + decayTime + sustainTime) {
      // Sustain phase - add slight decay for realism
      const sustainProgress = (time - attackTime - decayTime) / sustainTime;
      return sustainLevel * (1 - sustainProgress * 0.1); // Very gentle sustain decay
    } else {
      // Natural decay - smoother curve
      const releaseProgress = (time - attackTime - decayTime - sustainTime) / releaseTime;
      return (sustainLevel * 0.9) * Math.pow(1 - releaseProgress, 1.8); // Smoother release
    }
  }

  /**
   * Apply piano-specific filtering for warmth and character
   */
  private applyPianoFilter(sample: number, frequency: number, time: number): number {
    // Apply different filtering based on frequency range
    let cutoffRatio, filterStrength;
    
    if (frequency > 1000) {
      // High frequencies - much more aggressive filtering to reduce harshness
      cutoffRatio = Math.max(0.4, 1 - frequency / 4000); // More aggressive cutoff
      filterStrength = 0.25; // Much stronger filtering for high notes
    } else if (frequency > 400) {
      // Mid frequencies - balanced filtering
      cutoffRatio = Math.max(0.5, 1 - frequency / 4000);
      filterStrength = 0.12;
    } else {
      // Low frequencies - more filtering for warmth
      cutoffRatio = Math.max(0.3, 1 - frequency / 2000);
      filterStrength = 0.18;
    }
    
    // Apply subtle filtering for warmth
    return sample * (1 - filterStrength) + sample * cutoffRatio * filterStrength;
  }

  /**
   * Apply subtle reverb effect for piano realism
   */
  private applyPianoReverb(data: Float32Array, sampleRate: number, duration: number): void {
    // Multiple delay taps for more realistic reverb
    const delays = [
      { time: 0.03, feedback: 0.3, wet: 0.08 }, // Short delay
      { time: 0.08, feedback: 0.2, wet: 0.12 }, // Medium delay
      { time: 0.15, feedback: 0.15, wet: 0.06 }, // Long delay
    ];
    
    for (const delay of delays) {
      const delaySamples = Math.floor(sampleRate * delay.time);
      
      if (data.length > delaySamples) {
        for (let i = delaySamples; i < data.length; i++) {
          const delayedSample = data[i - delaySamples] * delay.feedback;
          data[i] = data[i] * (1 - delay.wet) + delayedSample * delay.wet;
        }
      }
    }
  }

  /**
   * Clear all cached samples to free memory
   */
  public clearCache(): void {
    this.samples.clear();
    this.loadedSamples.clear();
  }

  /**
   * Get memory usage information
   */
  public getMemoryInfo(): { sampleCount: number; estimatedSizeKB: number } {
    let totalSamples = 0;
    for (const sample of this.samples.values()) {
      totalSamples += sample.audioBuffer.length;
    }
    
    return {
      sampleCount: this.samples.size,
      estimatedSizeKB: Math.round(totalSamples * 4 / 1024) // 4 bytes per float32 sample
    };
  }
}
