import { useEffect, useRef, useState } from 'react'
import { inspectTile } from './lib/tileInspect'
import { computeTiling } from './lib/tileMath'
import { buildTiledDxf, tileContoursMm } from './lib/tileExport'

// The "DXF only" branch of the run flow (DXF Tile Export, stage 4). The
// operator uploads a pre-packed PDF tile (pieces already arranged and spaced);
// this screen repeats it across the fabric width and down the roll and exports
// ONE laser-ready DXF. No printing, no auto-nesting, no collision detection —
// deterministic grid tiling of the tile's page box only (tileMath.js).
//
// Deliberately mirrors RunScreen's visual language: same root class (so the
// toolbar/verify styling is literally the same CSS), the same
// { passed, blocking, warnings } verification panel, the same approve-checkbox
// → primary-export-button placement. Warn-only checks (Check A) never block;
// Check B (tile wider than usable fabric) blocks exactly like RunScreen's
// blocking lines.

const tick = () => new Promise((r) => setTimeout(r))

const fmtMm = (mm) => `${(Math.round(mm * 10) / 10).toFixed(1)} mm`

// Draws the ACTUAL computed layout — the same contours × placements the DXF
// export writes, plus the fabric edges and the 20 mm side-margin guides — so
// what the operator approves is the file, not the single uploaded tile.
// Standard PDF-to-canvas y-flip: row 0 renders at the bottom, shapes unmirrored.
function LayoutPreview({ tile, grid, fabricWidthMm }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !tile || !grid) return
    const wMm = fabricWidthMm
    const hMm = grid.lengthMm
    const scale = Math.min(1000 / wMm, 1600 / hMm, 4)
    canvas.width = Math.ceil(wMm * scale)
    canvas.height = Math.ceil(hMm * scale)
    const ctx = canvas.getContext('2d')
    const X = (mm) => mm * scale
    const Y = (mm) => (hMm - mm) * scale

    // Fabric.
    ctx.fillStyle = '#fdfdfd'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
    // 20 mm side-margin guides.
    ctx.strokeStyle = '#bbb'
    ctx.setLineDash([6, 4])
    for (const mx of [20, wMm - 20]) {
      ctx.beginPath()
      ctx.moveTo(X(mx), 0)
      ctx.lineTo(X(mx), canvas.height)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Tile page boxes (light), then the cut contours (black) — the same
    // translation-only duplication the DXF writer performs.
    const contours = tileContoursMm(tile)
    ctx.strokeStyle = '#e3e3e3'
    for (const { xMm, yMm } of grid.placements) {
      ctx.strokeRect(X(xMm), Y(yMm + tile.heightMm), tile.widthMm * scale, tile.heightMm * scale)
    }
    ctx.strokeStyle = '#111'
    for (const { xMm, yMm } of grid.placements) {
      for (const poly of contours) {
        ctx.beginPath()
        poly.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(X(x + xMm), Y(y + yMm))
          else ctx.lineTo(X(x + xMm), Y(y + yMm))
        })
        ctx.closePath()
        ctx.stroke()
      }
    }
  }, [tile, grid, fabricWidthMm])
  return <canvas ref={ref} style={{ maxWidth: '100%', border: '1px solid #ddd', background: '#fff' }} />
}

export default function TileExportScreen() {
  const [tile, setTile] = useState(null) // inspectTile result + { name }
  const [fabricWidth, setFabricWidth] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [cutLineMm, setCutLineMm] = useState(1.5) // DXF line width, as in the print flow
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null) // { passed: [], blocking: [], warnings: [] }
  const [grid, setGrid] = useState(null) // computeTiling result (export-ready when set)
  const [approved, setApproved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportInfo, setExportInfo] = useState(null) // { kind, text }
  const [progress, setProgress] = useState(null)

  // Any input change invalidates the computed layout and its approval.
  function resetOutput() {
    setGrid(null)
    setReport(null)
    setApproved(false)
    setExportInfo(null)
  }

  async function onTileFile(file) {
    if (!file) return
    resetOutput()
    setTile(null)
    setBusy(true)
    setProgress('Reading the tile PDF…')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await tick()
      const inspected = await inspectTile(bytes)
      setTile({ ...inspected, name: file.name })
      // Check A surfaces immediately on upload, before width/quantity.
      setReport({
        passed: [
          `Tile read: ${fmtMm(inspected.widthMm)} × ${fmtMm(inspected.heightMm)} ` +
            `(${inspected.outlines.length} cut path${inspected.outlines.length === 1 ? '' : 's'})`,
        ],
        blocking: [],
        warnings: inspected.warnings,
      })
    } catch (err) {
      setReport({ passed: [], blocking: [`Could not read the tile PDF: ${err.message}`], warnings: [] })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function onCheckLayout() {
    setGrid(null)
    setApproved(false)
    setExportInfo(null)
    const res = computeTiling({
      fabricWidthMm: Number(fabricWidth),
      quantity: Number(quantity),
      tileWidthMm: tile.widthMm,
      tileHeightMm: tile.heightMm,
    })
    const passed = [
      `Tile read: ${fmtMm(tile.widthMm)} × ${fmtMm(tile.heightMm)} ` +
        `(${tile.outlines.length} cut path${tile.outlines.length === 1 ? '' : 's'})`,
    ]
    if (!res.errors.length) {
      passed.push(
        `Fabric ${fmtMm(Number(fabricWidth))} − 20 mm margin each side → ${fmtMm(res.usableWidthMm)} usable`,
        `Layout: ${res.quantity} tile${res.quantity > 1 ? 's' : ''} — ${res.colsPerRow} per row × ${res.rows} row${res.rows > 1 ? 's' : ''}`,
        `Roll length used: ${fmtMm(res.lengthMm)}`,
        'Laser DXF ready (tile repeated by translation only — cut lines preserved)',
      )
      setGrid(res)
    }
    setReport({
      passed,
      blocking: res.errors,
      warnings: [...tile.warnings, ...res.warnings],
    })
  }

  async function onExport() {
    setExporting(true)
    setExportInfo(null)
    setProgress('Building the laser DXF…')
    try {
      await tick()
      const dxf = buildTiledDxf(tile, grid.placements, { widthMm: Math.max(0, Number(cutLineMm) || 0) })
      const url = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }))
      const a = document.createElement('a')
      a.href = url
      const base = tile.name.replace(/\.pdf$/i, '')
      a.download = `${base} ${Math.round(Number(fabricWidth))}mm qty${grid.quantity} TILED CUT.dxf`
      a.click()
      URL.revokeObjectURL(url)
      setExportInfo({ kind: 'ok', text: `Exported ${a.download} (${grid.quantity} tiles).` })
    } catch (err) {
      setExportInfo({ kind: 'error', text: err.message })
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="run-screen">
      <div className="toolbar">
        <label>
          Tile PDF (pre-packed)
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => onTileFile(e.target.files[0])}
          />
        </label>
        <label title="Full fabric width on the roll. 20 mm is kept clear on each side; tiles run freely down the length.">
          Fabric width (mm)
          <input
            type="number"
            min="1"
            value={fabricWidth}
            onChange={(e) => {
              setFabricWidth(e.target.value)
              resetOutput()
            }}
          />
        </label>
        <label title="Number of tiles to cut — any whole number of 1 or more.">
          Quantity
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value)
              resetOutput()
            }}
          />
        </label>
        <label title="Line width written into the DXF, same as the print flow's laser cut line. Confirm the exact width at the laser install; 1.5 mm is the planned default.">
          Cut line (mm)
          <input
            type="number"
            min="0"
            step="0.1"
            value={cutLineMm}
            onChange={(e) => {
              setCutLineMm(e.target.value)
              setExportInfo(null)
            }}
          />
        </label>
        <button
          className="primary"
          onClick={onCheckLayout}
          disabled={!tile || !fabricWidth || !quantity || busy}
        >
          Check layout
        </button>
      </div>

      {progress && (
        <div className="progress-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          {progress}
        </div>
      )}

      {report && (
        <div className="verify-panel">
          <h3>Verification</h3>
          <ul>
            {report.passed.map((line, i) => (
              <li key={`p${i}`} className="check-ok">
                ✓ {line}
              </li>
            ))}
            {report.blocking.map((line, i) => (
              <li key={`b${i}`} className="check-blocking">
                ✗ {line}
              </li>
            ))}
            {report.warnings.map((line, i) => (
              <li key={`w${i}`} className="check-warn">
                ⚠ {line}
              </li>
            ))}
          </ul>
          <div className="approve-row">
            {report.blocking.length > 0 ? (
              <span className="blocked">
                Export blocked — fix the issues above and check again.
              </span>
            ) : grid ? (
              <>
                <label className="approve-label">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  I checked the layout preview below and the numbers above: right tile, fabric
                  width, and quantity.
                </label>
                <button
                  className="primary"
                  disabled={!approved || exporting}
                  onClick={onExport}
                >
                  {exporting ? 'Exporting…' : 'Export laser DXF'}
                </button>
              </>
            ) : (
              <span className="output-size">
                Enter the fabric width and quantity, then Check layout.
              </span>
            )}
          </div>
          {exportInfo && (
            <div className={`message ${exportInfo.kind}`}>{exportInfo.text}</div>
          )}
        </div>
      )}

      {grid && tile ? (
        <>
          <p className="sheet-caption">
            Layout preview — exactly what the DXF contains: {grid.quantity} tile
            {grid.quantity > 1 ? 's' : ''}, {grid.colsPerRow} per row × {grid.rows} row
            {grid.rows > 1 ? 's' : ''} on {fmtMm(Number(fabricWidth))} fabric (dashed lines =
            20 mm side margins).
          </p>
          <LayoutPreview tile={tile} grid={grid} fabricWidthMm={Number(fabricWidth)} />
        </>
      ) : (
        <p className="placeholder">
          {tile
            ? 'Enter the fabric width and quantity, then Check layout to see the layout preview.'
            : 'Upload the pre-packed tile PDF, enter the fabric width and quantity, then Check layout.'}
        </p>
      )}
    </div>
  )
}
