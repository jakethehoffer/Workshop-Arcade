# Workshop Arcade Performance & SEO Baseline

This is a tracked snapshot of the first audit run against the live GitHub Pages deployment. Reproduce with:

```bash
npm run audit:perf
```

`audit:perf` is a local Playwright-based audit (see `scripts/audit-pagespeed.mjs`). It hits the live URL, walks a representative sample of pages, and measures the metrics Lighthouse cares about most: paint timing, transfer weight, request count, console errors, meta-tag completeness, and the largest single resource per page. The raw per-run JSON is written under `test-results/lighthouse-baseline/<timestamp>/` (gitignored).

## After meta-tag injection (commit forthcoming)

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

### After PNG → SVG swap (pass 59)

- **Catalog**: 151.1 KB — `/covers/shape-inlay.png` (next-step target)
- **Memory Match**: 24.5 KB — `/websites/memory-match.html`
- **Reflex Spark**: 21.8 KB — `/websites/reflex-spark.html`
- **Echo Mimic**: 21.4 KB — `/websites/echo-mimic.html`
- **Neon Snake**: 35.7 KB — `/websites/snake.html`
- **Lexica**: 155.5 KB — `/websites/words5.js` (5-letter wordlist; game-essential)

Pass 59 swapped 11 catalog covers from PNG to existing SVG twins already in the repo. Total cover-asset weight dropped from ~1086 KB to ~34 KB for the 11 swapped games. Three covers remain on PNG because they have no SVG twin yet — these are the next-step optimization targets:

- `covers/brick-breaker.png` (124 KB)
- `covers/checkers.png` (121 KB)
- `covers/shape-inlay.png` (151 KB)

Replacing those with hand-crafted SVG covers (matching the pattern of the newer game covers) would bring every cover under 10 KB.

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

Audit a different deployment by overriding the URL:

```bash
WORKSHOP_ARCADE_URL=https://example.com npm run audit:perf
```

The audit takes ~30 seconds end-to-end (Playwright cold-starts chromium once and reuses it).
