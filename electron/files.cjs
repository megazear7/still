const fs = require('fs')
const path = require('path')
const { versionNames } = require('./version.cjs')

const SKIP_NAMES = new Set(['node_modules', '__pycache__'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'])
const MAX_READ = 2_000_000
const MAX_WRITE = 5_000_000

function defaultState() {
  return {
    roots: [],
    bookmarks: {},
    lastFile: null,
    mode: 'files',
    expanded: [],
    bounds: null,
    side: 256,
  }
}

function loadState(stateFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    return { ...defaultState(), ...parsed }
  } catch {
    return defaultState()
  }
}

function createLibrary({ stateFile, memory } = {}) {
  const state = memory || loadState(stateFile)

  function persist() {
    if (!stateFile) return
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
  }

  if (!state.bookmarks || typeof state.bookmarks !== 'object') state.bookmarks = {}
  state.roots = (state.roots || []).flatMap((root) => {
    try {
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return []
      return [fs.realpathSync(root)]
    } catch {
      return typeof root === 'string' && root ? [root] : []
    }
  })

  function assertInside(target, { allowMissing = false } = {}) {
    if (!state.roots.length) throw new Error('No folder selected')
    let existing = target
    if (!fs.existsSync(target)) {
      if (!allowMissing) throw new Error('Not found')
      existing = path.dirname(target)
      if (!fs.existsSync(existing)) throw new Error('Not found')
    }
    const resolved = fs.realpathSync(existing)
    const bases = state.roots.map((root) => fs.realpathSync(root))
    const ok = bases.some((base) => resolved === base || resolved.startsWith(base + path.sep))
    if (!ok) throw new Error('Outside selected folders')
    return resolved
  }

  function uniquePath(dir, baseName) {
    const ext = path.extname(baseName)
    const stem = path.basename(baseName, ext)
    let candidate = path.join(dir, baseName)
    let n = 2
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${stem} ${n}${ext}`)
      n += 1
    }
    return candidate
  }

  function remapRoots(fromReal, toReal) {
    state.roots = state.roots.map((root) => {
      if (root === fromReal) return toReal
      if (root.startsWith(fromReal + path.sep)) return toReal + root.slice(fromReal.length)
      return root
    })
    if (state.lastFile === fromReal) state.lastFile = toReal
    else if (state.lastFile && state.lastFile.startsWith(fromReal + path.sep)) {
      state.lastFile = toReal + state.lastFile.slice(fromReal.length)
    }
    state.expanded = (state.expanded || []).map((entry) => {
      if (entry === fromReal) return toReal
      if (entry.startsWith(fromReal + path.sep)) return toReal + entry.slice(fromReal.length)
      return entry
    })
    persist()
  }

  function getState() {
    return {
      roots: [...state.roots],
      lastFile: state.lastFile,
      mode: state.mode === 'contents' ? 'contents' : 'files',
      expanded: [...(state.expanded || [])],
      side: Number.isFinite(state.side) ? state.side : 256,
    }
  }

  function patchState(partial) {
    if (!partial || typeof partial !== 'object') return getState()
    if (partial.mode === 'files' || partial.mode === 'contents') state.mode = partial.mode
    if ('lastFile' in partial) {
      if (partial.lastFile == null) state.lastFile = null
      else if (typeof partial.lastFile === 'string') {
        try {
          assertInside(partial.lastFile)
          state.lastFile = partial.lastFile
        } catch {
          state.lastFile = null
        }
      }
    }
    if (Array.isArray(partial.expanded)) {
      state.expanded = partial.expanded
        .filter((entry) => typeof entry === 'string')
        .filter((entry) => {
          try {
            assertInside(entry)
            return true
          } catch {
            return false
          }
        })
        .slice(0, 500)
    }
    if (Number.isFinite(partial.side)) {
      state.side = Math.round(Math.min(560, Math.max(180, partial.side)))
    }
    persist()
    return getState()
  }

  function addRoots(paths) {
    const resolved = {}
    for (const candidate of paths || []) {
      if (!candidate || !fs.existsSync(candidate)) continue
      let stored = candidate
      try {
        if (!fs.statSync(candidate).isDirectory()) continue
        try {
          stored = fs.realpathSync(candidate)
        } catch {
          stored = candidate
        }
      } catch {
        continue
      }
      if (!state.roots.includes(stored)) state.roots.push(stored)
      resolved[candidate] = stored
    }
    persist()
    return { roots: [...state.roots], resolved }
  }

  function setBookmark(root, bookmark) {
    if (!root || !bookmark) return
    state.bookmarks[root] = bookmark
    persist()
  }

  function removeRoot(target) {
    const resolved = fs.existsSync(target) ? fs.realpathSync(target) : target
    state.roots = state.roots.filter((root) => root !== resolved && root !== target)
    for (const key of Object.keys(state.bookmarks)) {
      if (key === resolved || key === target || key.startsWith(`${resolved}${path.sep}`)) delete state.bookmarks[key]
    }
    if (state.lastFile && (state.lastFile === resolved || state.lastFile.startsWith(resolved + path.sep))) {
      state.lastFile = null
    }
    state.expanded = (state.expanded || []).filter(
      (entry) => entry !== resolved && !entry.startsWith(resolved + path.sep),
    )
    persist()
    return [...state.roots]
  }

  function list(dir) {
    const realDir = assertInside(dir)
    const entries = []
    for (const dirent of fs.readdirSync(realDir, { withFileTypes: true })) {
      if (dirent.name.startsWith('.')) continue
      if (SKIP_NAMES.has(dirent.name)) continue
      const full = path.join(realDir, dirent.name)
      let stat
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) entries.push({ name: dirent.name, path: full, type: 'dir' })
      else if (stat.isFile()) entries.push({ name: dirent.name, path: full, type: 'file' })
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
    return entries
  }

  function read(file) {
    const realFile = assertInside(file)
    const stat = fs.statSync(realFile)
    if (!stat.isFile()) throw new Error('Not a file')
    if (stat.size > MAX_READ) throw new Error('File is too large')
    const buffer = fs.readFileSync(realFile)
    if (buffer.includes(0)) throw new Error('Not a text file')
    return buffer.toString('utf8')
  }

  function write(file, content) {
    if (typeof content !== 'string') throw new Error('Invalid content')
    if (content.length > MAX_WRITE) throw new Error('Note is too large')
    assertInside(file, { allowMissing: true })
    const dir = path.dirname(file)
    const tmp = path.join(dir, `.${path.basename(file)}.still-tmp`)
    try {
      fs.writeFileSync(tmp, content, 'utf8')
      fs.renameSync(tmp, file)
    } catch (error) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        // The original error is the one that matters.
      }
      throw error
    }
  }

  function rename(target, newName) {
    const cleaned = String(newName || '').trim()
    if (!cleaned || cleaned === '.' || cleaned === '..' || /[/\\]/.test(cleaned) || cleaned.includes('\0')) {
      throw new Error('Invalid name')
    }
    const realTarget = assertInside(target)
    const dest = path.join(path.dirname(realTarget), cleaned)
    if (dest !== realTarget && fs.existsSync(dest)) throw new Error('Already exists')
    if (dest !== realTarget) fs.renameSync(realTarget, dest)
    const destReal = fs.realpathSync(dest)
    if (destReal !== realTarget) remapRoots(realTarget, destReal)
    return { path: destReal, roots: [...state.roots] }
  }

  function saveCopy(file, content) {
    const realFile = assertInside(file)
    const ext = path.extname(realFile)
    const stem = path.basename(realFile, ext)
    const dest = uniquePath(path.dirname(realFile), `${stem} copy${ext}`)
    write(dest, content)
    return { path: dest }
  }

  function duplicate(target) {
    const realTarget = assertInside(target)
    const ext = path.extname(realTarget)
    const stem = path.basename(realTarget, ext)
    const dest = uniquePath(path.dirname(realTarget), `${stem} copy${ext}`)
    fs.cpSync(realTarget, dest, { recursive: true })
    return { path: dest }
  }

  function versionFile(target, level) {
    const realTarget = assertInside(target)
    if (!fs.statSync(realTarget).isFile()) throw new Error('Not a file')
    const dir = path.dirname(realTarget)
    const { currentName, nextName } = versionNames(path.basename(realTarget), level)
    const currentPath = path.join(dir, currentName)
    const nextPath = path.join(dir, nextName)
    if (currentPath !== realTarget && fs.existsSync(currentPath)) throw new Error('Already exists')
    if (fs.existsSync(nextPath)) throw new Error('Already exists')
    const archive = path.join(dir, 'archive')
    if (fs.existsSync(archive) && !fs.statSync(archive).isDirectory()) {
      throw new Error('Archive is not a folder')
    }

    if (currentPath !== realTarget) fs.renameSync(realTarget, currentPath)
    fs.cpSync(currentPath, nextPath)
    if (!fs.existsSync(archive)) fs.mkdirSync(archive)
    const archived = uniquePath(archive, currentName)
    fs.renameSync(currentPath, archived)
    if (state.lastFile === realTarget || state.lastFile === currentPath) state.lastFile = nextPath
    persist()
    return {
      path: fs.realpathSync(nextPath),
      archived: fs.realpathSync(archived),
      roots: [...state.roots],
    }
  }

  function remove(target) {
    const realTarget = assertInside(target)
    const rootPaths = state.roots.map((root) => fs.realpathSync(root))
    if (rootPaths.includes(realTarget)) throw new Error('Cannot delete a root folder')
    fs.rmSync(realTarget, { recursive: true, force: false })
    return { path: realTarget }
  }

  function move(src, destDir) {
    const srcReal = assertInside(src)
    const destReal = assertInside(destDir)
    if (!fs.statSync(destReal).isDirectory()) throw new Error('Not a folder')
    if (srcReal === destReal || destReal.startsWith(srcReal + path.sep)) {
      throw new Error('Cannot move a folder into itself')
    }
    if (path.dirname(srcReal) === destReal) return { path: srcReal, roots: [...state.roots] }
    const dest = uniquePath(destReal, path.basename(srcReal))
    fs.renameSync(srcReal, dest)
    remapRoots(srcReal, dest)
    return { path: dest, roots: [...state.roots] }
  }

  function createFile(dir) {
    const realDir = assertInside(dir)
    if (!fs.statSync(realDir).isDirectory()) throw new Error('Not a folder')
    const dest = uniquePath(realDir, 'untitled.md')
    fs.writeFileSync(dest, '')
    return { path: dest }
  }

  function createFolder(dir) {
    const realDir = assertInside(dir)
    if (!fs.statSync(realDir).isDirectory()) throw new Error('Not a folder')
    const dest = uniquePath(realDir, 'untitled')
    fs.mkdirSync(dest)
    return { path: dest }
  }

  function importPaths(sources, destDir) {
    const destReal = assertInside(destDir)
    if (!fs.statSync(destReal).isDirectory()) throw new Error('Not a folder')
    const imported = []
    for (const source of sources || []) {
      if (!source || !fs.existsSync(source)) continue
      const srcReal = fs.realpathSync(source)
      if (srcReal === destReal || destReal.startsWith(srcReal + path.sep)) continue
      const dest = uniquePath(destReal, path.basename(srcReal))
      fs.cpSync(srcReal, dest, { recursive: true })
      imported.push(dest)
    }
    return { paths: imported }
  }

  const NOTE_EXT = new Set(['md', 'markdown', 'mdown', 'mdx', 'txt', 'text'])

  function isNote(name) {
    const dot = name.lastIndexOf('.')
    if (dot <= 0) return true
    return NOTE_EXT.has(name.slice(dot + 1).toLowerCase())
  }

  function search(query) {
    const needle = String(query || '').trim().toLowerCase()
    if (needle.length < 1) return []
    const bases = state.roots.map((root) => {
      try {
        return fs.realpathSync(root)
      } catch {
        return root
      }
    })
    const inside = (real) => bases.some((base) => real === base || real.startsWith(base + path.sep))
    const named = []
    const textual = []
    const seen = new Set()

    function consider(entry) {
      if (entry.snippet) textual.push(entry)
      else named.push(entry)
    }

    function walk(dir) {
      if (named.length + textual.length >= 80) return
      let real
      try {
        real = fs.realpathSync(dir)
      } catch {
        return
      }
      if (seen.has(real) || !inside(real)) return
      seen.add(real)
      let dirents
      try {
        dirents = fs.readdirSync(real, { withFileTypes: true })
      } catch {
        return
      }
      for (const dirent of dirents) {
        if (dirent.name.startsWith('.') || SKIP_NAMES.has(dirent.name)) continue
        const full = path.join(real, dirent.name)
        let stat
        try {
          stat = fs.statSync(full)
        } catch {
          continue
        }
        const nameHit = dirent.name.toLowerCase().includes(needle)
        if (stat.isDirectory()) {
          if (nameHit) consider({ type: 'dir', path: full, name: dirent.name, note: false })
          walk(full)
          continue
        }
        if (!stat.isFile()) continue
        const note = isNote(dirent.name)
        if (nameHit) {
          consider({ type: 'file', path: full, name: dirent.name, note })
          continue
        }
        if (!note || stat.size > 400_000 || named.length + textual.length >= 80) continue
        let text
        try {
          text = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        if (text.includes('\0')) continue
        const at = text.toLowerCase().indexOf(needle)
        if (at === -1) continue
        const start = Math.max(0, at - 28)
        const end = Math.min(text.length, at + needle.length + 42)
        let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
        if (start > 0) snippet = `…${snippet}`
        if (end < text.length) snippet = `${snippet}…`
        consider({ type: 'file', path: full, name: dirent.name, note: true, snippet })
      }
    }

    for (const root of state.roots) walk(root)
    named.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
    return [...named, ...textual].slice(0, 24)
  }

  function contains(target) {
    assertInside(target)
  }

  function isAllowedImage(filePath) {
    if (!filePath || !IMAGE_EXT.has(path.extname(filePath).toLowerCase())) return false
    try {
      assertInside(filePath)
      return fs.statSync(filePath).isFile()
    } catch {
      return false
    }
  }

  return {
    state,
    persist,
    getState,
    patchState,
    addRoots,
    setBookmark,
    removeRoot,
    list,
    read,
    write,
    saveCopy,
    rename,
    duplicate,
    versionFile,
    remove,
    move,
    createFile,
    createFolder,
    importPaths,
    search,
    contains,
    isAllowedImage,
  }
}

module.exports = { createLibrary }
