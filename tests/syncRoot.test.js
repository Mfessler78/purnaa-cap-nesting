// The machine-level sync-root memory (~/.purnaa-tools/sync-root.json) is what
// keeps "Retrieve New Styles from P Drive" working when the app is closed or the
// launcher lives in a different app copy. Protect the read/write pair directly.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSyncRootFile, writeSyncRootFile } from '../src/lib/pdriveSync.js'

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncroot-'))
  return path.join(dir, 'nested', 'sync-root.json')
}

test('write/read roundtrip returns the same path', () => {
  const file = tmpFile()
  writeSyncRootFile('P:\\zPurnaa-Cap-Nesting-Sync', file)
  assert.equal(readSyncRootFile(file), 'P:\\zPurnaa-Cap-Nesting-Sync')
})

test('write creates missing parent directories', () => {
  const file = tmpFile()
  assert.equal(fs.existsSync(path.dirname(file)), false)
  writeSyncRootFile('/Volumes/Purnaa/Sync', file)
  assert.equal(readSyncRootFile(file), '/Volumes/Purnaa/Sync')
})

test('missing file reads as empty string', () => {
  assert.equal(readSyncRootFile(tmpFile()), '')
})

test('corrupt file reads as empty string', () => {
  const file = tmpFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json')
  assert.equal(readSyncRootFile(file), '')
})

test('empty path is a no-op (never clobbers a saved value)', () => {
  const file = tmpFile()
  writeSyncRootFile('/Volumes/Purnaa/Sync', file)
  writeSyncRootFile('', file)
  writeSyncRootFile(null, file)
  assert.equal(readSyncRootFile(file), '/Volumes/Purnaa/Sync')
})
