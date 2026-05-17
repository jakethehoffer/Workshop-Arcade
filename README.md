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
npm run test:seo
npm run test:a11y
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:docs` keeps contributor-facing validation docs aligned with the current publish-ready CI gates.
- `npm run test:seo` verifies `sitemap.xml`, `robots.txt`, and the JSON-LD `ItemList` block in `index.html` all mirror the current `websites/manifest.json`. Run `npm run build:sitemap` after editing the manifest to regenerate them.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:games` starts a local static server, verifies the catalog player modal and Workshop issue-URL flow, and opens every manifest game on desktop and mobile viewports.
- `npm run capture:games:ci` runs the rendered-quality harness in strict mode and fails if any captured surface scores above 0. For optional local review, `npm run capture:games` writes the same ranked contact sheet under `test-results/render-ranking/<timestamp>/` without CI strictness.
- `npm run audit:perf:ci` starts from the Pagespeed-style performance audit in strict mode and fails on publish-budget regressions.

CI runs `validate-catalog.ps1`, `npm run test:docs`, `npm run test:a11y`, `npm run test:games`, `npm run audit:perf:ci`, and `npm run capture:games:ci` on every push. The Validate Catalog workflow is split into catalog/docs/a11y, game smoke, performance audit, and render capture jobs, with compact performance and render-ranking artifacts uploaded for review.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract.

## Discoverability (Sitemap + Structured Data)

The catalog ships a few small static surfaces so search engines can index every game directly:

- `sitemap.xml` — one URL per manifest game plus the catalog root, with `lastmod` derived from each entry's `addedAt`. Generated from `websites/manifest.json`.
- `robots.txt` — allows all crawlers and points at the live sitemap.
- A JSON-LD `ItemList` block between `<!-- workshop-catalog-jsonld:start -->` markers in `index.html`, listing every game in manifest order so Google can render the catalog as a rich list.

After editing the manifest, regenerate the three surfaces in one step:

```powershell
npm run build:sitemap
```

`npm run test:seo` runs in CI (and is part of the publish-ready check list above) so any drift between the manifest and these surfaces fails before merge.
