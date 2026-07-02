# Changelog

One line per change, newest first. See `ARCHITECTURE.md` for structure.

- feat(sync,stage4): style creation/deletion now publishes to the sync root.
  `pdriveSync.js` gains `publishStyleWrite` (copy local → `current/`, park a
  versioned recovery copy in `backups/versions/`, then append the add|update event
  LAST so a crash can't leave `current/` changed with no event) and
  `publishStyleDelete` (park bytes in `backups/deleted/`, append the delete event,
  then remove `current/<style>`). `server/styles-api.js` calls these from POST and
  DELETE via a best-effort `syncPush` — the local save is always primary, so a
  disconnected P-drive never blocks saving; the response carries a `sync` status.
  MappingTool surfaces that status and drops the old "back up now?" prompt (saving
  now auto-shares); removed the now-unused `getBackupStatus`/`runBackup` imports.
  Verified: unit tests (add→update, delete, cross-machine A-publishes/B-retrieves)
  and a real `handle()` integration run (POST add/update, DELETE) against a scratch
  root, including the unreachable-folder warning. ARCHITECTURE §4 updated.

- feat(sync,stage3): rewrite Retrieve to replay + reconcile. `pdriveSync.js` gains
  `reconcile()` (add / update / skip-unchanged / delete-with-recoverable-warning
  against the replayed desired set; a style listed but absent from `current/` is
  skipped, not deleted) and `scripts/pdrive-retrieve.js` (reads the sync root from
  `data/backup.json`, prints a per-line progress log + summary). Both retrieve
  launchers are now thin wrappers over that one Node script — deleted
  `pdrive-update-styles.ps1`, so Mac and Windows run identical logic with no
  bash/PowerShell drift. This ends the merge-all-snapshots behavior that
  resurrected renamed/deleted styles and re-copied everything each run; unchanged
  styles are now skipped (the fast path). Retrieve is now styles-only — the fabric
  list travels via git (`data/fabrics.json`), no longer copied by retrieve.
  Verified via unit tests (add/update/skip/delete/rename-then-delete/missing) and a
  real CLI dry-run (10 local/11 desired + outlier → 1 added, 10 unchanged, 1
  removed+parked; re-run → all unchanged). ARCHITECTURE §3 updated. Not yet wired
  into creation (Stage 4). Still requires the one-time seed (Stage 2) + repointing
  `backup.json` to the new sync root before it goes live.

- feat(sync,stage2): one-time migration/seed. `pdriveSync.js` gains the
  append-only event layer — `writeEvent`/`readEvents` (unique-name, atomic,
  torn-file-tolerant), `replay` (fold add/update/delete by `at`, tie-break by
  filename → the desired set), and `seedFromLocal` (copy local styles into
  `current/`, one `add` event each, dated `backups/` snapshot). Idempotent: a
  re-run copies only changed styles, appends an event only when replay doesn't
  already match, snapshots only on change; never deletes or invents a style.
  Owner-run CLI `scripts/pdrive-migrate.js "<sync-root>"`. Verified against the
  master's real 11 styles: seed→11 adds/replay=11; re-run→0 added/11 unchanged.
  Still not wired into retrieve/creation. Tests extended in `tests/pdriveSync.test.js`.

- feat(sync,stage1): add `src/lib/pdriveSync.js` — shared Node foundations for the
  append-only P-drive style sync (replacing merge-all-snapshots). One
  implementation for both Mac and Windows launchers (no bash/PowerShell drift):
  `getComputerId` (stable per-machine id in `~/.purnaa-tools/computer-id`, minted
  once), `hashStyleFolder` (sha256 over sorted `relPath+NUL+bytes+NUL`, OS-order-
  independent; `updatedAt` participates so a real save = update, byte-identical
  folder = skip), and `ensureScaffold` (create-if-absent `events/current/backups`).
  Node-builtins only, no new dependency; not yet wired into retrieve/creation.
  Tests in `tests/pdriveSync.test.js`. New sync root will be a fresh sibling on the
  P-drive: `…/Printing/zPurnaa-Cap-Nesting-Sync/` (old `…-Program-Backup/` left as-is).

- fix(retrieve): "Retrieve New Styles from P Drive" now pulls EVERY style found
  across ALL `capnest-backup-*` snapshots (newest copy of each wins), instead of
  mirroring only the single newest snapshot and deleting anything not in it —
  which handed a fresh machine just the one or two styles the last machine
  happened to back up. It is now an additive merge (nothing local is deleted).
  Windows copies with `robocopy` (retries + size-verifies over the network) so a
  truncated PDF — seen in the app as "Invalid Root reference" — can't slip in.
  `.command`, `.ps1` (Mac uses `cp`); `.bat`/SETUP-CARD wording updated.
- fix(install,update): install/update now act on the app folder the launcher
  lives in (parent of `COMMAND CENTER/`), falling back to `~/purnaa-cap-nesting`
  only when launched from outside one. Stops the master Mac cloning/operating on
  a stray second copy; makes a moved folder self-consistent. install + update
  `.command`/`.bat`.
- fix(retrieve): "Retrieve New Styles from P Drive" reads `data/backup.json` from
  the launcher's own app copy (same derivation as start), not a hardcoded path,
  so it no longer reports "No backup folder is set yet" when the running app
  lives elsewhere. `.command`/`.bat` (`.ps1` inherits via the `.bat` pushd).
- perf(start): START stamps `dist/` with the git rev it was built from
  (`dist/.built-rev`) and skips `npm run build` when HEAD still matches, so the
  app opens instantly instead of rebuilding every launch. update moves HEAD →
  next start rebuilds; unknown state still builds. start.command + start.bat.
- fix(start): START now runs the app folder the launcher lives in (parent of
  `COMMAND CENTER/`), falling back to `~/purnaa-cap-nesting` only when launched
  from outside an app folder. Fixes the master Mac starting an empty
  `~/purnaa-cap-nesting` clone (no styles) instead of the working copy that holds
  the styles. End-user/installed behavior unchanged. start.command + start.bat.
- chore(scripts): consolidate every end-user launcher into a top-level
  `COMMAND CENTER/` folder (install / start / update / "Retrieve New Styles from
  P Drive" + SETUP-CARD). Deleted the superseded root duplicates (setup/START/
  UPDATE *.command/.bat/.ps1, backup.bat, Windows P-drive backup). The styles
  launcher was rewired to the new install model (~/purnaa-cap-nesting +
  ~/.purnaa-tools/node). Untracked CLAUDE.md and the Mac P-drive backup
  (owner-master-only); both stay on disk, gitignored. Docs updated to match.
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
