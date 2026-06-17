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

// ---- Backup ---------------------------------------------------------------
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

export async function runBackup() {
  const res = await fetch('/api/backup/run', { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Backup failed')
  return json
}

export async function autoBackup() {
  // Weekly auto-check on app open; runs silently server-side only if due.
  const res = await fetch('/api/backup/auto', { method: 'POST' })
  if (!res.ok) return { ran: false }
  return res.json()
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

export async function exportStatus() {
  const res = await fetch('/api/export/status')
  if (!res.ok) return { ghostscript: false }
  return res.json()
}

export async function processExport(pdfBytes, settings) {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf: bytesToBase64(pdfBytes), settings }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Export processing failed')
  return { bytes: base64ToBytes(json.pdf), applied: json.applied }
}

export function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
