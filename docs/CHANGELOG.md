# Changelog

One line per change, newest first. See `ARCHITECTURE.md` for structure and
`CLAUDE.md` for how changes are made.

- feat(verify): add detect-only color-profile & flatten advisories to the verify
  gate. New `checkArtworkColor` in `verifyArtwork.js` reads PDF structure only
  (pdf-lib) and emits operator-facing WARNINGS — never blocks, never edits
  artwork: (A) no/unsuitable embedded color profile → colors may shift in
  RasterLink (suggests assigning sRGB); (B) >1 page image → unflattened, slow to
  RIP (suggests Flatten Image). `RunScreen` runs it alongside the region check
  and merges its strings into `warnings`. `checkArtworkRegions` now lazy-imports
  its DOM-only deps (pdfRender/scanRegions) so the module is Node-testable.
  Fixtures + focused test added. No new dependency; export path untouched.

- fix(publish): "PUBLISH UPDATE (owner)" now also sends commits that were saved
  locally but never pushed. The old script only checked for *uncommitted* edits,
  so an already-committed-but-unpushed commit made it say "nothing to send" and
  exit without pushing — leaving GitHub (and every other machine's UPDATE)
  behind. Now it fetches, detects unpushed commits as well as uncommitted edits,
  only prompts/commits when there are new edits, and always pushes when anything
  is pending. Mac launcher only.

- fix(update-styles): "Update styles" now mirrors the latest P-drive backup
  instead of only overlaying it. It still adds new/renamed styles, but now also
  removes local style folders absent from that backup, so a machine ends up an
  exact match (no stale or duplicate folders from old renames/deletes). Each
  backup is already a full copy of the host, so the latest snapshot is the
  authoritative set. Touches the two import launchers only (`UPDATE STYLES FOR
  MAC.command`, `pdrive-update-styles.ps1`); no app/engine code. The confirmation
  dialog now warns that local styles not in the backup will be removed.

- refactor(engine): per-piece ID label is now smaller (4.5–8 pt, was 6–12 pt) and
  anchored to each piece's own bottom-left seam band — computed once per type in
  template space, left-justified 2 mm inside the widest interior run, and drawn
  rotated with the slot so it rides the same spot on every panel in any
  orientation (was always page-bottom/upright, centred). Crescent visors stay
  inside the outline via the interior-span scan. Reference-only; placement,
  rotation, clip, cut-line and export untouched. ARCHITECTURE.md now documents the
  label (previously omitted).

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

- chore(git): stop tracking styles/ (mapping JSON + PDFs) and the "AI files of
  PRENEST and TEMPLATES/" artwork folder; both are private and now gitignored.
  Only data/fabrics.json is shared via git; styles travel via P-drive backups.
  Working files kept on disk (git rm --cached). History not rewritten.
