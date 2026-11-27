const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  openFloatingLookup: (query = '') => ipcRenderer.invoke('floating:open', query),
  closeFloatingWindow: () => ipcRenderer.invoke('floating:close'),
  toggleFloatingPin: () => ipcRenderer.invoke('floating:toggle-pin'),
  getFloatingState: () => ipcRenderer.invoke('floating:get-state'),
  openMainLookup: (word) => ipcRenderer.invoke('main:lookup', word),
  captureRegion: () => ipcRenderer.invoke('capture:select-region'),
  onFloatingQuery: (callback) => subscribe('floating:query', callback),
  onLookupWord: (callback) => subscribe('lookup:word', callback),
  authStorage: {
    getItem: (key) => ipcRenderer.invoke('auth-storage:get', key),
    setItem: (key, value) => ipcRenderer.invoke('auth-storage:set', key, value),
    removeItem: (key) => ipcRenderer.invoke('auth-storage:remove', key),
  },
})
