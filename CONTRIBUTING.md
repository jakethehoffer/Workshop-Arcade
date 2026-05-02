# Contributing to Workshop Arcade

Workshop Arcade is intentionally static: games are single HTML files in `websites/`, catalog data lives in `websites/manifest.json`, and cover art lives in `covers/`.

## Add or Update a Game

1. Add or edit the game file in `websites/`.
2. Add or update a cover in `covers/`.
3. Update `websites/manifest.json`.
4. Update the `FALLBACK_GAMES` list in `index.html` so the catalog still works when opened without a local server.
5. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
```

## Remove a Game

Remove all of these together:

- Its `websites/*.html` file
- Its cover image or SVG
- Its `websites/manifest.json` entry
- Its `FALLBACK_GAMES` entry in `index.html`

## Workshop Requests

Use the catalog's `Improve` button to generate an AI-ready brief. Open it as a GitHub issue with the `workshop-request` label so requests are visible in the Improvement Queue.
