# Purnaa Cap Nesting — Laser Cutting vs. Die Cutting (NEW MODE + an intentional behavior reversal)

> **Why this document exists.** A laser cutter arrives (Sept 2026). It changes one rule that the
> program currently enforces in the opposite direction. This doc defines the laser requirements, the
> die-cut vs. laser relationship, and the **one deliberate reversal** of an existing hard constraint
> so that it is recorded as *intentional* — not mistaken for a bug or "cleaned up" back to the old
> behavior. **Die cut and laser are treated the same — there is no toggle.**
>
> **Read this BEFORE the cleanup/audit pass.** The cleanup pass preserves existing behavior; this
> doc is where we say "this particular behavior is being changed on purpose."
>
> Last updated: 2026-06-15.

---

## 1. The reversal, stated plainly

**Current hard constraint (`STATUS_AND_ISSUES.md` §3):**
> "Guides are reference-only (cut lines, stitch lines, text, color fills): ignored in logic and
> **stripped from the exported output.**"

**New requirement (all styles):**
The laser cutter reads **black lines** to know where to cut. Therefore the cut lines must **survive
into the exported PDF — NOT be stripped.** This is the exact opposite of the old behavior, and it is
intentional.

**This removes the old strip-guides rule entirely rather than scoping it.** Die cut and laser are
handled the same way: black cut lines are preserved in every export. There is no mode flag. Die-cut
operators simply ignore the printed lines (and they can aid alignment).

---

## 2. Die cut vs. laser cut — the core difference

| Aspect | Die cut (today) | Laser cut (new, Sept 2026) |
|--------|-----------------|-----------------------------|
| How the shape is cut | Physical die block pressed onto stacked fabric | Laser follows a **black line** in the print |
| Do cut lines need to print? | Not strictly — but **preserved anyway** under the unified path (ignored by the die operator, can aid alignment) | **Yes** — the black line *is* the cut path; it must export |
| Scale-up factor | Santosh inflates to 104–105% for die margin | Laser is precise — scale-up likely reduced/removed (confirm at install) |
| Guides in export | **Cut line preserved** (unified path); other guides still stripped | **Cut line preserved**; other guides still stripped |
| Spacing between pieces | Determined by die placement | **Fixed geometry — see §4** |

The key mental shift: in die cutting, the cut geometry lives in a physical block, so the printed
sheet doesn't need cut lines. In laser cutting, **the printed/exported black line is the cut
instruction itself.** Remove it and the laser has nothing to follow.

---

## 3. What "black lines only" means (strict)

For the laser to operate properly, the cut lines in the pre-nest files must be:

- **Black, and only black.** No other color may be used for cut lines. The laser distinguishes the
  cut path by color; a stray non-black line, or a cut line in the wrong color, will not be cut
  correctly (or at all).
- **The only black lines on the sheet that represent cuts.** Anything that is *not* a cut path
  (stitch guides, text, registration notes) must NOT be black, or must be on a layer the export
  excludes — otherwise the laser may try to cut it. Cut = black; everything else = not black.
- **Preserved at full fidelity into the export** (no flattening that changes the line, no
  stripping). This applies to every export under the unified path.

> Practical implication for whoever builds pre-nest files: standardize on **black = cut, nothing
> else black.** This is a pre-nest authoring rule as much as an app rule.

---

## 4. Laser geometry spec (put into the operator workflow doc, M13)

The laser can cut **on the line, outside the line, or inside the line.** The option Purnaa will most
likely use is **inside the line** (the cut runs along the inner edge of the drawn line).

Required dimensions:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| Cut line width | **1.5 mm** | The black cut line must be drawn 1.5 mm wide |
| Space between shapes | **10 mm** | Minimum gap between adjacent pieces on the sheet |
| Border space | **20 mm** | Margin around the whole nested layout / sheet edge |
| Cut alignment | **Inside the line** (expected) | Laser cuts along the inner edge of the 1.5 mm line |

These values drive nesting spacing for laser styles: pieces nest with **10 mm between shapes** and a
**20 mm border**, with **1.5 mm-wide black cut lines** that export intact.

---

## 5. How this should be implemented in the app

**Design: one unified path — no laser/die-cut toggle.** Die cut and laser are treated the same way.
Black cut lines are **preserved in the export for all styles, always.** The old "strip guides from
export" behavior is **removed**, not scoped to a mode. This keeps a single code path with no mode
flag to maintain — simpler and more durable.

- **All styles:** preserve the black cut lines into the export. Apply the laser geometry as the
  standard (1.5 mm line, 10 mm between shapes, 20 mm border). The cut line is exported as-is.
- Everything else in the pipeline stays identical: match by `piece_type` label, per-slot rotation,
  no auto-scaling, refuse-and-flag on size mismatch, local-only.
- **Scale-up:** confirm at laser install whether the 104–105% die-cut scale-up still applies, is
  reduced, or is removed. (This is a value to confirm, not a separate mode.)

**Consequence to accept (deliberate):** die-cut export sheets will now also show the black cut lines
(previously stripped). For die cutting these are simply ignored by the operator and can aid
alignment; this visible change is accepted in exchange for one simple unified path.

### Guardrails for this feature (do not violate)
- **Cut lines must be black, and only black** — and nothing else on the sheet that isn't a cut may
  be black. This rule is independent of die-vs-laser; it exists so the laser never cuts the wrong
  thing. It stays in force for the unified path.
- Still **no silent fixing.** If cut lines aren't black (or something non-cut is black), the app
  should **refuse and flag**, not recolor automatically.
- Line preservation must not trigger auto-scaling or any other change to the artwork — the line is
  preserved as-is.

---

## 6. Open items to confirm at laser install (Sept)
- [ ] Exact scale-up value for laser (likely lower than 104–105%, possibly none).
- [ ] Confirm "inside the line" is the final choice vs. on/outside.
- [ ] Confirm the laser's file/format expectations match the app's PDF export.
- [ ] Confirm 1.5 mm / 10 mm / 20 mm against the installed machine's actual tested results.

---

## 7. Note for the cleanup/audit pass

The line-preservation change described here is an **approved, intentional reversal** of the §3
"strip guides" rule. It applies to **all styles** (die cut and laser are handled the same — no
toggle). The cleanup pass must **not** revert it back to stripping lines in the name of "preserving
existing behavior." If the cleanup encounters preserved black cut lines in the export, that is
correct and stays.
