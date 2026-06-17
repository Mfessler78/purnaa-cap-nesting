import { useEffect, useState } from 'react'
import { getBackupStatus, setBackupPath, runBackup, autoBackup, browseBackupFolder } from './lib/api'

function fmtWhen(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Always-visible bar: shows when styles were last backed up, lets anyone back
// up now, and lets the host set the backup folder. On open it runs the weekly
// auto-check (silent unless a backup is actually due). Other parts of the app
// fire a 'capnest-backup' window event after backing up so this refreshes.
export default function BackupBar() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [pathInput, setPathInput] = useState('')

  async function refresh() {
    try {
      setStatus(await getBackupStatus())
    } catch {}
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await autoBackup()
        if (alive && r && r.ran) setMsg('Weekly backup saved automatically.')
      } catch {}
      if (alive) refresh()
    })()
    const onEvent = () => refresh()
    window.addEventListener('capnest-backup', onEvent)
    return () => {
      alive = false
      window.removeEventListener('capnest-backup', onEvent)
    }
  }, [])

  async function onBackupNow() {
    setBusy(true)
    setMsg('Backing up…')
    try {
      const r = await runBackup()
      setStatus(r)
      setMsg(`Backed up to ${r.lastBackupName}.`)
      window.dispatchEvent(new Event('capnest-backup'))
    } catch (err) {
      setMsg(err.message || 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onSavePath() {
    setBusy(true)
    setMsg('')
    try {
      const s = await setBackupPath(pathInput.trim())
      setStatus(s)
      setEditing(false)
      setMsg('Backup folder set.')
    } catch (err) {
      setMsg(err.message || 'Could not set folder.')
    } finally {
      setBusy(false)
    }
  }

  // Pick the folder from a native window on the host, then set it.
  async function onBrowse() {
    setBusy(true)
    setMsg('Opening a folder window on the host computer…')
    try {
      const r = await browseBackupFolder()
      if (r.canceled) {
        setMsg('')
        return
      }
      setPathInput(r.path)
      const s = await setBackupPath(r.path)
      setStatus(s)
      setEditing(false)
      setMsg('Backup folder set.')
    } catch (err) {
      setMsg(err.message || 'Could not open a folder window.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  const last = fmtWhen(status.lastBackupAt)

  return (
    <footer className="backup-bar">
      <span className={last ? 'backup-when' : 'backup-when warn'}>
        {last ? `Last backed up: ${last}` : 'Never backed up'}
      </span>
      <button onClick={onBackupNow} disabled={busy}>
        Back up now
      </button>
      <span className="backup-folder">
        {editing ? (
          <>
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="e.g. P:\CapNestBackups"
              size={28}
            />
            <button onClick={onBrowse} disabled={busy} title="Opens a folder window on the host computer's screen">
              Browse…
            </button>
            <button onClick={onSavePath} disabled={busy}>
              Save
            </button>
            <button onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            Backup folder:{' '}
            {status.path ? <code>{status.path}</code> : <span className="warn">not set</span>}
            <button
              className="link"
              onClick={() => {
                setPathInput(status.path || '')
                setEditing(true)
              }}
            >
              {status.path ? 'Change' : 'Set'}
            </button>
          </>
        )}
      </span>
      {msg && <span className="backup-msg">{msg}</span>}
    </footer>
  )
}
