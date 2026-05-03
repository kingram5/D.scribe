# Unused / Obsolete Code Audit

Date: 2026-05-03

## Scope
- Static lint-based audit for dead/unused code paths and obviously obsolete artifacts.
- Command used: `npm run lint`.

## Removed as obsolete
- Deleted two unreferenced generated bundles from repo root:
  - `1773455431867-player-script.js`
  - `1773455431874-player-script.js`

These files were not imported or referenced anywhere in `src/`, `public/`, scripts, or configs.

## Unused code cleaned
- Removed unused `JobProgress` import and unused state in analysis page.
- Removed unused audience options constant in analysis page.
- Removed unused `MenuSection` import in generate page.
- Removed unused React `useCallback` import in transcript page.
- Removed unused `projectTitle` state in structure page.

## Remaining issues (not auto-removed)
The lint run still flags additional issues that need functional decisions before cleanup:
- Hook purity/ref violations in transcript/outline/editor related state flow.
- Type-safety issues (`any`) in R2/Deepgram/upload-url routes.
- CommonJS `require` warnings in worker scripts.
- Miscellaneous unused variables in several components.

These were intentionally left for a follow-up pass because they may require behavior changes rather than straightforward dead-code deletion.
