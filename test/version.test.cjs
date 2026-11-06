const assert = require('node:assert/strict')
const test = require('node:test')
const { versionNames } = require('../electron/version.cjs')

test('assigns 1.0.0 before bumping a name that has no version', () => {
  assert.deepEqual(versionNames('chapter.md', 'patch'), {
    currentName: 'chapter v1.0.0.md',
    nextName: 'chapter v1.0.1.md',
  })
  assert.deepEqual(versionNames('chapter.md', 'minor'), {
    currentName: 'chapter v1.0.0.md',
    nextName: 'chapter v1.1.0.md',
  })
  assert.deepEqual(versionNames('chapter.md', 'major'), {
    currentName: 'chapter v1.0.0.md',
    nextName: 'chapter v2.0.0.md',
  })
})

test('bumps the trailing semantic version and keeps its prefix', () => {
  assert.equal(versionNames('Ch3-scene1-waystation v1.2.0.md', 'minor').nextName, 'Ch3-scene1-waystation v1.3.0.md')
  assert.equal(versionNames('Ch3-scene1-waystation v1.2.0.md', 'major').nextName, 'Ch3-scene1-waystation v2.0.0.md')
  assert.equal(versionNames('notes 1.2.0.md', 'patch').nextName, 'notes 1.2.1.md')
  assert.equal(versionNames('notes 1.2.0.md', 'patch').currentName, 'notes 1.2.0.md')
  assert.throws(() => versionNames('chapter.md', 'build'), /Invalid version/)
})
