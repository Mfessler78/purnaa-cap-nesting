// Minimal but VALID DXF writer (U4). The laser cutter reads this to know where
// to cut. We emit one sheet's cut contours as closed POLYLINEs on a "CUT" layer,
// in MILLIMETRES, with a 1.5 mm line width (owner's reading of "1.5 mm cut
// lines"). Origin is the sheet's bottom-left, Y up — same as the PDF.
//
// Why R12 (AC1009): the first cut used a bare LWPOLYLINE/HEADER-only file, which
// AutoCAD's strict importer rejected ("invalid file"). R12 is the most widely
// accepted DXF flavour and needs no entity handles or OBJECTS section. We still
// write the four real sections AutoCAD expects — HEADER, TABLES (LTYPE + LAYER,
// so the CUT layer is defined), an empty BLOCKS, and ENTITIES — plus EOF.
//
// Old-style POLYLINE (not LWPOLYLINE) is used because it is valid in R12 and
// carries a constant width (group 40/41) for the 1.5 mm line. Confirm the units
// and the line treatment in the laser software at install.
//
// `contours` is an array of point arrays: [ [[x,y],[x,y],...], ... ] in mm.

function pair(code, value) {
  return `${code}\n${value}\n`
}

export function buildDxf(contours, { layer = 'CUT', widthMm = 1.5 } = {}) {
  let s = ''

  // HEADER — declare the version and millimetre units.
  s += pair(0, 'SECTION') + pair(2, 'HEADER')
  s += pair(9, '$ACADVER') + pair(1, 'AC1009')
  s += pair(9, '$INSUNITS') + pair(70, 4) // 4 = millimetres
  s += pair(0, 'ENDSEC')

  // TABLES — a Continuous linetype and the layers (0 and CUT) the entities use.
  s += pair(0, 'SECTION') + pair(2, 'TABLES')
  s += pair(0, 'TABLE') + pair(2, 'LTYPE') + pair(70, 1)
  s += pair(0, 'LTYPE') + pair(2, 'CONTINUOUS') + pair(70, 0) + pair(3, 'Solid line') + pair(72, 65) + pair(73, 0) + pair(40, '0.0')
  s += pair(0, 'ENDTAB')
  s += pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, 2)
  s += pair(0, 'LAYER') + pair(2, '0') + pair(70, 0) + pair(62, 7) + pair(6, 'CONTINUOUS')
  s += pair(0, 'LAYER') + pair(2, layer) + pair(70, 0) + pair(62, 1) + pair(6, 'CONTINUOUS') // CUT = red
  s += pair(0, 'ENDTAB')
  s += pair(0, 'ENDSEC')

  // BLOCKS — empty but present (AutoCAD expects the section).
  s += pair(0, 'SECTION') + pair(2, 'BLOCKS') + pair(0, 'ENDSEC')

  // ENTITIES — one closed POLYLINE per cut contour, 1.5 mm wide.
  s += pair(0, 'SECTION') + pair(2, 'ENTITIES')
  for (const pts of contours) {
    if (!pts || pts.length < 2) continue
    s += pair(0, 'POLYLINE') + pair(8, layer)
    s += pair(66, 1) // vertices follow
    s += pair(70, 1) // 1 = closed
    s += pair(40, widthMm) + pair(41, widthMm) // constant line width
    for (const [x, y] of pts) {
      s += pair(0, 'VERTEX') + pair(8, layer)
      s += pair(10, x.toFixed(4)) + pair(20, y.toFixed(4))
    }
    s += pair(0, 'SEQEND') + pair(8, layer)
  }
  s += pair(0, 'ENDSEC')

  s += pair(0, 'EOF')
  return s
}
