import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStyle, styleCounts } from '../server/styles-api.js'
import { buildDxf } from '../src/lib/dxf.js'

// ---- Schema migration (U2/U3) --------------------------------------------

test('normalizeStyle upgrades a legacy single-template / single-prenest style', () => {
  const legacy = {
    style: 'PUR1',
    templatePieces: [{ piece_type: 'front', box: { x: 0, y: 0, w: 5, h: 5 } }],
    slots: [{ piece_type: 'front', instance: 1, rotation: 0, box: { x: 0, y: 0, w: 5, h: 5 } }],
  }
  const n = normalizeStyle(legacy)
  // One template variant, carrying the legacy file name.
  assert.equal(n.templates.length, 1)
  assert.equal(n.templates[0].id, 'v1')
  assert.equal(n.templates[0].template_pdf, 'template.pdf')
  assert.deepEqual(n.templates[0].pieces, legacy.templatePieces)
  // Legacy pre-nest migrates to LASER (owner decision), not die.
  assert.deepEqual(Object.keys(n.prenests), ['laser'])
  assert.equal(n.prenests.laser.prenest_pdf, 'prenest.pdf')
  assert.equal(n.prenests.laser.slots.length, 1)
})

test('normalizeStyle passes a new-shape style through unchanged', () => {
  const modern = {
    style: 'PUR2',
    templates: [
      { id: 'v1', template_pdf: 'template_v1.pdf', page_size: { width: 600, height: 400 }, pieces: [] },
      { id: 'v2', template_pdf: 'template_v2.pdf', page_size: { width: 720, height: 480 }, pieces: [] },
    ],
    prenests: {
      laser: { prenest_pdf: 'prenest_laser.pdf', slots: [{}, {}] },
      die: { prenest_pdf: 'prenest_die.pdf', slots: [{}, {}, {}] },
    },
  }
  const n = normalizeStyle(modern)
  assert.equal(n.templates.length, 2)
  assert.deepEqual(Object.keys(n.prenests).sort(), ['die', 'laser'])
})

test('styleCounts reports max slots across modes, first-template pieces, and mode list', () => {
  const n = normalizeStyle({
    style: 'PUR3',
    templates: [{ id: 'v1', pieces: [{}, {}, {}, {}] }],
    prenests: { laser: { slots: [{}, {}] }, die: { slots: [{}, {}, {}, {}, {}] } },
  })
  const c = styleCounts(n)
  assert.equal(c.slotCount, 5) // max(2, 5)
  assert.equal(c.templatePieceCount, 4)
  assert.equal(c.templateCount, 1)
  assert.deepEqual(c.modes.sort(), ['die', 'laser'])
})

// ---- DXF writer (U4) ------------------------------------------------------

test('buildDxf emits closed mm LWPOLYLINEs with the 1.5mm lineweight', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]]
  const dxf = buildDxf([square], { lineweight: 150 })
  assert.match(dxf, /^0\nSECTION\n2\nHEADER/) // starts with a header
  assert.match(dxf, /\$INSUNITS\n70\n4/) // millimetres
  assert.equal((dxf.match(/LWPOLYLINE/g) || []).length, 1)
  assert.match(dxf, /370\n150/) // 1.5 mm line width (1/100 mm)
  assert.match(dxf, /90\n4\n70\n1/) // 4 vertices, closed
  assert.match(dxf, /\nEOF\n$/)
})

test('buildDxf skips degenerate contours and writes one entity per real contour', () => {
  const dxf = buildDxf([[[0, 0]], [[0, 0], [1, 0], [1, 1]]])
  assert.equal((dxf.match(/LWPOLYLINE/g) || []).length, 1)
})
