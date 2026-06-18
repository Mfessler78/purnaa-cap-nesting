# Changelog

One line per change, newest first. See `ARCHITECTURE.md` for structure and
`CLAUDE.md` for how changes are made.

- fix(engine): normalize matched piece outlines with `dropOppositeWoundHoles` — a
  production-template cut outline drawn as a band (outer + opposite-wound inner
  edge) was clipping to an empty ring under PDF's nonzero rule, so placed artwork
  printed blank (DAD HAT OSFM PUR60203, Forest2 art: 14.3 MB file, no fill). Now
  the inner hole is dropped so the clip is the solid piece shape. No-op for clean
  single-contour outlines. Added regression tests.
