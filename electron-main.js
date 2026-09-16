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

// ── Start Express server IN-PROCESS ─────────────────────────
async function startServer() {
  try {
    const { startServer } = require('./server.js');
    serverInstance = await startServer(SERVER_PORT);
    console.log('Express server running on port', SERVER_PORT);
  } catch (err) {
    console.error('Server failed, starting fallback:', err);
    const express = require('express');
    const srv = express();
    srv.use(express.static(path.join(__dirname, 'public')));
    serverInstance = srv.listen(SERVER_PORT, '0.0.0.0');
  }
}

function getIconPath() {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, 'build-resources', name);
}

// ── Window ──────────────────────────────────────────────────
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
      webviewTag: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // CRITICAL FIX: Only reload the app for MAIN FRAME failures.
  // Without this check, iframe failures reload the whole app → blank reset.
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // Ignore iframe failures — let them handle themselves
    console.error('Main frame load failed:', errorCode, errorDesc);
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    }, 1000);
  });

  // Prevent the main window from being navigated away by link clicks inside iframes
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow the initial load to localhost
    if (url.startsWith(`http://localhost:${SERVER_PORT}`)) return;
    // Block everything else — navigation should happen in iframes
    event.preventDefault();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${SERVER_PORT}`)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ────────────────────────────────────────────────────
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

// ── IPC ─────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('select-download-path', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('get-platform', () => process.platform);

// ── Lifecycle ───────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  await startServer();
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
