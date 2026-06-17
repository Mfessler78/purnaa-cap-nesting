# Purnaa Cap Nesting — Cleanup & Audit Pass for Claude Code

> **Read this before the M7 work, or as its own dedicated session.** This is a *hygiene and
> coherence* pass, not a feature change. Its single goal: make sure the program as it exists today
> is **clean, organized, and works seamlessly as one whole** — without removing or altering any
> existing feature.
>
> **Golden rule for this entire pass: SUBTRACT NOTHING THE USER CAN SEE.** No feature, option,
> button, export path, or behavior may be removed, disabled, or changed in what it does. This pass
> only *organizes, de-duplicates internally, documents, and verifies.* If cleanup would change any
> user-facing behavior, **stop and flag it — do not proceed.**
>
> Last updated: 2026-06-15.

---

## 0. Carry the project's hard constraints through every step

Same guardrails as all other work (from `STATUS_AND_ISSUES.md` §3). Nothing in a cleanup pass may
quietly violate them:

- Local only. No cloud, no auth, no external services.
- No auto-scaling / no scale-to-fit. Size mismatch = refuse + flag.
- No silent "fixing" (no auto-rotate, no auto-correct).
- Match by `piece_type` label, never by coordinates across files.
- Rotation is per-slot, read from the map.
- Guides are reference-only and stripped from export.
- Inputs keep vectors intact; only the final export may be flattened.

And the simplicity bar: the daily operator learns it in ten minutes; it must survive after the
intern leaves; it must not need a skilled person to step in when something fails.

---

## 1. How to run this pass (sequence matters)

This is **read-and-report FIRST, change SECOND.** Do not start moving files or refactoring on the
first pass. The order is deliberate so that nothing is "cleaned" before it's understood.

**Phase 1 — Hard readover (NO changes).** Read everything. Produce the audit report in §3.
**Phase 2 — Owner reviews the report** and approves which cleanups to do.
**Phase 3 — Execute approved cleanups, one category at a time**, re-verifying after each.

Do **not** collapse these phases. A cleanup pass that edits while it reads is how working features
get broken silently.

---

## 2. Phase 1 — Hard readover (produce findings, change nothing)

Do a thorough top-to-bottom read of the whole project and report what you find. Cover all of:

### 2a. Code & feature inventory
- Walk every source file. Produce a **map of all user-facing features** currently present
  (labeling tool, multi-select/bulk-name, duplicate highlighting, auto-detect, fill, per-slot
  rotation, outline clipping + bleed, stamp, fabric scale, quantity→whole-sheets, preview,
  verification gate, both export paths, etc.). This map is the **protected list** — Phase 3 must
  leave every item on it working and reachable.
- Flag any feature that is **half-built, unreachable, or wired up but not exposed** in the UI.
  Report it; do not delete it.

### 2b. Dead, duplicated, and clunky code (report, don't cut yet)
- Identify **unused files, dead code paths, commented-out blocks, and orphaned helpers** that no
  longer connect to anything.
- Identify **duplicated logic** — the same operation implemented more than once (e.g. coordinate/
  rotation math repeated in multiple places). Note where it could be unified **without changing
  behavior.**
- Identify **leftover development scaffolding**: one-off Node verification scripts, throwaway test
  outputs, scratch files, console logging left in, etc.
- Flag anything **clunky**: awkward control flow, a feature that works but takes a fragile path,
  places where two features interact roughly. Describe the roughness; propose the minimal,
  behavior-preserving cleanup.

### 2c. File-structure & naming audit
- Report the current directory layout and whether it's coherent. Look for: files in the wrong
  place, inconsistent naming, mixed concerns in one file, config/data scattered rather than grouped.
- Propose a **clean target structure** (source vs. server middleware vs. data vs. styles vs.
  test-files vs. docs) — but only as a proposal in the report. Moving files happens in Phase 3 after
  approval, and only if imports/paths are updated so nothing breaks.
- **Launchers go at the top level, clearly named by OS (owner instruction).** Both the Windows
  launcher (`.bat`/`.cmd`) and the Mac launcher (`.command`) must sit at the **top of the project
  folder** where a non-technical person sees them first — not buried in a subfolder. Rename them to
  be unmistakable about which machine they're for, e.g. **`START FOR WINDOWS`** and
  **`START FOR MAC`** (keeping the required file extension so they still run — the visible name makes
  the OS obvious). The person on the Windows host should never have to wonder which file to
  double-click.

### 2d. Styles & data integrity sweep
- Read **every style under `styles/`** and `data/fabrics.json`. For each style report: does it load,
  are its piece boxes/outlines valid, **do any paths overlap** (this directly connects to the M7
  overlap finding — record it here per-style), are there duplicate or orphaned slot entries, any
  corrupt or half-written JSON, any style referencing a missing `prenest.pdf`/`template.pdf`.
- Produce a **per-style health table**: style name → loads OK? → overlaps? → missing files? →
  notes. This doubles as the M7 evidence.
- Do **not** auto-fix style data here — bad boxes are an M8 decision. Just surface it.

### 2e. Documentation sweep
- Find **every piece of documentation** that exists anywhere in the project (`STATUS_AND_ISSUES.md`,
  this plan, the update plan, the laser-vs-die-cut doc, any READMEs, inline notes, scattered `.md`
  files).
- Report what exists, where, whether any of it is **stale, contradictory, or duplicated**, and
  whether there's a single obvious place a newcomer would look. Propose a **single clear `/docs`
  home** (or equivalent) where all current documentation lives, with a short index. Proposal only —
  consolidation happens in Phase 3.

#### 2e-i. De-duplicate and update the guides (explicit owner instruction)
A lot of guidance has **changed** over the course of building this, so older guides may now be
**stale, redundant, or contradictory.** Specifically:
- Find every "how to start," "operator guide," "workflow," or similar instructional doc.
- Report **duplicates and overlaps** — e.g. two start guides, an operator guide whose steps no
  longer match current behavior, instructions superseded by the launcher/hosting design or the
  laser changes.
- Recommend, per duplicate: **merge, update, or retire.** The goal is **one** current operator
  workflow doc (the M13 deliverable), **one** break-glass sheet, **one** hosting/setup doc — not
  several competing versions. Stale guides should be updated or removed, not left to mislead.
- **Caution:** do not delete a guide just for being old if it contains information not captured
  elsewhere — fold that information into the surviving doc first, then retire the duplicate.

#### 2e-ii. CREATE an origin / "how this program was made" document (new deliverable)
The owner wants a document that is **not** a workflow guide, but a **"this is how I built this
program and how someone could replicate building it"** narrative. Create it. It should:
- Describe **how the program came about** — the problem it solves (cap-panel nesting / fabric waste
  at Purnaa) and why it was built the way it was.
- Explain the **two-Claude workflow** that produced it: **Claude chat** (this surface) was used to
  *think through problems, weigh trade-offs, and produce structured plans*, and **Claude Code** was
  used to *implement those plans one milestone at a time, waiting for confirmation between steps.*
  Describe the back-and-forth: chat reasons and writes the plan → Code builds a milestone → owner
  confirms → next milestone. This division of labor is the core insight someone replicating it needs.
- Capture the **build philosophy** that shaped it: simplicity over sophistication, refuse-and-flag
  over silent fixing, local-only, "must survive after the builder leaves," milestone-at-a-time with
  human confirmation gates.
- Walk the **milestone history** (M0–M6 MVP and the post-MVP work) at a high level so a reader sees
  how it was sequenced and why mandatory ordering mattered.
- Be honest about **what was hard and what was reversed** (e.g. the export-size/dedup discovery, the
  Ghostscript timeout reality, the laser line-preservation reversal) so a replicator learns from the
  dead ends, not just the final state.
- Live in the `/docs` home alongside the others, clearly labeled as the origin/replication story —
  distinct from the operator workflow guide.

#### 2e-iii. Sort docs into three buckets — ARCHIVE, never hard-delete blindly
This cleanup pass **ideally runs only after all the planned work (M7–M17) is finished.** It is a
final tidy of a completed program, not a mid-build cleanup. If any milestone is still unbuilt when
this runs, the docs describing it are **live work trackers and must be protected** (see bucket 1).

When consolidating documentation, sort every doc into one of three buckets — **do not blanket-delete
the planning/instruction markdowns:**

1. **Keep & consolidate (protected).** Anything still describing work that hasn't shipped yet — the
   update plan / M-milestones, the laser doc, the break-glass sheet. These move into `/docs` but are
   **not removed.** A planning doc for unbuilt work is never deleted.
2. **Fold into the origin doc, then archive.** Planning docs whose reasoning is **fully captured in
   the origin / "how this was made" doc** AND whose work is **fully built and confirmed.** Only once
   the origin doc demonstrably contains the decisions and rationale does the now-redundant planning
   doc get moved to archive.
3. **Archive (not hard-delete).** Genuinely superseded material — old start guides, stale operator
   drafts, replaced versions — goes into an **`archive/`** (or `docs/old/`) folder rather than being
   erased. Disk space is free; lost reasoning is not. Hard deletion of project history is an
   irreversible action and is avoided here in keeping with the project's "more failsafes than less"
   priority.

> Rule of thumb: **consolidation is the goal; deletion is never the goal.** Move things to `archive/`
> and let the owner confirm nothing unique was lost before anything is permanently removed. Never
> delete a doc just for being old if it holds information not yet captured elsewhere.

### 2f. Intentional behavior changes — do NOT "clean" these back
Some recent decisions deliberately change prior behavior. The cleanup pass must treat these as
**correct and protected**, not as inconsistencies to revert:
- **Line preservation in export** (see `CLAUDE_CODE_LASER_VS_DIECUT.md`): black cut lines are now
  **kept** in the export for **all styles** — the opposite of the old "strip guides" rule. Die cut
  and laser are handled the same (no toggle). This is an approved, intentional reversal. Do not
  revert it to stripping lines. The "black, and only black, for cuts" rule stays in force.

### 2g. Seamless-operation check (the "do they work together" part)
- Trace the **happy path end to end**: pick style → pick fabric → enter quantity → upload artwork →
  preview → verify → export. Confirm each handoff is clean and report any rough seam.
- Trace the **mapping path end to end**: upload pre-nest → auto-detect / draw boxes → multi-select →
  name → rotate → save style. Confirm each step hands cleanly to the next.
- Report any place where two features **work individually but interact awkwardly** (e.g. auto-detect
  output feeding the labeling step, clipping interacting with bleed, quantity model interacting with
  export). These are the "clunky together" spots the owner specifically wants smoothed.

---

## 3. The audit report (deliverable of Phase 1)

Produce one written report containing:
1. **Protected feature list** (everything that must still work after cleanup).
2. **Per-style health table** (loads / overlaps / missing files / notes).
3. **Cleanup candidates**, grouped: dead code · duplicated logic · scaffolding/scratch · file moves ·
   doc consolidation · clunky seams. Each with a one-line, behavior-preserving proposed action and a
   risk note.
4. **Anything that looks half-built or unreachable** (report, owner decides keep/expose/leave).
5. A recommended **safe execution order** for Phase 3.

**Stop after the report. Wait for owner approval before changing anything.**

---

## 4. Phase 3 — Execute approved cleanups (after sign-off, one category at a time)

Only after the owner approves. Then, **one category at a time, re-verifying the happy path and the
mapping path after each:**

- Remove only the dead code / scaffolding the owner approved. Re-verify.
- Unify only the duplicated logic the owner approved — **prove behavior is identical** before and
  after (this is where the M14 test suite, if it exists yet, earns its keep; if not, verify by
  hand against a real style + real artwork). Re-verify.
- Move files into the agreed structure, updating every import/path so nothing breaks. Re-verify the
  app still starts and both paths still work.
- Consolidate documentation into the single `/docs` home with a short index README that points to:
  the operator workflow doc (M13), the break-glass sheet, the hosting/setup doc, the laser-vs-die-cut
  doc, the **origin / "how this was made" doc** (§2e-ii), this cleanup record, and the update plan.
  **Merge or retire duplicate guides** (§2e-i) so there is exactly one current version of each —
  folding any unique information from a stale guide into the survivor before retiring it.
- Leave styles/data **untouched** except where the owner explicitly approved a fix (bad-box fixes
  remain M8's job, not this pass).

After each category, confirm: **every item on the protected feature list still works and is still
reachable in the UI.** If any feature changed behavior or disappeared, revert that step and flag it.

---

## 4b. Phase 4 — Final full-program backup (after cleanup is verified complete)

Once the cleanup is finished and every protected feature is verified working, **prompt the owner and
then create one large backup of the ENTIRE program** — not just styles, the whole thing (source,
built app, bundled Node, launchers, data, styles, and `/docs`) — into the **owner-configured backup
directory** (the P-drive path set during host setup; the same location the routine styles backups
use).

- This is a **dated, full-program snapshot** (e.g. `full-program-backup-YYYY-MM-DD/`), separate from
  the routine styles-only backups — it captures the clean, post-cleanup state as a known-good
  restore point.
- **Confirm the backup path is set and reachable BEFORE attempting the copy.** If the configured
  backup directory is missing or not set, **stop and tell the owner** — do not silently skip the
  backup and do not guess a path. A backup that fails quietly is worse than no backup, because it
  creates false confidence.
- **Verify the copy after writing it** (the snapshot folder exists and is non-empty) and report
  the snapshot location and size back to the owner. The backup is only "done" once verified, not
  once the copy command returns.
- This is the one place the cleanup pass writes to the backup directory; everything else in this
  pass only reorganizes within the program folder.

---

## 5. Done criteria

The cleanup pass is complete when:
- Every pre-existing user-facing feature still works and is reachable (protected list verified).
- No dead code, scratch files, or stray dev scripts remain in the shipped folders (or they're
  clearly quarantined in a `dev/` area, not deleted if the owner wanted them kept).
- The directory structure is coherent and consistently named; imports/paths all resolve. **Both
  launchers sit at the top level, clearly named (`START FOR WINDOWS`, `START FOR MAC`)** so the right
  one is obvious at a glance.
- All current documentation lives in one clear place with an index a newcomer can follow, with
  **exactly one current version of each guide** (no duplicate start/operator/workflow docs), and the
  new **origin / "how this was made" doc** present.
- Any **intentional behavior changes** (e.g. laser-mode line preservation) are **preserved**, not
  reverted — confirmed against the laser-vs-die-cut doc.
- The happy path and the mapping path both run clean end to end, with the previously-noted clunky
  seams smoothed **without behavior change.**
- The per-style health table is recorded (and hands its overlap findings to M7/M8).
- A **verified, dated full-program backup** has been written to the owner's configured backup
  directory (P drive), confirmed non-empty, and its location reported — capturing the clean
  post-cleanup state as a known-good restore point.

> Reminder, one more time: this pass makes the program **cleaner, not smaller.** If a step would
> remove or change what the user can do, that's out of scope — stop and flag it.
