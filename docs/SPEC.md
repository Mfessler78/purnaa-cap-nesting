# SPEC.md — Purnaa Cap Nesting

A browser-based tool (run locally, any computer) that automates filling pre-nested print layouts with customer artwork for cap manufacturing. Favor reliability and clear human-verification over features. See CLAUDE.md for build order and guardrails — the build order there overrides any implied order here.

## Purpose

A print operator uploads Mila-approved customer artwork, selects a cap style, fabric type, and quantity. The app places the artwork into a pre-built nested layout, replicating pieces to fill the order, then exports a print-ready PDF for RasterLink.

## The people in the workflow

- **Customer:** adds artwork on top of a template we send them; returns it. Never deals with naming/labeling.
- **Mila:** approves and ALIGNS the returned artwork so each piece sits cleanly over its template slot. Her alignment is what makes position-based matching reliable.
- **Santosh:** runs this app — selects style/fabric/quantity, uploads artwork, verifies preview, exports, prints in RasterLink.

## Data model

Each **style** (identified by a style number) consists of three stored assets:

1. **Pre-nest PDF** — master layout with many slots.
2. **Pre-nest slot map** — one row per slot:
   `style | piece_type | instance | bounding_box(x,y,w,h) | rotation(0/90/180/270)`
   Rotation is stored independently per slot. NEVER inferred from piece_type.
3. **Template piece map** — one row per piece type:
   `style | piece_type | bounding_box(x,y,w,h)`
   Defines the upright canonical position of each piece on the customer template.

Styles are saved on disk and selectable from a dropdown. New styles are created via the Mapping Tool.

## Part 1 — Mapping Tool (build the manual version first; auto-detect is M6)

Creating a style:

- Upload a **pre-nest PDF**; render it.
- **Manual (M1):** draw a rectangular box over each slot; assign piece_type (text), instance (number), rotation (0/90/180/270, default 0). Save → pre-nest slot map.
- **Auto-detect (M6 only):** auto-detect closed paths in the pre-nest as clickable slot regions; clicking a region pre-fills its box; user still assigns piece_type/instance/rotation. Manual box-drawing remains as a permanent fallback.
- Geometry contract for auto-detect: each slot is ONE closed path on a dedicated slot layer; cut lines, stitch lines, text, color fills are on separate layers and must be ignored.

Upload a **customer template PDF** (one upright instance of each piece, with guide lines). Label each piece region with its piece_type → template piece map. Same manual-first, auto-detect-later interaction.

Color fills in either file are human reference only — ignore in logic, strip from output.

## Part 2 — Run Screen (operator workflow)

Operator:
- selects a **style** (loads pre-nest PDF + both maps),
- selects a **fabric type** from a dropdown (each fabric has an editable stretch scale factor, e.g. 104%, 105% — stored in an editable fabric table, NOT hardcoded),
- enters a **quantity**,
- uploads the **Mila-approved customer artwork PDF** (artwork placed on top of the template at template scale and position).

Engine, for each pre-nest slot needed:
- read the slot's piece_type,
- take the customer artwork for that piece_type (located via the template piece map; the artwork's position/orientation relative to its template piece is the canonical UPRIGHT source),
- rotate that artwork by the slot's stored rotation,
- place it into the slot's bounding box.

### Replication and quantity
- One customer artwork per piece_type is the single source, fanned out into every matching slot.
- Round the entered quantity UP to the next multiple of 12 that is ≥ the quantity.
- Fill slots up to that count; any pre-nest slots beyond the needed count are REMOVED from output (discard unfilled slots).

### No scaling to fit
- Customer artwork and template piece MUST be the exact same physical scale.
- The engine must NOT resize artwork to fit a slot.
- If a piece's scale does not match its template piece, FLAG AN ERROR and refuse to proceed. Never silently rescale.
- The ONLY permitted scaling is the global fabric-stretch factor below.

### Fabric stretch scaling
- After placement, apply the selected fabric's scale factor UNIFORMLY to the entire output sheet. This is the only scaling step.
- (Open question to confirm with me before building M3: is the stretch uniform, or different per axis (warp vs weft)? If per-axis, support an X-factor and Y-factor per fabric. Default to uniform unless I say otherwise.)

### Metadata stamp
- Print a small but readable text stamp ONCE, in the top-left or top-right corner of the full nested sheet:
  `STYLE | FABRIC | QTY`

### Verification gate (M4)
- Before export, show a visual preview of the filled, rotated, stamped layout so the operator confirms alignment and that nothing is missing/misoriented.
- Export only on explicit approval.
- If the engine detects an unmatched piece_type, missing artwork, or scale mismatch, surface these as BLOCKING warnings on this screen.

### Export (M5)
- Output a FLATTENED, vector PDF optimized for RasterLink compatibility: flatten transparency, no live effects, non-cut guide layers/fills removed, vector preserved. **Black cut lines are preserved for the laser** (see `CLAUDE_CODE_LASER_VS_DIECUT.md`) — the app draws a 1.5 mm black cut line per piece.
- Context: Illustrator-native PDFs often fail in RasterLink due to transparency and effects. The export must produce a flattened PDF RasterLink reliably interprets. Make flatten settings easy to adjust so we can iterate against real RasterLink behavior.

## Hard rules (restate; do not violate)
- Match by piece_type; replicate one source into all matching slots.
- Rotation is per-slot, read from the map.
- Never scale to fit; fabric stretch is the only scaling, applied globally at export.
- Black cut lines ARE printed/exported (the laser follows them; die-cut ignores them) — see `CLAUDE_CODE_LASER_VS_DIECUT.md`. Other guides (stitch lines, text, color fills) never print.
- Keep UI minimal; make the human-verification steps clear.
- Local only: no cloud, no auth, no deployment.

## Test data
`./test-files/` contains a one-style sample: pre-nest, template, and template-with-artwork PDFs, including at least one 180°-flipped slot to exercise rotation. Test with low quantity (12 or 24) first. The single most important early test: load an exported PDF into RasterLink and confirm it prints cleanly.
