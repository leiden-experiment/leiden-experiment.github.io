/* eslint-disable no-undef */
/* eslint @typescript-eslint/no-var-requires: "off" */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { app, protocol, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// NOTE: Change these file paths if you change the file structure.
const packageJsonPath = '../../package.json';
const electronPreloadPath = 'preload.js';
const appProtocolName = 'app';

const localHostURL = 'http://localhost:3000';

const packageJson = require(path.join(__dirname, packageJsonPath));
const packagedDistRoot = path.join(__dirname, '../../dist');

const capitalize = s => (s && s[0].toUpperCase() + s.slice(1)) || '';

const windowProperties = {
  title: capitalize(packageJson.name), // Use the name property of package.json as there window title.
  aspectRatio: 16 / 9,
  width: 1920,
  height: 1080,
  minWidth: 1280,
  minHeight: 720,
  maximize: true,
  center: true,
  stealFocus: true, // Required otherwise alt-tabbing causes huge desync of audio and visuals.
  openDevTools: false,
};

// At one point this was needed for something but now it seems obsolete.
// Leaving it in case commenting it broke something that will later need to be fixed.
protocol.registerSchemesAsPrivileged([
  {
    scheme: appProtocolName,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: false,
    },
  },
]);

// Let electron reload by itself.
if (
  process.env.ELECTRON_DEBUG === 'true' ||
  process.env.ELECTRON_DEBUG === 'vscode'
) {
  try {
    const electronReload = require('electron-reload');
    electronReload(__dirname, {});
  } catch (error) {
    console.warn('electron-reload is unavailable, skipping hot reload.');
  }
}

let mainWindow = undefined;

function registerAppProtocol() {
  protocol.registerFileProtocol(appProtocolName, (request, callback) => {
    const requestUrl = new URL(request.url);
    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(
      /^\/+/,
      '',
    );
    const resolvedPath = requestedPath === '' ? 'index.html' : requestedPath;
    const executableRoot = path.dirname(app.getPath('exe'));
    const editableRoot = app.isPackaged ? executableRoot : packagedDistRoot;
    const shouldUseEditableRoot =
      resolvedPath.startsWith('data/') ||
      resolvedPath.startsWith('levels/') ||
      resolvedPath.startsWith('csv/');

    const root = shouldUseEditableRoot ? editableRoot : packagedDistRoot;
    const requested = path.resolve(root, resolvedPath);
    if (requested !== root && !requested.startsWith(root + path.sep)) {
      callback({ error: -6 });
      return;
    }
    callback({ path: requested });
  });
}

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: windowProperties.title,
    center: windowProperties.center,
    width: windowProperties.width,
    height: windowProperties.height,
    minWidth: windowProperties.minWidth,
    minHeight: windowProperties.minHeight,
    autoHideMenuBar: true,
    useContentSize: true,
    frame: true,
    icon: path.join(__dirname, '../../dist/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, electronPreloadPath),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // allowRunningInsecureContent: true,
    },
  });
  if (windowProperties.maximize) {
    mainWindow.maximize();
  }

  // Hot reload.
  if (process.env.ELECTRON_HOT === 'true') {
    mainWindow.loadURL(localHostURL);
  } else {
    mainWindow.loadURL(`${appProtocolName}://-/index.html`);
  }

  if (process.env.ELECTRON_DEBUG === 'true' && windowProperties.openDevTools) {
    mainWindow.webContents.openDevTools();
  }

  // Maintain aspect ratio when scaling.
  mainWindow.setAspectRatio(windowProperties.aspectRatio);
  app.focus({ steal: windowProperties.stealFocus });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  registerAppProtocol();
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it is common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('get-app-path', () => {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
});

// All new local study data is written beneath Electron's per-user data directory.
// No renderer-supplied path is accepted by either method.
function safeSegment(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error('Invalid record identifier');
  return value;
}
ipcMain.handle('save-study-record', (_event, data) => {
  if (!data || data.schemaVersion !== 1 || typeof data !== 'object' || JSON.stringify(data).length > 800000)
    throw new Error('Invalid study record');
  const study = safeSegment(data.studyId);
  const participant = safeSegment(data.participantId);
  const session = safeSegment(data.sessionId);
  if (!Number.isInteger(data.assignmentIndex) || data.assignmentIndex < 0 || data.assignmentIndex > 100)
    throw new Error('Invalid assignment index');
  const folder = path.join(app.getPath('userData'), 'studies', study, participant);
  fs.mkdirSync(folder, { recursive: true });
  const filename = `${session}_${data.assignmentIndex}.json`;
  const out = path.join(folder, filename);
  const temp = `${out}.pending`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  fs.renameSync(temp, out);
  return { path: out };
});
ipcMain.handle('store-legacy-csv', (_event, name, data) => {
  const file = `${safeSegment(name)}.csv`;
  if (typeof data !== 'string' || data.length > 5000000) throw new Error('Invalid CSV');
  const folder = path.join(app.getPath('userData'), 'csv');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, file), data, 'utf8');
});

ipcMain.handle('read-study-records', (_event, studyId, participantId) => {
  const folder = path.join(app.getPath('userData'), 'studies', safeSegment(studyId), safeSegment(participantId));
  if (!fs.existsSync(folder)) return [];
  const files = fs.readdirSync(folder).filter(name => /^-?\d+-\d+_\d+\.json$/.test(name)).slice(0, 5000);
  return files.map(name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')));
});
