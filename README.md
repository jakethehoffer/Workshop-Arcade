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
npm run test:tools
npm run test:capture-recipes
npm run test:catalog-perf
npm run test:pwa
npm run test:fallback-pages
npm run test:game-jsonld
npm run test:seo
npm run test:a11y
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:docs` keeps contributor-facing validation docs aligned with the current publish-ready CI gates.
- `npm run test:tools` runs `node --check` across repository Node tooling before heavier Playwright jobs start.
- `npm run test:capture-recipes` verifies every manifest game has a strict rendered-quality interaction recipe.
- `npm run test:catalog-perf` enforces the catalog cover-image perf contract: the card template ships explicit width/height + `decoding="async"`, and `render()` opts the first `ABOVE_FOLD_COVERS` cards into eager loading + `fetchpriority="high"` while lazy-loading the rest with `fetchpriority="low"` so the LCP candidate is fetched first and off-screen covers don't compete for bandwidth.
- `npm run test:pwa` verifies `app.webmanifest`, `sw.js`, and the matching `<link rel="manifest">` / service worker registration in `index.html` so the catalog stays installable and offline-capable.
- `npm run test:fallback-pages` enforces that `404.html` and `offline.html` exist, share the catalog theme tokens, are marked `noindex`, link back to the catalog home, and (for `404.html`) expose the manifest-aware did-you-mean search form.
- `npm run test:game-jsonld` checks that every manifest game page has the JSON-LD `VideoGame` block emitted by `scripts/inject-game-meta.mjs` and that its name/url/image match the manifest. Run `npm run inject:meta` after editing the manifest to refresh.
- `npm run test:seo` verifies `sitemap.xml`, `robots.txt`, and the JSON-LD `ItemList` block in `index.html` all mirror the current `websites/manifest.json`. Run `npm run build:sitemap` after editing the manifest to regenerate them.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:games` starts a local static server, verifies the catalog player modal and Workshop issue-URL flow, and opens every manifest game on desktop and mobile viewports.
- `npm run capture:games:ci` runs the rendered-quality harness in strict mode and fails if any captured surface scores above 0. For optional local review, `npm run capture:games` writes the same ranked contact sheet under `test-results/render-ranking/<timestamp>/` without CI strictness.
- `npm run audit:perf:ci` starts from the Pagespeed-style performance audit in strict mode and fails on publish-budget regressions.

CI runs `validate-catalog.ps1`, `npm run test:docs`, `npm run test:tools`, `npm run test:capture-recipes`, `npm run test:a11y`, `npm run test:games`, `npm run audit:perf:ci`, and `npm run capture:games:ci` on every push. The Validate Catalog workflow is split into catalog/docs/a11y, game smoke, performance audit, and render capture jobs, with compact performance and render-ranking artifacts uploaded for review.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract.

## Install / Offline Support

The catalog is a progressive web app. Visiting [the live site](https://jakethehoffer.github.io/Workshop-Arcade/) registers a small offline shell so future visits load instantly even on a flaky connection, and browsers that support `beforeinstallprompt` offer to install Workshop Arcade as a standalone app on the device home screen.

- `app.webmanifest` declares the install metadata (name, theme/background colors, icons in `covers/app-icon.svg` and `covers/app-icon-maskable.svg`).
- `sw.js` ships a versioned cache (`wa-v*`): the catalog shell and `websites/manifest.json` are pre-cached on install, and any same-origin GETs use a stale-while-revalidate strategy. Game files are added to the runtime cache after first play.
- The service worker registration in `index.html` is feature-checked, deferred until the `load` event, and silently no-ops on `file://` previews or browsers without service worker support.
- Bump `VERSION` in `sw.js` whenever the cached shell needs to invalidate (e.g. structural changes to `index.html` or `websites/manifest.json` formats); old caches are deleted automatically on activate.

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
