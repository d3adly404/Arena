/* ═══════════════════════════════════════════════════════════════
   NOVASE BROWSER — Electron Preload Script
   Exposes safe APIs to the renderer process
   ═══════════════════════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novaseDesktop', {
  // Window controls (for custom titlebar in desktop mode)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Platform info
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // File dialogs
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),

  // Listen for menu events
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),

  // Check if running in Electron
  isElectron: true,
});
