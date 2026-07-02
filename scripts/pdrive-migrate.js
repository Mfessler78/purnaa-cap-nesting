#!/usr/bin/env node
// OWNER-RUN, ONCE, on the master machine.
//
// Seeds the fresh P-drive sync root from THIS machine's local styles/ folder,
// treating those styles as the initial truth: copies them into current/, writes
// one add event per style into events/ (so replaying the log reproduces exactly
// today's set), and drops a dated snapshot into backups/.
//
// Idempotent — safe to run twice. It never deletes and never invents a style.
//
// Usage:
//   node scripts/pdrive-migrate.js "<sync-root>"
//   e.g. node scripts/pdrive-migrate.js "/Volumes/Purnaa/Printing/zPurnaa-Cap-Nesting-Sync"
//
// After running: point each machine's Backup folder (app bottom bar) at the same
// <sync-root>. The Stage-3 retrieve reads that path and syncs from current/.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getComputerId, seedFromLocal, readEvents, replay, ensureScaffold } from '../src/lib/pdriveSync.js'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const root = process.argv[2]
if (!root) {
  console.error('Usage: node scripts/pdrive-migrate.js "<sync-root>"')
  console.error('  e.g. node scripts/pdrive-migrate.js "/Volumes/Purnaa/Printing/zPurnaa-Cap-Nesting-Sync"')
  process.exit(1)
}

const by = getComputerId()
const stylesDir = path.join(APP_ROOT, 'styles')

console.log('')
console.log(`Seeding sync root : ${root}`)
console.log(`From local styles : ${stylesDir}`)
console.log(`This computer     : ${by}`)
console.log('')

const r = seedFromLocal({ stylesDir, root, by })
for (const s of r.added) console.log(`  add    ${s}`)
for (const s of r.updated) console.log(`  update ${s}`)
for (const s of r.unchanged) console.log(`  skip   ${s}  (already seeded)`)

// Prove replay reproduces the seeded set.
const dirs = ensureScaffold(root)
const desired = replay(readEvents(dirs.events))
console.log('')
console.log(`Done. ${r.added.length} added · ${r.updated.length} updated · ${r.unchanged.length} unchanged`)
if (r.snapshot) console.log(`Snapshot: backups/${r.snapshot}`)
console.log(`Replay now yields ${desired.size} current style(s): ${[...desired.keys()].sort().join(', ')}`)
