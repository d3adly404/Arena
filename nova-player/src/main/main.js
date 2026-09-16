'use strict';

const { app, BrowserWindow, Menu, dialog, globalShortcut, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'Nova Player';
const APP_ID = 'com.d3adly404.nova-player';
const MAX_RECENT = 25;
const MAX_SCAN_FILES = 10000;
const MAX_SCAN_DEPTH = 6;

const VIDEO_EXTS = [
  '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv',
  '.mpg', '.mpeg', '.m2ts', '.mts', '.3gp', '.ogv', '.asf', '.vob'
];
const AUDIO_EXTS = [
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.oga', '.opus', '.m4a',
  '.m4b', '.wma', '.mid', '.midi', '.aiff', '.aif', '.amr'
];
const MEDIA_EXTS = new Set([...VIDEO_EXTS, ...AUDIO_EXTS]);
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '$recycle.bin', 'system volume information', 'appdata', '.trash'
]);

let win = null;

// ---------------------------------------------------------------------------
// Persistent state (window bounds, playback prefs, last playlist, recents)
// ---------------------------------------------------------------------------

function stateFile() {
  return path.join(app.getPath('userData'), 'state.json');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function saveState(patch) {
  if (!patch || typeof patch !== 'object') return;
  try {
    const next = { ...loadState(), ...patch };
    for (const k of Object.keys(next)) {
      if (next[k] === undefined) delete next[k];
    }
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    const tmp = stateFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, stateFile());
  } catch (err) {
    console.error('[state] save failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Folder scanning
// ---------------------------------------------------------------------------

function scanDir(dir, depth, out) {
  if (depth < 0 || out.length >= MAX_SCAN_FILES) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_SCAN_FILES) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue;
      scanDir(full, depth - 1, out);
    } else if (MEDIA_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
}

function mediaFilters() {
  return [
    { name: 'Video & Audio', extensions: [...VIDEO_EXTS, ...AUDIO_EXTS] },
    { name: 'Video', extensions: VIDEO_EXTS },
    { name: 'Audio', extensions: AUDIO_EXTS },
    { name: 'All files', extensions: ['*'] }
  ];
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function getWin() {
  return win && !win.isDestroyed() ? win : null;
}

function createWindow() {
  const st = loadState();
  let bounds;
  if (st.window && typeof st.window === 'object' && st.window.width) {
    const display = screen.getDisplayMatching(st.window);
    const wa = display.workArea;
    const b = st.window;
    bounds = {
      x: Math.min(Math.max(b.x, wa.x - b.width + 120), Math.max(wa.x, wa.x + wa.width - 120)),
      y: Math.min(Math.max(b.y, wa.y - 40), Math.max(wa.y, wa.y + wa.height - 120)),
      width: Math.max(960, b.width),
      height: Math.max(560, b.height)
    };
  }

  win = new BrowserWindow(Object.assign({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 560,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    show: false,
    title: APP_NAME,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  }, bounds));

  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });
  win.webContents.once('did-finish-load', () => sendWindowState());
  win.on('maximize', () => sendWindowState());
  win.on('unmaximize', () => sendWindowState());
  win.on('closed', () => {
    win = null;
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function sendWindowState() {
  const w = getWin();
  if (w) {
    w.webContents.send('window:state', {
      maximized: w.isMaximized(),
      fullscreen: w.isFullScreen()
    });
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function send(action) {
  const w = getWin();
  if (w) w.webContents.send('menu:action', action);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Files…', accelerator: 'CmdOrCtrl+O', click: () => send('openFiles') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('openFolder') },
        { type: 'separator' },
        { label: 'Import Playlist…', accelerator: 'CmdOrCtrl+I', click: () => send('importPlaylist') },
        { label: 'Export Playlist…', accelerator: 'CmdOrCtrl+E', click: () => send('exportPlaylist') },
        { type: 'separator' },
        {
          label: isMac ? 'Close Window' : 'Exit',
          accelerator: isMac ? 'CmdOrCtrl+W' : undefined,
          click: () => { const w = getWin(); if (w) w.close(); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Full Screen', accelerator: 'F11', click: () => send('toggleFullScreen') },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [] : [{ role: 'close' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(getWin(), {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: APP_NAME,
              detail:
                `Version ${app.getVersion()}\n` +
                'A lightweight video & audio player.\n\n' +
                'Video: MP4 · MKV · WebM · MOV · AVI and more\n' +
                'Audio: MP3 · FLAC · AAC · OGG · WAV and more\n\n' +
                'Playback uses the Windows codec stack via Chromium.'
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Global media keys (hardware play/pause/next/prev buttons on keyboards)
// ---------------------------------------------------------------------------

function registerMediaKeys() {
  const map = {
    MediaPlayPause: 'play-pause',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'prev',
    MediaStop: 'stop'
  };
  for (const [key, action] of Object.entries(map)) {
    try {
      if (!globalShortcut.isRegistered(key)) {
        globalShortcut.register(key, () => {
          const w = getWin();
          if (w) w.webContents.send('shortcut', action);
        });
      }
    } catch (err) {
      console.warn(`[mediakeys] ${key} unavailable:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('files:open', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Open media files',
      properties: ['openFile', 'multiSelections'],
      filters: mediaFilters()
    });
    return res.canceled ? [] : res.filePaths;
  });

  ipcMain.handle('folder:open', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Open folder',
      properties: ['openDirectory']
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const dir = res.filePaths[0];
    const files = [];
    scanDir(dir, MAX_SCAN_DEPTH, files);
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return { dir, files };
  });

  ipcMain.handle('playlist:import', async (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(w, {
      title: 'Import playlist',
      properties: ['openFile'],
      filters: [
        { name: 'Playlists', extensions: ['m3u8', 'm3u', 'pls', 'txt', 'lst'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths[0]) return [];
    let text = '';
    try {
      text = fs.readFileSync(res.filePaths[0], 'utf8');
    } catch {
      return [];
    }
    const found = new Set();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue;
      if (MEDIA_EXTS.has(path.extname(line).toLowerCase()) && fs.existsSync(line)) {
        found.add(line);
      }
    }
    return [...found];
  });

  ipcMain.handle('playlist:export', async (e, payload) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const entries = (payload && Array.isArray(payload.entries)) ? payload.entries : [];
    const name = (payload && typeof payload.name === 'string' && payload.name) || 'playlist.m3u8';
    const res = await dialog.showSaveDialog(w, {
      title: 'Export playlist',
      defaultPath: name,
      filters: [{ name: 'M3U8 playlist', extensions: ['m3u8'] }]
    });
    if (res.canceled || !res.filePath) return null;
    const lines = ['#EXTM3U'];
    for (const it of entries) {
      const p = String(it && typeof it.path === 'string' ? it.path : '');
      const n = String(it && typeof it.name === 'string' ? it.name : path.basename(p));
      if (!p) continue;
      lines.push(`#EXTINF:0,${n.replace(/,/g, ' ')}`, p);
    }
    try {
      fs.writeFileSync(res.filePath, lines.join('\r\n') + '\r\n', 'utf8');
      return res.filePath;
    } catch (err) {
      console.error('[export] failed:', err.message);
      return null;
    }
  });

  ipcMain.handle('state:load', () => loadState());
  ipcMain.handle('state:save', (e, patch) => {
    saveState(patch);
    return true;
  });

  ipcMain.handle('recent:load', () => {
    const list = loadState().recent;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => typeof p === 'string' && p.length && fs.existsSync(p))
      .slice(0, MAX_RECENT);
  });
  ipcMain.handle('recent:save', (e, list) => {
    const clean = Array.isArray(list)
      ? list.filter((p) => typeof p === 'string' && p.length).slice(0, MAX_RECENT)
      : [];
    saveState({ recent: clean });
    return true;
  });

  ipcMain.handle('shell:showInFolder', (e, p) => {
    if (typeof p === 'string' && p.length) shell.showItemInFolder(p);
  });

  ipcMain.handle('window:fullscreen', (e, v) => {
    const w = getWin();
    if (w) w.setFullScreen(!!v);
  });
  ipcMain.handle('window:minimize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.minimize();
  });
  ipcMain.handle('window:toggleMaximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.handle('window:close', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.close();
  });

  ipcMain.handle('app:quit', () => app.quit());
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = getWin();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    registerIpc();
    createWindow();
    buildMenu();
    registerMediaKeys();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    app.quit();
  });

  app.on('before-quit', () => {
    const w = getWin();
    if (w) {
      try {
        saveState({ window: w.getBounds() });
      } catch {
        /* best effort */
      }
    }
  });
}
