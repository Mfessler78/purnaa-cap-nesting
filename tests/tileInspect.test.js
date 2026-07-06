import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, rgb } from 'pdf-lib'
import { inspectTile } from '../src/lib/tileInspect.js'

// Fixtures are built in-memory with pdf-lib (like an exported packed tile):
// a page of a known mm size with a stroked rectangle standing in for the
// packed pieces' cut lines.

const MM_TO_PT = 72 / 25.4

// A widthMm×heightMm page with one stroked rectangle at the given mm bounds.
async function tilePdf(widthMm, heightMm, rect) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([widthMm * MM_TO_PT, heightMm * MM_TO_PT])
  if (rect) {
    page.drawRectangle({
      x: rect.x * MM_TO_PT,
      y: rect.y * MM_TO_PT,
      width: rect.w * MM_TO_PT,
      height: rect.h * MM_TO_PT,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5 * MM_TO_PT,
    })
  }
  return doc.save()
}

test('inspectTile reads the tile size in mm and passes a safely inset tile', async () => {
  const bytes = await tilePdf(100, 80, { x: 10, y: 10, w: 80, h: 60 })
  const res = await inspectTile(bytes)
  assert.ok(Math.abs(res.widthMm - 100) < 0.05, `widthMm ${res.widthMm}`)
  assert.ok(Math.abs(res.heightMm - 80) < 0.05, `heightMm ${res.heightMm}`)
  assert.equal(res.outlines.length, 1)
  assert.deepEqual(res.warnings, [])
})

test('inspectTile warns when geometry sits within 5 mm of an edge (Check A)', async () => {
  // 2 mm from the left edge only; all other sides are >= 5 mm clear.
  const bytes = await tilePdf(100, 80, { x: 2, y: 10, w: 80, h: 60 })
  const res = await inspectTile(bytes)
  assert.equal(res.warnings.length, 1)
  assert.match(res.warnings[0], /left \(2\.0 mm\)/)
  assert.doesNotMatch(res.warnings[0], /right|top|bottom/)
  assert.match(res.warnings[0], /still proceed/i)
})

// A widthMm×heightMm page with several stroked rectangles (mm bounds).
async function tilePdfMulti(widthMm, heightMm, rects) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([widthMm * MM_TO_PT, heightMm * MM_TO_PT])
  for (const rect of rects) {
    page.drawRectangle({
      x: rect.x * MM_TO_PT,
      y: rect.y * MM_TO_PT,
      width: rect.w * MM_TO_PT,
      height: rect.h * MM_TO_PT,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5 * MM_TO_PT,
    })
  }
  return doc.save()
}

test('inspectTile warns on every offending side, with distances', async () => {
  // Two pieces: one 1 mm off the left/bottom edges, one 1 mm off right/top —
  // all four sides listed. (A single near-full-page rect would be dropped by
  // the extractor's artboard-frame filter, which is not a realistic tile.)
  const bytes = await tilePdfMulti(100, 80, [
    { x: 1, y: 1, w: 40, h: 30 },
    { x: 55, y: 45, w: 44, h: 34 },
  ])
  const res = await inspectTile(bytes)
  assert.equal(res.warnings.length, 1)
  for (const side of ['left', 'right', 'bottom', 'top']) {
    assert.match(res.warnings[0], new RegExp(`${side} \\(1\\.0 mm\\)`))
  }
})

test('inspectTile says "past the edge" when geometry hangs outside the page', async () => {
  // Real files do this (e.g. a piece nudged off the artboard): clearance is
  // negative and must not be shown as a bare negative number.
  const bytes = await tilePdf(100, 80, { x: -2, y: 10, w: 50, h: 60 })
  const res = await inspectTile(bytes)
  assert.equal(res.warnings.length, 1)
  assert.match(res.warnings[0], /left \(2\.0 mm past the edge\)/)
})

test('inspectTile warns (does not throw) on a tile with no vector geometry', async () => {
  const bytes = await tilePdf(100, 80, null)
  const res = await inspectTile(bytes)
  assert.equal(res.outlines.length, 0)
  assert.equal(res.warnings.length, 1)
  assert.match(res.warnings[0], /No vector path geometry/)
})
