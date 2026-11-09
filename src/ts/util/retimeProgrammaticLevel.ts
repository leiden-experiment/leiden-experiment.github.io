import { TrackData, ProgrammaticTrackNode, PlayableTrackLayerData } from '../level/trackTypes';

/** Re-time generated samples when the Level Settings BPM changes. */
export function retimeProgrammaticLevel(level: TrackData, newBaseBpm: number): void {
  const oldBaseBpm = level.bpm[0];
  if (!Number.isFinite(oldBaseBpm) || oldBaseBpm <= 0 ||
      !Number.isFinite(newBaseBpm) || newBaseBpm <= 0) {
    throw new Error('BPM must be a positive number.');
  }
  const ratio = oldBaseBpm / newBaseBpm;
  for (const layer of level.layers) {
    if (!layer.playable) continue;
    const nodes = (layer as PlayableTrackLayerData).nodes as ProgrammaticTrackNode[];
    for (const node of nodes) {
      if (node.programmaticNote) node.programmaticNote.duration *= ratio;
      if (node.programmaticChord) node.programmaticChord.duration *= ratio;
      if (node.programmaticSequenceChord) {
        node.programmaticSequenceChord.totalDuration *= ratio;
        node.programmaticSequenceChord.notes.forEach(note => {
          note.startTime *= ratio;
          note.duration *= ratio;
        });
      }
    }
  }
  level.bpm = [newBaseBpm, Math.round(newBaseBpm * 1.25), Math.round(newBaseBpm * 1.5)];
}
