import { PDFDocument } from 'pdf-lib'
import { extractOutlines } from './pdfPaths.js'

// DXF Tile Export, stage 1: inspect the uploaded pre-packed PDF tile before
// tiling.
//
// The TILE is the PDF page itself (MediaBox): when tiles are repeated across
// the fabric they abut page-box to page-box, so the page edges are the tile
// edges. Whoever packs the tile keeps all cut geometry at least EDGE_INSET_MM
// inside the page on every side; two abutting insets give the intended 10 mm
// gap between pieces of neighbouring tiles. This module measures that clearance and WARNS (never
// blocks, never edits) when geometry sits closer to an edge — the human
// decides. Read-only: the tile's vectors, including its black cut lines, are
// untouched (invariant §7).
//
// Geometry is read with the shared extractor (extractOutlines), which keeps
// every painted path and clip path regardless of colour — nothing is stripped
// or recolored here. Known limit inherited from the extractor: a path spanning
// ≥95% of the page in BOTH axes is treated as an artboard frame and ignored.

const MM_TO_PT = 72 / 25.4 // 1 mm in PDF points (same constant engine.js uses)
const EDGE_INSET_MM = 5

const toMm = (pts) => pts / MM_TO_PT
const fmtMm = (mm) => `${(Math.round(mm * 10) / 10).toFixed(1)} mm`

// Inspect a tile PDF. Returns:
//   {
//     widthMm, heightMm,   // tile (page) size in mm
//     origin,              // { x, y } page-box origin in PDF points — outline
//                          //   coords are page-space, so tiling subtracts this
//     outlines,            // extractOutlines result, page points (for tiling)
//     warnings: [String],  // run-screen-style warn-only lines (Check A)
//   }
export async function inspectTile(tileBytes) {
  const doc = await PDFDocument.load(tileBytes)
  const mb = doc.getPage(0).getMediaBox()
  const widthMm = toMm(mb.width)
  const heightMm = toMm(mb.height)
  const origin = { x: mb.x, y: mb.y }

  const outlines = await extractOutlines(tileBytes)
  const warnings = []

  if (outlines.length === 0) {
    warnings.push(
      'No vector path geometry was found in this tile PDF — there would be nothing ' +
        'for the laser to cut. Check the file with whoever packed it. You can still proceed.',
    )
    return { widthMm, heightMm, origin, outlines, warnings }
  }

  // Clearance from the geometry's overall extent to each page edge. Curve
  // bboxes include their control points, so a curve can measure slightly
  // closer to an edge than it truly is — conservative in the safe direction
  // for a warn-only check.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of outlines) {
    if (o.bbox.x < minX) minX = o.bbox.x
    if (o.bbox.y < minY) minY = o.bbox.y
    if (o.bbox.x + o.bbox.w > maxX) maxX = o.bbox.x + o.bbox.w
    if (o.bbox.y + o.bbox.h > maxY) maxY = o.bbox.y + o.bbox.h
  }
  // MediaBox origin may be non-zero; edges live at mb.x .. mb.x + mb.width.
  const clearances = [
    ['left', toMm(minX - mb.x)],
    ['right', toMm(mb.x + mb.width - maxX)],
    ['bottom', toMm(minY - mb.y)],
    ['top', toMm(mb.y + mb.height - maxY)],
  ]
  const close = clearances.filter(([, mm]) => mm < EDGE_INSET_MM)
  if (close.length) {
    // Negative clearance = geometry hangs past the page edge; say so plainly.
    const sides = close
      .map(([side, mm]) => `${side} (${mm < 0 ? `${fmtMm(-mm)} past the edge` : fmtMm(mm)})`)
      .join(', ')
    warnings.push(
      `Cut geometry sits closer than ${EDGE_INSET_MM} mm to the tile edge: ${sides}. ` +
        'Tiles are laid edge-to-edge, so pieces on neighbouring tiles will end up closer ' +
        'than the intended 10 mm apart there. You can still proceed.',
    )
  }

  return { widthMm, heightMm, origin, outlines, warnings }
}
