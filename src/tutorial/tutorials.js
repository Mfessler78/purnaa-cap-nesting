// The three tutorials as plain step data — no logic lives here.
// Step shape is documented in TutorialOverlay.jsx. `target` names a
// [data-tutorial] key (the full set is added to the screens in stage 3;
// until then those steps show as centered cards with a "not on screen"
// note). `actions` renders launch buttons that start another tutorial.
// All button/field names below are the EXACT labels in the UI.

const gettingStarted = {
  id: 'gettingStarted',
  steps: [
    {
      target: null,
      title: 'Welcome to Purnaa Cap Nesting',
      body: [
        'This program takes a customer’s approved artwork and fills it into a pre-made print layout (a "pre-nest"), placing, rotating and trimming every cap piece into its slot — then exports a print-ready PDF for RasterLink (and a cutting file for laser jobs).',
        'This tour points at the real screen — and the control it highlights stays clickable, so you can follow along for real. Leave any time: click anywhere else, press Esc, or hit the ×.',
      ],
    },
    {
      target: 'nav-run',
      title: 'Run Screen',
      body: 'The big green button is where daily work happens: pick a style, upload the customer’s artwork, fill the layout, and export the print files. There’s a full tutorial for it at the end of this tour.',
      arrow: 'up',
    },
    {
      target: 'entry-artwork',
      title: '"With artwork" jobs',
      body: 'The Run Screen first asks whether the job includes printed artwork. "With artwork" is the normal path: fill a style’s pre-nest with customer artwork and export a print PDF (plus a laser DXF on laser jobs).',
      arrow: 'up',
    },
    {
      target: 'entry-dxf',
      title: '"DXF only" jobs',
      body: 'For jobs with no printing at all: upload a pre-packed tile PDF and the program repeats it across the fabric into one laser cutting file (DXF). Nothing is printed.',
      arrow: 'up',
    },
    {
      target: 'nav-mapping',
      title: 'Style Mapping Editor',
      body: 'Where a style is set up once — teaching the program which slot on the pre-nest sheet belongs to which pattern piece, and how each is rotated. After that, anyone can run the style from the Run Screen without redoing this.',
      arrow: 'up',
    },
    {
      target: 'nav-fabrics',
      title: 'Fabrics',
      body: 'The fabric stretch table. Each fabric has a stretch scale % — see the next card for why this matters.',
      arrow: 'up',
    },
    {
      target: 'nav-fabrics',
      title: 'Adding a fabric, and what it does',
      body: [
        'On the Fabrics tab, click "+ Add fabric", type the fabric’s name and its stretch scale %, then click "Save fabrics". A scale of 104 means the sheet prints 4% larger, so the print relaxes to true size on that fabric.',
        'This stretch % is the ONLY scaling the program ever applies, and it’s applied uniformly to the whole sheet at export. Artwork is never resized to fit — if sizes don’t match, the program refuses on purpose.',
      ],
      note: 'If a run needs no stretch compensation, use a fabric entry set to 100%.',
      arrow: 'up',
    },
    {
      target: 'backup-bar',
      title: 'The sync folder (automatic sharing)',
      body: [
        'This bar shows the shared sync folder on the P drive. Set it once with the Set / Change button — from then on, every style you save or delete is shared to it automatically. There is no manual "back up now" step.',
        'Other computers pick up changes by running "Retrieve New Styles from P Drive" from the COMMAND CENTER folder. Recovery copies of every version are kept inside the sync folder’s own backups/.',
      ],
      note: 'If the P drive is disconnected when you save, the save still succeeds on this computer and a warning tells you it wasn’t shared — reconnect and save again so other computers get it.',
      arrow: 'down',
    },
    {
      target: 'office-link',
      title: 'Copy office link',
      body: 'Copies this computer’s web address so another office computer can open the same program in its browser. If the link stops working later, the address may have changed — click it again for the current one.',
      arrow: 'up',
    },
    {
      target: null,
      title: 'Learn the two main jobs',
      body: 'These two guided walkthroughs cover everything day-to-day. You can re-open this tour any time from the Tutorial button.',
      actions: [
        { label: 'How to Add a Style', tutorial: 'addStyle' },
        { label: 'How to Use the Run Screen', tutorial: 'runScreen' },
      ],
    },
    {
      target: null,
      title: 'Common errors: "artwork doesn’t match the template"',
      body: 'If the artwork’s page size isn’t identical to the template’s, the program refuses to fill. This is not a bug — it will never scale artwork to fit, because scaled caps sew wrong. Fix the artwork file (or add a template variant of that size in the Style Mapping Editor).',
      note: 'The only scaling anywhere is the fabric stretch %, applied to the whole sheet at export.',
    },
    {
      target: null,
      title: 'Common errors: a style won’t fill',
      body: 'The #1 cause: a pre-nest slot name and its template piece name don’t match EXACTLY, character for character ("sideA" is not "SideA" or "side A"). The program matches pieces by name only — check both lists in the Style Mapping Editor.',
      note: 'Also check the verification list on the Run Screen — it names exactly which piece is missing or mismatched.',
    },
    {
      target: null,
      title: 'Common errors: the export button is greyed out',
      body: [
        '"Export print PDF" stays disabled until you tick "I checked the preview below: alignment, rotation, and nothing missing." — that checkbox is the final human check before a file goes to print.',
        '"Fill layout" is greyed out until a style, cut mode, fabric and artwork file are all chosen. A cut mode showing "(not mapped)" means that style has no pre-nest mapped for that mode yet.',
      ],
      doneLabel: 'Finish',
    },
  ],
}

const addStyle = {
  id: 'addStyle',
  steps: [
    {
      target: 'nav-mapping',
      title: 'How to Add a Style',
      body: 'Everything here happens on the Style Mapping Editor. Click "Style Mapping Editor" in the header, then follow along — this tour stays on top.',
      arrow: 'up',
    },
    {
      target: 'map-style-number',
      title: '1 · Enter the style number',
      body: 'In the "Style number" box, type the name of the style (e.g. PUR560104). This becomes the style’s folder name, so use the real production number.',
      arrow: 'up',
    },
    {
      target: 'map-mode',
      title: '2 · Choose Laser or Die cut',
      body: 'On the "1. Pre-nest slots" tab, pick the cut mode you’re mapping: "Laser" or "Die cut". Each mode has its own pre-nest sheet and its own slot map, because the two cutters need different spacing. You can map the second mode afterwards the same way.',
      arrow: 'up',
    },
    {
      target: 'map-file',
      title: '3 · Upload the pre-nest PDF',
      body: 'Next to "Pre-nest PDF:", click Choose File and upload the pre-nest sheet: closed paths of your pattern template, nested together and multiplied (normally 12 caps’ worth).',
      arrow: 'up',
    },
    {
      target: 'map-detect',
      title: '4 · Auto-detect regions',
      body: 'Click "Auto-detect regions". Each closed path found appears as a dashed outline on the sheet.',
      note: 'If nothing is found, the PDF probably doesn’t contain closed vector paths — you can still draw boxes by hand by dragging on the page in Draw mode.',
      arrow: 'up',
    },
    {
      target: 'map-add-all',
      title: '5 · Verify, then add all',
      body: 'Look over the dashed outlines — one per pattern piece, none missing, none extra. Then click "Add all detected". (You can also click a single outline to add just that one.)',
      arrow: 'up',
    },
    {
      target: 'map-select',
      title: '6 · Switch to Select',
      body: 'In the editor toolbar, click "Select". Now dragging lassos boxes instead of drawing new ones.',
      arrow: 'up',
    },
    {
      target: 'map-editor',
      title: '7 · Select all instances of one piece',
      body: 'Drag a lasso around (or Shift-click) every slot that holds the SAME pattern piece — for example all 12 visors. The selected boxes highlight.',
      arrow: 'left',
    },
    {
      target: 'map-bulk-name',
      title: '8 · Name them',
      body: 'In the box on the right ("Name them all"), type the piece’s name (e.g. sideA) and click "Apply & number" — every selected slot gets that name, numbered 1–N automatically.',
      note: 'Remember this name exactly — the template piece must be given the SAME characters later, or the style won’t fill.',
      arrow: 'left',
    },
    {
      target: 'map-bulk-rotate',
      title: '9 · Check orientation',
      body: 'While the slots are still selected, check whether any need a different orientation based on the pattern: set 0° / 90° / 180° / 270° for all, or "+180° to all". Single slots can be adjusted in the table below. Rotation is saved per-slot — the program never guesses it.',
      arrow: 'left',
    },
    {
      target: 'map-editor',
      title: '10 · Repeat for every unique piece',
      body: 'Repeat steps 7–9 for each unique pattern piece (visor, sideA, sideB, back…) until every slot on the sheet has a name. The counts above the table show what you’ve labeled.',
      arrow: 'left',
    },
    {
      target: 'map-tab-template',
      title: '11 · Open "2. Template pieces"',
      body: 'Click the "2. Template pieces" tab. This side is the customer-facing template — the single sheet customers place their artwork on.',
      arrow: 'up',
    },
    {
      target: 'map-file',
      title: '12 · Upload the template PDF',
      body: 'Next to "Customer template PDF:", click Choose File and upload the customer template.',
      arrow: 'up',
    },
    {
      target: 'map-detect',
      title: '13 · Detect, double-check, add all',
      body: 'Click "Auto-detect regions", double-check the dashed outlines, then click "Add all detected" — same as before.',
      note: 'Watch the check under "Template pieces" on the right: pieces marked "rect ⚠" have no readable outline and will clip to a plain rectangle — on nested or curved pieces that copies neighbouring artwork. Fix the template before relying on the style.',
      arrow: 'up',
    },
    {
      target: 'map-side',
      title: '14 · Name the template pieces — exact match',
      body: 'In the table on the right, type each piece’s name in its row, using EXACTLY the same characters as the pre-nest slot names from step 8. Matching is by name only, character for character.',
      note: 'Mismatched names are the #1 reason a style won’t fill. "sideA" ≠ "SideA" ≠ "side A". A yellow banner also warns if two slots share the same name and number.',
      arrow: 'left',
    },
    {
      target: 'map-variant',
      title: '15 · Template size variants (if needed)',
      body: 'If customers send this style at a second page size, click "+ Add variant" and map that size’s template too (steps 12–14), so all customer artwork is accepted. At run time the program picks the variant matching the artwork’s size — it never scales.',
      note: 'All variants must share the same orientation as the pre-nest. A template rotated relative to the artwork will place pieces wrong — fix the file, don’t compensate with slot rotations.',
      arrow: 'up',
    },
    {
      target: null,
      title: '16 · Double-check everything',
      body: [
        'Before saving, check: every slot named · rotations set from the pattern · no yellow duplicate-label banner · no "rect ⚠" pieces · template names IDENTICAL to slot names.',
        'A minute here saves a failed run later.',
      ],
    },
    {
      target: 'map-save',
      title: '17 · Save style',
      body: 'Click "Save style". The style is saved to this computer and shared to the sync folder automatically — other computers get it with "Retrieve New Styles from P Drive".',
      note: 'If a message says the change was NOT shared, the P drive is disconnected — the local save still worked; reconnect and save again.',
      arrow: 'down',
    },
    {
      target: null,
      title: 'Done — now run it',
      body: 'The style is ready to use on the Run Screen.',
      actions: [{ label: 'How to Use the Run Screen', tutorial: 'runScreen' }],
      doneLabel: 'Finish',
    },
  ],
}

const runScreen = {
  id: 'runScreen',
  steps: [
    {
      target: 'entry-artwork',
      title: 'How to Use the Run Screen',
      body: 'On the Run Screen tab, the program first asks "Does this job include printed artwork?" — click "With artwork" for a normal print job, then follow along.',
      arrow: 'up',
    },
    {
      target: 'run-style',
      title: '1 · Choose the style',
      body: 'Pick the customer’s style from the "Style" list. The number of slots shown is how many pieces one sheet holds.',
      arrow: 'up',
    },
    {
      target: 'run-cutmode',
      title: '2 · Choose the cut mode',
      body: 'Pick "Die cut" or "Laser" under "Cut mode".',
      note: 'Greyed out? Pick a style first. A mode showing "(not mapped)" has no pre-nest mapped for this style — it needs mapping in the Style Mapping Editor before it can run.',
      arrow: 'up',
    },
    {
      target: 'run-fabric',
      title: '3 · Choose the fabric',
      body: 'Pick the fabric under "Fabric". Its stretch % (shown in brackets) is applied to the whole sheet at export so the print relaxes to true size — the only scaling the program ever does. For no stretch, use a 100% fabric entry.',
      arrow: 'up',
    },
    {
      target: 'run-qty',
      title: '4 · Enter the quantity',
      body: 'Type the number of caps under "Quantity". The program nests whole sheets only, so the quantity rounds DOWN to full sheets — the verification list then tells you exactly how many caps this run covers and how many remain, to be produced separately in the regular (non-nested) artwork format.',
      note: 'An order smaller than one full sheet is blocked entirely — there is nothing to nest, so the whole order goes out in the regular artwork format.',
      arrow: 'up',
    },
    {
      target: 'run-artwork',
      title: '5 · Choose the customer artwork',
      body: 'Under "Customer artwork PDF", click Choose File and pick the customer’s approved artwork file.',
      arrow: 'up',
    },
    {
      target: 'run-clip',
      title: '6 · Bleed and cut-line preferences (if needed)',
      body: 'Normally leave these as they are: "Clip artwork to piece outlines" stays on (it trims each piece to its true shape), "Bleed (in)" is how much artwork to keep past each piece’s edge, and on laser jobs "Cut line (mm)" is the printed black line the laser follows. Die-cut jobs print no cut line.',
      arrow: 'up',
    },
    {
      target: 'run-fill',
      title: '7 · Fill layout',
      body: 'Wait for the file to finish loading, then click "Fill layout". Large artwork can take a moment — a progress banner shows what’s happening.',
      note: 'Greyed out? Style, cut mode, fabric and artwork must all be chosen first.',
      arrow: 'up',
    },
    {
      target: 'run-verify',
      title: '8 · Read the verification list',
      body: 'If the artwork’s size matches the template, the fill completes and this list shows what was checked: ✓ passed, ⚠ warnings to read, ✗ blocking problems. Warnings come from the program’s own checks — piece outlines, color profile, missing artwork in a region.',
      note: 'A size-mismatch refusal is by design, not a bug: the program never scales artwork to fit. Fix the artwork file (or map a template variant of that size).',
      arrow: 'up',
    },
    {
      target: 'run-approve',
      title: '9 · Check the preview, then confirm',
      body: 'Scroll through the preview below, then tick "I checked the preview below: alignment, rotation, and nothing missing." — this is the final human check, and it unlocks the export button.',
      arrow: 'up',
    },
    {
      target: 'run-export',
      title: '10 · Export print PDF',
      body: 'Click "Export print PDF". You receive the print-ready PDF of the nested pattern pieces, named with style, fabric and quantity. On Laser jobs a matching CUT.dxf for the laser downloads automatically alongside it — no extra click.',
      arrow: 'up',
    },
    {
      target: null,
      title: 'That’s a run',
      body: 'Send the PDF to RasterLink to print (and the DXF to the laser on laser jobs). Any input change after a fill invalidates the result — you’ll fill and confirm again, which is intentional.',
      doneLabel: 'Finish',
    },
  ],
}

export const TUTORIALS = { gettingStarted, addStyle, runScreen }
