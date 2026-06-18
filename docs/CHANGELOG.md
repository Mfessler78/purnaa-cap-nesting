# Changelog

One line per change, newest first. See `ARCHITECTURE.md` for structure and
`CLAUDE.md` for how changes are made.

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
