import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getComputerId,
  hashStyleFolder,
  ensureScaffold,
  readEvents,
  replay,
  seedFromLocal,
  reconcile,
  writeEvent,
  listStyleDirs,
  EVENTS_DIR,
  CURRENT_DIR,
  BACKUPS_DIR,
} from '../src/lib/pdriveSync.js'

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pdrivesync-'))
}

// Build a style folder with the given { relativePath: contents } map.
function makeStyle(root, files) {
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, ...rel.split('/'))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, contents)
  }
  return root
}

// ---- hashStyleFolder ------------------------------------------------------

test('hashStyleFolder is deterministic and content-sensitive', () => {
  const a = makeStyle(path.join(tmp(), 'S'), {
    'style.json': '{"style":"S","updatedAt":"x"}',
    'template.pdf': 'PDFBYTES-1',
    'prenest.pdf': 'PDFBYTES-2',
  })
  const h1 = hashStyleFolder(a)
  const h2 = hashStyleFolder(a)
  assert.equal(h1, h2, 'same folder → same hash')

  // Identical contents in a different folder → identical hash (OS/order-independent).
  const b = makeStyle(path.join(tmp(), 'DIFFERENT-NAME'), {
    'prenest.pdf': 'PDFBYTES-2', // written in a different order on purpose
    'template.pdf': 'PDFBYTES-1',
    'style.json': '{"style":"S","updatedAt":"x"}',
  })
  assert.equal(hashStyleFolder(b), h1, 'identical contents → identical hash regardless of name/order')

  // One changed byte → different hash (a real save is an update).
  const c = makeStyle(path.join(tmp(), 'S'), {
    'style.json': '{"style":"S","updatedAt":"CHANGED"}',
    'template.pdf': 'PDFBYTES-1',
    'prenest.pdf': 'PDFBYTES-2',
  })
  assert.notEqual(hashStyleFolder(c), h1, 'changed content → different hash')
})

test('hashStyleFolder distinguishes path from content (no boundary confusion)', () => {
  const a = makeStyle(path.join(tmp(), 'S'), { ab: 'x', c: 'y' })
  const b = makeStyle(path.join(tmp(), 'S'), { a: 'bx', c: 'y' })
  assert.notEqual(hashStyleFolder(a), hashStyleFolder(b), 'path/content boundary is unambiguous')
})

// ---- ensureScaffold -------------------------------------------------------

test('ensureScaffold creates events/current/backups and is idempotent', () => {
  const root = path.join(tmp(), 'sync-root')
  const p1 = ensureScaffold(root)
  for (const d of [EVENTS_DIR, CURRENT_DIR, BACKUPS_DIR]) {
    assert.ok(fs.statSync(path.join(root, d)).isDirectory(), `${d} created`)
  }
  // Second call must not throw and returns the same paths.
  const p2 = ensureScaffold(root)
  assert.deepEqual(p1, p2)
})

// ---- getComputerId --------------------------------------------------------

test('getComputerId mints once, then is stable', () => {
  const idFile = path.join(tmp(), 'nested', 'computer-id')
  const first = getComputerId(idFile)
  assert.match(first, /^[a-z0-9-]+-[0-9a-f]{6}$/, 'slug-hex shape')
  const second = getComputerId(idFile)
  assert.equal(second, first, 'stable across calls (reads the saved file)')
  assert.equal(fs.readFileSync(idFile, 'utf8').trim(), first)
})

// ---- replay ---------------------------------------------------------------

test('replay folds add/update/delete by time, tie-break by filename', () => {
  // rename = delete old + add new: PUR_OLD must NOT survive.
  const events = [
    { op: 'add', style: 'A', at: '2026-07-01T10:00:00.000Z', hash: 'h1', _file: 'f1' },
    { op: 'add', style: 'PUR_OLD', at: '2026-07-01T11:00:00.000Z', hash: 'h2', _file: 'f2' },
    { op: 'delete', style: 'PUR_OLD', at: '2026-07-01T12:00:00.000Z', _file: 'f3' },
    { op: 'add', style: 'PUR_NEW', at: '2026-07-01T12:00:00.000Z', hash: 'h3', _file: 'f4' },
    { op: 'update', style: 'A', at: '2026-07-02T09:00:00.000Z', hash: 'h1b', _file: 'f5' },
  ]
  const set = replay(events)
  assert.deepEqual([...set.keys()].sort(), ['A', 'PUR_NEW'], 'renamed/deleted style is gone')
  assert.equal(set.get('A').hash, 'h1b', 'latest hash wins')
})

// ---- seedFromLocal (Stage 2 migration) ------------------------------------

function makeStyleDir(stylesDir, name, files) {
  makeStyle(path.join(stylesDir, name), { 'style.json': `{"style":"${name}"}`, ...files })
}

test('seedFromLocal seeds fresh root; replay reproduces the exact local set', () => {
  const stylesDir = path.join(tmp(), 'styles')
  makeStyleDir(stylesDir, 'PUR1', { 'template.pdf': 'T1', 'prenest.pdf': 'P1' })
  makeStyleDir(stylesDir, 'PUR2', { 'template.pdf': 'T2', 'prenest.pdf': 'P2' })
  makeStyleDir(stylesDir, 'PUR3', { 'template.pdf': 'T3', 'prenest.pdf': 'P3' })
  const root = path.join(tmp(), 'sync')

  const r = seedFromLocal({ stylesDir, root, by: 'test-abc123' })
  assert.deepEqual(r.added.sort(), ['PUR1', 'PUR2', 'PUR3'])
  assert.equal(r.updated.length, 0)
  assert.ok(r.snapshot, 'a snapshot was written on first seed')

  // current/ mirrors local, byte-for-byte (hashes match).
  for (const s of ['PUR1', 'PUR2', 'PUR3']) {
    assert.equal(
      hashStyleFolder(path.join(root, CURRENT_DIR, s)),
      hashStyleFolder(path.join(stylesDir, s)),
      `${s} copied into current/`,
    )
  }
  // Exactly one snapshot folder exists under backups/.
  const backups = fs.readdirSync(path.join(root, BACKUPS_DIR)).filter((n) => n.startsWith('backup-'))
  assert.equal(backups.length, 1)

  // Replay reproduces exactly today's set.
  const desired = replay(readEvents(path.join(root, EVENTS_DIR)))
  assert.deepEqual([...desired.keys()].sort(), ['PUR1', 'PUR2', 'PUR3'])
})

test('seedFromLocal is idempotent (no new events/snapshots on re-run)', () => {
  const stylesDir = path.join(tmp(), 'styles')
  makeStyleDir(stylesDir, 'PUR1', { 'template.pdf': 'T1' })
  makeStyleDir(stylesDir, 'PUR2', { 'template.pdf': 'T2' })
  const root = path.join(tmp(), 'sync')

  seedFromLocal({ stylesDir, root, by: 'x' })
  const eventsAfter1 = fs.readdirSync(path.join(root, EVENTS_DIR)).length
  const backupsAfter1 = fs.readdirSync(path.join(root, BACKUPS_DIR)).length

  const r2 = seedFromLocal({ stylesDir, root, by: 'x' })
  assert.deepEqual(r2.unchanged.sort(), ['PUR1', 'PUR2'], 'all unchanged on re-run')
  assert.equal(r2.added.length + r2.updated.length, 0)
  assert.equal(r2.snapshot, null, 'no snapshot when nothing changed')
  assert.equal(fs.readdirSync(path.join(root, EVENTS_DIR)).length, eventsAfter1, 'no new events')
  assert.equal(fs.readdirSync(path.join(root, BACKUPS_DIR)).length, backupsAfter1, 'no new snapshot')
})

test('seedFromLocal writes an update event when a style changed since last seed', () => {
  const stylesDir = path.join(tmp(), 'styles')
  makeStyleDir(stylesDir, 'PUR1', { 'template.pdf': 'T1' })
  const root = path.join(tmp(), 'sync')

  seedFromLocal({ stylesDir, root, by: 'x' })
  // Edit the style, re-seed.
  fs.writeFileSync(path.join(stylesDir, 'PUR1', 'template.pdf'), 'T1-CHANGED')
  const r2 = seedFromLocal({ stylesDir, root, by: 'x' })

  assert.deepEqual(r2.updated, ['PUR1'])
  assert.ok(r2.snapshot, 'a change triggers a fresh snapshot')
  const desired = replay(readEvents(path.join(root, EVENTS_DIR)))
  assert.equal(desired.size, 1, 'still one style, not duplicated')
  assert.equal(
    desired.get('PUR1').hash,
    hashStyleFolder(path.join(stylesDir, 'PUR1')),
    'replayed hash tracks the new content',
  )
})

// ---- reconcile (Stage 3 retrieve) -----------------------------------------

// Build a sync root seeded with the given style names, plus a separate local
// styles dir. Returns { root, localDir, master }.
function seededWorld(styleNames) {
  const master = path.join(tmp(), 'master-styles')
  for (const s of styleNames) makeStyleDir(master, s, { 'template.pdf': `T-${s}`, 'prenest.pdf': `P-${s}` })
  const root = path.join(tmp(), 'sync')
  seedFromLocal({ stylesDir: master, root, by: 'master' })
  return { root, localDir: path.join(tmp(), 'local-styles'), master }
}

// Copy a style from the root's current/ into a local styles dir (byte-identical,
// so its hash matches → the "unchanged/skip" path).
function pullLocal(root, localDir, style) {
  fs.mkdirSync(localDir, { recursive: true })
  fs.cpSync(path.join(root, CURRENT_DIR, style), path.join(localDir, style), { recursive: true })
}

test('reconcile adds new, skips unchanged (10 local / 11 desired)', () => {
  const names = Array.from({ length: 11 }, (_, i) => `PUR${i + 1}`)
  const { root, localDir } = seededWorld(names)
  for (const s of names.slice(0, 10)) pullLocal(root, localDir, s) // 10 present, PUR11 missing

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.deepEqual(r.added, ['PUR11'])
  assert.equal(r.updated.length, 0)
  assert.equal(r.unchanged.length, 10)
  assert.equal(r.removed.length, 0)
  assert.deepEqual(listStyleDirs(localDir).sort(), names.sort())
})

test('reconcile deletes a local outlier and parks it in backups/ (12 local / 11 desired)', () => {
  const names = Array.from({ length: 11 }, (_, i) => `PUR${i + 1}`)
  const { root, localDir } = seededWorld(names)
  for (const s of names) pullLocal(root, localDir, s)
  makeStyleDir(localDir, 'PUR_OUTLIER', { 'template.pdf': 'orphan-bytes' }) // 12th, not in set

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.deepEqual(r.removed, ['PUR_OUTLIER'])
  assert.ok(!fs.existsSync(path.join(localDir, 'PUR_OUTLIER')), 'outlier removed locally')
  // Bytes are recoverable in backups/deleted/.
  const deleted = fs.readdirSync(path.join(root, BACKUPS_DIR, 'deleted'))
  assert.equal(deleted.length, 1)
  assert.match(deleted[0], /^PUR_OUTLIER__/)
  assert.equal(
    fs.readFileSync(path.join(root, BACKUPS_DIR, 'deleted', deleted[0], 'template.pdf'), 'utf8'),
    'orphan-bytes',
  )
})

test('reconcile updates a locally-stale style', () => {
  const { root, localDir } = seededWorld(['PUR1'])
  pullLocal(root, localDir, 'PUR1')
  fs.writeFileSync(path.join(localDir, 'PUR1', 'template.pdf'), 'STALE-LOCAL-EDIT') // diverge

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.deepEqual(r.updated, ['PUR1'])
  assert.equal(
    fs.readFileSync(path.join(localDir, 'PUR1', 'template.pdf'), 'utf8'),
    'T-PUR1',
    'local now matches current/',
  )
})

test('reconcile: renamed-then-deleted style does not reappear', () => {
  const { root, localDir } = seededWorld(['PUR_NEW'])
  const events = path.join(root, EVENTS_DIR)
  // Simulate a rename that happened earlier: PUR_OLD added then deleted.
  writeEvent(events, { op: 'add', style: 'PUR_OLD', at: '2020-01-01T00:00:00.000Z', by: 'x', hash: 'h' })
  writeEvent(events, { op: 'delete', style: 'PUR_OLD', at: '2020-01-02T00:00:00.000Z', by: 'x' })
  // This machine still has the old name locally.
  makeStyleDir(localDir, 'PUR_OLD', { 'template.pdf': 'old' })
  pullLocal(root, localDir, 'PUR_NEW')

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.ok(r.removed.includes('PUR_OLD'), 'old name removed')
  assert.ok(!fs.existsSync(path.join(localDir, 'PUR_OLD')), 'old name gone, does not reappear')
  assert.deepEqual(listStyleDirs(localDir), ['PUR_NEW'])
})

test('reconcile: all-unchanged run makes no changes (fast path)', () => {
  const names = ['A', 'B', 'C']
  const { root, localDir } = seededWorld(names)
  for (const s of names) pullLocal(root, localDir, s)

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.equal(r.unchanged.length, 3)
  assert.equal(r.added.length + r.updated.length + r.removed.length, 0)
})

test('reconcile: style listed but absent from current/ is skipped, not deleted', () => {
  const { root, localDir } = seededWorld(['A'])
  pullLocal(root, localDir, 'A')
  // An event references B but current/B was never created.
  writeEvent(path.join(root, EVENTS_DIR), { op: 'add', style: 'B', at: '2030-01-01T00:00:00.000Z', by: 'x', hash: 'h' })

  const r = reconcile({ stylesDir: localDir, root, by: 'me' })
  assert.deepEqual(r.missing, ['B'])
  assert.equal(r.unchanged.length, 1) // A untouched
  assert.equal(r.added.length + r.removed.length, 0)
})

test('reconcile refuses to wipe local styles against an empty (unseeded) root', () => {
  const root = path.join(tmp(), 'empty-root')
  const localDir = path.join(tmp(), 'local')
  makeStyleDir(localDir, 'PUR1', { 'template.pdf': 'x' })
  assert.throws(() => reconcile({ stylesDir: localDir, root, by: 'me' }), /no style events yet/)
  assert.ok(fs.existsSync(path.join(localDir, 'PUR1')), 'local style left intact')
  // A genuinely-empty root with no local styles is a harmless no-op.
  const emptyLocal = path.join(tmp(), 'empty-local')
  fs.mkdirSync(emptyLocal, { recursive: true })
  const r = reconcile({ stylesDir: emptyLocal, root, by: 'me' })
  assert.equal(r.added.length + r.removed.length, 0)
})

test('listStyleDirs ignores folders without style.json', () => {
  const stylesDir = path.join(tmp(), 'styles')
  makeStyleDir(stylesDir, 'REAL', {})
  fs.mkdirSync(path.join(stylesDir, 'not-a-style'), { recursive: true })
  fs.writeFileSync(path.join(stylesDir, 'not-a-style', 'random.txt'), 'x')
  assert.deepEqual(listStyleDirs(stylesDir), ['REAL'])
})
