export interface IElectronAPI {
  initVariables: () => Promise<void>;
  getAppPath: () => string;
  saveStudyRecord: (record: import('../ts/study/types').ResultEnvelope) => Promise<{ path: string }>;
  readStudyRecords: (studyId: string, participantId: string) => Promise<import('../ts/study/types').ResultEnvelope[]>;
  storeCSV: (name: string, text: string) => Promise<void>;
  isDebugMode: () => boolean;

}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
