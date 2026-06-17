# Purnaa Cap Nesting — Update Plan for Claude Code

> **ARCHIVED (2026-06-16).** The M7–M17 work described here is fully built and
> committed. Rationale folded into `../ORIGIN.md`. Kept for history.

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

## 3. Hosting, durability & storage (the "survives after I leave" block — DESIGN IS DECIDED)

The owner's #1 priority for this entire block: **when the intern leaves, this must keep working,
untouched, through OS updates, with nobody technical on site.** Every decision below was made to
minimize the "works for two months then silently fails" risk. The guiding rule throughout:
**run local; depend on as little of the OS and network as possible; make every failure visible and
recoverable by a single action (double-click the icon again).**

### Decided architecture (read before building M15–M17)

- **One Windows host machine** runs the program. Everyone else reaches it by LAN address in a
  browser. There is only ever **one** style list — the host's — so "shared styles" needs no
  user-to-user syncing; everyone simply views the host. (This is the answer to the old M16.)
- **The app runs from the host's LOCAL disk.** Styles/fabric data are read and written locally —
  fast, lock-free, and never blank from a sync conflict. **The program must never run live off a
  cloud/network drive.** (See backup rule below — the P drive is a parachute, not a load-bearing
  wall.)
- **Launcher = a double-clickable icon, not an installed app.** No Tauri/Electron/bundled desktop
  app. The bundled-app route was explicitly rejected because its failure mode (OS signing /
  notarization / Gatekeeper / SmartScreen blocking it after an OS update) is silent and unfixable by
  a non-technical team. **Do not reintroduce a bundled desktop app.**
- **Serve the BUILT app, not the dev server.** The launcher runs `npm run build` output served as a
  static preview — not `npm run dev`. The dev server is not meant to run a business for months.
- **One-time setup is done by the owner before departure.** The manual may assume a correct starting
  state (built app present, bundled Node in place, port set, P-drive path set, initial styles
  loaded). The team only ever *runs* it — they never set anything up.

### M15 — The double-click launcher (Windows-first)

Build a Windows launcher (e.g. a `.bat`/`.cmd` or equivalent) that the person double-clicks. On
every run it must:

1. **Free the port first.** Kill any existing instance already running on the fixed port, then start
   fresh. This makes "just double-click it again" a universal reset/restart — the entire recovery
   story for a non-technical person. (Double-clicking twice must never start a second conflicting
   server.)
2. **Use bundled Node.** Run against a **portable Node copy that ships inside the program's own
   folder** — the host does not need Node installed system-wide. *Fallback only:* if bundled Node is
   somehow missing, check for a system Node; if that's also absent, do **not** silently install it —
   show the error window (see step 5) with plain instructions to install Node and double-click again.
   Silent/privileged auto-install is forbidden (admin-rights and IT-policy failures are exactly the
   delayed, unfixable trap to avoid).
3. **Start the built app** on the **fixed port `4173`** (pinned, documented, never changes).
4. **Run hidden/minimized while healthy.** Normal state: the launcher sits minimized in the taskbar
   and the person sees only the website in their browser. (Fully-invisible-but-recoverable is
   fragile; minimized-to-taskbar is the robust version — a small taskbar item they ignore.)
5. **Pop the window to the foreground on failure.** If the server fails to start or crashes, the
   launcher window must surface itself and show **plain-language text: what happened + what to do**
   (almost always: "close this and double-click the icon again"; for the Node case, the install
   instructions). This is the visible-error safety net that makes hidden-while-healthy safe.
6. Optionally open the host's browser to `http://localhost:4173` automatically on start.

Also provide a Mac equivalent (`.command`) as a secondary script so the choice of host OS isn't
locked in, but **Windows is the real target.**

### M15a — Copy-link button for LAN sharing

Put a small button in the app header (top-right) that copies the host's current LAN address
(`http://[detected-host-ip]:4173`) to the clipboard, so the host can paste it to another staff
computer. The program continues to live only on the host; other machines just open the link — they
never touch the server end.

- **Detect the address at runtime** — do not hardcode it. (No static IP is assumed.)
- Break-glass note to include: if the link stops working for other computers, the host's address may
  have changed — click the copy button again to get the current one.

### M16 — Local-first storage (single source of truth on the host)

Styles and `fabrics.json` live on the **host's local disk** as the one authoritative copy. Because
everyone uses the same host, edits/new styles are immediately visible to all — no per-user copies,
no cross-user sync. **Hard requirement tied to the owner's "the style list must never be blank":**
the running app reads/writes only local disk, never a synced cloud/network folder, so a sync lock or
conflict can never produce a blank or half-written style list at open time.

### M17 — Backup to the P drive (parachute, not load-bearing)

**Rule: run local, back up to the P drive — never run from it.** The P drive is the staff local
network drive; to the app it is just a folder path, so backup is a plain folder-copy with **zero
networking logic, no credentials, no sync client.**

- **P-drive path is set once by the owner during setup** and remembered by the app. (Owner doesn't
  know the path yet; the app must store a configured path, not guess one.)
- **Backup style = dated snapshots**, never overwrite-in-place. Each backup writes a new dated folder
  (e.g. `styles-backup-2026-06-15/`) so a corrupted save can't propagate into and destroy the only
  good copy. Keeping several weeks of dated snapshots is cheap and means "restore from last Tuesday"
  is always possible.
- **Two triggers:**
  - **On new-style creation:** show a prompt recommending a backup to the P drive — the one
    deliberate interruption, placed at the highest-value moment (fresh work just created).
  - **Weekly automatic check:** when the app is opened and ≥1 week has passed, if any style files
    changed since the last backup, **write the backup automatically and silently** (no dismissable
    prompt that a busy person will click past).
- **Always-visible "Last backed up: [date]" indicator** plus a manual **"Back up now"** button, so
  anyone can verify backup freshness at a glance and force one anytime.
- **Honest limitation to document in the manual + break-glass sheet:** the weekly backup only fires
  *when the app is open.* If the host is off when a week ticks over, it backs up the next time the
  app is opened — "weekly" means "checked next open after a week," not guaranteed every 7 days. The
  visible "Last backed up" date is what makes this safe: if it ever looks old, click "Back up now."
- Separately, keep a **cold copy of the whole program folder** (launcher + built app + bundled Node)
  on the P drive / shared drive, so if the host machine dies, someone can copy it to a new machine
  and restore. This is distinct from the styles backup above.

---

## 4. Owner / human tasks (NOT Claude Code build tasks — tracked here so they aren't forgotten)

- [ ] **One-time host setup before departure (owner).** Build the app, place the bundled portable
  Node in the program folder, confirm the launcher runs on port 4173, set the P-drive backup path in
  the app, load the initial styles, and place a cold copy of the whole program folder on the shared
  drive. After this, the team only ever *runs* the tool.
- [ ] **Set the actual P-drive path in the app** during setup (owner will get the real path; the app
  stores it rather than guessing).
- [ ] **One-page "if it's broken, do this" helper sheet.** Plain language, for a non-technical
  person: app won't start → close and double-click the icon again; "Node not found" → install from
  [link], double-click again; link stopped working for other computers → click the copy-link button
  again; "Last backed up" looks old → click "Back up now". *(Claude Code can draft this once M15–M17
  stabilize the failure modes; owner finalizes the wording.)*
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
6. **M15–M17** handle how the tool lives and survives in the office. Design is **already decided**
   (Windows host, double-click launcher with bundled Node, hidden-while-healthy with error popup,
   pinned port 4173, copy-link button, local-first storage, dated P-drive backups). Build to the
   spec — the open decisions are closed.

Pick up at **M7**. Report the finding. Wait for confirmation before M8.
