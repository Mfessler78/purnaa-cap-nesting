import { useEffect, useRef, useState } from 'react'
import PdfBoxEditor from './PdfBoxEditor.jsx'
import { loadPdfPage } from './lib/pdfRender'
import { detectRegions } from './lib/detectRegions'
import { extractOutlines } from './lib/pdfPaths'
import { iou, OUTLINE_MATCH_IOU } from './lib/engine'
import {
  listStyles,
  getStyle,
  getStylePdfFile,
  saveStyle,
  deleteStyle,
  bytesToBase64,
} from './lib/api'

const CUT_MODES = ['laser', 'die']
const MODE_LABELS = { die: 'Die cut', laser: 'Laser' }

// Describe how a save/delete propagated to the shared P-drive set. Empty when it
// synced fine; otherwise a plain-language note the operator can act on. The local
// change already succeeded — this only concerns whether other computers will see it.
function syncNote(sync) {
  if (!sync || sync.synced) return ''
  if (sync.reason === 'no-folder') return ' — change NOT shared to other computers (no Backup folder is set).'
  if (sync.reason === 'unreachable')
    return ' — change NOT shared: the P drive is not connected. Reconnect and repeat so other computers get it.'
  return ` — sharing to the P drive failed: ${sync.reason}`
}

const ROTATIONS = [0, 90, 180, 270]
const newId = () => crypto.randomUUID()

export default function MappingTool() {
  const [styleNumber, setStyleNumber] = useState('')
  const [styles, setStyles] = useState([])
  const [loadChoice, setLoadChoice] = useState('')
  const [tab, setTab] = useState('prenest')
  const [prenest, setPrenest] = useState(null) // active mode's { bytes, pdf, name }
  const [template, setTemplate] = useState(null) // active variant's { bytes, pdf, name }
  const [slots, setSlots] = useState([])
  const [templatePieces, setTemplatePieces] = useState([])
  // U3: the pre-nest is mapped PER cut mode. `prenest`/`slots` above are the
  // ACTIVE mode's working buffers; the other mode's data parks in this stash and
  // swaps in when the toggle changes. Each entry: { prenest, slots, file }.
  const [prenestMode, setPrenestMode] = useState('laser')
  const [prenestStash, setPrenestStash] = useState({})
  // U2: a style can hold several TEMPLATE size variants. `template`/`templatePieces`
  // are the active variant's buffers; others park in this stash keyed by variant
  // id. Each entry: { template, pieces, pageSize, file }. tplIds is the ordered
  // list shown in the variant selector; tplId is the active one.
  const [tplIds, setTplIds] = useState(['v1'])
  const [tplId, setTplId] = useState('v1')
  const [tplStash, setTplStash] = useState({})
  const [tplPageSize, setTplPageSize] = useState(null) // active variant page size
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

  // Every pdf.js doc this screen creates is registered here. Docs migrate
  // between the active buffers and the mode/variant stashes without dying, so
  // per-state cleanup can't track them — instead the true discard events
  // (upload replacing a buffer, style load replacing the whole set, variant
  // removal) call destroyPdf, and unmount sweeps whatever is still live.
  const liveDocs = useRef(new Set())
  function trackPdf(pdf) {
    liveDocs.current.add(pdf)
    return pdf
  }
  // data is a { bytes, pdf, name } buffer (or null/undefined).
  function destroyPdf(data) {
    if (!data?.pdf) return
    liveDocs.current.delete(data.pdf)
    data.pdf.destroy()
  }
  useEffect(() => {
    const docs = liveDocs.current
    return () => {
      for (const pdf of docs) pdf.destroy()
      docs.clear()
    }
  }, [])

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
      const pdf = trackPdf(await loadPdfPage(bytes))
      const data = { bytes, pdf, name: file.name }
      if (which === 'prenest') {
        destroyPdf(prenest)
        setPrenest(data)
        setDetectedSlots([])
      } else {
        destroyPdf(template)
        setTemplate(data)
        setTplPageSize({ width: pdf.width, height: pdf.height }) // measured for U2 size-match
        setDetectedPieces([])
      }
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not open PDF: ${err.message}` })
    }
  }

  // Switch the active pre-nest cut mode (U3): park the current mode's buffers in
  // the stash and swap in the target mode's (empty if never mapped).
  function switchPrenestMode(mode) {
    if (mode === prenestMode) return
    setPrenestStash((st) => {
      const next = { ...st, [prenestMode]: { prenest, slots } }
      const target = next[mode] || { prenest: null, slots: [] }
      setPrenest(target.prenest || null)
      setSlots(target.slots || [])
      delete next[mode]
      return next
    })
    setPrenestMode(mode)
    setSelectedSlotIds([])
    setDetectedSlots([])
  }

  // Switch the active template variant (U2): park current, swap in target.
  function switchTemplate(id) {
    if (id === tplId) return
    setTplStash((st) => {
      const next = { ...st, [tplId]: { template, pieces: templatePieces, pageSize: tplPageSize } }
      const target = next[id] || { template: null, pieces: [], pageSize: null }
      setTemplate(target.template || null)
      setTemplatePieces(target.pieces || [])
      setTplPageSize(target.pageSize || null)
      delete next[id]
      return next
    })
    setTplId(id)
    setSelectedPieceIds([])
    setDetectedPieces([])
  }

  function addTemplateVariant() {
    const base = 'v'
    let n = tplIds.length + 1
    let id = `${base}${n}`
    while (tplIds.includes(id)) id = `${base}${++n}`
    // Park current variant, then start the new empty one.
    setTplStash((st) => ({ ...st, [tplId]: { template, pieces: templatePieces, pageSize: tplPageSize } }))
    setTplIds((ids) => [...ids, id])
    setTplId(id)
    setTemplate(null)
    setTemplatePieces([])
    setTplPageSize(null)
    setSelectedPieceIds([])
    setDetectedPieces([])
  }

  function removeTemplateVariant(id) {
    if (tplIds.length <= 1) return
    destroyPdf(id === tplId ? template : tplStash[id]?.template)
    const remaining = tplIds.filter((x) => x !== id)
    setTplStash((st) => {
      const next = { ...st }
      delete next[id]
      // If removing the active variant, load another into the buffers.
      if (id === tplId) {
        const nextId = remaining[0]
        const target = next[nextId] || { template: null, pieces: [], pageSize: null }
        setTemplate(target.template || null)
        setTemplatePieces(target.pieces || [])
        setTplPageSize(target.pageSize || null)
        delete next[nextId]
        setTplId(nextId)
      }
      return next
    })
    setTplIds(remaining)
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
      const meta = await getStyle(loadChoice) // normalized: templates[], prenests{}
      setStyleNumber(meta.style)

      // Template variants (U2): fetch each variant's PDF + boxes.
      const variants = meta.templates?.length ? meta.templates : [{ id: 'v1', pieces: [], page_size: null }]
      const tplEntries = await Promise.all(
        variants.map(async (t) => {
          const bytes = await getStylePdfFile(loadChoice, t.template_pdf)
          const pdf = bytes ? trackPdf(await loadPdfPage(bytes)) : null
          return {
            id: t.id,
            template: bytes ? { bytes, pdf, name: t.template_pdf } : null,
            pieces: (t.pieces || []).map((p) => ({ id: newId(), pieceType: p.piece_type, box: p.box })),
            pageSize: t.page_size || (pdf ? { width: pdf.width, height: pdf.height } : null),
          }
        }),
      )
      // Pre-nest per cut mode (U3): fetch each mode's PDF + slots.
      const modes = Object.keys(meta.prenests || {})
      const preEntries = await Promise.all(
        modes.map(async (mode) => {
          const data = meta.prenests[mode]
          const bytes = await getStylePdfFile(loadChoice, data.prenest_pdf)
          const pdf = bytes ? trackPdf(await loadPdfPage(bytes)) : null
          return {
            mode,
            prenest: bytes ? { bytes, pdf, name: data.prenest_pdf } : null,
            slots: (data.slots || []).map((s) => ({
              id: newId(),
              pieceType: s.piece_type,
              instance: s.instance,
              rotation: s.rotation,
              box: s.box,
            })),
          }
        }),
      )
      // Both fetches succeeded — the previous working set (active buffers +
      // both stashes) is replaced wholesale below; free every doc it holds.
      // (On a failed load above, the old set stays displayed, so stays alive.)
      destroyPdf(prenest)
      destroyPdf(template)
      for (const e of Object.values(prenestStash)) destroyPdf(e.prenest)
      for (const e of Object.values(tplStash)) destroyPdf(e.template)

      const tIds = tplEntries.map((e) => e.id)
      setTplIds(tIds)
      setTplId(tIds[0])
      setTemplate(tplEntries[0].template)
      setTemplatePieces(tplEntries[0].pieces)
      setTplPageSize(tplEntries[0].pageSize)
      const tStash = {}
      for (const e of tplEntries.slice(1)) tStash[e.id] = { template: e.template, pieces: e.pieces, pageSize: e.pageSize }
      setTplStash(tStash)

      const activeMode = modes.includes('laser') ? 'laser' : modes[0] || 'laser'
      const active = preEntries.find((e) => e.mode === activeMode) || { prenest: null, slots: [] }
      setPrenestMode(activeMode)
      setPrenest(active.prenest)
      setSlots(active.slots)
      const pStash = {}
      for (const e of preEntries) if (e.mode !== activeMode) pStash[e.mode] = { prenest: e.prenest, slots: e.slots }
      setPrenestStash(pStash)

      setSelectedSlotIds([])
      setSelectedPieceIds([])
      setDetectedSlots([])
      setDetectedPieces([])
      const modeList = modes.map((m) => MODE_LABELS[m] || m).join(' + ') || 'none'
      setMessage({
        kind: 'ok',
        text: `Loaded "${meta.style}" — ${tIds.length} template(s), pre-nest modes: ${modeList}.`,
      })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  // Merge the active buffers with the parked stashes into the full multi-variant
  // / multi-mode payload the server expects.
  function gatherTemplates() {
    return tplIds.map((id) => {
      const e = id === tplId ? { template, pieces: templatePieces, pageSize: tplPageSize } : tplStash[id]
      return {
        id,
        page_size: e?.pageSize || null,
        pieces: (e?.pieces || []).map((p) => ({ piece_type: p.pieceType.trim(), box: p.box })),
        pdfBase64: e?.template ? bytesToBase64(e.template.bytes) : undefined,
      }
    })
  }
  function gatherPrenests() {
    const out = {}
    const entries = { ...prenestStash, [prenestMode]: { prenest, slots } }
    for (const [mode, e] of Object.entries(entries)) {
      // Skip a mode with nothing mapped (no slots and no PDF).
      if (!(e.slots && e.slots.length) && !e.prenest) continue
      out[mode] = {
        slots: (e.slots || []).map((s) => ({
          piece_type: s.pieceType.trim(),
          instance: s.instance,
          rotation: s.rotation,
          box: s.box,
        })),
        pdfBase64: e.prenest ? bytesToBase64(e.prenest.bytes) : undefined,
      }
    }
    return out
  }

  // Delete the style chosen in "Edit existing". Gated by a named confirmation
  // (confirmDelete holds the id). Permanent — there is no undo by design.
  async function onDeleteConfirmed() {
    const id = confirmDelete
    setConfirmDelete(null)
    setMessage({ kind: 'busy', text: `Deleting "${id}"…` })
    try {
      const res = await deleteStyle(id)
      await refreshStyles()
      if (loadChoice === id) setLoadChoice('')
      setMessage({ kind: 'ok', text: `Deleted style "${id}" from disk.` + syncNote(res.sync) })
    } catch (err) {
      setMessage({ kind: 'error', text: `Could not delete "${id}": ${err.message}` })
    }
  }

  async function onSave() {
    const style = styleNumber.trim()
    const templates = gatherTemplates()
    const prenests = gatherPrenests()
    const modeKeys = Object.keys(prenests)
    const problems = []
    if (!style) problems.push('Enter a style number.')
    const totalSlots = modeKeys.reduce((n, m) => n + prenests[m].slots.length, 0)
    const totalPieces = templates.reduce((n, t) => n + t.pieces.length, 0)
    if (totalSlots === 0 && totalPieces === 0) problems.push('Nothing to save — draw at least one box.')
    for (const m of modeKeys) {
      const u = prenests[m].slots.filter((s) => !s.piece_type).length
      if (u) problems.push(`${MODE_LABELS[m] || m}: ${u} slot box(es) have no piece type.`)
    }
    for (const t of templates) {
      const u = t.pieces.filter((p) => !p.piece_type).length
      if (u) problems.push(`Template "${t.id}": ${u} box(es) have no piece type.`)
    }
    // Multi-variant safety: variants must have distinct measured sizes, or the
    // run screen can't auto-pick by artwork size (U2).
    if (templates.length > 1) {
      const missing = templates.filter((t) => !t.page_size).map((t) => t.id)
      if (missing.length) problems.push(`Template(s) ${missing.join(', ')} need a PDF uploaded so their size can be measured for auto-select.`)
      const sizes = templates.filter((t) => t.page_size).map((t) => `${Math.round(t.page_size.width)}x${Math.round(t.page_size.height)}`)
      if (new Set(sizes).size !== sizes.length) problems.push('Two template variants have the same size — artwork auto-select needs distinct sizes.')
    }
    if (problems.length) {
      setMessage({ kind: 'error', text: problems.join(' ') })
      return
    }
    setMessage({ kind: 'busy', text: 'Saving…' })
    try {
      // Saving also publishes the style to the shared P-drive set (current/ +
      // an append-only event), so other computers pick it up on their next
      // Retrieve — no separate "back up now" step. res.sync tells us if that
      // sharing succeeded; the local save always did.
      const res = await saveStyle({ style, templates, prenests })
      await refreshStyles()
      const savedText =
        `Saved "${style}" — templates: ${templates.map((t) => `${t.id}(${t.pieces.length})`).join(', ')}; ` +
        `pre-nest: ${modeKeys.map((m) => `${MODE_LABELS[m] || m}(${prenests[m].slots.length})`).join(', ')} → styles/${style}/`
      setMessage({ kind: 'ok', text: savedText + syncNote(res.sync) })
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    }
  }

  const activePdf = tab === 'prenest' ? prenest : template
  const activeDetected = tab === 'prenest' ? detectedSlots : detectedPieces

  return (
    <div className="mapping-tool">
      <div className="toolbar">
        <label data-tutorial="map-style-number">
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
        <button className="primary" onClick={onSave} data-tutorial="map-save">
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
        <button
          className={tab === 'template' ? 'active' : ''}
          onClick={() => setTab('template')}
          data-tutorial="map-tab-template"
        >
          2. Template pieces ({templatePieces.length})
        </button>
      </div>

      {/* U3: each cut mode has its own pre-nest + slot map. Switch maps here. */}
      {tab === 'prenest' && (
        <div className="context-bar" title="Die cut and Laser need different spacing, so each has its own pre-nest sheet and slot map. Map them separately.">
          <span className="context-label">Cut mode:</span>
          <div className="mode-toggle" data-tutorial="map-mode">
            {CUT_MODES.map((m) => (
              <button
                key={m}
                className={prenestMode === m ? 'active' : ''}
                onClick={() => switchPrenestMode(m)}
              >
                {MODE_LABELS[m]}
                {prenestStash[m]?.slots?.length ? ` (${prenestStash[m].slots.length})` : ''}
              </button>
            ))}
          </div>
          <span className="hint-text">Mapping the {MODE_LABELS[prenestMode]} pre-nest.</span>
        </div>
      )}

      {/* U2: a style can hold several template SIZE variants; artwork auto-picks
          the matching one at run time. Manage variants here. */}
      {tab === 'template' && (
        <div className="context-bar" data-tutorial="map-variant" title="Add a variant for each template SIZE (e.g. last year's and this year's). On a run, the app picks the variant matching the uploaded artwork's size — it never scales.">
          <span className="context-label">Template variant:</span>
          <select value={tplId} onChange={(e) => switchTemplate(e.target.value)}>
            {tplIds.map((id) => (
              <option key={id} value={id}>
                {id}
                {(id === tplId ? templatePieces.length : tplStash[id]?.pieces?.length || 0)
                  ? ` (${id === tplId ? templatePieces.length : tplStash[id].pieces.length} pcs)`
                  : ''}
              </option>
            ))}
          </select>
          <button onClick={addTemplateVariant}>+ Add variant</button>
          {tplIds.length > 1 && (
            <button className="danger" onClick={() => removeTemplateVariant(tplId)}>
              Remove "{tplId}"
            </button>
          )}
          <span className="hint-text">
            {tplPageSize
              ? `Size: ${Math.round(tplPageSize.width)} × ${Math.round(tplPageSize.height)} pt`
              : 'Upload this variant’s PDF to measure its size.'}
          </span>
        </div>
      )}

      <div className="tab-body">
        <div className="editor-pane">
          <div className="file-row">
            <label className="file-label" data-tutorial="map-file">
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
                <button onClick={onDetect} disabled={detecting} data-tutorial="map-detect">
                  {detecting ? 'Detecting…' : 'Auto-detect regions'}
                </button>
                {activeDetected.length > 0 && (
                  <>
                    <button className="primary" onClick={addAllDetected} data-tutorial="map-add-all">
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

        <div className="side-pane" data-tutorial="map-side">
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
                <div className="bulk-name" data-tutorial="map-bulk-name">
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
                <div className="bulk-rotate" data-tutorial="map-bulk-rotate">
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
