'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function dropPath(file) {
  try {
    return webUtils.getPathForFile(file);
  } catch {
    return null;
  }
}

contextBridge.exposeInMainWorld('nova', {
  openFiles: () => ipcRenderer.invoke('files:open'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  importPlaylist: () => ipcRenderer.invoke('playlist:import'),
  savePlaylist: (payload) => ipcRenderer.invoke('playlist:export', payload),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (patch) => ipcRenderer.invoke('state:save', patch),
  loadRecent: () => ipcRenderer.invoke('recent:load'),
  saveRecent: (list) => ipcRenderer.invoke('recent:save', list),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  setFullScreen: (v) => ipcRenderer.invoke('window:fullscreen', v),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowState: (cb) =>
    ipcRenderer.on('window:state', (_e, state) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[nova] window state failed:', err);
      }
    }),
  onMenuAction: (cb) =>
    ipcRenderer.on('menu:action', (_e, action) => {
      try {
        cb(action);
      } catch (err) {
        console.error('[nova] menu action failed:', err);
      }
    }),
  onShortcut: (cb) =>
    ipcRenderer.on('shortcut', (_e, action) => {
      try {
        cb(action);
      } catch (err) {
        console.error('[nova] shortcut failed:', err);
      }
    }),
  fileDropPath: dropPath
});
