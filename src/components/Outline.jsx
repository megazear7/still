import { useEffect, useRef, useState } from 'react'
import { capPreview } from '../contents'

export function Outline({ headings, activeIndex, onJump }) {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)

  useEffect(() => {
    const current = ref.current?.querySelector('[data-active="true"]')
    current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function showTip(event, item) {
    if (item.kind !== 'paragraph' || !item.text) {
      setTip(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const height = 92
    const below = rect.bottom + 6
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
    setTip({
      text: capPreview(item.text),
      left: Math.max(8, rect.left),
      top,
      width: Math.min(280, window.innerWidth - rect.left - 16),
    })
  }

  return (
    <nav className="outline" ref={ref} aria-label="Contents" onScroll={() => setTip(null)}>
      {headings.map((item, index) => (
        <button
          key={`${item.pos}-${index}`}
          data-active={index === activeIndex ? 'true' : 'false'}
          className={[index === activeIndex ? 'on' : '', item.kind === 'paragraph' ? 'para' : ''].filter(Boolean).join(' ') || undefined}
          style={{ paddingLeft: 10 + (item.level - 1) * 14 }}
          onClick={() => onJump(item.pos)}
          onMouseEnter={(event) => showTip(event, item)}
          onMouseLeave={() => setTip(null)}
        >
          {item.text || ' '}
        </button>
      ))}
      {tip && (
        <div className="outline-tip" style={{ left: tip.left, top: tip.top, width: tip.width }}>
          {tip.text}
        </div>
      )}
    </nav>
  )
}
