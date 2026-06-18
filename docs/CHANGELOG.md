# Changelog

One line per change, newest first. See `ARCHITECTURE.md` for structure and
`CLAUDE.md` for how changes are made.

- fix(viewer): polyfill `Promise.withResolvers` for older browsers (Chrome/Edge
  <119, Firefox <121). pdf.js v6 calls it 27x during PDF render; without it the
  preview silently fails (the viewer swallows render errors) on older machines
  while the rest of the app works. No-op on modern browsers (Mac unchanged).
  Most-likely fix for Santosh's blank preview on an older PC; revertible if it's
  not the cause. (FIX 3 follow-up)
- fix(run): Windows preview no longer collapses to 0 height on short/scaled
  (125-150%) windows — the flex:1 preview was the only grow/shrink child of
  `.run-screen`, so it shrank to nothing with no page scroll to reveal it. Give
  the Run Screen preview a 360px floor and let `.run-screen` scroll. Mac unchanged
  (flex:1 still fills surplus height). (FIX 3)
- feat(run): after a fill, show the final output sheet size in inches AND mm,
  read off the generated PDF's page box (not recomputed from inputs) so it
  matches the file sent to RasterLink. Shown near the export button. (FIX 2)
- fix(engine): die-cut runs no longer print the black piece cut line — gated on
  `cutMode === 'die'` (laser and null unchanged). RunScreen hides the "Cut line
  (mm)" field in die mode and shows a verification line for the outcome. Updates
  ARCHITECTURE.md §5 #6. (FIX 1)
- fix(engine): emit the print PDF as version 1.4 with a classic xref table for
  RasterLink — save with `useObjectStreams:false` (pdf-lib's default writes a 1.5
  xref/object stream) and patch the hard-coded `%PDF-1.7` header to `%PDF-1.4`
  (`toPdf14`). All emitted features are ≤1.4, so the label is honest; the GS
  flatten fallback (targets 1.3) is unchanged. Output is byte-for-content identical
  (size 13.3→13.35 MB).
- fix(engine): normalize matched piece outlines with `dropOppositeWoundHoles` — a
  production-template cut outline drawn as a band (outer + opposite-wound inner
  edge) was clipping to an empty ring under PDF's nonzero rule, so placed artwork
  printed blank (DAD HAT OSFM PUR60203, Forest2 art: 14.3 MB file, no fill). Now
  the inner hole is dropped so the clip is the solid piece shape. No-op for clean
  single-contour outlines. Added regression tests.
