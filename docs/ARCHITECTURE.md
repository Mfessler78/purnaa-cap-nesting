# ARCHITECTURE.md — Purnaa Cap Nesting

> **What this file is.** The map of the codebase: what each part does, how data flows,
> what must never break, and where things are allowed to live. Read this *before* editing
> code so you can scope a change without grepping the whole tree. Keep it current — if a
> change moves/adds/removes a module or alters the flow or an invariant, update this file
> in the same change.
>
> Companion docs: `CLAUDE.md` (how to work), `SPEC.md` (full functional spec),
> `CLAUDE_CODE_LASER_VS_DIECUT.md` (cut-line export rule).
>
> Last updated: 2026-06-18. Update the date when you change this file.

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
  │  7. Stamp corner (STYLE | FABRIC | QTY) + apply fabric-stretch scale   │
  └───────────────────────────────────────────────────────────────────────┘
        │
        ▼
  VERIFY GATE (src/lib/verifyArtwork.js) — blocks export on missing/mismatched
        │                                   pieces or size mismatch
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
│   ├── BackupBar.jsx        # backup UI
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
│       └── api.js           #   client → server middleware calls
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
│   └── backup.json
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
├── CLAUDE.md                # operating rules (root, intentionally)
├── package.json  vite.config.js  index.html
└── (start/update/backup launcher scripts: *.command / *.bat / *.ps1)
```

---

## 4. Module responsibilities & dependencies

Use this to see the blast radius before editing.

| Module | Owns | Depends on | Depended on by |
|--------|------|------------|----------------|
| `src/lib/engine.js` | The fill pipeline (place, rotate, clip, stamp, scale, multi-sheet) | `pdf-lib`, `pdfGeometry`, `pdfPaths` | `RunScreen.jsx` |
| `src/lib/verifyArtwork.js` | Pre-export checks (presence, size match) | `pdfGeometry` | `RunScreen.jsx`, `engine.js` |
| `src/lib/pdfGeometry.js` | Box/transform/rotation math | — (leaf) | engine, verify, editors |
| `src/lib/pdfPaths.js` | Vector path extraction from PDFs | `pdfjs-dist` | engine, detectRegions |
| `src/lib/pdfRender.js` | Rasterize PDF pages for display | `pdfjs-dist` | `PdfViewer.jsx` |
| `src/lib/detectRegions.js` | Auto-detect closed-path slots | `pdfPaths`, `scanRegions` | `MappingTool.jsx` |
| `src/lib/scanRegions.js` | Region scan support | `pdfPaths` | `detectRegions` |
| `src/lib/dxf.js` | DXF / laser geometry | `pdfGeometry` | engine / laser path |
| `src/lib/api.js` | Talk to `server/` middleware | fetch | screens |
| `server/styles-api.js` | Persist styles/fabrics, optional gs flatten | `pdf-lib`, Ghostscript (shell) | `api.js` |

**Rule of thumb:** `pdfGeometry.js` is a leaf — safe-ish to optimize internally but
widely depended on, so its behavior must not change. `engine.js` is the highest-risk file
(it owns the proven RasterLink output); touch it with the most care and always test export.

---

## 5. Invariants (correctness — do not break without spec-level sign-off)

These mirror `CLAUDE.md §2` and are the reason the output is correct. Full rationale in
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
6. **Cut lines preserved in export; other guides reference-only.** Laser follows the cut
   line, die-cut ignores it; stitch lines/text/fills are stripped from output.
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
  `CLAUDE.md` and config only.
- **Possible duplicate prenest source:** `AI files of PRENEST and TEMPLATES/60203-DADHAT/`
  contains both `DADHAT(OSFM)_PRENEST.ai` and `pur60203-DADHAT(OSFM)_PRENEST.ai`. Confirm
  which is canonical; remove the stale one.
- **Inconsistent style-folder naming:** `styles/MIDPRO5PANEL-PUR5610101/` looks like a
  typo of `PUR560101` (used everywhere else). Renaming a style folder is a structural
  change — confirm it isn't referenced by a stored map before touching.
- **`style.json` filename drift inside styles:** e.g. `template_v1.pdf` /
  `prenest_laser.pdf` in the 5-panel folder vs. plain `template.pdf` / `prenest.pdf`
  elsewhere. Confirm the engine's expected names and standardize.
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
