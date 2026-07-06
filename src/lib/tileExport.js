import { buildDxf } from './dxf.js'
import { flattenSubpath } from './engine.js'

// DXF Tile Export, stage 3: assemble ONE laser-ready DXF from the inspected
// tile (tileInspect.js) and the computed grid (tileMath.js).
//
// Pure duplication by TRANSLATION only: every tile's geometry is the same
// flattened contours shifted by the placement's x/y — no rotation, no scaling,
// no per-tile changes. ALL extracted geometry (the black cut lines included)
// is kept and written to the CUT layer via the existing writer (buildDxf);
// nothing is stripped or recolored. Curves are flattened with the engine's own
// flattenSubpath so this DXF and the print flow's laser DXF can never disagree
// on curve shape.
//
// Deterministic: contour order is extraction order × row-major placement
// order, coordinates go through buildDxf's fixed 4-decimal formatting — the
// same inputs always produce byte-identical output.

const MM_TO_PT = 72 / 25.4 // 1 mm in PDF points (same constant engine.js uses)

// The tile's geometry as mm contours relative to the tile's own bottom-left
// corner: flatten each subpath (page points), subtract the page-box origin,
// convert to mm.
export function tileContoursMm({ outlines, origin }) {
  const contours = []
  for (const o of outlines) {
    for (const sp of o.subpaths) {
      const poly = flattenSubpath(sp)
      if (poly.length < 2) continue
      contours.push(poly.map(([x, y]) => [(x - origin.x) / MM_TO_PT, (y - origin.y) / MM_TO_PT]))
    }
  }
  return contours
}

// One DXF (string) with the tile's contours repeated at every placement.
//   tile:       inspectTile() result ({ outlines, origin })
//   placements: computeTiling() placements ([{ xMm, yMm }], row-major)
export function buildTiledDxf(tile, placements, { widthMm = 1.5 } = {}) {
  const base = tileContoursMm(tile)
  const contours = []
  for (const { xMm, yMm } of placements) {
    for (const poly of base) {
      contours.push(poly.map(([x, y]) => [x + xMm, y + yMm]))
    }
  }
  return buildDxf(contours, { widthMm })
}
