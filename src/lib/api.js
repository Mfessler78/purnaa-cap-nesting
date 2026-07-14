export async function listStyles() {
  const res = await fetch('/api/styles')
  if (!res.ok) throw new Error('Could not list styles')
  return res.json()
}

export async function getStyle(id) {
  const res = await fetch(`/api/styles/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Style not found')
  return res.json()
}

export async function getStylePdf(id, which) {
  const res = await fetch(`/api/styles/${encodeURIComponent(id)}/${which}.pdf`)
  if (!res.ok) return null
  return new Uint8Array(await res.arrayBuffer())
}

// Fetch a style PDF by its exact stored filename (template_*.pdf / prenest_*.pdf
// for the multi-template + per-mode schema, or the legacy fixed names).
export async function getStylePdfFile(id, filename) {
  if (!filename) return null
  const res = await fetch(`/api/styles/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`)
  if (!res.ok) return null
  return new Uint8Array(await res.arrayBuffer())
}

export async function saveStyle(payload) {
  const res = await fetch('/api/styles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Save failed')
  return json
}

export async function deleteStyle(id) {
  const res = await fetch(`/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Delete failed')
  return json
}

export async function getHostLink() {
  // { ip, port, addresses, url } — the shareable LAN link for other machines.
  const res = await fetch('/api/host')
  if (!res.ok) throw new Error('Could not detect host address')
  return res.json()
}

// ---- Sync folder (P-drive) -------------------------------------------------
// Reads/sets the shared sync folder. { path, configured }. Style saves publish
// there automatically; there is no manual backup call anymore.
export async function getBackupStatus() {
  const res = await fetch('/api/backup')
  if (!res.ok) throw new Error('Could not read backup status')
  return res.json()
}

export async function setBackupPath(path) {
  const res = await fetch('/api/backup/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Could not set backup folder')
  return json
}

export async function browseBackupFolder() {
  // Opens a native folder window ON THE HOST; returns { path } or { canceled }.
  const res = await fetch('/api/backup/browse', { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Could not open a folder window')
  return json
}

export async function listFabrics() {
  const res = await fetch('/api/fabrics')
  if (!res.ok) throw new Error('Could not load fabrics')
  return res.json()
}

export async function saveFabrics(fabrics) {
  const res = await fetch('/api/fabrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fabrics),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Save failed')
  return json
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
