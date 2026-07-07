import { useEffect, useState } from 'react'
import { getBackupStatus, setBackupPath, browseBackupFolder } from './lib/api'

// Always-visible bar for the shared SYNC FOLDER (the P-drive folder holding
// events/current/backups). The host points this at the office sync folder once;
// from then on every style save/delete is shared to it automatically and other
// machines pick changes up with "Retrieve New Styles from P Drive". There is no
// manual "back up now" — recovery copies are kept inside the folder's own
// backups/ — so nothing piles up here.
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
    refresh()
  }, [])

  async function onSavePath() {
    setBusy(true)
    setMsg('')
    try {
      const s = await setBackupPath(pathInput.trim())
      setStatus(s)
      setEditing(false)
      setMsg('Sync folder set.')
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
      setMsg('Sync folder set.')
    } catch (err) {
      setMsg(err.message || 'Could not open a folder window.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <footer className="backup-bar" data-tutorial="backup-bar">
      <span className={status.configured ? 'backup-when' : 'backup-when warn'}>
        {status.configured ? 'Styles are shared automatically to the sync folder.' : 'Sync folder not set — styles are only on this computer.'}
      </span>
      <span className="backup-folder">
        {editing ? (
          <>
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="e.g. P:\zPurnaa-Cap-Nesting-Sync"
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
            Sync folder:{' '}
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
