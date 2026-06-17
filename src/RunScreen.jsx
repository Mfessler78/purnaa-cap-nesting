import { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.jsx'
import { listStyles, getStyle, getStylePdf, listFabrics, exportStatus, processExport } from './lib/api'
import { loadPdfPage } from './lib/pdfRender'
import { fillLayout } from './lib/engine'
import { checkArtworkRegions } from './lib/verifyArtwork'

// Yield to the browser so a just-set progress message paints before the next
// heavy (CPU-blocking) step runs.
const tick = () => new Promise((r) => setTimeout(r))

export default function RunScreen() {
  const [styles, setStyles] = useState([])
  const [styleId, setStyleId] = useState('')
  const [fabrics, setFabrics] = useState([])
  const [fabricName, setFabricName] = useState('')
  const [quantity, setQuantity] = useState(12)
  const [artwork, setArtwork] = useState(null) // { bytes, name }
  const [clipToOutline, setClipToOutline] = useState(true)
  const [bleedIn, setBleedIn] = useState(0.25) // outward bleed kept when clipping, inches
  const [cutLineMm, setCutLineMm] = useState(1.5) // black cut-line width the laser follows, mm
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null) // { passed: [], blocking: [] }
  const [result, setResult] = useState(null) // { bytes, pdf, rounded, exportBytes }
  const [approved, setApproved] = useState(false)
  const [gs, setGs] = useState({ ghostscript: false })
  const [exporting, setExporting] = useState(false)
  const [exportInfo, setExportInfo] = useState(null) // { kind, text }
  const [progress, setProgress] = useState(null) // status text shown during long ops

  useEffect(() => {
    listStyles().then(setStyles).catch(() => setStyles([]))
    listFabrics().then(setFabrics).catch(() => setFabrics([]))
    // Default stays direct-vector; Ghostscript presence only enables the
    // flatten option, it does not become the default.
    exportStatus().then(setGs).catch(() => {})
  }, [])

  // Any input change invalidates the previous fill and its approval.
  function resetOutput() {
    setResult(null)
    setReport(null)
    setApproved(false)
    setExportInfo(null)
  }

  async function onArtworkFile(file) {
    if (!file) return
    setArtwork({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name })
    resetOutput()
  }

  async function onFill() {
    resetOutput()
    setBusy(true)
    setProgress('Loading style and PDFs…')
    try {
      const meta = await getStyle(styleId)
      const [prenestBytes, templateBytes] = await Promise.all([
        getStylePdf(styleId, 'prenest'),
        getStylePdf(styleId, 'template'),
      ])
      if (!prenestBytes) throw new Error('This style has no saved pre-nest PDF.')

      const fabric = fabrics.find((f) => f.name === fabricName)
      const common = {
        prenestBytes,
        templateBytes,
        artworkBytes: artwork.bytes,
        style: meta,
        quantity: Number(quantity),
        fabric,
        clipToOutline,
        clipBleed: Math.max(0, Number(bleedIn) || 0) * 72,
        cutLineWidthMm: Math.max(0, Number(cutLineMm) || 0),
      }
      setProgress('Checking artwork and placing pieces… (large artwork can take a moment)')
      await tick()
      const [artChecks, res] = await Promise.all([
        checkArtworkRegions(artwork.bytes, meta.templatePieces),
        fillLayout({ ...common, guides: true }),
      ])
      // Export composition: same placements on a blank page — no guide content.
      if (!res.errors) {
        setProgress('Composing the print layout…')
        await tick()
      }
      const exportRes = res.errors ? null : await fillLayout({ ...common, guides: false })

      const passed = []
      const blocking = [...(res.errors || [])]
      const warnings = [...(res.warnings || [])]

      const emptyRegions = artChecks.filter((c) => !c.hasArtwork)
      if (emptyRegions.length) {
        for (const c of emptyRegions) {
          blocking.push(
            `No artwork found in the template region for "${c.piece_type}" — the region appears empty.`,
          )
        }
      } else if (artChecks.length) {
        passed.push(`Artwork found in all ${artChecks.length} template piece regions`)
      }

      if (!res.errors) {
        if (res.clip?.enabled) {
          passed.push(
            `Clipped ${res.clip.applied}/${res.clip.total} pieces to their outline (+${(res.clip.bleed / 72).toFixed(2)}" bleed)`,
          )
          if (res.clip.fallback.length) {
            warnings.push(
              `No outline match for: ${res.clip.fallback.join(', ')} — these used the rectangle box (check for bleed/cut-off).`,
            )
          }
        } else {
          warnings.push('Outline clipping is off — artwork is clipped to rectangles and may bleed or cut off.')
        }
        passed.unshift(
          `Artwork artboard matches the template (${res.artboard})`,
          `Quantity ${quantity} → ${res.rounded} (${res.copies} sheet${res.copies > 1 ? 's' : ''} × ${res.unitsPerSheet} caps)`,
          ...res.summary.map((s) => `Placed ${s}`),
          `Fabric stretch ${res.scalePercent}% applied to every sheet`,
          `Stamp: ${res.stamp}`,
        )
        setResult({
          bytes: res.pdfBytes,
          pdf: await loadPdfPage(res.pdfBytes),
          rounded: res.rounded,
          copies: res.copies,
          exportBytes: exportRes.pdfBytes,
        })
      }
      setReport({ passed, blocking, warnings })
    } catch (err) {
      setReport({ passed: [], blocking: [err.message], warnings: [] })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  // method: 'pdflib' (default, no decision) or 'ghostscript' (rare flatten).
  async function onExport(method) {
    setExporting(true)
    setExportInfo(null)
    const gsFlatten = method === 'ghostscript'
    setProgress(
      gsFlatten
        ? 'Flattening transparency with Ghostscript — this can take several minutes for detailed artwork. Keep this tab open…'
        : 'Preparing the print PDF…',
    )
    try {
      await tick()
      const { bytes, applied } = await processExport(result.exportBytes, { method })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${styleId} ${fabricName} qty${result.rounded} PRINT.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setExportInfo({ kind: 'ok', text: `Exported. Applied: ${applied}` })
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
          Style
          <select
            value={styleId}
            onChange={(e) => {
              setStyleId(e.target.value)
              resetOutput()
            }}
          >
            <option value="">— select —</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.style} ({s.slotCount} slots)
              </option>
            ))}
          </select>
        </label>
        <label>
          Fabric
          <select
            value={fabricName}
            onChange={(e) => {
              setFabricName(e.target.value)
              resetOutput()
            }}
          >
            <option value="">— select —</option>
            {fabrics.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} ({f.scale}%)
              </option>
            ))}
          </select>
        </label>
        <label>
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
        <label>
          Customer artwork PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => onArtworkFile(e.target.files[0])}
          />
        </label>
        <label className="clip-toggle" title="Trim each piece's artwork to its true shape instead of a rectangle">
          <input
            type="checkbox"
            checked={clipToOutline}
            onChange={(e) => {
              setClipToOutline(e.target.checked)
              resetOutput()
            }}
          />
          Clip artwork to piece outlines
        </label>
        {clipToOutline && (
          <label title="Keep this much artwork past each piece edge so print bleed isn't trimmed">
            Bleed (in)
            <input
              type="number"
              min="0"
              step="0.05"
              value={bleedIn}
              onChange={(e) => {
                setBleedIn(e.target.value)
                resetOutput()
              }}
            />
          </label>
        )}
        <label title="Black cut line the laser follows, printed around every piece. Confirm the exact width at the laser install; 1.5 mm is the planned default. Set to 0 to omit cut lines.">
          Cut line (mm)
          <input
            type="number"
            min="0"
            step="0.1"
            value={cutLineMm}
            onChange={(e) => {
              setCutLineMm(e.target.value)
              resetOutput()
            }}
          />
        </label>
        <button
          className="primary"
          onClick={onFill}
          disabled={!styleId || !fabricName || !artwork || busy}
        >
          {busy ? 'Filling…' : 'Fill layout'}
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
            {(report.warnings || []).map((line, i) => (
              <li key={`w${i}`} className="check-warn">
                ⚠ {line}
              </li>
            ))}
          </ul>
          <div className="approve-row">
            {report.blocking.length > 0 ? (
              <span className="blocked">
                Export blocked — fix the issues above and fill again.
              </span>
            ) : (
              <>
                <label className="approve-label">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  I checked the preview below: alignment, rotation, and nothing missing.
                </label>
                <button
                  className="primary"
                  disabled={!approved || exporting}
                  onClick={() => onExport('pdflib')}
                >
                  {exporting ? 'Exporting…' : 'Export print PDF'}
                </button>
                {gs.ghostscript && (
                  <span className="gs-fallback">
                    <button
                      className="secondary"
                      disabled={!approved || exporting}
                      onClick={() => onExport('ghostscript')}
                      title="Only if the RIP mishandles transparency. Re-rips the whole sheet; takes several minutes."
                    >
                      Flatten with Ghostscript
                    </button>
                    <span className="gs-note">Rarely needed — takes several minutes.</span>
                  </span>
                )}
              </>
            )}
          </div>
          {exportInfo && (
            <div className={`message ${exportInfo.kind}`}>{exportInfo.text}</div>
          )}
        </div>
      )}

      {result ? (
        <>
          {result.copies > 1 && (
            <p className="sheet-caption">
              Showing sheet 1 of {result.copies} — all sheets are identical.
            </p>
          )}
          <PdfViewer pdf={result.pdf} />
        </>
      ) : (
        <p className="placeholder">
          {report
            ? 'No preview — fix the blocking issues and fill again.'
            : 'Pick a style, fabric and quantity, upload artwork, then Fill layout.'}
        </p>
      )}
    </div>
  )
}
