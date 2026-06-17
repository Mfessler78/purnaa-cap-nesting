// Shared PDF coordinate-geometry helpers. Both PDF-path readers — detectRegions.js
// (walks the pdf.js operator list for slot bounding boxes) and pdfPaths.js (parses
// the raw content stream for true outlines) — track a current transform matrix and
// drop the full-page background rectangle the same way. Keeping that math in one
// place means the two readers can never drift apart.

// PDF matrices as [a,b,c,d,e,f]; a point maps x' = a*x + c*y + e, y' = b*x + d*y + f.
export const matMul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

export const applyPt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// A path whose bbox covers at least this fraction of the page in both dimensions
// is treated as the page background / full-page clip and dropped, not a piece.
export const FULL_PAGE_RATIO = 0.95
