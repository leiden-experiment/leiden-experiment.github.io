/** Public gameplay options exposed in the study dashboard. Defaults mirror src/data/default_config.json. */
export type GameplayValue = boolean | number;
export interface GameplayOption { key: string; label: string; defaultValue: GameplayValue; help: string; min?: number; max?: number; step?: number }
export const gameplayOptions: GameplayOption[] = [
  { key: 'targetSize', label: 'Target size', defaultValue: 1, help: 'Scale of the targets.', min: 0.1, max: 5, step: .1 },
  { key: 'fingerSize', label: 'Finger size', defaultValue: 1, help: 'Scale of the on-screen fingers.', min: 0.1, max: 5, step: .1 },
  { key: 'showSkipButton', label: 'Show skip button', defaultValue: false, help: 'Let participants skip layers.' },
  { key: 'skipButtonAppearsAfterLoop', label: 'Show skip after loop', defaultValue: 1, help: 'When the skip button becomes available.', min: 0, max: 100, step: 1 },
  { key: 'skipLayersAutomatically', label: 'Automatically advance layers', defaultValue: false, help: 'Advance layers without pressing Skip.' },
  { key: 'skipLayersAutomaticallyAfterLoop', label: 'Advance after loop', defaultValue: 1, help: 'Loops before automatically advancing.', min: 1, max: 100, step: 1 },
  { key: 'ignoreMultifingerPinches', label: 'Ignore multiple-finger pinches', defaultValue: true, help: 'Accept one pinching finger at a time.' },
  { key: 'mousePinchesEnabled', label: 'Enable mouse control', defaultValue: true, help: 'Allow mouse-based pinching.' },
  { key: 'uiPinchesEnabled', label: 'Enable UI pinching', defaultValue: true, help: 'Allow pinching to activate UI controls.' },
  { key: 'sonificationEnabled', label: 'Enable sound feedback', defaultValue: true, help: 'Play notes linked to movement.' },
  { key: 'synchronizationEnabled', label: 'Enable synchronization', defaultValue: false, help: 'Use synchronized playback mode.' },
  { key: 'playableBackingTracksEnabled', label: 'Playable backing tracks', defaultValue: true, help: 'Include playable backing audio.' },
  { key: 'unplayableBackingTracksEnabled', label: 'Other backing tracks', defaultValue: true, help: 'Include non-playable backing audio.' },
  { key: 'disableLayerProgression', label: 'Disable layer progression', defaultValue: false, help: 'Keep the current playable layer.' },
  { key: 'indexFingerOnly', label: 'Index finger only', defaultValue: false, help: 'Use only the index finger.' },
  { key: 'pinchVolume', label: 'Pinch volume', defaultValue: 1, help: 'Volume of played notes.', min: 0, max: 1, step: .05 },
  { key: 'backgroundMusicVolume', label: 'Background volume', defaultValue: 1, help: 'Volume of backing music.', min: 0, max: 1, step: .05 },
  { key: 'onTimeDuration', label: 'On-time window (ms)', defaultValue: 500, help: 'Timing window for an on-time hit.', min: 0, max: 5000, step: 10 },
  { key: 'lateTimeDuration', label: 'Late window (ms)', defaultValue: 500, help: 'Allowed late-hit duration.', min: 0, max: 5000, step: 10 },
  { key: 'enableCameraVisibility', label: 'Show camera video', defaultValue: false, help: 'Show the participant camera feed.' },
  { key: 'cameraOpacity', label: 'Camera opacity', defaultValue: 0, help: 'Camera transparency: 0 hidden, 1 opaque.', min: 0, max: 1, step: .05 },
  { key: 'postProcessingDisabled', label: 'Disable visual postprocessing', defaultValue: false, help: 'Turn off visual effects.' },
  { key: 'displayVisualMetronome', label: 'Visual metronome', defaultValue: true, help: 'Show a metronome in the interface.' },
  { key: 'autoSaveCSV', label: 'Automatically save CSV', defaultValue: true, help: 'Save local CSV results automatically.' },
];
export const gameplayDefaults = Object.fromEntries(gameplayOptions.map(option => [option.key, option.defaultValue])) as Record<string, GameplayValue>;

export function validateGameplayConfig(config: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    const option = gameplayOptions.find(item => item.key === key);
    if (!option) { issues.push(`Unknown gameplay setting: ${key}`); continue; }
    if (typeof option.defaultValue === 'boolean') {
      if (typeof value !== 'boolean') issues.push(`${option.label} must be on or off`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || (option.min !== undefined && value < option.min) || (option.max !== undefined && value > option.max) || (option.step === 1 && !Number.isInteger(value))) {
      issues.push(`${option.label} is outside its allowed range`);
    }
  }
  return issues;
}
