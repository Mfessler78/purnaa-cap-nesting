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
// We proved on printed fabric that color shifts come from missing/undefined
// color profiles, not from flattening: unprofiled artwork is assigned a space
// by the viewer/RIP and over-saturates, while artwork carrying a working RGB
// profile prints true. So at upload we TELL the operator two things and let
// them proceed either way:
//   A) whether a usable color profile is embedded (warn if missing or wrong);
//   B) whether the artwork is flattened, inferred from the page's image count
//      (an unflattened, many-image file rips very slowly in RasterLink).
//
// This reads PDF structure only — it changes no pixels, color data, or vectors
// (invariant §7) and never touches the Ghostscript fallback (invariant §9).
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

// Classify one image's color space into { kind, class?, name? }:
//   kind 'none'    → a Device* space, i.e. NO embedded profile
//   kind 'icc'     → an ICCBased space (carries class + best-effort name)
//   kind 'defined' → calibrated/Lab (defined, but not an ICC working space)
//   kind 'unknown' → anything we can't read; we stay silent on these
function classifyColorSpace(cs, depth = 0) {
  if (depth > 8 || !cs) return { kind: 'unknown' }
  if (cs instanceof PDFName) {
    const n = cs.toString()
    if (n === '/DeviceRGB' || n === '/DeviceCMYK' || n === '/DeviceGray') return { kind: 'none' }
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
function collectImages(doc, page) {
  const images = []
  const seen = new Set()
  function walk(resources, depth) {
    if (!resources || depth > 12) return
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
        images.push(classifyColorSpace(stream.dict.lookup(PDFName.of('ColorSpace'))))
      } else if (sub === '/Form') {
        walk(stream.dict.lookup(PDFName.of('Resources')), depth + 1)
      }
    }
  }
  walk(page.node.Resources(), 0)
  return images
}

const FIX_PROFILE =
  'in Photoshop, Edit → Assign Profile → “sRGB IEC61966-2.1”, then re-save with ' +
  '“Embed Color Profile” checked and upload again. You can still proceed.'

// An ICC RGB working space with no readable name is assumed fine (don't cry
// wolf); only a name that clearly isn't sRGB, or a non-RGB class, is unsuitable.
function isSuitable(img) {
  return img.class === 'rgb' && (!img.name || /srgb/i.test(img.name))
}

function unsuitableLabel(img) {
  if (img.name) return `“${img.name}”`
  if (img.class === 'cmyk') return 'a CMYK color profile'
  if (img.class === 'gray') return 'a grayscale color profile'
  return 'a non-sRGB RGB color profile'
}

// Detect-only color-profile + flatten advisory. Returns warning strings (the
// shape RunScreen already renders) plus diagnostics for tests. Never throws on
// unreadable artwork — it returns no warnings so the visual preview and the
// region check stay the backstops.
export async function checkArtworkColor(artworkBytes) {
  const warnings = []
  let imageCount = 0
  let profile = 'unknown'
  try {
    const doc = await PDFDocument.load(artworkBytes, { updateMetadata: false })
    const images = collectImages(doc, doc.getPage(0))
    imageCount = images.length

    if (imageCount > 0) {
      // Check A — color profile (one warning at most; worst case wins).
      const anyMissing = images.some((i) => i.kind === 'none')
      const unsuitable = images.find((i) => i.kind === 'icc' && !isSuitable(i))
      if (anyMissing) {
        profile = 'none'
        warnings.push(
          'This artwork has no embedded color profile, so its colors may shift ' +
            `(often look over-saturated) when printed. To fix: ${FIX_PROFILE}`,
        )
      } else if (unsuitable) {
        profile = unsuitable.class || 'other'
        warnings.push(
          `This artwork’s embedded color profile is ${unsuitableLabel(unsuitable)}, which ` +
            `can shift colors when printed. To fix: ${FIX_PROFILE}`,
        )
      } else if (images.some((i) => i.kind === 'icc')) {
        profile = 'sRGB'
      }

      // Check B — flatten, inferred from image count.
      if (imageCount > 1) {
        warnings.push(
          `This artwork is not flattened (it contains ${imageCount} separate images), so it ` +
            'will be slow to process in RasterLink — large layered files can take around 15 ' +
            'minutes. To fix: in Photoshop, Layer → Flatten Image (after embedding the color ' +
            'profile), then re-save and upload again. You can still proceed.',
        )
      }
    }
  } catch {
    return { warnings: [], imageCount: 0, profile: 'unknown' }
  }
  return { warnings, imageCount, profile }
}
