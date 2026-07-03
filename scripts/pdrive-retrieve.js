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
import http from 'node:http'
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

// Ask the RUNNING app for the sync folder over plain HTTP. We use node:http
// (present in every Node version) rather than global fetch, which needs Node 18+
// — the launcher may run an older system Node, on which fetch is undefined and
// the query would silently fail. Resolves to the path string, or '' with the
// reason recorded in appQuery.reason for the diagnostics below.
const appQuery = { reason: '' }
function queryAppSyncPath() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: '/api/backup', timeout: 2500 },
      (res) => {
        if (res.statusCode !== 200) {
          appQuery.reason = `app returned HTTP ${res.statusCode}`
          res.resume()
          return resolve('')
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            resolve((JSON.parse(body).path || '').trim())
          } catch {
            appQuery.reason = 'app reply was not valid JSON'
            resolve('')
          }
        })
      },
    )
    req.on('timeout', () => {
      appQuery.reason = `no reply from the app at 127.0.0.1:${PORT} (timed out)`
      req.destroy()
      resolve('')
    })
    req.on('error', (err) => {
      appQuery.reason = `couldn't reach the app at 127.0.0.1:${PORT} (${err.code || err.message})`
      resolve('')
    })
  })
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
  const fromApp = await queryAppSyncPath()
  if (fromApp) return { root: fromApp, from: 'the running app' }
  return { root: readLocalBackupPath(), from: BACKUP_FILE }
}

const { root, from } = await resolveSyncRoot()
if (!root) {
  console.error('')
  console.error('  No sync folder is set yet. Open the app and set the Backup folder')
  console.error('  (bottom bar) to the P-drive sync folder, then run this again.')
  console.error('')
  console.error('  Looked in two places:')
  if (appQuery.reason) {
    console.error(`   - running app: ${appQuery.reason}`)
  } else {
    console.error('   - running app: reachable, but no sync folder is set there')
    console.error('     (the folder you typed may not have saved — set it again in the app)')
  }
  console.error(`   - this copy's file: ${BACKUP_FILE} (empty or missing)`)
  console.error(`  (Node ${process.version})`)
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
