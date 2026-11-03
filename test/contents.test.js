import assert from 'node:assert/strict'
import test from 'node:test'
import { capPreview, collectContents } from '../src/contents.js'

function text(value) {
  return { type: { name: 'text' }, textContent: value, nodeSize: value.length, isText: true }
}

function hardBreak() {
  return { type: { name: 'hardBreak' }, textContent: '', nodeSize: 1 }
}

function paragraph(children) {
  return {
    type: { name: 'paragraph' },
    textContent: children.map((child) => child.textContent).join(''),
    forEach(fn) {
      children.forEach((child) => fn(child))
    },
  }
}

function heading(level, value) {
  return {
    type: { name: 'heading' },
    attrs: { level },
    textContent: value,
  }
}

function docOf(nodes) {
  let pos = 0
  const placed = nodes.map((node) => {
    const at = pos
    pos += 2
    return [node, at]
  })
  return {
    descendants(fn) {
      for (const [node, at] of placed) fn(node, at)
    },
  }
}

test('nests paragraphs under the current heading', () => {
  const items = collectContents(
    docOf([heading(1, 'Evening'), paragraph([text('The room was quiet and already dark.')])]),
  )
  assert.deepEqual(
    items.map((item) => [item.kind, item.level, item.text]),
    [
      ['heading', 1, 'Evening'],
      ['paragraph', 2, 'The room was quiet and already dark.'],
    ],
  )
})

test('collects consecutive lines under 200 characters into one entry', () => {
  const items = collectContents(
    docOf([
      heading(2, 'Scene'),
      paragraph([text('Scene: 1 of 2')]),
      paragraph([text('A'.repeat(150))]),
      paragraph([text('B'.repeat(200))]),
    ]),
  )
  assert.equal(items[1].kind, 'paragraph')
  assert.equal(items[1].text, `Scene: 1 of 2 ${'A'.repeat(150)}`)
  assert.equal(items[1].level, 3)
  assert.equal(items[2].text, 'B'.repeat(200))
})

test('splits a paragraph on hard breaks and keeps a long line alone', () => {
  const items = collectContents(
    docOf([
      paragraph([text('One'), hardBreak(), text('Two'), hardBreak(), text('B'.repeat(200))]),
    ]),
  )
  assert.equal(items[0].text, 'One Two')
  assert.equal(items[1].text.length, 200)
})

test('splits newline-separated lines and leaves a long line on its own', () => {
  const items = collectContents(
    docOf([
      paragraph([
        text('Chapter: Evening\nScene: 1 of 2\nVersion: 1.1.0\n' + 'G'.repeat(200) + '\nPresent: the room'),
      ]),
    ]),
  )
  assert.deepEqual(
    items.map((item) => item.text),
    ['Chapter: Evening Scene: 1 of 2 Version: 1.1.0', 'G'.repeat(200), 'Present: the room'],
  )
})

test('an empty paragraph keeps short lines from joining', () => {
  const items = collectContents(
    docOf([paragraph([text('Alpha')]), paragraph([]), paragraph([text('Beta')])]),
  )
  assert.deepEqual(
    items.map((item) => item.text),
    ['Alpha', 'Beta'],
  )
})

test('caps a hover preview at 100 characters', () => {
  const preview = capPreview(`${'word '.repeat(40)}end`)
  assert.equal(preview.length, 100)
  assert.equal(preview.endsWith('…'), true)
  assert.equal(capPreview('Short line'), 'Short line')
})
