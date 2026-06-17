import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  setLineWidth,
  setStrokingCmykColor,
  stroke,
} from 'pdf-lib'
import { extractOutlines } from './pdfPaths.js'

// Fill engine (M2): places customer artwork into pre-nest slots.
// - Matches slots to artwork by piece_type label (exact match after trimming).
// - One artwork region per piece_type, clipped from the artwork PDF at the
//   template piece's box, replicated into every matching slot.
// - Rotation comes from each slot's stored value; artwork is centered in the
//   slot box at its native size. NO scaling of any kind happens here.
// Pure data-in/data-out; runs in browser and Node (used by tests).

// Round a quantity up to the next whole sheet. One pre-nest sheet yields
// `unitsPerSheet` caps (normally 12); orders are printed as whole sheets.
export const roundUpToSheet = (q, unitsPerSheet) => Math.ceil(q / unitsPerSheet) * unitsPerSheet

// drawPage rotates counter-clockwise around the draw point. Returns the draw
// point that centers a w×h source, rotated by `rotation`, on (cx, cy).
export function anchorFor(cx, cy, w, h, rotation) {
  switch (rotation) {
    case 0:
      return { x: cx - w / 2, y: cy - h / 2 }
    case 90:
      return { x: cx + h / 2, y: cy - w / 2 }
    case 180:
      return { x: cx + w / 2, y: cy + h / 2 }
    case 270:
      return { x: cx - h / 2, y: cy + w / 2 }
    default:
      throw new Error(`Unsupported rotation ${rotation} (must be 0/90/180/270)`)
  }
}

const fmtSize = (s) => `${Math.round(s.width)} × ${Math.round(s.height)} pt`

// Minimum box/outline IoU to accept an outline as a piece's true shape. Shared
// with the mapping tool's map-time ✓ / rect ⚠ preview so what's shown there is
// exactly what the fill does at run time.
export const OUTLINE_MATCH_IOU = 0.2

// Overlap of two boxes / their union — used to match a mapped piece box to its
// detected outline.
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const uni = a.w * a.h + b.w * b.h - inter
  return uni > 0 ? inter / uni : 0
}

// CCW rotation of a form-local vector, matching pdf-lib's drawPage rotate.
export function rotVec(rotation, x, y) {
  switch (rotation) {
    case 0:
      return [x, y]
    case 90:
      return [-y, x]
    case 180:
      return [-x, -y]
    case 270:
      return [y, -x]
    default:
      return [x, y]
  }
}

// Flatten a subpath (m/l/c segments) into a polygon of [x,y] points, sampling
// cubic beziers. A polygon is what the outward-offset below needs.
function flattenSubpath(sp, steps = 12) {
  const poly = []
  let cur = null
  for (const seg of sp) {
    if (seg.op === 'm') {
      cur = [seg.pts[0], seg.pts[1]]
      poly.push(cur)
    } else if (seg.op === 'l') {
      cur = [seg.pts[0], seg.pts[1]]
      poly.push(cur)
    } else if (seg.op === 'c') {
      const [x1, y1, x2, y2, x3, y3] = seg.pts
      const [x0, y0] = cur
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const u = 1 - t
        poly.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ])
      }
      cur = [x3, y3]
    }
  }
  if (poly.length > 1) {
    const a = poly[0]
    const b = poly[poly.length - 1]
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) poly.pop()
  }
  return poly
}

// Grow a closed polygon outward by `margin` points so a piece keeps its own
// print bleed when clipped. Each edge is pushed out along its outward normal
// (winding-aware) and consecutive edges re-intersected; sharp convex corners
// are mitre-capped to avoid spikes. Handles concave shapes (visor C's).
export function offsetPolygon(pts, margin) {
  const n = pts.length
  if (n < 3 || margin <= 0) return pts
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  const sign = area > 0 ? 1 : -1 // outward normal side depends on winding
  const lines = []
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    let dx = x2 - x1
    let dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const nx = sign * dy
    const ny = -sign * dx
    lines.push({ px: x1 + nx * margin, py: y1 + ny * margin, dx, dy })
  }
  const out = []
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    const det = a.dx * -b.dy - a.dy * -b.dx
    let p
    if (Math.abs(det) > 1e-9) {
      const rx = b.px - a.px
      const ry = b.py - a.py
      const tt = (rx * -b.dy - ry * -b.dx) / det
      p = [a.px + a.dx * tt, a.py + a.dy * tt]
    } else {
      p = [b.px, b.py]
    }
    // Mitre cap: keep sharp corners from shooting far out.
    const dxv = p[0] - pts[i][0]
    const dyv = p[1] - pts[i][1]
    const d = Math.hypot(dxv, dyv)
    if (d > margin * 3) {
      const k = (margin * 3) / d
      p = [pts[i][0] + dxv * k, pts[i][1] + dyv * k]
    }
    out.push(p)
  }
  return out
}

// Operators that clip the page so a single shared, full-page artwork form shows
// only one piece at one slot. The artwork form is drawn untranslated, so an
// artwork-space point (px,py) maps to the page as:
//   page point = anchor + R(rotation)·((px,py) − (t.x,t.y))
// We always clip to the piece's box rectangle (this replicates the per-type
// embed BBox that used to do the trimming) and, when an outline matched, also
// to that outline grown outward by `bleed`. Successive clip paths intersect,
// so the effective region equals the old output. Emit before drawPage, pop
// after.
// Map a piece-local point (px,py) to its placed page position for slot anchor
// (ax,ay) and rotation — shared by the clip and the cut-line geometry below so the
// two can never disagree about where a piece lands.
function slotPointMapper(t, ax, ay, rotation) {
  return (px, py) => {
    const [rx, ry] = rotVec(rotation, px - t.x, py - t.y)
    return [ax + rx, ay + ry]
  }
}

// Emit moveTo/lineTo/closePath for a polygon mapped through `map`. Returns true if
// anything was emitted (a polygon of < 2 points is skipped).
function pushPolyOps(ops, poly, map) {
  if (poly.length < 2) return false
  const [mx, my] = map(poly[0][0], poly[0][1])
  ops.push(moveTo(mx, my))
  for (let i = 1; i < poly.length; i++) {
    const [x, y] = map(poly[i][0], poly[i][1])
    ops.push(lineTo(x, y))
  }
  ops.push(closePath())
  return true
}

function clipOpsFor(t, ax, ay, rotation, outline, bleed) {
  const map = slotPointMapper(t, ax, ay, rotation)
  const ops = [pushGraphicsState()]
  // Piece box rectangle — the hard limit the old embed BBox enforced.
  pushPolyOps(ops, [
    [t.x, t.y],
    [t.x + t.w, t.y],
    [t.x + t.w, t.y + t.h],
    [t.x, t.y + t.h],
  ], map)
  ops.push(clip(), endPath())
  // Outline (grown by bleed) when a confident match was found.
  if (outline) {
    let any = false
    for (const sp of outline.subpaths) {
      const poly = offsetPolygon(flattenSubpath(sp), bleed)
      if (pushPolyOps(ops, poly, map)) any = true
    }
    if (any) ops.push(clip(), endPath())
  }
  return ops
}

const MM_TO_PT = 72 / 25.4 // 1 mm in PDF points

// Operators that STROKE a piece's cut line in pure black at the slot's position
// and rotation — the laser follows this black line to cut, so unlike the old
// behavior (all guides stripped from export) the cut line is preserved in every
// export, die-cut and laser alike (CLAUDE_CODE_LASER_VS_DIECUT.md). We generate
// it from the same outline the clip uses (true outline, no bleed — the bleed is
// printed past the cut), falling back to the piece box when no outline matched.
// CMYK 0,0,0,1 is pure (non-rich) black; emit AFTER the clip is popped so the
// full line width shows, not just the inner half.
function cutLineOpsFor(t, ax, ay, rotation, outline, lineWidthPts) {
  const map = slotPointMapper(t, ax, ay, rotation)
  const ops = [pushGraphicsState(), setStrokingCmykColor(0, 0, 0, 1), setLineWidth(lineWidthPts)]
  let any = false
  if (outline) {
    for (const sp of outline.subpaths) {
      if (pushPolyOps(ops, flattenSubpath(sp), map)) any = true
    }
  }
  if (!any) {
    pushPolyOps(ops, [
      [t.x, t.y],
      [t.x + t.w, t.y],
      [t.x + t.w, t.y + t.h],
      [t.x, t.y + t.h],
    ], map)
  }
  ops.push(stroke(), popGraphicsState())
  return ops
}

export async function fillLayout({
  prenestBytes,
  templateBytes,
  artworkBytes,
  style,
  quantity,
  fabric,
  guides = true,
  clipToOutline = true,
  clipBleed = 18, // points of outward bleed kept when clipping (0.25" default)
  cutLines = true, // draw black cut lines the laser follows (preserved in export)
  cutLineWidthMm = 1.5, // laser cut-line width; editable, confirm exact value at install
}) {
  const errors = []
  const warnings = []
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1) {
    return { errors: ['Quantity must be a whole number of 1 or more.'] }
  }

  if (
    !fabric ||
    typeof fabric.scale !== 'number' ||
    !(fabric.scale >= 50 && fabric.scale <= 200)
  ) {
    errors.push(
      'Select a fabric with a stretch scale between 50% and 200% (the table stores percent, e.g. 104).',
    )
  }

  const templateByType = new Map()
  for (const p of style.templatePieces) templateByType.set(p.piece_type.trim(), p)

  const slotsByType = new Map()
  for (const s of style.slots) {
    const type = s.piece_type.trim()
    if (!slotsByType.has(type)) slotsByType.set(type, [])
    slotsByType.get(type).push(s)
  }

  if (slotsByType.size === 0) errors.push('The style has no pre-nest slots.')

  for (const [type] of slotsByType) {
    if (!templateByType.has(type)) {
      errors.push(
        `Pre-nest slot type "${type}" has no matching template piece. ` +
          `Template piece types are: ${[...templateByType.keys()].join(', ') || '(none)'}. ` +
          `Labels must match exactly.`,
      )
    }
  }

  // One sheet = one printed page. It yields as many complete caps as the
  // scarcest piece type allows; that count drives quantity rounding and the
  // number of sheets. Unequal counts mean some slots can't form a full cap.
  const counts = [...slotsByType.values()].map((s) => s.length)
  const unitsPerSheet = counts.length ? Math.min(...counts) : 12
  const rounded = roundUpToSheet(qty, unitsPerSheet)
  const copies = rounded / unitsPerSheet
  if (counts.length && new Set(counts).size > 1) {
    const detail = [...slotsByType.entries()]
      .map(([t, s]) => `${t}: ${s.length}`)
      .join(', ')
    warnings.push(
      `Piece types have different slot counts (${detail}). Each sheet makes ` +
        `${unitsPerSheet} complete cap(s); extra slots of other types stay empty.`,
    )
  }

  // Mismatched pieces in the other direction: a labeled template piece with
  // zero pre-nest slots means a cap piece would never be printed.
  for (const type of templateByType.keys()) {
    if (!slotsByType.has(type)) {
      errors.push(
        `Template piece "${type}" has no slots in the pre-nest map — every template ` +
          `piece type needs at least one slot. Labels must match exactly.`,
      )
    }
  }

  const artDoc = await PDFDocument.load(artworkBytes)
  const artPage = artDoc.getPage(0)

  // The artwork is built on top of the template artboard; identical page size
  // is the precondition for using template boxes on the artwork. No scaling.
  if (templateBytes) {
    const tplDoc = await PDFDocument.load(templateBytes)
    const tpl = tplDoc.getPage(0).getSize()
    const art = artPage.getSize()
    if (Math.abs(tpl.width - art.width) > 1 || Math.abs(tpl.height - art.height) > 1) {
      errors.push(
        `Artwork page is ${fmtSize(art)} but the template page is ${fmtSize(tpl)}. ` +
          `Artwork must be on the template artboard at identical scale — refusing (no auto-scaling).`,
      )
    }
  }

  if (errors.length) return { errors, rounded }

  // Outline clipping: match each piece's mapped box to its true closed-path
  // outline in the template, so artwork is trimmed to the piece shape instead
  // of a rectangle (removes neighbour bleed, avoids cutting curved pieces off).
  // Falls back to the rectangle for any piece without a confident outline match.
  const matchedOutlines = new Map()
  if (clipToOutline && templateBytes) {
    try {
      const outlines = await extractOutlines(templateBytes)
      for (const [type] of slotsByType) {
        const piece = templateByType.get(type)
        if (!piece) continue
        let best = null
        let bestIoU = 0
        for (const o of outlines) {
          const v = iou(piece.box, o.bbox)
          if (v > bestIoU) {
            bestIoU = v
            best = o
          }
        }
        if (best && bestIoU >= OUTLINE_MATCH_IOU) matchedOutlines.set(type, best)
      }
    } catch (err) {
      warnings.push(`Could not read piece outlines for clipping (${err.message}); used rectangles.`)
    }
  }
  // A piece is rectangle-clipped whenever no outline matched it — whether the
  // IoU was too low or extraction failed entirely.
  const clipFallback = clipToOutline
    ? [...slotsByType.keys()].filter((t) => !matchedOutlines.has(t))
    : []

  // Fallback guard (M8): a piece clipped to its raw box (no outline matched)
  // pulls in a neighbour's artwork wherever that box overlaps another piece's
  // box — the "swallow" we'd otherwise ship silently. Refuse-and-flag instead.
  // Dormant on clean styles where every piece matches its true outline.
  if (clipFallback.length) {
    const boxesOverlap = (a, b) => {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      return ox > 0 && oy > 0
    }
    for (const type of clipFallback) {
      const piece = templateByType.get(type)
      if (!piece) continue
      const clashes = []
      for (const [otherType, other] of templateByType) {
        if (otherType === type) continue
        if (boxesOverlap(piece.box, other.box)) clashes.push(otherType)
      }
      if (clashes.length) {
        errors.push(
          `Can't fill "${type}" safely: the tool couldn't read this piece's cut outline from ` +
            `the template, so it could only clip to a rectangle — and for this nested piece that ` +
            `rectangle overlaps ${clashes.join(', ')}, which would copy their artwork into "${type}". ` +
            `This is NOT about the boxes overlapping (nested brim pieces always overlap as boxes — ` +
            `that's normal). It means "${type}" has no readable closed outline in the template. ` +
            `Have whoever maintains the styles check that "${type}" is a closed shape in the ` +
            `template artwork. Refusing so no overlapping fill is printed.`,
        )
      }
    }
  }

  if (errors.length) return { errors, rounded, warnings }

  // guides=true (preview): draw on top of the pre-nest page so alignment can
  // be checked against the slot outlines. guides=false (export): a blank page
  // of identical size — guide content is stripped by never copying it.
  // Assumes the pre-nest MediaBox starts at (0,0), as slot coordinates do.
  const prenestDoc = await PDFDocument.load(prenestBytes)
  let out, page
  if (guides) {
    out = prenestDoc
    page = out.getPage(0)
  } else {
    const prenestSize = prenestDoc.getPage(0).getSize()
    out = await PDFDocument.create()
    page = out.addPage([prenestSize.width, prenestSize.height])
  }
  const summary = []

  // Embed the artwork page ONCE and share this single form across every slot.
  // Previously it was embedded once per piece type, and pdf-lib copies all of a
  // page's image XObjects into each embed — so the artwork's images were stored
  // ~(number of types)× over, bloating the file and stalling the Ghostscript
  // flatten. Here the full page is embedded once; each slot is positioned by
  // transform and trimmed by clip paths instead of by a per-type embed BBox.
  const embArt = await out.embedPage(artPage)

  for (const [type, slots] of slotsByType) {
    const t = templateByType.get(type).box
    // Fill every slot of this type on the sheet; the whole sheet is then
    // replicated per copy. No partial fill, no discards.
    const outline = matchedOutlines.get(type)
    const chosen = [...slots].sort((a, b) => a.instance - b.instance)
    for (const slot of chosen) {
      const cx = slot.box.x + slot.box.w / 2
      const cy = slot.box.y + slot.box.h / 2
      const { x, y } = anchorFor(cx, cy, t.w, t.h, slot.rotation)
      // The shared form is untranslated, so to land the piece box on (x,y) the
      // draw point is P = anchor − R(rotation)·(t.x, t.y).
      const [rx, ry] = rotVec(slot.rotation, t.x, t.y)
      page.pushOperators(...clipOpsFor(t, x, y, slot.rotation, outline, clipBleed))
      page.drawPage(embArt, { x: x - rx, y: y - ry, rotate: degrees(slot.rotation) })
      page.pushOperators(popGraphicsState())
      // Cut line on top (after the clip is popped) so the laser has its black
      // path. Same geometry as the clip outline, but unbled and stroked black.
      if (cutLines) {
        page.pushOperators(...cutLineOpsFor(t, x, y, slot.rotation, outline, cutLineWidthMm * MM_TO_PT))
      }
    }
    summary.push(`${type}: ${chosen.length} per sheet`)
  }

  // Fabric stretch: the ONLY scaling in the pipeline. The whole filled sheet
  // (content and page size) is scaled uniformly, then the metadata stamp is
  // drawn unscaled in the top-left corner of each sheet.
  // Save the filled doc to bytes before re-embedding: pdf-lib only writes
  // embedded-page XObjects at save(), so embedding the live page object would
  // copy dangling references and silently drop the placed artwork.
  // The order's full quantity is `copies` identical sheets, one per page;
  // the single embedded XObject is shared across all pages.
  const factor = fabric.scale / 100
  const filledBytes = await out.save()
  const final = await PDFDocument.create()
  const [emb] = await final.embedPdf(filledBytes)
  const newW = emb.width * factor
  const newH = emb.height * factor
  const font = await final.embedFont(StandardFonts.Helvetica)
  const stampSize = 30 // pt — small but readable on a large-format sheet
  const stamp = `${style.style} | ${fabric.name} | ${rounded}`

  for (let i = 1; i <= copies; i++) {
    const outPage = final.addPage([newW, newH])
    outPage.drawPage(emb, { x: 0, y: 0, xScale: factor, yScale: factor })
    outPage.drawText(copies > 1 ? `${stamp}  (sheet ${i}/${copies})` : stamp, {
      x: 24,
      y: newH - 24 - stampSize,
      size: stampSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  return {
    pdfBytes: await final.save(),
    rounded,
    copies,
    unitsPerSheet,
    summary,
    warnings,
    stamp,
    scalePercent: fabric.scale,
    artboard: fmtSize(artPage.getSize()),
    clip: {
      enabled: clipToOutline,
      applied: matchedOutlines.size,
      total: slotsByType.size,
      fallback: clipFallback,
      bleed: clipBleed,
    },
  }
}
