import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getComputerId,
  hashStyleFolder,
  ensureScaffold,
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
