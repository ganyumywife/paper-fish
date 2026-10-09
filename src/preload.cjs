const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desk', {
  call: (action, payload) => ipcRenderer.invoke('desk', action, payload),
  onSound: cb => ipcRenderer.on('sound', (_, data) => cb(data)),
  onToy: cb => ipcRenderer.on('toy', (_, data) => cb(data)),
  onRecycle: cb => ipcRenderer.on('recycle', (_, data) => cb(data)),
  onChange: cb => ipcRenderer.on('state', (_, state) => cb(state)),
  onHint: cb => ipcRenderer.on('drop-hint', (_, active) => cb(active)),
  onRestored: cb => ipcRenderer.on('restored', (_, id) => cb(id)),
  onNotice: cb => ipcRenderer.on('notice', (_, message) => cb(message)),
  onLoaded: cb => ipcRenderer.on('loaded', (_, id) => cb(id)),
  onWindowState: cb => ipcRenderer.on('window-state', (_, info) => cb(info)),
  onExpandRequest: cb => ipcRenderer.on('expand-request', cb),
  onSettingsRequest: cb => ipcRenderer.on('settings-request', cb),
  onSearchRequest: cb => ipcRenderer.on('search-request', cb),
  onSelectPage: cb => ipcRenderer.on('select-page', (_, id) => cb(id)),
  onAim: cb => ipcRenderer.on('aim', (_, data) => cb(data))
});
