import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkArtworkColor } from '../src/lib/verifyArtwork.js'

// Detect-only color-profile + flatten advisory. Fixtures are tiny generated
// PDFs (see tests/fixtures/): one flattened single image carrying an embedded
// sRGB profile, and one with nine Device(unprofiled) images. They exercise the
// "clean" and "both warnings" ends of the check.
const fixture = (name) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))))

test('multi-image unprofiled artwork warns about both color profile and flatten', async () => {
  const { warnings, imageCount, profile } = await checkArtworkColor(fixture('artwork-multi-unprofiled.pdf'))
  assert.equal(imageCount, 9)
  assert.equal(profile, 'none')
  assert.equal(warnings.length, 2)
  assert.ok(warnings.some((w) => /no embedded color profile/i.test(w)))
  assert.ok(warnings.some((w) => /not flattened \(it contains 9 separate images\)/i.test(w)))
})

test('single-image sRGB artwork produces no warnings', async () => {
  const { warnings, imageCount, profile } = await checkArtworkColor(fixture('artwork-single-srgb.pdf'))
  assert.equal(imageCount, 1)
  assert.equal(profile, 'sRGB')
  assert.deepEqual(warnings, [])
})

test('unreadable bytes are tolerated silently (no warnings, no throw)', async () => {
  const { warnings, imageCount } = await checkArtworkColor(new Uint8Array([1, 2, 3, 4]))
  assert.deepEqual(warnings, [])
  assert.equal(imageCount, 0)
})
