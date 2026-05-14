# Workshop Arcade

Workshop Arcade is a static catalog of browser games. Each game lives as a standalone HTML file under `websites/`, with catalog metadata in `websites/manifest.json` and cover art in `covers/`.

The catalog includes a sandboxed player modal and a Workshop flow for players or builders to turn a game idea into an AI-ready improvement brief. Briefs can be copied, downloaded, saved locally in the browser, or opened as a pre-filled GitHub issue before being used with an AI coding tool. The Improvement Queue on the catalog page links to open `workshop-request` issues and, when the repository is public, fetches a live list of them inline via the GitHub REST API.

## Local Development

Run a static server from the repo root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Validation And Smoke Tests

Before publishing catalog changes, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm ci
npm run test:a11y
npm run test:games
npm run capture:games
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:games` starts a local static server, verifies the catalog player modal and Workshop issue-URL flow, and opens every manifest game on desktop and mobile viewports.
- `npm run capture:games` runs the rendered-quality harness against every game on desktop and mobile and writes a ranked contact sheet under `test-results/render-ranking/<timestamp>/`. Every captured surface must score 0.

CI runs `validate-catalog.ps1`, `test:a11y`, and `test:games` on every push. `capture:games` runs locally for rendered-quality regression review.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract.
