# Purnaa Cap Nesting — Update Plan for Claude Code

> **How to use this doc.** This is an ordered build plan. Work **one milestone at a time**
> (U1 → U7) and **stop for owner confirmation** after each before starting the next, exactly as
> with the original M0–M6 sequence. Do not jump ahead — later milestones assume earlier ones
> landed and were verified.
>
> **Scope guardrails.** The §3 hard constraints in `STATUS_AND_ISSUES.md` still hold and are NOT
> relaxed by anything here. In particular: no auto-scaling/scale-to-fit, no silent fixing, match by
> `piece_type` label, rotation per-slot, guides are reference-only, inputs keep vectors intact, and
> local-only (no cloud/auth). Where a change below touches these, it is called out explicitly.
>
> **Before you start — orient yourself, don't search the whole tree.** Read only these:
> - `server/styles-api.js` — the Vite middleware (style-map read/write, fabric table, gs export).
> - The fill engine module (the code that performs "Fill layout" — embed-once, per-slot rotation,
>   clip-to-outline, stamp, fabric scale). Locate it once by grepping for the stamp string
>   `STYLE | FABRIC | QTY` and the dedup/embed logic; note its path here and reuse it.
> - The mapping-tool component (M1/M6: upload pre-nest, draw/auto-detect slots, label
>   piece_type/instance/rotation; template piece-box labeling). Locate by grepping for the
>   auto-detect operator-list walk; note its path.
> - The main app screen (style picker, fabric picker, quantity input, artwork upload, preview,
>   export buttons).
> - `data/fabrics.json` and one example `styles/<STYLE_NAME>/style.json` to learn the current schema.
>
> Confirm these paths first and record them at the top of your working notes so subsequent
> milestones don't re-search. The folder convention `styles/<STYLE_NAME>/{style.json, prenest.pdf,
> template.pdf}` is documented in §2 of `STATUS_AND_ISSUES.md` — treat it as the source of truth and
> verify against disk before editing.

---

## Why this order

1. **U1 (quantity rounding)** is small, self-contained, and changes no data structures — it ships a
   quick correct win and de-risks the start.
2. **U2 (multi-template per style) + U3 (die/laser pre-nest split)** both restructure `style.json`
   and the per-style folder. They MUST land before DXF and piece-labels, which read the new
   structure. Doing them together (in sequence, U2 then U3) avoids migrating the schema twice.
3. **U4 (DXF + 1.5mm lines)** depends on the laser cut-mode existing (U3).
4. **U5 (piece-ID text)** depends on the per-piece outline geometry, which is stable and unaffected
   by U2/U3, but is placed after them so it only has to be written once against the final pipeline.
5. **U6 (cross-platform UI) and U7 (folder-browse fix)** are orthogonal to the data model and are
   placed last so UI churn doesn't collide with the schema work. They can be reordered with each
   other freely.

A **schema-migration note** (end of doc) covers backward compatibility so existing styles keep
working after U2/U3.

---

## U1 — Quantity export: round DOWN to nearest 12 + remainder warning

**Goal.** Change quantity handling from "round **up** to the next whole sheet" to "round **down** to
the nearest multiple of 12," and warn the user that the remainder must be handled with the regular
(non-nested) artwork format.

**Current behavior (to replace).** Per `STATUS_AND_ISSUES.md` §2 step 5 and §4: an order is rounded
**up** to the next whole sheet (50 → 60, emitted as 5 identical sheets).

**New behavior.**
- Sheets emitted = `floor(qty / 12)`. (e.g. 50 → 4 sheets = 48 caps; 60 → 5 sheets; 11 → 0 sheets.)
- Remainder = `qty mod 12`.
- If remainder > 0, show a **non-blocking warning** before/at export, worded for the operator, e.g.:
  > "This run covers **48** of **50**. The remaining **2** must be produced separately using the
  > regular (non-nested) artwork format."
- If remainder == 0, no warning.
- **Edge case:** if `qty < 12`, sheets = 0. Do not export an empty PDF silently — surface a clear
  message ("Order is under one sheet (12). All N pieces must use the regular artwork format.") and
  block export of a zero-sheet file. Confirm desired behavior with owner if ambiguous.

**Where to change.**
- The quantity→sheets computation in the **fill engine module** (the step that today does the
  round-up). Replace `ceil` with `floor`; compute and surface the remainder.
- The **export/preview UI** to render the warning text. Reuse the existing refuse-and-flag / message
  surface rather than inventing a new modal.

**Verify.** 50→4 sheets + "48 of 50, 2 remainder" warning; 48→4 sheets, no warning; 11→blocked with
under-one-sheet message; 12→1 sheet, no warning. Confirm the corner stamp `QTY` reflects the actual
nested count (48), not the order count (50) — confirm intended value with owner.

**STOP — confirm with owner before U2.**

---

## U2 — Multiple template sizes per style (auto-select by artwork dimensions)

**Goal.** A style can hold **several templates of different sizes** (e.g. last year's and the April
update). On artwork upload, the app reads the artwork's page dimensions, finds the template in that
style whose dimensions match, and uses it. This widens the range of usable files without violating
the no-scaling rule.

**Why this respects §3.** The match is still **exact-size** (per the "no auto-scaling, size mismatch
= refuse + flag" rule). We are not resizing artwork to a template — we are **selecting** the
template that already matches. If no template matches within tolerance, **refuse and flag** as today.

**Schema change (`styles/<STYLE_NAME>/style.json`).**
- Today (assumed): one template (one `template.pdf` + one set of template piece-boxes).
- New: a **list of template variants**, each with its own dimensions, its own `template.pdf`, and
  its own piece-box map. Proposed shape — adapt names to the existing schema you find on disk:

```jsonc
{
  "style_name": "PUR560104_TODDLER",
  "templates": [
    {
      "id": "2023-11",                       // human label / version
      "template_pdf": "template_2023-11.pdf",
      "page_size": { "width_pt": 0, "height_pt": 0 },   // measured at import
      "pieces": [ /* per-piece boxes, same shape as today */ ]
    },
    {
      "id": "2026-04",
      "template_pdf": "template_2026-04.pdf",
      "page_size": { "width_pt": 0, "height_pt": 0 },
      "pieces": [ /* ... */ ]
    }
  ]
  // ...pre-nest fields handled in U3...
}
```

**Files on disk.** Store each variant's PDF in the style folder with a distinct name
(`template_<id>.pdf`). Do **not** overwrite a single `template.pdf`.

**Selection logic (on artwork upload).**
1. Read uploaded artwork page size (use the existing `pdfjs-dist` measuring code — reuse, don't
   reimplement).
2. Compare against each template variant's `page_size` using the **same exact-match tolerance** the
   app already uses for the size-mismatch refusal (find that constant; reuse it — do not introduce a
   looser tolerance).
3. **Exactly one match** → select it, show which variant was chosen.
4. **No match** → refuse + flag (list the available variant sizes and the artwork's size so the user
   can see the gap). Never pick "closest."
5. **Multiple matches** (two variants with identical size) → this is a setup error; flag it and let
   the user pick, rather than guessing.

**Mapping tool (M1/M6) change.** Allow adding/managing **multiple template variants** under one
style: import a template PDF, measure and store its `page_size`, label it with an `id`, map its
piece boxes. Keep manual box-drawing and auto-detect both working per variant.

**Verify.** A style with two variants of different sizes: upload artwork matching variant A → A is
selected; upload artwork matching B → B is selected; upload artwork matching neither → refuse+flag
with sizes shown. Existing single-template styles still load (see migration note).

**STOP — confirm with owner before U3.**

---

## U3 — Die-cut vs. laser cut mode (dropdown) + separate pre-nest files

**Goal.** Add a **cut-mode dropdown** with two options: **Die cut** and **Laser**. The die cut needs
more spacing, so the **pre-nest layout differs by mode** — each style stores a separate pre-nest per
cut mode. (Laser DXF output itself is U4; this milestone only establishes the mode + the per-mode
pre-nest selection.)

**Schema change (`style.json`), building on U2.** Pre-nest is no longer a single `prenest.pdf`.
Store one per cut mode:

```jsonc
{
  "style_name": "PUR560104_TODDLER",
  "templates": [ /* from U2 */ ],
  "prenests": {
    "die":   { "prenest_pdf": "prenest_die.pdf",   "slots": [ /* slot map: box+rotation */ ] },
    "laser": { "prenest_pdf": "prenest_laser.pdf", "slots": [ /* slot map: box+rotation */ ] }
  }
}
```

**Files on disk.** `prenest_die.pdf` and `prenest_laser.pdf` in the style folder. A style may, during
transition, have only one mode mapped — handle a **missing mode** by disabling that option in the
dropdown for that style and explaining why, rather than erroring.

**UI change.** Add the cut-mode dropdown on the main screen, next to fabric/quantity. The selected
mode picks which `prenests[mode]` (slot map + pre-nest PDF) the fill engine uses. The fill pipeline
itself is unchanged — it just reads the mode-specific slot map.

**Mapping tool change.** Let the user map slots **per cut mode** (import the die pre-nest and the
laser pre-nest separately, each with its own slot map + rotations). Reuse all existing
draw/auto-detect/bulk-name/duplicate-highlight tooling per mode.

**Interaction with U1.** The 12-multiple / remainder math is unchanged — it operates on whichever
mode's sheet is selected.

**Verify.** Switching the dropdown loads the correct pre-nest and produces a correctly-spaced filled
sheet for each mode. A style with only `die` mapped shows `laser` disabled with a reason. Stamp still
shows STYLE | FABRIC | QTY (consider adding cut mode to the stamp — confirm with owner).

**STOP — confirm with owner before U4.**

---

## U4 — Laser output: emit a DXF with 1.5mm cut lines

**Goal.** When **Laser** mode is selected, in addition to the print-ready PDF, produce a **DXF file**
the laser cutter reads to know where to cut, with the cut lines at **1.5 mm**.

**Clarify with owner before coding (one question).** "1.5mm lines" most likely means the cut
contour is drawn with a **1.5 mm line width / kerf-relevant stroke**, OR it means an **offset of
1.5 mm** between/around shapes. Confirm which. The plan below assumes **1.5 mm line width on the cut
contours**; adjust if the owner means an offset. Do not guess silently.

**What goes in the DXF.**
- The **cut outlines** for every placed piece on the laser pre-nest sheet — i.e. each piece's true
  cut contour at its placed position and rotation (the same per-slot geometry the fill engine
  already computes for clipping). These become DXF polylines/splines.
- Cut lines styled at **1.5 mm** per the owner's clarification above.
- **Exclude guides** (stitch lines, text, color fills) per §3 — DXF carries cut geometry only.
- Coordinate system / units: DXF in **millimeters**, origin and orientation matching what the laser
  software expects. Confirm the laser's expected unit and origin with the owner/laser docs; do not
  assume.

**Where to build.**
- Add a DXF writer. Prefer a small, well-maintained DXF library over hand-rolling
  (e.g. a JS DXF writer); if none fits the local-only/no-heavy-dep posture, a minimal hand-written
  DXF entities section (LINE/LWPOLYLINE) is acceptable since DXF ASCII is simple. Record the choice.
- Hook it into the export step: when mode == laser, export both the PDF (as today) and the `.dxf`
  alongside it (same base filename, `.dxf` extension), into the same output location the PDF uses.
- Reuse the **placed-piece outline geometry** the clip step already produces — do not recompute
  contours independently, or the DXF and the print could disagree.

**Scale/units caution (ties to §3).** The fabric-stretch scale is applied to the **print** output.
Decide with the owner whether the **DXF cut lines** should carry the same fabric-stretch scale (the
fabric the laser cuts is the stretched fabric, so most likely **yes** — DXF must match the physical
stretched sheet). Confirm; this matters for fit.

**Verify.** Laser mode export drops a `.dxf` next to the PDF; open it in a DXF viewer and confirm:
correct number of piece contours, correct placement/rotation matching the PDF, 1.5 mm per
clarification, millimeter units, no guide/text geometry present.

**STOP — confirm with owner before U5.**

---

## U5 — Piece-ID text inside each piece (for die/laser cut teams)

**Goal.** Print a small **piece label** (which piece is which) inside every placed piece, so the cut
team can identify panels. The text sits **inside the cut line but outside the seam allowance** —
i.e. in the bleed/margin band just inside the cut contour. Font/look is unimportant; it must be
**small, fully legible, and consistently placed**.

**Constraints.**
- Must land **inside the cut outline** and **outside the seam-allowance (stitch) line** — the band
  between the two existing lines on the template (visible in the panel templates as solid cut line +
  dashed stitch line). Place text in that band.
- Must be **fully visible** (not clipped by the piece outline). Since the fill engine clips artwork
  to the piece outline, render the label **after/above** the clip or as a separate overlay that
  isn't clipped away — confirm it survives the clip step.
- Applies to the **print PDF**. Decide with owner whether the label should **also** be scribed into
  the **DXF** (cut teams reading from the laser file might want it) — default **no** unless requested,
  since text in a cut file can be misread as cut geometry. Confirm.
- The label content = the `piece_type` name (and instance number if useful, e.g. "SIDE A",
  "TOP A", "FRONT"). Use the labels already stored in the slot map — do not invent new naming.

**Where to build.**
- In the fill engine, after placement+clip, draw a small text string per placed piece at a computed
  anchor inside the band. A robust anchor: the **centroid of the piece's true outline**, nudged so it
  stays within the band; for thin crescent (visor) pieces, fall back to the widest interior point.
  Keep it simple — exact position "ultimately doesn't matter much" per owner, as long as it's inside
  the line and fully visible.
- Use `pdf-lib`'s text drawing (a built-in font is fine). Small fixed point size; if a piece is too
  small for the text, shrink to fit or place at the largest interior point — never let it spill past
  the cut line.

**Verify.** Every piece on a filled sheet shows its label, small, inside the cut line, outside the
stitch line, fully legible, not clipped. Check the tight visor crescents specifically (worst case).

**STOP — confirm with owner before U6.**

---

## U6 — Cross-platform UI (Windows + Mac), fix oversized/wonky Windows layout

**Goal.** The hosted page renders **too large and mis-formatted on Windows**. Make the UI render
correctly on **both Windows and Mac**.

**Likely causes to check (Windows vs Mac).**
- **Device pixel ratio / OS display scaling** (Windows commonly at 125–150%) inflating a layout that
  assumed Mac's scaling. Audit fixed `px` sizing and viewport assumptions; prefer responsive units
  and a sensible `max-width` container so the app doesn't sprawl on large/scaled Windows displays.
- **Font stack differences** (Mac system fonts vs Windows) causing reflow — set an explicit
  cross-platform font stack.
- **Default zoom / `<meta viewport>`** and any hard-coded canvas/preview dimensions in the mapping
  and preview screens — make the preview/canvas scale to its container rather than to absolute size.
- Scrollbar width differences (Windows shows persistent scrollbars) eating layout width.

**Approach.** Don't rewrite the UI. Make a targeted responsiveness pass: container max-width,
relative sizing, explicit font stack, and verify the **mapping canvas** and **preview** both scale.
Test at 100% / 125% / 150% Windows scaling and on Mac.

**Verify.** On a Windows machine at default scaling the app fits the window, controls are aligned,
mapping canvas and preview are usable; Mac is unchanged/also correct.

**STOP — confirm with owner before U7.**

---

## U7 — Fix backup-folder selection (file-explorer browse not working)

**Goal.** Selecting a **backup folder** currently fails to open / browse the file explorer. Make
folder selection work on both platforms.

**Diagnose first.** Determine how folder selection is currently implemented:
- If it relies on a **browser** folder picker (e.g. `webkitdirectory` / the File System Access API),
  note that support and behavior differ across browsers/OSes and the API may be unavailable in the
  context the app runs in.
- Because the app is **local-only and served by the Vite middleware**, the robust fix is usually to
  do folder selection **server-side in `server/styles-api.js`** (it already has Node/fs and shells
  out to `gs`), e.g. an endpoint that opens a native OS folder dialog or accepts a typed/validated
  absolute path, rather than depending on a browser picker.

**Implementation options (pick with owner; default to the most durable).**
1. **Native OS dialog via the middleware** (most reliable cross-platform): the server opens the
   platform folder picker and returns the chosen path. Keeps it local-only.
2. **Validated path entry**: user pastes/types a folder path; the middleware validates it exists and
   is writable; show a clear error if not. Simplest, no native deps, very durable.
3. Browser File System Access API — only if it actually works in this app's runtime on both OSes;
   otherwise skip.

Respect §3 **local-only**: no cloud destinations. Backups are to a local/LAN path only.

**Verify.** On Windows and Mac, choosing a backup folder works, the selected path is shown, a backup
writes successfully to it, and an invalid/unwritable path gives a clear message.

**STOP — final owner confirmation.**

---

## Cross-cutting: schema migration & backward compatibility (read before U2)

U2 and U3 change `style.json`. Existing styles use the old single-template / single-prenest shape.
Do **not** break them.

- Write a **loader that accepts both shapes**: if a `style.json` lacks `templates[]`, treat its
  existing single template as `templates: [{ id: "legacy", ... }]`; if it lacks `prenests{}`, treat
  its existing `prenest.pdf` + slot map as `prenests.die` (die is the historical default —
  **confirm with owner** that legacy pre-nests were die-cut). Measure and backfill `page_size` for
  legacy templates on first load if missing.
- Provide a **one-time, explicit migration** (a script or an in-app "upgrade this style" action) that
  rewrites old `style.json` to the new shape and renames files — but only on user action, never
  silently, and back up the original `style.json` first.
- Add the **regression tests** flagged in `STATUS_AND_ISSUES.md` §8.1 around the touched areas:
  quantity math (floor + remainder), template-size selection (exact-match + refuse), per-mode
  pre-nest selection, DXF contour count/placement, and piece-label placement. The coordinate/rotation
  math is subtle; tests here protect every later change.

## Open questions to resolve with the owner (collect answers before the relevant milestone)

1. **U1:** When `qty < 12`, block export with a message (assumed) — confirm. Should the stamp `QTY`
   read the nested count (48) or the order count (50)?
2. **U3:** Add cut mode to the corner stamp?
3. **U4:** Does "1.5 mm lines" mean **line width/stroke** or a **1.5 mm offset**? What **units and
   origin** does the laser software expect for DXF? Should the DXF carry the **fabric-stretch scale**?
4. **U5:** Put piece-ID text in the **DXF** too, or print-PDF only (default: PDF only)?
5. **Migration:** Were all legacy pre-nests die-cut (so they map to `prenests.die`)?
