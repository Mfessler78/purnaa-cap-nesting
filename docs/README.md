# Purnaa Cap Nesting — Documentation

All documentation for the project lives in this folder. Start here.

## If you want to…

| …do this | …read this |
|---|---|
| **Run a print job** (the daily task) | [`WORKFLOW.md`](WORKFLOW.md) — Stages 5–6 |
| **Set up a new cap style** (Illustrator + mapping) | [`WORKFLOW.md`](WORKFLOW.md) — Stages 1–4 |
| **Start / restart the app on the office computer** | [`HOW_TO_START.md`](HOW_TO_START.md) |
| **Understand why the app exists and how it was built** | [`ORIGIN.md`](ORIGIN.md) |
| **Understand the laser cut-line rule** (intentional reversal) | [`CLAUDE_CODE_LASER_VS_DIECUT.md`](CLAUDE_CODE_LASER_VS_DIECUT.md) |
| **Read the functional specification** | [`SPEC.md`](SPEC.md) |
| **Understand the code structure & invariants** (before editing code) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| **See what changed recently** | [`CHANGELOG.md`](CHANGELOG.md) |
| **See the cleanup/audit pass record** | [`CLAUDE_CODE_CLEANUP_AUDIT.md`](CLAUDE_CODE_CLEANUP_AUDIT.md) (the plan) and [`CLEANUP_AUDIT_FINDINGS.md`](CLEANUP_AUDIT_FINDINGS.md) (the Phase 1 report) |

The project's operating rules for the coding assistant are kept on the owner's master
copy only (not tracked in this repo).

## The one current version of each guide
There is exactly **one** of each, on purpose:
- **One operator workflow** → `WORKFLOW.md` (the old condensed `OPERATOR_GUIDE.md` was merged into it).
- **One hosting/start guide** → `HOW_TO_START.md`.
- **One origin/replication story** → `ORIGIN.md`.

A **break-glass "if it's broken, do this" one-pager** for non-technical staff is still an owner
to-do (noted in the archived update plans); it has not been written yet.

## archive/
Superseded or fully-built planning material, kept for history — **not** current instructions:
- `archive/CLAUDE_CODE_UPDATE_PLAN.md`, `archive/CLAUDE_CODE_UPDATE_PLAN2.md` — the M7–M17 plans
  (all built; rationale folded into `ORIGIN.md`).
- `archive/STATUS_AND_ISSUES.md` — the original briefing/discussion doc.
- `archive/OPERATOR_GUIDE.md` — the old condensed daily guide, now merged into `WORKFLOW.md`.
