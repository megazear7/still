import assert from 'node:assert/strict'
import test from 'node:test'
import { decideExternal } from '../src/sync.js'

test('reloads an untouched note when the file changes elsewhere', () => {
  assert.equal(decideExternal({ editor: 'old', disk: 'old', touched: false, incoming: 'new' }), 'reload')
})

test('asks when local edits would be replaced', () => {
  assert.equal(decideExternal({ editor: 'mine', disk: 'old', touched: true, incoming: 'theirs' }), 'ask')
  assert.equal(decideExternal({ editor: 'mine', disk: 'mine', touched: true, incoming: 'theirs' }), 'ask')
})

test('ignores an echo of the content already on screen or on disk', () => {
  assert.equal(decideExternal({ editor: 'same', disk: 'same', touched: true, incoming: 'same' }), 'sync')
  assert.equal(decideExternal({ editor: 'shown', disk: 'raw', touched: false, incoming: 'raw' }), 'sync')
})
