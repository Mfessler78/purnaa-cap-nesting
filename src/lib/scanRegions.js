// Pure pixel/geometry logic for missing-artwork detection. No imports so it
// runs in both the browser (via verifyArtwork.js) and Node tests.
//
// Heuristic limits: pure-white artwork on the white artboard is invisible to
// this check, and guide fills left in the artwork file count as ink. The
// visual preview remains the human backstop.

const NEAR_WHITE = 246 // r/g/b at or above this counts as background
const MIN_INK_SAMPLES = 12 // ignore stray anti-aliasing specks

// ctx must support getImageData; pdfInfo = { width, height, originX, originY }.
export function scanRegions(ctx, canvasWidth, canvasHeight, pdfInfo, scale, templatePieces) {
  return templatePieces.map((p) => {
    const b = p.box
    let x = Math.floor((b.x - pdfInfo.originX) * scale)
    let y = Math.floor((pdfInfo.height - (b.y - pdfInfo.originY) - b.h) * scale)
    let w = Math.ceil(b.w * scale)
    let h = Math.ceil(b.h * scale)
    // clamp to canvas
    if (x < 0) {
      w += x
      x = 0
    }
    if (y < 0) {
      h += y
      y = 0
    }
    w = Math.min(w, canvasWidth - x)
    h = Math.min(h, canvasHeight - y)
    if (w < 1 || h < 1) return { piece_type: p.piece_type, hasArtwork: false }

    const data = ctx.getImageData(x, y, w, h).data
    let ink = 0
    for (let i = 0; i < data.length; i += 16) {
      // every 4th pixel
      const a = data[i + 3]
      if (a > 16 && (data[i] < NEAR_WHITE || data[i + 1] < NEAR_WHITE || data[i + 2] < NEAR_WHITE)) {
        ink++
        if (ink >= MIN_INK_SAMPLES) break
      }
    }
    return { piece_type: p.piece_type, hasArtwork: ink >= MIN_INK_SAMPLES }
  })
}
