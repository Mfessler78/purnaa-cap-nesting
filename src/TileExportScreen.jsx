import { useState } from 'react'
import PdfViewer from './PdfViewer.jsx'
import { loadPdfPage } from './lib/pdfRender'
import { inspectTile } from './lib/tileInspect'
import { computeTiling } from './lib/tileMath'
import { buildTiledDxf } from './lib/tileExport'

// The "DXF only" branch of the run flow (DXF Tile Export, stage 4). Mila hands
// over a pre-packed PDF tile (pieces already arranged and spaced); this screen
// repeats it across the fabric width and down the roll and exports ONE
// laser-ready DXF. No printing, no auto-nesting, no collision detection —
// deterministic grid tiling of the tile's page box only (tileMath.js).
//
// Deliberately mirrors RunScreen's visual language: same root class (so the
// toolbar/verify styling is literally the same CSS), the same
// { passed, blocking, warnings } verification panel, the same approve-checkbox
// → primary-export-button placement. Warn-only checks (Check A, dozen
// remainder) never block; Check B (tile wider than usable fabric) blocks
// exactly like RunScreen's blocking lines.

const tick = () => new Promise((r) => setTimeout(r))

const fmtMm = (mm) => `${(Math.round(mm * 10) / 10).toFixed(1)} mm`

export default function TileExportScreen() {
  const [tile, setTile] = useState(null) // inspectTile result + { name }
  const [preview, setPreview] = useState(null) // loadPdfPage of the uploaded tile
  const [fabricWidth, setFabricWidth] = useState('')
  const [quantity, setQuantity] = useState(12)
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
    setPreview(null)
    setBusy(true)
    setProgress('Reading the tile PDF…')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await tick()
      const inspected = await inspectTile(bytes)
      setTile({ ...inspected, name: file.name })
      setPreview(await loadPdfPage(bytes))
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
        `Layout: ${res.colsPerRow} tile${res.colsPerRow > 1 ? 's' : ''} per row × ${res.rows} row${res.rows > 1 ? 's' : ''}`,
        `Quantity ${quantity} → ${res.roundedQty} tiles (whole dozens)`,
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
      a.download = `${base} ${Math.round(Number(fabricWidth))}mm qty${grid.roundedQty} TILED CUT.dxf`
      a.click()
      URL.revokeObjectURL(url)
      setExportInfo({ kind: 'ok', text: `Exported ${a.download} (${grid.roundedQty} tiles).` })
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
          Mila’s tile PDF
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
        <label title="Number of tiles. Rounds DOWN to whole dozens; any remainder is produced separately.">
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
                  I checked the tile preview below and the numbers above: right tile, fabric
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

      {preview ? (
        <>
          <p className="sheet-caption">
            Showing Mila’s tile once — the export repeats it
            {grid ? ` ${grid.colsPerRow} per row × ${grid.rows} rows` : ' across the fabric'}.
          </p>
          <PdfViewer pdf={preview} />
        </>
      ) : (
        <p className="placeholder">
          Upload Mila’s pre-packed tile PDF, enter the fabric width and quantity, then Check
          layout.
        </p>
      )}
    </div>
  )
}
