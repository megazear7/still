export function capPreview(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= 100) return clean
  return `${clean.slice(0, 99).trimEnd()}…`
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function linesFromParagraph(node, pos) {
  const lines = []
  let text = ''
  let linePos = pos
  let cursor = pos + 1

  function flush() {
    const cleaned = clean(text)
    text = ''
    if (cleaned) lines.push({ type: 'line', text: cleaned, pos: linePos })
  }

  function takeText(value, start) {
    const parts = String(value || '').split('\n')
    let local = 0
    parts.forEach((part, index) => {
      if (index > 0) {
        flush()
        local += 1
        linePos = start + local
        if (part === '') lines.push({ type: 'break' })
      }
      text += part
      local += part.length
    })
  }

  node.forEach((child) => {
    if (child.type?.name === 'hardBreak') {
      flush()
      cursor += child.nodeSize
      linePos = cursor
      return
    }
    if (child.isText) takeText(child.textContent, cursor)
    else text += child.textContent || ''
    cursor += child.nodeSize || 0
  })
  flush()
  return lines
}

function groupBlocks(blocks) {
  const items = []
  let pending = []
  let headingLevel = 0

  function flush() {
    if (!pending.length) return
    items.push({
      kind: 'paragraph',
      level: headingLevel + 1,
      text: pending.map((line) => line.text).join(' '),
      pos: pending[0].pos,
    })
    pending = []
  }

  for (const block of blocks) {
    if (block.type === 'heading') {
      flush()
      headingLevel = block.level || 1
      items.push({
        kind: 'heading',
        level: headingLevel,
        text: block.text,
        pos: block.pos,
      })
      continue
    }
    if (block.type === 'break') {
      flush()
      continue
    }
    if (block.text.length < 200) {
      pending.push(block)
      continue
    }
    flush()
    items.push({
      kind: 'paragraph',
      level: headingLevel + 1,
      text: block.text,
      pos: block.pos,
    })
  }
  flush()
  return items
}

export function collectContents(doc) {
  const blocks = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      blocks.push({ type: 'heading', level: node.attrs.level, text: clean(node.textContent), pos })
      return false
    }
    if (node.type.name === 'paragraph') {
      const lines = linesFromParagraph(node, pos)
      if (!lines.length) blocks.push({ type: 'break' })
      else blocks.push(...lines)
      return false
    }
    return undefined
  })
  return groupBlocks(blocks)
}
