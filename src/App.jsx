import { useState } from 'react'
import MappingTool from './MappingTool.jsx'
import RunScreen from './RunScreen.jsx'
import FabricsScreen from './FabricsScreen.jsx'
import BackupBar from './BackupBar.jsx'
import TutorialOverlay from './tutorial/TutorialOverlay.jsx'
import { TUTORIALS } from './tutorial/tutorials.js'
import { getHostLink } from './lib/api.js'

// Copy text to the clipboard. The modern API only works in a "secure context"
// (https or localhost), so over a plain http LAN address it can be blocked —
// fall back to a hidden textarea so the host operator can still copy the link.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export default function App() {
  const [tab, setTab] = useState('run')
  const [linkMsg, setLinkMsg] = useState('')
  // The active tutorial (step data from tutorials.js), or null. Lives only in
  // React state — closing the overlay resets it to null and nothing persists.
  const [tutorial, setTutorial] = useState(null)

  async function copyOfficeLink() {
    setLinkMsg('Detecting…')
    try {
      const { url } = await getHostLink()
      if (!url) {
        setLinkMsg('No office-network address found on this computer.')
        return
      }
      const copied = await copyText(url)
      setLinkMsg(copied ? `Copied: ${url}` : `Copy this link: ${url}`)
    } catch {
      setLinkMsg('Could not detect the address — make sure the app is running on the host.')
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Purnaa Cap Nesting</h1>
        <nav>
          <button
            className={`nav-primary${tab === 'run' ? ' active' : ''}`}
            onClick={() => setTab('run')}
            data-tutorial="nav-run"
          >
            Run Screen
          </button>
          <button
            className={`nav-secondary${tab === 'mapping' ? ' active' : ''}`}
            onClick={() => setTab('mapping')}
            data-tutorial="nav-mapping"
          >
            Style Mapping Editor
          </button>
          <button
            className={`nav-secondary${tab === 'fabrics' ? ' active' : ''}`}
            onClick={() => setTab('fabrics')}
            data-tutorial="nav-fabrics"
          >
            Fabrics
          </button>
        </nav>
        <div
          className="office-link"
          title="Copies this host's web address so you can paste it into another office computer's browser. If the link stops working on other computers, the address may have changed — click again to get the current one."
        >
          {linkMsg && <span className="office-link-msg">{linkMsg}</span>}
          <button
            onClick={() => setTutorial(TUTORIALS.gettingStarted)}
            title="A guided walkthrough drawn over the live screen. The highlighted control stays clickable; click anywhere else or press Esc to leave."
          >
            Tutorial
          </button>
          <button onClick={copyOfficeLink} data-tutorial="office-link">Copy office link</button>
        </div>
      </header>
      <main className="app-main">
        {tab === 'mapping' && <MappingTool />}
        {tab === 'run' && <RunScreen />}
        {tab === 'fabrics' && <FabricsScreen />}
      </main>
      <BackupBar />
      {tutorial && (
        <TutorialOverlay
          key={tutorial.id} // switching tutorials remounts → step index resets
          steps={tutorial.steps}
          onClose={() => setTutorial(null)}
          onLaunch={(id) => TUTORIALS[id] && setTutorial(TUTORIALS[id])}
        />
      )}
    </div>
  )
}
