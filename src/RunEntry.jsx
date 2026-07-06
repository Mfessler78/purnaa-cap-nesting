import { useState } from 'react'
import RunScreen from './RunScreen.jsx'
import TileExportScreen from './TileExportScreen.jsx'

// Entry fork for the Run Screen tab (DXF Tile Export, stage 4): one question
// routes to one of two flows. It adds no engine and passes nothing down —
// picking a branch simply MOUNTS that flow's screen, and "Change" unmounts it,
// so React discards all of its state: switching branches is a clean reset and
// the branches share no state by construction. RunScreen itself is untouched.

const LABELS = { artwork: 'With artwork', dxf: 'DXF only' }

export default function RunEntry() {
  const [branch, setBranch] = useState(null) // null | 'artwork' | 'dxf'

  if (!branch) {
    return (
      <div className="entry-choice">
        <h2>Does this job include printed artwork?</h2>
        <div className="entry-buttons">
          <button className="primary" onClick={() => setBranch('artwork')}>
            With artwork
            <small>Fill a style’s pre-nest with customer artwork → print PDF (+ laser DXF)</small>
          </button>
          <button className="primary" onClick={() => setBranch('dxf')}>
            DXF only
            <small>Repeat a pre-packed tile across the fabric → laser DXF, no printing</small>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="branch-wrap">
      <div className="branch-bar">
        <span>
          Job type: <strong>{LABELS[branch]}</strong>
        </span>
        <button onClick={() => setBranch(null)} title="Go back and pick the other job type. This clears everything entered below.">
          Change
        </button>
      </div>
      {branch === 'artwork' ? <RunScreen /> : <TileExportScreen />}
    </div>
  )
}
