import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import zlib from 'node:zlib'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  fillLayout,
  roundDownToSheet,
  anchorFor,
  rotVec,
  iou,
  offsetPolygon,
  dropOppositeWoundHoles,
} from '../src/lib/engine.js'

// Build a subpath (the engine's {op,pts} segment shape) for a rectangle, walked
// either CCW (positive area) or CW (negative area).
const rectSubpath = (x, y, w, h, ccw = true) => {
  const corners = ccw
    ? [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    : [[x, y], [x, y + h], [x + w, y + h], [x + w, y]]
  return corners.map(([px, py], i) => ({ op: i === 0 ? 'm' : 'l', pts: [px, py] }))
}

// ---- pure helpers: the subtle, breakage-prone math ----

test('roundDownToSheet rounds down to a whole sheet', () => {
  assert.equal(roundDownToSheet(12, 12), 12)
  assert.equal(roundDownToSheet(13, 12), 12)
  assert.equal(roundDownToSheet(50, 12), 48)
  assert.equal(roundDownToSheet(11, 12), 0)
  assert.equal(roundDownToSheet(24, 12), 24)
  assert.equal(roundDownToSheet(25, 12), 24)
})

test('anchorFor centres a w×h source on (cx,cy) for each rotation', () => {
  const cx = 100
  const cy = 200
  const w = 40
  const h = 60
  assert.deepEqual(anchorFor(cx, cy, w, h, 0), { x: cx - w / 2, y: cy - h / 2 })
  assert.deepEqual(anchorFor(cx, cy, w, h, 90), { x: cx + h / 2, y: cy - w / 2 })
  assert.deepEqual(anchorFor(cx, cy, w, h, 180), { x: cx + w / 2, y: cy + h / 2 })
  assert.deepEqual(anchorFor(cx, cy, w, h, 270), { x: cx - h / 2, y: cy + w / 2 })
})

test('anchorFor rejects non-quadrant rotations', () => {
  assert.throws(() => anchorFor(0, 0, 10, 10, 45))
})

test('rotVec rotates a vector CCW matching drawPage', () => {
  assert.deepEqual(rotVec(0, 3, 5), [3, 5])
  assert.deepEqual(rotVec(90, 3, 5), [-5, 3])
  assert.deepEqual(rotVec(180, 3, 5), [-3, -5])
  assert.deepEqual(rotVec(270, 3, 5), [5, -3])
})

test('iou is 1 for identical boxes, 0 for disjoint, 1/3 for half-overlap', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 }
  assert.equal(iou(a, a), 1)
  assert.equal(iou(a, { x: 100, y: 100, w: 10, h: 10 }), 0)
  // Two 10×10 boxes sharing a 5×10 strip: inter=50, union=150 -> 1/3.
  const v = iou(a, { x: 5, y: 0, w: 10, h: 10 })
  assert.ok(Math.abs(v - 1 / 3) < 1e-9)
})

test('offsetPolygon grows a square outward by the margin on every side', () => {
  // CCW square, side 10.
  const sq = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]
  const grown = offsetPolygon(sq, 2)
  const xs = grown.map((p) => p[0])
  const ys = grown.map((p) => p[1])
  assert.ok(Math.min(...xs) < -1.9 && Math.min(...xs) > -2.1)
  assert.ok(Math.max(...xs) > 11.9 && Math.max(...xs) < 12.1)
  assert.ok(Math.min(...ys) < -1.9 && Math.min(...ys) > -2.1)
  assert.ok(Math.max(...ys) > 11.9 && Math.max(...ys) < 12.1)
})

test('offsetPolygon is a no-op for margin <= 0', () => {
  const sq = [
    [0, 0],
    [10, 0],
    [10, 10],
  ]
  assert.equal(offsetPolygon(sq, 0), sq)
})

test('dropOppositeWoundHoles collapses a cut-line band to its outer shape', () => {
  // Production templates draw a piece outline as an outer edge plus a slightly
  // larger inner edge wound the OTHER way (a band). Emitted as one nonzero clip
  // those cancel in the interior → empty clip → blank piece. Keep only the outer.
  const outer = rectSubpath(0, 0, 100, 100, false) // CW (negative area), larger
  const inner = rectSubpath(5, 5, 90, 90, true) // CCW (positive area), nested inside
  const kept = dropOppositeWoundHoles([outer, inner])
  assert.equal(kept.length, 1)
  assert.equal(kept[0], outer)
})

test('dropOppositeWoundHoles leaves clean outlines untouched', () => {
  // A single contour: nothing to drop.
  const one = [rectSubpath(0, 0, 100, 100, true)]
  assert.deepEqual(dropOppositeWoundHoles(one), one)
  // Two DISJOINT contours (e.g. separate lobes): both are real, keep both even
  // when their windings differ — only a nested opposite-wound hole is dropped.
  const a = rectSubpath(0, 0, 40, 40, true)
  const b = rectSubpath(100, 0, 40, 40, false)
  assert.equal(dropOppositeWoundHoles([a, b]).length, 2)
})

// ---- integration: fillLayout against a real skate style + Ambler art ----
// Uses a STABLE fixture under tests/fixtures/ (a copy of the mapped skate style),
// not the live styles/ folder — so renaming or deleting a style in the app can
// never break this suite. Skip (don't fail) if the local fixtures are absent.

const DIR = 'tests/fixtures/skate-style'
const ART = 'test-files/Ambler_104_OSFM_Skate_5_Panel_Ucluelet_Aquarium_BLACK.pdf'
// The style fixture is tracked in git; the artwork lives in gitignored
// test-files/, so gate on the two separately — tests that can run on a
// synthetic artwork page shouldn't skip just because the real art is absent.
const haveStyle =
  existsSync(`${DIR}/style.json`) &&
  existsSync(`${DIR}/prenest.pdf`) &&
  existsSync(`${DIR}/template.pdf`)
const haveFixtures = haveStyle && existsSync(ART)
const skip = haveFixtures ? false : 'fixtures missing (skate-style fixture + Ambler art)'
const skipStyle = haveStyle ? false : 'style fixture missing (tests/fixtures/skate-style)'

const STYLE = haveStyle ? JSON.parse(readFileSync(`${DIR}/style.json`, 'utf8')) : null
const PRENEST = haveStyle ? readFileSync(`${DIR}/prenest.pdf`) : null
const TEMPLATE = haveStyle ? readFileSync(`${DIR}/template.pdf`) : null
const ARTWORK = haveFixtures ? readFileSync(ART) : null
const FABRIC = { name: 'No stretch', scale: 100 }
const base = () => ({
  prenestBytes: PRENEST,
  templateBytes: TEMPLATE,
  artworkBytes: ARTWORK,
  style: STYLE,
  fabric: FABRIC,
})

test('a clean fill clips every piece to its outline (no fallback)', { skip }, async () => {
  const res = await fillLayout({ ...base(), quantity: 12 })
  assert.ok(!res.errors, `unexpected errors: ${JSON.stringify(res.errors)}`)
  assert.equal(res.clip.applied, 7)
  assert.equal(res.clip.total, 7)
  assert.deepEqual(res.clip.fallback, [])
  assert.ok(res.pdfBytes && res.pdfBytes.length > 0)
})

// Laser/die-cut cut lines (CLAUDE_CODE_LASER_VS_DIECUT.md): the export must now
// PRESERVE black cut lines (one per slot), reversing the old strip-everything
// behavior. Guard against a future "cleanup" silently reverting it. We inflate
// the content streams because pdf-lib Flate-compresses them.
function inflateAllStreams(bytes) {
  const buf = Buffer.from(bytes)
  let out = ''
  let i = 0
  while (true) {
    const s = buf.indexOf('stream', i)
    if (s < 0) break
    let p = s + 6
    if (buf[p] === 0x0d) p++
    if (buf[p] === 0x0a) p++
    const e = buf.indexOf('endstream', p)
    if (e < 0) break
    try {
      out += zlib.inflateSync(buf.subarray(p, e)).toString('latin1')
    } catch {}
    i = e + 9
  }
  return out
}

test('export draws a black cut line per slot, and none when cutLines is off', { skip }, async () => {
  const on = await fillLayout({ ...base(), quantity: 12, guides: false, cutLines: true })
  const onText = inflateAllStreams(on.pdfBytes)
  const blacks = (onText.match(/0 0 0 1 K/g) || []).length
  // 84 slots; embedPdf leaves one orphaned (unreferenced) copy of the page
  // stream, so the count is a positive multiple of the slot count.
  assert.ok(blacks >= 84, `expected >=84 CMYK-black cut strokes, got ${blacks}`)

  const off = await fillLayout({ ...base(), quantity: 12, guides: false, cutLines: false })
  const offText = inflateAllStreams(off.pdfBytes)
  assert.equal((offText.match(/0 0 0 1 K/g) || []).length, 0)
})

test('quantity rounds DOWN to whole sheets and emits one page per copy', { skip }, async () => {
  const res = await fillLayout({ ...base(), quantity: 25 })
  assert.equal(res.unitsPerSheet, 12)
  assert.equal(res.rounded, 24) // 25 → 2 whole sheets = 24
  assert.equal(res.copies, 2)
  assert.equal(res.remainder, 1)
  const pages = (await PDFDocument.load(res.pdfBytes)).getPageCount()
  assert.equal(pages, 2)
})

test('quantity remainder produces a non-blocking warning', { skip }, async () => {
  const res = await fillLayout({ ...base(), quantity: 50 })
  assert.equal(res.rounded, 48)
  assert.equal(res.remainder, 2)
  assert.ok(!res.errors, 'remainder must not block export')
  assert.ok(
    (res.warnings || []).some((w) => /48 of 50.*remaining 2/i.test(w)),
    'expected a "48 of 50, remaining 2" warning',
  )
})

test('quantity under one sheet blocks export', { skip }, async () => {
  const res = await fillLayout({ ...base(), quantity: 11 })
  assert.equal(res.rounded, 0)
  assert.ok(res.errors && res.errors.length, 'under one sheet must block')
  assert.ok(res.errors.some((e) => /under one sheet/i.test(e)))
})

test('refuses (no scaling) when artwork size differs from the template', { skip }, async () => {
  const wrong = await PDFDocument.create()
  wrong.addPage([1440, 1000]) // template is 1440×1224
  const artworkBytes = await wrong.save()
  const res = await fillLayout({ ...base(), artworkBytes, quantity: 12 })
  assert.ok(res.errors && res.errors.length)
  assert.ok(res.errors.some((e) => /identical scale|refusing/i.test(e)))
})

test('fallback guard refuses when an unmatched piece box overlaps a neighbour', { skip }, async () => {
  // Move visorTop's box so no outline matches it (IoU<0.2) but it still sits on
  // top of visorBottom's box — the swallow the guard must catch.
  const broken = JSON.parse(JSON.stringify(STYLE))
  broken.templatePieces.find((p) => p.piece_type === 'visorTop').box = {
    x: 1000,
    y: 100,
    w: 200,
    h: 200,
  }
  const res = await fillLayout({ ...base(), style: broken, quantity: 12 })
  assert.ok(res.errors && res.errors.length)
  assert.ok(res.errors.some((e) => /visorTop/.test(e) && /visorBottom/.test(e)))
})

// ---- EXPERIMENT (cutline-inside-test): cut-line alignment ----------------
// 'inside' strokes the cut line at 2× the width clipped to the true outline, so
// exactly 1× shows INSIDE the line and its outer edge is the cut path (keeps
// small notches open for the laser's CCD). 'center' is the shipped default and
// must stay unchanged. These run on the tracked style fixture plus a synthetic
// artwork page of the template's exact size, so they don't depend on the
// gitignored real artwork and never silently skip.

const TEMPLATE_PAGE = [1440, 1224] // the fixture template's page size

// A stand-in artwork page: the template's exact size, filled edge to edge (a
// page with no content stream can't be embedded, and real artwork covers the
// whole artboard anyway).
async function blankArtwork() {
  const doc = await PDFDocument.create()
  const p = doc.addPage(TEMPLATE_PAGE)
  p.drawRectangle({ x: 0, y: 0, width: TEMPLATE_PAGE[0], height: TEMPLATE_PAGE[1], color: rgb(0.6, 0.7, 0.8) })
  return doc.save()
}

const styleBase = (artworkBytes) => ({
  prenestBytes: PRENEST,
  templateBytes: TEMPLATE,
  artworkBytes,
  style: STYLE,
  fabric: FABRIC,
  quantity: 12,
  guides: false,
})

// The q…Q blocks that stroke a cut line (pdf-lib writes one operator per line,
// and each block opens with the pure-black stroking colour).
function cutLineBlocks(text) {
  return text
    .split('\nq\n')
    .filter((b) => b.startsWith('0 0 0 1 K\n'))
    .map((b) => b.slice(0, b.indexOf('\nQ')).split('\n'))
}

const CUT_PT = 1.5 * (72 / 25.4) // the default 1.5 mm cut line, in points

test('cut-line alignment defaults to center and leaves that output untouched', { skip: skipStyle }, async () => {
  const artworkBytes = await blankArtwork()
  const dflt = await fillLayout(styleBase(artworkBytes))
  const ctr = await fillLayout({ ...styleBase(artworkBytes), cutLineAlign: 'center' })
  const count = (t) => (inflateAllStreams(t).match(/0 0 0 1 K/g) || []).length
  const n = count(dflt.pdfBytes)
  assert.ok(n >= 84, `expected >=84 CMYK-black cut strokes, got ${n}`)
  assert.equal(count(ctr.pdfBytes), n, 'explicit center must stroke exactly as many lines as the default')
  // Center strokes at 1× the configured width and never clips the line.
  for (const lines of cutLineBlocks(inflateAllStreams(ctr.pdfBytes))) {
    assert.ok(Math.abs(Number(lines[1].split(' ')[0]) - CUT_PT) < 1e-9, `width op was ${lines[1]}`)
    assert.ok(!lines.includes('W'), 'center mode must not clip the cut line')
  }
})

test("'inside' clips to the outline then strokes 2× wide in the same q/Q block", { skip: skipStyle }, async () => {
  const res = await fillLayout({ ...styleBase(await blankArtwork()), cutLineAlign: 'inside' })
  const blocks = cutLineBlocks(inflateAllStreams(res.pdfBytes))
  assert.ok(blocks.length >= 84, `expected >=84 cut-line blocks, got ${blocks.length}`)
  for (const lines of blocks) {
    // Line width is exactly 2× the configured width, so 1× survives the clip.
    assert.ok(
      Math.abs(Number(lines[1].split(' ')[0]) - CUT_PT * 2) < 1e-9,
      `width op was ${lines[1]}, expected ${CUT_PT * 2}`,
    )
    // The clip (W n) precedes the stroke (S) inside this same block.
    const w = lines.indexOf('W')
    const s = lines.indexOf('S')
    assert.ok(w > 0, 'inside mode must clip the cut line')
    assert.equal(lines[w + 1], 'n', 'clip must be followed by endPath')
    assert.ok(w < s, 'the clip must come before the stroke')
  }
})

test("'center' and 'inside' produce identical DXF bytes", { skip: skipStyle }, async () => {
  const artworkBytes = await blankArtwork()
  const ctr = await fillLayout({ ...styleBase(artworkBytes), cutMode: 'laser', cutLineAlign: 'center' })
  const ins = await fillLayout({ ...styleBase(artworkBytes), cutMode: 'laser', cutLineAlign: 'inside' })
  assert.ok(ctr.dxf && ctr.dxf.length > 0, 'laser mode must emit a DXF')
  assert.equal(ins.dxf, ctr.dxf, 'the cut-line alignment must not touch the DXF')
})

test('an unmatched piece that overlaps nobody does not false-refuse', { skip }, async () => {
  const lone = JSON.parse(JSON.stringify(STYLE))
  lone.templatePieces.find((p) => p.piece_type === 'visorTop').box = {
    x: 1350,
    y: 650,
    w: 80,
    h: 80,
  } // empty corner of the 1440×1224 artboard
  const res = await fillLayout({ ...base(), style: lone, quantity: 12 })
  assert.ok(!res.errors, `unexpected refuse: ${JSON.stringify(res.errors)}`)
})
