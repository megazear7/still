const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  protocol,
  net,
} = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { createLibrary } = require('./files.cjs')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'still',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

app.setName('Still')
if (process.platform === 'darwin') {
  app.setPath('userData', path.join(app.getPath('home'), 'Library', 'Application Support', 'Still'))
}

let library = null
let mainWindow = null

function send(channel, payload) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => send('new-note') },
        { label: 'Add Folder', accelerator: 'CmdOrCtrl+O', click: () => send('add-folder') },
        { type: 'separator' },
        { label: 'Files', accelerator: 'CmdOrCtrl+1', click: () => send('sidebar', 'files') },
        { label: 'Contents', accelerator: 'CmdOrCtrl+2', click: () => send('sidebar', 'contents') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
      ],
    },
    ...(process.env.VITE_DEV_SERVER_URL ? [{ role: 'viewMenu' }] : []),
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const bounds = library.state.bounds
  const win = new BrowserWindow({
    width: bounds?.width || 1120,
    height: bounds?.height || 780,
    x: Number.isFinite(bounds?.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds?.y) ? bounds.y : undefined,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#342c24',
    title: '',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('page-title-updated', (event) => event.preventDefault())
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '../dist/index.html'))

  let saveTimer = null
  const saveBounds = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      library.state.bounds = win.getBounds()
      library.persist()
    }, 400)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('blur', () => {
    if (!win.isDestroyed()) win.webContents.send('window-blur')
  })

  let closing = false
  win.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    closing = true
    const finish = () => {
      clearTimeout(timeout)
      ipcMain.removeListener('flush-done', finish)
      if (!win.isDestroyed()) win.destroy()
    }
    const timeout = setTimeout(finish, 1500)
    ipcMain.on('flush-done', finish)
    if (win.webContents.isDestroyed()) finish()
    else win.webContents.send('flush')
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
}

function guard(work) {
  return async () => {
    try {
      return await work()
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed',
        code: error && error.code ? error.code : null,
      }
    }
  }
}

const accessStops = []

function activateBookmark(bookmark) {
  if (process.platform !== 'darwin' || !bookmark) return
  try {
    const stop = app.startAccessingSecurityScopedResource(bookmark)
    if (typeof stop === 'function') accessStops.push(stop)
  } catch {
    // The bookmark is stale, or this build cannot use security-scoped access.
  }
}

function activateSavedBookmarks(stateFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    for (const bookmark of Object.values(parsed.bookmarks || {})) activateBookmark(bookmark)
  } catch {
    // No saved folders yet.
  }
}

function rememberBookmarks(filePaths, bookmarks, resolved) {
  filePaths.forEach((filePath, index) => {
    const bookmark = bookmarks?.[index]
    const stored = resolved?.[filePath] || filePath
    if (!bookmark) return
    activateBookmark(bookmark)
    library.setBookmark(stored, bookmark)
  })
}

function registerIpc() {
  ipcMain.handle('state:get', () => library.getState())
  ipcMain.handle('state:patch', (_event, partial) => library.patchState(partial))
  ipcMain.handle('folders:add', () =>
    guard(async () => {
      const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
        properties: ['openDirectory', 'multiSelections'],
        buttonLabel: 'Add',
        securityScopedBookmarks: true,
      })
      if (result.canceled || !result.filePaths.length) {
        return { ok: true, canceled: true, roots: [...library.state.roots] }
      }
      const added = library.addRoots(result.filePaths)
      rememberBookmarks(result.filePaths, result.bookmarks, added.resolved)
      return { ok: true, roots: added.roots }
    })(),
  )
  ipcMain.handle('folders:grant', (_event, root) =>
    guard(async () => {
      const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
        properties: ['openDirectory'],
        defaultPath: typeof root === 'string' ? root : undefined,
        buttonLabel: 'Allow',
        message: 'Still needs permission to read this folder.',
        securityScopedBookmarks: true,
      })
      if (result.canceled || !result.filePaths.length) {
        return { ok: true, canceled: true, roots: [...library.state.roots] }
      }
      const added = library.addRoots(result.filePaths)
      rememberBookmarks(result.filePaths, result.bookmarks, added.resolved)
      return { ok: true, roots: added.roots }
    })(),
  )
  ipcMain.handle(
    'folders:remove',
    (_event, root) => guard(() => ({ ok: true, roots: library.removeRoot(root) }))(),
  )
  ipcMain.handle(
    'fs:list',
    (_event, dir) => guard(() => ({ ok: true, entries: library.list(dir) }))(),
  )
  ipcMain.handle(
    'fs:search',
    (_event, query) => guard(() => ({ ok: true, results: library.search(query) }))(),
  )
  ipcMain.handle(
    'fs:read',
    (_event, file) => guard(() => ({ ok: true, content: library.read(file) }))(),
  )
  ipcMain.handle(
    'fs:write',
    (_event, file, content) => guard(() => {
      library.write(file, content)
      return { ok: true }
    })(),
  )
  ipcMain.handle(
    'fs:save-copy',
    (_event, file, content) => guard(() => ({ ok: true, ...library.saveCopy(file, content) }))(),
  )
  ipcMain.handle('fs:watch', (_event, file) => guard(() => watchOpenFile(file))())
  ipcMain.handle(
    'fs:rename',
    (_event, file, name) => guard(() => ({ ok: true, ...library.rename(file, name) }))(),
  )
  ipcMain.handle(
    'fs:duplicate',
    (_event, file) => guard(() => ({ ok: true, ...library.duplicate(file) }))(),
  )
  ipcMain.handle(
    'fs:remove',
    (_event, file) => guard(() => ({ ok: true, ...library.remove(file) }))(),
  )
  ipcMain.handle(
    'fs:move',
    (_event, src, destDir) => guard(() => ({ ok: true, ...library.move(src, destDir) }))(),
  )
  ipcMain.handle(
    'fs:create-file',
    (_event, dir) => guard(() => ({ ok: true, ...library.createFile(dir) }))(),
  )
  ipcMain.handle(
    'fs:create-folder',
    (_event, dir) => guard(() => ({ ok: true, ...library.createFolder(dir) }))(),
  )
  ipcMain.handle(
    'fs:import',
    (_event, sources, destDir) => guard(() => ({ ok: true, ...library.importPaths(sources, destDir) }))(),
  )
  ipcMain.handle(
    'fs:reveal',
    (_event, target) => guard(() => {
      library.contains(target)
      shell.showItemInFolder(target)
      return { ok: true }
    })(),
  )
  ipcMain.handle('shell:open', (_event, url) => {
    if (typeof url === 'string' && /^https?:/i.test(url)) shell.openExternal(url)
    return { ok: true }
  })
}

let watchedPath = null
let watchTimer = null

function onWatchedStat(current, previous) {
  if (!watchedPath) return
  if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return
  if (watchTimer) clearTimeout(watchTimer)
  const file = watchedPath
  watchTimer = setTimeout(() => {
    watchTimer = null
    if (watchedPath !== file || !mainWindow || mainWindow.isDestroyed()) return
    try {
      const content = library.read(file)
      mainWindow.webContents.send('file-changed', { path: file, content })
    } catch (error) {
      const missing = error instanceof Error && error.message === 'Not found'
      if (missing) mainWindow.webContents.send('file-changed', { path: file, missing: true })
    }
  }, 180)
}

function watchOpenFile(file) {
  if (watchedPath) fs.unwatchFile(watchedPath, onWatchedStat)
  if (watchTimer) {
    clearTimeout(watchTimer)
    watchTimer = null
  }
  watchedPath = null
  if (typeof file !== 'string' || !file) return { ok: true }
  library.contains(file)
  watchedPath = file
  fs.watchFile(file, { interval: 700, persistent: false }, onWatchedStat)
  return { ok: true }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    const stateFile = path.join(app.getPath('userData'), 'state.json')
    activateSavedBookmarks(stateFile)
    library = createLibrary({ stateFile })

    protocol.handle('still', (request) => {
      try {
        const filePath = new URL(request.url).searchParams.get('p')
        if (!filePath || !library.isAllowedImage(filePath)) return new Response(null, { status: 403 })
        return net.fetch(pathToFileURL(filePath).toString())
      } catch {
        return new Response(null, { status: 400 })
      }
    })

    registerIpc()
    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    for (const stop of accessStops) {
      try {
        stop()
      } catch {
        // Already released.
      }
    }
  })
}
