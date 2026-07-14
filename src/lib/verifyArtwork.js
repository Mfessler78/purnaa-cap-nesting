import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

// Missing-artwork detection (M4 verification gate): render the customer
// artwork page once, then scan each template piece's region for ink. A region
// that is entirely white/transparent means the customer artwork is missing
// for that piece type — a blocking condition.
export async function checkArtworkRegions(artworkBytes, templatePieces) {
  // Load the DOM/pdf.js path lazily: pdfRender pulls in the pdf.js worker (a
  // Vite-only `?url` import), so importing it at module top would make the
  // detect-only color check below un-importable under Node (and its tests).
  const [{ loadPdfPage, startRender }, { scanRegions }] = await Promise.all([
    import('./pdfRender'),
    import('./scanRegions'),
  ])
  const pdf = await loadPdfPage(artworkBytes)
  const maxDim = 2200
  const scale = Math.min(maxDim / pdf.width, maxDim / pdf.height, 2)
  const canvas = document.createElement('canvas')
  await startRender(pdf.page, canvas, scale).promise
  const ctx = canvas.getContext('2d')
  return scanRegions(ctx, canvas.width, canvas.height, pdf, scale, templatePieces)
}

// ---------------------------------------------------------------------------
// Color-profile & flatten advisory (detect-only, WARN-NEVER-BLOCK).
//
// Company standard: artwork is prepared in Adobe RGB (1998), and RasterLink
// is configured with the same input profile. Color accuracy comes from that
// PARITY — the profile embedded in the file matching the profile the RIP is
// set to — so at upload we TELL the operator two things and let them proceed
// either way:
//   A) which color profile is embedded: Adobe RGB (1998) confirms; any other
//      profile (or none) draws a match-your-RasterLink-setting advisory;
//   B) whether the artwork is heavily layered (multiple images on the page —
//      the slow-rip condition in RasterLink); the fix is flattening in
//      Photoshop, customer-side — the app itself never flattens.
//
// This reads PDF structure only — it changes no pixels, color data, or vectors
// (invariant §7).
// ---------------------------------------------------------------------------

// Read an (often Flate-compressed) stream's decoded bytes, falling back to the
// raw bytes if the filter chain can't be decoded.
function streamBytes(stream) {
  try {
    return decodePDFRawStream(stream).decode()
  } catch {
    return stream.getContents()
  }
}

// ICC header data-color-space signature lives at byte offset 16 (4 chars).
function iccClass(bytes) {
  if (!bytes || bytes.length < 20) return null
  const sig = String.fromCharCode(bytes[16], bytes[17], bytes[18], bytes[19]).trim()
  if (sig === 'RGB') return 'rgb'
  if (sig === 'CMYK') return 'cmyk'
  if (sig === 'GRAY') return 'gray'
  return sig.toLowerCase()
}

// Best-effort profile name from the ICC 'desc' tag (ICCv2 'desc' or ICCv4
// 'mluc'). Returns null if it can't be read — callers fall back to the class.
function iccName(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const tagCount = dv.getUint32(128)
    for (let i = 0; i < tagCount; i++) {
      const off = 132 + i * 12
      const sig = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3])
      if (sig !== 'desc') continue
      const tagOff = dv.getUint32(off + 4)
      const type = String.fromCharCode(bytes[tagOff], bytes[tagOff + 1], bytes[tagOff + 2], bytes[tagOff + 3])
      if (type === 'desc') {
        const count = dv.getUint32(tagOff + 8)
        let s = ''
        for (let k = 0; k < count - 1; k++) s += String.fromCharCode(bytes[tagOff + 12 + k])
        return s.trim() || null
      }
      if (type === 'mluc') {
        const len = dv.getUint32(tagOff + 16)
        const strOff = dv.getUint32(tagOff + 20)
        const start = tagOff + strOff
        if (start + len > bytes.length) return null
        let s = ''
        for (let k = 0; k < len; k += 2) s += String.fromCharCode(dv.getUint16(start + k))
        return s.trim() || null
      }
    }
  } catch {
    return null
  }
  return null
}

// Classify one color space into { kind, class?, name?, device? }:
//   kind 'none'    → a Device* space, i.e. NO profile of its own (carries
//                    which device space, so a Default* remap can rescue it)
//   kind 'icc'     → an ICCBased space (carries class + best-effort name)
//   kind 'defined' → calibrated/Lab (defined, but not an ICC working space)
//   kind 'unknown' → anything we can't read; we stay silent on these
function classifyColorSpace(cs, depth = 0) {
  if (depth > 8 || !cs) return { kind: 'unknown' }
  if (cs instanceof PDFName) {
    const n = cs.toString()
    if (n === '/DeviceRGB') return { kind: 'none', device: 'rgb' }
    if (n === '/DeviceCMYK') return { kind: 'none', device: 'cmyk' }
    if (n === '/DeviceGray') return { kind: 'none', device: 'gray' }
    return { kind: 'unknown' }
  }
  if (cs instanceof PDFArray) {
    const head = cs.lookup(0)
    const kind = head ? head.toString() : ''
    if (kind === '/ICCBased') {
      const stream = cs.lookup(1)
      if (stream instanceof PDFRawStream) {
        const bytes = streamBytes(stream)
        return { kind: 'icc', class: iccClass(bytes), name: iccName(bytes) }
      }
      return { kind: 'unknown' }
    }
    if (kind === '/Indexed') return classifyColorSpace(cs.lookup(1), depth + 1)
    if (kind === '/CalRGB' || kind === '/CalGray' || kind === '/Lab') return { kind: 'defined' }
    return { kind: 'unknown' }
  }
  return { kind: 'unknown' }
}

// Walk page-1 resources (recursing into Form XObjects, which is where
// Illustrator/Photoshop wrap placed images) and classify every image XObject.
//
// Crucially, each resource dictionary's /ColorSpace subdictionary is read
// first: a /DefaultRGB (/DefaultCMYK, /DefaultGray) entry there remaps ALL
// Device* content in that scope into the given space (PDF 32000 §8.6.5.6) —
// this is exactly how Illustrator embeds the working profile while the images
// themselves say /DeviceRGB. Ignoring it was why profiled files read as
// "no profile". Any ICC space found in those dictionaries is also collected
// as page-level profile evidence (vector-only artwork carries it there).
function collectColorInfo(doc, page) {
  const images = []
  const spaces = []
  const seen = new Set()
  function walk(resources, defaults, depth) {
    if (!resources || depth > 12) return
    const csDict = resources.lookup(PDFName.of('ColorSpace'))
    if (csDict && csDict.entries) {
      for (const [name] of csDict.entries()) {
        const c = classifyColorSpace(csDict.lookup(name))
        if (c.kind !== 'icc' && c.kind !== 'defined') continue
        spaces.push(c)
        const n = name.toString()
        if (n === '/DefaultRGB') defaults = { ...defaults, rgb: c }
        else if (n === '/DefaultCMYK') defaults = { ...defaults, cmyk: c }
        else if (n === '/DefaultGray') defaults = { ...defaults, gray: c }
      }
    }
    const xobjects = resources.lookup(PDFName.of('XObject'))
    if (!xobjects || !xobjects.entries) return
    for (const [name] of xobjects.entries()) {
      const ref = xobjects.get(name)
      const key = ref && ref.toString && ref.toString()
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      const stream = doc.context.lookup(ref)
      if (!stream || !stream.dict) continue
      const subtype = stream.dict.lookup(PDFName.of('Subtype'))
      const sub = subtype ? subtype.toString() : ''
      if (sub === '/Image') {
        let c = classifyColorSpace(stream.dict.lookup(PDFName.of('ColorSpace')))
        if (c.kind === 'none' && defaults[c.device]) c = defaults[c.device]
        images.push(c)
      } else if (sub === '/Form') {
        walk(stream.dict.lookup(PDFName.of('Resources')), defaults, depth + 1)
      }
    }
  }
  walk(page.node.Resources(), {}, 0)
  return { images, spaces }
}

// A document OutputIntent's ICC profile (how PDF/X exports embed the intended
// output space). Treated as profile evidence for Device* content the same way
// a RIP honouring the intent would.
function outputIntentProfile(doc) {
  try {
    const intents = doc.catalog.lookup(PDFName.of('OutputIntents'))
    if (!(intents instanceof PDFArray)) return null
    for (let i = 0; i < intents.size(); i++) {
      const intent = intents.lookup(i)
      if (!intent || !intent.lookup) continue
      const dest = intent.lookup(PDFName.of('DestOutputProfile'))
      if (dest instanceof PDFRawStream) {
        const bytes = streamBytes(dest)
        return { kind: 'icc', class: iccClass(bytes), name: iccName(bytes) }
      }
    }
  } catch {
    return null
  }
  return null
}

// Only the company standard confirms; every other embedded profile draws the
// parity warning (sRGB is NOT special-cased — it is no longer the standard).
const isStandard = (p) => !!p.name && /adobe\s*rgb\s*\(?\s*1998\s*\)?/i.test(p.name)

const FIX_PROFILE =
  'in Photoshop, Edit → Assign Profile → “Adobe RGB (1998)”, then re-save with ' +
  '“Embed Color Profile” checked and upload again. You can still proceed.'

const NO_PROFILE_MSG =
  'This artwork has no embedded color profile, so there is no profile for RasterLink ' +
  `to match — color accuracy can’t be verified. To fix: ${FIX_PROFILE}`

// Human-readable name for a detected profile: the exact ICC name when
// readable, else the best description available. Also printed on the export
// stamp, so keep it short.
function labelFor(p) {
  if (p.name) return p.name
  if (p.kind === 'defined') return 'Calibrated color space (no ICC name)'
  if (p.class === 'cmyk') return 'CMYK ICC profile (name unreadable)'
  if (p.class === 'gray') return 'Grayscale ICC profile (name unreadable)'
  return 'RGB ICC profile (name unreadable)'
}

// Detect-only color-profile + flatten advisory. Returns warning strings (the
// shape RunScreen already renders), a positive `confirmation` line when the
// company-standard profile IS embedded (naming it exactly), `profileLabel`
// (the plain profile name for the export stamp), and diagnostics for tests.
// Never throws on unreadable artwork — it returns no warnings so the visual
// preview and the region check stay the backstops.
export async function checkArtworkColor(artworkBytes) {
  const warnings = []
  let confirmation = null
  let imageCount = 0
  let profile = 'unknown'
  let profileName = null
  let profileLabel = null
  try {
    const doc = await PDFDocument.load(artworkBytes, { updateMetadata: false })
    const { images, spaces } = collectColorInfo(doc, doc.getPage(0))
    const intent = outputIntentProfile(doc)
    imageCount = images.length

    // Effective per-image profile: the image's own space → the resource-level
    // Default* remap (applied in collectColorInfo) → the document OutputIntent.
    const effective = intent ? images.map((i) => (i.kind === 'none' ? intent : i)) : images

    // Confirmation or parity warning for the profile the file is tagged with.
    // NEVER a claim about print-time color behavior — the advisory is about
    // matching the profile set in RasterLink, nothing more.
    const applyTagged = (t) => {
      profile = t.kind === 'icc' ? t.class || 'icc' : 'defined'
      profileName = t.name || null
      profileLabel = labelFor(t)
      if (isStandard(t)) {
        confirmation =
          `Color profile confirmed: “${t.name}” is embedded — matches the company standard. ` +
          'Ensure RasterLink is set to the same profile so colors stay accurate.'
      } else {
        warnings.push(
          `This artwork is tagged “${profileLabel}”, not the company standard “Adobe RGB (1998)”. ` +
            'The artwork’s color profile needs to match the profile set in RasterLink to maintain ' +
            'color accuracy — set RasterLink to this same profile for the job, or re-save the ' +
            'artwork in Adobe RGB (1998). You can still proceed.',
        )
      }
    }

    if (imageCount > 0) {
      // Check A — color profile (one warning OR one confirmation; worst case wins).
      const anyMissing = effective.some((i) => i.kind === 'none')
      const tagged = effective.find((i) => i.kind === 'icc' && i.name) ||
        effective.find((i) => i.kind === 'icc' || i.kind === 'defined')
      if (anyMissing) {
        profile = 'none'
        profileLabel = 'No profile'
        warnings.push(NO_PROFILE_MSG)
      } else if (tagged) {
        applyTagged(tagged)
      }

      // Check B — the slow-rip condition, inferred from image count. The app
      // never flattens (invariant §7): it only names the symptom and points to
      // Photoshop, where the customer flattens with color authority.
      if (imageCount > 1) {
        warnings.push(
          `This artwork has multiple layered/masked images (${imageCount} found) and may rip ` +
            'slowly in RasterLink — large layered files can take around 15 minutes. To speed up ' +
            'the rip, flatten it in Photoshop before running: Layer → Flatten Image (after ' +
            'embedding the color profile), then re-save and upload again. You can still proceed.',
        )
      }
    } else {
      // Vector-only artwork: judge a profile carried by the resource
      // color-space dictionaries or the OutputIntent; otherwise stay silent
      // (unchanged behavior — the warning texts are image-specific).
      const ev = (intent && intent.class ? intent : null) || spaces.find((s) => s.kind === 'icc')
      if (ev) applyTagged(ev)
    }
  } catch {
    return { warnings: [], confirmation: null, imageCount: 0, profile: 'unknown', profileName: null, profileLabel: null }
  }
  return { warnings, confirmation, imageCount, profile, profileName, profileLabel }
}
