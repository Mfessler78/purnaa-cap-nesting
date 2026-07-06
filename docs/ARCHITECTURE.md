# ARCHITECTURE.md — Purnaa Cap Nesting

> **What this file is.** The map of the codebase: what each part does, how data flows,
> what must never break, and where things are allowed to live. Read this *before* editing
> code so you can scope a change without grepping the whole tree. Keep it current — if a
> change moves/adds/removes a module or alters the flow or an invariant, update this file
> in the same change.
>
> Companion docs: `SPEC.md` (full functional spec),
> `CLAUDE_CODE_LASER_VS_DIECUT.md` (cut-line export rule).
>
> Last updated: 2026-07-06. Update the date when you change this file.

---

## 1. What the app is (one paragraph)

A local, single-user web app run with `npm run dev` on one Mac, in a browser. It takes a
customer's approved artwork and "fills" it into a pre-made print layout (a **pre-nest**: a
sheet with empty slots, normally 12 caps' worth), rotating and clipping each piece into
its slot, stamping metadata, applying a global fabric-stretch scale, and exporting a
print-ready PDF that RasterLink (the RIP) opens and prints. Two human roles: **Mila**
aligns/approves artwork; **Santosh** runs the print and approves output. No cloud, no
accounts, local files only.

---

## 2. The pipeline (data flow)

```
Style on disk (styles/<NAME>/)          Customer artwork PDF        Quantity
   style.json  prenest.pdf  template.pdf      (uploaded)            (entered)
        │              │          │                │                   │
        ▼              ▼          ▼                ▼                   ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │ FILL ENGINE  (src/lib/engine.js)                                       │
  │  1. Match slots ↔ template pieces by piece_type LABEL (never coords)   │
  │  2. Refuse if artwork page size ≠ template page size (no scale-to-fit) │
  │  3. Place artwork into each slot, rotated per-slot (from the map)      │
  │  4. Clip to each piece's true outline + tunable bleed margin           │
  │  5. Embed artwork ONCE, share across all placements (size control)     │
  │  6. Round qty UP to whole sheets (×12); emit N identical pages         │
  │  6b. Print a per-piece ID label inside each panel (cut-team reference) │
  │  7. Stamp corner (STYLE | FABRIC | QTY) + apply fabric-stretch scale   │
  └───────────────────────────────────────────────────────────────────────┘
        │
        ▼
  VERIFY GATE (src/lib/verifyArtwork.js) — blocks export on missing/mismatched
        │                                   pieces or size mismatch; also emits
        │                                   warn-only color-profile & flatten
        │                                   advisories (read-only, never blocks)
        ▼
  EXPORT
   • Direct vector (default, RasterLink-proven)  ← preferred path
   • Flatten transparency via Ghostscript (rare fallback, left as-is)
        │
        ▼
  Print-ready PDF  →  RasterLink (RIP)  →  Mimaki TS100-1600
```

The **only** scaling in the whole pipeline is the global fabric-stretch factor at the very
end. Everything else is 1:1.

**Per-piece ID label (step 6b, distinct from the corner stamp).** Separately from the
single `STYLE | FABRIC | QTY` corner stamp, `engine.js` prints each panel's `piece_type`
name *inside that panel* so the cut/sew team can tell pieces apart. Implementation lives in
`fillLayout` (the "Piece-ID labels (U5)" block) with helpers `bottomBands()` /
`interiorSpansAtY()`. It is computed once per piece-type in the piece's own (template)
coordinates: a bottom-edge interior-span scan picks the lowest band that fits the text
inside the *true outline* (so concave crescent visors keep it inside the shape, never in
the bounding-box void), the label is left-justified ~2 mm inside that run's real left edge,
and the text is **drawn rotated with the slot** so it rides on the same physical spot of
every panel regardless of orientation (orientation is irrelevant — pieces are moved around
after cutting). Font is small shrink-to-fit (~4.5–8 pt). The label is **reference-only**:
it sits inside the cut line in the seam band, is hidden once sewn, and never overlaps a
neighbour or the clip region (invariants §5.4/§5.6 preserved). It does not affect placement,
rotation, clipping, or the export path. Gated by the `pieceLabels` flag (default on).

---

## 3. Canonical file layout (where things live)

Only the parts that matter for working on the app are listed. `node/`, `node_modules/`,
and `dist/` are generated/vendored — out of scope, do not edit.

```
.
├── src/                     # APPLICATION SOURCE — most work happens here
│   ├── main.jsx             # React entry point
│   ├── App.jsx              # top-level app shell / routing between screens
│   ├── RunScreen.jsx        # Santosh's screen: pick style/fabric/qty, upload, preview, export
│   ├── MappingTool.jsx      # Mila's screen: label slots (piece_type + instance + rotation)
│   ├── FabricsScreen.jsx    # edit the fabric stretch table
│   ├── BackupBar.jsx        # sync-folder UI (points this machine at the P-drive
│   │                        #   sync root; saves auto-share — no manual backup)
│   ├── PdfViewer.jsx        # renders a PDF to canvas for viewing
│   ├── PdfBoxEditor.jsx     # draw/edit slot boxes over a rendered PDF
│   ├── index.css
│   └── lib/                 # CORE LOGIC ("back end" #1) — keep lean
│       ├── engine.js        #   THE fill engine: place + rotate + clip + stamp + scale
│       ├── verifyArtwork.js #   pre-export verification gate
│       ├── pdfGeometry.js   #   geometry helpers (boxes, transforms, rotation math)
│       ├── pdfPaths.js      #   extract/handle vector paths from PDFs
│       ├── pdfRender.js     #   render PDF pages (pdfjs-dist) for the viewer
│       ├── detectRegions.js #   auto-detect closed paths as candidate slots (M6)
│       ├── scanRegions.js   #   region scanning support for auto-detect
│       ├── dxf.js           #   DXF-related handling (laser path / geometry)
│       ├── api.js           #   client → server middleware calls
│       └── pdriveSync.js    #   P-drive style sync: computer-id, content hash,
│                            #   append-only events, replay, seed, reconcile
│                            #   (Node-only; shared by the retrieve CLI + server)
│
├── server/                  # "back end" #2: tiny Vite dev-server middleware. Keep minimal.
│   ├── styles-api.js        #   read/write style maps, fabric table, optional gs export
│   └── serve.js             #   serve glue
│
├── styles/                  # STYLE DATA (one folder per style)
│   └── <STYLE_NAME>/        #   style.json (slot map + template piece boxes)
│       ├── style.json       #   prenest.pdf, template.pdf
│       ├── prenest.pdf
│       └── template.pdf
│
├── data/
│   ├── fabrics.json         # fabric → stretch % table
│   └── backup.json          # host-local: { path } = the P-drive sync root
│
├── test-files/              # REAL customer/production PDFs, by style number (dev input)
│   ├── 60101/  60104/  60203/
│
├── tests/                   # TEST CODE + FIXTURES (not the same as test-files/)
│   ├── engine.test.js   pdfPaths.test.js   schema.test.js
│   └── fixtures/skate-style/   # self-contained style fixture for tests
│
├── dev/                     # scratch / experiments (e.g. dev/scratch-pdfs/)
│
├── docs/                    # DOCUMENTATION
│   ├── ARCHITECTURE.md      #   this file
│   ├── SPEC.md              #   full functional spec
│   ├── README.md            #   docs index
│   ├── HOW_TO_START.md   WORKFLOW.md   ORIGIN.md
│   ├── CLAUDE_CODE_LASER_VS_DIECUT.md   # the cut-line export rule
│   ├── CLAUDE_CODE_CLEANUP_AUDIT.md   CLEANUP_AUDIT_FINDINGS.md
│   └── archive/            #   superseded docs (old update plans, old STATUS_AND_ISSUES)
│
├── AI files of PRENEST and TEMPLATES/   # source .ai (Illustrator) originals, by style
│
├── COMMAND CENTER/          # ALL end-user launchers (install/start/update/retrieve styles)
│   ├── install.command   install.bat
│   ├── start.command     start.bat
│   ├── update.command    update.bat            # updates the PROGRAM from GitHub
│   ├── Retrieve New Styles from P Drive.command / .bat  # thin launchers →
│   │                        #   node scripts/pdrive-retrieve.js (event-log sync)
│   └── SETUP-CARD.md        #   the plain-language guide
│
├── scripts/                 # Node CLIs run by launchers / owner
│   ├── backup.js            #   (existing) npm run backup
│   ├── pdrive-migrate.js    #   owner-run ONCE: seed the fresh sync root (Stage 2)
│   └── pdrive-retrieve.js   #   the retrieve launchers' entry: replay + reconcile
├── package.json  vite.config.js  index.html
└── (owner-only, untracked: PUBLISH UPDATE (owner).command,
     BACKUP TO P DRIVE FOR MAC.command — master Mac only, never shipped)
```

---

## 4. Module responsibilities & dependencies

Use this to see the blast radius before editing.

| Module | Owns | Depends on | Depended on by |
|--------|------|------------|----------------|
| `src/lib/engine.js` | The fill pipeline (place, rotate, clip, stamp, scale, multi-sheet) | `pdf-lib`, `pdfGeometry`, `pdfPaths` | `RunScreen.jsx` |
| `src/lib/verifyArtwork.js` | Pre-export checks: region presence/size (blocking) + color-profile & flatten advisories (warn-only) | `pdf-lib`, `pdfRender`/`scanRegions` (lazy, DOM-only) | `RunScreen.jsx`, `engine.js` |
| `src/lib/pdfGeometry.js` | Box/transform/rotation math | — (leaf) | engine, verify, editors |
| `src/lib/pdfPaths.js` | Vector path extraction from PDFs | `pdfjs-dist` | engine, detectRegions |
| `src/lib/pdfRender.js` | Rasterize PDF pages for display | `pdfjs-dist` | `PdfViewer.jsx` |
| `src/lib/detectRegions.js` | Auto-detect closed-path slots | `pdfPaths`, `scanRegions` | `MappingTool.jsx` |
| `src/lib/scanRegions.js` | Region scan support | `pdfPaths` | `detectRegions` |
| `src/lib/dxf.js` | DXF / laser geometry | `pdfGeometry` | engine / laser path |
| `src/lib/api.js` | Talk to `server/` middleware | fetch | screens |
| `src/lib/pdriveSync.js` | P-drive style sync: computer-id, machine-level sync-root memory, content hash, append-only events, replay, seed, reconcile, publish (Node-only) | `node:fs/os/path/crypto` | `server/styles-api.js`, `scripts/pdrive-*.js` |
| `server/styles-api.js` | Persist styles/fabrics, optional gs flatten; on save/delete, publish the style to the P-drive sync root | `pdf-lib`, Ghostscript (shell), `pdriveSync` | `api.js` |

**Rule of thumb:** `pdfGeometry.js` is a leaf — safe-ish to optimize internally but
widely depended on, so its behavior must not change. `engine.js` is the highest-risk file
(it owns the proven RasterLink output); touch it with the most care and always test export.

**P-drive style sync (data, not program).** Styles are shared between office machines
through an **append-only event log** on the P drive, not by copying snapshots. The sync
root (the folder `data/backup.json`'s `path` points at) holds three subfolders: `events/`
(one tiny JSON file per add/update/delete — never overwritten, so machines can't clobber
each other), `current/` (the live style folders, the only sync source), and `backups/`
(dated + per-version + per-deletion recovery copies; **never** read as a sync source). The
"what should exist" set is *computed* by replaying events (sort by `at`, fold
add/update/delete). Saving or deleting a style (`server/styles-api.js`) publishes it to
`current/` and appends the event **last** (crash-safe); the retrieve launchers
(`scripts/pdrive-retrieve.js`) replay + reconcile the local machine to that set —
add/update/skip-unchanged/delete-with-recoverable-warning. The sync-root path is
remembered in **two places**: the app copy's git-ignored `data/backup.json` (primary)
and a **machine-level copy** at `~/.purnaa-tools/sync-root.json` (same dir as the
computer-id — survives re-clones, second app copies, and app updates; both written by
`pdriveSync.js`'s `read/writeSyncRootFile`). Retrieve resolves it in order: the
**running app** (`GET localhost:4173/api/backup`) → this copy's `data/backup.json` →
the machine-level file; whatever it resolves it writes back to both (self-heal), so a
retrieve run with the app closed, or from a fresh clone, still finds the folder the
operator set once in the browser. The server likewise adopts the machine-level value
when its own `backup.json` is empty. All one Node implementation
(`pdriveSync.js`) so Mac and Windows behave identically. Content identity is a `sha256`
over the sorted `relPath+bytes` of a style folder, so unchanged styles are skipped. This
is LAN file sync on the existing P-drive channel — **no cloud, no service** (invariant §10
intact). Local saves always succeed; if the P drive is unreachable the publish is skipped
and the UI warns the change isn't shared yet.

---

## 5. Invariants (correctness — do not break without spec-level sign-off)

These are the reason the output is correct. Full rationale in
`SPEC.md` / `CLAUDE_CODE_LASER_VS_DIECUT.md`.

1. **No scale-to-fit, ever.** Artwork and template piece must be identical physical size.
   Mismatch → refuse + flag. Only the global fabric-stretch factor scales, at export.
2. **Match by `piece_type` label**, never by absolute coordinates across files. Template
   and pre-nest are different artboards / coordinate spaces.
3. **Rotation is per-slot**, read from the saved map. Two pieces of the same type may be
   rotated differently. Never infer rotation from piece type.
4. **Clip to the true piece outline** (not a bounding rectangle) so neighbors don't bleed
   in; grow by the tunable bleed margin so each piece keeps its own print bleed.
5. **Embed artwork once, share across all placements.** This is the fix for the old ~6×
   file-size bug. Any fill/embed change must preserve it.
6. **Cut line printed for laser only; other guides reference-only.** The laser follows a
   black cut line printed around each piece, so laser exports keep it. Die-cut runs do
   **not** print it (the die cuts the shape; a printed line is just unwanted ink) — gated
   by `cutMode === 'die'` in `engine.js`. Stitch lines/text/fills are stripped from output.
7. **Inputs keep vectors intact; only the final export may be flattened.**
8. **Quantity rounds UP to whole sheets (×12).** 50 caps → 60 → 5 identical sheets.
9. **Direct-vector export is the proven path.** Ghostscript flatten is a rare fallback,
   intentionally frozen (its 120s timeout and ~163s gs runtime on big soft-mask art are
   known and accepted). Don't touch it unless asked.
10. **Local only.** No cloud, auth, accounts, or deployment.

---

## 6. Known cleanup targets (track, don't act without sign-off)

These are bloat/hygiene issues to resolve carefully during the optimization phase. Each
should be its own small, confirmed change. **Do not bulk-delete.**

- **`node/` is a committed Node.js runtime** (full openssl/v8 header trees, npm, etc.).
  This almost certainly should be git-ignored, not in the repo. Confirm with owner before
  removing from version control. Same question for `node_modules/` and `dist/`.
- **Duplicate update plans:** `CLAUDE_CODE_UPDATE_PLAN.md` exists at repo root *and* in
  `docs/archive/`. Root copy should move to `docs/` or `docs/archive/`. The root is for
  config and the `COMMAND CENTER/` launcher folder only.
- **Possible duplicate prenest source:** `AI files of PRENEST and TEMPLATES/60203-DADHAT/`
  contains both `DADHAT(OSFM)_PRENEST.ai` and `pur60203-DADHAT(OSFM)_PRENEST.ai`. Confirm
  which is canonical; remove the stale one.
- **Inconsistent style-folder naming:** `styles/MIDPRO5PANEL-PUR5610101/` looks like a
  typo of `PUR560101` (used everywhere else). Renaming a style folder is a structural
  change — confirm it isn't referenced by a stored map before touching.
- **`style.json` filename drift inside styles:** e.g. `template_v1.pdf` /
  `prenest_laser.pdf` in the 5-panel folder vs. plain `template.pdf` / `prenest.pdf`
  elsewhere. Confirm the engine's expected names and standardize.
- ~~**Launchers other than START still hardcode `~/purnaa-cap-nesting`.**~~
  Resolved: `install`, `update`, and "Retrieve New Styles from P Drive"
  (`.command`/`.bat`; the `.ps1` inherits via the `.bat` `pushd`) now use the
  same location-aware-with-fallback derivation as START — they act on the app
  folder the launcher lives in, falling back to `$HOME/purnaa-cap-nesting` only
  when launched from outside an app folder. Fixes the master-Mac stray-clone
  divergence and the "No backup folder is set yet" mismatch on Retrieve.
- ~~**No CHANGELOG.**~~ Resolved: `docs/CHANGELOG.md` exists (one line per change).
- **Sparse tests.** Only `engine.test.js`, `pdfPaths.test.js`, `schema.test.js` exist.
  As you optimize a module, add a focused regression test for the behavior you're
  protecting — especially fill math, rotation anchors, clip geometry, and size-mismatch
  refusal.

---

## 7. How to use this file when making a change

1. Find the module you're changing in §3/§4. Note its dependents (blast radius).
2. Check §5 — does the change risk any invariant? If yes, stop and ask.
3. Make the minimal edit, test against `test-files/` and `tests/`.
4. If you moved/added/removed a module or changed the flow or an invariant, update §2–§5
   here and bump the "Last updated" date.
5. If you resolved or discovered a hygiene issue, update §6.
