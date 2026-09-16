/* ═══════════════════════════════════════════════════════════════
   NOVASE BROWSER — Electron Main Process
   ═══════════════════════════════════════════════════════════════ */

const { app, BrowserWindow, Menu, shell, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');

// ── Keep a global reference to prevent garbage collection ───
let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3847; // Unique port for embedded server
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

// ── Start the embedded Express server ───────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(__dirname, 'server.js');

    serverProcess = spawn(process.execPath, [serverScript], {
      env: { ...process.env, PORT: SERVER_PORT, ELECTRON: 'true' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    serverProcess.stdout.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Novase Browser is running')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server error: ${data}`);
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    // Timeout fallback
    setTimeout(resolve, 3000);
  });
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

  // Load the app
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App icon path ───────────────────────────────────────────
function getIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, 'build-resources', iconName);
}

// ── Build application menu ──────────────────────────────────
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
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'maximize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/d3adly404/Arena'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Novase',
    message: 'Novase Browser v1.0.0',
    detail: 'A modern browser with built-in games, media downloading, and multi-engine search.\n\nBrowse. Play. Download.',
    icon: getIconPath(),
  });
}

// ── IPC Handlers (window controls from renderer) ────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('select-download-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose download folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-platform', () => process.platform);

// ── App Lifecycle ───────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();

  try {
    await startServer();
  } catch (err) {
    console.error('Server failed to start:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Kill the embedded server
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
