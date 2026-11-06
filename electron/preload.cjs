const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('still', {
  getState: () => invoke('state:get'),
  patchState: (partial) => invoke('state:patch', partial),
  addFolders: () => invoke('folders:add'),
  grant: (root) => invoke('folders:grant', root),
  removeRoot: (root) => invoke('folders:remove', root),
  list: (dir) => invoke('fs:list', dir),
  search: (query) => invoke('fs:search', query),
  read: (file) => invoke('fs:read', file),
  write: (file, content) => invoke('fs:write', file, content),
  saveCopy: (file, content) => invoke('fs:save-copy', file, content),
  watch: (file) => invoke('fs:watch', file),
  rename: (file, name) => invoke('fs:rename', file, name),
  duplicate: (file) => invoke('fs:duplicate', file),
  remove: (file) => invoke('fs:remove', file),
  move: (src, destDir) => invoke('fs:move', src, destDir),
  createFile: (dir) => invoke('fs:create-file', dir),
  createFolder: (dir) => invoke('fs:create-folder', dir),
  importPaths: (sources, destDir) => invoke('fs:import', sources, destDir),
  reveal: (target) => invoke('fs:reveal', target),
  openExternal: (url) => invoke('shell:open', url),
  pathForFile: (file) => webUtils.getPathForFile(file),
  flushDone: () => ipcRenderer.send('flush-done'),
  on: (channel, callback) => {
    const allowed = new Set(['flush', 'sidebar', 'add-folder', 'new-note', 'window-blur', 'find', 'file-changed'])
    if (!allowed.has(channel)) return () => {}
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
