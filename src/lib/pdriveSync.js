// Shared logic for the append-only P-drive style sync.
//
// WHY THIS FILE EXISTS: the Mac (.command) and Windows (.bat/.ps1) launchers must
// run *identical* logic — same content hash, same replay, same reconcile — or the
// two platforms would disagree about which styles are current. Rather than write
// (and hand-verify) the same algorithm twice in bash and PowerShell, we write it
// ONCE here in Node (already installed on every machine — the launchers already
// shell out to it) and have both launchers call this. One implementation, zero
// cross-platform drift by construction.
//
// Node-only (fs/os/path/crypto). Never imported by the browser bundle, so Vite
// does not bundle it. Stage 4 will also import it from server/styles-api.js so
// style creation appends events using this same recipe.
//
// The P-drive "sync root" is the folder data/backup.json's `path` points at. It
// holds three subfolders:
//   events/   append-only, one tiny JSON file per add/update/delete event
//   current/  the live style folders (the ONLY sync source)
//   backups/  dated snapshots for recovery (NEVER read as a sync source)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

// Subfolder names under the sync root.
export const EVENTS_DIR = 'events'
export const CURRENT_DIR = 'current'
export const BACKUPS_DIR = 'backups'

// ---- Stable per-computer id ("by" in every event) -------------------------
// Hostnames aren't reliable (duplicates, later renames), so we mint an id ONCE
// per machine and keep it in ~/.purnaa-tools/ — the same tool dir that holds the
// bundled Node, so it survives app updates and re-clones of the repo. Format:
// "<hostname-slug>-<hex>", e.g. "santoshs-pc-1a2b3c". The slug is a human hint;
// the random hex is what guarantees uniqueness even if two machines share a name.
export const DEFAULT_ID_FILE = path.join(os.homedir(), '.purnaa-tools', 'computer-id')

export function getComputerId(idFile = DEFAULT_ID_FILE) {
  try {
    const existing = fs.readFileSync(idFile, 'utf8').trim()
    if (existing) return existing
  } catch {}
  const slug =
    String(os.hostname() || os.platform() || 'pc')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'pc'
  const id = `${slug}-${crypto.randomBytes(3).toString('hex')}`
  fs.mkdirSync(path.dirname(idFile), { recursive: true })
  // Create-once with wx: if two processes race, the loser reads the winner's id.
  try {
    fs.writeFileSync(idFile, id + '\n', { flag: 'wx' })
    return id
  } catch {
    return fs.readFileSync(idFile, 'utf8').trim() || id
  }
}

// ---- Style-folder content hash --------------------------------------------
// sha256 over the SORTED list of (relative POSIX path + NUL + raw bytes + NUL)
// for every file in the style folder. Two folders with identical contents hash
// the same on any OS because: paths are joined with "/" (not the platform sep),
// and the list is sorted so directory-read order can't matter. This is the ONE
// recipe both sync and creation use to decide add / update / skip. style.json's
// `updatedAt` participates by design: any real save counts as an update, while a
// byte-identical folder is skipped (this is what kills the 10-min re-copy).
export function hashStyleFolder(dir) {
  const rels = []
  function walk(parts) {
    const abs = path.join(dir, ...parts)
    for (const name of fs.readdirSync(abs).sort()) {
      const next = [...parts, name]
      const st = fs.statSync(path.join(dir, ...next))
      if (st.isDirectory()) walk(next)
      else if (st.isFile()) rels.push(next.join('/'))
    }
  }
  walk([])
  rels.sort()
  const h = crypto.createHash('sha256')
  for (const rel of rels) {
    h.update(rel) // already "/"-joined → identical string on Mac and Windows
    h.update('\0')
    h.update(fs.readFileSync(path.join(dir, ...rel.split('/'))))
    h.update('\0')
  }
  return h.digest('hex')
}

// ---- Scaffolding ----------------------------------------------------------
// Ensure events/current/backups exist under a sync root. Idempotent and safe to
// call on every run. Only creates the skeleton — never touches style contents.
// Returns the three absolute paths for callers to use.
export function ensureScaffold(root) {
  const paths = {
    events: path.join(root, EVENTS_DIR),
    current: path.join(root, CURRENT_DIR),
    backups: path.join(root, BACKUPS_DIR),
  }
  fs.mkdirSync(root, { recursive: true })
  for (const p of Object.values(paths)) fs.mkdirSync(p, { recursive: true })
  return paths
}
