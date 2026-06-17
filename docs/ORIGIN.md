# How This Program Was Made — Origin & Replication Story

> This is **not** a how-to-use guide (that's `WORKFLOW.md`) and not a how-to-start guide
> (that's `HOW_TO_START.md`). It's the story of **why this program exists, how it was built,
> and how someone could replicate the way it was built.** If you are inheriting this tool or
> trying to build something like it, read this first.
>
> Written 2026-06-16, folding in the reasoning from the now-archived planning docs
> (`archive/STATUS_AND_ISSUES.md`, `archive/CLAUDE_CODE_UPDATE_PLAN.md`,
> `archive/CLAUDE_CODE_UPDATE_PLAN2.md`).

---

## 1. The problem it solves

Purnaa manufactures caps (hats). Each cap is sewn from several fabric **panels** — front, sides,
visor top/bottom, etc. Those panels are **printed** onto large fabric sheets and then cut out.

To save fabric, a sheet is **nested**: many panels packed tightly together, each rotated however it
needs to be to fit, with one printed sheet yielding a whole batch of caps (normally **12 caps'
worth**). Building that packed layout — the **pre-nest** — and then dropping a specific customer's
artwork into every slot, correctly rotated and at exactly the right size, was slow, manual, and
error-prone. A single mistake (wrong rotation, art scaled to fit, a panel left empty) wastes a whole
expensive fabric sheet.

**The app automates the fill step**: given a pre-mapped style, a customer's approved artwork, a
fabric, and a quantity, it copies each piece's artwork into every matching slot, rotates each one per
the slot's stored value, clips it to the piece's true shape, stamps the corner, applies the fabric's
stretch factor, and exports a print-ready PDF for the RIP (RasterLink). The humans stay in charge of
the judgment calls; the computer does the tedious, exact placement.

### The people it's built around
- **Customer** — draws artwork on top of a template we send them; never names or labels anything.
- **Mila** — aligns and approves the returned artwork so each piece sits cleanly over its template
  slot. Her alignment is what makes the whole position-based approach reliable.
- **Santosh** — runs the app: picks style/fabric/quantity, uploads artwork, checks the preview,
  exports, prints.

---

## 2. The two-Claude workflow that produced it

This program was built by a deliberate division of labor between **two different Claude surfaces**.
This split is the single most useful thing to copy if you're replicating the approach.

- **Claude chat (the thinking surface).** Used to *reason through problems, weigh trade-offs, and
  produce structured plans.* It did not have the codebase in hand. Hard problems (how to host it in
  the office, why exports were huge, what the laser changes) were talked through here first, then
  written up as a **clear, ordered, milestone-by-milestone plan** (the documents now in
  `archive/`).
- **Claude Code (the building surface).** Used to *implement those plans one milestone at a time,
  inside the actual repository.* It built a milestone, said exactly how to run and test it, then
  **stopped and waited for the owner to confirm** before starting the next.

The loop, repeated for every piece of work:

```
   chat reasons + writes the plan  ─▶  Code builds ONE milestone  ─▶  owner tests & confirms
            ▲                                                                   │
            └───────────────────────────  next milestone  ◀────────────────────┘
```

Why it works: the thinking surface never has to fight the mechanics of editing files, and the
building surface never has to invent requirements — it executes an agreed plan in small, verifiable
steps with a human gate between each. The plans were explicitly written to fit this: *"the coding
assistant works one milestone at a time and waits for confirmation, so a plan broken into verifiable
steps fits its workflow best."*

---

## 3. The build philosophy (what shaped every decision)

These principles, stated in `CLAUDE.md` and the planning docs, overrode cleverness every time:

- **Simplicity over sophistication.** The daily operator must learn the tool in **ten minutes**. When
  a choice existed between "make the operator decide" and "make the default always correct so there's
  no decision," the default-correct option won every time (see the Ghostscript story below).
- **Refuse and flag — never silently fix.** No auto-scaling, no auto-rotating, no quietly correcting
  artwork. If the artwork size doesn't match the template, the app **stops and says so** rather than
  resizing. A red ✗ means *stop and fix the input*, not *the tool is broken*.
- **Match by name, not by position.** Slots and template pieces connect by their typed `piece_type`
  label (exact, trimmed, case-sensitive), because the pre-nest and the template are entirely
  different artboards/coordinate spaces.
- **Rotation lives on each slot**, read from the saved map — never inferred from the piece type (two
  pieces of the same type can be rotated differently).
- **Local only.** One machine, in a browser. No cloud, no accounts, no login, no deployment.
- **It must survive after the builder leaves.** Every hosting/durability decision was made to avoid
  the "works for two months, then silently fails" trap — depend on as little of the OS and network as
  possible, and make every failure visible and recoverable by a single action (double-click the icon
  again).
- **Milestone at a time, with human confirmation gates.** Mandatory build order; nothing built on top
  of an unconfirmed foundation.

---

## 4. Milestone history (how it was sequenced)

### The MVP (M0–M6) — mandatory order
The order was a hard requirement, not a suggestion, so that the riskiest unknowns came last.

- **M0 — Skeleton.** Vite + React app that runs with `npm run dev`, opens in a browser, git
  initialized.
- **M1 — Manual labeling tool.** Upload a pre-nest PDF, render it, draw rectangular boxes over slots,
  label each with piece type + instance + rotation. Same for the template (piece type only). Saved as
  a style's JSON slot map on disk. No auto-detection yet — on purpose.
- **M2 — Fill + rotate + place.** Place artwork into slots by piece type, rotated per slot, one source
  replicated into all matching slots. Quantity rounded up to whole sheets.
- **M3 — Stamp + fabric scale.** Corner `STYLE | FABRIC | QTY` stamp and the global fabric-stretch
  factor from an editable fabric table.
- **M4 — Preview + verification gate.** Visual preview before export; export blocked on
  missing/mismatched pieces or a size mismatch.
- **M5 — Export.** Flattened-compatible vector PDF for RasterLink. This was flagged as the highest
  RIP-compatibility risk and was tested in RasterLink as soon as it produced anything — **the direct
  vector export printed correctly in a real RasterLink test.**
- **M6 — Auto-detect (last, riskiest).** Auto-detects closed paths in the pre-nest as clickable slot
  regions (walks the pdf.js operator list, tracks the transform matrix, recovers each shape's bounding
  box). Labels are still applied by hand. Manual box-drawing stays as a permanent fallback.

### Post-MVP (M7–M17)
Investigations and root-cause fixes were sequenced **before** convenience work, so nothing was built
on a known-bad foundation.

- **M7 — Investigation only: overlapping mapped boxes.** Finding: nested brim pieces (visor top/bottom,
  side panels) overlap *as bounding boxes* — which is normal — but the true-outline clip already
  resolves it, so no neighbor art is actually swallowed. The real risk was only when a piece had **no
  readable outline** and fell back to a rectangle.
- **M8 — Fix at the source.** Made outline clipping work in the browser (see the Buffer bug below),
  read clip-path outlines from production templates (see below), and added a **refuse-and-flag guard**:
  if a piece can only be rectangle-clipped *and* its rectangle overlaps a neighbor, the app refuses
  rather than silently printing overlapping fill. Dormant on clean styles.
- **M9 — Selection parity in the mapping tool.** Shift-click extends a selection; multi-select applies
  rotation as well as names; "+180° to all" in one action. Plus a map-time ✓ / `rect ⚠` indicator that
  mirrors exactly what the fill will do.
- **M10 — Delete a style**, behind a named confirmation (no undo — the confirmation prevents the
  accident, which is what's needed).
- **M11 — Progress feedback** on long fill/export operations so nothing looks frozen.
- **M12–M13 — Ghostscript as a rarely-needed fallback + the operator guide.** The operator never
  chooses between vector and flatten; direct vector is the default, flatten is one clearly-labeled
  fallback button for the rare RIP-transparency case.
- **M14 — Regression test suite** for the breakage-prone math (fill, rotation anchors, clip geometry,
  size-mismatch refusal, overlap guard, outline extraction).
- **M15 — No-babysit office hosting.** A standalone LAN server (`server/serve.js`) that serves the
  **built** app and the same API as dev; a resilient double-click launcher on a pinned port (4173)
  that frees the port first so "double-click again" is the universal reset; bundled portable Node so
  the host needs nothing installed system-wide. **M15a:** a "Copy office link" button.
- **M16 — Local-first shared storage.** Styles and `fabrics.json` are the single source of truth on
  the host's local disk; atomic writes so the style list can never go blank or half-written.
- **M17 — Backup to a configured folder** (the P drive) as dated snapshots, with a weekly auto-check,
  a new-style backup prompt, and an always-visible "last backed up" indicator.

---

## 5. What was hard, and what got reversed (learn from the dead ends)

- **The 37 MB export was a duplication bug, not raster bloat.** The fill engine embedded the artwork
  page **once per piece type**, and the PDF library copies *all* of a page's images into each embed —
  so the same images were stored ~6× over. Fix: embed the artwork **once** and share that single copy
  across all 84 placements, positioning each by transform and trimming with clip paths. **Direct-vector
  export dropped 37 MB → 5.5 MB, pixel-identical.**
- **"Ghostscript failing" was actually a timeout.** The flatten step wasn't erroring — a 120-second
  limit was killing it. The heavy soft-mask (alpha) artwork genuinely needs ~163 s for one sheet
  because PDF 1.3 forces compositing every soft-masked image at every placement. Decision: lean on the
  RasterLink-proven **direct-vector export**, leave flatten as a rarely-used fallback, and give it a
  generous timeout so that *when* it's used it completes instead of erroring. Key mental model:
  "direct vs. flatten" is **not** "vector vs. raster" — both keep images as raster; the difference is
  *live transparency* vs. *baked-opaque transparency*, and direct preserves image quality.
- **Outline clipping silently did nothing in the browser.** The outline extractor used Node's `Buffer`,
  which is `undefined` under Vite — so every style silently fell back to rectangle clipping. Fixed by
  decoding content streams with `TextDecoder` (works in browser and Node), guarded by a regression test.
- **Production templates hide the geometry in clip paths.** Real templates define each piece as a
  raster image **clipped to its cut outline** (`W n Do`), so the true shape lives in the *clip path*,
  not a painted fill. The extractor was taught to read clip paths too — otherwise it recovered zero
  outlines and the M8 guard fired on a perfectly good template.
- **The laser reversal (an intentional 180° on an old rule).** The old rule stripped *all* guides from
  the export. A laser cutter (arriving Sept 2026) reads a **black line** to know where to cut — so the
  cut line must now **survive into the export**, the exact opposite of before. This is unified across
  die-cut and laser (no toggle); die-cut operators simply ignore the printed line. This is recorded as
  intentional in `CLAUDE_CODE_LASER_VS_DIECUT.md` and guarded by a test, specifically so a future
  cleanup doesn't "fix" it back to stripping lines.
- **The hosting design rejected a bundled desktop app on purpose.** Tauri/Electron were considered and
  rejected because their failure mode (OS signing / notarization / Gatekeeper / SmartScreen blocking
  the app after an OS update) is silent and unfixable by a non-technical team. A double-clickable
  launcher serving the built web app, with bundled Node, was chosen because every failure is visible
  and recoverable by double-clicking again.

---

## 6. The stack (and why)
- **React 18 + Vite 6**, plain JSX — one command to run in dev (`npm run dev`).
- **pdf.js (`pdfjs-dist`)** for reading/measuring/rendering PDFs; **pdf-lib** for composing/writing the
  output PDF. Inputs keep their vectors intact; only the final export is flattened (and only optionally).
- **A tiny Node API** (`server/styles-api.js`) for the file I/O the browser can't do — reading/writing
  style maps, the fabric table, backups, and the optional Ghostscript step. It mounts the *same*
  handlers in the Vite dev server and in the standalone LAN server, so dev and production share one code
  path.
- **Ghostscript** (optional, shelled out) only for the rare transparency-flatten fallback.

---

*Related docs: `WORKFLOW.md` (how to use it), `HOW_TO_START.md` (how to run it in the office),
`CLAUDE_CODE_LASER_VS_DIECUT.md` (the cut-line reversal), `SPEC.md` (the functional spec),
`README.md` (the index). Historical planning docs are in `archive/`.*
