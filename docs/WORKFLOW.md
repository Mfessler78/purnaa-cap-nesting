# Purnaa Cap Nesting — Full Workflow, Start to Finish

This is the complete guide: how a customer's artwork becomes a finished, print-ready
nested PDF — **including the Illustrator work** of building the template and the
pre-nest sheet. If you read this top to bottom, you'll understand every step, who
does it, and what the rules are.

There are two kinds of work here:

- **One-time-per-style setup** (Stages 1–4): build the files in Illustrator and
  "map" the style in the app. You do this **once** for each cap style, then reuse it
  forever.
- **The daily job** (Stages 5–6): nest a specific customer order using a style
  that's already set up. This is the fast part — a few minutes.

> **The one rule behind everything:** the tool never resizes, rotates, or "fixes"
> artwork on its own. If something is wrong, it **stops and tells you** instead of
> quietly changing your file. Every "If… then…" box below is a place where the tool
> refuses on purpose so a bad sheet never gets printed.

---

## The big picture (read this first)

A finished print **sheet** is **58 inches wide** — that width matches the printer.
On that sheet we arrange **12 caps' worth** of panels, packed efficiently, each
panel rotated however it needs to be to fit. That empty arranged sheet is the
**pre-nest**.

To fill it, the tool needs to know two things, kept in two separate files:

1. **The template** — one upright copy of each cap **piece** (front, side, visor,
   etc.). This is the canvas we **send to the customer**; they draw their artwork
   directly on it. It tells the tool *what each piece's artwork looks like and which
   way is "up."*
2. **The pre-nest** — the 58" sheet with all the empty **slots** arranged and
   rotated. It tells the tool *where every piece goes on the printed sheet, and how
   far each one is turned.*

The tool matches the two by the **piece's name** (e.g. `front`, `visorTop`) — never
by position, because the template and the pre-nest are completely different layouts.
It copies each piece's artwork from the template into every slot of the same name on
the pre-nest, turning it to match each slot. Then it stamps the corner, applies the
fabric stretch, and exports.

```
  TEMPLATE  (customer draws here)        PRE-NEST  (the 58" print sheet)
  ┌───────────────────────┐              ┌──────────────────────────────────┐
  │  [front]   [side]      │   matched    │ front▲ side▶ front▼ visor◀ ...   │
  │  [visor]   [back]      │ ───by name─▶ │ side◀ back▲ front▶ side▼  ...    │
  │   one of each, upright │              │  12 caps' worth, each rotated     │
  └───────────────────────┘              └──────────────────────────────────┘
```

### The four rules that never change

1. **Same physical size, always.** The customer's artwork must be the exact same
   scale as the template. The tool will **not** shrink or stretch art to fit.
2. **Match by name.** Pieces connect by their typed label, spelled identically on
   both sides — never by where they sit on the page.
3. **Rotation lives on each slot.** Each slot remembers its own turn (0, 90, 180, or
   270°). Two slots of the same piece can be turned differently.
4. **Cut lines print; other guides don't.** The tool draws a **black cut line**
   (1.5 mm) around every piece in the export — the laser follows it, and die-cut
   operators just ignore it. Stitch lines, instructional text, and color fills are
   still for humans only: keep them on their own layers; the tool ignores them and
   strips them from the output.

---

## Stage 1 — Build the template (the customer's canvas) — *one time per style*

The template is the file you **send to the customer** to draw on. It defines, once,
each piece in its correct upright orientation.

**In Illustrator:**

1. **New document.** Use a real-world unit (inches) and a CMYK, print-ready color
   mode. The template artboard does **not** need to be 58" — it only needs to be big
   enough to hold one upright copy of every piece with room to work. (Its size is
   independent of the pre-nest; they're matched by name, not size.)
2. **Lay out one of each piece, upright.** Place a single, correctly-oriented copy of
   every cap piece: front, side, visor, back — whatever this style has. "Upright"
   means the way the art should read on the finished cap. This orientation is the
   tool's reference for "0°."
3. **Give every piece a true outline.** Each piece must have **one closed path** that
   traces its real shape (including curved visor edges). Put these outlines on their
   **own layer** (e.g. a layer named `outlines` or `slots`). The tool reads these
   shapes to clip artwork cleanly to each piece.
4. **Put guides on separate layers.** Cut lines, stitch lines, labels, and any color
   fills go on **different** layers from the outlines. They're reference only.
5. **Label each piece clearly for the customer** (visible text like "FRONT" so they
   know where to put art). Keep that text on a guide layer — it won't print.
6. **Save as PDF**, vectors intact (do **not** flatten — flattening only happens at
   the very end, inside the app). This PDF is what you send the customer **and** what
   you'll later load as the style's template.

> **If** a piece has no clean closed outline (just loose lines or an open path) →
> **then** the app later can't clip that piece to its true shape and falls back to a
> plain rectangle, which can clip neighbors' art. **Fix the outline now**, in
> Illustrator, before the style is used for real orders.

---

## Stage 2 — Customer art + Mila's alignment

1. **Send the template PDF to the customer.** They place their artwork **on top of
   the template**, inside each piece, and send it back. They never rename or relabel
   anything — they just draw.
2. **Mila aligns and approves.** Mila checks that each piece's artwork sits cleanly
   over its template piece and is the right size, and approves the file. Her aligned,
   approved PDF is the **customer artwork** you'll upload at run time.

The returned artwork must stay on the **same artboard/page size as the template** —
because the customer drew directly on the template. That's what lets the tool find
each piece's art and confirm the scale matches.

> **If** the returned artwork is a different page size than the template, or a piece
> was redrawn at a different scale → **then** the app will refuse at run time (see
> Stage 5). Get a corrected file from the customer. **Never** rescale it to force a
> match — that prints the wrong size.

---

## Stage 3 — Build the pre-nest sheet (58" wide) — *one time per style*

The pre-nest is the actual print layout: a **58-inch-wide** sheet packed with **12
caps' worth** of panels, each turned to nest tightly.

**In Illustrator:**

1. **Set the artboard to 58" wide.** With the Artboard tool, set the artboard
   **width to 58 in** to match the printer. Height is whatever the nested layout
   needs. This width is the hard constraint — everything packs inside it.
2. **Arrange 12 caps' worth of slots.** Place every panel the order needs — normally
   12 of each piece — packed efficiently to save fabric. Rotate panels freely to nest
   them; you'll record each rotation in the app in Stage 4.
   - Keep rotations to clean **90° steps** (0, 90, 180, 270). The tool only stores
     those four values.
3. **Each slot is one closed outline on its own layer**, exactly like the template
   pieces — one closed path tracing the panel's true shape, on a dedicated
   `slots`/`outlines` layer. Cut lines, stitch lines, text, and fills go on separate
   guide layers.
4. **Leave room in a top corner for the stamp.** The app prints a small
   `STYLE | FABRIC | QTY` stamp in a top corner of the sheet — keep that corner
   clear.
5. **Save as PDF**, vectors intact, not flattened. This is the style's pre-nest file.

> **If** the layout is wider than 58" → **then** it won't fit the printer. Re-nest
> inside the 58" artboard before saving.

> **If** a panel is rotated by something other than a clean 90° step → **then** you
> won't be able to record it accurately in Stage 4 (the tool stores only
> 0/90/180/270). Snap it to a 90° step.

---

## Stage 4 — Map the style in the app (Mapping Tool) — *one time per style*

"Mapping" is teaching the app what's in those two PDFs. You do it once per style, in
the app's **Mapping Tool**.

### 4a. Map the pre-nest slots

1. Open the **Mapping Tool** and **upload the pre-nest PDF**. It renders on screen.
2. **Identify each slot.** Use **auto-detect** (the app finds the closed outlines and
   shows them as clickable dashed shapes — "Add all detected") or **draw a box** over
   each slot by hand. Manual drawing is always available as a fallback.
3. **Label each slot** with three things:
   - **piece_type** — the piece name (e.g. `front`). **Spell it exactly** the way
     you'll spell it on the template — same capitalization, no stray spaces.
   - **instance** — a number (1, 2, 3 …) so each slot of the same piece is distinct.
   - **rotation** — 0, 90, 180, or 270°, matching how you turned that panel in
     Illustrator. **Rotation is counter-clockwise.**
   - *Tip:* you can multi-select many slots (lasso / shift-click), name them all at
     once with auto-numbering, and apply a rotation (including "+180°") to the whole
     selection in one action.
4. **Watch for red highlights.** If two slots end up with the same `piece#instance`,
   they flash **red** in the list and on the canvas — fix the duplicate so every slot
   is unique.

### 4b. Map the template pieces

1. Switch to the **template** side and **upload the template PDF**.
2. **Label each piece** with just its **piece_type** (no instance, no rotation — the
   template is the upright reference). **Spell each name identically** to the matching
   slots on the pre-nest.
3. Each template piece shows a **✓** (a true outline was read) or **rect ⚠** (no
   readable outline — it'll clip as a plain rectangle).

### 4c. Save the style

Give it the **style number** and save. The app stores the pre-nest PDF, the template
PDF, and both maps together on the host. From now on it appears in the style dropdown
for everyone on the network.

> **If** a name on the pre-nest doesn't **exactly** match a name on the template
> (e.g. `Front` vs `front`, or a trailing space) → **then** the tool can't connect
> them and that piece comes up empty at run time. Matching is exact and
> case-sensitive. **Use one consistent style** (camelCase like `visorTop` works
> well) on both sides.

> **If** a curved piece (like a visor) shows **rect ⚠** instead of ✓ → **then** its
> outline wasn't readable; go back to Illustrator (Stage 1/3) and make sure that
> piece is a single closed path on the outline layer. Using it as-is risks clipping
> neighboring art.

---

## Stage 5 — Nest a customer order (the daily job)

This is the everyday run, on the **Run** screen, left to right. It takes a few
minutes.

> **Before you start (daily):** make sure the app is running (a teammate or the
> start-up note handles this — see `HOW_TO_START.md`) and open it in your browser.
> You only need two things from the customer: the **Mila-approved artwork PDF**, and
> the **style number** and **fabric** for the order.

1. **Style** — pick the style number for this order.
2. **Fabric** — pick the fabric. This sets the stretch percentage automatically; you
   don't type a number. (Fabrics and their stretch % live in an editable table.)
3. **Quantity** — type how many caps. The tool rounds **up** to a full sheet of 12
   and prints whole sheets. *(50 caps → 60 → 5 identical sheets. 13 → 24 → 2 sheets.)*
4. **Customer artwork PDF** — upload the **Mila-approved** file from Stage 2.
5. **Leave "Clip artwork to piece outlines" ticked, Bleed at 0.25", and Cut line at
   1.5 mm.** These are correct for almost every job; you don't normally change them.
   (Bleed grows each clip slightly outward so every piece keeps its own print bleed.
   Cut line is the black outline the laser follows, drawn around every piece — die
   cut just ignores it. The exact width is confirmed at the laser install.)
6. Click **Fill layout** and wait. A spinner shows progress; large artwork can take a
   moment — that's normal, not frozen.

The tool now copies each piece's art into every matching slot, turns each one by that
slot's stored rotation, clips it to the piece shape, stamps the corner, and applies
the fabric stretch.

### Read the Verification panel before you export

After Fill layout you get a checklist:

- **✓ green** — good (art found for every piece, sizes match, pieces clipped to their
  true shape, quantity and fabric applied).
- **⚠ amber** — a heads-up, not a stop. Most common: a piece used a rectangle instead
  of its true outline — fine for simple shapes, worth a glance on curved ones.
- **✗ red** — **stop. Export is blocked until it's fixed.**

> **If** it says *artwork size doesn't match the template* (red ✗) → **then** you have
> the wrong artwork file, or it wasn't built on the template. Get the right file. The
> tool will **not** scale it to fit — that's deliberate.

> **If** it says *a piece is empty / no artwork found* (red ✗) → **then** either the
> artwork is missing that panel, or the names don't match between template and
> pre-nest (Stage 4). Check the spelling of that piece on both sides.

> **If** it says *a style mapping problem* (red ✗) → **then** the style itself needs
> fixing in the Mapping Tool; tell whoever maintains the styles. It's not a problem
> with this order's artwork.

When everything is green, **look over the preview** (alignment, rotation, nothing
missing), tick **"I checked the preview below,"** and move to export.

---

## Stage 6 — Export the print-ready PDF

**Click "Export print PDF."** That's the normal, correct export for RasterLink. It
downloads a print-ready PDF named with the style, fabric, and quantity (and on Laser
jobs the CUT.dxf for the laser alongside it). Open it in RasterLink and print.

The program never flattens artwork. If the verification list warns that a file is
heavily layered (slow to rip in RasterLink), the fix happens in Photoshop before the
run: Layer → Flatten Image, re-save, upload again.

---

## One-page decision summary (every "If… then…")

| When you see / hit | What it means | What to do |
| --- | --- | --- |
| Piece has no clean closed outline (Illustrator) | Can't clip to true shape | Fix it to one closed path on the outline layer **before** mapping |
| Layout wider than 58" | Won't fit the printer | Re-nest inside the 58" artboard |
| Panel rotated off a 90° step | Tool stores only 0/90/180/270 | Snap rotation to a clean 90° step |
| Names differ across files (`Front` vs `front`) | Pieces can't be matched | Spell every name identically (case-sensitive) on both sides |
| `rect ⚠` on a curved piece | No readable outline | Remake that piece as a single closed path in Illustrator |
| Duplicate `piece#instance` flashes red | Two slots share an ID | Renumber so every slot is unique |
| Red ✗: *size doesn't match template* | Wrong/rescaled artwork | Get the correct file; never rescale to fit |
| Red ✗: *piece empty / no artwork* | Missing art or name mismatch | Check that piece's spelling on both sides; confirm art exists |
| Red ✗: *style mapping problem* | The style is mis-mapped | Fix it in the Mapping Tool; tell the style maintainer |

---

## Glossary

- **Piece (piece_type):** one panel of a cap — front, side, visor, back, etc.
  Identified by a typed name that must match exactly across files.
- **Template:** the file with one upright copy of each piece; the customer's drawing
  canvas and the tool's "which way is up" reference.
- **Pre-nest:** the 58"-wide print sheet with 12 caps' worth of empty slots arranged
  and rotated.
- **Slot:** one place on the pre-nest where a piece goes, with its own rotation.
- **Instance:** the number that makes each slot of the same piece unique (front #1,
  front #2 …).
- **Mapping:** teaching the app, once per style, where the slots and pieces are and
  what they're called.
- **Fabric stretch:** a per-fabric percentage applied uniformly to the whole sheet at
  export — the **only** scaling the tool ever does.
- **Bleed:** a small outward margin (default 0.25") so each clipped piece keeps its
  own print bleed.
- **Stamp:** the small `STYLE | FABRIC | QTY` label printed once in a top corner.

---

*Related docs: `HOW_TO_START.md` (starting the app on the office computer) and
`README.md` (the docs index). This file is the single operator workflow — the daily
run (Stages 5–6) and the one-time-per-style setup (Stages 1–4) both live here. The
old condensed `OPERATOR_GUIDE.md` was merged into this doc and moved to `archive/`.*
