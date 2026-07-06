import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, rgb } from 'pdf-lib'
import { inspectTile } from '../src/lib/tileInspect.js'
import { computeTiling } from '../src/lib/tileMath.js'
import { buildTiledDxf, tileContoursMm } from '../src/lib/tileExport.js'

const MM_TO_PT = 72 / 25.4

// A 100×80 mm tile with one stroked rectangle at (10,10)–(90,70) mm, standing
// in for a packed tile's cut lines.
async function tileBytes() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([100 * MM_TO_PT, 80 * MM_TO_PT])
  page.drawRectangle({
    x: 10 * MM_TO_PT,
    y: 10 * MM_TO_PT,
    width: 80 * MM_TO_PT,
    height: 60 * MM_TO_PT,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5 * MM_TO_PT,
  })
  return doc.save()
}

// Pull each POLYLINE's vertices ([ [x,y], … ]) back out of the DXF text.
function polylinesOf(dxf) {
  const polys = []
  let cur = null
  const lines = dxf.split('\n')
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i].trim()
    const val = lines[i + 1]
    if (code === '0' && val === 'POLYLINE') cur = { pts: [] }
    if (code === '0' && val === 'SEQEND' && cur) {
      polys.push(cur.pts)
      cur = null
    }
    if (cur && code === '10') cur.x = parseFloat(val)
    if (cur && code === '20') cur.pts.push([cur.x, parseFloat(val)])
  }
  return polys
}

test('buildTiledDxf repeats the tile geometry at every placement, translation only', async () => {
  const tile = await inspectTile(await tileBytes())
  const grid = computeTiling({ fabricWidthMm: 240, quantity: 12, tileWidthMm: tile.widthMm, tileHeightMm: tile.heightMm })
  assert.deepEqual(grid.errors, [])
  assert.equal(grid.colsPerRow, 2) // usable 200 / 100

  const dxf = buildTiledDxf(tile, grid.placements)
  const polys = polylinesOf(dxf)
  assert.equal(polys.length, 12) // 1 contour × 12 placements

  // First tile: rect min corner (10,10) mm inside the tile + placement (20,0).
  const min = (poly) => poly.reduce(([a, b], [x, y]) => [Math.min(a, x), Math.min(b, y)], [Infinity, Infinity])
  assert.deepEqual(min(polys[0]), [30, 10])
  // Second column: shifted by exactly one tile width, same shape.
  assert.deepEqual(min(polys[1]), [130, 10])
  // Second row: shifted by exactly one tile height.
  assert.deepEqual(min(polys[2]), [30, 90])
  // Translation only: every poly has identical point count and identical
  // point-to-point shape relative to its own minimum.
  const shape = (poly) => {
    const [mx, my] = min(poly)
    return poly.map(([x, y]) => [x - mx, y - my])
  }
  for (const p of polys.slice(1)) assert.deepEqual(shape(p), shape(polys[0]))
})

test('buildTiledDxf is byte-deterministic for the same inputs', async () => {
  const bytes = await tileBytes()
  const tileA = await inspectTile(bytes)
  const tileB = await inspectTile(bytes)
  const grid = { placements: computeTiling({ fabricWidthMm: 240, quantity: 12, tileWidthMm: 100, tileHeightMm: 80 }).placements }
  const a = buildTiledDxf(tileA, grid.placements)
  const b = buildTiledDxf(tileB, grid.placements)
  assert.equal(a, b)
  assert.ok(Buffer.from(a).equals(Buffer.from(b)))
})

test('tileContoursMm reports geometry relative to the tile bottom-left in mm', async () => {
  const tile = await inspectTile(await tileBytes())
  const contours = tileContoursMm(tile)
  assert.equal(contours.length, 1)
  const xs = contours[0].map(([x]) => x)
  const ys = contours[0].map(([, y]) => y)
  assert.ok(Math.abs(Math.min(...xs) - 10) < 0.01)
  assert.ok(Math.abs(Math.max(...xs) - 90) < 0.01)
  assert.ok(Math.abs(Math.min(...ys) - 10) < 0.01)
  assert.ok(Math.abs(Math.max(...ys) - 70) < 0.01)
})

test('buildTiledDxf output is a valid R12 skeleton on the CUT layer', async () => {
  const tile = await inspectTile(await tileBytes())
  const dxf = buildTiledDxf(tile, [{ xMm: 20, yMm: 0 }])
  for (const section of ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']) {
    assert.ok(dxf.includes(`2\n${section}`), `missing ${section}`)
  }
  assert.match(dxf, /AC1009/)
  assert.ok(dxf.trimEnd().endsWith('EOF'))
  assert.ok(dxf.includes('8\nCUT'))
})
