// Standalone LAN server for office use — no Vite, no babysitting a terminal.
//
// Why this exists: the style/fabric/export API only ran under `npm run dev`
// via Vite's dev-only configureServer hook. For always-on office use we need a
// plain Node server that (1) serves the built front-end in dist/ and (2) mounts
// the EXACT SAME API handlers as dev. It binds 0.0.0.0 so other machines on the
// office LAN can reach it by the host's IP. Still local-only — LAN, not cloud.
//
// Run:  npm run build   (once, to produce dist/)
//       npm run serve   (starts this server)
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handle, handleFabrics, handleExport, handleHost, handleBackup, lanAddresses } from './styles-api.js'

// Pinned office port. Documented, never changes — every machine reaches the
// host at http://<host-ip>:4173. Overridable via env only for local testing.
const PORT = Number(process.env.PORT) || 4173
// Anchor dist/ to the app folder (one level above server/) so the server finds
// the built front-end no matter what working directory it was launched from —
// same reasoning as the shared store in styles-api.js.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(APP_ROOT, 'dist')

const send = (res, status, data) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

// Vite's `server.middlewares.use(prefix, fn)` strips the matched prefix from
// req.url before the handler sees it; the handlers were written against that.
// Replicate it here so the same handlers work unchanged.
function mount(req, res, prefix, handler) {
  const pathname = (req.url || '/').split('?')[0]
  if (pathname !== prefix && !pathname.startsWith(prefix + '/')) return false
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  req.url = (req.url.split('?')[0].slice(prefix.length) || '/') + query
  handler(req, res).catch((err) => send(res, 500, { error: err.message }))
  return true
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

async function serveStatic(req, res) {
  // Static + SPA fallback. Resolve within dist/ only (no path traversal),
  // and fall back to index.html so the single-page app handles its own routes.
  const pathname = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = path.join(DIST, pathname)
  if (!path.resolve(filePath).startsWith(DIST)) filePath = path.join(DIST, 'index.html')
  try {
    const stat = await fsp.stat(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    filePath = path.join(DIST, 'index.html')
  }
  try {
    const buf = await fsp.readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream')
    res.end(buf)
  } catch {
    send(res, 404, { error: 'Not found' })
  }
}

const server = http.createServer((req, res) => {
  if (mount(req, res, '/api/styles', handle)) return
  if (mount(req, res, '/api/fabrics', handleFabrics)) return
  if (mount(req, res, '/api/export', handleExport)) return
  if (mount(req, res, '/api/host', handleHost)) return
  if (mount(req, res, '/api/backup', handleBackup)) return
  serveStatic(req, res)
})

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('\n  dist/ is missing or empty. Run:  npm run build\n')
  process.exit(1)
}

server.listen(PORT, '0.0.0.0', () => {
  const addrs = lanAddresses()
  console.log('\n  Purnaa Cap Nesting is running.\n')
  console.log(`  On this computer:      http://localhost:${PORT}`)
  for (const a of addrs) console.log(`  On other office PCs:   http://${a}:${PORT}`)
  if (!addrs.length) console.log('  (No LAN address detected — check this machine is on the network.)')
  console.log('\n  Leave this window open. Close it to stop the app.\n')
})
