# CLAUDE.md — Operating Rules for This Project

You are building **Purnaa Cap Nesting**, a local web app that fills pre-nested print layouts with customer artwork for cap manufacturing. Read `docs/SPEC.md` for the full functional specification. This file governs HOW you work. Follow it on every session. All other documentation lives in `docs/` (see `docs/README.md`).

## Prime directives

1. **MVP first, always.** Build the smallest thing that works end-to-end before adding anything. Do not build features out of order. The build order in `docs/SPEC.md` is mandatory, not a suggestion.
2. **Stop and confirm before scope changes.** If you think something in `docs/SPEC.md` is wrong, incomplete, or should be done differently, STOP and ask me before changing course. Do not silently reinterpret requirements.
3. **One thing at a time.** Complete and let me test each milestone before starting the next. After finishing a milestone, tell me exactly how to run and test it, then wait.
4. **No silent magic.** Never auto-scale, auto-rotate, or "fix" artwork in ways not specified. When the spec says refuse-and-flag, you refuse and flag — you never quietly correct.

## Build order (MVP path — do not deviate)

Build these in sequence. Do not start a milestone until I confirm the previous one works.

- **M0 — Skeleton.** Project scaffolds, runs locally with `npm run dev`, opens in browser, shows an empty shell. Git initialized.
- **M1 — Manual labeling tool.** Upload a pre-nest PDF, render it, let me DRAW rectangular boxes over slots and label each with piece_type + instance + rotation (0/90/180/270). Save as a style's slot map (JSON on disk). Same for the customer template (piece_type only). NO auto-detection yet.
- **M2 — Fill + rotate + place.** Given a style, an uploaded customer artwork PDF, and a quantity, place artwork into slots by piece_type, rotated per slot. Replicate one source per piece_type into all matching slots. Round quantity UP to next multiple of 12, discard unfilled slots.
- **M3 — Stamp + fabric scale.** Add the corner metadata stamp (STYLE | FABRIC | QTY) and the global fabric-stretch scale factor (editable fabric table). 
- **M4 — Preview + verification gate.** Visual preview before export; block export on missing/mismatched pieces or scale mismatch.
- **M5 — Export.** Flattened, RasterLink-compatible vector PDF. Strip guide layers/fills.
- **M6 — Auto-detect (LAST, riskiest).** Only after M1–M5 work: auto-detect closed paths in the pre-nest PDF as clickable slots, keeping manual box-drawing as a permanent fallback.

**Critical:** RasterLink compatibility (M5) is the highest-risk unknown after auto-detect. As soon as M5 produces any PDF, I will test it in RasterLink. Build M5 to be easy to re-export with different flatten settings so we can iterate on compatibility fast.

## Technical constraints

- **Stack:** Keep it simple and local. Prefer a single modern framework I can run with `npm run dev` (your choice — React/Vite is fine). Avoid heavyweight backends; local file storage (JSON + the PDFs) is enough. If you must add a small local server for file handling, keep it minimal and document why.
- **No cloud, no accounts, no auth, no deployment.** This runs on one Mac in a browser. Do not add login, hosting, or external services.
- **PDF handling:** Input PDFs keep their vector paths intact (do NOT flatten inputs). Only the final EXPORT is flattened. Pick a PDF library that can read vector paths and write flattened vector PDF; tell me what you chose and why.
- **Coordinates:** Slots are stored as bounding boxes. Template and pre-nest are DIFFERENT artboards/coordinate spaces — match by piece_type label, never by absolute coordinates across files. Artwork's position relative to its template piece is the canonical upright source.
- **Rotation is per-slot**, read from the saved map. NEVER infer rotation from piece_type. Pieces of the same type may have different rotations.
- **No scale-to-fit. Ever.** Customer artwork and template piece must be identical physical scale. If they differ, FLAG AND REFUSE — do not resize. The only scaling is the global fabric-stretch factor at export.
- **Cut lines are PRESERVED in the export** (the laser follows the black cut line; die-cut operators ignore it). This is an intentional reversal of the old "strip all guides" rule — see `docs/CLAUDE_CODE_LASER_VS_DIECUT.md`. **Other guides (stitch lines, text, color fills) stay reference only:** ignore them in logic and strip them from output.

## Working style

- Use git. Commit after each working milestone so I can roll back. Use clear commit messages.
- Read the test PDFs in `./test-files/` to develop against real data, not assumptions.
- When something is ambiguous, ask me — do not guess and build on the guess.
- Keep the UI minimal, clear, and oriented around the human verification steps (Mila aligns; Santosh runs and approves).
- Explain what you're about to do before large changes. Keep me oriented.
- Tell me, at the end of each milestone, the exact terminal commands and browser steps to test it.

## What "done" looks like for the MVP

A print operator can: pick a style, pick a fabric, enter a quantity, upload Mila-approved artwork, see a correct filled+rotated+stamped preview, and export a PDF that RasterLink opens and prints cleanly. Manual labeling is acceptable for MVP; auto-detection is a later enhancement.
