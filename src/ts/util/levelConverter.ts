/**
 * Converts Level Designer project JSON to the same TrackData shape used by
 * the original MP4/audio-based levels. Both formats then use the same player.
 * Time values in Designer files are musical beats, not milliseconds.
 */
import { TrackData, PlayableTrackLayerData, ProgrammaticTrackNode, SongTimePosition } from '../level/trackTypes';

type JsonRecord = Record<string, unknown>;

interface DesignerNote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity?: number;
  type?: string;
  finger?: number | string | null;
  position?: { x?: number | null; y?: number | null; assigned?: boolean } | null;
  supportNotes?: Array<string | { id?: string }>;
  triggerNote?: string | { id?: string } | null;
}
interface DesignerTrack { name: string; notes: DesignerNote[] }
interface DesignerMusic { bpm: number; numerator: number; denominator: number; tracks: DesignerTrack[] }
interface DesignerLevel { name: string; music: DesignerMusic }

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function validNote(value: unknown): value is DesignerNote {
  return record(value) && typeof value.id === 'string' &&
    typeof value.pitch === 'number' && Number.isInteger(value.pitch) && value.pitch >= 0 && value.pitch <= 127 &&
    typeof value.startTime === 'number' && Number.isFinite(value.startTime) && value.startTime >= 0 &&
    positiveNumber(value.duration);
}

function normalize(data: unknown): DesignerLevel {
  if (!record(data) || !record(data.project) || typeof data.project.name !== 'string' ||
      !record(data.music) || !positiveNumber(data.music.bpm)) {
    throw new Error('Expected a Level Designer JSON with project.name and music.bpm.');
  }
  const music = data.music;
  let numerator = 4;
  let denominator = 4;
  if (typeof music.timeSignature === 'string') {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(music.timeSignature);
    if (!match) throw new Error('Invalid time signature. Use a string such as "4/4".');
    numerator = Number(match[1]);
    denominator = Number(match[2]);
  } else if (record(music.timeSignature)) {
    numerator = Number(music.timeSignature.numerator);
    denominator = Number(music.timeSignature.denominator);
  }
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > 32 ||
      ![1, 2, 4, 8, 16, 32].includes(denominator)) {
    throw new Error('Invalid time signature numerator or denominator.');
  }
  const tracks: DesignerTrack[] = [];
  if (Array.isArray(music.tracks)) {
    music.tracks.forEach((track, index) => {
      if (record(track) && Array.isArray(track.notes)) {
        tracks.push({ name: String(track.name || `Track ${index + 1}`), notes: track.notes });
      }
    });
  } else if (record(music.tracks)) {
    // Current Level Designer exporter uses { "Chords": [note, ...], ... }.
    Object.entries(music.tracks).forEach(([name, value]) => {
      if (Array.isArray(value)) tracks.push({ name, notes: value });
      else if (record(value) && Array.isArray(value.notes)) tracks.push({ name, notes: value.notes });
    });
  }
  if (tracks.length === 0) throw new Error('No tracks were found in the Level Designer JSON.');
  for (const track of tracks) {
    if (!track.notes.every(validNote)) {
      throw new Error(`Track "${track.name}" contains invalid notes (pitch, ID, startTime or duration).`);
    }
  }
  if (!tracks.some(track => track.notes.length > 0)) throw new Error('The level contains no notes.');
  return { name: data.project.name, music: { bpm: Number(music.bpm), numerator, denominator, tracks } };
}

function positionToSongTime(beats: number, numerator: number, denominator: number): SongTimePosition {
  // A step is 1/16 of a whole note; PPQ is 96. Preserve sub-step timing.
  const ticks = Math.round(beats * 96);
  const ticksInBar = numerator * 4 / denominator * 96;
  const ticksInStep = 96 / 4;
  const bar = Math.floor(ticks / ticksInBar) + 1;
  const remaining = ticks % ticksInBar;
  const step = Math.floor(remaining / ticksInStep) + 1;
  const tick = Math.round(remaining % ticksInStep);
  return { bar, step, tick };
}
function fingerName(finger: DesignerNote['finger']): string {
  if (typeof finger === 'string' && ['index', 'middle', 'ring', 'pinky'].includes(finger)) return finger;
  return ['index', 'middle', 'ring', 'pinky'][typeof finger === 'number' && finger >= 1 && finger <= 4 ? finger - 1 : 0];
}
function coordinate(note: DesignerNote, index: number): [number, number] {
  const pos = note.position;
  if (pos && typeof pos.x === 'number' && Number.isFinite(pos.x) &&
      typeof pos.y === 'number' && Number.isFinite(pos.y)) {
    return [Math.max(0.05, Math.min(0.95, pos.x)), Math.max(0.05, Math.min(0.95, pos.y))];
  }
  // Unplaced notes should be playable too; use stable, spaced fallback targets.
  return [0.25 + (index % 3) * 0.25, 0.3 + (Math.floor(index / 3) % 2) * 0.4];
}
function isChordTrack(name: string): boolean {
  return /chd|chord|harmony|accomp/i.test(name);
}
function noteReference(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (record(value) && typeof value.id === 'string') return value.id;
  return null;
}

export class LevelConverter {
  static validateOriginalFormat(value: unknown): boolean {
    try { normalize(value); return true; } catch { return false; }
  }

  static convert(value: unknown): TrackData {
    const { name, music } = normalize(value);
    const bpm = Math.max(40, Math.min(200, music.bpm));
    const orderedTracks = [...music.tracks].sort((a, b) =>
      Number(isChordTrack(b.name)) - Number(isChordTrack(a.name)));
    const layers: TrackData['layers'] = [];
    const usedIds = new Set<string>();
    const getId = (name: string, index: number): string => {
      const stem = (name.replace(/[^a-z0-9_-]/gi, '_') || `track_${index}`).slice(0, 60);
      let result = stem; let suffix = 2;
      while (usedIds.has(result)) result = `${stem}_${suffix++}`;
      usedIds.add(result); return result;
    };
    // Match the Level Editor: a shared four-bar drum loop plays behind every
    // generated layer. Legacy MP3 levels continue using their own drum tracks.
    layers.push({ id: 'drums', playable: false, lengthInBars: 4, soundLoopKeys: ['beat'] });
    orderedTracks.forEach((track, index) => {
      if (!track.notes.length) return;
      const id = getId(track.name, index);
      const byId = new Map(track.notes.map(n => [n.id, n]));
      const claimed = new Set<string>();
      const groups: DesignerNote[][] = [];
      const attachAtTime = (notes: DesignerNote[], time: number) => {
        // Match Level Editor grouping: simultaneous trigger notes form ONE
        // target/chord rather than stacked targets in the same position.
        const existing = groups.find(group => Math.abs(group[0].startTime - time) <= 0.1);
        if (existing) existing.push(...notes);
        else groups.push([...notes]);
      };
      for (const trigger of track.notes.filter(n => n.type === 'trigger')) {
        if (claimed.has(trigger.id)) continue;
        const group = [trigger]; claimed.add(trigger.id);
        for (const reference of trigger.supportNotes || []) {
          const support = byId.get(noteReference(reference) || '');
          if (support && !claimed.has(support.id)) { group.push(support); claimed.add(support.id); }
        }
        // Some exports link support -> trigger instead of trigger -> support.
        for (const support of track.notes) {
          if (!claimed.has(support.id) && noteReference(support.triggerNote) === trigger.id) {
            group.push(support); claimed.add(support.id);
          }
        }
        attachAtTime(group, trigger.startTime);
      }
      for (const note of track.notes) {
        if (claimed.has(note.id)) continue;
        attachAtTime([note], note.startTime);
        claimed.add(note.id);
      }
      groups.sort((a, b) => a[0].startTime - b[0].startTime);
      const nodes: ProgrammaticTrackNode[] = groups.map((group, groupIndex) => {
        const sorted = [...group].sort((a, b) => a.startTime - b.startTime);
        const primary = group.find(n => n.type === 'trigger') || group[0];
        const start = Math.min(...sorted.map(n => n.startTime));
        const end = Math.max(...sorted.map(n => n.startTime + n.duration));
        const toSeconds = 60 / bpm;
        const node: ProgrammaticTrackNode = {
          finger: fingerName(primary.finger),
          timePosition: positionToSongTime(start, music.numerator, music.denominator),
          normalizedPosition: coordinate(primary, groupIndex),
          soundKey: `generated_${index}_${groupIndex}`,
        };
        const volume = Math.min(0.8, 0.8 / Math.sqrt(group.length));
        if (sorted.some(n => Math.abs(n.startTime - start) > 0.001)) {
          node.programmaticSequenceChord = {
            notes: sorted.map(n => ({ pitch: n.pitch, startTime: (n.startTime - start) * toSeconds, duration: n.duration * toSeconds })),
            totalDuration: (end - start) * toSeconds,
            volume,
          };
        } else if (sorted.length > 1) {
          node.programmaticChord = { pitches: sorted.map(n => n.pitch), duration: (end - start) * toSeconds, volume };
        } else {
          node.programmaticNote = { pitch: primary.pitch, duration: primary.duration * toSeconds, volume };
        }
        return node;
      });
      const endBeat = Math.max(...track.notes.map(n => n.startTime + n.duration));
      const lengthInBars = Math.max(1, Math.ceil(endBeat / (music.numerator * 4 / music.denominator)));
      const backgroundLayers = layers.map(layer => layer.id);
      const layer: PlayableTrackLayerData = {
        id, playable: true, progressCount: Math.min(3, nodes.length),
        lengthInBars, previewTime: { bar: 2, step: 1, tick: 0 },
        spriteKeyOuter: 'targetOuter', spriteKeyInner: 'targetInner',
        soundLoopKeys: [], backgroundLayers, nodes,
      };
      layers.push(layer);
    });
    if (!layers.length) throw new Error('No playable tracks found.');
    return {
      id: `designer_${Date.now()}`,
      displayName: name,
      backgroundType: 'default',
      bpm: [bpm, Math.round(bpm * 1.25), Math.round(bpm * 1.5)],
      timeSignatureNumerator: music.numerator,
      timeSignatureDenominator: music.denominator,
      timeBasePPQ: 96,
      layers,
    };
  }

  static generateTempLevelKey(): string {
    return `temp_level_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
