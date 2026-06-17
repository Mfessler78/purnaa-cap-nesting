# Purnaa Cap Nesting — Operator Guide

> **ARCHIVED (2026-06-16).** Merged into `../WORKFLOW.md`, which is now the single
> operator workflow (daily run + per-style setup). Kept here for history only —
> follow `../WORKFLOW.md` instead.

A one-page guide to running a print job. If you can pick from a few menus and
upload a file, you can do this. The whole job is six steps.

> **Golden rule:** the tool never resizes or "fixes" artwork. If something is
> wrong, it tells you and refuses — it does **not** quietly change your file.
> A red ✗ means *stop and fix*, not *the tool is broken*.

---

## Before you start

1. Make sure the app is running (a teammate or the start-up note handles this).
2. Open it in your web browser.
3. You only need two things from the customer: the **approved artwork PDF**, and
   the **style number** and **fabric** for the order.

---

## The daily job — six steps

On the **Run** screen, left to right:

1. **Style** — pick the style number for this order.
2. **Fabric** — pick the fabric. (This sets the stretch percentage automatically;
   you don't type a number.)
3. **Quantity** — type how many caps. The tool rounds **up** to a full sheet, so
   asking for 13 prints a sheet of 12 plus another full sheet.
4. **Customer artwork PDF** — upload the Mila-approved file.
5. Leave **"Clip artwork to piece outlines"** ticked, **Bleed** at **0.25"**, and
   **Cut line** at **1.5 mm**. These are correct for almost every job — you don't
   normally change them. (The cut line is the black outline the laser follows; it
   now prints around every piece. Die-cut operators just ignore it.)
6. Click **Fill layout** and wait. A spinner shows what it's doing; large artwork
   can take a moment. That's normal.

Then **check the Verification panel** (next section), tick the approval box, and
click **Export print PDF**.

---

## Reading the Verification panel

After Fill layout, you get a checklist:

- **✓ green** — good. (Artwork found in every piece, sizes match, pieces clipped
  to their true shape, quantity and fabric applied.)
- **⚠ amber** — a heads-up, not a stop. Read it. Most common: a piece used a
  rectangle instead of its true outline — fine for simple pieces, worth a look on
  curved ones.
- **✗ red** — **stop.** Export is blocked until you fix it. Usual causes:
  - *Artwork size doesn't match the template* → you have the wrong artwork file,
    or it wasn't built on the template. Get the right file. (The tool will **not**
    scale it to fit — that's deliberate.)
  - *A piece is empty / no artwork found* → the artwork is missing that panel.
  - *A style mapping problem* → the style itself needs fixing in the Mapping Tool
    (see the last section). Tell whoever maintains the styles.

When everything is green, tick **"I checked the preview below"**, look over the
preview (alignment, rotation, nothing missing), and export.

---

## Exporting

**Just click "Export print PDF."** That's the normal, correct export for
RasterLink. It downloads a print-ready PDF named with the style, fabric and
quantity.

### The "Flatten with Ghostscript" button — you almost never touch this

It sits next to the export button and is labelled *"rarely needed."* The normal
export already prints correctly in RasterLink. The **only** reason to use Flatten
is if a specific job comes back from the RIP with transparency rendered wrong —
and even then, ask the person who maintains the tool first. It re-processes the
whole sheet and **takes several minutes** (the app warns you and tells you to keep
the tab open). If it ever times out, just use the normal export instead.

You do not decide between the two every time. Default export = done.

---

## If something won't work

- **It says "Filling…" / shows a spinner for a while** — that's expected on big
  artwork. Give it time before assuming it's stuck.
- **Export is blocked (red ✗)** — read the red line; it says exactly what's wrong.
  Fix the input (usually the artwork file) and Fill again.
- **The app won't open at all** — that's a start-up problem, not a job problem;
  follow the "if it's broken" start-up note or ask a teammate.

---

## Setting up a new style (not part of the daily job)

New styles are mapped once in the **Mapping Tool**, usually by whoever sets up
styles — not during a normal print run. Worth knowing: on the **Template pieces**
tab, each piece shows a **✓** (clips to its true shape) or **rect ⚠** (no readable
outline). If you see **rect ⚠** on curved pieces like visors, the template needs a
closer look **before** the style is used for real orders — that's the warning that
prevents a bad print.

> For the **full process** — building the template and the 58" pre-nest sheet in
> Illustrator, mapping a new style, and nesting an order end to end — see
> **`WORKFLOW.md`**. This guide is the condensed daily run; `WORKFLOW.md` is the
> complete start-to-finish reference.
