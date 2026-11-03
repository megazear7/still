import { useEffect, useRef, useState } from 'react'
import { baseName, canDrop, isNoteName, parentDir } from '../paths'

function hasType(dataTransfer, type) {
  const types = dataTransfer?.types
  if (!types) return false
  if (typeof types.includes === 'function') return [...types].includes(type)
  if (typeof types.contains === 'function') return types.contains(type)
  return false
}

export function FileTree({
  roots,
  listings,
  expanded,
  openPath,
  renameRequest,
  onToggle,
  onExpand,
  onOpen,
  onContextMenu,
  onRename,
  onMove,
  onImport,
}) {
  const [renaming, setRenaming] = useState(null)
  const [renameError, setRenameError] = useState(false)
  const [hoverDrop, setHoverDrop] = useState(null)
  const [tip, setTip] = useState(null)
  const dragSrc = useRef(null)
  const dragged = useRef(false)
  const expandTimer = useRef(null)

  useEffect(() => {
    if (!renameRequest) return
    setRenaming({ path: renameRequest.path, value: baseName(renameRequest.path) })
    setRenameError(false)
  }, [renameRequest])

  useEffect(() => () => clearTimeout(expandTimer.current), [])

  function showTip(event, entry) {
    if (renaming?.path === entry.path) {
      setTip(null)
      return
    }
    const name = event.currentTarget.querySelector('.name')
    if (!name || name.scrollWidth <= name.clientWidth + 1) {
      setTip(null)
      return
    }
    const rect = name.getBoundingClientRect()
    const below = rect.bottom + 8
    const top = below + 28 > window.innerHeight ? Math.max(8, rect.top - 30) : below
    setTip({ text: entry.name, left: rect.left, top })
  }

  if (!roots.length) return null

  const ctx = {
    listings,
    expanded,
    openPath,
    renaming,
    renameError,
    dragSrc,
    hoverDrop,
    dragged,
    expandTimer,
    setRenaming,
    setRenameError,
    setHoverDrop,
    showTip,
    hideTip: () => setTip(null),
    onToggle,
    onExpand,
    onOpen,
    onContextMenu,
    onRename,
    onMove,
    onImport,
  }

  return (
    <div
      className="tree"
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => setHoverDrop(null)}
      onScroll={() => setTip(null)}
    >
      {roots.map((root) => (
        <Branch
          key={root}
          depth={0}
          entry={{ type: 'dir', path: root, name: baseName(root), root: true }}
          ctx={ctx}
        />
      ))}
      {tip && (
        <div className="tip" style={{ left: tip.left, top: tip.top }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}

function Branch({ entry, depth, ctx }) {
  const isDir = entry.type === 'dir'
  const isOpen = ctx.expanded.has(entry.path)
  const children = ctx.listings[entry.path] || []
  const isRenaming = ctx.renaming?.path === entry.path
  const note = isDir || isNoteName(entry.name)
  const inputRef = useRef(null)
  const committing = useRef(false)

  useEffect(() => {
    if (!isRenaming || !inputRef.current) return
    const input = inputRef.current
    input.focus()
    const value = input.value
    const dot = entry.type === 'file' ? value.lastIndexOf('.') : -1
    input.setSelectionRange(0, dot > 0 ? dot : value.length)
  }, [isRenaming, entry.type])

  const dest = isDir ? entry.path : parentDir(entry.path)

  async function commit() {
    if (committing.current || !ctx.renaming) return
    const value = ctx.renaming.value.trim()
    committing.current = true
    if (!value || value === entry.name) {
      ctx.setRenaming(null)
      ctx.setRenameError(false)
      return
    }
    const ok = await ctx.onRename(entry.path, value)
    if (ok) {
      ctx.setRenaming(null)
      ctx.setRenameError(false)
      return
    }
    committing.current = false
    ctx.setRenameError(true)
    inputRef.current?.focus()
  }

  function cancel() {
    committing.current = true
    ctx.setRenaming(null)
    ctx.setRenameError(false)
    setTimeout(() => {
      committing.current = false
    }, 0)
  }

  return (
    <>
      <div
        className={[
          'row',
          entry.path === ctx.openPath ? 'is-open' : '',
          !note ? 'dim' : '',
          ctx.hoverDrop === entry.path ? 'drop' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!isRenaming}
        onMouseEnter={(event) => ctx.showTip(event, entry)}
        onMouseLeave={() => ctx.hideTip()}
        onClick={() => {
          if (ctx.dragged.current || isRenaming) return
          if (isDir) ctx.onToggle(entry.path)
          else if (note) ctx.onOpen(entry.path)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          ctx.onContextMenu(event, entry)
        }}
        onDragStart={(event) => {
          ctx.dragged.current = true
          ctx.dragSrc.current = entry.path
          event.dataTransfer.setData('application/x-still-path', entry.path)
          event.dataTransfer.setData('text/plain', entry.path)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          ctx.dragSrc.current = null
          ctx.setHoverDrop(null)
          clearTimeout(ctx.expandTimer.current)
          setTimeout(() => {
            ctx.dragged.current = false
          }, 0)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const external = hasType(event.dataTransfer, 'Files')
          const allowed = external || canDrop(ctx.dragSrc.current, dest)
          if (!allowed) {
            event.dataTransfer.dropEffect = 'none'
            return
          }
          event.dataTransfer.dropEffect = external ? 'copy' : 'move'
          ctx.setHoverDrop(entry.path)
          if (isDir && !isOpen) {
            clearTimeout(ctx.expandTimer.current)
            ctx.expandTimer.current = setTimeout(() => ctx.onExpand(entry.path), 500)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          clearTimeout(ctx.expandTimer.current)
          ctx.setHoverDrop(null)
          ctx.dragSrc.current = null
          const files = [...event.dataTransfer.files]
          if (files.length) {
            const sources = window.still?.pathForFile
              ? files.map((file) => window.still.pathForFile(file)).filter(Boolean)
              : []
            if (sources.length) ctx.onImport(sources, dest)
            return
          }
          const src = event.dataTransfer.getData('application/x-still-path') || event.dataTransfer.getData('text/plain')
          if (src && canDrop(src, dest)) ctx.onMove(src, dest)
        }}
      >
        {isDir ? <span className={isOpen ? 'chev on' : 'chev'}>›</span> : <span className="chev" />}
        {isRenaming ? (
          <input
            ref={inputRef}
            className={ctx.renameError ? 'bad' : undefined}
            value={ctx.renaming.value}
            onChange={(event) => {
              ctx.setRenameError(false)
              ctx.setRenaming({ path: entry.path, value: event.target.value })
            }}
            onClick={(event) => event.stopPropagation()}
            onBlur={() => {
              if (!committing.current) commit()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
            }}
          />
        ) : (
          <span className="name">{entry.name}</span>
        )}
      </div>
      {isDir && isOpen && children.map((child) => (
        <Branch key={child.path} entry={child} depth={depth + 1} ctx={ctx} />
      ))}
    </>
  )
}
