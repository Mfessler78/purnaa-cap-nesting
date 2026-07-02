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

// ---- Events (append-only) -------------------------------------------------
// Each add/update/delete is a tiny self-describing JSON file. No computer ever
// overwrites a shared file — every event has a unique name — so concurrent edits
// from different machines can't clobber or truncate each other. Current state is
// COMPUTED by replaying the events (see replay()).

const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_') || 'x'

// Colon/dash/dot-free but still chronologically sortable as text, and legal as a
// Windows filename ('.' and ':' from an ISO string are stripped):
// "2026-07-02T09:10:00.123Z" -> "20260702T091000123Z".
export function eventStamp(iso) {
  return String(iso).replace(/[-:.]/g, '')
}

// Filename encodes enough to sort and stay unique per event:
// <stamp>__<by>__<op>__<style>__<rand>.json. The random suffix guarantees two
// events that share stamp/by/op/style still get distinct filenames (append-only).
export function eventFileName(ev) {
  const rand = crypto.randomBytes(3).toString('hex')
  return `${eventStamp(ev.at)}__${safeName(ev.by)}__${ev.op}__${safeName(ev.style)}__${rand}.json`
}

// Publish an event atomically: write a hidden temp file, then rename it into
// place. Unique name + atomic rename means a reader never sees a half-written
// event and no machine overwrites another's.
export function writeEvent(eventsDir, ev) {
  fs.mkdirSync(eventsDir, { recursive: true })
  const name = eventFileName(ev)
  const tmp = path.join(eventsDir, `.${name}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(ev))
  fs.renameSync(tmp, path.join(eventsDir, name))
  return name
}

// Read every event file. A torn/partial event (rare; a crash mid-write) is
// skipped rather than crashing the whole sync. Attaches `_file` for tie-break
// sorting in replay().
export function readEvents(eventsDir) {
  let names
  try {
    names = fs.readdirSync(eventsDir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (name.startsWith('.') || !name.endsWith('.json')) continue
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(eventsDir, name), 'utf8'))
      if (ev && ev.op && ev.style && ev.at) out.push({ ...ev, _file: name })
    } catch {
      // skip an unreadable/partial event
    }
  }
  return out
}

// Fold events into the desired set (the "newest screenshot" of what should
// exist). Sort by `at`, tie-break by filename. add/update put the style in with
// its latest hash; delete removes it. Returns Map<style, {style,hash,at,by}>.
export function replay(events) {
  const sorted = [...events].sort((a, b) => {
    const ta = Date.parse(a.at)
    const tb = Date.parse(b.at)
    if (ta !== tb) return ta - tb
    const fa = a._file || ''
    const fb = b._file || ''
    return fa < fb ? -1 : fa > fb ? 1 : 0
  })
  const set = new Map()
  for (const ev of sorted) {
    if (ev.op === 'delete') set.delete(ev.style)
    else if (ev.op === 'add' || ev.op === 'update') {
      set.set(ev.style, { style: ev.style, hash: ev.hash, at: ev.at, by: ev.by })
    }
  }
  return set
}

// ---- Style-folder helpers -------------------------------------------------
// A style dir is a subfolder containing a style.json (matches server/styles-api).
export function listStyleDirs(stylesDir) {
  let entries
  try {
    entries = fs.readdirSync(stylesDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(stylesDir, e.name, 'style.json')))
    .map((e) => e.name)
    .sort()
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

// Replace dst with a fresh copy of src as atomically as a directory allows: copy
// to a temp dir on the same disk, then swap it in with rename. Avoids leaving a
// half-copied style folder visible to a reader.
export function replaceDir(src, dst) {
  const parent = path.dirname(dst)
  fs.mkdirSync(parent, { recursive: true })
  const tmp = path.join(parent, `.tmp-${path.basename(dst)}-${crypto.randomBytes(4).toString('hex')}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.cpSync(src, tmp, { recursive: true })
  fs.rmSync(dst, { recursive: true, force: true })
  fs.renameSync(tmp, dst)
}

// Copy the whole current/ set into a dated backups/backup-<stamp>/ folder — the
// recovery source. Never read as a sync source.
export function snapshotCurrent(dirs, at = new Date()) {
  const dest = path.join(dirs.backups, `backup-${eventStamp(at.toISOString())}`)
  if (dirExists(dirs.current)) fs.cpSync(dirs.current, dest, { recursive: true })
  else fs.mkdirSync(dest, { recursive: true })
  return path.basename(dest)
}

// ---- One-time seed / migration (Stage 2) ----------------------------------
// Seed a fresh sync root from a machine's local styles/ folder, treating those
// styles as the initial truth so replay() reproduces exactly today's set.
// Idempotent: re-running copies only changed styles, appends an event only when
// the replayed state doesn't already match the local content, and snapshots to
// backups/ only when something actually changed. Never deletes and never invents
// a style — it is purely additive from local truth.
export function seedFromLocal({ stylesDir, root, by, now = () => new Date() }) {
  const dirs = ensureScaffold(root)
  const desired = replay(readEvents(dirs.events))
  const result = { root, added: [], updated: [], unchanged: [], snapshot: null }

  for (const style of listStyleDirs(stylesDir)) {
    const srcDir = path.join(stylesDir, style)
    const hash = hashStyleFolder(srcDir)
    const curDir = path.join(dirs.current, style)
    const known = desired.get(style)

    if (known && known.hash === hash) {
      // Already represented in the log at this exact hash → no new event. Make
      // sure current/ actually holds it (belt-and-suspenders), then skip.
      if (!dirExists(curDir) || hashStyleFolder(curDir) !== hash) replaceDir(srcDir, curDir)
      result.unchanged.push(style)
      continue
    }

    // New to the log, or content changed since its last event → mirror + event.
    replaceDir(srcDir, curDir)
    const op = known ? 'update' : 'add'
    writeEvent(dirs.events, { op, style, at: now().toISOString(), by, hash })
    ;(op === 'add' ? result.added : result.updated).push(style)
  }

  if (result.added.length || result.updated.length) {
    result.snapshot = snapshotCurrent(dirs, now())
  }
  return result
}
