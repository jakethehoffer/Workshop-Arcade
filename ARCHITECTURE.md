# Architecture

Workshop Arcade is a player-facing static catalog of HTML5 browser games designed to move cleanly from the current GitHub Pages preview to an owned-domain arcade. There is no backend — every game is a standalone HTML file in `websites/` that runs in the visitor's browser, and the catalog page (`index.html`) is plain HTML + inline CSS + inline ES2020. This document explains how the pieces fit together so a new contributor (or AI agent) can find the right surface to change without reading every file.

If you're here to ship a new game, jump straight to [Adding a new game](#adding-a-new-game).

## The manifest is the source of truth

Every generator and every validator reads from **[`websites/manifest.json`](websites/manifest.json)** — a JSON array of game entries shaped by [`schemas/manifest.schema.json`](schemas/manifest.schema.json). Editing the manifest is editing the catalog: daily and for-you player shelves, covers, sitemap, JSON-LD, OG share cards, feed entries, and the in-page `FALLBACK_GAMES` constant all derive from it. Canonical public URL settings live in [`scripts/site-config.mjs`](scripts/site-config.mjs), so sitemap/feed/OG/JSON-LD/meta can move from the current preview path to a root domain by setting `WORKSHOP_ARCADE_SITE_ORIGIN` and `WORKSHOP_ARCADE_SITE_BASE_PATH=/` before regeneration.

```
websites/manifest.json   ← single source of truth
        │
        ├── site-config.mjs      ──► canonical origin/base path for public metadata
        ├── inject-game-meta.mjs ──► websites/*.html (workshop-meta block + workshop-jsonld block)
        ├── build-sitemap.mjs    ──► sitemap.xml + robots.txt + index.html JSON-LD/root meta
        ├── build-feed.mjs       ──► feed.json
        ├── build-og-images.mjs  ──► covers/og/*.svg + covers/og-image.svg
        ├── validate-catalog.ps1 ──► (regenerates FALLBACK_GAMES inside index.html with -Fix)
        ├── smoke-games.mjs      ──► spawns Playwright across every entry
        ├── capture-games.mjs    ──► rendered-quality contact sheet
        ├── check-page-weight.mjs ──► fast static payload budget check
        └── audit-pagespeed.mjs  ──► strict perf/SEO budget audit
```

Per-game contract details (audio, render hooks, mobile layout) live in [`docs/game-contract.md`](docs/game-contract.md). The schema in [`schemas/manifest.schema.json`](schemas/manifest.schema.json) is wired into [`.vscode/settings.json`](.vscode/settings.json) so editors validate manifest entries inline.

## Generators

These scripts transform the manifest into the surfaces the catalog serves. All are byte-deterministic so the matching `test:*` validators can detect drift.

| Script | Produces | Triggered by | Validator |
|--------|----------|--------------|-----------|
| [`scripts/site-config.mjs`](scripts/site-config.mjs) | Canonical `SITE_URL` / path helpers consumed by SEO/social generators | env-driven helper | `test:owned-domain-readiness` + generator validators |
| [`scripts/inject-game-meta.mjs`](scripts/inject-game-meta.mjs) | Workshop-meta + workshop-jsonld blocks inside every `websites/*.html` | `npm run inject:meta` | `test:game-jsonld` |
| [`scripts/build-sitemap.mjs`](scripts/build-sitemap.mjs) | `sitemap.xml`, `robots.txt`, root canonical/OG URLs, and JSON-LD blocks in `index.html` | `npm run build:sitemap` | `test:seo` |
| [`scripts/build-feed.mjs`](scripts/build-feed.mjs) | `feed.json` (JSON Feed 1.1, newest-first) | `npm run build:feed` | `test:feed` |
| [`scripts/build-og-images.mjs`](scripts/build-og-images.mjs) | One 1200×630 `covers/og/<slug>.svg` per game | `npm run build:og-images` | `test:og-images` |
| [`scripts/validate-catalog.ps1`](scripts/validate-catalog.ps1) (with `-Fix`) | Rewrites the `FALLBACK_GAMES` constant inside `index.html` | `pwsh scripts/validate-catalog.ps1 -Fix` | catalog validator (run without `-Fix`) |

## Validators (the fast gates)

`npm test` invokes [`scripts/run-fast-tests.mjs`](scripts/run-fast-tests.mjs), which auto-discovers every fast `test:*` npm script and runs them in sequence. Browser-backed probes (`test:games`, `test:pwa-runtime`, `test:runtime-storage`, `test:live-canvas-evidence`) stay explicit because they need Chromium/service worker support. Each gate locks in one concern.

| Concern | Validator(s) |
|---------|--------------|
| **Manifest contract** | `test:manifest-schema` |
| **Catalog source of truth** | `validate-catalog.ps1` (no npm wrapper) |
| **Generator output mirrors manifest** | `test:seo` · `test:feed` · `test:og-images` · `test:game-jsonld` · `test:generated-surfaces` |
| **Owned-domain launch config** | `test:owned-domain-readiness` |
| **Asset/runtime/perf contracts** | `test:cover-assets` · `test:storage-contract` · `test:runtime-storage` · `test:page-weight` · `test:pwa-install-budget` |
| **Catalog UI contracts** | `test:catalog-perf` · `test:workshop-feedback` · `test:deep-links` · `test:url-filters` · `test:random-game` · `test:keyboard-help` · `test:favorites` · `test:player-session` · `test:sw-update-toast` |
| **Accessibility** | `test:a11y` · `test:a11y-polish` |
| **PWA + fallback pages** | `test:pwa` · `test:pwa-runtime` (includes bounded runtime-cache trim) · `test:fallback-pages` |
| **OSS hygiene** | `test:meta-files` · `test:security-workflows` · `test:github-security-settings` (explicit authenticated remote gate) · `test:pages-artifact` · `test:contributor-onboarding` |
| **Tooling integrity** | `test:tools` · `test:test-aggregator` · `test:publish-ready-contract` · `test:capture-recipes` · `test:docs` · `test:performance-baseline` · `test:validator-fixtures` |
| **Live game smoke** | `test:live-smoke-slugs` (fast fixture for Deploy Pages touched-slug derivation) · `test:live-canvas-evidence` (local Playwright fixture for live-smoke canvas aggregation) · `test:games` (local Playwright, slow — run via `npm run test:games` or `npm run test:all`) · `test:live-pages` (Deploy Pages post-deploy smoke with auto-selected touched slugs plus explicit preview checks) |

The [docs drift validator](scripts/check-docs-drift.mjs) (`test:docs`) keeps `README.md`, `CONTRIBUTING.md`, `docs/game-contract.md`, the PR/issue templates, and the workflow YAML all naming the same publish-ready command set, so contributor-facing docs can't quietly fall behind CI.

## CI workflow structure

[`.github/workflows/validate-catalog.yml`](.github/workflows/validate-catalog.yml) is split into four jobs that run in parallel on every push and pull request:

1. **`catalog-docs-a11y`** — all the fast structural validators above, including the Pages artifact assembly guard, owned-domain readiness dry run, and `npm run test:live-smoke-slugs` touched-slug fixtures, in roughly the order generators → validators → a11y → tooling-meta. This is the job that gates merges on most catalog edits.
2. **`game-smoke`** — Playwright first proves the sandboxed storage fallback, service-worker offline behavior, and live-smoke canvas evidence aggregation in Chromium, then spawns the catalog page and opens every manifest game on desktop and mobile viewports, asserting no console errors and that filter chips / card tags behave correctly. Runs `npm run test:runtime-storage`, `npm run test:pwa-runtime`, `npm run test:live-canvas-evidence`, and `npm run test:games`.
3. **`performance-audit`** — boots the static server on port 4173 and runs `npm run audit:perf:ci` against it. For local publish checks, `npm run audit:perf:local` starts a disposable static server on an open loopback port, sets `WORKSHOP_ARCADE_URL`, runs the same strict audit, and cleans up the server. Strict mode fails if any page exceeds its publish budget (Catalog ≤ 200 KB / ≤ 18 requests; Lexica ≤ 160 KB / ≤ 4 requests; Idle Tycoon ≤ 170 KB / ≤ 4 requests; Arcade Jump ≤ 110 KB / ≤ 4 requests; Brick Breaker ≤ 120 KB / ≤ 4 requests; everything else ≤ 100 KB / ≤ 3 requests).
4. **`render-capture`** — runs `npm run capture:games:ci` to take desktop + mobile screenshots of every game and score them against a render-quality bar. Strict mode fails if any surface scores above 0.

For one local launch-QA command, run `npm run test:publish-ready`. It executes the catalog validator, `npm test`, browser/runtime probes, `npm run test:games`, strict render capture, local performance audit, and `git diff --check` in order, then writes `test-results/publish-ready/<timestamp>/summary.json` and `test-results/publish-ready/<timestamp>/report.md`. The fast `test:publish-ready-contract` gate keeps that slow command wired without adding it to `npm test`.

After a `main` push, [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) currently assembles the preview `_site` artifact with `scripts/build-pages-artifact.mjs` from the static app, public docs/tooling surfaces, and `.well-known/security.txt`, publishes it with the GitHub Pages Actions flow instead of the legacy branch-root build, derives touched game slugs from the push diff with `scripts/derive-live-smoke-slugs.mjs`, then runs `npm run test:live-pages` against the deployed Pages URL with a short retry loop for propagation delays. This is maintenance infrastructure for the current preview; the product target remains an owned-domain arcade using the same static artifact and canonical URL config. `npm run test:owned-domain-readiness` dry-runs the root-domain canonical config in memory so sitemap/feed/root meta/game JSON-LD output can be proven before a final domain is chosen. The workflow uploads `test-results/live-pages-smoke/**` as a 14-day artifact so failed deploys retain summary/report evidence. `npm run test:pages-artifact` builds and verifies that same artifact policy locally so hidden public paths and internal directory exclusions are checked before deployment. `npm run test:live-smoke-slugs` locally guards the direct game, cover, OG cover, shared-script, fallback, de-duping, and `$GITHUB_ENV` slug-selection behavior before deployment. `npm run test:live-canvas-evidence` locally guards the live-smoke canvas aggregation logic before deployment, while the live smoke checks the deployed catalog, manifest, feed, sitemap, PWA/fallback surfaces, `.well-known/security.txt`, selected direct game pages, browser errors, mobile overflow, rendered screenshots/diagnostics, canvas nonblank evidence, and verifies the catalog does not call the GitHub API during startup. It also compares deployed shell/catalog SHA-256 content hashes (`index.html`, `websites/manifest.json`, `feed.json`, `sitemap.xml`, `app.webmanifest`, `offline.html`, `404.html`, `robots.txt`, and `.well-known/security.txt`), deployed game HTML SHA-256 content hashes, and the deployed `sw.js` `SHELL_REVISION` with local files so a Pages smoke proves the deployed shell and touched pages match the branch being verified; set `WORKSHOP_ARCADE_EXPECTED_SW_REVISION` for an intentional alternate revision, `WORKSHOP_ARCADE_SKIP_SW_REVISION=1` only for historical deploy checks, or `WORKSHOP_ARCADE_SKIP_CONTENT_HASH=1` only for intentional historical/preview content checks. Set `WORKSHOP_ARCADE_URL` for a preview deployment and `WORKSHOP_ARCADE_LIVE_SLUGS` or `WORKSHOP_ARCADE_TOUCHED_SLUGS` for the game pages touched by the release; `WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1` fails release verification that forgets explicit slugs. Without a slug override, including non-push/manual workflow runs or commits with no game-related file paths, the smoke checks the three newest manifest entries. Each run writes `test-results/live-pages-smoke/<timestamp>/summary.json` and `test-results/live-pages-smoke/<timestamp>/report.md` for handoff evidence.

Three additional workflows live alongside:

- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) — CodeQL `javascript-typescript` analysis with the `security-extended` query pack on every push/PR plus a Monday cron.
- [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) — GitHub Pages deployment from the curated `scripts/build-pages-artifact.mjs` Actions artifact with modern Pages actions, least-privilege permissions, explicit `.well-known/security.txt` publication, touched-slug post-deploy `test:live-pages`, and a retained `live-pages-smoke` evidence artifact.
- [`.github/workflows/security-surfaces.yml`](.github/workflows/security-surfaces.yml) — Security Surfaces drift check for GitHub-native vulnerability alerts, Dependabot security updates, private vulnerability reporting, secret scanning, secret scanning push protection, and open security alert backlogs via `npm run test:github-security-settings` on push, weekly, and manual dispatch. The workflow uses `SECURITY_SURFACES_TOKEN` as the strict remote gate token when configured; otherwise it records the default `GITHUB_TOKEN` API limitation as an Actions warning and leaves the local command strict.
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
7. **Run `npm run test:games`** to confirm the Playwright smoke suite is happy with the new entry, or `npm run test:publish-ready` before publishing a larger launch-QA pass.
8. **Commit and publish.** GitHub Actions runs the four-job validation workflow plus CodeQL; once the change reaches `main`, the preview Deploy Pages workflow publishes the curated static artifact and runs the deployed-site smoke. For owned-domain launch, set the final canonical URL config, regenerate metadata, deploy the same artifact to the domain host, and run `npm run test:live-pages` with `WORKSHOP_ARCADE_URL` pointed at the owned domain.
