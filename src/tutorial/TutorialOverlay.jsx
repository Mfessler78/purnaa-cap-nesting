import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Guided-tour overlay, rendered through a portal on top of the live app. A
// tutorial is pure data — an ordered list of steps:
//   { target, title, body, note?, arrow?, actions?, nextLabel?, backLabel?, doneLabel? }
//   target  key of a [data-tutorial="…"] element to spotlight, or null for a
//           centered card (intros / troubleshooting).
//   body    string or array of strings (paragraphs).
//   note    optional troubleshooting callout, shown in a distinct style.
//   arrow   where the pointer card sits relative to the target, named by the
//           direction its arrow points: 'up' (card below target), 'down'
//           (above), 'left' (card right of target), 'right' (card left).
//           Omit to auto-pick below/above by available space.
//   actions [{ label, tutorial }] — buttons that launch another tutorial via
//           the onLaunch prop (used by the Getting Started hub).
// All state lives here and in the parent that mounts us; closing (× button,
// backdrop click, or Esc) calls onClose, the parent unmounts the component,
// and nothing survives — no storage, no leftover DOM, no disabled controls.
//
// Click rules: the dim backdrop is FOUR panels around the spotlight, leaving a
// real hole over the target — clicking the spotlighted control clicks the live
// control (the tour stays open); clicking anywhere else exits the tour.

const PAD = 4 // spotlight padding around the target, px
const GAP = 10 // gap between spotlight and pointer card, px
const MARGIN = 8 // minimum distance from viewport edges, px

export default function TutorialOverlay({ steps, onClose, onLaunch }) {
  const [index, setIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [layout, setLayout] = useState(null) // pointer-card position + arrow
  const cardRef = useRef(null)
  const step = steps[index]
  const last = index === steps.length - 1

  // Follow the real element: re-resolve the target and re-measure its rect on
  // resize/scroll, plus a light poll so the box tracks layout changes that fire
  // no event (content loading, a control appearing after the user acts).
  useEffect(() => {
    if (!step?.target) {
      setTargetRect(null)
      return
    }
    const measure = () => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`)
      setTargetRect((prev) => {
        if (!el) return prev === null ? prev : null
        const r = el.getBoundingClientRect()
        return prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      })
    }
    measure()
    const timer = setInterval(measure, 250)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  // Place the pointer card next to the target (after render, so the card's
  // real size is measurable) and aim its arrow at the target's center.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !targetRect) {
      setLayout(null) // centered card — positioned by CSS
      return
    }
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
    const cx = targetRect.left + targetRect.width / 2
    const cy = targetRect.top + targetRect.height / 2
    const below = targetRect.top + targetRect.height + PAD + GAP
    const dir = step.arrow || (below + ch + MARGIN <= vh ? 'up' : 'down')
    let top, left
    if (dir === 'up') {
      top = below
      left = cx - cw / 2
    } else if (dir === 'down') {
      top = targetRect.top - PAD - GAP - ch
      left = cx - cw / 2
    } else if (dir === 'left') {
      left = targetRect.left + targetRect.width + PAD + GAP
      top = cy - ch / 2
    } else {
      left = targetRect.left - PAD - GAP - cw
      top = cy - ch / 2
    }
    top = clamp(top, MARGIN, vh - ch - MARGIN)
    left = clamp(left, MARGIN, vw - cw - MARGIN)
    // Arrow offset along the card edge, kept inside the card's corners.
    const arrow =
      dir === 'up' || dir === 'down' ? clamp(cx - left, 16, cw - 16) : clamp(cy - top, 16, ch - 16)
    setLayout((prev) =>
      prev && prev.top === top && prev.left === left && prev.dir === dir && prev.arrow === arrow
        ? prev
        : { top, left, dir, arrow },
    )
  }, [targetRect, step])

  // Esc closes; arrows/Enter navigate.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        last ? onClose() : setIndex((i) => i + 1)
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault()
        setIndex((i) => i - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, last, onClose])

  const missing = !!step.target && !targetRect // target named but not on screen
  const centered = !step.target || missing
  const paragraphs = Array.isArray(step.body) ? step.body : [step.body]

  // The spotlight hole the backdrop panels leave open (viewport coords).
  const hole = targetRect && {
    top: targetRect.top - PAD,
    left: targetRect.left - PAD,
    width: targetRect.width + PAD * 2,
    height: targetRect.height + PAD * 2,
  }

  return createPortal(
    <div className="tutorial-overlay">
      {hole ? (
        <>
          {/* Four dim panels around the hole — clicking any of them exits; the
              hole itself has no overlay, so the real control stays clickable. */}
          <div className="tutorial-dim" onMouseDown={onClose} style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
          <div className="tutorial-dim" onMouseDown={onClose} style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tutorial-dim" onMouseDown={onClose} style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
          <div className="tutorial-dim" onMouseDown={onClose} style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div
            className="tutorial-spotlight"
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        <div className="tutorial-dim" onMouseDown={onClose} style={{ inset: 0 }} />
      )}
      <div
        ref={cardRef}
        className={`tutorial-card${centered ? ' centered' : ''}`}
        style={centered ? undefined : layout ? { top: layout.top, left: layout.left } : { visibility: 'hidden' }}
      >
        {!centered && layout && (
          <div
            className={`tutorial-arrow ${layout.dir}`}
            style={
              layout.dir === 'up' || layout.dir === 'down'
                ? { left: layout.arrow }
                : { top: layout.arrow }
            }
          />
        )}
        <button className="tutorial-close" onClick={onClose} title="Close the tutorial (Esc)">
          ×
        </button>
        <h3>{step.title}</h3>
        {paragraphs.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
        {step.note && <p className="tutorial-note">{step.note}</p>}
        {step.actions && (
          <div className="tutorial-actions">
            {step.actions.map((a) => (
              <button key={a.tutorial} className="primary" onClick={() => onLaunch?.(a.tutorial)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {missing && (
          <p className="tutorial-missing">
            This step points at a control that isn't on screen right now — it appears once the
            earlier steps are done. You can still read along with Next / Back.
          </p>
        )}
        <div className="tutorial-controls">
          <span className="tutorial-progress">
            {index + 1} / {steps.length}
          </span>
          {index > 0 && <button onClick={() => setIndex(index - 1)}>{step.backLabel || 'Back'}</button>}
          <button className="primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? step.doneLabel || 'Done' : step.nextLabel || 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
