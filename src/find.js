import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const findPluginKey = new PluginKey('stillFind')

function rangesFor(doc, query) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return []
  const ranges = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const lower = node.text.toLowerCase()
    let from = 0
    while (from <= lower.length - needle.length) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      ranges.push({ from: pos + at, to: pos + at + needle.length })
      from = at + needle.length
    }
  })
  return ranges
}

function decorate(doc, query, current) {
  const ranges = rangesFor(doc, query)
  const count = ranges.length
  const index = count === 0 || current < 0 ? -1 : ((current % count) + count) % count
  const deco = DecorationSet.create(
    doc,
    ranges.map((range, i) =>
      Decoration.inline(range.from, range.to, {
        class: i === index ? 'find-hit current' : 'find-hit',
      }),
    ),
  )
  return { query: String(query || ''), current: index, count, ranges, deco }
}

function snippetFor(doc, range) {
  const $from = doc.resolve(range.from)
  const block = doc.textBetween($from.start(), $from.end(), ' ').replace(/\s+/g, ' ')
  const at = Math.max(0, range.from - $from.start())
  const start = Math.max(0, at - 28)
  const end = Math.min(block.length, at + (range.to - range.from) + 42)
  let snippet = block.slice(start, end).trim()
  if (start > 0) snippet = `…${snippet}`
  if (end < block.length) snippet = `${snippet}…`
  return snippet
}

function matchWindow(doc, ranges, index) {
  if (index < 0) return []
  return ranges.slice(index, index + 10).map((range, offset) => ({
    index: index + offset,
    text: snippetFor(doc, range),
  }))
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findPluginKey,
        state: {
          init(_config, state) {
            return decorate(state.doc, '', -1)
          },
          apply(tr, prev) {
            const meta = tr.getMeta(findPluginKey)
            if (!meta && !tr.docChanged) return prev
            const query = meta ? meta.query : prev.query
            const current = meta && Number.isInteger(meta.current) ? meta.current : prev.current
            return decorate(tr.doc, query, current)
          },
        },
        props: {
          decorations(state) {
            return findPluginKey.getState(state)?.deco || DecorationSet.empty
          },
        },
      }),
    ]
  },
})

export function applyFind(editor, query, current) {
  if (!editor || editor.isDestroyed) return { count: 0, current: 0 }
  let view
  try {
    view = editor.view
  } catch {
    return { count: 0, current: 0 }
  }
  view.dispatch(editor.state.tr.setMeta(findPluginKey, { query, current }))
  const next = findPluginKey.getState(editor.state)
  const range = next.current >= 0 ? next.ranges[next.current] : null
  if (range) {
    try {
      const coords = view.coordsAtPos(range.from)
      const scroller = view.dom.closest('.page-scroll')
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const top = scroller.scrollTop + (coords.top - box.top) - box.height * 0.35
        scroller.scrollTo({ top: Math.max(0, top) })
      }
    } catch {
      // The match can sit on a position the view cannot measure yet.
    }
  }
  const index = next.count && next.current >= 0 ? next.current : 0
  return {
    count: next.count,
    current: index,
    matches: matchWindow(editor.state.doc, next.ranges, next.current),
  }
}
