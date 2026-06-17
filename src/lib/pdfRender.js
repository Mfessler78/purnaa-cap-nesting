import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

// Load page 1 of a PDF for display. pdf.js takes ownership of the buffer
// it is given, so pass a copy and leave the caller's bytes untouched.
export async function loadPdfPage(bytes) {
  const doc = await getDocument({ data: bytes.slice() }).promise
  const page = await doc.getPage(1)
  const [x0, y0, x1, y1] = page.view
  return { page, width: x1 - x0, height: y1 - y0, originX: x0, originY: y0 }
}

// Kick off rendering into a canvas at the given scale. Returns the pdf.js
// render task so the caller can cancel it if a newer render supersedes it.
export function startRender(page, canvas, scale) {
  const viewport = page.getViewport({ scale })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return page.render({ canvasContext: ctx, viewport })
}
