import { useEffect, useRef, useState } from 'react'
import PdfBoxEditor from './PdfBoxEditor.jsx'
import { loadPdfPage } from './lib/pdfRender'
import { detectRegions } from './lib/detectRegions'
import { extractOutlines } from './lib/pdfPaths'
import { iou, OUTLINE_MATCH_IOU } from './lib/engine'
import {
  listStyles,
  getStyle,
  getStylePdf,
  saveStyle,
  deleteStyle,
  bytesToBase64,
  getBackupStatus,
  runBackup,
} from './lib/api'

const ROTATIONS = [0, 90, 180, 270]
const newId = () => crypto.randomUUID()

export default function MappingTool() {
  const [styleNumber, setStyleNumber] = useState('')
  const [styles, setStyles] = useState([])
  const [loadChoice, setLoadChoice] = useState('')
  const [tab, setTab] = useState('prenest')
  const [prenest, setPrenest] = useState(null) // { bytes, pdf, name }
  const [template, setTemplate] = useState(null)
  const [slots, setSlots] = useState([])
  const [templatePieces, setTemplatePieces] = useState([])
  const [selectedSlotIds, setSelectedSlotIds] = useState([])
  const [selectedPieceIds, setSelectedPieceIds] = useState([])
  const [detectedSlots, setDetectedSlots] = useState([]) // [{x,y,w,h}] not yet added
  const [detectedPieces, setDetectedPieces] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [templateOutlines, setTemplateOutlines] = useState(null) // null=not checked, []=none/failed
  const [checkingOutlines, setCheckingOutlines] = useState(false)
  const [bulkName, setBulkName] = useState('') // piece type to apply to a multi-selection
  const [message, setMessage] = useState(null) // { kind: 'ok'|'error'|'busy', text }
  const [confirmDelete, setConfirmDelete] = useState(null) // style id awaiting delete confirmation
  const lastSlotDefaults = useRef({ pieceType: '', rotation: 0 })

  const refreshStyles = () =>
    listStyles().then(setStyles).catch(() => setStyles([]))
  useEffect(() => {
    refreshStyles()
  }, [])

  // Map-time outline check: read the template's true cut outlines so each piece
  // can be shown as clip-safe (✓) or rectangle-only (⚠) BEFORE saving. Mirrors
  // the engine's run-time extraction, so what's shown here is what the fill does.
  useEffect(() => {
    if (!template?.bytes) {
      setTemplateOutlines(null)
      return
    }
    let cancelled = false
    setCheckingOutlines(true)
    extractOutlines(template.bytes)
      .then((o) => !cancelled && setTemplateOutlines(o))
      .catch(() => !cancelled && setTemplateOutlines([]))
      .finally(() => !cancelled && setCheckingOutlines(false))
    return () => {
      cancelled = true
    }
  }, [template])

  async function onFile(which, file) {
    if (!file) return
    setMessage(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pdf = await loadPdfPage(bytes)
      const data = { bytes, pdf, name: file.name }
      if (which === 'prenest') {
        setPrenest(data)
        setDetectedSlots([])
      } else {
        setTemplate(data)
        setDetectedPieces([])
      }
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not open PDF: ${err.message}` })
    }
  }

  function nextInstance(pieceType) {
    const used = slots
      .filter((s) => s.pieceType === pieceType)
      .map((s) => s.instance)
    return used.length ? Math.max(...used) + 1 : 1
  }

  function onDrawSlot(box) {
    const { pieceType, rotation } = lastSlotDefaults.current
    const slot = {
      id: newId(),
      pieceType,
      instance: nextInstance(pieceType),
      rotation,
      box,
    }
    setSlots((s) => [...s, slot])
    setSelectedSlotIds([slot.id])
  }

  function onDrawPiece(box) {
    const piece = { id: newId(), pieceType: '', box }
    setTemplatePieces((p) => [...p, piece])
    setSelectedPieceIds([piece.id])
  }

  // Bulk naming: apply one piece type to every selected slot and auto-number
  // their instances 1..N in reading order (top-left to bottom-right). Saves
  // labeling a whole piece-type's 12 slots one at a time.
  function applyBulkName() {
    const type = bulkName.trim()
    if (!type || selectedSlotIds.length === 0) return
    const sel = slots.filter((s) => selectedSlotIds.includes(s.id))
    const tol = Math.min(...sel.map((s) => s.box.h)) * 0.5
    const ordered = [...sel].sort((a, b) => {
      if (Math.abs(a.box.y - b.box.y) > tol) return b.box.y - a.box.y // higher y = top
      return a.box.x - b.box.x // then left to right
    })
    const instanceById = new Map(ordered.map((s, i) => [s.id, i + 1]))
    setSlots((all) =>
      all.map((s) =>
        instanceById.has(s.id) ? { ...s, pieceType: type, instance: instanceById.get(s.id) } : s,
      ),
    )
    lastSlotDefaults.current.pieceType = type
    setBulkName('')
    setSelectedSlotIds([])
  }

  // Bulk rotation: write a rotation to every selected slot. Rotation stays
  // per-slot in the map — set-to a value, or add 180° to each — never inferred
  // from piece type. Keeps the selection so naming can follow in the same pass.
  function applyBulkRotation(rot) {
    setSlots((all) =>
      all.map((s) => (selectedSlotIds.includes(s.id) ? { ...s, rotation: rot } : s)),
    )
    lastSlotDefaults.current.rotation = rot
  }
  function addBulk180() {
    setSlots((all) =>
      all.map((s) =>
        selectedSlotIds.includes(s.id) ? { ...s, rotation: (s.rotation + 180) % 360 } : s,
      ),
    )
  }

  // Auto-detect (M6): find closed-path regions in the active PDF. Geometry only
  // — the operator still labels each one. Manual drawing stays available.
  async function onDetect() {
    if (!activePdf) return
    setDetecting(true)
    setMessage(null)
    try {
      const regions = await detectRegions(activePdf.pdf.page)
      const existing = (tab === 'prenest' ? slots : templatePieces).length
      const fresh = regions.filter(
        (r) => !boxAlreadyPlaced(r, tab === 'prenest' ? slots : templatePieces),
      )
      if (tab === 'prenest') setDetectedSlots(fresh)
      else setDetectedPieces(fresh)
      setMessage({
        kind: fresh.length ? 'ok' : 'error',
        text: fresh.length
          ? `Detected ${fresh.length} region(s)${existing ? ' (skipping ones you already have)' : ''}. Click an outline to add it, or “Add all detected”. You still set piece type, instance and rotation.`
          : 'No new closed-path regions found — draw boxes manually.',
      })
    } catch (err) {
      setMessage({ kind: 'error', text: `Auto-detect failed: ${err.message}` })
    } finally {
      setDetecting(false)
    }
  }

  // Treat a detected region as already placed if a box's center sits inside it.
  function boxAlreadyPlaced(region, existing) {
    return existing.some((b) => {
      const cx = b.box.x + b.box.w / 2
      const cy = b.box.y + b.box.h / 2
      return (
        cx >= region.x &&
        cx <= region.x + region.w &&
        cy >= region.y &&
        cy <= region.y + region.h
      )
    })
  }

  function useDetectedSlot(box) {
    onDrawSlot(box)
    setDetectedSlots((d) => d.filter((x) => x !== box))
  }

  function useDetectedPiece(box) {
    onDrawPiece(box)
    setDetectedPieces((d) => d.filter((x) => x !== box))
  }

  function addAllDetected() {
    if (tab === 'prenest') {
      const { pieceType, rotation } = lastSlotDefaults.current
      const start = nextInstance(pieceType)
      const added = detectedSlots.map((box, i) => ({
        id: newId(),
        pieceType,
        instance: start + i,
        rotation,
        box,
      }))
      setSlots((s) => [...s, ...added])
      setDetectedSlots([])
    } else {
      const added = detectedPieces.map((box) => ({ id: newId(), pieceType: '', box }))
      setTemplatePieces((p) => [...p, ...added])
      setDetectedPieces([])
    }
  }

  function updateSlot(id, patch) {
    setSlots((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    if (patch.pieceType !== undefined) lastSlotDefaults.current.pieceType = patch.pieceType
    if (patch.rotation !== undefined) lastSlotDefaults.current.rotation = patch.rotation
  }

  function updatePiece(id, patch) {
    setTemplatePieces((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  // Will this template piece clip to its true outline at fill time, or fall back
  // to a plain rectangle (which on nested/curved pieces copies neighbour art)?
  function pieceOutlineState(box) {
    if (!templateOutlines) return 'unknown'
    let best = 0
    for (const o of templateOutlines) {
      const v = iou(box, o.bbox)
      if (v > best) best = v
    }
    return best >= OUTLINE_MATCH_IOU ? 'ok' : 'rect'
  }
  const rectOnlyPieces =
    tab === 'template' && templateOutlines
      ? templatePieces.filter((p) => pieceOutlineState(p.box) === 'rect')
      : []

  const slotCounts = slots.reduce((acc, s) => {
    const key = s.pieceType || '?'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  // Find piece#instance collisions and which slot ids carry them, so both the
  // warning banner and the slot list/canvas can point right at the duplicates.
  const { duplicates, dupSlotIds } = (() => {
    const byKey = new Map()
    for (const s of slots) {
      if (!s.pieceType) continue
      const key = `${s.pieceType.trim()}#${s.instance}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(s.id)
    }
    const dupKeys = []
    const ids = new Set()
    for (const [key, slotIds] of byKey) {
      if (slotIds.length > 1) {
        dupKeys.push(key)
        for (const id of slotIds) ids.add(id)
      }
    }
    return { duplicates: dupKeys, dupSlotIds: ids }
  })()

  async function onLoadStyle() {
    if (!loadChoice) return
    setMessage({ kind: 'busy', text: 'Loading style…' })
    try {
      const meta = await getStyle(loadChoice)
      const [pBytes, tBytes] = await Promise.all([
        getStylePdf(loadChoice, 'prenest'),
        getStylePdf(loadChoice, 'template'),
      ])
      setStyleNumber(meta.style)
      setSlots(
        meta.slots.map((s) => ({
          id: newId(),
          pieceType: s.piece_type,
          instance: s.instance,
          rotation: s.rotation,
          box: s.box,
        })),
      )
      setTemplatePieces(
        meta.templatePieces.map((p) => ({ id: newId(), pieceType: p.piece_type, box: p.box })),
      )
      setPrenest(pBytes ? { bytes: pBytes, pdf: await loadPdfPage(pBytes), name: 'prenest.pdf' } : null)
      setTemplate(tBytes ? { bytes: tBytes, pdf: await loadPdfPage(tBytes), name: 'template.pdf' } : null)
      setSelectedSlotIds([])
      setSelectedPieceIds([])
      setDetectedSlots([])
      setDetectedPieces([])
      setMessage({ kind: 'ok', text: `Loaded "${meta.style}" for editing.` })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  // Delete the style chosen in "Edit existing". Gated by a named confirmation
  // (confirmDelete holds the id). Permanent — there is no undo by design.
  async function onDeleteConfirmed() {
    const id = confirmDelete
    setConfirmDelete(null)
    setMessage({ kind: 'busy', text: `Deleting "${id}"…` })
    try {
      await deleteStyle(id)
      await refreshStyles()
      if (loadChoice === id) setLoadChoice('')
      setMessage({ kind: 'ok', text: `Deleted style "${id}" from disk.` })
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not delete "${id}": ${err.message}` })
    }
  }

  async function onSave() {
    const style = styleNumber.trim()
    const problems = []
    if (!style) problems.push('Enter a style number.')
    if (slots.length === 0 && templatePieces.length === 0)
      problems.push('Nothing to save — draw at least one box.')
    const unlabeledSlots = slots.filter((s) => !s.pieceType.trim()).length
    if (unlabeledSlots) problems.push(`${unlabeledSlots} slot box(es) have no piece type.`)
    const unlabeledPieces = templatePieces.filter((p) => !p.pieceType.trim()).length
    if (unlabeledPieces) problems.push(`${unlabeledPieces} template box(es) have no piece type.`)
    if (problems.length) {
      setMessage({ kind: 'error', text: problems.join(' ') })
      return
    }
    // Is this a brand-new style (not already on disk)? Used to offer a backup
    // right after creating one — the highest-value moment to protect new work.
    const isNew = !styles.some((s) => s.id === style)
    setMessage({ kind: 'busy', text: 'Saving…' })
    try {
      await saveStyle({
        style,
        slots: slots.map((s) => ({
          piece_type: s.pieceType.trim(),
          instance: s.instance,
          rotation: s.rotation,
          box: s.box,
        })),
        templatePieces: templatePieces.map((p) => ({
          piece_type: p.pieceType.trim(),
          box: p.box,
        })),
        prenestPdf: prenest ? bytesToBase64(prenest.bytes) : undefined,
        templatePdf: template ? bytesToBase64(template.bytes) : undefined,
      })
      await refreshStyles()
      const savedText = `Saved "${style}" — ${slots.length} slots, ${templatePieces.length} template pieces → styles/${style}/`
      setMessage({ kind: 'ok', text: savedText })

      // New style → recommend a backup now (the one deliberate interruption).
      if (isNew) {
        let backup = null
        try {
          backup = await getBackupStatus()
        } catch {}
        if (backup && backup.configured) {
          if (window.confirm(`New style "${style}" saved.\n\nBack up your styles now? (Recommended — it protects this new work.)`)) {
            setMessage({ kind: 'busy', text: 'Backing up…' })
            try {
              const r = await runBackup()
              window.dispatchEvent(new Event('capnest-backup'))
              setMessage({ kind: 'ok', text: `${savedText} — and backed up to ${r.lastBackupName}.` })
            } catch (err) {
              setMessage({ kind: 'error', text: `${savedText} — but the backup failed: ${err.message}` })
            }
          }
        } else {
          setMessage({
            kind: 'ok',
            text: `${savedText} — tip: set a backup folder in the bar at the bottom so new styles are protected.`,
          })
        }
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  const activePdf = tab === 'prenest' ? prenest : template
  const activeDetected = tab === 'prenest' ? detectedSlots : detectedPieces

  return (
    <div className="mapping-tool">
      <div className="toolbar">
        <label>
          Style number
          <input
            value={styleNumber}
            onChange={(e) => setStyleNumber(e.target.value)}
            placeholder="e.g. PUR560104"
          />
        </label>
        <label>
          Edit existing
          <select value={loadChoice} onChange={(e) => setLoadChoice(e.target.value)}>
            <option value="">— select —</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.style} ({s.slotCount} slots)
              </option>
            ))}
          </select>
        </label>
        <button onClick={onLoadStyle} disabled={!loadChoice}>
          Load
        </button>
        <button
          className="danger"
          onClick={() => setConfirmDelete(loadChoice)}
          disabled={!loadChoice}
          title="Delete the selected style from disk"
        >
          Delete
        </button>
        <span className="spacer" />
        <button className="primary" onClick={onSave}>
          Save style
        </button>
      </div>

      {confirmDelete && (
        <div className="message warn confirm-delete">
          <span>
            Delete style <strong>"{confirmDelete}"</strong> permanently? This removes{' '}
            <code>styles/{confirmDelete}/</code> (the slot map and its PDFs) from disk and{' '}
            <strong>cannot be undone</strong>.
          </span>
          <div className="confirm-actions">
            <button className="danger" onClick={onDeleteConfirmed}>
              Delete "{confirmDelete}" permanently
            </button>
            <button onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </div>
      )}
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
      {duplicates.length > 0 && (
        <div className="message warn">
          Duplicate piece/instance labels: {duplicates.join(', ')}
        </div>
      )}

      <div className="subtabs">
        <button className={tab === 'prenest' ? 'active' : ''} onClick={() => setTab('prenest')}>
          1. Pre-nest slots ({slots.length})
        </button>
        <button className={tab === 'template' ? 'active' : ''} onClick={() => setTab('template')}>
          2. Template pieces ({templatePieces.length})
        </button>
      </div>

      <div className="tab-body">
        <div className="editor-pane">
          <div className="file-row">
            <label className="file-label">
              {tab === 'prenest' ? 'Pre-nest PDF:' : 'Customer template PDF:'}
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => onFile(tab, e.target.files[0])}
              />
            </label>
            {activePdf && (
              <span className="file-info">
                {activePdf.name} — {Math.round(activePdf.pdf.width)} ×{' '}
                {Math.round(activePdf.pdf.height)} pt
              </span>
            )}
            {activePdf && (
              <span className="detect-controls">
                <button onClick={onDetect} disabled={detecting}>
                  {detecting ? 'Detecting…' : 'Auto-detect regions'}
                </button>
                {activeDetected.length > 0 && (
                  <>
                    <button className="primary" onClick={addAllDetected}>
                      Add all detected ({activeDetected.length})
                    </button>
                    <button
                      onClick={() =>
                        tab === 'prenest' ? setDetectedSlots([]) : setDetectedPieces([])
                      }
                    >
                      Clear
                    </button>
                  </>
                )}
              </span>
            )}
          </div>

          {!activePdf && (
            <p className="placeholder">Upload a PDF to start drawing boxes.</p>
          )}

          {tab === 'prenest' ? (
            <PdfBoxEditor
              pdf={prenest?.pdf}
              boxes={slots}
              selectedIds={selectedSlotIds}
              onSelectionChange={setSelectedSlotIds}
              onDrawBox={onDrawSlot}
              onUpdateBox={(id, box) => updateSlot(id, { box })}
              labelFor={(s) =>
                `${s.pieceType || '?'} #${s.instance}${s.rotation ? ` ${s.rotation}°` : ''}`
              }
              detected={detectedSlots}
              onUseDetected={useDetectedSlot}
              flaggedIds={dupSlotIds}
              multiSelect
            />
          ) : (
            <PdfBoxEditor
              pdf={template?.pdf}
              boxes={templatePieces}
              selectedIds={selectedPieceIds}
              onSelectionChange={setSelectedPieceIds}
              onDrawBox={onDrawPiece}
              onUpdateBox={(id, box) => updatePiece(id, { box })}
              labelFor={(p) => p.pieceType || '?'}
              detected={detectedPieces}
              onUseDetected={useDetectedPiece}
            />
          )}
        </div>

        <div className="side-pane">
          {tab === 'prenest' ? (
            <>
              <h2>Slots</h2>
              {Object.keys(slotCounts).length > 0 && (
                <p className="counts">
                  {Object.entries(slotCounts)
                    .map(([t, n]) => `${t}: ${n}`)
                    .join(' · ')}
                </p>
              )}
              {selectedSlotIds.length > 1 && (
                <div className="bulk-name">
                  <strong>{selectedSlotIds.length} slots selected.</strong> Name them all:
                  <div className="bulk-row">
                    <input
                      value={bulkName}
                      placeholder="e.g. sideA"
                      onChange={(e) => setBulkName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyBulkName()}
                    />
                    <button className="primary" onClick={applyBulkName} disabled={!bulkName.trim()}>
                      Apply &amp; number 1–{selectedSlotIds.length}
                    </button>
                  </div>
                </div>
              )}
              {selectedSlotIds.length > 1 && (
                <div className="bulk-rotate">
                  <strong>Rotation for {selectedSlotIds.length} selected:</strong>
                  <div className="bulk-row">
                    {ROTATIONS.map((r) => (
                      <button key={r} onClick={() => applyBulkRotation(r)}>
                        {r}°
                      </button>
                    ))}
                    <button onClick={addBulk180}>+180° to all</button>
                  </div>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Piece type</th>
                    <th>Inst</th>
                    <th>Rot</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr
                      key={s.id}
                      className={[
                        selectedSlotIds.includes(s.id) && 'selected',
                        dupSlotIds.has(s.id) && 'dup',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedSlotIds([s.id])}
                    >
                      <td>
                        <input
                          value={s.pieceType}
                          onChange={(e) => updateSlot(s.id, { pieceType: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={s.instance}
                          onChange={(e) =>
                            updateSlot(s.id, { instance: parseInt(e.target.value, 10) || 1 })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={s.rotation}
                          onChange={(e) =>
                            updateSlot(s.id, { rotation: parseInt(e.target.value, 10) })
                          }
                        >
                          {ROTATIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}°
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="delete"
                          title="Delete box"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSlots((all) => all.filter((x) => x.id !== s.id))
                            setSelectedSlotIds((ids) => ids.filter((id) => id !== s.id))
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <h2>Template pieces</h2>
              {template && (
                <p className={`outline-check ${rectOnlyPieces.length ? 'warn' : 'ok'}`}>
                  {checkingOutlines
                    ? 'Checking piece outlines…'
                    : !templateOutlines || templatePieces.length === 0
                      ? ''
                      : rectOnlyPieces.length === 0
                        ? `✓ All ${templatePieces.length} piece(s) match a cut outline — artwork will clip to the true shape.`
                        : `⚠ ${rectOnlyPieces.length} of ${templatePieces.length} piece(s) have no readable outline and will clip to a plain rectangle` +
                          `${rectOnlyPieces.some((p) => p.pieceType.trim()) ? ` (${rectOnlyPieces.map((p) => p.pieceType || '?').join(', ')})` : ''}. ` +
                          `On nested or curved pieces that copies neighbouring artwork — re-check these in the template before relying on this style.`}
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Piece type</th>
                    <th>Clip</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {templatePieces.map((p) => {
                    const st = pieceOutlineState(p.box)
                    return (
                    <tr
                      key={p.id}
                      className={selectedPieceIds.includes(p.id) ? 'selected' : ''}
                      onClick={() => setSelectedPieceIds([p.id])}
                    >
                      <td>
                        <input
                          value={p.pieceType}
                          onChange={(e) => updatePiece(p.id, { pieceType: e.target.value })}
                        />
                      </td>
                      <td className="clip-status">
                        {st === 'unknown' ? (
                          ''
                        ) : st === 'ok' ? (
                          <span className="ok" title="Matches a cut outline — clips to the true shape">
                            ✓
                          </span>
                        ) : (
                          <span className="rect" title="No readable outline — will clip to a rectangle">
                            rect ⚠
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="delete"
                          title="Delete box"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTemplatePieces((all) => all.filter((x) => x.id !== p.id))
                            setSelectedPieceIds((ids) => ids.filter((id) => id !== p.id))
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
