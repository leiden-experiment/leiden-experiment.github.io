/** Repair imported Level Designer levels saved by older Pizzicato versions.
 * Firebase can omit empty arrays; older converters also emitted a separate
 * overlapping target for each note of a simultaneous chord.
 * Never touch the original media-backed levels. */
import { TrackData, PlayableTrackLayerData, ProgrammaticTrackNode } from '../level/trackTypes';

export function restoreDesignerLevel(level: TrackData): TrackData {
  if (!level || !Array.isArray(level.layers) || !Array.isArray(level.bpm)) throw new Error('Invalid published level');
  const isGenerated = level.layers.some(layer => layer.playable &&
    (layer as PlayableTrackLayerData).nodes?.some(node => {
      const generated = node as ProgrammaticTrackNode;
      return !!(generated.programmaticNote || generated.programmaticChord || generated.programmaticSequenceChord);
    }));
  if (!isGenerated) return level;
  // The Editor adds an unplayable 4-bar beat.wav drum loop. Previous universal
  // conversions omitted it, leaving uploaded JSON levels without percussion.
  if (!level.layers.some(layer => layer.id === 'drums')) {
    level.layers.unshift({ id: 'drums', playable: false, lengthInBars: 4, soundLoopKeys: ['beat'] });
  }
  let completed: string[] = [];
  for (const layer of level.layers) {
    layer.soundLoopKeys = layer.soundLoopKeys || [];
    if (!layer.playable) continue;
    const playable = layer as PlayableTrackLayerData;
    playable.backgroundLayers = ['drums', ...completed];
    const groups = new Map<string, ProgrammaticTrackNode[]>();
    for (const node of playable.nodes as ProgrammaticTrackNode[]) {
      const p = node.timePosition;
      const xy = node.normalizedPosition;
      const key = [p.bar, p.step, p.tick, xy[0], xy[1], node.finger].join(':');
      const group = groups.get(key) || [];
      group.push(node);
      groups.set(key, group);
    }
    const merged: ProgrammaticTrackNode[] = [];
    for (const group of groups.values()) {
      // Only merge nodes whose original sounds are simultaneous, independently
      // generated notes/chords. Do not squash intentional note sequences.
      if (group.length <= 1 || group.some(node =>
        !node.programmaticNote && !node.programmaticChord)) {
        merged.push(...group);
        continue;
      }
      const first = group[0];
      const pitches = group.flatMap(node => node.programmaticChord?.pitches ||
        (node.programmaticNote ? [node.programmaticNote.pitch] : []));
      const duration = Math.max(...group.map(node => node.programmaticNote?.duration || node.programmaticChord!.duration));
      const volume = Math.min(0.8, 0.8 / Math.sqrt(pitches.length));
      merged.push({ finger: first.finger, timePosition: first.timePosition,
        normalizedPosition: first.normalizedPosition, soundKey: first.soundKey,
        programmaticChord: { pitches, duration, volume } });
    }
    playable.nodes = merged;
    playable.progressCount = Math.min(playable.progressCount, merged.length);
    completed.push(layer.id);
  }
  return level;
}
