export function baseName(filePath) {
  if (!filePath) return ''
  const parts = String(filePath).split('/').filter(Boolean)
  return parts[parts.length - 1] || filePath
}

export function parentDir(filePath) {
  const index = String(filePath).lastIndexOf('/')
  if (index <= 0) return '/'
  return filePath.slice(0, index)
}

export function rebasePath(target, from, to) {
  if (!target || !from || !to) return target
  if (target === from) return to
  if (target.startsWith(`${from}/`)) return to + target.slice(from.length)
  return target
}

const NOTE_EXT = new Set(['md', 'markdown', 'mdown', 'mdx', 'txt', 'text'])

export function isNoteName(name) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return true
  return NOTE_EXT.has(name.slice(dot + 1).toLowerCase())
}

export function canDrop(src, dest) {
  if (!src || !dest) return false
  if (src === dest) return false
  if (dest.startsWith(`${src}/`)) return false
  if (parentDir(src) === dest) return false
  return true
}
