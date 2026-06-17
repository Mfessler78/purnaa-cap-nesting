import { loadPdfPage, startRender } from './pdfRender'
import { scanRegions } from './scanRegions'

// Missing-artwork detection (M4 verification gate): render the customer
// artwork page once, then scan each template piece's region for ink. A region
// that is entirely white/transparent means the customer artwork is missing
// for that piece type — a blocking condition.
export async function checkArtworkRegions(artworkBytes, templatePieces) {
  const pdf = await loadPdfPage(artworkBytes)
  const maxDim = 2200
  const scale = Math.min(maxDim / pdf.width, maxDim / pdf.height, 2)
  const canvas = document.createElement('canvas')
  await startRender(pdf.page, canvas, scale).promise
  const ctx = canvas.getContext('2d')
  return scanRegions(ctx, canvas.width, canvas.height, pdf, scale, templatePieces)
}
