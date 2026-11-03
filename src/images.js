export function resolveImageSrc(src, filePath) {
  if (!src) return ''
  if (/^(https?:|data:|still:)/i.test(src)) return src
  const absolute = src.startsWith('/') ? normalize(src) : normalize(`${directoryOf(filePath)}/${src}`)
  return `still://image/?p=${encodeURIComponent(absolute)}`
}

function directoryOf(filePath) {
  if (!filePath) return ''
  const index = filePath.lastIndexOf('/')
  return index <= 0 ? '' : filePath.slice(0, index)
}

function normalize(value) {
  const parts = []
  for (const part of value.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}
