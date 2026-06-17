import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { extractOutlines } from '../src/lib/pdfPaths.js'

// Stable fixture (a copy of the mapped skate style's template), not the live
// styles/ folder, so a rename/delete in the app can't break this suite.
const FIXTURE_PATH = 'tests/fixtures/skate-style/template.pdf'
const PRODUCTION_PATH = 'test-files/PUR560104-MIDPRO(OSFM)-SKATE-PatternLayoutTemplate.pdf'
const skipFixture = existsSync(FIXTURE_PATH) ? false : 'skate-style template fixture missing'
const skipProd = existsSync(PRODUCTION_PATH) ? false : 'production template missing'
const FIXTURE = skipFixture ? null : readFileSync(FIXTURE_PATH)
const PRODUCTION = skipProd ? null : readFileSync(PRODUCTION_PATH)

test('extractOutlines reads the 7 painted outlines from the skate-style template', { skip: skipFixture }, async () => {
  const outlines = await extractOutlines(FIXTURE)
  assert.equal(outlines.length, 7)
  for (const o of outlines) {
    assert.ok(o.bbox.w > 0 && o.bbox.h > 0)
    assert.ok(o.subpaths.length >= 1)
  }
})

test('extractOutlines reads CLIP-path outlines from the production template', { skip: skipProd }, async () => {
  // Production pieces are raster images clipped to their cut outline (W n Do),
  // so the geometry lives in the clip path. Must recover all 7, not 0.
  const outlines = await extractOutlines(PRODUCTION)
  assert.ok(outlines.length >= 7, `expected >=7 outlines, got ${outlines.length}`)
})

test('extractOutlines works without a global Buffer (browser regression)', { skip: skipFixture }, async () => {
  // In the browser Buffer is undefined; this used to throw and silently drop
  // every style to rectangle clipping. Simulate that env and assert it still
  // returns outlines (now via TextDecoder).
  const savedBuffer = globalThis.Buffer
  try {
    globalThis.Buffer = undefined
    const outlines = await extractOutlines(FIXTURE)
    assert.equal(outlines.length, 7)
  } finally {
    globalThis.Buffer = savedBuffer
  }
})
