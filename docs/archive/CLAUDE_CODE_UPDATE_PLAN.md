# Purnaa Cap Nesting — Update Plan for Claude Code

> **ARCHIVED (2026-06-16).** Superseded by `CLAUDE_CODE_UPDATE_PLAN2.md` (which locked
> the hosting design) and fully built (M7–M17 are all committed). Rationale folded
> into `../ORIGIN.md`. Kept for history.

> **Read this first.** This is a sequenced work plan, not a command to build everything at once.
> Work **one milestone at a time and wait for owner confirmation** before starting the next —
> exactly as the MVP (M0–M6) was built. Several items below are **investigation-only**: do not
> change code until the finding is reported and the owner approves a direction.
>
> Last updated: 2026-06-15.

---

## 0. Non-negotiable values (carry these through every change)

These come straight from the existing project rules (`STATUS_AND_ISSUES.md` §3) and the operating
philosophy. Every fix below must respect them. If a fix would break one, stop and flag it.

- **Local only.** No cloud, no auth, no external services. (The networked-access item below is
  LAN-only, still no cloud.)
- **No auto-scaling / no scale-to-fit.** Size mismatch = refuse + flag, never silently resize.
- **No silent "fixing"** (no auto-rotate, no auto-correct). Refuse-and-flag instead.
- **Match by `piece_type` label**, never by absolute coordinates across files.
- **Rotation is per-slot, read from the map** — never inferred from piece type.
- **Guides are reference-only** and stripped from export.
- **Inputs keep their vectors intact;** only the final export may be flattened.

### The simplicity bar (this overrides cleverness)

The daily operator must be able to learn the tool in **ten minutes**. The system must survive after
the intern leaves and must **not** require a skilled person to step in when something fails. When a
choice exists between "make the operator decide" and "make the default always correct so there is no
decision," **choose the second.** Reliability beats sophistication.

---

## 1. Confirmed root-cause finding (this reorders everything)

The owner has confirmed: **the piece paths/boxes overlap in the style-building (mapping) phase.**

This means the clipping problems reported on real artwork (visor pieces clipped; side-panel
identifying text lost) are **most likely a bad-input-data problem, not a fill-engine or clip-math
problem.** The fill engine may be doing exactly what it's told — it's being told the wrong shapes.

**Consequence for sequencing:** Do not "improve" clip geometry or the rectangle fallback until the
overlapping-box problem at the mapping stage is understood and addressed. Fixing downstream clipping
for bad upstream boxes would be building the wrong fix.

---

## 2. Work sequence

Milestones are ordered so that **investigations and root-cause fixes come before cosmetic or
convenience work**, and so that nothing is built on top of a known-bad foundation.

### M7 — INVESTIGATION ONLY: why do mapped paths overlap? (no code changes)

**Goal:** Understand, in the stored style data, *why* piece boxes/outlines overlap during the
build/mapping phase. Report findings before touching anything.

Investigate and report:
- For a real affected style (e.g. the visor + side-panel case), inspect the stored `style.json`
  outlines/boxes. Do the stored shapes actually overlap, or do they only *appear* to overlap on
  screen?
- Is the overlap coming from (a) the auto-detect outline recovery capturing the wrong/oversized
  bounding shape, (b) the manual box-draw being imprecise, or (c) the template artboard itself
  having pieces whose true outlines genuinely abut/overlap?
- Specifically for the **visor** (concave crescent) and **side panels**: is the recovered outline
  the true piece shape, or a rectangle/convex hull that swallows neighboring pieces' area (which
  would explain both the visor clip loss and the side-panel text bleed)?

**Output:** a short written finding — *where* the overlap originates and *which* of the causes above
it is — plus a recommended fix direction. **No code changes in this milestone.** Owner picks the
direction before M8.

---

### M8 — FIX: correct the overlapping-box problem at its source

**Depends on M7's finding.** Likely shapes this could take (owner confirms which after M7):
- If auto-detect is recovering bad outlines: tighten the shape recovery so concave pieces (visor)
  keep their true outline and don't capture neighbor area.
- If the issue is manual imprecision: give the mapping tool a way to see/verify overlap (e.g.
  highlight overlapping piece areas in the mapping canvas so the person fixes them *before* saving),
  consistent with the existing duplicate-slot-highlighting pattern.
- Whatever the fix: **refuse-and-flag** overlapping geometry rather than silently trimming it.

**Test:** re-run the same customer artwork that clipped. Visor pieces must keep full artwork;
side-panel identifying text must survive.

---

### M9 — Selection parity in the mapping tool (the convenience items, grouped)

These three are one coherent piece of work — selection mechanics — so they belong together.

- **Shift+click extends a box-draw selection.** While selecting by drawing a box, `shift+click`
  adds more rectangles to the current selection so auto-numbering covers them in one pass.
- **Multi-select assigns rotation, not just names.** Whatever can be multi-selected for bulk naming
  can also be multi-selected to apply rotation.
- **"Add 180°" to a multi-selection in one action.** Apply +180 to every selected slot at once.

**Constraint reminder:** rotation stays **per-slot, stored in the map**. Applying +180 to a
selection just writes that value to each selected slot — it does not infer rotation from piece type.

---

### M10 — Delete a style, with a confirmation guard

A way to delete a style that is protected by an explicit confirmation step so accidental deletion
cannot happen. Confirmation must name the style being deleted. **Build confirmation only — not
undo.** (Undo is deliberately out of scope to keep the tool simple; the confirmation prevents the
accident, which is what's needed.)

---

### M11 — Progress feedback on long operations

Fill and (especially) the Ghostscript flatten can run many seconds/minutes with the UI just showing
"Filling…". Add clear progress / "this can take several minutes" feedback so the operator never
wonders if it has frozen. This also directly supports the Ghostscript UX work in M12.

---

### M12 — Ghostscript: make the default always right, plus a fallback that never errors

**Reframe to fit the simplicity bar.** The operator should **not** have to choose between vector and
flatten in normal use. The original "teach them when to use each" approach asks for a judgment call,
which is the if/then branching the project is trying to avoid.

- **Default = direct vector**, which is RasterLink-proven and now compact. The operator's normal
  path is: fill → verify → export. No decision.
- **Flatten = a single, clearly-labeled fallback button** for the rare RIP-transparency case, with
  the "this can take several minutes" note from M11 and a **longer timeout** so that when it *is*
  used, it completes instead of erroring at 120s. (gs needs ~163s on the heavy soft-mask case.)
- The *operator* never decides. The decision is documented for whoever maintains the tool, in the
  workflow doc (M13) — not surfaced as a daily choice.

---

### M13 — Operator workflow / training document (one teachable artifact)

A short, plain-language document that teaches the daily process in the ten-minute spirit:
pick style → pick fabric → enter quantity → upload approved artwork → check the verification panel
→ export. The vector-vs-flatten explanation lives **here**, framed as "you almost never touch
flatten; here's the one rare reason it exists," **not** as a decision the operator makes each time.

---

### M14 — Automated test suite

A small regression suite covering the subtle, breakage-prone math so future changes are safe:
fill math, rotation anchors, clip geometry, size-mismatch refusal, and — now that M8 exists —
**overlap detection in mapped styles.** This protects every fix above from silent regression.

---

## 3. Server / hosting & durability (groups several items — plan before building)

These three are related and touch how the tool lives in the office long-term. Treat the design as a
**discussion + plan step first**, then build, because the "shared styles" requirement changes the
storage model.

### M15 — Run on an office machine, reachable by other computers on the LAN
- Runnable on an office computer **without anyone babysitting a terminal**: a one-click launcher or
  auto-start, easy for a non-technical person.
- Other machines on the local network can reach it. **Still local-only — LAN, not cloud.**
- Include a plain-language "how to start it" note.

### M16 — Shared styles replicate across the server, not per-user
**Important design change.** If multiple people use the networked app and someone adds or edits a
style, that change must be visible to **everyone** — styles live with the **server/shared store**,
not in a per-user/per-browser location. Plan the storage model so style + fabric data is the single
shared source of truth on the host machine. (Confirm this design with the owner before implementing —
it affects where `styles/` and `data/fabrics.json` live and how they're read/written.)

### M17 — Backup of styles + fabric data
Everything is JSON + PDFs on one machine's disk; if that machine dies, all mapped styles die with
it. Provide a **dead-simple** backup path — e.g. a documented "copy this one folder to a USB stick
weekly" instruction, or a one-click "export all styles to a backup folder." Simplicity over
automation: a clear manual instruction the team will actually follow beats a clever sync nobody
understands.

---

## 4. Owner / human tasks (NOT Claude Code build tasks — tracked here so they aren't forgotten)

- [ ] **One-page "if it's broken, do this" helper sheet.** Plain language, for a non-technical
  person, for when the app won't start or won't export. This matters as much as any feature because
  the tool has to survive after the intern leaves. *(Owner writes this; Claude Code can draft it
  once M12–M15 stabilize the failure modes.)*
- [ ] **Decide the weekly backup habit** (who does it, to where) once M17 gives the mechanism.
- [ ] **A faster way to create the templates themselves** (process/tooling, outside the app). This
  is upstream of the M7/M8 overlap problem — slow, manual template creation is likely where the bad
  boxes originate. Worth solving at the source, but it is a process question, not an app milestone.

---

## 5. Why this order

1. **M7 first (investigate, don't build)** because the confirmed overlapping-box finding means the
   clipping symptoms are probably bad input data. One cheap investigation step prevents building the
   wrong fix.
2. **M8 next** fixes the real root cause, so every later test runs against correct geometry.
3. **M9–M11** are low-risk convenience/clarity wins that make daily use and the Ghostscript work
   smoother.
4. **M12–M13** resolve Ghostscript the simple way — eliminate the operator's decision, document it
   for the maintainer.
5. **M14** locks in everything with tests, including the new overlap check.
6. **M15–M17** handle how the tool lives and survives in the office, with the shared-styles design
   decided before it's built.

Pick up at **M7**. Report the finding. Wait for confirmation before M8.
