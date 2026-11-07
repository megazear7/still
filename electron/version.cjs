const path = require('path')

const LEVELS = new Set(['major', 'minor', 'patch'])

function lastVersion(stem) {
  const pattern = /v?\d+\.\d+\.\d+/gi
  let match = null
  let last = null
  while ((match = pattern.exec(stem))) last = match
  return last
}

function withInitialVersion(stem) {
  if (lastVersion(stem)) return stem
  return `${String(stem).trimEnd()} v1.0.0`
}

function bumpStem(stem, level) {
  if (!LEVELS.has(level)) throw new Error('Invalid version')
  const base = withInitialVersion(stem)
  const last = lastVersion(base)
  const numbers = last[0].match(/(\d+)\.(\d+)\.(\d+)/)
  let major = Number(numbers[1])
  let minor = Number(numbers[2])
  let patch = Number(numbers[3])
  if (level === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (level === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  const prefix = last[0][0] === 'v' || last[0][0] === 'V' ? last[0][0] : ''
  const next = `${prefix}${major}.${minor}.${patch}`
  return base.slice(0, last.index) + next + base.slice(last.index + last[0].length)
}

function versionNames(fileName, level) {
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  const currentStem = withInitialVersion(stem)
  const nextStem = bumpStem(stem, level)
  return {
    currentName: `${currentStem}${ext}`,
    nextName: `${nextStem}${ext}`,
    from: lastVersion(currentStem)[0],
    to: lastVersion(nextStem)[0],
  }
}

function replaceVersion(content, fromToken, toToken) {
  const fromNumbers = String(fromToken).match(/(\d+)\.(\d+)\.(\d+)/)
  const toNumbers = String(toToken).match(/(\d+)\.(\d+)\.(\d+)/)
  if (!fromNumbers || !toNumbers || typeof content !== 'string') return content
  const escaped = fromNumbers[0].replace(/\./g, '\\.')
  const pattern = new RegExp(`(?<![A-Za-z0-9.])([vV])?${escaped}(?!\\d)(?!\\.\\d)`, 'g')
  return content.replace(pattern, (_match, prefix) => `${prefix || ''}${toNumbers[0]}`)
}

module.exports = { versionNames, replaceVersion }
