# Workshop Arcade

**Live:** [https://jakethehoffer.github.io/Workshop-Arcade/](https://jakethehoffer.github.io/Workshop-Arcade/)

Workshop Arcade is a static catalog of browser games. Each game lives as a standalone HTML file under `websites/`, with catalog metadata in `websites/manifest.json` and cover art in `covers/`.

The catalog includes a sandboxed player modal and a Workshop flow for players or builders to turn a game idea into an AI-ready improvement brief. Briefs can be copied, downloaded, saved locally in the browser, or opened as a pre-filled GitHub issue before being used with an AI coding tool. The Improvement Queue on the catalog page fetches open `workshop-request` issues inline via the GitHub REST API, and the Recent Updates feed shows the last five commits.

The site is hosted via GitHub Pages from the `main` branch root. Pushes to `main` redeploy automatically.

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
npm run test:docs
npm run test:a11y
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:docs` keeps contributor-facing validation docs aligned with the current publish-ready CI gates.
- `npm run test:fallback-pages` enforces that `404.html` and `offline.html` exist, share the catalog theme tokens, are marked `noindex`, link back to the catalog home, and (for `404.html`) expose the manifest-aware did-you-mean search form.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:games` starts a local static server, verifies the catalog player modal and Workshop issue-URL flow, and opens every manifest game on desktop and mobile viewports.
- `npm run capture:games:ci` runs the rendered-quality harness in strict mode and fails if any captured surface scores above 0. For optional local review, `npm run capture:games` writes the same ranked contact sheet under `test-results/render-ranking/<timestamp>/` without CI strictness.
- `npm run audit:perf:ci` starts from the Pagespeed-style performance audit in strict mode and fails on publish-budget regressions.

CI runs `validate-catalog.ps1`, `npm run test:docs`, `npm run test:a11y`, `npm run test:games`, `npm run audit:perf:ci`, and `npm run capture:games:ci` on every push. The Validate Catalog workflow is split into catalog/docs/a11y, game smoke, performance audit, and render capture jobs, with compact performance and render-ranking artifacts uploaded for review.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract.
