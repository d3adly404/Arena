/* ═══════════════════════════════════════════════════════════════
   NOVASE BROWSER — Electron Main Process
   ═══════════════════════════════════════════════════════════════ */

process.env.ELECTRON = 'true';

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow = null;
let serverInstance = null;
const SERVER_PORT = 3847;
const isDev = !app.isPackaged;

// ── Single Instance Lock ────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── Start the Express server IN-PROCESS ─────────────────────
// This is the key fix: require() instead of spawn() so deps resolve from asar
async function startServer() {
  try {
    const { startServer } = require('./server.js');
    serverInstance = await startServer(SERVER_PORT);
    console.log('Express server started on port', SERVER_PORT);
  } catch (err) {
    console.error('Failed to start embedded server:', err);
    // Fallback: start a minimal static server
    const express = require('express');
    const srv = express();
    srv.use(express.static(path.join(__dirname, 'public')));
    serverInstance = srv.listen(SERVER_PORT, '0.0.0.0', () => {
      console.log('Fallback static server on port', SERVER_PORT);
    });
  }
}

// ── Get icon path ───────────────────────────────────────────
function getIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, 'build-resources', iconName);
}

// ── Create the main window ──────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a1a',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Retry if page fails to load (server might not be ready yet)
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('Page load failed:', errorCode, errorDesc, '— retrying in 1s...');
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    }, 1000);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Application menu ────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Novase',
      submenu: [
        { label: 'About Novase', click: () => showAbout() },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('open-settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'maximize' }, { role: 'close' }] },
    { label: 'Help', submenu: [{ label: 'Learn More', click: () => shell.openExternal('https://github.com/d3adly404/Arena') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendToRenderer(channel, ...args) {
  if (mainWindow?.webContents) mainWindow.webContents.send(channel, ...args);
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'About Novase',
    message: 'Novase Browser v1.0.0',
    detail: 'A modern browser with built-in games, media downloading, and multi-engine search.\n\nBrowse. Play. Download.',
    icon: getIconPath(),
  });
}

// ── IPC Handlers ────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('select-download-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'], title: 'Choose download folder',
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('get-platform', () => process.platform);

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();

  // Start server FIRST, then create window
  await startServer();

  // Small safety delay for the server to be fully ready
  setTimeout(() => createWindow(), 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverInstance?.close) serverInstance.close();
});
