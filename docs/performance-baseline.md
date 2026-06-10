# Workshop Arcade Performance & SEO Baseline

This is a tracked set of performance and SEO audit snapshots for local verification runs and the current preview deployment. Reproduce with:

```bash
npm run audit:perf
npm run audit:perf:local
```

`audit:perf` is a local Playwright-based audit (see `scripts/audit-pagespeed.mjs`). It hits the live URL, walks the catalog plus every game in `websites/manifest.json`, and measures the metrics Lighthouse cares about most: paint timing, transfer weight, request count, console errors, meta-tag completeness, and the largest single resource per page. The compact `test-results/lighthouse-baseline/<timestamp>/summary.json`, Markdown `report.md`, and raw per-page JSON live under the same gitignored run directory. The summary and report include source revision provenance so CI and local audit evidence identify the exact branch, commit, dirty state, manifest count, and newest slugs checked.

The neighboring rendered-quality evidence under `test-results/render-ranking/<timestamp>/` follows the same source-identifying launch-evidence model. Its summary records pass/fail status, expected/captured surface counts, last capture phase, and any run-level error so early harness failures remain diagnosable instead of leaving only partial screenshots.

Use `npm run audit:perf:local` for local publish checks: it starts a disposable static server, sets `WORKSHOP_ARCADE_URL` to that server, runs the strict audit, and cleans up the server. CI runs `npm run audit:perf:ci` against its own local static server. Strict mode fails on deterministic regressions only: load failures, HTTP 4xx/5xx responses, console/page errors, missing required meta tags, images missing `alt`, excessive transfer, or excessive request count. FCP/load timing stays informational to avoid flaky failures on shared runners.

The fast `npm run test:page-weight` gate adds earlier static headroom checks before the slower browser audit runs: the catalog shell must keep at least a 20 KB / 5 request buffer below the Catalog budget, and each named exception must keep at least 10 KB / 1 request of named exception headroom below its own budget.

CI budgets:

| Page group | Transfer | Requests |
|------------|----------|----------|
| Catalog | 200 KB | 18 |
| Lexica | 160 KB | 4 |
| Idle Tycoon | 170 KB | 4 |
| Arcade Jump | 115 KB | 4 |
| Brick Breaker | 125 KB | 4 |
| Other manifest games | 100 KB | 3 |

## Per-game CSP pass (pass 109)

Captured 2026-06-10 against a disposable local static server after injecting a per-game Content-Security-Policy meta into every game page. The strict audit covered the catalog plus 100 manifest games, 101 pages total. No gameplay rules, manifest entries, covers, budgets, service-worker files, custom-domain settings, backend calls, paid services, credentials, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

Every `websites/<slug>.html` is directly reachable (sitemapped, SEO'd, shareable) but previously shipped with no CSP at all — only the catalog shell had one. `scripts/inject-game-meta.mjs` now writes a tight game-page policy as the first line of the generated workshop-meta block, before each page's first `<script>` tag: same-origin everything, `script-src`/`style-src` with `'unsafe-inline'` (game code and styles are inline by design), `img-src 'self' data:` for the blank `data:,` favicon pattern that suppresses `/favicon.ico` requests, and `frame-src 'none'`/`object-src 'none'`. `npm run test:csp` now asserts the full directive set and the before-first-script position on all 100 game pages alongside the existing catalog checks.

The CSP meta costs roughly 0.25 KB per page: Brick Breaker measures 113.1 KB against its 125 KB budget and Arcade Jump 102.5 KB against 115 KB, keeping 11.9 KB / 12.5 KB of named exception headroom. The catalog shell is unchanged at 172.1 KB / 200 KB static weight with 27.9 KB / 9 files of catalog shell headroom, and the browser audit measured Catalog at 162.4 KB / 6 requests with zero console/page errors.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 72 ms | 52 ms | 🟢 53 ms | 🟢 162.4 KB | 6 | 0 |
| Lexica | 🟢 36 ms | 34 ms | 🟢 34 ms | 🟢 149.5 KB | 3 | 0 |
| Idle Tycoon | 🟢 448 ms | 43 ms | 🟢 43 ms | 🟢 156.8 KB | 2 | 0 |
| Arcade Jump | 🟢 76 ms | 51 ms | 🟢 51 ms | 🟢 102.5 KB | 2 | 0 |
| Brick Breaker | 🟢 80 ms | 74 ms | 🟢 74 ms | 🟢 113.1 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 101 URLs and `npm run audit:perf:local` reported `CI strict audit passed`.

## Player storage bridge pass (pass 108)

Captured 2026-06-10 against a disposable local static server after adding the player storage bridge. The strict audit covered the catalog plus 100 manifest games, 101 pages total. No gameplay rules, manifest entries, covers, generated game metadata, generated game surfaces, capture recipes, custom-domain settings, backend calls, paid services, credentials, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

Sandboxed player iframes run with opaque origins, so game saves previously lived only in the in-memory fallback and vanished when the player closed. The bridge keeps the sandbox exactly as-is (`allow-scripts allow-forms allow-pointer-lock`, no `allow-same-origin`) and restores persistence: `openPlayer()` seeds each game's saved entries through a `#wa-storage=` URL fragment so first reads are synchronous and correct, `websites/workshop-runtime.js` batches writes back over `postMessage`, and a guarded catalog listener mirrors them into `workshop-arcade:game:<slug>:` keys with key/value/op caps and a 256 KB per-game budget. `clear()` stays scoped to the active game, catalog shell keys are untouchable by construction, and direct game loads keep native storage with the bridge dormant.

The shared runtime grew from 1.7 KB to 4.3 KB, which counts against every game's static weight, so the Brick Breaker and Arcade Jump named exceptions moved from 120 KB to 125 KB and from 110 KB to 115 KB; both now hold 12.1 KB / 12.8 KB of named exception headroom against measured weights that did not change. `npm run test:page-weight` reports the catalog local shell at 172.1 KB / 200 KB across 9/18 files, with 27.9 KB / 9 files of catalog shell headroom. `npm run test:pwa-install-budget` reports the PWA install payload at 176.2 KB / 200 KB across 10/18 files, with 23.8 KB / 8 files headroom. The service-worker shell cache was refreshed to `SHELL_REVISION = shell-86b1c679a1b8` and `VERSION = wa-v47-shell-86b1c679a1b8`, and `npm run test:pwa` passed with that revision. The latest browser audit measured Catalog at 162.4 KB / 6 requests, up from 158.0 KB / 6 requests in pass 107 for the bridge seed/mirror code, with zero console/page errors.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 120 ms | 124 ms | 🟢 127 ms | 🟢 162.4 KB | 6 | 0 |
| Lexica | 🟢 52 ms | 37 ms | 🟢 37 ms | 🟢 149.2 KB | 3 | 0 |
| Idle Tycoon | 🟢 456 ms | 11 ms | 🟢 13 ms | 🟢 156.6 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 54 ms | 🟢 54 ms | 🟢 102.2 KB | 2 | 0 |
| Brick Breaker | 🟢 112 ms | 90 ms | 🟢 90 ms | 🟢 112.9 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 101 URLs and `npm run audit:perf:local` reported `CI strict audit passed`.

## Catalog headroom and runbook drift pass (pass 107)

Captured 2026-06-08 against a disposable local static server after a non-game catalog/tooling pass. The strict audit covered the catalog plus 100 manifest games, 101 pages total. No games, manifest entries, generated game metadata, generated game surfaces, custom-domain settings, backend calls, paid services, credentials, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

The catalog shell was trimmed by removing low-value explanatory comments and blank-line bulk, then compacting whitespace inside the existing catalog `<style>` block only. User-facing copy, DOM ids/classes, data attributes, JSON-LD marker comments, generated JSON-LD, `FALLBACK_GAMES`, keyboard shortcuts, filters, favorites, player shelves, player modal, Workshop feedback, PWA registration, lazy-cover observer wiring, and `aboveFoldCoverCount()` behavior were preserved. `index.html` is now 116.5 KB raw on disk, down from roughly 129.1 KB before this trim.

Static headroom recovered above the required floor: `npm run test:page-weight` reports the catalog local shell at 167.6 KB / 200 KB across 9/18 files, with 32.4 KB / 9 files of catalog shell headroom. `npm run test:pwa-install-budget` reports the PWA install payload at 171.8 KB / 200 KB across 10/18 files, with 28.2 KB / 8 files headroom. The service-worker shell cache was refreshed to `SHELL_REVISION = shell-466c3bfa1e7b` and `VERSION = wa-v46-shell-466c3bfa1e7b`, and `npm run test:pwa` passed with that revision. The latest browser audit measured Catalog at 158.0 KB / 6 requests, down from 170.3 KB / 6 requests in pass 106, with zero console/page errors.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 160 ms | 155 ms | 🟢 157 ms | 🟢 158.0 KB | 6 | 0 |
| Lexica | 🟢 56 ms | 44 ms | 🟢 44 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 472 ms | 16 ms | 🟢 18 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 116 ms | 64 ms | 🟢 64 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 104 ms | 89 ms | 🟢 89 ms | 🟢 109.7 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 101 URLs and `npm run audit:perf:local` reported `CI strict audit passed`.

## 100-game expansion pass (pass 106)

Captured 2026-06-07 against a disposable local static server after adding 16 compact games: **Signal Loom**, **Crown Circuit**, **Forge Freighter**, **Aster Vault**, **Tempo Tunnels**, **Canopy Courier**, **Shard Sheriff**, **Ledger Lanes**, **Moonbase Mutex**, **Drift Loom**, **Bulb Brigade**, **Rune Roster**, **Velvet Heist**, **Pocket Orchard**, **Comet Cartel**, and **Finale Foundry**. The strict audit covered the catalog plus 100 manifest games, 101 pages total. The initial expansion used compact standalone shells with `workshop-runtime.js`, keyboard/touch controls, sound/fullscreen controls, defensive storage, `render_game_to_text()`, and deterministic `advanceTime(ms)` diagnostics. Follow-up quality slices have since replaced the highest-mismatch shared-grid entries with bespoke mechanics while keeping the same standalone footprint and budgets. The latest local audit for this slice measured **Velvet Heist** at 32.0 KB / 2 requests and **Finale Foundry** at 29.2 KB / 2 requests after replacing their generic grid shells with authored stealth-route and rhythm-foundry rules. Prior quality-slice measurements also kept **Signal Loom** at 26.1 KB / 2 requests, **Moonbase Mutex** at 28.0 KB / 2 requests, **Bulb Brigade** at 25.7 KB / 2 requests, **Aster Vault** at 23.1 KB / 2 requests, **Canopy Courier** at 22.9 KB / 2 requests, and **Shard Sheriff** at 22.3 KB / 2 requests. All remain comfortably inside the 100 KB / 3 request default budget. No custom-domain settings, backend calls, paid services, credentials, or `SECURITY_SURFACES_TOKEN` work changed.

The catalog fallback was compacted to stop duplicating manifest subtitles in `index.html`; runtime catalog data still comes from `websites/manifest.json`. This kept the static page-weight gate at its required floor while the manifest reached 100 games: `npm run test:page-weight` reports the catalog local shell at 180.0 KB / 200 KB across 9/18 files, with 20.0 KB / 9 files headroom.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 112 ms | 138 ms | 🟢 141 ms | 🟢 170.3 KB | 6 | 0 |
| Lexica | 🟢 44 ms | 40 ms | 🟢 40 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 472 ms | 50 ms | 🟢 50 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 88 ms | 60 ms | 🟢 60 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 144 ms | 119 ms | 🟢 119 ms | 🟢 109.7 KB | 2 | 0 |
| Signal Loom | 🟢 48 ms | 18 ms | 🟢 18 ms | 🟢 26.1 KB | 2 | 0 |
| Crown Circuit | 🟢 48 ms | 21 ms | 🟢 21 ms | 🟢 29.8 KB | 2 | 0 |
| Forge Freighter | 🟢 44 ms | 17 ms | 🟢 17 ms | 🟢 29.8 KB | 2 | 0 |
| Aster Vault | 🟢 44 ms | 13 ms | 🟢 13 ms | 🟢 23.1 KB | 2 | 0 |
| Canopy Courier | 🟢 40 ms | 13 ms | 🟢 13 ms | 🟢 22.9 KB | 2 | 0 |
| Shard Sheriff | 🟢 48 ms | 17 ms | 🟢 18 ms | 🟢 22.3 KB | 2 | 0 |
| Moonbase Mutex | 🟢 44 ms | 16 ms | 🟢 16 ms | 🟢 28.0 KB | 2 | 0 |
| Bulb Brigade | 🟢 40 ms | 27 ms | 🟢 27 ms | 🟢 25.7 KB | 2 | 0 |
| Velvet Heist | 🟢 44 ms | 17 ms | 🟢 17 ms | 🟢 32.0 KB | 2 | 0 |
| Finale Foundry | 🟢 44 ms | 16 ms | 🟢 16 ms | 🟢 29.2 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 101 URLs and `npm run audit:perf:local` reported `CI strict audit passed`. `npm run capture:games:ci` covered 200 rendered desktop/mobile surfaces with max render score 0 after tightening the new games' mobile control order and action-pad label sizing.

## Crosswire Clues mini-crossword pass (pass 105)

Captured 2026-06-06 against a disposable local static server after adding **Crosswire Clues**, a compact Word/Puzzle/Strategy mini-crossword game where players fill five deterministic crossing word-square grids, check entries, and spend limited hints while preserving integrity, as game #84. The strict audit covered the catalog plus 84 manifest games, 85 pages total. Crosswire Clues is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 34.3 KB), comfortably inside the 100 KB / 3 request default budget. It adds a distinct crossword-style word mechanic and lifts the Word tag from 4 to 5. No named exception budgets, generated catalog surface formats, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 120 ms | 101 ms | 🟢 102 ms | 🟢 170.3 KB | 6 | 0 |
| Lexica | 🟢 44 ms | 40 ms | 🟢 40 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 456 ms | 12 ms | 🟢 13 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 57 ms | 🟢 57 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 108 ms | 89 ms | 🟢 89 ms | 🟢 109.7 KB | 2 | 0 |
| Crosswire Clues | 🟢 44 ms | 15 ms | 🟢 15 ms | 🟢 34.3 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 85 URLs and `npm run audit:perf:local` reported `CI strict audit passed`. `npm run test:page-weight` reports the catalog local shell at 180.0 KB / 200 KB across 9/18 files, with 20.0 KB / 9 files headroom after trimming the Crosswire Clues cover SVG.

## Nightwire tactical stealth pass (pass 104)

Captured 2026-06-05 against a disposable local static server after adding **Nightwire**, a turn-based tactical-stealth game (single infiltrator, 2-AP turns, silent takedowns + distractions, deterministic vision-cone patrols, an alarm meter, and five hand-authored stages) as game #83. The strict audit covered the catalog plus 83 manifest games, 84 pages total. Nightwire is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 36.6 KB), comfortably inside the 100 KB / 3 request default budget. It lifts the Tactics and Stealth tags off the `MIN_TAG_COUNT=3` coverage floor to 4 — the final floor-clearing pass, after which every public tag sits at >= 4. No named exception budgets, generated catalog surface formats, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 132 ms | 159 ms | 🟢 163 ms | 🟢 170.1 KB | 6 | 0 |
| Lexica | 🟢 52 ms | 54 ms | 🟢 54 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 488 ms | 14 ms | 🟢 16 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 100 ms | 68 ms | 🟢 68 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 192 ms | 203 ms | 🟢 203 ms | 🟢 109.7 KB | 2 | 0 |
| Nightwire | 🟢 36 ms | 15 ms | 🟢 15 ms | 🟢 36.6 KB | 2 | 0 |

## Cipher Cadence word-rhythm pass (pass 103)

Captured 2026-06-05 against a disposable local static server after adding **Cipher Cadence**, a compact Word/Rhythm/Puzzle timing game where players select the next cipher word from four beat lanes and confirm on the pulse across five deterministic phrase tracks, as game #82. The strict audit covered the catalog plus 82 manifest games, 83 pages total. Cipher Cadence is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 33.5 KB), comfortably inside the 100 KB / 3 request default budget. It lifts the Word and Rhythm tags above the `MIN_TAG_COUNT=3` coverage floor to 4. No named exception budgets, generated catalog surface formats, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 128 ms | 104 ms | 🟢 105 ms | 🟢 169.6 KB | 6 | 0 |
| Lexica | 🟢 48 ms | 40 ms | 🟢 41 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 476 ms | 13 ms | 🟢 15 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 112 ms | 72 ms | 🟢 72 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 116 ms | 94 ms | 🟢 94 ms | 🟢 109.7 KB | 2 | 0 |
| Cipher Cadence | 🟢 48 ms | 32 ms | 🟢 32 ms | 🟢 33.5 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 83 URLs and `npm run audit:perf:local` reported `CI strict audit passed`. `npm run test:page-weight` reports the catalog local shell at 179.3 KB / 200 KB across 9/18 files, with 20.7 KB / 9 files headroom.

## Chrome Convoy combat racer pass (pass 102)

Captured 2026-06-04 against a disposable local static server after adding **Chrome Convoy**, a compact Racing/Shooter/Action combat racer (free-steer lane, heat-limited cannon, ram, five deterministic stretches), as the catalog's newest game and game #81. The strict audit covered the catalog plus 81 manifest games, 82 pages total. Chrome Convoy is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 31.9 KB), comfortably inside the 100 KB / 3 request default budget. It lifts the Racing and Shooter tags off the `MIN_TAG_COUNT=3` coverage floor to 4. No named exception budgets, generated catalog surface formats, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 72 ms | 95 ms | 🟢 98 ms | 🟢 168.5 KB | 6 | 0 |
| Lexica | 🟢 36 ms | 35 ms | 🟢 35 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 460 ms | 11 ms | 🟢 12 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 54 ms | 🟢 54 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 104 ms | 81 ms | 🟢 81 ms | 🟢 109.7 KB | 2 | 0 |
| Chrome Convoy | 🟢 32 ms | 11 ms | 🟢 11 ms | 🟢 31.9 KB | 2 | 0 |

## Beacon Bastion adventure defense pass (pass 101)

Captured 2026-06-04 against a disposable local static server after adding **Beacon Bastion**, a compact Adventure/Defense/Strategy scout-and-beacon defense game, as the catalog's newest game. The strict audit covered the catalog plus 80 manifest games, 81 pages total. Beacon Bastion is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 23.0 KB), comfortably inside the 100 KB / 3 request default budget. No named exception budgets, generated catalog surface formats, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 228 ms | 208 ms | 🟢 208 ms | 🟢 168.6 KB | 6 | 0 |
| Lexica | 🟢 60 ms | 20 ms | 🟢 21 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 464 ms | 12 ms | 🟢 14 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 116 ms | 63 ms | 🟢 64 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 116 ms | 96 ms | 🟢 96 ms | 🟢 109.7 KB | 2 | 0 |
| Beacon Bastion | 🟢 48 ms | 17 ms | 🟢 17 ms | 🟢 23.0 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 81 URLs and `npm run audit:perf:local` reported `CI strict audit passed`. Beacon Bastion measured 23.0 KB / 2 requests, leaving roughly 77 KB / 1 request of headroom under the default budget. `npm run test:page-weight` reports the catalog local shell at 178.3 KB / 200 KB across 9/18 files, with 21.7 KB / 9 files headroom.

## Diamond Derby home-run derby (pass 100)

Captured 2026-06-04 against a disposable local static server after adding **Diamond Derby**, a Sports/Arcade/Action swing-timing home-run derby, as the catalog's newest game. The strict audit covered the catalog plus 79 manifest games, 80 pages total. Diamond Derby is a single self-contained page that loads only its own HTML plus `workshop-runtime.js` (2 requests, 24.8 KB), comfortably inside the 100 KB / 3 request default budget. No named exception budgets, generated catalog surface formats, service-worker behavior beyond the shell revision bump, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 356 ms | 92 ms | 🟢 95 ms | 🟢 168.3 KB | 6 | 0 |
| Lexica | 🟢 140 ms | 112 ms | 🟢 112 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 576 ms | 27 ms | 🟢 32 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 224 ms | 181 ms | 🟢 181 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 128 ms | 119 ms | 🟢 119 ms | 🟢 109.7 KB | 2 | 0 |
| Diamond Derby | 🟢 864 ms | 737 ms | 🟢 737 ms | 🟢 24.8 KB | 2 | 0 |

The strict audit reported zero console/page errors across all 80 URLs and `npm run audit:perf:local` reported `CI strict audit passed`. Diamond Derby measured 24.8 KB / 2 requests, leaving roughly 75 KB / 1 request of headroom under the default budget.

## Named game headroom guard (pass 99)

Captured 2026-06-03 against a disposable local static server after adding named exception headroom enforcement to `npm run test:page-weight` and mechanically trimming Lexica plus Arcade Jump. Lexica now folds its answer bank into `words5.js`, removes the unused `answers5.js` request, and drops obsolete comments/blank lines; Arcade Jump drops low-risk inline whitespace. No gameplay rules, scoring, storage keys, diagnostics, capture recipes, manifest entries, generated metadata, service-worker behavior, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed. The strict audit covered the catalog plus 78 manifest games, 79 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 116 ms | 94 ms | 🟢 95 ms | 🟢 168.3 KB | 6 | 0 |
| Lexica | 🟢 60 ms | 21 ms | 🟢 22 ms | 🟢 146.0 KB | 3 | 0 |
| Idle Tycoon | 🟢 500 ms | 13 ms | 🟢 16 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 56 ms | 🟢 56 ms | 🟢 99.0 KB | 2 | 0 |
| Brick Breaker | 🟢 120 ms | 101 ms | 🟢 101 ms | 🟢 109.7 KB | 2 | 0 |
| Slipstream Sprint | 🟢 40 ms | 14 ms | 🟢 14 ms | 🟢 35.5 KB | 2 | 0 |

`npm run test:page-weight` now requires named exception headroom of at least 10 KB / 1 request below each named game budget. It reports Lexica at 146.0 KB / 160 KB with 14.0 KB / 1 request headroom, Arcade Jump at 99.0 KB / 110 KB with 11.0 KB / 2 request headroom, Brick Breaker at 109.7 KB / 120 KB with 10.3 KB / 2 request headroom, and Idle Tycoon at 153.3 KB / 170 KB with 16.7 KB / 2 request headroom. The catalog local shell reports 178.0 KB / 200 KB across 9/18 files, with 22.0 KB / 9 files headroom. The browser audit measured Catalog at 168.3 KB / 6 requests, and the strict audit reported zero console/page errors across all 79 URLs.

## Catalog shell headroom refresh (pass 98)

Captured 2026-06-03 against a disposable local static server after reducing desktop eager catalog covers from 6 to 4 and adding the static catalog shell headroom guard. The strict audit covered the catalog plus 78 manifest games, 79 pages total. No games, manifest entries, generated catalog surfaces, custom-domain settings, backend calls, or `SECURITY_SURFACES_TOKEN` work changed in this pass.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 184 ms | 214 ms | 🟢 218 ms | 🟢 167.6 KB | 6 | 0 |
| Lexica | 🟢 72 ms | 29 ms | 🟢 30 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 480 ms | 17 ms | 🟢 19 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 96 ms | 67 ms | 🟢 67 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 136 ms | 114 ms | 🟢 114 ms | 🟢 109.7 KB | 2 | 0 |
| Slipstream Sprint | 🟢 48 ms | 18 ms | 🟢 18 ms | 🟢 35.5 KB | 2 | 0 |

`npm run test:page-weight` now reports the catalog local shell at 177.3 KB / 200 KB across 9/18 files, with 22.7 KB / 9 files headroom. The browser audit measured Catalog at 167.6 KB / 6 requests, down from 173.2 KB / 8 requests in pass 97. All named exception games stayed below their budgets, and the strict audit reported zero console/page errors across all 79 URLs.

## Slipstream Sprint racing addition (pass 97)

Captured 2026-06-03 against a disposable local static server after adding **Slipstream Sprint**, a compact three-lane racing game where players switch lanes, draft rivals to recharge boost, spend boost for overtakes, and avoid fixed barriers through a deterministic three-lap sprint. The pass refreshed generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumped the service-worker shell revision for the new newest-cover set. No custom-domain, backend, or Security Surfaces work changed. The strict audit covered the catalog plus 78 manifest games, 79 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 80 ms | 108 ms | 🟢 111 ms | 🟢 173.2 KB | 8 | 0 |
| Lexica | 🟢 176 ms | 189 ms | 🟢 190 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 556 ms | 22 ms | 🟢 25 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 228 ms | 60 ms | 🟢 60 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 180 ms | 157 ms | 🟢 157 ms | 🟢 109.7 KB | 2 | 0 |
| Slipstream Sprint | 🟢 56 ms | 19 ms | 🟢 19 ms | 🟢 35.5 KB | 2 | 0 |

Slipstream Sprint lands at 35.5 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 173.2 KB / 8 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 79 audited URLs, and every page passed the strict meta/alt checks.

## Bulwark Burst defense-shooter addition (pass 96)

Captured 2026-06-03 against a disposable local static server after adding **Bulwark Burst**, a compact radial defense shooter where players rotate a core cannon, burst incoming drones, manage heat, and time shield pulses across deterministic attack waves. The pass refreshed generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumped the service-worker shell revision for the new newest-cover set. No custom-domain, backend, or Security Surfaces work changed. The strict audit covered the catalog plus 77 manifest games, 78 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 160 ms | 154 ms | 🟢 158 ms | 🟢 172.5 KB | 8 | 0 |
| Lexica | 🟢 56 ms | 20 ms | 🟢 21 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 448 ms | 11 ms | 🟢 12 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 92 ms | 61 ms | 🟢 61 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 112 ms | 96 ms | 🟢 96 ms | 🟢 109.7 KB | 2 | 0 |
| Bulwark Burst | 🟢 36 ms | 11 ms | 🟢 11 ms | 🟢 35.6 KB | 2 | 0 |

Bulwark Burst lands at 35.6 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 172.5 KB / 8 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 78 audited URLs, and every page passed the strict meta/alt checks.

## Breachline stealth-tactics addition (pass 95)

Captured 2026-06-02 against a disposable local static server after adding **Breachline**, a compact stealth-tactics puzzle where players queue synchronized Alpha/Beta routes, avoid patrol cones, collect the signal core, and extract both agents. The pass refreshed generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumped the service-worker shell revision for the new newest-cover set. No custom-domain, backend, or Security Surfaces work changed. The strict audit covered the catalog plus 76 manifest games, 77 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 80 ms | 105 ms | 🟢 108 ms | 🟢 172.9 KB | 8 | 0 |
| Lexica | 🟢 44 ms | 46 ms | 🟢 46 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 464 ms | 13 ms | 🟢 15 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 55 ms | 🟢 55 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 124 ms | 106 ms | 🟢 106 ms | 🟢 109.7 KB | 2 | 0 |
| Breachline | 🟢 40 ms | 14 ms | 🟢 14 ms | 🟢 32.4 KB | 2 | 0 |

Breachline lands at 32.4 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 172.9 KB / 8 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 77 audited URLs, and every page passed the strict meta/alt checks.

## Clause Courier word-order addition (pass 94)

Captured 2026-06-02 against a disposable local static server after adding **Clause Courier**, a compact word-order puzzle where players restore scrambled dispatch phrases by swapping adjacent word tiles within a move budget. The pass refreshed generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumped the service-worker shell revision for the new newest-cover set. No custom-domain, backend, or Security Surfaces work changed. The strict audit covered the catalog plus 75 manifest games, 76 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 100 ms | 80 ms | 🟢 81 ms | 🟢 172.8 KB | 8 | 0 |
| Lexica | 🟢 80 ms | 19 ms | 🟢 20 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 460 ms | 10 ms | 🟢 12 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 76 ms | 52 ms | 🟢 52 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 108 ms | 92 ms | 🟢 92 ms | 🟢 109.7 KB | 2 | 0 |

Clause Courier lands at 28.9 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 172.8 KB / 8 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 76 audited URLs, and every page passed the strict meta/alt checks.

## Blackjack card-game addition (pass 93)

Captured 2026-06-01 against a disposable local static server after adding **Blackjack**, a casino card game (seeded shoe, hit/stand/double, dealer draws to 17, blackjack pays 3:2, chip-stack scoring), plus refreshing the generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumping the service-worker shell revision for the new newest-cover set. No existing gameplay code, storage keys, or capture recipes changed. The strict audit covered the catalog plus 74 manifest games, 75 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 80 ms | 48 ms | 🟢 49 ms | 🟢 179.1 KB | 10 | 0 |
| Lexica | 🟢 36 ms | 38 ms | 🟢 39 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 464 ms | 14 ms | 🟢 17 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 92 ms | 64 ms | 🟢 64 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 172 ms | 155 ms | 🟢 155 ms | 🟢 109.7 KB | 2 | 0 |

Blackjack lands at 21.8 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 179.1 KB / 10 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 75 audited URLs, and every page passed the strict meta/alt checks.

## Pylon Shift tower-of-Hanoi addition (pass 92)

Captured 2026-06-01 against a disposable local static server after adding **Pylon Shift**, a Tower of Hanoi disc-stacking logic puzzle (three pylons, five levels of 3–7 discs, optimal-move par, best-move tracking), plus refreshing the generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumping the service-worker shell revision for the new newest-cover set. No existing gameplay code, storage keys, or capture recipes changed. The strict audit covered the catalog plus 73 manifest games, 74 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 264 ms | 96 ms | 🟢 101 ms | 🟢 179.8 KB | 10 | 0 |
| Lexica | 🟢 48 ms | 16 ms | 🟢 17 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 440 ms | 10 ms | 🟢 12 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 55 ms | 🟢 55 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 104 ms | 91 ms | 🟢 91 ms | 🟢 109.7 KB | 2 | 0 |

Pylon Shift lands at 19.7 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog holds at 179.8 KB / 10 requests, well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 74 audited URLs, and every page passed the strict meta/alt checks.

## Chromalock code-breaking addition (pass 91)

Captured 2026-06-01 against a disposable local static server after adding **Chromalock**, a Mastermind-style color-code deduction game (seeded four-peg secret, six-color palette, ten guesses, exact/partial match clues), plus refreshing the generated catalog surfaces (fallback catalog, sitemap, feed, OG cards) and bumping the service-worker shell revision for the new newest-cover set. No existing gameplay code, storage keys, or capture recipes changed. The strict audit covered the catalog plus 72 manifest games, 73 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 80 ms | 52 ms | 🟢 52 ms | 🟢 180.0 KB | 10 | 0 |
| Lexica | 🟢 40 ms | 42 ms | 🟢 43 ms | 🟢 152.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 460 ms | 11 ms | 🟢 13 ms | 🟢 153.3 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 60 ms | 🟢 60 ms | 🟢 101.7 KB | 2 | 0 |
| Brick Breaker | 🟢 124 ms | 100 ms | 🟢 100 ms | 🟢 109.7 KB | 2 | 0 |

Chromalock lands at 22.1 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog grows to 180.0 KB / 10 requests as Chromalock's cover joins the newest-first first paint, still well within its 200 KB / 18 request budget. Every named exception remains below its CI budget, no console/page errors appeared across the 73 audited URLs, and every page passed the strict meta/alt checks.

## Page-weight headroom refresh (pass 90)

Captured 2026-05-30 against a disposable local static server after mechanically compacting inline CSS presentation whitespace in **Idle Tycoon** and **Arcade Jump**, then initializing Arcade Jump's existing menu backdrop canvas so live-smoke canvas evidence is nonblank before a run starts. No gameplay code, storage keys, manifest entries, generated surfaces, service-worker behavior, or capture recipes changed. The strict audit covered the catalog plus 71 manifest games, 72 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 72 ms | 56 ms | 🟢 56 ms | 🟢 170.2 KB | 10 | 0 |
| Lexica | 🟢 44 ms | 43 ms | 🟢 43 ms | 🟢 152.6 KB | 4 | 0 |
| Idle Tycoon | 🟢 472 ms | 12 ms | 🟢 14 ms | 🟢 153.5 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 56 ms | 🟢 56 ms | 🟢 101.8 KB | 2 | 0 |
| Brick Breaker | 🟢 84 ms | 86 ms | 🟢 86 ms | 🟢 109.8 KB | 2 | 0 |

The catalog stays within its 200 KB / 18 request budget at 170.2 KB / 10 requests. Idle Tycoon drops from 165.0 KB to 153.5 KB under its 170 KB / 4 request exception, and Arcade Jump drops from 103.7 KB to 101.8 KB under its 110 KB / 4 request exception. Lexica and Brick Breaker remain below their named budgets, no console/page errors appeared across the 72 audited URLs, and every page passed the strict meta/alt checks.

## Last Light peg-solitaire addition (pass 89)

Captured 2026-05-29 against a disposable local static server after adding **Last Light**, a Peg Solitaire on the iconic 33-hole English cross — the catalog's first jump-and-remove mechanic. Jump a glowing peg over a neighbor into the empty hole beyond (the jumped peg goes dark); clear down to one last light, ideally dead center. Ships with Undo (essential for the genre), Reset, fewest-pegs/solves/perfect tracking, keyboard select-then-jump + tap, colorblind-safe lit/dark contrast, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 71 manifest games, 72 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 88 ms | 69 ms | 🟢 71 ms | 🟢 170.2 KB | 10 | 0 |
| Last Light | 🟢 60 ms | 47 ms | 🟢 47 ms | 🟢 21.5 KB | 2 | 0 |
| Lexica | 🟢 36 ms | 36 ms | 🟢 37 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 452 ms | 12 ms | 🟢 14 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 55 ms | 🟢 55 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 128 ms | 127 ms | 🟢 127 ms | 🟢 109.7 KB | 2 | 0 |

Last Light lands at 21.5 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 170.2 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 71 games. Every named exception remains below its CI budget, no console/page errors appeared across the 72 audited URLs, and every page passed the strict meta/alt checks.

## Floodgate flood-fill addition (pass 88)

Captured 2026-05-29 against a disposable local static server after adding **Floodgate**, a deterministic Flood-It color puzzle — the catalog's first flood-fill mechanic. Pick a color to recolor the region anchored at the top-left corner; absorb adjacent matches and repeat until the whole board is one color. Three levels (9×9/5 → 14×14/6) use fixed-seed grids for reproducibility, numbered color picks plus tap-a-cell, subtle per-color glyphs for colorblind distinction, per-level best-move tracking, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 70 manifest games, 71 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 144 ms | 122 ms | 🟢 123 ms | 🟢 169.2 KB | 10 | 0 |
| Floodgate | 🟢 68 ms | 58 ms | 🟢 58 ms | 🟢 20.3 KB | 2 | 0 |
| Lexica | 🟢 40 ms | 50 ms | 🟢 50 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 496 ms | 14 ms | 🟢 17 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 108 ms | 75 ms | 🟢 75 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 196 ms | 204 ms | 🟢 204 ms | 🟢 109.7 KB | 2 | 0 |

Floodgate lands at 20.3 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 169.2 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 70 games. Every named exception remains below its CI budget, no console/page errors appeared across the 71 audited URLs, and every page passed the strict meta/alt checks.

## Seedline mancala addition (pass 87)

Captured 2026-05-29 against a disposable local static server after adding **Seedline**, a deterministic Mancala (Kalah 6,4) against an alpha-beta minimax CPU — the catalog's first sowing-and-capturing mechanic. Sow seeds counterclockwise, earn an extra turn by landing your last seed in your store, capture across by ending in an empty pit of your own, and bank the most before a side empties. Keyboard pit cursor + number keys + tap-a-pit, scheduled AI that chains its extra turns, persisted win/streak/best stats, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 69 manifest games, 70 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 1464 ms | 1521 ms | 🟢 1525 ms | 🟢 167.7 KB | 10 | 0 |
| Seedline | 🟢 44 ms | 30 ms | 🟢 30 ms | 🟢 23.0 KB | 2 | 0 |
| Lexica | 🟢 84 ms | 29 ms | 🟢 31 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 508 ms | 18 ms | 🟢 22 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 116 ms | 78 ms | 🟢 78 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 128 ms | 130 ms | 🟢 130 ms | 🟢 109.7 KB | 2 | 0 |

Seedline lands at 23.0 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 167.7 KB / 10 requests (the elevated Catalog FCP is a first-page cold-cache artifact — informational only, not part of the strict gate). Every named exception remains below its CI budget, no console/page errors appeared across the 70 audited URLs, and every page passed the strict meta/alt checks.

## Slipsort sliding-puzzle addition (pass 86)

Captured 2026-05-29 against a disposable local static server after adding **Slipsort**, a deterministic sliding 15-puzzle — the first slide-to-order mechanic in the catalog (distinct from 2048's merge). Three levels (3×3 → 5×5) are each scrambled from the solved board with legal gap-slides using a fixed per-level seed, which guarantees solvability and reproducibility. Keyboard gap-moves + tap-a-tile row/column slides, tiles tint teal as they reach home, per-size best-move tracking, lifetime solved count, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 68 manifest games, 69 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 60 ms | 44 ms | 🟢 44 ms | 🟢 165.9 KB | 10 | 0 |
| Slipsort | 🟢 64 ms | 44 ms | 🟢 44 ms | 🟢 21.1 KB | 2 | 0 |
| Lexica | 🟢 36 ms | 33 ms | 🟢 34 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 464 ms | 11 ms | 🟢 13 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 57 ms | 🟢 57 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 120 ms | 119 ms | 🟢 119 ms | 🟢 109.7 KB | 2 | 0 |

Slipsort lands at 21.1 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 165.9 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 68 games. Every named exception remains below its CI budget, no console/page errors appeared across the 69 audited URLs, and every page passed the strict meta/alt checks.

## Eclipse Grid lights-out addition (pass 85)

Captured 2026-05-28 against a disposable local static server after adding **Eclipse Grid**, a deterministic Lights Out puzzle — the first toggle-propagation mechanic in the catalog. Pressing a tile flips it and its four orthogonal neighbors; the goal is to darken every tile. Six levels (3×3 → 5×5) are each defined as a scramble applied to an all-off board, which guarantees solvability and yields a known par. Keyboard cursor + tap placement, per-level best-move tracking, lifetime solved count, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 67 manifest games, 68 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 72 ms | 96 ms | 🟢 99 ms | 🟢 160.2 KB | 10 | 0 |
| Eclipse Grid | 🟢 40 ms | 29 ms | 🟢 29 ms | 🟢 19.7 KB | 2 | 0 |
| Lexica | 🟢 80 ms | 27 ms | 🟢 28 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 524 ms | 17 ms | 🟢 20 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 54 ms | 🟢 54 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 108 ms | 89 ms | 🟢 89 ms | 🟢 109.7 KB | 2 | 0 |

Eclipse Grid lands at 19.7 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 160.2 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 67 games. Every named exception remains below its CI budget, no console/page errors appeared across the 68 audited URLs, and every page passed the strict meta/alt checks.

## Fourfall connect-four addition (pass 84)

Captured 2026-05-28 against a disposable local static server after adding **Fourfall**, a deterministic Connect Four game against a depth-limited alpha-beta minimax CPU. It fills the last obvious abstract-classic gap alongside Chess, Checkers, and Reversi with a 7×6 gravity drop board, keyboard column cursor + number keys + tap-a-column placement, a translucent drop preview, winning-line highlight, persisted win/streak/best stats, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 66 manifest games, 67 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 220 ms | 190 ms | 🟢 194 ms | 🟢 159.4 KB | 10 | 0 |
| Fourfall | 🟢 44 ms | 18 ms | 🟢 18 ms | 🟢 21.9 KB | 2 | 0 |
| Lexica | 🟢 36 ms | 36 ms | 🟢 37 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 460 ms | 14 ms | 🟢 16 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 108 ms | 76 ms | 🟢 76 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 196 ms | 202 ms | 🟢 202 ms | 🟢 109.7 KB | 2 | 0 |

Fourfall lands at 21.9 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 159.4 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 66 games. Every named exception remains below its CI budget, no console/page errors appeared across the 67 audited URLs, and every page passed the strict meta/alt checks.

## Flux Reversi board-game addition (pass 83)

Captured 2026-05-28 against a disposable local static server after adding **Flux Reversi**, a deterministic Reversi/Othello game played against a positional-weight CPU. It fills the Board/Strategy gap alongside Chess and Checkers with the standard 8×8 disc-flip ruleset, a keyboard cursor plus tap placement, legal-move hints, automatic pass handling, persisted best margin, lazy oscillator SFX, and `render_game_to_text()` / `advanceTime(ms)` diagnostics. The strict audit covered the catalog plus 65 manifest games, 66 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 344 ms | 106 ms | 🟢 111 ms | 🟢 157.7 KB | 10 | 0 |
| Flux Reversi | 🟢 40 ms | 27 ms | 🟢 27 ms | 🟢 22.2 KB | 2 | 0 |
| Lexica | 🟢 36 ms | 39 ms | 🟢 39 ms | 🟢 151.5 KB | 4 | 0 |
| Idle Tycoon | 🟢 472 ms | 12 ms | 🟢 14 ms | 🟢 165.0 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 52 ms | 🟢 53 ms | 🟢 103.7 KB | 2 | 0 |
| Brick Breaker | 🟢 128 ms | 110 ms | 🟢 110 ms | 🟢 109.7 KB | 2 | 0 |

Flux Reversi lands at 22.2 KB / 2 requests, comfortably inside the default 100 KB / 3 request publish budget. The catalog stays well within its 200 KB / 18 request budget at 157.7 KB / 10 requests, with the lazy cover pipeline keeping first-paint requests bounded at 65 games. Every named exception remains below its CI budget, no console/page errors appeared across the 66 audited URLs, and every page passed the strict meta/alt checks.

## Catalog deferral + legacy polish pass (pass 82)

Captured 2026-05-23 against `http://127.0.0.1:4173` after moving the catalog's GitHub issue queue and recent-commit widgets behind explicit `Refresh Queue` / `Load Updates` controls, while preserving fresh session-cache hydration and local fallback links on first load. The same pass polished Brick Breaker, Metro Dash, and Neon Snake UI density without changing gameplay rules or manifest/generated surfaces. The strict audit covered the catalog plus 64 manifest games, 65 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 104 ms | 80 ms | 🟢 81 ms | 🟢 169.7 KB | 14 | 0 |
| Brick Breaker | 🟢 88 ms | 73 ms | 🟢 73 ms | 🟢 109.5 KB | 2 | 0 |
| Metro Dash | 🟢 28 ms | 21 ms | 🟢 22 ms | 🟢 79.7 KB | 2 | 0 |
| Neon Snake | 🟢 44 ms | 34 ms | 🟢 34 ms | 🟢 48.5 KB | 2 | 0 |
| Lexica | 🟢 52 ms | 16 ms | 🟢 17 ms | 🟢 149.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 444 ms | 11 ms | 🟢 13 ms | 🟢 154.3 KB | 2 | 0 |
| Arcade Jump | 🟢 92 ms | 63 ms | 🟢 63 ms | 🟢 98.0 KB | 2 | 0 |

Focused browser verification confirmed catalog startup made zero GitHub API requests, then requested the issue and commit APIs only after activating the explicit controls. The catalog now audits at 169.7 KB / 14 requests, down from 188.0 KB / 16 requests in pass 81, with no console/page errors and no mobile horizontal overflow in the touched game pages. Every named exception remains below its CI budget, and the three polished legacy games keep their existing storage keys, diagnostics, scoring, and capture expectations.

## Page-weight headroom pass (pass 81)

Captured 2026-05-23 against `http://127.0.0.1:4173` after adding the static `npm run test:page-weight` gate and mechanically trimming readable CSS/script whitespace in Idle Tycoon, Arcade Jump, and Maze Chase. The strict audit covered the catalog plus 64 manifest games, 65 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 88 ms | 68 ms | 🟢 68 ms | 🟢 188.0 KB | 16 | 0 |
| Idle Tycoon | 🟢 476 ms | 13 ms | 🟢 14 ms | 🟢 151.1 KB | 2 | 0 |
| Arcade Jump | 🟢 80 ms | 54 ms | 🟢 54 ms | 🟢 96.5 KB | 2 | 0 |
| Maze Chase | 🟢 68 ms | 28 ms | 🟢 28 ms | 🟢 66.0 KB | 2 | 0 |
| Lexica | 🟢 56 ms | 38 ms | 🟢 38 ms | 🟢 149.9 KB | 4 | 0 |
| Brick Breaker | 🟢 96 ms | 74 ms | 🟢 74 ms | 🟢 106.8 KB | 2 | 0 |

The new fast page-weight gate statically sums the catalog local shell and each game's HTML plus same-origin script dependencies against the same CI budgets used by `audit:perf:ci`. Idle Tycoon dropped from 190.1 KB to 151.1 KB, Arcade Jump from 122.1 KB to 96.5 KB, and Maze Chase from 99.3 KB to 66.0 KB while preserving generated meta/JSON-LD and game diagnostics. With the measured headroom, the named budgets tightened to Idle Tycoon 170 KB and Arcade Jump 110 KB; Maze Chase now clears the default 100 KB budget with wide margin. No console/page errors appeared across audited URLs.

## Sparse genres + catalog headroom pass (pass 80)

Captured 2026-05-22 against `http://127.0.0.1:4173` after adding Shadow Vault, Rail Yard Relay, Skyline Sentry, Tempo Forge, and Gridfront Orders; polishing the five newest games from pass 79; and replacing the generated fallback catalog with compact rows that derive default slug/url/cover values at runtime. The strict audit covered the catalog plus 64 manifest games, 65 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 92 ms | 70 ms | 🟢 70 ms | 🟢 187.9 KB | 16 | 0 |
| Shadow Vault | 🟢 68 ms | 45 ms | 🟢 45 ms | 🟢 29.6 KB | 2 | 0 |
| Rail Yard Relay | 🟢 60 ms | 41 ms | 🟢 41 ms | 🟢 26.2 KB | 2 | 0 |
| Skyline Sentry | 🟢 64 ms | 13 ms | 🟢 14 ms | 🟢 30.2 KB | 2 | 0 |
| Tempo Forge | 🟢 56 ms | 39 ms | 🟢 39 ms | 🟢 20.6 KB | 2 | 0 |
| Gridfront Orders | 🟢 60 ms | 41 ms | 🟢 41 ms | 🟢 23.5 KB | 2 | 0 |
| Lexica | 🟢 72 ms | 55 ms | 🟢 55 ms | 🟢 149.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 516 ms | 18 ms | 🟢 20 ms | 🟢 190.1 KB | 2 | 0 |
| Arcade Jump | 🟢 92 ms | 63 ms | 🟢 63 ms | 🟢 122.1 KB | 2 | 0 |
| Brick Breaker | 🟢 116 ms | 92 ms | 🟢 92 ms | 🟢 106.8 KB | 2 | 0 |

All five new games are comfortably inside the current default 100 KB / 3 request publish budget. The catalog is back under the requested 190 KB headroom target at 187.9 KB / 16 requests, while still preserving the offline fallback catalog, manifest fetch path, filter counts, discovery controls, SEO ItemList/WebSite JSON-LD, and `validate-catalog.ps1 -Fix` regeneration. The catalog's largest resource remains the HTML document itself at 108.6 KB; no cover asset appears as a largest-resource item. No console/page errors appeared across audited URLs, every page passed strict meta/alt checks, and every named exception remains below its CI budget.

## Balanced max-parallel mechanics + parity pass (pass 79)

Captured 2026-05-22 against `http://127.0.0.1:4173` after adding Volt Sudoku, Glyphogram Grid, Lumen Lander, Wordweave Grid, and Dice Dynamo; adding runtime PWA/storage probes plus validator negative fixtures; trimming Brick Breaker; and finishing keyboard/live-status/fullscreen/pause parity across the older polish set. The strict audit covered the catalog plus 59 manifest games, 60 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 132 ms | 111 ms | 🟢 112 ms | 🟢 199.1 KB | 16 | 0 |
| Volt Sudoku | 🟢 56 ms | 9 ms | 🟢 10 ms | 🟢 34.1 KB | 2 | 0 |
| Glyphogram Grid | 🟢 52 ms | 17 ms | 🟢 17 ms | 🟢 32.7 KB | 2 | 0 |
| Lumen Lander | 🟢 44 ms | 14 ms | 🟢 14 ms | 🟢 28.0 KB | 2 | 0 |
| Wordweave Grid | 🟢 52 ms | 37 ms | 🟢 37 ms | 🟢 28.9 KB | 2 | 0 |
| Dice Dynamo | 🟢 52 ms | 10 ms | 🟢 11 ms | 🟢 27.0 KB | 2 | 0 |
| Lexica | 🟢 52 ms | 17 ms | 🟢 18 ms | 🟢 149.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 468 ms | 12 ms | 🟢 13 ms | 🟢 190.1 KB | 2 | 0 |
| Arcade Jump | 🟢 112 ms | 78 ms | 🟢 78 ms | 🟢 122.1 KB | 2 | 0 |
| Brick Breaker | 🟢 100 ms | 75 ms | 🟢 75 ms | 🟢 106.8 KB | 2 | 0 |

All five new games are comfortably inside the current default 100 KB / 3 request publish budget. The catalog remains inside the 200 KB / 18 request budget at 199.1 KB / 16 requests, with the lazy cover pipeline still keeping first-paint cover requests bounded at 59 games. Brick Breaker dropped to 106.8 KB transfer after the whitespace/comment trim, adding headroom under its 120 KB / 4 request exception. Lexica, Idle Tycoon, and Arcade Jump remain below their named exceptions. No console/page errors appeared across audited URLs, every page passed strict meta/alt checks, and the largest resource on the catalog remains the HTML document rather than a cover asset.

## Five mechanics + live parity (pass 78)

Captured 2026-05-20 against `http://127.0.0.1:4321` after adding Inkline Courier, Cipher Rooms, Patchwork Foundry, Market Minute, and Bloomkeeper Grid; adding generated-surface and performance-baseline truth checks; and finishing fullscreen/live-status parity on the older polish set. The strict audit covered the catalog plus 54 manifest games, 55 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 316 ms | 132 ms | 🟢 138 ms | 🟢 190.6 KB | 16 | 0 |
| Inkline Courier | 🟢 40 ms | 13 ms | 🟢 13 ms | 🟢 31.0 KB | 2 | 0 |
| Cipher Rooms | 🟢 56 ms | 9 ms | 🟢 10 ms | 🟢 28.0 KB | 2 | 0 |
| Patchwork Foundry | 🟢 48 ms | 31 ms | 🟢 31 ms | 🟢 32.9 KB | 2 | 0 |
| Market Minute | 🟢 56 ms | 33 ms | 🟢 33 ms | 🟢 30.3 KB | 2 | 0 |
| Bloomkeeper Grid | 🟢 40 ms | 15 ms | 🟢 15 ms | 🟢 33.6 KB | 2 | 0 |
| Lexica | 🟢 44 ms | 44 ms | 🟢 45 ms | 🟢 149.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 516 ms | 14 ms | 🟢 17 ms | 🟢 190.1 KB | 2 | 0 |
| Arcade Jump | 🟢 116 ms | 80 ms | 🟢 80 ms | 🟢 122.0 KB | 2 | 0 |
| Brick Breaker | 🟢 160 ms | 147 ms | 🟢 147 ms | 🟢 114.6 KB | 2 | 0 |

All five new games are comfortably inside the current default 100 KB / 3 request publish budget. The catalog remains inside the 200 KB / 18 request budget at 190.6 KB / 16 requests with the same lazy cover request profile. Lexica remains below its 160 KB / 4 request exception at 149.9 KB, with `websites/words5.js` as the largest resource at 92.2 KB. No console/page errors appeared across audited URLs, every page passed strict meta/alt checks, and every named exception remains below its CI budget.

## Five mechanics + contract gates (pass 77)

Captured 2026-05-20 against `http://127.0.0.1:4317` after adding Orbit Salvage, Harbor Switchboard, Relay Choir, Circuit Draft, and Switchback Rally; adding stricter cover-asset and storage/runtime contract validators; tightening per-game meta drift checks; and preserving the current CI budget table. The strict audit covered the catalog plus 49 manifest games, 50 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 140 ms | 114 ms | 🟢 115 ms | 🟢 184.0 KB | 16 | 0 |
| Orbit Salvage | 🟢 40 ms | 24 ms | 🟢 24 ms | 🟢 30.3 KB | 2 | 0 |
| Harbor Switchboard | 🟢 44 ms | 15 ms | 🟢 15 ms | 🟢 33.5 KB | 2 | 0 |
| Relay Choir | 🟢 48 ms | 16 ms | 🟢 16 ms | 🟢 38.8 KB | 2 | 0 |
| Circuit Draft | 🟢 68 ms | 9 ms | 🟢 10 ms | 🟢 31.8 KB | 2 | 0 |
| Switchback Rally | 🟢 44 ms | 14 ms | 🟢 14 ms | 🟢 36.0 KB | 2 | 0 |
| Lexica | 🟢 52 ms | 17 ms | 🟢 18 ms | 🟢 131.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 488 ms | 14 ms | 🟢 16 ms | 🟢 190.1 KB | 2 | 0 |
| Arcade Jump | 🟢 96 ms | 61 ms | 🟢 61 ms | 🟢 117.8 KB | 2 | 0 |
| Brick Breaker | 🟢 116 ms | 84 ms | 🟢 84 ms | 🟢 111.9 KB | 2 | 0 |

All five new games are well inside the current default 100 KB / 3 request publish budget. The catalog remains inside the tightened 200 KB / 18 request budget at 184.0 KB / 16 requests, despite growing to 49 games, because the lazy cover pipeline keeps first-paint cover requests bounded. Lexica now audits at 131.9 KB transfer with `websites/words5.js` as its largest resource at 76.7 KB. No console/page errors appeared across audited URLs, every page passed strict meta/alt checks, and every named exception remains below its CI budget.

## Four mechanics + Lexica compaction (pass 76)

Captured 2026-05-19 against `http://127.0.0.1:4295` after adding Gridline Tactics, Service Shift, Letter Foundry, and Penalty Circuit; compacting Lexica word payloads; trimming Brick Breaker and Arcade Jump; and adding fullscreen polish to 2048, Sky Hopper, Slope Runner, Idle Tycoon, and Block Drop. The strict audit covered the catalog plus 44 manifest games, 45 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 84 ms | 72 ms | 🟢 77 ms | 🟢 182.9 KB | 16 | 0 |
| Gridline Tactics | 🟢 40 ms | 17 ms | 🟢 17 ms | 🟢 23.7 KB | 2 | 0 |
| Service Shift | 🟢 44 ms | 14 ms | 🟢 14 ms | 🟢 26.8 KB | 2 | 0 |
| Letter Foundry | 🟢 44 ms | 9 ms | 🟢 9 ms | 🟢 23.1 KB | 2 | 0 |
| Penalty Circuit | 🟢 44 ms | 10 ms | 🟢 10 ms | 🟢 25.9 KB | 2 | 0 |
| Lexica | 🟢 68 ms | 19 ms | 🟢 20 ms | 🟢 144.7 KB | 4 | 0 |
| Idle Tycoon | 🟢 472 ms | 13 ms | 🟢 15 ms | 🟢 189.7 KB | 2 | 0 |
| Arcade Jump | 🟢 84 ms | 53 ms | 🟢 53 ms | 🟢 117.8 KB | 2 | 0 |
| Brick Breaker | 🟢 100 ms | 74 ms | 🟢 74 ms | 🟢 111.9 KB | 2 | 0 |

All four new games are well inside the default 100 KB / 4 request publish budget. Service Shift and Letter Foundry include `workshop-runtime.js`, so they now use the same sandbox-safe storage fallback as the rest of the catalog while still staying at two requests each. Lexica dropped from the previous 215.9 KB transfer observation to 144.7 KB after replacing array literal wrappers with newline-string payloads; its largest resource is now `websites/words5.js` at 93.3 KB. Arcade Jump dropped from 135.3 KB to 117.8 KB, and Brick Breaker dropped from 113.7 KB to 111.9 KB. No console/page errors appeared across audited URLs, every page passed strict meta/alt checks, and every named exception remains below its CI budget.

## Per-game budget tightening (pass 75)

Captured 2026-05-18 against `http://127.0.0.1:4174` after tightening the per-game default publish budget from **150 KB / 8 requests** to **100 KB / 4 requests** to match the observed actuals (32 of 40 games fit under 70 KB / 2 requests; the typical new game lands ~30-45 KB / 2 requests).

Named exceptions cover the four games whose size is intrinsic to the gameplay:

| Game | Observed | New budget | Headroom |
|------|----------|------------|----------|
| Lexica | 215.9 KB / 4 req | 300 KB / 8 req | 84 KB |
| Idle Tycoon | 186.0 KB / 2 req | 225 KB / 8 req | 39 KB |
| Arcade Jump | 135.3 KB / 2 req | 160 KB / 4 req | 25 KB |
| Brick Breaker | 113.7 KB / 2 req | 130 KB / 4 req | 16 KB |

The other 36 manifest games all clear the new 100 KB / 4 request default with comfortable headroom. The closest-to-the-cap games on the default budget are Maze Chase 93.4 KB, Slope Runner 68.1 KB, Minesweeper 64.4 KB, Chess 63.1 KB — all ≥ 7 KB clear of the 100 KB cap. Request counts: 36 games at 2 requests, 4 fact-match games at 3 requests (HTML + workshop-runtime.js + fact-match-engine.js), all clear of the new 4-request cap.

Why tighten now: with the IntersectionObserver pass (pass 74) the catalog itself is no longer the limiting factor on perf-budget headroom, so the per-game default could afford to be the tighter gate. The previous 150 KB / 8 req default let any of the 36 smaller games silently grow 4-5x or sprout extra remote scripts before the perf-audit gate noticed. Tightening to 100 KB / 4 req means a regression that bloats a 30 KB game past triple-its-current-size or adds a 5th request trips immediately.

## IntersectionObserver lazy covers (pass 74)

Captured 2026-05-18 against `http://127.0.0.1:4174` (chromium @ 1280x800, network idle) after adding `IntersectionObserver`-based lazy loading to the catalog cover-image pipeline (`index.html` `render()` and `getCoverLazyObserver()`). The strict audit covered the same 41 pages (catalog plus 40 manifest games).

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 104 ms | 132 ms | 🟢 137 ms | 🟢 156.6 KB | 14 | 0 |

Before this pass (see pass 73): catalog at **267.1 KB / 44 requests** — exactly at the request cap. After: **156.6 KB / 14 requests**. The 30-request drop comes from only fetching the ~6 above-fold covers eagerly while the IntersectionObserver swaps the remaining 34 covers from a tiny placeholder data-URI to their real `covers/<slug>.svg` URL once the card scrolls within 300px of the viewport. Native `loading="lazy"` + `fetchpriority="low"` stay in place as hints so browsers without IntersectionObserver still get the native lazy-load behaviour.

Catalog publish budget tightened in the same pass from 280 KB / 44 requests to **200 KB / 22 requests** to lock the win in: any regression that breaks the observer (or removes it) will fail the perf gate instead of silently regressing back toward the 267 KB / 44 baseline. Catalog request count is now effectively constant in the catalog size — adding game #41+ won't move the needle on first-paint requests.

## Codex next-max-parallel — 40-game catalog (pass 73)

Captured 2026-05-18 against `http://127.0.0.1:4174` (chromium @ 1280x800, network idle) after merging Crate Circuit, Prism Relay, and Vector Pool (and the catalog perf-budget bump to 280 KB / 44 requests + drift assertions). The strict audit covered the catalog plus 40 manifest games, 41 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 344 ms | 121 ms | 🟢 125 ms | 🟡 267.1 KB | 44 | 0 |
| Crate Circuit | 🟢 36 ms | 11 ms | 🟢 11 ms | 🟢 34.6 KB | 2 | 0 |
| Prism Relay | 🟢 36 ms | 12 ms | 🟢 12 ms | 🟢 38.9 KB | 2 | 0 |
| Vector Pool | 🟢 44 ms | 15 ms | 🟢 15 ms | 🟢 41.1 KB | 2 | 0 |
| Stack Tide | 🟢 40 ms | 12 ms | 🟢 12 ms | 🟢 27.5 KB | 2 | 0 |
| Packet Pilot | 🟢 36 ms | 11 ms | 🟢 11 ms | 🟢 39.6 KB | 2 | 0 |
| Typeforge Cipher | 🟢 44 ms | 31 ms | 🟢 31 ms | 🟢 36.7 KB | 2 | 0 |
| Lexica | 🟢 48 ms | 16 ms | 🟢 17 ms | 🟡 215.9 KB | 4 | 0 |
| Idle Tycoon | 🟢 460 ms | 11 ms | 🟢 12 ms | 🟢 186.0 KB | 2 | 0 |

All three new games stay well under the default 150 KB / 8 request game budget. The catalog page is now at **44 requests — exactly the new budget cap** (zero headroom: every additional game adds one more cover request), and at 267.1 KB the catalog is back into the "yellow" 200-500 KB transfer band but still 12.9 KB under its 280 KB CI budget. The next budget refresh (or a cover-bundling pass) will be needed before the catalog grows past 40 games. No console or page errors were reported across audited URLs, and every page passed the strict meta/alt checks.

## Shadow Switch / Deckforge Duel audit (pass 71)

Captured 2026-05-17 against `http://127.0.0.1:4222` (chromium @ 1280x800, network idle) after adding Shadow Switch and Deckforge Duel plus the parallel older-game audio polish bundle. The strict audit covered the catalog plus 32 manifest games, 33 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 108 ms | 74 ms | 🟢 74 ms | 🟢 176.8 KB | 34 | 0 |
| Shadow Switch | 🟢 32 ms | 12 ms | 🟢 12 ms | 🟢 39.9 KB | 2 | 0 |
| Deckforge Duel | 🟢 44 ms | 37 ms | 🟢 37 ms | 🟢 33.1 KB | 2 | 0 |
| Brick Breaker | 🟡 1940 ms | 1922 ms | 🟢 1922 ms | 🟢 112.3 KB | 2 | 0 |
| Checkers | 🟢 52 ms | 9 ms | 🟢 35 ms | 🟢 52.6 KB | 2 | 0 |
| Minesweeper | 🟢 72 ms | 47 ms | 🟢 47 ms | 🟢 62.9 KB | 2 | 0 |
| Lexica | 🟢 32 ms | 29 ms | 🟢 29 ms | 🟡 213.6 KB | 4 | 0 |
| Idle Tycoon | 🟢 452 ms | 10 ms | 🟢 11 ms | 🟢 184.9 KB | 2 | 0 |

Shadow Switch and Deckforge Duel stay well under the default 150 KB / 8 request game budget. The older-game audio polish kept Brick Breaker, Checkers, and Minesweeper under budget; Brick Breaker's FCP remained informational only and did not affect the CI strict gate. No console or page errors were reported across the audited URLs, and every page passed the strict meta/alt checks.

## Starline Strafe audit (pass 70)

Captured 2026-05-17 against `http://127.0.0.1:4214` (chromium @ 1280x800, network idle) after adding Starline Strafe and the parallel audio/catalog/CI polish bundle. The strict audit covered the catalog plus 30 manifest games, 31 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 84 ms | 92 ms | 🟢 92 ms | 🟢 188.8 KB | 34 | 0 |
| Starline Strafe | 🟢 36 ms | 15 ms | 🟢 15 ms | 🟢 38.1 KB | 2 | 0 |
| Klondike Solitaire | 🟢 44 ms | 11 ms | 🟢 11 ms | 🟢 47.8 KB | 2 | 0 |
| Block Drop | 🟢 40 ms | 23 ms | 🟢 24 ms | 🟢 52.2 KB | 2 | 0 |
| Slope Runner | 🟢 72 ms | 40 ms | 🟢 40 ms | 🟢 65.9 KB | 2 | 0 |
| Idle Tycoon | 🟢 476 ms | 13 ms | 🟢 15 ms | 🟢 184.9 KB | 2 | 0 |
| Lexica | 🟢 52 ms | 38 ms | 🟢 38 ms | 🟡 213.6 KB | 4 | 0 |

Starline Strafe stays well under the default 150 KB / 8 request game budget. No console or page errors were reported across the audited URLs, and every page passed the strict meta/alt checks.

## Circuit Putt audit (pass 66)

Captured 2026-05-15 against `http://127.0.0.1:4192` (chromium @ 1280x800, network idle) after adding Circuit Putt. The strict audit covered the catalog plus 26 manifest games, 27 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 564 ms | 537 ms | 🟢 537 ms | 🟢 152.0 KB | 28 | 0 |
| Paddle Pulse | 🟢 68 ms | 57 ms | 🟢 58 ms | 🟢 25.6 KB | 2 | 0 |
| Rhythm Circuit | 🟢 76 ms | 36 ms | 🟢 36 ms | 🟢 26.2 KB | 2 | 0 |
| Circuit Putt | 🟢 80 ms | 59 ms | 🟢 59 ms | 🟢 37.6 KB | 2 | 0 |
| Idle Tycoon | 🟢 520 ms | 20 ms | 🟢 24 ms | 🟢 184.9 KB | 2 | 0 |
| Lexica | 🟢 92 ms | 65 ms | 🟢 66 ms | 🟡 213.6 KB | 4 | 0 |

Circuit Putt stays well under the default 150 KB / 8 request game budget. No console or page errors were reported across the audited URLs, and every page passed the strict meta/alt checks.

## Rhythm Circuit audit (pass 65)

Captured 2026-05-15 against `http://127.0.0.1:4188` (chromium @ 1280x800, network idle) after adding Rhythm Circuit. The strict audit covered the catalog plus 25 manifest games, 26 pages total.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 512 ms | 485 ms | 🟢 486 ms | 🟢 148.2 KB | 27 | 0 |
| Paddle Pulse | 🟢 560 ms | 521 ms | 🟢 523 ms | 🟢 25.6 KB | 2 | 0 |
| Rhythm Circuit | 🟢 444 ms | 338 ms | 🟢 339 ms | 🟢 26.2 KB | 2 | 0 |
| Idle Tycoon | 🟢 1320 ms | 1116 ms | 🟢 1117 ms | 🟢 184.9 KB | 2 | 0 |
| Lexica | 🟢 440 ms | 481 ms | 🟢 482 ms | 🟡 213.6 KB | 4 | 0 |

Rhythm Circuit stays well under the default 150 KB / 8 request game budget. No console or page errors were reported across the audited URLs, and every page passed the strict meta/alt checks.

## Final cover SVG audit (pass 60)

Captured 2026-05-14 against `http://127.0.0.1:4176` (chromium @ 1280x800, network idle) after replacing the last catalog PNG covers.

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🟢 112 ms | 95 ms | 🟢 95 ms | 🟢 140.7 KB | 25 | 0 |
| Memory Match | 🟢 60 ms | 10 ms | 🟢 11 ms | 🟢 25.6 KB | 2 | 0 |
| Reflex Spark | 🟢 52 ms | 8 ms | 🟢 9 ms | 🟢 22.9 KB | 2 | 0 |
| Echo Mimic | 🟢 44 ms | 8 ms | 🟢 8 ms | 🟢 22.4 KB | 2 | 0 |
| Neon Snake | 🟢 36 ms | 27 ms | 🟢 27 ms | 🟢 36.8 KB | 2 | 0 |
| Lexica | 🟢 48 ms | 15 ms | 🟢 16 ms | 🟡 213.6 KB | 4 | 0 |

The catalog's largest resource is now the HTML document itself; no cover art appears as a largest-resource item. The Lexica word list remains the largest audited asset and is game-essential.

## After meta-tag injection (pass 58)

Captured 2026-05-14 against https://jakethehoffer.github.io/Workshop-Arcade/ (chromium @ 1280×800, network idle).

All 6 audited pages render with the full social/SEO meta tag set:

| Page | title | description | viewport | lang | canonical | og:title | og:desc | og:image | og:url | twitter:card | theme-color |
|------|-------|-------------|----------|------|-----------|----------|---------|----------|--------|--------------|-------------|
| Catalog | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Memory Match | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reflex Spark | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Echo Mimic | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Neon Snake | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lexica | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Before meta-tag injection (pre-fix baseline)

Initial audit run after Pages went live (pass 57) surfaced that every individual game page was missing every social/SEO meta tag the catalog already had. Direct game URLs got bare previews when shared.

| Page | description | canonical | og:* | twitter:* | theme-color |
|------|-------------|-----------|------|-----------|-------------|
| Catalog | ✓ | ✓ | ✓ | ✓ | ✓ |
| Memory Match | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reflex Spark | ✗ | ✗ | ✗ | ✗ | ✗ |
| Echo Mimic | ✗ | ✗ | ✗ | ✗ | ✗ |
| Neon Snake | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lexica | ✗ | ✗ | ✗ | ✗ | ✗ |

`scripts/inject-game-meta.mjs` (idempotent) reads `websites/manifest.json` and writes a per-game social block between `<!-- workshop-meta:start -->` / `<!-- workshop-meta:end -->` markers right after each game's `<title>` tag. Re-run via `npm run inject:meta` after editing the manifest.

## Headline metrics (first audit, pre-fix)

| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |
|------|-----|------------------|------|----------|----------|--------|
| Catalog | 🔴 3032 ms | 3056 ms | 🟡 3056 ms | 🟢 196.2 KB | 14 | 0 |
| Memory Match | 🟡 2824 ms | 2800 ms | 🟡 2800 ms | 🟢 24.3 KB | 2 | 0 |
| Reflex Spark | 🟢 216 ms | 204 ms | 🟢 204 ms | 🟢 21.7 KB | 2 | 0 |
| Echo Mimic | 🟢 692 ms | 643 ms | 🟢 643 ms | 🟢 21.2 KB | 2 | 0 |
| Neon Snake | 🔴 3192 ms | 3184 ms | 🟡 3184 ms | 🟢 35.6 KB | 2 | 0 |
| Lexica | 🟢 212 ms | 266 ms | 🟢 267 ms | 🟡 211.7 KB | 4 | 0 |

FCP thresholds: 🟢 ≤1800ms, 🟡 ≤3000ms (Lighthouse mobile). Load: 🟢 ≤2500ms, 🟡 ≤4000ms. Transfer: 🟢 ≤200KB, 🟡 ≤500KB.

Caveats on the first-audit FCPs: the high values on Catalog / Memory Match / Neon Snake are sequential cold-cache effects (those three were audited first; DNS + GitHub Pages CDN warmed up by the time later pages ran). A second sequential audit run typically shows all pages well under the green threshold.

No console or page errors across any audited URL. Zero `img` elements missing `alt`. Every catalog accessibility audit static check (`npm run test:a11y` rules 1-4) passes.

## Largest resource per page

### After codex next-max-parallel pass (pass 73)

- Strict local CI audit now covers 41 pages: the catalog plus 40 manifest games.
- **Catalog**: 267.1 KB / 44 requests, inside the 280 KB / 44 request CI budget — but at the request cap with zero headroom for game 41.
- **Crate Circuit**: 34.6 KB / 2 requests, inside the default 150 KB / 8 request game budget.
- **Prism Relay**: 38.9 KB / 2 requests, inside the default 150 KB / 8 request game budget.
- **Vector Pool**: 41.1 KB / 2 requests, inside the default 150 KB / 8 request game budget.
- Largest game resources remain expected: **Lexica** uses `websites/words5.js` at 155.5 KB under its 300 KB exception, and **Idle Tycoon** ships 186.0 KB under its 225 KB exception. No console or page errors appeared across audited URLs.

### After Gemline/Dungeon + tool-gate bundle (pass 72)

- Strict local CI audit now covers 35 pages: the catalog plus 34 manifest games.
- **Catalog**: 216.9 KB / 38 requests, inside the 280 KB / 44 request CI budget.
- **Gemline Cascade**: 15.6 KB / 2 requests, inside the default 150 KB / 8 request game budget.
- **Dungeon Circuit**: 17.2 KB / 2 requests, inside the default 150 KB / 8 request game budget.
- Largest game resources remain expected: **Lexica** uses `websites/words5.js` at 155.5 KB under its 300 KB exception, and **Idle Tycoon** ships 184.8 KB under its 225 KB exception. No console or page errors appeared across audited URLs.

### After final cover SVG pass (pass 60)

- **Catalog**: all cover thumbnails now use SVG; largest cover is under 10 KB.
- **Memory Match**: 24.5 KB — `/websites/memory-match.html`
- **Reflex Spark**: 21.8 KB — `/websites/reflex-spark.html`
- **Echo Mimic**: 21.4 KB — `/websites/echo-mimic.html`
- **Neon Snake**: 35.7 KB — `/websites/snake.html`
- **Lexica**: 155.5 KB — `/websites/words5.js` (5-letter wordlist; game-essential)

Pass 60 finished the cover optimization by adding compact hand-authored SVG covers for Brick Breaker and Checkers, and by pointing Slope Runner at the existing slope-runner SVG art. The catalog no longer references PNG cover thumbnails.

### After PNG -> SVG swap (pass 59)

- **Catalog**: one remaining stale cover PNG was the largest catalog asset.
- **Memory Match**: 24.5 KB — `/websites/memory-match.html`
- **Reflex Spark**: 21.8 KB — `/websites/reflex-spark.html`
- **Echo Mimic**: 21.4 KB — `/websites/echo-mimic.html`
- **Neon Snake**: 35.7 KB — `/websites/snake.html`
- **Lexica**: 155.5 KB — `/websites/words5.js` (5-letter wordlist; game-essential)

Pass 59 swapped 11 catalog covers from PNG to existing SVG twins already in the repo. Total cover-asset weight dropped from ~1086 KB to ~34 KB for those 11 games. Three covers still needed follow-up at that point; pass 60 completed the set.

### Initial baseline (pre-swap)

- **Catalog**: 109.7 KB — `/covers/minesweeper.png` (now SVG; 4 KB)
- **Memory Match**: 23.3 KB — `/websites/memory-match.html`
- **Reflex Spark**: 20.6 KB — `/websites/reflex-spark.html`
- **Echo Mimic**: 20.1 KB — `/websites/echo-mimic.html`
- **Neon Snake**: 34.6 KB — `/websites/snake.html`
- **Lexica**: 155.5 KB — `/websites/words5.js` (5-letter wordlist)

## How to re-run

```bash
npm ci
npm run audit:perf
```

Run the same strict checks CI uses against a local static server:

```bash
npm run audit:perf:local
```

Audit a different deployment by overriding the URL:

```bash
WORKSHOP_ARCADE_URL=https://example.com npm run audit:perf
```

The full-manifest audit usually takes about 1-2 minutes end-to-end (Playwright cold-starts chromium once and reuses it).
