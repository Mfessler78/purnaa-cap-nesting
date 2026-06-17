# Purnaa Cap Nesting — Project Briefing & Open Issues

> **ARCHIVED (2026-06-16).** Historical briefing/discussion doc. Its open issues
> (§7 A–D) have been addressed (hosting, Ghostscript fallback, clip fallback guard,
> labeling helpers). Its reasoning is folded into `../ORIGIN.md`. Kept for history.

> **Purpose of this document.** This is a self-contained briefing meant to be pasted into a
> separate Claude chat (one that does **not** have access to the codebase) so we can talk through
> problems and possible solutions. The goal is to think out loud here, then hand a *polished,
> structured plan* back to the coding assistant (Claude Code) so it can implement in an orderly
> way. Nothing here is a command to build — it's context + a discussion menu.
>
> Last updated: 2026-06-15.

---

## 1. What this app is

**Purnaa Cap Nesting** is a small, local, single-user web app used in cap (hat) manufacturing.
It takes a customer's approved artwork and "fills" it into a pre-made print layout so the sheet can
be printed and the cap panels cut out.

- Runs entirely on **one Mac, in a browser**. No cloud, no accounts, no login, no deployment.
- Local file storage only (JSON + PDFs on disk).
- Two human roles it's built around: **Mila** aligns/approves the artwork; **Santosh** runs the
  print and approves the final output.

### The core idea
A **pre-nest** is a print sheet that already has empty "slots" arranged efficiently (a sheet's
worth of cap panels — normally 12 caps' worth). A **template** defines each cap **piece** (front,
side, visor, etc.) in its correct upright orientation. The customer's **artwork** is drawn on top
of that template artboard. The app:

1. Reads where each piece's artwork lives on the template.
2. Reads where every slot is on the pre-nest sheet, and what rotation each slot needs.
3. Copies the right piece of artwork into every matching slot, rotated correctly.
4. Stamps metadata in the corner and applies a fabric-stretch scale.
5. Exports a print-ready PDF that the RIP (RasterLink) opens and prints.

---

## 2. How it works (stack & architecture)

- **Frontend:** React 18 + Vite 6, plain JSX. One command to run: `npm run dev`.
- **"Backend":** a tiny Vite dev-server middleware plugin (`server/styles-api.js`) that handles
  reading/writing style maps, the fabric table, and the optional Ghostscript export step. There is
  **no separate server process** — it lives inside `npm run dev`.
- **PDF reading/measuring:** `pdfjs-dist` (Mozilla's pdf.js).
- **PDF composition/writing:** `pdf-lib`.
- **Optional flatten step:** **Ghostscript** (`gs`) shelled out from the middleware.

### Data on disk
- `styles/<STYLE_NAME>/` — each style has `style.json` (the slot map + template piece boxes),
  `prenest.pdf`, and `template.pdf`.
- `data/fabrics.json` — the fabric stretch table (name → scale %).
- `test-files/` — real customer PDFs used for development.

### The processing pipeline (what "Fill layout" does)
1. **Match by label.** Slots and template pieces are matched by `piece_type` *name* (exact,
   trimmed, case-sensitive) — never by absolute coordinates, because the template and pre-nest are
   different artboards / coordinate spaces.
2. **No scaling, ever.** The customer artwork and the template piece must be the *identical physical
   size*. If the artwork page size doesn't match the template page size, the app **refuses and
   flags** — it never resizes to fit. The *only* scaling in the whole pipeline is the global
   fabric-stretch factor, applied uniformly at the very end.
3. **Per-slot rotation.** Each slot stores its own rotation (0/90/180/270). Rotation is read from
   the map, never inferred from the piece type (two pieces of the same type can be rotated
   differently).
4. **Clip to the piece shape.** Artwork is trimmed to each piece's true outline (not just a
   rectangle) so neighboring pieces' artwork doesn't bleed in. A tunable **bleed margin**
   (default 0.25") grows the clip outward so a piece keeps its own intended print bleed.
5. **Quantity → whole sheets.** One pre-nest sheet = 12 caps. An order is rounded **up** to the
   next whole sheet and emitted as multiple identical pages (e.g. 50 caps → 60 → 5 sheets).
6. **Stamp + fabric scale.** A corner stamp (`STYLE | FABRIC | QTY`) and the fabric stretch % are
   applied to each sheet.
7. **Verify, then export.** A verification panel must pass (artwork present for every piece, sizes
   match, etc.) before export is allowed.

---

## 3. Hard constraints (these cannot be broken without explicit owner sign-off)

These come from the project's operating rules and are the guardrails any proposed solution must
respect:

- **No auto-scaling / no scale-to-fit.** Size mismatch = refuse + flag, never silently resize.
- **No silent "fixing"** of artwork (no auto-rotate, no auto-correct). Refuse-and-flag instead.
- **Match by `piece_type` label**, never by absolute coordinates across files.
- **Rotation is per-slot, read from the map** — never inferred from piece type.
- **Black cut lines are PRESERVED in the exported output** (the laser follows them; die-cut ignores
  them) — intentional reversal, see `CLAUDE_CODE_LASER_VS_DIECUT.md`. **Other guides** (stitch lines,
  text, color fills) stay reference-only: ignored in logic and stripped from the export.
- **Inputs keep their vectors intact;** only the final export may be flattened.
- **Local only.** No cloud, no auth, no external services.

---

## 4. What's been built (all working & committed)

The MVP was built in a mandatory sequence (M0–M6), each milestone confirmed by the owner before the
next began. All of it is done:

- **M0 Skeleton** — Vite/React app, runs with `npm run dev`.
- **M1 Manual labeling tool** — upload a pre-nest PDF, draw boxes over slots, label each with
  piece type + instance + rotation; same for the template (piece type only). Saved as a style's
  JSON slot map.
- **M2 Fill + rotate + place** — fill artwork into slots by piece type, rotated per slot.
- **M3 Stamp + fabric scale** — corner metadata stamp + global fabric-stretch factor (editable
  fabric table).
- **M4 Preview + verification gate** — visual preview before export; export blocked on
  missing/mismatched pieces or size mismatch.
- **M5 Export** — RasterLink-compatible PDF. **Confirmed: the direct-vector export printed
  correctly in a real RasterLink test.**
- **M6 Auto-detect** — auto-detects closed paths in the pre-nest PDF as clickable slots (walks the
  pdf.js operator list, tracks the transform matrix, recovers each shape's bounding box). Manual
  box-drawing remains a permanent fallback. Labels are still applied manually.

### Post-MVP work also done & committed
- **Quantity model** → whole-sheet multiplication (50 → 60, emitted as 5 identical sheets).
- **Export simplified to two options:** *Direct vector* (default) and *Flatten transparency
  (Ghostscript)*.
- **Multi-select + bulk naming** in the mapping tool (lasso-select many outlines, name once,
  auto-number 1..N in reading order).
- **Duplicate-slot highlighting** — duplicate piece#instance entries flash red in the list and on
  canvas so they're easy to find and fix.
- **Outline clipping + tunable bleed margin** — trims artwork to each piece's true shape, grown
  outward by an adjustable bleed so a piece keeps its own print bleed (handles concave visor
  shapes correctly).
- **Embed dedup (just completed)** — see §5; cut the export file size dramatically.

---

## 5. Recently solved: export file size & the "Ghostscript failing" report

Worth understanding because it informs the open issues.

**Symptom:** the Ghostscript flatten export "failed" on a real die-cut style (Ambler), and the
filled PDF was ~37 MB.

**Findings:**
- The 37 MB was a **duplication bug.** The fill engine embedded the artwork page **once per piece
  type** (7 types here), and the PDF library copies *all* of a page's images into each embed. So
  ~6 MB of source images were stored ~6× = ~36 MB.
- **Fix (done):** embed the artwork page **once** and share that single copy across all 84
  placements, positioning each by transform and trimming with clip paths. Verified **pixel-identical**
  output. **Direct-vector export dropped 37 MB → 5.5 MB.**
- The "Ghostscript failing" was actually a **120-second timeout** killing gs, not a gs error. gs
  genuinely needs ~163 s for one sheet of this artwork. The dedup did **not** speed gs up.
- **Root cause of gs slowness:** the artwork's images carry **soft-mask (alpha) transparency**.
  Forcing PDF 1.3 makes gs composite every soft-masked image against the background at all 84
  placements — that's inherent, expensive work, and it also *re-encodes* the images (6 MB → 22 MB,
  with possible quality loss).

**Decision made by the owner:** lean on the **direct-vector export** (it's RasterLink-proven, keeps
embedded image quality untouched, and is now small). **Leave Ghostscript and its timeout exactly
as-is** as a rarely-used fallback. Flatten only matters for a RIP that mis-renders transparency,
which RasterLink doesn't for this art.

**Key mental model:** "Direct vs. flatten" is **not** "vector vs. raster." Both keep raster images
as raster. The real difference is **live transparency (direct) vs. baked-opaque transparency
(flatten).** For high-quality embedded images, *direct preserves them perfectly*; *flatten can
degrade them.* The only reason to flatten is RIP transparency compatibility.

---

## 6. Current state

A print operator can today: pick a style, pick a fabric, enter a quantity, upload approved artwork,
see a correct filled + rotated + clipped + stamped preview, and export a RasterLink-ready PDF. The
direct-vector export is the recommended path and is now compact.

There is **no active build task in progress.** The items below are for discussion.

---

## 7. Open issues & backlog (let's discuss priorities & approaches)

### A. Standalone / office hosting (owner-requested, deferred)
Right now the app only runs under `npm run dev` in a terminal. The owner wants it runnable on an
office computer **without anyone babysitting a server**, easy to start, and easy for a non-technical
person to troubleshoot.
- *Things to weigh:* auto-start on boot vs. a one-click launcher; keep it browser-based on the
  office machine vs. package as a desktop app; how other office machines reach it (LAN) vs. strictly
  one machine; a plain-language troubleshooting README; the "no cloud / local only" rule still
  applies.

### B. Ghostscript flatten timeout (intentionally left as-is)
Decided: not investing here now. It only surfaces if someone reaches for the flatten fallback on
big soft-mask artwork. *Discussion point:* is there a cheap UX improvement worth doing anyway —
e.g. a "this can take several minutes" note + a longer timeout — so the fallback at least never
errors when used? (Currently it would still error after 120 s.)

### C. Rectangle fallback in clipping
When a piece's box can't be confidently matched to a true outline, clipping falls back to a plain
rectangle. That can re-introduce the old cut-off / neighbor-bleed problem for that piece. *Discussion
point:* how often does this happen on real styles, and do we want a better fallback (e.g. use the
mapped box minus a margin, or warn more loudly / let the user hand-pick the outline)?

### D. Manual labeling is still the slow step
Auto-detect finds the slot shapes, but **labeling** (assigning piece type + instance + rotation) is
still manual, even with bulk-naming. *Discussion point:* is there a safe way to infer/assist labels
(e.g. by matching detected slot shapes to template piece shapes) without violating "no silent
magic"? This is the highest-effort area and the most error-prone if automated wrong.

---

## 8. Other things noticed (not yet requested — candidate improvements)

These are observations from working in the code; none are committed plans.

1. **No automated test suite.** Verification has been done with one-off Node scripts. A small set of
   regression tests (fill math, rotation anchors, clip geometry, size-mismatch refusal) would make
   future changes much safer — especially given how subtle the coordinate/rotation math is.

2. **Long operations have no progress feedback.** Fill and (especially) the gs flatten can run for
   many seconds with the UI just showing "Filling…". A progress indicator / time estimate would
   reduce "is it frozen?" confusion.

3. **File size could still grow on other artwork.** The dedup fixed the per-type duplication, but a
   customer file with many genuinely-distinct high-res images will still be large. An *opt-in*
   downsample (clearly labeled, off by default, never silent) could be offered for cases where the
   placed size is far smaller than the image's native resolution — but this trades quality, so it
   must be an explicit, informed choice.

4. **Bleed/clip is global, not per-piece.** The bleed margin is one number for the whole sheet.
   Some pieces might want more/less. Probably not worth per-piece control unless real prints show a
   need — flagging for discussion only.

5. **Error/edge messaging.** The refuse-and-flag messages are good, but a few failure modes (e.g.
   partial outline matches, missing template piece) could be explained in more operator-friendly
   language with a suggested next step.

6. **Recovery / undo in the mapping tool.** Labeling a full sheet is tedious; an accidental
   mis-click or wrong bulk-name has no undo. A simple undo or "revert this style to last save"
   could save time.

7. **Multi-sheet output is identical pages.** That's correct today (whole-sheet replication). If
   future styles ever need *different* art per sheet, the model would need rethinking — not a
   current need, just noting the assumption.

---

## 9. How to use this doc

Pick any issue in §7 or §8 (or raise a new one), and let's reason through the trade-offs *here* in
chat — keeping the §3 hard constraints in mind. When we land on a direction, summarize it as a clear,
ordered plan (what, why, in what sequence, what to test) that can be handed back to the coding
assistant. The coding assistant works **one milestone at a time and waits for confirmation**, so a
plan that's broken into verifiable steps fits its workflow best.
