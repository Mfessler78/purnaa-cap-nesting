import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkArtworkColor } from '../src/lib/verifyArtwork.js'

// Detect-only color-profile + flatten advisory. Fixtures are tiny generated
// PDFs (see tests/fixtures/): flattened single images carrying an embedded
// Adobe RGB (1998) profile (the company standard — confirms) and an sRGB
// profile (embedded but non-standard — parity warning), plus one with nine
// Device(unprofiled) images. The advisory is about matching the profile set
// in RasterLink; it must never claim colors will shift when printed.
const fixture = (name) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))))

test('Adobe RGB (1998) artwork confirms — matches the company standard', async () => {
  const { warnings, confirmation, imageCount, profile, profileName, profileLabel } =
    await checkArtworkColor(fixture('artwork-single-adobergb.pdf'))
  assert.equal(imageCount, 1)
  assert.equal(profile, 'rgb')
  assert.equal(profileName, 'Adobe RGB (1998)')
  assert.equal(profileLabel, 'Adobe RGB (1998)')
  assert.match(confirmation, /“Adobe RGB \(1998\)” is embedded — matches the company standard/)
  assert.match(confirmation, /RasterLink is set to the same profile/)
  assert.deepEqual(warnings, [])
})

test('multi-image unprofiled artwork warns about both color profile and flatten', async () => {
  const { warnings, confirmation, imageCount, profile, profileLabel } =
    await checkArtworkColor(fixture('artwork-multi-unprofiled.pdf'))
  assert.equal(imageCount, 9)
  assert.equal(profile, 'none')
  assert.equal(profileLabel, 'No profile')
  assert.equal(confirmation, null)
  assert.equal(warnings.length, 2)
  assert.ok(warnings.some((w) => /no embedded color profile.*no profile for RasterLink to match/i.test(w)))
  const slowRip = warnings.find((w) => /multiple layered\/masked images \(9 found\)/.test(w))
  assert.ok(slowRip)
  assert.match(slowRip, /flatten it in Photoshop/i)
  // The app only warns — it must never claim to flatten anything itself.
  assert.doesNotMatch(slowRip, /export button|the program|the app/i)
})

test('sRGB artwork WARNS — sRGB is no longer the standard; message is RasterLink parity', async () => {
  const { warnings, confirmation, imageCount, profile, profileName, profileLabel } =
    await checkArtworkColor(fixture('artwork-single-srgb.pdf'))
  assert.equal(imageCount, 1)
  assert.equal(profile, 'rgb')
  assert.equal(profileName, 'sRGB IEC61966-2.1')
  assert.equal(profileLabel, 'sRGB IEC61966-2.1')
  assert.equal(confirmation, null)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /tagged “sRGB IEC61966-2\.1”, not the company standard/)
  assert.match(warnings[0], /match the profile set in RasterLink/)
  // Parity advisory only — never a print-time color-shift claim.
  assert.doesNotMatch(warnings[0], /shift/i)
})

// Regression: Illustrator embeds the working profile as a /DefaultRGB entry
// in the page's /ColorSpace resources while the images themselves say
// /DeviceRGB. That used to read as "no profile"; it must be recognized as the
// named profile (here sRGB → the parity warning, NOT the no-profile warning).
test('DeviceRGB image with a DefaultRGB ICC resource reads as that profile, not "no profile"', async () => {
  const { warnings, imageCount, profile, profileName } = await checkArtworkColor(
    fixture('artwork-devicergb-defaultrgb.pdf'),
  )
  assert.equal(imageCount, 1)
  assert.equal(profile, 'rgb')
  assert.equal(profileName, 'sRGB IEC61966-2.1')
  assert.equal(warnings.length, 1)
  assert.doesNotMatch(warnings[0], /no embedded color profile/i)
  assert.match(warnings[0], /tagged “sRGB IEC61966-2\.1”/)
})

test('unreadable bytes are tolerated silently (no warnings, no throw)', async () => {
  const { warnings, confirmation, imageCount, profileLabel } = await checkArtworkColor(
    new Uint8Array([1, 2, 3, 4]),
  )
  assert.deepEqual(warnings, [])
  assert.equal(confirmation, null)
  assert.equal(imageCount, 0)
  assert.equal(profileLabel, null)
})
