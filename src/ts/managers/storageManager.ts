import { ConfigData, LevelStats } from '../core/interfaces';
import { levelStatsToCSV } from '../util/csvFormat';
import { csvFileExtension } from '../core/config';
import FileSaver from 'file-saver';
import { getStudySession } from '../study/runtime';

export let defaultConfig: ConfigData;
export let config: ConfigData;

export function updateConfig(
  data: ConfigData,
  announceInConsole: boolean = true,
) {
  config = structuredClone(data);
  if (announceInConsole) {
    console.info('INFO: Config set to:');
    console.info(config);
  }
}

export function updateDefaultConfig(data: ConfigData) {
  defaultConfig = data;
  console.info('INFO: Default config set to:');
  console.info(defaultConfig);
}

export function updateConfigValue(key: keyof ConfigData, value: unknown) {
  config[key] = value;
}

export function saveToCSV(data: LevelStats) {
  const blob = new Blob([levelStatsToCSV(data)], {
    type: 'text/plain;charset=utf-8',
  });
  FileSaver.saveAs(blob, data.id + csvFileExtension);
  saveCSV(data.id, levelStatsToCSV(data));
}

export function autoSaveToCSV(data: LevelStats) {
  const isElectronRenderer = typeof window.electron !== 'undefined';
  const isLocalBuild = isElectronRenderer;
  if (isLocalBuild) {
    saveCSV(data.id, levelStatsToCSV(data));
  }
  // Study records are submitted only on full level completion (scoreboard).
  // Partial statistics must never advance a participant's study progression.
  if (getStudySession()) return;
}

export function saveCSV(fileName: string, csv: string): void {
  if (!window?.electron?.storeCSV) return;
  // Keep the legacy CSV name and format; save under Electron userData/csv.
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  void window.electron.storeCSV(safeName, csv).catch(console.error);
}
