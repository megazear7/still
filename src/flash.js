import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const flashKey = new PluginKey('stillFlash')

export function blockRange(doc, pos) {
  const safe = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(safe)
  const after = $pos.nodeAfter
  if (after?.isBlock) return { from: safe, to: safe + after.nodeSize }
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).isBlock) return { from: $pos.before(depth), to: $pos.after(depth) }
  }
  return null
}

export const Flash = Extension.create({
  name: 'flash',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: flashKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, set) {
            const meta = tr.getMeta(flashKey)
            if (meta?.clear) return DecorationSet.empty
            if (meta && Number.isInteger(meta.from) && Number.isInteger(meta.to) && meta.to > meta.from) {
              return DecorationSet.create(tr.doc, [
                Decoration.node(meta.from, meta.to, { class: 'flash', 'data-flash': String(meta.nonce || 0) }),
              ])
            }
            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return flashKey.getState(state)
          },
        },
      }),
    ]
  },
})

export function flashBlock(editor, pos) {
  if (!editor || editor.isDestroyed) return
  const range = blockRange(editor.state.doc, pos)
  if (!range) return
  const selection = TextSelection.near(editor.state.doc.resolve(Math.min(range.from + 1, editor.state.doc.content.size)))
  const tr = editor.state.tr.setSelection(selection).setMeta(flashKey, {
    from: range.from,
    to: range.to,
    nonce: Date.now(),
  })
  editor.view.dispatch(tr)
  editor.view.focus()
  try {
    const coords = editor.view.coordsAtPos(Math.min(range.from + 1, editor.state.doc.content.size))
    const scroller = editor.view.dom.closest('.page-scroll')
    if (scroller) {
      const box = scroller.getBoundingClientRect()
      scroller.scrollTop = Math.max(0, scroller.scrollTop + (coords.top - box.top) - 28)
    }
  } catch {
    // The block can sit on a position the view cannot measure yet.
  }
  return range
}

export function clearFlash(editor) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(flashKey, { clear: true }))
}
