const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('node:test')
const { createLibrary } = require('../electron/files.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'still-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'still-out-'))
  const state = {
    roots: [root],
    lastFile: null,
    mode: 'files',
    expanded: [],
    bounds: null,
  }
  return { root, outside, lib: createLibrary({ memory: state }) }
}

test('lists notes, hides dotfiles and node_modules, sorts folders first', () => {
  const { root, lib } = setup()
  fs.mkdirSync(path.join(root, 'Drafts'))
  fs.writeFileSync(path.join(root, 'b.md'), 'b')
  fs.writeFileSync(path.join(root, 'a.md'), 'a')
  fs.writeFileSync(path.join(root, '.secret.md'), 'nope')
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg.js'), '')
  const names = lib.list(root).map((entry) => entry.name)
  assert.deepEqual(names, ['Drafts', 'a.md', 'b.md'])
})

test('refuses to read or write outside the selected folder', () => {
  const { root, outside, lib } = setup()
  const outsideFile = path.join(outside, 'nope.md')
  fs.writeFileSync(outsideFile, 'secret')
  assert.throws(() => lib.read(outsideFile), /Outside/)
  assert.throws(() => lib.write(outsideFile, 'changed'), /Outside/)
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'secret')
  assert.throws(() => lib.list(path.join(root, '..', path.basename(outside))), /Outside|Not found/)
})

test('writes atomically and round-trips text', () => {
  const { root, lib } = setup()
  const file = path.join(root, 'note.md')
  fs.writeFileSync(file, 'old')
  lib.write(file, '# Hello\n')
  assert.equal(lib.read(file), '# Hello\n')
  assert.equal(fs.readdirSync(root).some((name) => name.includes('still-tmp')), false)
})

test('renames, duplicates, and refuses to clobber', () => {
  const { root, lib } = setup()
  const file = path.join(root, 'note.md')
  fs.writeFileSync(file, 'body')
  const renamed = lib.rename(file, 'essay.md')
  assert.equal(path.basename(renamed.path), 'essay.md')
  assert.equal(fs.readFileSync(renamed.path, 'utf8'), 'body')
  const copy = lib.duplicate(renamed.path)
  assert.equal(path.basename(copy.path), 'essay copy.md')
  const again = lib.duplicate(renamed.path)
  assert.equal(path.basename(again.path), 'essay copy 2.md')
  fs.writeFileSync(path.join(root, 'taken.md'), 'x')
  assert.throws(() => lib.rename(renamed.path, 'taken.md'), /Already exists/)
  assert.throws(() => lib.rename(renamed.path, '../escape.md'), /Invalid name/)
})

test('moves files and will not move a folder into itself', () => {
  const { root, lib } = setup()
  const dest = path.join(root, 'Archive')
  fs.mkdirSync(dest)
  const file = path.join(root, 'note.md')
  fs.writeFileSync(file, 'body')
  const moved = lib.move(file, dest)
  assert.equal(moved.path, fs.realpathSync(path.join(dest, 'note.md')))
  assert.equal(fs.existsSync(file), false)
  fs.mkdirSync(path.join(dest, 'nested'))
  assert.throws(() => lib.move(dest, path.join(dest, 'nested')), /itself/)
})

test('does not delete a selected root folder', () => {
  const { root, lib } = setup()
  const child = path.join(root, 'gone.md')
  fs.writeFileSync(child, 'x')
  lib.remove(child)
  assert.equal(fs.existsSync(child), false)
  assert.throws(() => lib.remove(root), /root/)
  assert.equal(fs.existsSync(root), true)
})

test('lists files and folders reached through a symlink', () => {
  const { root, lib } = setup()
  const real = path.join(root, 'nested')
  fs.mkdirSync(real)
  fs.writeFileSync(path.join(real, 'note.md'), 'inside')
  fs.symlinkSync(real, path.join(root, 'linked'))
  const names = lib.list(root).map((entry) => `${entry.type}:${entry.name}`)
  assert.ok(names.includes('dir:nested'))
  assert.ok(names.includes('dir:linked'))
  assert.deepEqual(lib.list(path.join(root, 'linked')).map((entry) => entry.name), ['note.md'])
})

test('searches names before note text and skips hidden files', () => {
  const { root, lib } = setup()
  fs.mkdirSync(path.join(root, 'Drafts'))
  fs.writeFileSync(path.join(root, 'Drafts', 'lantern.md'), 'A quiet evening.')
  fs.writeFileSync(path.join(root, 'evening.md'), 'The lantern was lit.')
  fs.writeFileSync(path.join(root, '.hidden.md'), 'lantern')
  const results = lib.search('lantern')
  assert.equal(results[0].name, 'lantern.md')
  assert.equal(results[0].snippet, undefined)
  assert.equal(results[1].name, 'evening.md')
  assert.match(results[1].snippet, /lantern/)
  assert.equal(results.some((entry) => entry.name.startsWith('.')), false)
  assert.deepEqual(lib.search('   '), [])
})

test('remembers a panel width inside the allowed range', () => {
  const { lib } = setup()
  assert.equal(lib.patchState({ side: 320 }).side, 320)
  assert.equal(lib.patchState({ side: 20 }).side, 180)
  assert.equal(lib.patchState({ side: 900 }).side, 560)
})

test('saves editor text as a copy and leaves the original file alone', () => {
  const { root, lib } = setup()
  const file = path.join(root, 'chapter.md')
  fs.writeFileSync(file, 'theirs')
  const copy = lib.saveCopy(file, 'mine')
  assert.equal(fs.readFileSync(file, 'utf8'), 'theirs')
  assert.equal(fs.readFileSync(copy.path, 'utf8'), 'mine')
  assert.equal(path.basename(copy.path), 'chapter copy.md')
  const again = lib.saveCopy(file, 'mine again')
  assert.equal(path.basename(again.path), 'chapter copy 2.md')
})

test('creates uniquely named notes and imports a file from outside', () => {
  const { root, outside, lib } = setup()
  const first = lib.createFile(root)
  const second = lib.createFile(root)
  assert.equal(path.basename(first.path), 'untitled.md')
  assert.equal(path.basename(second.path), 'untitled 2.md')
  const external = path.join(outside, 'brought.md')
  fs.writeFileSync(external, 'from outside')
  const imported = lib.importPaths([external], root)
  assert.equal(lib.read(imported.paths[0]), 'from outside')
  assert.equal(fs.readFileSync(external, 'utf8'), 'from outside')
})

test('versions an unversioned note, then a named version, into a new archive folder', () => {
  const { root, outside, lib } = setup()
  const file = path.join(root, 'chapter.md')
  fs.writeFileSync(file, 'first draft')
  const patch = lib.versionFile(file, 'patch')
  assert.equal(path.basename(patch.path), 'chapter v1.0.1.md')
  assert.equal(fs.readFileSync(patch.path, 'utf8'), 'first draft')
  assert.equal(path.basename(patch.archived), 'chapter v1.0.0.md')
  assert.equal(fs.readFileSync(patch.archived, 'utf8'), 'first draft')
  assert.equal(fs.existsSync(file), false)
  assert.equal(fs.existsSync(path.join(root, 'archive')), true)

  const minor = lib.versionFile(patch.path, 'minor')
  assert.equal(path.basename(minor.path), 'chapter v1.1.0.md')
  assert.equal(path.basename(minor.archived), 'chapter v1.0.1.md')

  const scene = path.join(root, 'Ch3-scene1-waystation v1.2.0.md')
  fs.writeFileSync(scene, 'Waystation v1.2.0, also 1.2.0, not 11.2.0.')
  const major = lib.versionFile(scene, 'major')
  assert.equal(path.basename(major.path), 'Ch3-scene1-waystation v2.0.0.md')
  assert.equal(fs.readFileSync(major.path, 'utf8'), 'Waystation v2.0.0, also 2.0.0, not 11.2.0.')
  assert.equal(
    fs.readFileSync(path.join(root, 'archive', 'Ch3-scene1-waystation v1.2.0.md'), 'utf8'),
    'Waystation v1.2.0, also 1.2.0, not 11.2.0.',
  )

  const plain = path.join(root, 'notes 1.2.0.md')
  fs.writeFileSync(plain, 'plain')
  const bumped = lib.versionFile(plain, 'patch')
  assert.equal(path.basename(bumped.path), 'notes 1.2.1.md')
  assert.equal(path.basename(bumped.archived), 'notes 1.2.0.md')

  const labeled = path.join(root, 'labeled.md')
  fs.writeFileSync(labeled, 'Draft v1.0.0 is ready.')
  const labeledPatch = lib.versionFile(labeled, 'patch')
  assert.equal(fs.readFileSync(labeledPatch.path, 'utf8'), 'Draft v1.0.1 is ready.')
  assert.equal(fs.readFileSync(labeledPatch.archived, 'utf8'), 'Draft v1.0.0 is ready.')

  fs.writeFileSync(path.join(root, 'chapter v1.1.1.md'), 'taken')
  assert.throws(() => lib.versionFile(minor.path, 'patch'), /Already exists/)
  assert.equal(fs.existsSync(minor.path), true)

  fs.mkdirSync(path.join(root, 'folder'))
  assert.throws(() => lib.versionFile(path.join(root, 'folder'), 'patch'), /Not a file/)
  const outsideFile = path.join(outside, 'nope.md')
  fs.writeFileSync(outsideFile, 'no')
  assert.throws(() => lib.versionFile(outsideFile, 'minor'), /Outside/)

  const again = path.join(root, 'repeat.md')
  fs.writeFileSync(again, 'one')
  const firstRepeat = lib.versionFile(again, 'patch')
  fs.writeFileSync(path.join(root, 'archive', 'repeat v1.0.1.md'), 'already filed')
  const archivedTwice = lib.versionFile(firstRepeat.path, 'patch')
  assert.equal(path.basename(archivedTwice.path), 'repeat v1.0.2.md')
  assert.equal(path.basename(archivedTwice.archived), 'repeat v1.0.1 2.md')
  assert.equal(fs.readFileSync(path.join(root, 'archive', 'repeat v1.0.0.md'), 'utf8'), 'one')
  assert.equal(fs.readFileSync(path.join(root, 'archive', 'repeat v1.0.1.md'), 'utf8'), 'already filed')
})
