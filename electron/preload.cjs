const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__DESKTOP_APP__', {
  isElectron: true,
  platform: process.platform,
  getPendingOpenFile: () => ipcRenderer.invoke('get-pending-open-file'),
  onOpenFile: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('os-open-file', handler);
    return () => ipcRenderer.removeListener('os-open-file', handler);
  },
});
