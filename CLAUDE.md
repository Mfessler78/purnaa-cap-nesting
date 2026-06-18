# CLAUDE.md — Operating Rules for This Project

You are working on **Purnaa Cap Nesting**, a local single-user web app that fills
pre-nested print layouts with customer artwork for cap manufacturing. The MVP is **built
and working**. We are now in an **optimization phase**: improving the program piece by
piece without breaking it, keeping the file structure clean, and preventing back-end bloat.

- For *what the app does* and *where things live*, read `docs/ARCHITECTURE.md` first.
- For *the full functional spec*, read `docs/SPEC.md`.
- This file governs **how you work**. Follow it every session.

---

## 0. Read before you touch anything

At the start of a task, before editing code:

1. Read `docs/ARCHITECTURE.md` (the map — what each file does, the data flow, the
   invariants). Do not rediscover the architecture by grepping the whole tree.
2. If the task touches a specific module, read **only** that module and its direct
   collaborators (ARCHITECTURE.md lists them). Do not load the whole `src/` tree.
3. If anything in ARCHITECTURE.md looks stale or wrong, **say so and ask** — do not
   silently work around it.

Goal of this discipline: keep each change small, well-scoped, and cheap.

---

## 1. Prime directives (optimization phase)

1. **Don't break working behavior.** The MVP works and prints correctly through
   RasterLink. Every change must preserve current output unless the task explicitly says
   to change it. When in doubt, preserve.
2. **One small change at a time.** Make the smallest change that achieves the goal. Finish
   it, tell me exactly how to verify it, then stop and wait. Do not bundle unrelated
   improvements.
3. **Stop and confirm before structural changes.** Moving files, renaming, changing the
   data-on-disk format, changing a module's public interface, or adding a dependency —
   propose it first and wait for my yes.
4. **No silent magic.** Never auto-scale, auto-rotate, or "fix" artwork in ways not
   specified. Where the spec says refuse-and-flag, you refuse and flag.
5. **No bloat.** Prefer deleting to adding. Do not add a dependency when a few lines of
   local code will do. Do not leave dead code, commented-out blocks, or "just in case"
   abstractions behind.

---

## 2. The hard constraints (never break without explicit sign-off)

These are correctness invariants. Optimization must not violate them. They are explained
in full in `docs/ARCHITECTURE.md §Invariants`, summarized here:

- **No auto-scaling / no scale-to-fit.** Size mismatch = refuse + flag, never resize. The
  only scaling is the global fabric-stretch factor at export.
- **Match by `piece_type` label**, never by absolute coordinates across files (template
  and pre-nest are different coordinate spaces).
- **Rotation is per-slot**, read from the saved map — never inferred from piece type.
- **Cut lines are preserved in export** (laser follows them; die-cut ignores them). Other
  guides (stitch lines, text, fills) are reference-only: ignored in logic, stripped from
  output. See `docs/CLAUDE_CODE_LASER_VS_DIECUT.md`.
- **Inputs keep their vectors intact;** only the final export may be flattened.
- **Local only.** No cloud, no auth, no accounts, no deployment. One Mac, one browser.
- **Direct-vector export is the proven path.** Ghostscript flatten is a rarely-used
  fallback, intentionally left as-is. Do not "improve" it without being asked.

If a change seems to require breaking one of these, **stop and ask** — that is a
spec-level decision, not an implementation detail.

---

## 3. How to make a change

1. **Scope it.** State, in one or two sentences, what you're changing and which files
   you'll touch. Confirm the files against ARCHITECTURE.md.
2. **Check the blast radius.** List what else imports or depends on what you're editing
   (ARCHITECTURE.md's dependency notes help). Name anything that could break.
3. **Make the minimal edit.** Touch the fewest files possible. Keep changes local to the
   module that owns the concern. Don't refactor adjacent code "while you're in there."
4. **Test it.** Run the relevant test(s) in `tests/`. If the change isn't covered by a
   test and is non-trivial, add a focused test for it.
5. **Report.** Tell me exactly what changed, why, the terminal/browser steps to verify,
   and what to watch for. Then stop.

If a task is bigger than one small change, **break it into an ordered list of small
changes** and do them one at a time, waiting for confirmation between each.

---

## 4. File hygiene (where things go)

Keep the working tree clean. The canonical layout is in `docs/ARCHITECTURE.md`; the rules:

- **Application source** lives in `src/`. Logic in `src/lib/`, React UI as `src/*.jsx`.
- **The tiny dev-server middleware** lives in `server/`. Keep it minimal.
- **Style data** lives in `styles/<STYLE_NAME>/` as `style.json` + `prenest.pdf` +
  `template.pdf`. Do not invent new per-style file shapes without sign-off.
- **Real test PDFs** live in `test-files/`; **test fixtures/specs** in `tests/`. Don't mix.
- **Docs** live in `docs/`. Superseded docs go to `docs/archive/`, they are not deleted
  silently and not left at root.
- **Scratch/experiments** go in `dev/`. Never leave scratch files in `src/`, `server/`,
  or the repo root.
- **Never create a new top-level folder or root-level file** without asking. The root is
  already crowded; new clutter there is a regression.
- **Do not edit, add to, or reorganize** `node/`, `node_modules/`, or `dist/`. These are
  generated/vendored and should not be in scope. (If git is tracking them, flag it — see
  ARCHITECTURE.md cleanup targets — but don't act without sign-off.)

When you add a file, say in your report **why it goes where it goes**. When you're tempted
to add a file, first check whether an existing file is the right home.

---

## 5. Preventing back-end bloat

The "back end" is the Vite middleware in `server/` plus `src/lib/`. Keep it lean:

- **No new dependencies** without sign-off. We already have `pdf-lib`, `pdfjs-dist`, and
  an optional Ghostscript shell-out — that is the whole PDF stack. Prefer them.
- **No duplicated logic.** If two places do the same thing, propose consolidating into one
  function in `src/lib/` rather than copy-pasting.
- **No speculative abstraction.** Don't add config systems, plugin layers, or generalized
  helpers for cases we don't have yet.
- **Watch output size.** The fill engine had a duplication bug (embedded artwork once per
  piece-type → ~6× file size). Any change to fill/embed must keep the
  **embed-once-share-everywhere** behavior. If a change could grow export size, measure
  before/after and report it.
- **Delete as you go.** If you replace code, remove the old code in the same change. Leave
  the tree smaller or the same, not larger.

---

## 6. Tooling & workflow

- The app runs with `npm run dev` (Vite). There is no separate server process.
- Use git. Commit after each verified small change with a clear, specific message
  (`fix:`, `refactor:`, `perf:`, `chore:` prefixes preferred). Commit so I can roll back
  one change at a time.
- Develop against the real PDFs in `test-files/`, not assumptions.
- Keep `docs/ARCHITECTURE.md` current: if a change adds/removes/moves a module or alters
  the data flow or an invariant, **update ARCHITECTURE.md in the same change** and say you
  did.
- Maintain a one-line-per-change note in `docs/CHANGELOG.md` (create it if absent) so the
  next session — and the chat assistant I plan with — can see what moved recently without
  re-reading code.

---

## 7. When something is ambiguous

Ask. Do not guess and build on the guess. A short clarifying question is cheaper than a
wrong change that has to be unwound. One question at a time; address what you can before
asking.

---

## 8. Definition of done for an optimization change

- Behavior preserved (or changed exactly as requested), verified against `test-files/`.
- Relevant tests pass; a focused test added if the change warranted one.
- No new dependency, no dead code, tree no larger than before.
- `docs/ARCHITECTURE.md` and `docs/CHANGELOG.md` updated if structure/flow changed.
- A clear report: what changed, why, how to verify, what to watch.
- Committed with a clear message. Then you stop and wait.
