import { useEffect, useRef, useState } from 'react'
import { startRender } from './lib/pdfRender'

// Resize handles for the selected box: position within the rect (px/py as
// fractions) and which screen edges the handle drags (n = top of screen).
const HANDLES = [
  { edges: { n: 1, w: 1 }, cursor: 'nwse-resize', px: 0, py: 0 },
  { edges: { n: 1 }, cursor: 'ns-resize', px: 0.5, py: 0 },
  { edges: { n: 1, e: 1 }, cursor: 'nesw-resize', px: 1, py: 0 },
  { edges: { w: 1 }, cursor: 'ew-resize', px: 0, py: 0.5 },
  { edges: { e: 1 }, cursor: 'ew-resize', px: 1, py: 0.5 },
  { edges: { s: 1, w: 1 }, cursor: 'nesw-resize', px: 0, py: 1 },
  { edges: { s: 1 }, cursor: 'ns-resize', px: 0.5, py: 1 },
  { edges: { s: 1, e: 1 }, cursor: 'nwse-resize', px: 1, py: 1 },
]
const HANDLE_SIZE = 7
const MIN_SIZE_PX = 4

// Renders page 1 of a PDF to a canvas with an SVG overlay for drawing,
// selecting, moving and resizing rectangular boxes. Boxes are exchanged with
// the parent in PDF points, origin bottom-left; all canvas-pixel math stays
// inside here.
//
// Selection is an array of ids. With multiSelect, a Draw|Select mode toggle
// appears: Select lets you lasso (rubber-band) several boxes at once, and
// Shift-click toggles individual boxes in either mode. Move/resize handles
// show only when exactly one box is selected (in Draw mode).
export default function PdfBoxEditor({
  pdf,
  boxes,
  selectedIds = [],
  onSelectionChange,
  onDrawBox,
  onUpdateBox,
  labelFor,
  detected = [],
  onUseDetected,
  flaggedIds,
  multiSelect = false,
}) {
  const isFlagged = (id) => !!flaggedIds && flaggedIds.has(id)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [scale, setScale] = useState(null)
  const [mode, setMode] = useState('draw') // 'draw' | 'select'
  const [drag, setDrag] = useState(null) // drawing a new box
  const [band, setBand] = useState(null) // rubber-band selection rectangle
  const [boxDrag, setBoxDrag] = useState(null) // { id, rect } move/resize in progress

  const selecting = multiSelect && mode === 'select'
  const isSelected = (id) => selectedIds.includes(id)
  const setSelection = (ids) => onSelectionChange?.(ids)
  const toggle = (id) =>
    setSelection(isSelected(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  useEffect(() => {
    if (!pdf || !containerRef.current) return
    const avail = containerRef.current.clientWidth - 4
    setScale(Math.min(1, avail / pdf.width))
  }, [pdf])

  useEffect(() => {
    if (!pdf || !scale || !canvasRef.current) return
    renderTaskRef.current?.cancel()
    const task = startRender(pdf.page, canvasRef.current, scale)
    renderTaskRef.current = task
    task.promise.catch(() => {}) // cancelled renders reject; that's fine
  }, [pdf, scale])

  if (!pdf) return null

  const toPdfBox = (a, b) => {
    const clampX = (v) => Math.min(Math.max(v, 0), pdf.width * scale)
    const clampY = (v) => Math.min(Math.max(v, 0), pdf.height * scale)
    const x0 = clampX(Math.min(a.x, b.x))
    const x1 = clampX(Math.max(a.x, b.x))
    const y0 = clampY(Math.min(a.y, b.y))
    const y1 = clampY(Math.max(a.y, b.y))
    const r = (v) => Math.round(v * 100) / 100
    return {
      x: r(pdf.originX + x0 / scale),
      y: r(pdf.originY + (pdf.height * scale - y1) / scale),
      w: r((x1 - x0) / scale),
      h: r((y1 - y0) / scale),
    }
  }

  const toScreenRect = (box) => ({
    x: (box.x - pdf.originX) * scale,
    y: (pdf.height - (box.y - pdf.originY) - box.h) * scale,
    w: box.w * scale,
    h: box.h * scale,
  })

  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

  // Pointer-down on empty page area: draw a new box (draw mode) or start a
  // rubber-band selection (select mode).
  const onMouseDown = (e) => {
    if (e.button !== 0 || !scale) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const start = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    if (selecting) {
      const move = (ev) =>
        setBand({ start, end: { x: ev.clientX - rect.left, y: ev.clientY - rect.top } })
      const up = (ev) => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        setBand(null)
        const end = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
        const sel = {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
        }
        if (sel.w < 3 && sel.h < 3) {
          setSelection([]) // a click on empty space clears the selection
          return
        }
        const hit = boxes.filter((b) => rectsOverlap(sel, toScreenRect(b.box))).map((b) => b.id)
        setSelection(hit)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      return
    }

    setSelection([])
    const move = (ev) =>
      setDrag({ start, end: { x: ev.clientX - rect.left, y: ev.clientY - rect.top } })
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDrag(null)
      const end = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
      const box = toPdfBox(start, end)
      if (box.w >= 2 && box.h >= 2) onDrawBox(box) // ignore stray clicks (< 2 pt)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Pointer-down on an existing box. Shift-click (or select mode) toggles it in
  // the selection. A plain click selects it alone and — in draw mode — starts a
  // move; dragging a handle (edges set) resizes.
  const startBoxDrag = (e, b, edges) => {
    if (e.button !== 0 || !scale) return
    e.stopPropagation()
    e.preventDefault()

    if (e.shiftKey || (selecting && !edges)) {
      toggle(b.id)
      return
    }
    setSelection([b.id])
    if (selecting) return // no move/resize while lassoing

    const startX = e.clientX
    const startY = e.clientY
    const orig = toScreenRect(b.box)
    const pageW = pdf.width * scale
    const pageH = pdf.height * scale
    let moved = false

    const apply = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
      let { x, y, w, h } = orig
      if (!edges) {
        x = Math.min(Math.max(x + dx, 0), Math.max(pageW - w, 0))
        y = Math.min(Math.max(y + dy, 0), Math.max(pageH - h, 0))
      } else {
        let x2 = x + w
        let y2 = y + h
        if (edges.w) x = Math.min(Math.max(x + dx, 0), x2 - MIN_SIZE_PX)
        if (edges.e) x2 = Math.max(Math.min(x2 + dx, pageW), x + MIN_SIZE_PX)
        if (edges.n) y = Math.min(Math.max(y + dy, 0), y2 - MIN_SIZE_PX)
        if (edges.s) y2 = Math.max(Math.min(y2 + dy, pageH), y + MIN_SIZE_PX)
        w = x2 - x
        h = y2 - y
      }
      return { x, y, w, h }
    }

    const move = (ev) => setBoxDrag({ id: b.id, rect: apply(ev) })
    const up = (ev) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const rect = apply(ev)
      setBoxDrag(null)
      // A plain click (no movement) only selects — don't touch coordinates.
      if (moved) {
        onUpdateBox(b.id, toPdfBox({ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }))
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const zoom = (factor) => setScale((s) => Math.min(3, Math.max(0.05, s * factor)))
  const fit = () => {
    const avail = containerRef.current.clientWidth - 4
    setScale(Math.min(1, avail / pdf.width))
  }

  const singleSelected = selectedIds.length === 1
  const bandRect = band && {
    x: Math.min(band.start.x, band.end.x),
    y: Math.min(band.start.y, band.end.y),
    w: Math.abs(band.end.x - band.start.x),
    h: Math.abs(band.end.y - band.start.y),
  }

  return (
    <div className="editor" data-tutorial="map-editor">
      <div className="editor-toolbar">
        <button onClick={() => zoom(0.8)}>−</button>
        <button onClick={() => zoom(1.25)}>+</button>
        <button onClick={fit}>Fit</button>
        {scale && <span className="zoom-label">{Math.round(scale * 100)}%</span>}
        {multiSelect && (
          <span className="mode-toggle">
            <button className={mode === 'draw' ? 'active' : ''} onClick={() => setMode('draw')}>
              Draw
            </button>
            <button
              className={mode === 'select' ? 'active' : ''}
              onClick={() => setMode('select')}
              data-tutorial="map-select"
            >
              Select
            </button>
          </span>
        )}
        <span className="hint">
          {selecting
            ? 'Drag to lasso boxes; Shift-click to add/remove. Then name them on the right.'
            : 'Drag on the page to draw a box. Drag a box to move it; drag its handles to resize.'}
        </span>
      </div>
      <div className="editor-scroll" ref={containerRef}>
        <div
          className="editor-stage"
          style={scale ? { width: pdf.width * scale, height: pdf.height * scale } : undefined}
        >
          <canvas ref={canvasRef} />
          {scale && (
            <svg
              width={pdf.width * scale}
              height={pdf.height * scale}
              className={selecting ? 'selecting' : undefined}
              onMouseDown={onMouseDown}
            >
              {/* Auto-detected regions not yet added: click to turn into a box. */}
              {detected.map((d, i) => {
                const r = toScreenRect(d)
                return (
                  <rect
                    key={`d${i}`}
                    className="detected"
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onUseDetected?.(d)
                    }}
                  >
                    <title>Click to add this slot</title>
                  </rect>
                )
              })}
              {boxes.map((b) => {
                const r = boxDrag?.id === b.id ? boxDrag.rect : toScreenRect(b.box)
                const sel = isSelected(b.id)
                const cls = ['box', sel && 'selected', isFlagged(b.id) && 'flagged']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <g key={b.id}>
                    <rect
                      className={cls}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      style={{ cursor: selecting ? 'pointer' : 'move' }}
                      onMouseDown={(e) => startBoxDrag(e, b, null)}
                    />
                    <text x={r.x + 3} y={r.y + 12}>
                      {labelFor(b)}
                    </text>
                    {sel &&
                      singleSelected &&
                      !selecting &&
                      HANDLES.map((h, i) => (
                        <rect
                          key={i}
                          className="handle"
                          x={r.x + h.px * r.w - HANDLE_SIZE / 2}
                          y={r.y + h.py * r.h - HANDLE_SIZE / 2}
                          width={HANDLE_SIZE}
                          height={HANDLE_SIZE}
                          style={{ cursor: h.cursor }}
                          onMouseDown={(e) => startBoxDrag(e, b, h.edges)}
                        />
                      ))}
                  </g>
                )
              })}
              {drag && (
                <rect
                  className="box drawing"
                  x={Math.min(drag.start.x, drag.end.x)}
                  y={Math.min(drag.start.y, drag.end.y)}
                  width={Math.abs(drag.end.x - drag.start.x)}
                  height={Math.abs(drag.end.y - drag.start.y)}
                />
              )}
              {bandRect && (
                <rect
                  className="band"
                  x={bandRect.x}
                  y={bandRect.y}
                  width={bandRect.w}
                  height={bandRect.h}
                />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
