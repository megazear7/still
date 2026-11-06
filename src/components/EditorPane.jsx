import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Typography from '@tiptap/extension-typography'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useRef } from 'react'
import { collectContents } from '../contents'
import { clearFlash, flashBlock, Flash } from '../flash'
import { applyFind, FindHighlight } from '../find'
import { resolveImageSrc } from '../images'

function markdownOf(editor) {
  try {
    return editor.getMarkdown()
  } catch {
    return ''
  }
}

function createImageExtension(filePathRef, painters) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img')
        let current = node
        const paint = () => {
          img.alt = current.attrs.alt || ''
          if (current.attrs.title) img.title = current.attrs.title
          else img.removeAttribute('title')
          img.src = resolveImageSrc(current.attrs.src, filePathRef.current)
        }
        painters.current.add(paint)
        paint()
        return {
          dom: img,
          update(next) {
            if (next.type.name !== 'image') return false
            current = next
            paint()
            return true
          },
          destroy() {
            painters.current.delete(paint)
          },
        }
      }
    },
  })
}

export function EditorPane({ path, initialMarkdown, onChange, onHeadings, onActiveHeading, jumpRef, findRef, replaceRef }) {
  const filePathRef = useRef(path)
  const painters = useRef(new Set())
  const editorRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const onHeadingsRef = useRef(onHeadings)
  const onActiveRef = useRef(onActiveHeading)
  const originalRef = useRef(initialMarkdown)
  const baselineRef = useRef(null)
  const armedRef = useRef(false)
  const frame = useRef(0)
  const findToken = useRef({})
  const itemsRef = useRef([])
  filePathRef.current = path
  onChangeRef.current = onChange
  onHeadingsRef.current = onHeadings
  onActiveRef.current = onActiveHeading

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      createImageExtension(filePathRef, painters),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Write' }),
      Typography,
      Markdown,
      FindHighlight,
      Flash,
    ],
    [],
  )

  const editor = useEditor({
    immediatelyRender: true,
    extensions,
    content: initialMarkdown,
    contentType: 'markdown',
    autofocus: 'start',
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
      handlePaste(_view, event) {
        const current = editorRef.current
        if (!current) return false
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        if (!text || (html && html.trim())) return false
        current.commands.insertContent(text, { contentType: 'markdown' })
        return true
      },
      handleDrop(_view, event) {
        if (event.dataTransfer?.files?.length) return true
        return false
      },
      handleClick(_view, _pos, event) {
        const anchor = event.target instanceof Element ? event.target.closest('a') : null
        if (!anchor) return false
        if (!(event.metaKey || event.ctrlKey)) return false
        const href = anchor.getAttribute('href')
        if (href) window.still?.openExternal(href)
        return true
      },
    },
    onCreate: ({ editor: created }) => {
      editorRef.current = created
      baselineRef.current = markdownOf(created)
      publishContents(created)
      const pinTop = () => {
        const scroller = created.view.dom.closest('.page-scroll')
        if (scroller) scroller.scrollTop = 0
      }
      pinTop()
      requestAnimationFrame(pinTop)
    },
    onUpdate: ({ editor: updated }) => {
      editorRef.current = updated
      const markdown = markdownOf(updated)
      publishContents(updated)
      if (markdown === baselineRef.current) {
        if (armedRef.current) onChangeRef.current(originalRef.current)
        return
      }
      armedRef.current = true
      onChangeRef.current(markdown)
    },
  })

  if (findRef) {
    const token = findToken.current
    findRef.current = {
      token,
      apply(query, current) {
        return applyFind(editorRef.current, query, current)
      },
    }
  }

  useEffect(() => {
    const token = findToken.current
    return () => {
      if (findRef?.current?.token === token) {
        findRef.current = { apply: () => ({ count: 0, current: 0 }) }
      }
    }
  }, [findRef])

  useEffect(() => {
    painters.current.forEach((paint) => paint())
  }, [path])

  useEffect(() => {
    if (!replaceRef) return undefined
    replaceRef.current = (markdown) => {
      const current = editorRef.current
      if (!current) return markdown
      const scroller = current.view.dom.closest('.page-scroll')
      const top = scroller ? scroller.scrollTop : 0
      current.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
      const normalized = markdownOf(current)
      originalRef.current = normalized
      baselineRef.current = normalized
      armedRef.current = false
      publishContents(current)
      if (scroller) {
        scroller.scrollTop = top
        requestAnimationFrame(() => {
          scroller.scrollTop = top
        })
      }
      return normalized
    }
    return () => {
      replaceRef.current = () => {}
    }
  }, [editor, replaceRef])

  useEffect(() => {
    let timer = 0
    jumpRef.current = (pos) => {
      const current = editorRef.current
      if (!current) return
      flashBlock(current, pos)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => clearFlash(editorRef.current), 1200)
    }
    return () => {
      window.clearTimeout(timer)
      jumpRef.current = () => {}
    }
  }, [editor, jumpRef])

  function publishContents(current) {
    const items = collectContents(current.state.doc)
    itemsRef.current = items
    onHeadingsRef.current(items)
  }

  function updateActive(scroller) {
    const items = itemsRef.current
    const current = editorRef.current
    if (!items.length || !current) {
      onActiveRef.current(-1)
      return
    }
    const edge = scroller.getBoundingClientRect().top + 48
    let active = 0
    items.forEach((item, index) => {
      try {
        const at = Math.min(item.pos + 1, current.state.doc.content.size)
        if (current.view.coordsAtPos(at).top <= edge) active = index
      } catch {
        // A position can disappear between updates.
      }
    })
    onActiveRef.current(active)
  }

  return (
    <div
      className="page-scroll"
      onScroll={(event) => {
        const scroller = event.currentTarget
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => updateActive(scroller))
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
