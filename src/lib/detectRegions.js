import { OPS } from 'pdfjs-dist'
import { matMul, applyPt, FULL_PAGE_RATIO } from './pdfGeometry.js'

// Auto-detect (M6): extract slot/piece outlines from a pre-nest or template PDF.
//
// The pre-nest is built as one closed path per slot, each wrapped in
// save / transform / constructPath / restore. We walk the operator list,
// track the CTM through save/restore/transform, and turn every path's local
// bounding box into a page-space box. This recovers the slot rectangles without
// guessing — labels are NEVER inferred here; the operator still assigns
// piece_type / instance / rotation. Manual box-drawing remains the fallback.

const round2 = (v) => Math.round(v * 100) / 100

// Read a constructPath's local bounding box. pdf.js (v6) passes it as the third
// arg: an array-like {0:minX,1:minY,2:maxX,3:maxY}. Fall back to scanning the
// raw coordinate buffer for finite number pairs if that arg is absent.
function localBBox(args) {
  const bb = args[2]
  if (bb && Number.isFinite(bb[0]) && Number.isFinite(bb[2])) {
    return { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] }
  }
  const coords = args[1]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const buf = Array.isArray(coords) ? coords.flatMap((c) => Object.values(c)) : []
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const x = buf[i], y = buf[i + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}

// Returns boxes in PDF points, origin bottom-left ({x,y,w,h} with (x,y) = the
// bottom-left corner) — the same convention drawn boxes use, so detected
// regions drop straight into the editor.
export async function detectRegions(page) {
  const opList = await page.getOperatorList()
  const [vx0, vy0, vx1, vy1] = page.view
  const pageW = vx1 - vx0
  const pageH = vy1 - vy0

  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const boxes = []

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]
    if (fn === OPS.save) {
      stack.push(ctm.slice())
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || [1, 0, 0, 1, 0, 0]
    } else if (fn === OPS.transform) {
      ctm = matMul(ctm, args)
    } else if (fn === OPS.constructPath) {
      const bb = localBBox(args)
      if (!bb) continue
      const corners = [
        applyPt(ctm, bb.minX, bb.minY),
        applyPt(ctm, bb.maxX, bb.minY),
        applyPt(ctm, bb.maxX, bb.maxY),
        applyPt(ctm, bb.minX, bb.maxY),
      ]
      const xs = corners.map((c) => c[0])
      const ys = corners.map((c) => c[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(...xs) - x
      const h = Math.max(...ys) - y
      boxes.push({ x, y, w, h })
    }
  }

  // Drop the full-page clip/background rectangle and any degenerate hairlines.
  // Coordinates are absolute user space; the editor stores boxes the same way.
  return boxes
    .filter((b) => b.w >= 2 && b.h >= 2)
    .filter((b) => !(b.w >= pageW * FULL_PAGE_RATIO && b.h >= pageH * FULL_PAGE_RATIO))
    .map((b) => ({ x: round2(b.x), y: round2(b.y), w: round2(b.w), h: round2(b.h) }))
}
