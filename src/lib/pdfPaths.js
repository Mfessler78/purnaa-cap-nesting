import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { matMul, applyPt, FULL_PAGE_RATIO } from './pdfGeometry.js'

// Extract closed-path outlines from a PDF page by reading the raw content
// stream (standard, stable PDF path operators) rather than pdf.js's internal
// packed path arrays. Used to clip customer artwork to a piece's true shape
// instead of its bounding rectangle, which removes neighbour bleed and avoids
// cutting curved pieces off. Mirrors the CTM-tracking idea in detectRegions.js.

const isWs = (ch) =>
  ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\0'
const isDelim = (ch) => '()<>[]{}/%'.includes(ch)

// Minimal content-stream tokenizer: yields numbers, operators, and opaque
// markers for names/strings (which we only use to reset the operand stack).
function* tokenize(str) {
  let i = 0
  const n = str.length
  while (i < n) {
    const ch = str[i]
    if (isWs(ch)) {
      i++
    } else if (ch === '%') {
      while (i < n && str[i] !== '\n' && str[i] !== '\r') i++
    } else if (ch === '/') {
      i++
      while (i < n && !isWs(str[i]) && !isDelim(str[i])) i++
      yield { t: 'name' }
    } else if (ch === '(') {
      i++
      let depth = 1
      while (i < n && depth > 0) {
        if (str[i] === '\\') i += 2
        else {
          if (str[i] === '(') depth++
          else if (str[i] === ')') depth--
          i++
        }
      }
      yield { t: 'name' }
    } else if (ch === '<') {
      if (str[i + 1] === '<') i += 2
      else {
        i++
        while (i < n && str[i] !== '>') i++
        i++
      }
      yield { t: 'name' }
    } else if (ch === '>' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      i++
    } else if ((ch >= '0' && ch <= '9') || ch === '+' || ch === '-' || ch === '.') {
      let s = ''
      while (i < n && !isWs(str[i]) && !isDelim(str[i])) s += str[i++]
      const num = parseFloat(s)
      if (Number.isFinite(num)) yield { t: 'num', v: num }
      else yield { t: 'name' }
    } else {
      let s = ''
      while (i < n && !isWs(str[i]) && !isDelim(str[i])) s += str[i++]
      if (s) yield { t: 'op', v: s }
      else i++
    }
  }
}

// Decode and concatenate the page's content stream(s) to a string.
// Use TextDecoder (works in the browser AND Node) instead of Buffer, which is
// Node-only — under Vite, `Buffer` is undefined and extractOutlines would throw,
// silently dropping every style to rectangle clipping. latin1 maps each byte
// 1:1 to U+0000–U+00FF, which is what the path tokenizer expects.
function pageContent(doc, page) {
  const contents = page.node.Contents()
  if (!contents) return ''
  const streams = contents instanceof PDFRawStream ? [contents] : contents.asArray().map((r) => doc.context.lookup(r))
  const latin1 = new TextDecoder('latin1')
  return streams
    .map((s) => (s instanceof PDFRawStream ? latin1.decode(decodePDFRawStream(s).decode()) : ''))
    .join('\n')
}

const PAINT = new Set(['f', 'F', 'f*', 'b', 'b*', 'B', 'B*', 's', 'S', 'n'])

// Returns [{ bbox:{x,y,w,h}, subpaths:[[{op:'m'|'l'|'c', pts:[…]}, …], …] }] in
// PDF points (the page's user space), page 0. Curves are kept as cubic beziers.
// We capture BOTH painted paths and clip paths (W/W* n): production templates
// commonly define each piece as a raster image clipped to its true cut outline,
// so the piece geometry lives in the clip path, not a painted fill. Spurious
// clips are harmless — the engine matches outlines to mapped boxes by IoU and
// ignores anything that doesn't line up with a piece (and full-page clips are
// filtered below).
export async function extractOutlines(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPage(0)
  const mb = page.getMediaBox()
  const pageW = mb.width
  const pageH = mb.height
  const text = pageContent(doc, page)

  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  let args = []
  let sub = null // current subpath (local coords): { segs, closed }
  let subpaths = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let clipPending = false
  const results = []

  const flush = () => {
    if (sub) subpaths.push(sub)
    if (subpaths.length) {
      // Transform local subpaths into page space and collect a bbox.
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const out = subpaths.map((sp) =>
        sp.segs.map((seg) => {
          const pts = []
          for (let k = 0; k < seg.pts.length; k += 2) {
            const [px, py] = applyPt(ctm, seg.pts[k], seg.pts[k + 1])
            pts.push(px, py)
            if (px < minX) minX = px
            if (py < minY) minY = py
            if (px > maxX) maxX = px
            if (py > maxY) maxY = py
          }
          return { op: seg.op, pts }
        }),
      )
      const w = maxX - minX
      const h = maxY - minY
      const fullPage = w >= pageW * FULL_PAGE_RATIO && h >= pageH * FULL_PAGE_RATIO
      if (w >= 2 && h >= 2 && !fullPage) {
        results.push({ bbox: { x: minX, y: minY, w, h }, subpaths: out })
      }
    }
    subpaths = []
    sub = null
    clipPending = false
  }

  const startSub = (x, y) => {
    if (sub) subpaths.push(sub)
    sub = { segs: [{ op: 'm', pts: [x, y] }], closed: false }
    startX = x
    startY = y
    cx = x
    cy = y
  }

  for (const tok of tokenize(text)) {
    if (tok.t === 'num') {
      args.push(tok.v)
      continue
    }
    if (tok.t === 'name') {
      args = []
      continue
    }
    const op = tok.v
    const a = args
    switch (op) {
      case 'q':
        stack.push(ctm.slice())
        break
      case 'Q':
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0]
        break
      case 'cm':
        if (a.length >= 6) ctm = matMul(ctm, a.slice(-6))
        break
      case 'm':
        if (a.length >= 2) startSub(a[a.length - 2], a[a.length - 1])
        break
      case 'l':
        if (sub && a.length >= 2) {
          const x = a[a.length - 2]
          const y = a[a.length - 1]
          sub.segs.push({ op: 'l', pts: [x, y] })
          cx = x
          cy = y
        }
        break
      case 'c':
        if (sub && a.length >= 6) {
          const p = a.slice(-6)
          sub.segs.push({ op: 'c', pts: p })
          cx = p[4]
          cy = p[5]
        }
        break
      case 'v':
        if (sub && a.length >= 4) {
          const p = a.slice(-4) // x2 y2 x3 y3; first control = current point
          sub.segs.push({ op: 'c', pts: [cx, cy, p[0], p[1], p[2], p[3]] })
          cx = p[2]
          cy = p[3]
        }
        break
      case 'y':
        if (sub && a.length >= 4) {
          const p = a.slice(-4) // x1 y1 x3 y3; second control = end point
          sub.segs.push({ op: 'c', pts: [p[0], p[1], p[2], p[3], p[2], p[3]] })
          cx = p[2]
          cy = p[3]
        }
        break
      case 're':
        if (a.length >= 4) {
          const [x, y, w, h] = a.slice(-4)
          startSub(x, y)
          sub.segs.push({ op: 'l', pts: [x + w, y] })
          sub.segs.push({ op: 'l', pts: [x + w, y + h] })
          sub.segs.push({ op: 'l', pts: [x, y + h] })
          sub.closed = true
          cx = x
          cy = y
        }
        break
      case 'h':
        if (sub) sub.closed = true
        break
      case 'W':
      case 'W*':
        clipPending = true
        break
      default:
        if (PAINT.has(op)) flush()
        break
    }
    args = []
  }
  flush() // in case the stream ended without a trailing paint op

  return results
}
