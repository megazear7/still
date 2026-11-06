import { useEffect, useRef, useState } from 'react'
import { EditorPane } from './components/EditorPane'
import { FileTree } from './components/FileTree'
import { Menu } from './components/Menu'
import { Outline } from './components/Outline'
import { Search } from './components/Search'
import { baseName, parentDir, rebasePath, relativePath } from './paths'
import { decideExternal } from './sync'

function clampSide(value) {
  const max = Math.min(560, Math.max(220, window.innerWidth - 420))
  return Math.round(Math.min(max, Math.max(180, Number(value) || 256)))
}

export function App() {
  const still = window.still
  const [booted, setBooted] = useState(false)
  const [roots, setRoots] = useState([])
  const [mode, setMode] = useState('files')
  const [listings, setListings] = useState({})
  const [expanded, setExpanded] = useState(() => new Set())
  const [doc, setDoc] = useState(null)
  const [headings, setHeadings] = useState([])
  const [activeHeading, setActiveHeading] = useState(-1)
  const [menu, setMenu] = useState(null)
  const [renameRequest, setRenameRequest] = useState(null)
  const [side, setSide] = useState(256)
  const [conflict, setConflict] = useState(null)

  const rootsRef = useRef([])
  const expandedRef = useRef(new Set())
  const docRef = useRef(null)
  const latest = useRef({ path: null, markdown: null, dirty: false })
  const chain = useRef(Promise.resolve())
  const timer = useRef(null)
  const idRef = useRef(1)
  const jumpRef = useRef(() => {})
  const findRef = useRef({ apply: () => ({ count: 0, current: 0 }) })
  const replaceRef = useRef(() => {})
  const api = useRef({})
  const sideRef = useRef(256)
  const diskRef = useRef(null)
  const touchedRef = useRef(false)
  const writingRef = useRef(0)
  const forceWriteRef = useRef(false)
  const conflictRef = useRef(null)

  function rememberConflict(next) {
    conflictRef.current = next
    setConflict(next)
  }

  function adoptExternal(content) {
    const path = docRef.current?.path
    if (!path) return
    const shown = replaceRef.current(content)
    const markdown = typeof shown === 'string' ? shown : content
    diskRef.current = content
    touchedRef.current = false
    latest.current = { path, markdown, dirty: false }
    rememberConflict(null)
  }

  function considerExternal(payload) {
    if (writingRef.current > 0) return
    const path = docRef.current?.path
    if (!payload || payload.path !== path || payload.missing) return
    const incoming = payload.content
    const action = decideExternal({
      editor: latest.current.markdown,
      disk: diskRef.current,
      touched: touchedRef.current,
      incoming,
    })
    if (action === 'sync') {
      diskRef.current = incoming
      if (incoming === latest.current.markdown) {
        latest.current.dirty = false
        if (conflictRef.current) rememberConflict(null)
      }
      return
    }
    if (action === 'reload') {
      adoptExternal(incoming)
      return
    }
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    rememberConflict({ path, content: incoming })
  }

  function updateExpanded(next, persist = true) {
    expandedRef.current = next
    setExpanded(next)
    if (persist) still?.patchState({ expanded: [...next] })
  }

  function expandAncestors(filePath, rootPaths) {
    const next = new Set(expandedRef.current)
    for (const root of rootPaths) {
      if (filePath !== root && !filePath.startsWith(`${root}/`)) continue
      next.add(root)
      let current = parentDir(filePath)
      while (current && (current === root || current.startsWith(`${root}/`))) {
        next.add(current)
        if (current === root) break
        const parent = parentDir(current)
        if (parent === current) break
        current = parent
      }
    }
    updateExpanded(next)
  }

  async function refresh() {
    if (!still) return
    const paths = [...new Set([...rootsRef.current, ...expandedRef.current])]
    const results = await Promise.all(
      paths.map(async (dir) => {
        const result = await still.list(dir)
        return [dir, result]
      }),
    )
    const next = {}
    const missing = []
    for (const [dir, result] of results) {
      if (result.ok) next[dir] = result.entries
      else if (!rootsRef.current.includes(dir)) missing.push(dir)
    }
    if (missing.length) {
      updateExpanded(new Set([...expandedRef.current].filter((dir) => !missing.includes(dir))))
    }
    setListings(next)
  }

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void flush()
    }, 280)
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = async () => {
      const current = latest.current
      if (conflictRef.current && !forceWriteRef.current) return
      if (!current.dirty || !current.path || !still) return
      const snapshot = { path: current.path, markdown: current.markdown }
      if (!forceWriteRef.current) {
        const onDisk = await still.read(snapshot.path)
        if (onDisk?.ok && onDisk.content !== diskRef.current && onDisk.content !== snapshot.markdown) {
          current.dirty = true
          if (timer.current) {
            clearTimeout(timer.current)
            timer.current = null
          }
          rememberConflict({ path: snapshot.path, content: onDisk.content })
          return
        }
      }
      current.dirty = false
      writingRef.current += 1
      try {
        const result = await still.write(snapshot.path, snapshot.markdown)
        if (!result?.ok && latest.current.path === snapshot.path && latest.current.markdown === snapshot.markdown) {
          latest.current.dirty = true
        } else if (result?.ok) {
          diskRef.current = snapshot.markdown
        }
      } finally {
        writingRef.current -= 1
      }
    }
    const next = chain.current.then(run, run)
    chain.current = next
    return next
  }

  function handleChange(markdown) {
    const path = docRef.current?.path
    if (!path) return
    touchedRef.current = true
    latest.current = { path, markdown, dirty: true }
    if (conflictRef.current) return
    scheduleSave()
  }

  function rememberHeadings(next) {
    setHeadings(next)
  }

  function rememberActive(index) {
    setActiveHeading((current) => (current === index ? current : index))
  }

  function closeDoc() {
    if (timer.current) clearTimeout(timer.current)
    latest.current = { path: null, markdown: null, dirty: false }
    diskRef.current = null
    touchedRef.current = false
    rememberConflict(null)
    docRef.current = null
    setDoc(null)
    setHeadings([])
    setActiveHeading(-1)
    still?.patchState({ lastFile: null })
  }

  function relocate(from, to) {
    const current = docRef.current
    if (current) {
      const nextPath = rebasePath(current.path, from, to)
      if (nextPath !== current.path) {
        const next = { ...current, path: nextPath }
        docRef.current = next
        if (latest.current.path) latest.current.path = rebasePath(latest.current.path, from, to)
        setDoc(next)
        still?.patchState({ lastFile: nextPath })
      }
    }
    const nextExpanded = new Set([...expandedRef.current].map((dir) => rebasePath(dir, from, to)))
    updateExpanded(nextExpanded)
  }

  async function keepMine() {
    if (!conflictRef.current) return
    rememberConflict(null)
    latest.current.dirty = true
    forceWriteRef.current = true
    try {
      await flush()
    } finally {
      forceWriteRef.current = false
    }
  }

  function discardMine() {
    const pending = conflictRef.current
    if (!pending) return
    adoptExternal(pending.content)
  }

  async function keepCopy() {
    const pending = conflictRef.current
    if (!pending || !still) return
    const result = await still.saveCopy(pending.path, latest.current.markdown)
    if (!result?.ok) return
    await refresh()
    adoptExternal(pending.content)
  }

  async function openFile(filePath) {
    if (!still || docRef.current?.path === filePath || conflictRef.current) return
    await flush()
    if (conflictRef.current) return
    const result = await still.read(filePath)
    if (!result.ok) return
    const next = { id: ++idRef.current, path: filePath, content: result.content }
    docRef.current = next
    diskRef.current = result.content
    touchedRef.current = false
    latest.current = { path: filePath, markdown: result.content, dirty: false }
    setDoc(next)
    setHeadings([])
    setActiveHeading(-1)
    expandAncestors(filePath, rootsRef.current)
    still.patchState({ lastFile: filePath })
  }

  async function addFolders() {
    if (!still) return null
    const result = await still.addFolders()
    if (!result.ok || result.canceled) return null
    rootsRef.current = result.roots
    setRoots(result.roots)
    updateExpanded(new Set([...expandedRef.current, ...result.roots]))
    await refresh()
    return result.roots
  }

  async function newNote() {
    if (!still) return
    let dir = null
    if (docRef.current) dir = parentDir(docRef.current.path)
    else if (rootsRef.current.length) dir = rootsRef.current[0]
    else {
      const added = await addFolders()
      if (!added?.length) return
      dir = added[added.length - 1]
    }
    await createNote(dir)
  }

  async function createNote(dir) {
    if (!still || conflictRef.current) return
    await flush()
    if (conflictRef.current) return
    const result = await still.createFile(dir)
    if (!result.ok) return
    updateExpanded(new Set([...expandedRef.current, dir]))
    await refresh()
    await openFile(result.path)
  }

  async function createFolder(dir) {
    if (!still) return
    const result = await still.createFolder(dir)
    if (!result.ok) return
    updateExpanded(new Set([...expandedRef.current, dir, result.path]))
    await refresh()
    setRenameRequest({ path: result.path, nonce: Date.now() })
  }

  async function renamePath(target, name) {
    if (!still) return false
    await flush()
    const result = await still.rename(target, name)
    if (!result.ok) return false
    if (result.roots) {
      rootsRef.current = result.roots
      setRoots(result.roots)
    }
    relocate(target, result.path)
    await refresh()
    return true
  }

  async function duplicatePath(target) {
    if (!still) return
    const result = await still.duplicate(target)
    if (!result.ok) return
    await refresh()
  }

  async function copyEntry(entry, kind) {
    if (!still) return
    const filePath = entry.path
    let text = ''
    if (kind === 'name') text = baseName(filePath)
    else if (kind === 'relative') text = relativePath(filePath, rootsRef.current)
    else if (kind === 'path') text = filePath
    else if (kind === 'content') {
      if (latest.current.path === filePath && typeof latest.current.markdown === 'string') {
        text = latest.current.markdown
      } else {
        const result = await still.read(filePath)
        if (!result.ok) return
        text = result.content
      }
    } else return
    await still.copyText(text)
  }

  async function versionPath(target, level) {
    if (!still || conflictRef.current) return
    await flush()
    if (conflictRef.current) return
    const result = await still.version(target, level)
    if (!result.ok) return
    relocate(target, result.path)
    updateExpanded(new Set([...expandedRef.current, parentDir(result.path), parentDir(result.archived)]))
    await refresh()
  }

  async function deletePath(target) {
    if (!still) return
    const open = docRef.current?.path
    const removesOpen = open && (open === target || open.startsWith(`${target}/`))
    if (removesOpen) closeDoc()
    else await flush()
    const result = await still.remove(target)
    if (!result.ok) return
    updateExpanded(
      new Set([...expandedRef.current].filter((dir) => dir !== target && !dir.startsWith(`${target}/`))),
    )
    await refresh()
  }

  async function movePath(src, destDir) {
    if (!still) return
    await flush()
    const result = await still.move(src, destDir)
    if (!result.ok) return
    if (result.roots) {
      rootsRef.current = result.roots
      setRoots(result.roots)
    }
    relocate(src, result.path)
    updateExpanded(new Set([...expandedRef.current, destDir]))
    await refresh()
  }

  async function importPaths(sources, destDir) {
    if (!still) return
    const result = await still.importPaths(sources, destDir)
    if (!result.ok) return
    updateExpanded(new Set([...expandedRef.current, destDir]))
    await refresh()
  }

  async function removeRoot(rootPath) {
    if (!still) return
    const open = docRef.current?.path
    if (open && (open === rootPath || open.startsWith(`${rootPath}/`))) closeDoc()
    else await flush()
    const result = await still.removeRoot(rootPath)
    if (!result.ok) return
    rootsRef.current = result.roots
    setRoots(result.roots)
    updateExpanded(
      new Set(
        [...expandedRef.current].filter((dir) => dir !== rootPath && !dir.startsWith(`${rootPath}/`)),
      ),
      false,
    )
    await refresh()
  }

  function toggleExpand(dir) {
    const next = new Set(expandedRef.current)
    const opening = !next.has(dir)
    if (opening) next.add(dir)
    else next.delete(dir)
    updateExpanded(next)
    if (opening) void refresh()
  }

  function expandDir(dir) {
    if (expandedRef.current.has(dir)) return
    updateExpanded(new Set([...expandedRef.current, dir]))
    void refresh()
  }

  function revealFolder(folderPath) {
    setModeAndSave('files')
    expandAncestors(folderPath, rootsRef.current)
    if (!expandedRef.current.has(folderPath)) {
      updateExpanded(new Set([...expandedRef.current, folderPath]))
    }
    void refresh()
  }

  function beginResize(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const originX = event.clientX
    const origin = sideRef.current
    document.body.classList.add('is-resizing')
    const move = (ev) => {
      const width = clampSide(origin + ev.clientX - originX)
      sideRef.current = width
      setSide(width)
    }
    const up = () => {
      document.body.classList.remove('is-resizing')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      still?.patchState({ side: sideRef.current })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function setModeAndSave(next) {
    setMode(next)
    still?.patchState({ mode: next })
  }

  function dirFor(entry) {
    return entry.type === 'dir' ? entry.path : parentDir(entry.path)
  }

  api.current = {
    flush,
    addFolders,
    newNote,
    setModeAndSave,
  }

  useEffect(() => {
    const prevent = (event) => {
      if ([...event.dataTransfer.types].includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    if (!still) {
      setBooted(true)
      return undefined
    }
    const offs = [
      still.on('flush', () => api.current.flush().finally(() => still.flushDone())),
      still.on('window-blur', () => {
        void api.current.flush()
      }),
      still.on('sidebar', (next) => {
        if (next === 'files' || next === 'contents') api.current.setModeAndSave(next)
      }),
      still.on('add-folder', () => {
        void api.current.addFolders()
      }),
      still.on('new-note', () => {
        void api.current.newNote()
      }),
      still.on('file-changed', (payload) => considerExternal(payload)),
    ]
    return () => offs.forEach((off) => off())
  }, [still])

  useEffect(() => {
    if (!still) return undefined
    let live = true
    ;(async () => {
      const state = await still.getState()
      if (!live) return
      const nextRoots = state.roots || []
      rootsRef.current = nextRoots
      setRoots(nextRoots)
      const nextExpanded = new Set(state.expanded?.length ? state.expanded : nextRoots)
      expandedRef.current = nextExpanded
      setExpanded(nextExpanded)
      setMode(state.mode === 'contents' ? 'contents' : 'files')
      if (Number.isFinite(state.side)) {
        const width = clampSide(state.side)
        sideRef.current = width
        setSide(width)
      }
      if (state.lastFile) {
        const file = await still.read(state.lastFile)
        if (live && file.ok) {
          const next = { id: ++idRef.current, path: state.lastFile, content: file.content }
          docRef.current = next
          diskRef.current = next.content
          touchedRef.current = false
          latest.current = { path: next.path, markdown: next.content, dirty: false }
          setDoc(next)
          expandAncestors(next.path, nextRoots)
        }
      }
      await refresh()
      if (live) setBooted(true)
    })()
    return () => {
      live = false
    }
  }, [still])

  useEffect(() => {
    if (!still) return undefined
    void still.watch(doc?.path || null)
  }, [doc?.path, still])

  useEffect(() => {
    if (!booted) return undefined
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [booted])

  const chrome = (
    <div className="top">
      <div className="top-side" />
      <div className="top-main">
        {booted && (
          <Search
            onOpenFile={(filePath) => void openFile(filePath)}
            onOpenFolder={revealFolder}
            onReveal={(filePath) => still?.reveal(filePath)}
            findRef={findRef}
            filePath={doc?.path || ''}
          />
        )}
      </div>
    </div>
  )

  if (!booted) {
    return <div className="window" style={{ '--side': `${side}px` }}>{chrome}<div className="body" /></div>
  }

  return (
    <div className="window" style={{ '--side': `${side}px` }}>
      {chrome}
      <div className="side-resize" role="separator" aria-orientation="vertical" aria-label="Resize panel" onMouseDown={beginResize} />
      <div className="body">
        <aside className="sidebar">
          <div className="modes">
            <button
              className={mode === 'files' ? 'on' : undefined}
              aria-pressed={mode === 'files'}
              onClick={() => setModeAndSave('files')}
            >
              Files
            </button>
            <button
              className={mode === 'contents' ? 'on' : undefined}
              aria-pressed={mode === 'contents'}
              onClick={() => setModeAndSave('contents')}
            >
              Contents
            </button>
          </div>
          {mode === 'files' ? (
            roots.length === 0 ? (
              <div className="side-empty">
                <button onClick={() => void addFolders()}>Add a folder</button>
              </div>
            ) : (
              <FileTree
                roots={roots}
                listings={listings}
                expanded={expanded}
                openPath={doc?.path || null}
                renameRequest={renameRequest}
                onToggle={toggleExpand}
                onExpand={expandDir}
                onOpen={(filePath) => void openFile(filePath)}
                onContextMenu={(event, entry) => setMenu({ x: event.clientX, y: event.clientY, entry })}
                onRename={renamePath}
                onMove={(src, dest) => void movePath(src, dest)}
                onImport={(sources, dest) => void importPaths(sources, dest)}
              />
            )
          ) : (
            <Outline
              headings={headings}
              activeIndex={activeHeading}
              onJump={(pos) => jumpRef.current(pos)}
            />
          )}
        </aside>
        <section className="stage">
          {doc && (
            <EditorPane
              key={doc.id}
              path={doc.path}
              initialMarkdown={doc.content}
              onChange={handleChange}
              onHeadings={rememberHeadings}
              onActiveHeading={rememberActive}
              jumpRef={jumpRef}
              findRef={findRef}
              replaceRef={replaceRef}
            />
          )}
          {conflict && (
            <div className="conflict" role="status">
              <p>This note changed somewhere else. That would replace your edits.</p>
              <div className="conflict-actions">
                <button type="button" onClick={() => void keepMine()}>
                  Save my changes and overwrite
                </button>
                <button type="button" onClick={discardMine}>
                  Throw away my changes and reload
                </button>
                <button type="button" onClick={() => void keepCopy()}>
                  Save a copy and reload
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {menu && (
        <Menu
          key={`${menu.entry.path}:${menu.x}:${menu.y}`}
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          onClose={() => setMenu(null)}
          onNewNote={() => void createNote(dirFor(menu.entry))}
          onNewFolder={() => void createFolder(dirFor(menu.entry))}
          onRename={() => {
            expandAncestors(menu.entry.path, rootsRef.current)
            setRenameRequest({ path: menu.entry.path, nonce: Date.now() })
          }}
          onDuplicate={() => void duplicatePath(menu.entry.path)}
          onVersion={(level) => void versionPath(menu.entry.path, level)}
          onCopy={(kind) => void copyEntry(menu.entry, kind)}
          onReveal={() => still?.reveal(menu.entry.path)}
          onDelete={() => void deletePath(menu.entry.path)}
          onRemoveRoot={() => void removeRoot(menu.entry.path)}
        />
      )}
    </div>
  )
}
