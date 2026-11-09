/** Preload all participant-assigned shared JSON levels before gameplay starts.
 * Assets remain in this tab's memory only. No participant results are downloaded. */
import { StudySettings, StudyStep, isLevelStep, isSelectionStep, normalizeStudyWeeks } from './types';
import { TrackData, PlayableTrackLayerData } from '../level/trackTypes';
import { studyApi } from './firebaseClient';
import { restoreDesignerLevel } from '../util/restoreDesignerLevel';

export function assignedLibraryLevelIds(settings: StudySettings): string[] {
  const ids = new Set<string>();
  const add = (levelId: string) => {
    if (levelId.startsWith('library:')) ids.add(levelId.slice('library:'.length));
  };
  for (const steps of Object.values(normalizeStudyWeeks(settings.weeks))) {
    for (const step of steps as StudyStep[]) {
      if (isLevelStep(step)) add(step.levelId);
      else if (isSelectionStep(step)) step.choices.forEach(choice => add(choice.levelId));
    }
  }
  return [...ids];
}

export function restoredPublishedTrack(data: unknown): TrackData {
  const track = JSON.parse(JSON.stringify(data)) as TrackData;
  if (!track || !Array.isArray(track.bpm) || !Array.isArray(track.layers)) throw new Error('Invalid published level');
  // Firebase Realtime Database strips empty arrays during serialization.
  track.layers.forEach(layer => {
    if (!layer.soundLoopKeys && layer.playable) layer.soundLoopKeys = [];
    if (layer.playable) {
      const playable = layer as PlayableTrackLayerData;
      if (!playable.backgroundLayers) playable.backgroundLayers = [];
    }
  });
  return restoreDesignerLevel(track);
}

/** Stable Phaser audio keys allow pre-generated samples to be reused across plays. */
export function studyTrackKey(id: string) { return `temp_level_library_${id}`; }
export function studyTrackKeyForBpm(id: string, bpm: number) { return `${studyTrackKey(id)}_bpm_${bpm}`; }

/** Each explicitly selected tempo is synthesized once at initial loading. */
export function assignedLibraryBpms(settings: StudySettings, id: string): number[] {
  const tempos = new Set<number>();
  const add = (a: { levelId: string; bpm?: number }) => {
    if (a.levelId === `library:${id}` && Number.isInteger(a.bpm) && a.bpm! >= 60 && a.bpm! <= 200) tempos.add(a.bpm!);
  };
  for (const steps of Object.values(normalizeStudyWeeks(settings.weeks))) for (const step of steps) {
    if (isLevelStep(step)) add(step);
    else if (isSelectionStep(step)) step.choices.forEach(add);
  }
  return [...tempos];
}
export function isStudyTrackKey(key: string) { return key.startsWith('temp_level_library_'); }

export async function preloadAssignedLevels(
  settings: StudySettings,
  notify: (done: number, total: number, levelName?: string) => void = () => {},
  concurrency = 3
): Promise<Record<string, TrackData>> {
  const ids = assignedLibraryLevelIds(settings);
  const levels: Record<string, TrackData> = {};
  let cursor = 0, completed = 0;
  notify(0, ids.length);
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const { level } = await studyApi.getLevel(id);
        levels[id] = restoredPublishedTrack(level.data);
        // Prefer the researcher-assigned shared-library display name in the participant menu.
        if (typeof level.name === 'string' && level.name.trim()) levels[id].displayName = level.name.trim();
      } catch (error) {
        throw new Error(`Could not download study level ${id}. Check your connection and ask a researcher to confirm the level is published. ${error instanceof Error ? error.message : String(error)}`);
      }
      notify(++completed, ids.length, levels[id].displayName || 'Unnamed level');
    }
  }
  await Promise.all(Array.from({ length: Math.min(ids.length, Math.max(1, concurrency)) }, () => worker()));
  return levels;
}
