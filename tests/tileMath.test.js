import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTiling } from '../src/lib/tileMath.js'

test('computeTiling lays a row-major grid inside the side margins', () => {
  const res = computeTiling({ fabricWidthMm: 1600, quantity: 24, tileWidthMm: 300, tileHeightMm: 200 })
  assert.deepEqual(res.errors, [])
  assert.deepEqual(res.warnings, [])
  assert.equal(res.usableWidthMm, 1560) // 1600 - 20 each side
  assert.equal(res.colsPerRow, 5) // floor(1560 / 300)
  assert.equal(res.roundedQty, 24)
  assert.equal(res.rows, 5) // ceil(24 / 5), last row partial
  assert.equal(res.lengthMm, 1000)
  assert.equal(res.placements.length, 24)
  // First tile: x = 20 + 0*300, y = 0 (no length-axis border).
  assert.deepEqual(res.placements[0], { xMm: 20, yMm: 0, col: 0, row: 0 })
  // Row-major wrap: 6th tile starts row 1.
  assert.deepEqual(res.placements[5], { xMm: 20, yMm: 200, col: 0, row: 1 })
  // Last tile is the 4th of the partial 5th row.
  assert.deepEqual(res.placements[23], { xMm: 20 + 3 * 300, yMm: 800, col: 3, row: 4 })
})

test('computeTiling Check B blocks when the tile is wider than the usable fabric', () => {
  const res = computeTiling({ fabricWidthMm: 320, quantity: 12, tileWidthMm: 300, tileHeightMm: 200 })
  assert.equal(res.errors.length, 1)
  assert.match(res.errors[0], /300\.0 mm wide/) // tile width named
  assert.match(res.errors[0], /280\.0 mm usable/) // usable width named
  assert.equal(res.placements.length, 0)
})

test('computeTiling fits exactly one column when usable width equals tile width', () => {
  // fabric 340 → usable 300 = tile width: boundary must pass, not block.
  const res = computeTiling({ fabricWidthMm: 340, quantity: 12, tileWidthMm: 300, tileHeightMm: 200 })
  assert.deepEqual(res.errors, [])
  assert.equal(res.colsPerRow, 1)
  assert.equal(res.rows, 12)
})

test('computeTiling rounds quantity down to whole dozens and warns on the remainder', () => {
  const res = computeTiling({ fabricWidthMm: 1600, quantity: 27, tileWidthMm: 300, tileHeightMm: 200 })
  assert.deepEqual(res.errors, [])
  assert.equal(res.roundedQty, 24)
  assert.equal(res.remainder, 3)
  assert.equal(res.placements.length, 24)
  assert.equal(res.warnings.length, 1)
  assert.match(res.warnings[0], /24 of 27/)
  assert.match(res.warnings[0], /remaining 3/)
})

test('computeTiling blocks an order under one dozen', () => {
  const res = computeTiling({ fabricWidthMm: 1600, quantity: 7, tileWidthMm: 300, tileHeightMm: 200 })
  assert.equal(res.errors.length, 1)
  assert.match(res.errors[0], /under one dozen/)
  assert.equal(res.placements.length, 0)
})

test('computeTiling rejects bad inputs plainly', () => {
  assert.match(
    computeTiling({ fabricWidthMm: 1600, quantity: 2.5, tileWidthMm: 300, tileHeightMm: 200 }).errors[0],
    /whole number/,
  )
  assert.match(
    computeTiling({ fabricWidthMm: 0, quantity: 12, tileWidthMm: 300, tileHeightMm: 200 }).errors[0],
    /Fabric width/,
  )
  assert.match(
    computeTiling({ fabricWidthMm: 1600, quantity: 12, tileWidthMm: 0, tileHeightMm: 200 }).errors[0],
    /no usable size/,
  )
})

test('computeTiling is deterministic', () => {
  const input = { fabricWidthMm: 1524, quantity: 36, tileWidthMm: 287.3, tileHeightMm: 201.4 }
  assert.deepEqual(computeTiling(input), computeTiling(input))
})
