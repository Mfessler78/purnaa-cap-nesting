import {
  PDFDocument,
  PDFName,
  StandardFonts,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  drawObject,
} from 'pdf-lib'
// pako ships inside pdf-lib (its FlateDecode implementation) — importing it
// directly adds no new package; it is the same code already in the bundle.
import { deflate } from 'pako'
import { drawStamp, toPdf14 } from './engine'
import { loadPdfPage } from './pdfRender'

// ---------------------------------------------------------------------------
// In-app flatten (browser-only — needs a canvas; replaces the removed
// Ghostscript fallback). The composed sheet is rasterized ONCE at print-native
// resolution and rebuilt as an image-only PDF, which by construction carries
// no transparency, soft masks, or live effects for RasterLink to mis-rip.
//
// GUARD (owner sign-off on invariant §7): callers may only invoke this when
// the uploaded artwork has an embedded RGB ICC profile — the raster is tagged
// with those EXACT profile bytes, so the file RasterLink receives declares the
// same profile the artwork did. Unprofiled artwork must never be flattened
// (and is never auto-assigned a profile); non-RGB profiles can't tag the
// canvas's RGB pixels, so they skip flattening too.
//
// Fidelity: 300 dpi (the printer's native resolution), lossless Flate-
// compressed raw RGB (no JPEG, no downsampling). Browser canvases cap out
// around 16k px per side, so a 60-inch sheet is rendered in tiles; each tile
// is embedded ONCE and shared by every sheet page (invariant §5), with the
// per-sheet stamp drawn on top as vector text (text has no transparency).
// ---------------------------------------------------------------------------

const DPI = 300
const TILE_PX = 8192

// sheetBytes/width/height/stamps come straight from fillLayout's `flatten`
// return field; profileBytes is the artwork's ICC profile from
// checkArtworkColor. Returns the finished PDF bytes (1.4-labeled, classic
// xref — same envelope as the direct-vector export).
export async function flattenExport({ sheetBytes, width, height, stamps, profileBytes }, onProgress) {
  const { page, width: w0 } = await loadPdfPage(sheetBytes)
  // Render the unscaled sheet so the OUTPUT page (after fabric stretch) lands
  // at exactly DPI: (output pts / source pts) × px per output pt.
  const pxPerPt = DPI / 72
  const pxW = Math.ceil(width * pxPerPt)
  const pxH = Math.ceil(height * pxPerPt)
  const scale = (width / w0) * pxPerPt

  const doc = await PDFDocument.create()
  const ctxPdf = doc.context
  const colorSpace = ctxPdf.obj([
    PDFName.of('ICCBased'),
    ctxPdf.register(ctxPdf.stream(profileBytes, { N: 3 })),
  ])

  const cols = Math.ceil(pxW / TILE_PX)
  const rows = Math.ceil(pxH / TILE_PX)
  const tiles = []
  const canvas = document.createElement('canvas')
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (onProgress) onProgress(tiles.length + 1, rows * cols)
      const x = c * TILE_PX
      const y = r * TILE_PX
      const tw = Math.min(TILE_PX, pxW - x)
      const th = Math.min(TILE_PX, pxH - y)
      canvas.width = tw
      canvas.height = th
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, tw, th)
      // The transform is a pure integer translation in device pixels, so every
      // tile rasterizes on the same pixel grid — no seams between tiles.
      await page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale }),
        transform: [1, 0, 0, 1, -x, -y],
        background: '#fff',
      }).promise
      const rgba = ctx.getImageData(0, 0, tw, th).data
      const rgb = new Uint8Array(tw * th * 3) // drop alpha: composed on white, fully opaque
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i]
        rgb[j + 1] = rgba[i + 1]
        rgb[j + 2] = rgba[i + 2]
      }
      const ref = ctxPdf.register(
        ctxPdf.stream(deflate(rgb), {
          Type: 'XObject',
          Subtype: 'Image',
          Width: tw,
          Height: th,
          BitsPerComponent: 8,
          ColorSpace: colorSpace,
          Filter: 'FlateDecode',
        }),
      )
      tiles.push({
        ref,
        name: `Tile${tiles.length}`,
        x: x / pxPerPt,
        y: height - (y + th) / pxPerPt, // top-origin px → bottom-origin pt
        w: tw / pxPerPt,
        h: th / pxPerPt,
      })
    }
  }
  canvas.width = canvas.height = 0 // release the big backing store promptly

  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of stamps) {
    const pg = doc.addPage([width, height])
    const ops = []
    for (const t of tiles) {
      pg.node.setXObject(PDFName.of(t.name), t.ref) // shared refs — embed once
      ops.push(
        pushGraphicsState(),
        concatTransformationMatrix(t.w, 0, 0, t.h, t.x, t.y),
        drawObject(t.name),
        popGraphicsState(),
      )
    }
    pg.pushOperators(...ops)
    drawStamp(pg, font, text)
  }
  return toPdf14(await doc.save({ useObjectStreams: false }))
}
