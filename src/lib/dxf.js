// Minimal DXF writer (U4). The laser cutter reads a DXF to know where to cut.
// We emit ONE sheet's cut contours as closed LWPOLYLINEs on a "CUT" layer, in
// MILLIMETRES, with a 1.5 mm line width (owner's reading of "1.5 mm cut lines"
// = stroke/lineweight, not an offset). Origin is the sheet's bottom-left with Y
// up — the same orientation as the PDF — so the DXF lines up with the print.
//
// Compatibility notes: ASCII DXF is intentionally simple. We write a small
// HEADER ($ACADVER AC1015 so LWPOLYLINE is valid, $INSUNITS 4 = millimetres),
// an empty TABLES-free body, and an ENTITIES section. Lineweight is group 370 in
// 1/100 mm (150 = 1.5 mm). Confirm the exact units/origin the laser software
// expects at install — this is the documented default, not a guess about their
// machine.
//
// `contours` is an array of point arrays: [ [[x,y],[x,y],...], ... ] in mm.

function pair(code, value) {
  return `${code}\n${value}\n`
}

export function buildDxf(contours, { layer = 'CUT', lineweight = 150 } = {}) {
  let s = ''
  // HEADER: drawing units = millimetres.
  s += pair(0, 'SECTION')
  s += pair(2, 'HEADER')
  s += pair(9, '$ACADVER') + pair(1, 'AC1015')
  s += pair(9, '$INSUNITS') + pair(70, 4) // 4 = millimetres
  s += pair(0, 'ENDSEC')

  // ENTITIES: one closed LWPOLYLINE per cut contour.
  s += pair(0, 'SECTION')
  s += pair(2, 'ENTITIES')
  for (const pts of contours) {
    if (!pts || pts.length < 2) continue
    s += pair(0, 'LWPOLYLINE')
    s += pair(8, layer)
    s += pair(370, lineweight) // line width: 1/100 mm (150 = 1.5 mm)
    s += pair(90, pts.length) // vertex count
    s += pair(70, 1) // 1 = closed
    for (const [x, y] of pts) {
      s += pair(10, x.toFixed(4))
      s += pair(20, y.toFixed(4))
    }
  }
  s += pair(0, 'ENDSEC')
  s += pair(0, 'EOF')
  return s
}
