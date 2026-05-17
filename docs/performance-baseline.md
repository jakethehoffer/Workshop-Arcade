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
| Catalog | 250 KB | 40 |
| Lexica | 300 KB | 8 |
| Idle Tycoon | 225 KB | 8 |
| Other manifest games | 150 KB | 8 |

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
