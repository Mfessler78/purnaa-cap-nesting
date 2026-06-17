# Cleanup & Audit — Phase 1 Findings (read-only)

> Produced per `CLAUDE_CODE_CLEANUP_AUDIT.md`. This is the **read-and-report** deliverable.
> **No code, docs, styles, or files were changed to produce it.** Nothing happens next until the
> owner approves which cleanups to do (Phase 3).
>
> Date: 2026-06-16. Health checks run: full test suite **16/16 pass**; production build **succeeds**;
> bundled Node (`node/`) present and working.

---

## 1. Protected feature list (everything that must still work after cleanup)

Confirmed reachable in the UI / wired end to end. Phase 3 must leave **every** item working.

**Mapping Tool** (`MappingTool.jsx`, `PdfBoxEditor.jsx`)
- Upload + render pre-nest PDF and customer template PDF (page 1).
- Draw rectangular boxes; move and resize via 8 handles.
- Auto-detect regions (M6) for both pre-nest and template — "Add all detected", click one outline to add, Clear; skips already-placed regions.
- Multi-select: Draw|Select mode toggle, rubber-band lasso, shift-click toggle.
- Bulk naming with auto-numbering 1..N in reading order (M9).
- Bulk rotation: set 0/90/180/270, and "+180° to all" (M9). Rotation stays per-slot.
- Per-slot editing table: piece_type, instance, rotation, delete.
- Duplicate `piece#instance` highlighting (red in list + on canvas).
- Map-time outline check per template piece: ✓ (clips to true shape) / `rect ⚠` (rectangle only).
- Load existing style for editing; Delete style behind a named confirmation (M10); Save style (atomic write) with a backup prompt offered right after creating a **new** style.
- Zoom / Fit / zoom-label.

**Run Screen** (`RunScreen.jsx`, `engine.js`, `verifyArtwork.js`, `scanRegions.js`, `PdfViewer.jsx`)
- Select style, fabric, quantity; upload artwork.
- Clip-to-outline toggle; bleed (in) input; cut-line width (mm) input.
- Fill engine: match by piece_type, per-slot rotation, replicate one source per type, quantity→whole sheets, outline clip + outward bleed, rectangle fallback + overlap "swallow" guard (M8), **black cut line per piece (laser, preserved in export)**, corner `STYLE | FABRIC | QTY` stamp, uniform fabric-stretch scale.
- Progress banner during long ops (M11).
- Verification panel: passed ✓ / blocking ✗ / warnings ⚠; missing-artwork detection; artboard-size-mismatch refusal; approval checkbox gating export.
- Preview viewer; multi-sheet "showing sheet 1 of N — all identical" caption.
- Export print PDF (direct pdf-lib vector — the default, RasterLink-proven).
- "Flatten with Ghostscript" fallback button (only shown when `gs` is present; long timeout, M12).

**Fabrics** (`FabricsScreen.jsx`) — edit name + stretch %, add/delete rows, save to `data/fabrics.json` (validated 50–200%).

**Backup bar** (`BackupBar.jsx`, M17) — "Last backed up" indicator, Back up now, Set/Change/Browse backup folder (native picker), silent weekly auto-check on open, post-new-style prompt. URL/relative-path rejection on folder config.

**Hosting / header / launchers** (M15, M15a)
- "Copy office link" button (runtime LAN-IP detection, clipboard with textarea fallback).
- Standalone LAN server (`server/serve.js`) serving built `dist/` + the same API handlers as dev.
- Double-click launchers + first-time setup that downloads a private `node/` (Win + Mac), plus `backup.bat` / `npm run backup` CLI backup.

---

## 2. Per-style health table (M7/M8 evidence)

Only **one** style currently exists on disk.

| Style | Loads OK? | Outlines | Box overlaps | Missing files | Notes |
|---|---|---|---|---|---|
| `PURTEST-ISSUEFINDING` | ✅ (test 14) | 7/7 painted outlines read; clean fill clips **7/7 with zero rectangle fallback** (test "a clean fill clips every piece to its outline") | Box-level overlap exists between nested brim pieces (visorTop/visorBottom etc.) — **this is normal**; the true-outline clip resolves it, so no swallow occurs | None — `style.json`, `prenest.pdf`, `template.pdf` all present | Healthy. Matches the M7 finding in memory: overlap is box-level only; outline clip already fixes it. |

**Data-integrity flag (needs an owner decision — do NOT auto-fix):**
- The production style **`PUR560104` has been deleted from the working tree** (git still tracks `styles/PUR560104/{style.json,prenest.pdf,template.pdf}` as deleted `D`). On disk, only `PURTEST-ISSUEFINDING` remains. The production *template* PDF still lives in `test-files/PUR560104-MIDPRO(OSFM)-SKATE-PatternLayoutTemplate.pdf` (used by `pdfPaths.test.js`). Please confirm whether removing `PUR560104` was intentional before the Phase 4 full-program backup snapshots the current state.

---

## 3. Cleanup candidates (grouped — each behavior-preserving; nothing done yet)

### 3a. Dead code / scaffolding / scratch
- **`.DS_Store` files** at repo root, `styles/`, `test-files/`. Already in `.gitignore`; just OS cruft on disk. *Action:* delete from disk. *Risk:* none.
- **`test-files/` scratch PDFs.** Several look like hand-made scratch inputs with inconsistent names: `prenest=template-skate-2.pdf`, `prenest_skate2.pdf`, `prenest-skate3-diecut.pdf`, `template_skate2.pdf`. **Two are real test fixtures** referenced by the suite — `Ambler_104_OSFM_Skate_5_Panel_Ucluelet_Aquarium_BLACK.pdf` (engine tests) and `PUR560104-MIDPRO(OSFM)-SKATE-PatternLayoutTemplate.pdf` (pdfPaths test). *Action:* with owner sign-off, move the scratch ones to a `dev/` or `archive/` area and keep the two fixtures (ideally under a clearly-named `test-files/fixtures/`, updating the two test paths). *Risk:* low (must update test paths if fixtures move).
- No stray `console.log` debugging in `src/`. The `console.*` lines in `server/serve.js` are the intentional startup banner — keep.

### 3b. Duplicated logic (unify without behavior change)
- **`matMul` + `applyPt` (PDF matrix math)** are defined identically in `src/lib/detectRegions.js` and `src/lib/pdfPaths.js`. *Action:* extract to a tiny shared `pdfMatrix.js`. *Risk:* low; covered by `pdfPaths.test.js` + manual auto-detect check.
- **Full-page-rectangle filter (`>= 0.95` of page)** duplicated in `detectRegions.js` and `pdfPaths.js`. Same constant, two copies.
- **IoU box-overlap** implemented twice: `iou` in `engine.js` and `iouBox` in `MappingTool.jsx`, plus the **match threshold `0.2`** (engine `bestIoU >= 0.2` vs UI `OUTLINE_IOU = 0.2`). These must stay in lockstep so the map-time ✓/`rect ⚠` preview matches what the fill actually does — today that's maintained by hand. *Action:* share the function + constant. *Risk:* low but **valuable** (prevents preview/engine drift).
- **`map()` + `pushPoly()` helpers** are duplicated between `clipOpsFor` and `cutLineOpsFor` inside `engine.js`. *Action:* one shared local helper. *Risk:* very low.
- **Two backup implementations:** `scripts/backup.js` (CLI → `./backups/`, via `backup.bat`/`npm run backup`) and `performBackup()` in `server/styles-api.js` (in-app → configured P-drive, dated, M17). They share `stamp()` and `SRC_DIRS = ['styles','data']` logic. **Both are intentional and documented** (`HOW_TO_START.md` calls the CLI "a terminal alternative"). *Action:* optional — keep both, but the stamp/source-list could share one helper. *Risk:* low; lowest priority.

### 3c. Two PDF-path readers (note, not necessarily a cut)
- `detectRegions.js` (walks the **pdf.js operator list** for bounding boxes → the auto-detect UI) and `pdfPaths.js` (parses the **raw content stream** for true outlines → clip geometry). Different purposes, both used, both correct. Not dead. Noted because they share the matrix helpers in 3b and a newcomer should know why there are two.

### 3d. File-structure & naming
- **No `/docs` home.** Eight `.md` files sit at the repo root mixing operator guides, planning docs, and spec. *Proposal:* create `/docs` with a short index README (Phase 3).
- **Launchers are at top level (good) but not named per the owner instruction.** The audit plan (§2c) asks for `START FOR WINDOWS` and `START FOR MAC`. Today they are `start.bat` / `start.command` (plus `setup.bat`/`setup.command`/`setup.ps1`, `backup.bat`). *Proposal:* rename the two start launchers as instructed — **but this needs a decision** because `HOW_TO_START.md` and the in-launcher popups reference `start.bat`/`setup.bat` by name, and those references must be updated in the same step. (See the question at the end.)

### 3e. Doc consolidation (this is the biggest area)
All M7–M17 work is **built and committed** (git log + memory), so the planning docs now describe finished work.

| Doc | What it is | Recommendation |
|---|---|---|
| `CLAUDE_CODE_UPDATE_PLAN.md` | Original M7–M17 plan | **Superseded by PLAN2** (PLAN2 has the "DESIGN IS DECIDED" hosting block; PLAN still says "confirm with owner"). Fold any unique reasoning into the new origin doc, then **archive**. |
| `CLAUDE_CODE_UPDATE_PLAN2.md` | Revised M7–M17 plan, hosting design locked | Work is done. Fold rationale into origin doc, then **archive** (bucket 2/3). |
| `STATUS_AND_ISSUES.md` | Briefing + open-issues discussion menu | Most open issues (§7 A–D) are addressed. Fold into origin doc, then archive — or keep as historical briefing. Owner picks. |
| `CLAUDE_CODE_LASER_VS_DIECUT.md` | The intentional cut-line reversal | **Keep & move to `/docs`** (protected; §2f). |
| `CLAUDE_CODE_CLEANUP_AUDIT.md` | This cleanup plan | Keep & move to `/docs` (it's the cleanup record). |
| `HOW_TO_START.md` | Hosting/start on the office host | **Keep as the one hosting/setup doc** → `/docs`. |
| `OPERATOR_GUIDE.md` | Condensed daily run | Overlaps `WORKFLOW.md` Stages 5–6. **Decide: merge into WORKFLOW, or keep as the short version.** (See question.) |
| `WORKFLOW.md` | Full start-to-finish (incl. Illustrator) | **Keep as the one operator workflow doc** → `/docs`. |
| `SPEC.md`, `CLAUDE.md` | Spec + operating rules | Keep (CLAUDE.md typically stays at root for the assistant). |

**Missing deliverables the cleanup itself requires:**
- **Origin / "how this was made" doc (§2e-ii) does NOT exist yet — must be created** (two-Claude workflow, build philosophy, milestone history, what was hard/reversed: export dedup 37→5.5 MB, the gs timeout reality, the laser line-preservation reversal).
- A single **break-glass "if it's broken" sheet** is still an owner TODO (listed in both update plans); not present.

### 3f. Clunky seams (work individually, interact roughly)
- **Fill runs the engine twice** per click (`guides:true` for preview, `guides:false` for export bytes). Intentional (preview vs stripped export), but it is double work on large artwork. Note only — not a behavior change to make here.
- **Map-time preview re-derives the engine's outline match** (`iouBox`/`OUTLINE_IOU` mirroring engine `iou`/`0.2`). Smoothing this is the 3b IoU unification — the one cleanup that removes a real drift risk.

---

## 4. Half-built / unreachable
- None found. `autoBackup` (weekly check) is wired into `BackupBar`; the CLI backup is reachable via `backup.bat`/npm; all toggles and buttons are reachable. Nothing orphaned.

---

## 5. Intentional changes to PRESERVE (do not "clean" back) — §2f
- **Black cut-line preservation in every export** (`cutLineOpsFor`, `cutLines` defaults true, guarded by the engine test "export draws a black cut line per slot"). This is the approved laser reversal — must stay.

---

## 6. Recommended safe execution order for Phase 3 (after approval)
1. **Delete OS cruft** (`.DS_Store`). Re-verify build/tests. *(zero risk)*
2. **Docs:** create `/docs`, write the **origin doc**, consolidate guides per the table, move keep-docs in, archive superseded plans into `/docs/archive` (or `archive/`). No code touched.
3. **Rename launchers** to `START FOR WINDOWS` / `START FOR MAC` (if approved) and update every reference (`HOW_TO_START.md`, launcher popups, any doc). Re-verify the launchers still run.
4. **Unify duplicated logic**, smallest first: `map`/`pushPoly` in engine → matrix helpers → IoU + threshold + full-page filter. Prove identical with the test suite after each.
5. *(Optional, last)* share the two backups' `stamp`/source-list helper.
6. **Re-verify after every category:** `node --test tests/*.test.js`, a build, and a manual pass of the happy path + mapping path.
7. **Phase 4:** confirm the configured backup path is reachable, then write a verified, dated **full-program** snapshot and report its location/size. (Current configured path in `data/backup.json`: `/Volumes/Purnaa/Printing/zPurnaa-Cap-Nesting-Program-Backup/` — must be confirmed mounted before copying.)

---

## 7. Owner decisions needed before Phase 3
1. Approve the cleanup categories in §3 (all, or a subset).
2. Rename `start.*` → `START FOR WINDOWS` / `START FOR MAC` and update references? (yes/no)
3. `OPERATOR_GUIDE.md` — merge into `WORKFLOW.md`, or keep as the condensed daily version?
4. Confirm the `PUR560104` style deletion (§2) was intentional.

**Stopping here for approval. No changes will be made until you say go.**
