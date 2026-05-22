# Workshop Arcade Performance & SEO Baseline

This is a tracked set of performance and SEO audit snapshots for the live GitHub Pages deployment and local verification runs. Reproduce with:

```bash
npm run audit:perf
```

`audit:perf` is a local Playwright-based audit (see `scripts/audit-pagespeed.mjs`). It hits the live URL, walks the catalog plus every game in `websites/manifest.json`, and measures the metrics Lighthouse cares about most: paint timing, transfer weight, request count, console errors, meta-tag completeness, and the largest single resource per page. The raw per-run JSON is written under `test-results/lighthouse-baseline/<timestamp>/` (gitignored).

CI runs `npm run audit:perf:ci` against a local static server. Strict mode fails on deterministic regressions only: load failures, HTTP 4xx/5xx responses, console/page errors, missing required meta tags, images missing `alt`, excessive transfer, or excessive request count. FCP/load timing stays informational to avoid flaky failures on shared runners.

CI budgets:

| Page group | Transfer | Requests |
|------------|----------|----------|
| Catalog | 200 KB | 18 |
| Lexica | 160 KB | 4 |
| Idle Tycoon | 210 KB | 4 |
| Arcade Jump | 130 KB | 4 |
| Brick Breaker | 120 KB | 4 |
| Other manifest games | 100 KB | 3 |

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
npm run start -- --host 127.0.0.1 --port 4173
WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci
```

Audit a different deployment by overriding the URL:

```bash
WORKSHOP_ARCADE_URL=https://example.com npm run audit:perf
```

The full-manifest audit usually takes about 1-2 minutes end-to-end (Playwright cold-starts chromium once and reuses it).
