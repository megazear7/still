import { useEffect, useRef, useState } from 'react'

export function Menu({
  x,
  y,
  entry,
  onClose,
  onNewNote,
  onNewFolder,
  onRename,
  onDuplicate,
  onReveal,
  onDelete,
  onRemoveRoot,
}) {
  const [confirming, setConfirming] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const run = (action) => {
    action()
    onClose()
  }

  const items = entry.root
    ? [
        ['New note', () => run(onNewNote)],
        ['New folder', () => run(onNewFolder)],
        '—',
        ['Rename', () => run(onRename)],
        ['Reveal in Finder', () => run(onReveal)],
        '—',
        ['Remove from sidebar', () => run(onRemoveRoot)],
      ]
    : [
        ['New note', () => run(onNewNote)],
        ['New folder', () => run(onNewFolder)],
        '—',
        ['Rename', () => run(onRename)],
        ['Duplicate', () => run(onDuplicate)],
        ['Reveal in Finder', () => run(onReveal)],
        '—',
        [
          confirming ? 'Delete?' : 'Delete',
          () => {
            if (!confirming) {
              setConfirming(true)
              return
            }
            run(onDelete)
          },
          confirming ? 'confirm' : '',
        ],
      ]

  const left = Math.max(8, Math.min(x, window.innerWidth - 208))
  const top = Math.max(8, Math.min(y, window.innerHeight - 300))

  return (
    <div ref={ref} className="menu" style={{ left, top }} role="menu">
      {items.map((item, index) =>
        item === '—' ? (
          <hr key={index} />
        ) : (
          <button
            key={item[0]}
            className={item[2] || undefined}
            role="menuitem"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              item[1]()
            }}
          >
            {item[0]}
          </button>
        ),
      )}
    </div>
  )
}
