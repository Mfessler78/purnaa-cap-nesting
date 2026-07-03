#!/usr/bin/env node
// Retrieve styles from the P-drive sync root by REPLAYING the event log and
// reconciling this machine against the desired set. Replaces the old "merge every
// snapshot" retrieve, which resurrected renamed/deleted styles and re-copied
// everything each time.
//
// Called by the "Retrieve New Styles from P Drive" launchers (Mac .command /
// Windows .bat) — one Node implementation, so both platforms behave identically.
// The sync root comes from the RUNNING app first (GET localhost/api/backup) and
// only falls back to this copy's data/backup.json — see resolveSyncRoot below.
// DATA only; never touches program code. Prints a per-line progress log here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getComputerId, reconcile } from '../src/lib/pdriveSync.js'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BACKUP_FILE = path.join(APP_ROOT, 'data', 'backup.json')
const PORT = Number(process.env.PORT) || 4173

function readLocalBackupPath() {
  try {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf8')
    return (JSON.parse(raw).path || '').trim()
  } catch {
    return ''
  }
}

// Resolve the sync folder, preferring the RUNNING app. The operator sets the
// folder in the browser, which the server stores in ITS app copy's
// data/backup.json. If this launcher lives in a different app copy (each keeps
// its own host-local, git-ignored backup.json), reading our own file would show
// "not set" even though the app has it. So ask the live server first — that is
// the folder the operator actually set — and only fall back to our own file
// when the app isn't running. Santosh keeps the app window open while working,
// so the server is normally up.
async function resolveSyncRoot() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/backup`, {
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const p = ((await res.json()).path || '').trim()
      if (p) return { root: p, from: 'the running app' }
    }
  } catch {
    // App not running / unreachable — fall back to this copy's file below.
  }
  return { root: readLocalBackupPath(), from: BACKUP_FILE }
}

const { root, from } = await resolveSyncRoot()
if (!root) {
  console.error('')
  console.error('  No sync folder is set yet. Open the app and set the Backup folder')
  console.error('  (bottom bar) to the P-drive sync folder, then run this again.')
  console.error('')
  console.error('  Tip: start the app first — this reads the folder straight from the')
  console.error(`  running app. (Also checked this copy's file: ${BACKUP_FILE})`)
  process.exit(1)
}
if (!fs.existsSync(root)) {
  console.error('')
  console.error(`  Can't reach the sync folder: ${root}`)
  console.error('  You are probably not connected to the office network / P drive.')
  console.error('  Connect, then run this again.')
  process.exit(1)
}

const by = getComputerId()
const stylesDir = path.join(APP_ROOT, 'styles')
const started = Date.now()

console.log('')
console.log(`  Sync folder : ${root}`)
console.log(`  (source: ${from})`)
console.log(`  This computer: ${by}`)
console.log('')

let r
try {
  r = reconcile({ stylesDir, root, by, log: (line) => console.log('  ' + line) })
} catch (err) {
  console.error('')
  console.error(`  Update styles failed: ${err.message}`)
  console.error('  Make sure the P drive is still connected, then run this again.')
  process.exit(1)
}

const secs = Math.round((Date.now() - started) / 1000)
const mm = String(Math.floor(secs / 60)).padStart(2, '0')
const ss = String(secs % 60).padStart(2, '0')
console.log('')
console.log(
  `  Done.  ${r.added.length} added · ${r.updated.length} updated · ` +
    `${r.unchanged.length} unchanged · ${r.removed.length} removed   [${mm}:${ss}]`,
)
if (r.missing.length) {
  console.log(`  Note: ${r.missing.length} listed style(s) were absent from current/ and skipped: ${r.missing.join(', ')}`)
}
console.log('  Refresh the app to see the changes.')
console.log('')
