// Minimal style-storage API, mounted inside the Vite dev server.
// Why this exists: the browser cannot write files to disk, and styles
// (slot maps + their PDFs) must persist in ./styles/ per SPEC.md. This
// keeps `npm run dev` as the single command — no separate backend.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getComputerId, publishStyleWrite, publishStyleDelete, readSyncRootFile, writeSyncRootFile } from '../src/lib/pdriveSync.js'

// The shared store must be the SAME folder no matter how the server is launched
// (npm run dev, npm run serve, a double-click launcher, or Task Scheduler with a
// different working directory). Anchor it to the app folder — one level above
// this server/ file — so every machine reads/writes one source of truth on the
// host, never a stray empty copy created in some other working directory.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.join(APP_ROOT, 'styles')

// Style numbers become directory names, so restrict the characters.
const isSafeId = (id) => /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(id)

// ---- Schema migration (U2/U3) ---------------------------------------------
// style.json grew from "one template + one pre-nest" to MANY template SIZE
// variants (U2, auto-selected by artwork size) and a SEPARATE pre-nest per cut
// mode (U3, die vs laser). Old styles on disk keep the original shape; this
// normalizer upgrades EITHER shape to one canonical structure in memory so every
// reader sees the same thing. Legacy single pre-nests are treated as LASER (owner
// decision); the single template becomes one variant. Files on disk are NOT
// rewritten here — disk migration happens only when the style is saved again.
const safeFilePart = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/\.+/g, '_') || 'x'

function normalizeStyle(meta) {
  const templates = Array.isArray(meta.templates) && meta.templates.length
    ? meta.templates
    : [
        {
          id: 'v1',
          template_pdf: 'template.pdf',
          page_size: meta.templatePageSize || null,
          pieces: meta.templatePieces || [],
        },
      ]
  const prenests =
    meta.prenests && Object.keys(meta.prenests).length
      ? meta.prenests
      : { laser: { prenest_pdf: 'prenest.pdf', slots: meta.slots || [] } }
  return { ...meta, templates, prenests }
}

// Counts for the style list, tolerant of either shape.
function styleCounts(norm) {
  const modes = Object.keys(norm.prenests)
  const slotCount = modes.reduce(
    (m, k) => Math.max(m, norm.prenests[k]?.slots?.length || 0),
    0,
  )
  return {
    slotCount,
    templatePieceCount: (norm.templates[0]?.pieces || []).length,
    modes,
    templateCount: norm.templates.length,
  }
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

// Write a file atomically: write to a temp file in the same folder, then rename
// it into place. Rename is an atomic replace on the same disk (Windows and Mac),
// so a reader always sees either the complete old file or the complete new one —
// never a truncated, half-written one. This is the guard behind the owner's hard
// requirement that the style list must never be blank: an interrupted write (a
// crash, power loss, or a sync client grabbing the file) leaves the previous good
// copy fully intact instead of a corrupt file the list would silently skip.
async function writeFileAtomic(file, data) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, file)
  } catch (err) {
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}

// Push a style write/delete to the shared P-drive sync root (current/ + append
// event + recovery copy in backups/), using the ONE shared recipe in
// pdriveSync.js — the same logic the retrieve launchers replay. The LOCAL save is
// always primary and has already happened; this is best-effort so a disconnected
// P-drive never blocks saving. When it can't sync (no folder set, or unreachable)
// it returns a reason so the UI can warn that the change isn't shared yet.
async function syncPush(kind, style) {
  const state = await readBackupState()
  if (!state.path) return { synced: false, reason: 'no-folder' }
  try {
    await fs.access(state.path)
  } catch {
    return { synced: false, reason: 'unreachable' }
  }
  try {
    const by = getComputerId()
    if (kind === 'delete') {
      publishStyleDelete({ root: state.path, style, by })
      return { synced: true, op: 'delete' }
    }
    const { op } = publishStyleWrite({ stylesDir: ROOT, root: state.path, style, by })
    return { synced: true, op }
  } catch (err) {
    return { synced: false, reason: err.message }
  }
}

async function handle(req, res) {
  const url = (req.url || '/').split('?')[0]

  if (req.method === 'GET' && (url === '/' || url === '')) {
    await fs.mkdir(ROOT, { recursive: true })
    const out = []
    for (const dir of await fs.readdir(ROOT)) {
      try {
        const meta = JSON.parse(
          await fs.readFile(path.join(ROOT, dir, 'style.json'), 'utf8'),
        )
        const norm = normalizeStyle(meta)
        const c = styleCounts(norm)
        out.push({
          id: dir,
          style: meta.style,
          slotCount: c.slotCount,
          templatePieceCount: c.templatePieceCount,
          modes: c.modes,
          templateCount: c.templateCount,
          updatedAt: meta.updatedAt,
        })
      } catch {
        // not a style directory; skip
      }
    }
    return send(res, 200, out)
  }

  if (req.method === 'POST' && (url === '/' || url === '')) {
    const body = await readJsonBody(req)
    const style = String(body.style || '').trim()
    if (!isSafeId(style)) {
      return send(res, 400, {
        error: 'Style number must use only letters, numbers, spaces, ".", "_", "-"',
      })
    }
    const dir = path.join(ROOT, style)
    await fs.mkdir(dir, { recursive: true })
    let existing = null
    try {
      existing = JSON.parse(await fs.readFile(path.join(dir, 'style.json'), 'utf8'))
    } catch {}

    // Accept the new multi-template / per-mode shape, OR the legacy single
    // template + single pre-nest payload (so an older client still saves). Both
    // are funnelled into the new shape and written once.
    const inTemplates = Array.isArray(body.templates)
      ? body.templates
      : [
          {
            id: 'v1',
            template_pdf: 'template.pdf',
            page_size: body.templatePageSize || null,
            pieces: body.templatePieces || [],
            pdfBase64: body.templatePdf,
          },
        ]
    const inPrenests =
      body.prenests && typeof body.prenests === 'object'
        ? body.prenests
        : { laser: { prenest_pdf: 'prenest.pdf', slots: body.slots || [], pdfBase64: body.prenestPdf } }

    const templates = []
    for (const t of inTemplates) {
      const id = safeFilePart(t.id || 'v1')
      const filename = t.template_pdf || `template_${id}.pdf`
      if (t.pdfBase64) {
        await writeFileAtomic(path.join(dir, filename), Buffer.from(t.pdfBase64, 'base64'))
      }
      templates.push({ id, template_pdf: filename, page_size: t.page_size || null, pieces: t.pieces || [] })
    }

    const prenests = {}
    for (const [mode, data] of Object.entries(inPrenests)) {
      if (mode !== 'die' && mode !== 'laser') {
        return send(res, 400, { error: `Unknown cut mode "${mode}" (expected die or laser).` })
      }
      const filename = data.prenest_pdf || `prenest_${mode}.pdf`
      if (data.pdfBase64) {
        await writeFileAtomic(path.join(dir, filename), Buffer.from(data.pdfBase64, 'base64'))
      }
      prenests[mode] = { prenest_pdf: filename, slots: data.slots || [] }
    }

    const meta = {
      style,
      coordinateSpace: 'PDF points, origin bottom-left; box = {x, y, w, h} with (x, y) the bottom-left corner',
      schemaVersion: 2,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      templates,
      prenests,
    }
    await writeFileAtomic(path.join(dir, 'style.json'), JSON.stringify(meta, null, 2))
    const sync = await syncPush('write', style)
    return send(res, 200, { ok: true, id: style, sync })
  }

  // PDF route accepts the legacy fixed names AND per-variant / per-mode files
  // (template_*.pdf, prenest_*.pdf). The filename charset excludes "/" and we
  // reject ".." so it can't escape the style directory.
  const match = url.match(/^\/([^/]+)(?:\/([A-Za-z0-9][A-Za-z0-9_.-]*\.pdf))?$/)
  if (match && req.method === 'GET') {
    const id = decodeURIComponent(match[1])
    if (!isSafeId(id)) return send(res, 400, { error: 'Bad style id' })
    if (!match[2]) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(ROOT, id, 'style.json'), 'utf8'))
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify(normalizeStyle(raw)))
      } catch {
        return send(res, 404, { error: 'Style not found' })
      }
    }
    const file = match[2]
    if (file.includes('..')) return send(res, 400, { error: 'Bad file name' })
    try {
      const buf = await fs.readFile(path.join(ROOT, id, file))
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/pdf')
      return res.end(buf)
    } catch {
      return send(res, 404, { error: 'PDF not found' })
    }
  }

  // Delete a whole style directory (slot map + its PDFs). The UI gates this
  // behind a named confirmation; here we just guard the path and require the
  // target to actually be a style dir before removing it. No undo.
  if (match && req.method === 'DELETE') {
    const id = decodeURIComponent(match[1])
    if (!isSafeId(id) || match[2]) return send(res, 400, { error: 'Bad style id' })
    const dir = path.join(ROOT, id)
    if (path.resolve(dir) !== path.join(ROOT, id) || !path.resolve(dir).startsWith(ROOT + path.sep)) {
      return send(res, 400, { error: 'Bad style id' })
    }
    try {
      await fs.access(path.join(dir, 'style.json'))
    } catch {
      return send(res, 404, { error: 'Style not found' })
    }
    await fs.rm(dir, { recursive: true, force: true })
    const sync = await syncPush('delete', id)
    return send(res, 200, { ok: true, id, sync })
  }

  send(res, 404, { error: 'Unknown route' })
}

// Fabric table: name + uniform stretch scale percent, editable in the UI.
const FABRICS_FILE = path.join(APP_ROOT, 'data', 'fabrics.json')
const DEFAULT_FABRICS = [{ name: 'No stretch', scale: 100 }]

async function handleFabrics(req, res) {
  if (req.method === 'GET') {
    try {
      const raw = await fs.readFile(FABRICS_FILE, 'utf8')
      return send(res, 200, JSON.parse(raw))
    } catch {
      return send(res, 200, DEFAULT_FABRICS)
    }
  }
  if (req.method === 'POST') {
    const body = await readJsonBody(req)
    if (!Array.isArray(body)) return send(res, 400, { error: 'Expected an array of fabrics' })
    for (const f of body) {
      if (!f || typeof f.name !== 'string' || !f.name.trim()) {
        return send(res, 400, { error: 'Every fabric needs a name' })
      }
      if (typeof f.scale !== 'number' || !(f.scale >= 50 && f.scale <= 200)) {
        return send(res, 400, {
          error: `Fabric "${f.name}": scale must be a percent between 50 and 200 (e.g. 104)`,
        })
      }
    }
    await fs.mkdir(path.dirname(FABRICS_FILE), { recursive: true })
    await writeFileAtomic(
      FABRICS_FILE,
      JSON.stringify(body.map((f) => ({ name: f.name.trim(), scale: f.scale })), null, 2),
    )
    return send(res, 200, { ok: true })
  }
  send(res, 404, { error: 'Unknown route' })
}

// Export post-processing. Ghostscript (if installed) rewrites the export to
// an older PDF compatibility level, which forces transparency flattening
// while preserving vectors — the standard fix for RIPs (RasterLink) that
// reject Illustrator-style transparency. Settings stay adjustable so flatten
// behavior can be iterated against real RasterLink results.
const gsVersion = () =>
  new Promise((resolve) =>
    execFile('gs', ['--version'], (err, stdout) => resolve(err ? null : stdout.trim())),
  )

async function handleExport(req, res) {
  const url = (req.url || '/').split('?')[0]

  if (req.method === 'GET' && url === '/status') {
    const version = await gsVersion()
    return send(res, 200, { ghostscript: !!version, version })
  }

  if (req.method === 'POST' && (url === '/' || url === '')) {
    const body = await readJsonBody(req)
    const settings = body.settings || {}

    if (settings.method !== 'ghostscript') {
      return send(res, 200, {
        pdf: body.pdf,
        applied: 'Direct pdf-lib vector output (no transparency flattening)',
      })
    }

    // PDF 1.3 predates the transparency model, so pdfwrite must flatten all
    // transparency to opaque marks while keeping vectors — the one setting we
    // ship. Higher levels keep transparency live (which RasterLink mis-rips).
    const compat = '1.3'
    const id = crypto.randomBytes(6).toString('hex')
    const inPath = path.join(os.tmpdir(), `capnest-${id}-in.pdf`)
    const outPath = path.join(os.tmpdir(), `capnest-${id}-out.pdf`)
    await fs.writeFile(inPath, Buffer.from(body.pdf, 'base64'))
    const args = [
      '-dBATCH',
      '-dNOPAUSE',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      `-dCompatibilityLevel=${compat}`,
      '-dPDFSETTINGS=/prepress',
      '-dColorConversionStrategy=/LeaveColorUnchanged',
      '-dDownsampleColorImages=false',
      '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false',
      '-dAutoRotatePages=/None',
      `-sOutputFile=${outPath}`,
      inPath,
    ]
    try {
      // Flatten is a rare fallback (the default direct-vector export is the
      // normal path). When it IS used, the heavy soft-mask artwork genuinely
      // needs ~160s+ to re-rip, so allow a generous timeout rather than failing
      // a job that would have finished. 10 minutes covers multi-sheet orders.
      await new Promise((resolve, reject) =>
        execFile('gs', args, { timeout: 600000 }, (err, _stdout, stderr) => {
          if (!err) return resolve()
          if (err.code === 'ENOENT') {
            return reject(
              new Error('Ghostscript is not installed — run: brew install ghostscript'),
            )
          }
          if (err.killed) {
            return reject(
              new Error(
                'Ghostscript flatten timed out after 10 minutes — this artwork is unusually heavy. ' +
                  'Use the default direct-vector export (it already prints correctly in RasterLink).',
              ),
            )
          }
          reject(new Error(`Ghostscript failed: ${stderr || err.message}`))
        }),
      )
      const outBuf = await fs.readFile(outPath)
      return send(res, 200, {
        pdf: outBuf.toString('base64'),
        applied: `gs ${args.slice(0, -2).join(' ')}`,
      })
    } finally {
      fs.unlink(inPath).catch(() => {})
      fs.unlink(outPath).catch(() => {})
    }
  }

  send(res, 404, { error: 'Unknown route' })
}

// The host's LAN IPv4 addresses, detected at runtime (never hardcoded — a
// machine's address can change). Used both for the startup banner and for the
// "copy office link" button so the operator can hand other machines a link.
function lanAddresses() {
  const out = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address)
    }
  }
  return out
}

// Tell the browser the shareable link for other office machines. We keep the
// port the client actually reached us on (so it's right in dev too) and swap in
// the host's LAN IP for the hostname.
async function handleHost(req, res) {
  const hostHeader = req.headers.host || ''
  const port = hostHeader.includes(':') ? hostHeader.split(':').pop() : process.env.PORT || '4173'
  const addresses = lanAddresses()
  const ip = addresses[0] || null
  return send(res, 200, {
    ip,
    port,
    addresses,
    url: ip ? `http://${ip}:${port}` : null,
  })
}

// ---- Sync folder (P-drive) ------------------------------------------------
// data/backup.json remembers the shared SYNC ROOT this machine points at — the
// P-drive folder holding events/current/backups. Host-specific state, not
// committed. Style saves/deletes publish into it automatically (syncPush) and the
// retrieve launchers replay it, so there is NO separate "back up now" step and no
// dated full-snapshot folders piling up in it. Recovery copies land tidily under
// the root's own backups/ (per-version + per-deletion). The P drive is a
// parachute we write TO and never run FROM.
const BACKUP_STATE = path.join(APP_ROOT, 'data', 'backup.json')

async function readBackupState() {
  let state = { path: null }
  try {
    state = JSON.parse(await fs.readFile(BACKUP_STATE, 'utf8'))
  } catch {}
  if (state.path) {
    // Keep the machine-level copy current so other/future clones inherit it.
    try {
      if (readSyncRootFile() !== state.path) writeSyncRootFile(state.path)
    } catch {}
    return state
  }
  // Self-heal a fresh or second clone: the folder was set once on this machine
  // (machine-level copy in ~/.purnaa-tools survives re-clones), so adopt it
  // instead of reporting "not set" and orphaning the retrieve launcher.
  const machine = readSyncRootFile()
  if (!machine) return { path: null }
  const healed = { path: machine }
  try {
    await writeBackupState(healed)
  } catch {}
  return healed
}

async function writeBackupState(state) {
  await fs.mkdir(path.dirname(BACKUP_STATE), { recursive: true })
  await writeFileAtomic(BACKUP_STATE, JSON.stringify(state, null, 2))
  // Machine-level copy (~/.purnaa-tools/sync-root.json): survives re-clones and
  // second app copies; the retrieve launcher falls back to it when the app is
  // closed. Best-effort — the app-copy file above is still the primary.
  try {
    writeSyncRootFile(state.path)
  } catch {}
}

async function backupStatus() {
  const state = await readBackupState()
  return { path: state.path || null, configured: !!state.path }
}

// Open the host OS's native folder chooser and return the picked path (or null
// if the operator cancelled). Throws if no dialog tool is available so the UI
// can tell the operator to type the path instead.
function chooseFolder() {
  return new Promise((resolve, reject) => {
    let cmd, args
    if (process.platform === 'darwin') {
      cmd = 'osascript'
      args = ['-e', 'POSIX path of (choose folder with prompt "Choose the backup folder")']
    } else if (process.platform === 'win32') {
      // The classic FolderBrowserDialog has two traps that make it look "broken":
      //  1. It opens BEHIND the browser window, so the operator never sees it.
      //     Fix: give it a hidden, TopMost owner form so it's forced to the front.
      //  2. Its default tree is rooted at the desktop and buries mapped/network
      //     drives. Fix: root it at "This PC" (MyComputer) so the P: drive and
      //     other drives are right there to pick.
      const ps = [
        "Add-Type -AssemblyName System.Windows.Forms;",
        "$owner = New-Object System.Windows.Forms.Form;",
        "$owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0;",
        "$owner.Show(); $owner.Activate();",
        "$f = New-Object System.Windows.Forms.FolderBrowserDialog;",
        "$f.Description = 'Choose the backup folder (e.g. the P: drive)';",
        "$f.ShowNewFolderButton = $true;",
        "$f.RootFolder = [System.Environment+SpecialFolder]::MyComputer;",
        "$r = $f.ShowDialog($owner);",
        "$owner.Close();",
        "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }",
      ].join(' ')
      cmd = 'powershell'
      args = ['-STA', '-NoProfile', '-Command', ps]
    } else {
      cmd = 'zenity'
      args = ['--file-selection', '--directory', '--title=Choose the backup folder']
    }
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) {
        // Cancelled dialog is not an error — just no selection.
        const cancelled =
          /User canceled|-128/.test(stderr || '') ||
          (process.platform !== 'win32' && err.code === 1)
        if (cancelled) return resolve(null)
        if (err.code === 'ENOENT') {
          return reject(new Error('Could not open a folder window on the host — type the folder path instead.'))
        }
        return reject(new Error(stderr || err.message))
      }
      resolve((stdout || '').trim() || null)
    })
  })
}

async function handleBackup(req, res) {
  const url = (req.url || '/').split('?')[0]

  if (req.method === 'GET' && (url === '/' || url === '')) {
    return send(res, 200, await backupStatus())
  }

  // Set the backup folder. Verify we can create/write it NOW so a wrong path or
  // a disconnected drive is caught at setup time, not silently weeks later.
  if (req.method === 'POST' && url === '/config') {
    const body = await readJsonBody(req)
    const p = String(body.path || '').trim()
    if (!p) return send(res, 400, { error: 'Enter a backup folder path.' })
    // A URL like smb://… or http://… is NOT a file path: it would be treated as
    // a relative name and silently create a bogus folder inside the program. Use
    // the mounted/mapped file path instead.
    if (/^[a-zA-Z][\w+.-]*:\/\//.test(p)) {
      return send(res, 400, {
        error: `"${p}" is a network URL, not a folder path. Use the folder's file path: on Windows a share looks like \\\\192.168.10.20\\Purnaa\\… (or a mapped drive P:\\…); on a Mac a connected share is under /Volumes/… . Tip: click "Browse…" to pick it.`,
      })
    }
    // Must be a full (absolute) path. A relative path would resolve inside the
    // program folder — exactly the trap above.
    if (!path.isAbsolute(p)) {
      return send(res, 400, {
        error: `"${p}" is not a full folder path. It must start with a drive (P:\\…), a UNC share (\\\\server\\share\\…), or "/" on a Mac. Tip: click "Browse…" to pick it.`,
      })
    }
    try {
      await fs.mkdir(p, { recursive: true })
      await fs.access(p)
    } catch {
      return send(res, 400, {
        error: `Can't reach or create that folder: ${p}. Check the drive/share is connected and the path is correct.`,
      })
    }
    await writeBackupState({ path: p })
    return send(res, 200, await backupStatus())
  }

  // Open a native "choose folder" window ON THE HOST so the operator can pick
  // the backup folder instead of typing a path. (The dialog appears on the host
  // computer's screen — backup setup is a host/setup-time action.)
  if (req.method === 'POST' && url === '/browse') {
    try {
      const chosen = await chooseFolder()
      return send(res, 200, chosen ? { path: chosen } : { canceled: true })
    } catch (err) {
      return send(res, 400, { error: err.message })
    }
  }

  send(res, 404, { error: 'Unknown route' })
}

// Exported so the standalone LAN server (server/serve.js) can mount the SAME
// handlers the Vite dev plugin uses — one code path for dev and production.
export { handle, handleFabrics, handleExport, handleHost, handleBackup, lanAddresses }
// Exported for unit tests (schema migration is subtle; protect it directly).
export { normalizeStyle, styleCounts }

export default function stylesApi() {
  return {
    name: 'styles-api',
    configureServer(server) {
      server.middlewares.use('/api/styles', (req, res) => {
        handle(req, res).catch((err) => send(res, 500, { error: err.message }))
      })
      server.middlewares.use('/api/fabrics', (req, res) => {
        handleFabrics(req, res).catch((err) => send(res, 500, { error: err.message }))
      })
      server.middlewares.use('/api/export', (req, res) => {
        handleExport(req, res).catch((err) => send(res, 500, { error: err.message }))
      })
      server.middlewares.use('/api/host', (req, res) => {
        handleHost(req, res).catch((err) => send(res, 500, { error: err.message }))
      })
      server.middlewares.use('/api/backup', (req, res) => {
        handleBackup(req, res).catch((err) => send(res, 500, { error: err.message }))
      })
    },
  }
}
