import assert from 'node:assert/strict'
import test from 'node:test'
import { relativePath } from '../src/paths.js'

test('relative path starts at the selected folder', () => {
  assert.equal(relativePath('/notes/chapter.md', ['/notes']), 'chapter.md')
  assert.equal(relativePath('/notes/Drafts/chapter.md', ['/notes']), 'Drafts/chapter.md')
  assert.equal(relativePath('/notes/nested/chapter.md', ['/notes', '/notes/nested']), 'chapter.md')
  assert.equal(relativePath('/notes', ['/notes']), 'notes')
})
