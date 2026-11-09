/* eslint-disable no-undef */
/* eslint @typescript-eslint/no-var-requires: "off" */
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', async () => {
  // ...
});

let appPath = process.cwd();

contextBridge.exposeInMainWorld('electron', {
  initVariables: () => {
    return new Promise((resolve, reject) => {
      ipcRenderer
        .invoke('get-app-path')
        .then(appPathResult => {
          appPath = appPathResult;
          resolve(true);
        })
        .catch(err => {
          reject(err);
        });
    });
  },
  getAppPath: () => appPath,
  isDebugMode: () => {
    return process.env.ELECTRON_DEBUG === 'true';
  },
  saveStudyRecord: record => ipcRenderer.invoke('save-study-record', record),
  readStudyRecords: (studyId, participantId) => ipcRenderer.invoke('read-study-records', studyId, participantId),
  storeCSV: (name, text) => ipcRenderer.invoke('store-legacy-csv', name, text),
});

