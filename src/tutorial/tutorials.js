// Tutorial step data (see TutorialOverlay.jsx for the step shape).
//
// Stage 1 ships only this throwaway DEMO to prove the overlay engine —
// targeting a live control, following it on resize/scroll, and exiting
// cleanly. The real tutorials (Getting Started, How to Add a Style, How to
// Use the Run Screen) replace it in Stage 2.

export const DEMO = {
  id: 'demo',
  steps: [
    {
      target: null,
      title: 'Tutorial engine demo',
      body: [
        'This is a centered card — used for intros and troubleshooting. The app underneath stays visible and untouched.',
        'To leave at any time: click anywhere outside this box, press Esc, or hit the × — the overlay disappears completely.',
      ],
      note: 'Troubleshooting notes will look like this callout.',
    },
    {
      target: 'nav-run',
      title: 'A targeted step',
      body: 'This box points at the real "Run Screen" button and follows it — try resizing the window. "Done" closes the tutorial completely.',
      arrow: 'up',
    },
  ],
}
