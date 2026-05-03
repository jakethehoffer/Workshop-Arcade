# Contributing to Workshop Arcade

Workshop Arcade is intentionally static: games are single HTML files in `websites/`, catalog data lives in `websites/manifest.json`, and cover art lives in `covers/`.

## Add or Update a Game

1. Add or edit the game file in `websites/`.
2. Add or update a cover in `covers/`.
3. Update `websites/manifest.json`.
4. Include `websites/workshop-runtime.js` before game scripts so sandboxed play has safe storage fallback.
5. Follow `docs/game-contract.md`.
6. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run test:games
```

## Remove a Game

Remove all of these together:

- Its `websites/*.html` file
- Its cover image or SVG
- Its `websites/manifest.json` entry

Then run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix` so `FALLBACK_GAMES` stays synchronized.

## Workshop Requests

Use the catalog's `Improve` button to generate an AI-ready brief. Open it as a GitHub issue with the `workshop-request` label so requests are visible in the Improvement Queue.

The `Workshop Request Triage` workflow adds implementation labels and a checklist comment. It does not run AI code generation or require API keys.
