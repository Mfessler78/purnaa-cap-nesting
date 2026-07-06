import { useEffect, useState } from 'react'
import PdfViewer from './PdfViewer.jsx'
import { listStyles, getStyle, getStylePdfFile, listFabrics, exportStatus, processExport } from './lib/api'
import { loadPdfPage } from './lib/pdfRender'
import { fillLayout } from './lib/engine'
import { checkArtworkRegions, checkArtworkColor } from './lib/verifyArtwork'

const MODE_LABELS = { die: 'Die cut', laser: 'Laser' }

// Pick the template variant whose page size matches the uploaded artwork. The
// match is EXACT (1 pt tolerance — the same guard the engine uses to refuse a
// size mismatch); we SELECT a matching template, we never scale to fit (§3). A
// single-variant style always uses its one template (the engine still refuses if
// the artwork size differs).
function pickTemplate(templates, artSize) {
  if (templates.length === 1) return { variant: templates[0] }
  const tol = 1
  const sizeStr = (s) => (s ? `${Math.round(s.width)}×${Math.round(s.height)} pt` : 'unmeasured')
  const matches = templates.filter(
    (t) =>
      t.page_size &&
      Math.abs(t.page_size.width - artSize.width) <= tol &&
      Math.abs(t.page_size.height - artSize.height) <= tol,
  )
  if (matches.length === 1) return { variant: matches[0] }
  const list = templates.map((t) => `${t.id} (${sizeStr(t.page_size)})`).join(', ')
  if (matches.length === 0) {
    return {
      error:
        `No template size matches the artwork (${Math.round(artSize.width)}×${Math.round(artSize.height)} pt). ` +
        `Available templates: ${list}. Refusing — artwork must match a template at identical scale (no scaling).`,
    }
  }
  return {
    error: `${matches.length} templates share the artwork's size (${list}) — a setup error. Fix the duplicate before running.`,
  }
}

// Yield to the browser so a just-set progress message paints before the next
// heavy (CPU-blocking) step runs.
const tick = () => new Promise((r) => setTimeout(r))

// Format a PDF page size (points) as the real-world output size in inches AND
// mm. Read straight off the generated PDF's page box (not recomputed from
// inputs) so it always equals the file that goes to RasterLink.
function fmtOutputSize(wPt, hPt) {
  const inch = (pt) => (pt / 72).toFixed(2)
  const mm = (pt) => Math.round((pt / 72) * 25.4)
  return `${inch(wPt)} × ${inch(hPt)} in  (${mm(wPt)} × ${mm(hPt)} mm)`
}

export default function RunScreen() {
  const [styles, setStyles] = useState([])
  const [styleId, setStyleId] = useState('')
  const [meta, setMeta] = useState(null) // normalized style.json (templates[], prenests{})
  const [cutMode, setCutMode] = useState('') // 'die' | 'laser'
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

  // Load the selected style's map so we know its cut modes (U3) and template
  // variants (U2) before the operator runs it.
  useEffect(() => {
    if (!styleId) {
      setMeta(null)
      setCutMode('')
      return
    }
    let cancelled = false
    getStyle(styleId)
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        const modes = Object.keys(m.prenests || {})
        // Default to laser when present (the historical/most-common mode), else
        // whichever mode this style actually has mapped.
        setCutMode(modes.includes('laser') ? 'laser' : modes[0] || '')
      })
      .catch(() => {
        if (!cancelled) {
          setMeta(null)
          setCutMode('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [styleId])

  const availableModes = meta ? Object.keys(meta.prenests || {}) : []

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
      const styleMeta = meta || (await getStyle(styleId))
      const mode = cutMode || Object.keys(styleMeta.prenests || {})[0]
      const prenestEntry = styleMeta.prenests?.[mode]
      if (!prenestEntry) throw new Error(`This style has no "${MODE_LABELS[mode] || mode}" pre-nest mapped.`)

      // U2: measure the artwork and SELECT the matching-size template variant.
      const artPage = await loadPdfPage(artwork.bytes)
      const pick = pickTemplate(styleMeta.templates || [], { width: artPage.width, height: artPage.height })
      if (pick.error) {
        setReport({ passed: [], blocking: [pick.error], warnings: [] })
        return
      }
      const variant = pick.variant

      const [prenestBytes, templateBytes] = await Promise.all([
        getStylePdfFile(styleId, prenestEntry.prenest_pdf),
        getStylePdfFile(styleId, variant.template_pdf),
      ])
      if (!prenestBytes) throw new Error(`This style has no saved "${MODE_LABELS[mode] || mode}" pre-nest PDF.`)

      // The engine is schema-agnostic: feed it the chosen variant's pieces and
      // the chosen mode's slots as plain arrays (U2/U3 live in selection, not the
      // engine), plus the cut mode for the stamp + DXF.
      const engineStyle = { style: styleMeta.style, templatePieces: variant.pieces, slots: prenestEntry.slots }
      const fabric = fabrics.find((f) => f.name === fabricName)
      const common = {
        prenestBytes,
        templateBytes,
        artworkBytes: artwork.bytes,
        style: engineStyle,
        quantity: Number(quantity),
        fabric,
        cutMode: mode,
        clipToOutline,
        clipBleed: Math.max(0, Number(bleedIn) || 0) * 72,
        cutLineWidthMm: Math.max(0, Number(cutLineMm) || 0),
      }
      setProgress('Checking artwork and placing pieces… (large artwork can take a moment)')
      await tick()
      const [artChecks, colorCheck, res] = await Promise.all([
        checkArtworkRegions(artwork.bytes, variant.pieces),
        checkArtworkColor(artwork.bytes),
        fillLayout({ ...common, guides: true }),
      ])
      // Export composition: same placements on a blank page — no guide content.
      if (!res.errors) {
        setProgress('Composing the print layout…')
        await tick()
      }
      const exportRes = res.errors ? null : await fillLayout({ ...common, guides: false })

      const passed = colorCheck.confirmation ? [colorCheck.confirmation] : []
      const blocking = [...(res.errors || [])]
      const warnings = [...(res.warnings || []), ...colorCheck.warnings]

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
          `Cut mode: ${MODE_LABELS[mode] || mode}`,
          mode === 'die'
            ? 'Die cut: no printed cut line (the die cuts the shape)'
            : `Laser cut line: ${Math.max(0, Number(cutLineMm) || 0)} mm printed around each piece`,
          ...(styleMeta.templates.length > 1
            ? [`Selected template "${variant.id}" by artwork size (${res.artboard})`]
            : []),
          `Artwork artboard matches the template (${res.artboard})`,
          `Quantity ${quantity} → ${res.rounded} (${res.copies} sheet${res.copies > 1 ? 's' : ''} × ${res.unitsPerSheet} caps)`,
          ...res.summary.map((s) => `Placed ${s}`),
          `Fabric stretch ${res.scalePercent}% applied to every sheet`,
          ...(mode === 'laser' ? [`Laser DXF ready (${exportRes.dxf ? 'cut contours included' : 'no contours'})`] : []),
          `Stamp: ${res.stamp}`,
        )
        setResult({
          bytes: res.pdfBytes,
          pdf: await loadPdfPage(res.pdfBytes),
          rounded: res.rounded,
          copies: res.copies,
          mode,
          exportBytes: exportRes.pdfBytes,
          dxf: exportRes.dxf || null,
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
      const modeTag = result.mode ? ` ${result.mode.toUpperCase()}` : ''
      const a = document.createElement('a')
      a.href = url
      a.download = `${styleId} ${fabricName} qty${result.rounded}${modeTag} PRINT.pdf`
      a.click()
      URL.revokeObjectURL(url)
      // Laser mode also drops the DXF the cutter reads, alongside the PDF.
      if (result.mode === 'laser' && result.dxf) {
        const durl = URL.createObjectURL(new Blob([result.dxf], { type: 'application/dxf' }))
        const da = document.createElement('a')
        da.href = durl
        da.download = `${styleId} ${fabricName} qty${result.rounded}${modeTag} CUT.dxf`
        da.click()
        URL.revokeObjectURL(durl)
      }
      setExportInfo({
        kind: 'ok',
        text: `Exported${result.mode === 'laser' && result.dxf ? ' (PDF + DXF)' : ''}. Applied: ${applied}`,
      })
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
        <label title="Die cut and Laser use different pre-nest spacing; each is mapped separately per style. A mode that isn't mapped for this style is disabled.">
          Cut mode
          <select
            value={cutMode}
            onChange={(e) => {
              setCutMode(e.target.value)
              resetOutput()
            }}
            disabled={!meta}
          >
            {!meta && <option value="">— pick a style —</option>}
            {['die', 'laser'].map((m) => {
              const has = availableModes.includes(m)
              return (
                <option key={m} value={m} disabled={!has}>
                  {MODE_LABELS[m]}
                  {has ? '' : ' (not mapped)'}
                </option>
              )
            })}
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
        {cutMode !== 'die' && (
          <label title="Black cut line the laser follows, printed around every piece. Confirm the exact width at the laser install; 1.5 mm is the planned default. Die-cut runs never print a cut line.">
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
        )}
        <button
          className="primary"
          onClick={onFill}
          disabled={!styleId || !cutMode || !fabricName || !artwork || busy}
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
                {result?.pdf && (
                  <div className="output-size" title="Final page size of the print PDF that goes to RasterLink, after fabric stretch — read from the generated file.">
                    Output sheet size: {fmtOutputSize(result.pdf.width, result.pdf.height)}
                  </div>
                )}
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
