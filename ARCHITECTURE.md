# Architecture

Workshop Arcade is a static catalog of HTML5 browser games hosted on GitHub Pages. There is no backend — every game is a standalone HTML file in `websites/` that runs in the visitor's browser, and the catalog page (`index.html`) is plain HTML + inline CSS + inline ES2020. This document explains how the pieces fit together so a new contributor (or AI agent) can find the right surface to change without reading every file.

If you're here to ship a new game, jump straight to [Adding a new game](#adding-a-new-game).

## The manifest is the source of truth

Every generator and every validator reads from **[`websites/manifest.json`](websites/manifest.json)** — a JSON array of game entries shaped by [`schemas/manifest.schema.json`](schemas/manifest.schema.json). Editing the manifest is editing the catalog: covers, sitemap, JSON-LD, OG share cards, feed entries, and the in-page `FALLBACK_GAMES` constant all derive from it.

```
websites/manifest.json   ← single source of truth
        │
        ├── inject-game-meta.mjs ──► websites/*.html (workshop-meta block + workshop-jsonld block)
        ├── build-sitemap.mjs    ──► sitemap.xml + index.html (ItemList JSON-LD)
        ├── build-feed.mjs       ──► feed.json
        ├── build-og-images.mjs  ──► covers/og/*.svg
        ├── validate-catalog.ps1 ──► (regenerates FALLBACK_GAMES inside index.html with -Fix)
        ├── smoke-games.mjs      ──► spawns Playwright across every entry
        ├── capture-games.mjs    ──► rendered-quality contact sheet
        └── audit-pagespeed.mjs  ──► strict perf/SEO budget audit
```

Per-game contract details (audio, render hooks, mobile layout) live in [`docs/game-contract.md`](docs/game-contract.md). The schema in [`schemas/manifest.schema.json`](schemas/manifest.schema.json) is wired into [`.vscode/settings.json`](.vscode/settings.json) so editors validate manifest entries inline.

## Generators

These scripts transform the manifest into the surfaces the catalog serves. All are byte-deterministic so the matching `test:*` validators can detect drift.

| Script | Produces | Triggered by | Validator |
|--------|----------|--------------|-----------|
| [`scripts/inject-game-meta.mjs`](scripts/inject-game-meta.mjs) | Workshop-meta + workshop-jsonld blocks inside every `websites/*.html` | `npm run inject:meta` | `test:game-jsonld` |
| [`scripts/build-sitemap.mjs`](scripts/build-sitemap.mjs) | `sitemap.xml` + JSON-LD `ItemList` block in `index.html` | `npm run build:sitemap` | `test:seo` |
| [`scripts/build-feed.mjs`](scripts/build-feed.mjs) | `feed.json` (JSON Feed 1.1, newest-first) | `npm run build:feed` | `test:feed` |
| [`scripts/build-og-images.mjs`](scripts/build-og-images.mjs) | One 1200×630 `covers/og/<slug>.svg` per game | `npm run build:og-images` | `test:og-images` |
| [`scripts/validate-catalog.ps1`](scripts/validate-catalog.ps1) (with `-Fix`) | Rewrites the `FALLBACK_GAMES` constant inside `index.html` | `pwsh scripts/validate-catalog.ps1 -Fix` | catalog validator (run without `-Fix`) |

## Validators (the fast gates)

`npm test` invokes [`scripts/run-fast-tests.mjs`](scripts/run-fast-tests.mjs), which auto-discovers every `test:*` npm script and runs them in sequence (excluding `test:games`, which needs Playwright). Each gate locks in one concern.

| Concern | Validator(s) |
|---------|--------------|
| **Manifest contract** | `test:manifest-schema` |
| **Catalog source of truth** | `validate-catalog.ps1` (no npm wrapper) |
| **Generator output mirrors manifest** | `test:seo` · `test:feed` · `test:og-images` · `test:game-jsonld` |
| **Catalog UI contracts** | `test:catalog-perf` · `test:deep-links` · `test:random-game` · `test:keyboard-help` · `test:sw-update-toast` |
| **Accessibility** | `test:a11y` · `test:a11y-polish` |
| **PWA + fallback pages** | `test:pwa` · `test:fallback-pages` |
| **OSS hygiene** | `test:meta-files` · `test:security-workflows` · `test:contributor-onboarding` |
| **Tooling integrity** | `test:tools` · `test:test-aggregator` · `test:capture-recipes` · `test:docs` |
| **Live game smoke** | `test:games` (Playwright, slow — run via `npm run test:games` or `npm run test:all`) |

The [docs drift validator](scripts/check-docs-drift.mjs) (`test:docs`) keeps `README.md`, `CONTRIBUTING.md`, `docs/game-contract.md`, the PR/issue templates, and the workflow YAML all naming the same publish-ready command set, so contributor-facing docs can't quietly fall behind CI.

## CI workflow structure

[`.github/workflows/validate-catalog.yml`](.github/workflows/validate-catalog.yml) is split into four jobs that run in parallel on every push and pull request:

1. **`catalog-docs-a11y`** — all the fast structural validators above, in roughly the order generators → validators → a11y → tooling-meta. This is the job that gates merges on most catalog edits.
2. **`game-smoke`** — Playwright spawns the catalog page and opens every manifest game on desktop and mobile viewports, asserting no console errors and that filter chips / card tags behave correctly. Runs `npm run test:games`.
3. **`performance-audit`** — boots the static server on port 4173 and runs `npm run audit:perf:ci` against it. Strict mode fails if any page exceeds its publish budget (Catalog ≤ 250 KB / ≤ 40 requests; Idle Tycoon ≤ 225 KB; Lexica ≤ 300 KB; everything else ≤ 150 KB).
4. **`render-capture`** — runs `npm run capture:games:ci` to take desktop + mobile screenshots of every game and score them against a render-quality bar. Strict mode fails if any surface scores above 0.

Two additional workflows live alongside:

- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) — CodeQL `javascript-typescript` analysis with the `security-extended` query pack on every push/PR plus a Monday cron.
- [`.github/dependabot.yml`](.github/dependabot.yml) — weekly Monday npm + github-actions update PRs, scoped commit prefixes (`deps:` / `ci:`), and a `playwright` group so the `@playwright/*` family lands in one PR.

## Adding a new game

The end-to-end recipe a contributor should follow:

1. **Author the game file** at `websites/<slug>.html` — a single self-contained HTML page that follows [`docs/game-contract.md`](docs/game-contract.md) (canvas with `aria-label`, persisted sound toggle, `render_game_to_text()` + `advanceTime(ms)` diagnostics for the smoke harness, mobile layout, etc.).
2. **Draw a 640×360 cover** at `covers/<slug>.svg` (or another supported format) — reuse the catalog's dark gradient palette so the catalog grid stays cohesive.
3. **Add a manifest entry** to `websites/manifest.json` with `id` / `title` / `subtitle` / `tags` / `slug` / `url` / `cover` / `addedAt` / `popularity`. The schema in `schemas/manifest.schema.json` will validate the entry inline in any JSON-Schema-aware editor.
4. **Regenerate derived surfaces**:

   ```powershell
   pwsh scripts/validate-catalog.ps1 -Fix    # refreshes FALLBACK_GAMES inside index.html
   npm run inject:meta                       # workshop-meta + workshop-jsonld per game
   npm run build:sitemap                     # sitemap.xml + index.html ItemList
   npm run build:feed                        # feed.json
   npm run build:og-images                   # 1200x630 share card
   ```

5. **Add a capture recipe** in `scripts/capture-games.mjs` so the render-quality harness knows how to interact with the new game (start, take a screenshot at an interesting moment).
6. **Run `npm test`** — every fast gate should pass.
7. **Run `npm run test:games`** to confirm the Playwright smoke suite is happy with the new entry.
8. **Commit + PR.** GitHub Actions runs the four-job workflow plus CodeQL; once green, merging to `main` triggers an automatic Pages deploy.
