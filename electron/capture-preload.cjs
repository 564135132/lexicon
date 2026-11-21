const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('captureOverlay', {
  onInit: (callback) => {
    ipcRenderer.on('capture-overlay:init', (_event, payload) => callback(payload))
  },
  ready: () => ipcRenderer.send('capture-overlay:ready'),
  select: (rect) => ipcRenderer.send('capture-overlay:select', rect),
  cancel: () => ipcRenderer.send('capture-overlay:cancel'),
})
