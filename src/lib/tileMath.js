import { roundDownToSheet } from './engine.js'

// DXF Tile Export, stage 2: fabric width + deterministic grid math.
//
// The tile (from tileInspect.js: the PDF page box) is repeated across the
// fabric width and down the roll. 20 mm is excluded on each SIDE of the
// fabric; the length axis has NO border — tiles run freely down the roll.
// Tiles abut bounding-box to bounding-box with no gap logic here: the 5 mm
// edge inset inside each tile (Check A) is what provides the 10 mm gap
// between pieces of neighbouring tiles.
//
// Quantity counts TILES and reuses the engine's whole-dozen rounding
// (roundDownToSheet, round DOWN, warn on the remainder) so both flows treat
// order quantities the same way. No auto-nesting, no collision detection —
// deterministic grid of the bounding box only.

const SIDE_MARGIN_MM = 20
const TILES_PER_DOZEN = 12

const fmt = (mm) => `${(Math.round(mm * 10) / 10).toFixed(1)} mm`

// Pure + deterministic. Returns:
//   {
//     errors: [String],    // hard blocks (Check B, bad inputs) — no placements
//     warnings: [String],  // e.g. dozen-rounding remainder
//     usableWidthMm, colsPerRow, roundedQty, remainder, rows,
//     lengthMm,            // roll length used = rows * tileHeightMm
//     placements: [{ xMm, yMm, col, row }],  // roundedQty entries, row-major;
//   }                      //   x/y = the tile page box's bottom-left corner
export function computeTiling({ fabricWidthMm, quantity, tileWidthMm, tileHeightMm }) {
  const errors = []
  const warnings = []

  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1) {
    errors.push('Quantity must be a whole number of 1 or more.')
  }
  const fabricW = Number(fabricWidthMm)
  if (!Number.isFinite(fabricW) || fabricW <= 0) {
    errors.push('Fabric width must be a number of millimetres greater than 0.')
  }
  const tileW = Number(tileWidthMm)
  const tileH = Number(tileHeightMm)
  if (!Number.isFinite(tileW) || tileW <= 0 || !Number.isFinite(tileH) || tileH <= 0) {
    errors.push('The tile has no usable size — upload the tile PDF again.')
  }
  if (errors.length) return { errors, warnings, placements: [] }

  const usableWidthMm = fabricW - 2 * SIDE_MARGIN_MM
  const colsPerRow = Math.floor(usableWidthMm / tileW)

  // CHECK B — hard error: nothing downstream can fix a tile wider than the
  // usable fabric.
  if (colsPerRow < 1) {
    errors.push(
      `The tile is wider than the usable fabric: the tile is ${fmt(tileW)} wide, but ` +
        `${fmt(fabricW)} fabric leaves only ${fmt(usableWidthMm)} usable after the ` +
        `${SIDE_MARGIN_MM} mm margin on each side. Use wider fabric or have Mila repack ` +
        'a narrower tile.',
    )
    return { errors, warnings, usableWidthMm, colsPerRow, placements: [] }
  }

  const roundedQty = roundDownToSheet(qty, TILES_PER_DOZEN)
  const remainder = qty - roundedQty
  if (roundedQty === 0) {
    errors.push(
      `Order is under one dozen (${TILES_PER_DOZEN}): a quantity of ${qty} rounds down ` +
        'to 0 tiles — nothing to lay out.',
    )
    return { errors, warnings, usableWidthMm, colsPerRow, placements: [] }
  }
  if (remainder > 0) {
    warnings.push(
      `Quantity rounds down to whole dozens: this layout covers ${roundedQty} of ${qty}. ` +
        `The remaining ${remainder} must be produced separately.`,
    )
  }

  const rows = Math.ceil(roundedQty / colsPerRow)
  const placements = []
  for (let i = 0; i < roundedQty; i++) {
    const row = Math.floor(i / colsPerRow)
    const col = i % colsPerRow
    placements.push({
      xMm: SIDE_MARGIN_MM + col * tileW,
      yMm: row * tileH,
      col,
      row,
    })
  }

  return {
    errors,
    warnings,
    usableWidthMm,
    colsPerRow,
    roundedQty,
    remainder,
    rows,
    lengthMm: rows * tileH,
    placements,
  }
}
