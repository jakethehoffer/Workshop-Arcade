# Contributing to Workshop Arcade

Workshop Arcade is intentionally static: games are single HTML files in `websites/`, catalog data lives in `websites/manifest.json`, and cover art lives in `covers/`.

## Add or Update a Game

1. Add or edit the game file in `websites/`.
2. Add or update a cover in `covers/`.
3. Update `websites/manifest.json`.
4. Include `websites/workshop-runtime.js` before game scripts so sandboxed play has safe storage fallback.
5. Follow `docs/game-contract.md` (in particular: visual cohesion pattern, modal/overlay accessibility, and diagnostic hooks).
6. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run test:a11y
npm run test:games
npm run capture:games
```

`npm run test:a11y` and `npm run capture:games` must both pass cleanly — every rendered surface scores 0 in the capture harness.

## Remove a Game

Remove all of these together:

- Its `websites/*.html` file
- Its cover image or SVG
- Its `websites/manifest.json` entry

Then run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix` so `FALLBACK_GAMES` stays synchronized.

## Workshop Requests

Use the catalog's `Improve` button to generate an AI-ready brief. Submitting it opens a pre-filled GitHub issue with the `workshop-request` label already attached, which surfaces it in the Improvement Queue on the catalog.

The `Workshop Request Triage` workflow adds implementation labels and a checklist comment with deep links to the affected game file. It does not run AI code generation or require API keys.
