# Workshop Arcade

[![Validate Catalog](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/validate-catalog.yml/badge.svg)](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/validate-catalog.yml)
[![CodeQL](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/codeql.yml/badge.svg)](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Workshop Arcade is a player-facing static arcade: 78 browser games, instant play in a sandboxed modal, favorites, recent plays, random discovery from the catalog and player, direct game links, share links, install/offline support, and a lightweight suggestion flow for improvement ideas.

Each game lives as a standalone HTML file under `websites/`, with catalog metadata in `websites/manifest.json` and cover art in `covers/`. The visible catalog is organized around player value: daily picks, for-you recommendations for returning players, quick plays, newest arrivals, continue playing, and saved favorites.

The Workshop flow is a quiet "Suggest an improvement" action. It turns player feedback into an AI-ready brief that can be copied, downloaded, saved locally in the browser, resumed later from Player picks, or opened as a pre-filled maintenance draft.

The current preview is published at [https://jakethehoffer.github.io/Workshop-Arcade/](https://jakethehoffer.github.io/Workshop-Arcade/), but the product target is an owned-domain arcade. Canonical URLs and generated metadata come from `scripts/site-config.mjs`, defaulting to the current preview URL while supporting a future root-domain deploy through `WORKSHOP_ARCADE_SITE_ORIGIN` and `WORKSHOP_ARCADE_SITE_BASE_PATH=/`.

## Product Readiness Roadmap

- **Discovery:** keep the catalog organized around player shelves, filters, search, random play, and direct game links instead of repository activity.
- **Retention:** improve continue/favorites, for-you recommendations, install/offline behavior, and in-player game-to-game browsing so repeat play feels natural on one device.
- **Feedback:** keep suggestions lightweight for players, let saved local drafts resume from the catalog, then convert the saved brief into maintainer work outside the main catalog surface.
- **Custom domain:** keep `npm run test:owned-domain-readiness` green, run `npm run test:owned-domain-rehearsal` for a temporary root-domain artifact, run `npm run test:owned-domain-cutover-preflight` before launch, then set the final origin/base path in `scripts/site-config.mjs` environment variables and deploy without hand-editing game pages. The current GitHub Actions Pages deploy does not need a tracked `CNAME`; the custom domain belongs in GitHub Pages settings and DNS.
- **Launch QA:** run the full local validation stack, rendered catalog checks, game smoke, page-weight/PWA budgets, and a post-deploy live smoke against the final domain.

## First-time Setup

Open the repo in [GitHub Codespaces](https://github.com/jakethehoffer/Workshop-Arcade/codespaces) for a one-click environment — the `.devcontainer/devcontainer.json` pulls Microsoft's Playwright image so chromium + system deps are baked in, and the post-create hook runs `npm ci && npm run setup` automatically.

Local clone (Windows / macOS / Linux):

```powershell
npm ci
npm run setup
npm test
```

`npm run setup` downloads the Playwright chromium binary needed by `npm run test:games`. Without it the Playwright suite fails on a fresh clone with a "browser not installed" error.

## Local Development

Run a static server from the repo root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Validation And Smoke Tests

Run every fast gate in one command:

```powershell
npm ci
npm test
```

`npm test` invokes `scripts/run-fast-tests.mjs`, which auto-discovers every fast `test:*` npm script and runs them in sequence with a per-gate PASS/FAIL summary. Browser-backed runtime probes stay explicit (`npm run test:runtime-storage`, `npm run test:pwa-runtime`, `npm run test:live-canvas-evidence`) alongside the slow `npm run test:games` Playwright suite. The deployed-site smoke (`npm run test:live-pages`) is also explicit for local preview and touched-slug checks because it hits GitHub Pages or `WORKSHOP_ARCADE_URL`; the Deploy Pages workflow runs it automatically after production deploys. The authenticated GitHub security settings check (`npm run test:github-security-settings`) stays explicit because it queries repository settings and alert APIs. `npm run test:all` adds `test:games` on top of the fast runner, `npm run test:publish-ready` runs the full local launch-QA stack and writes evidence under `test-results/publish-ready/<timestamp>/summary.json` plus `test-results/publish-ready/<timestamp>/report.md`, `npm run test:launch-evidence-current` checks the newest publish-ready and `test-results/live-pages-smoke/<timestamp>/summary.json` reports identify the current clean HEAD, `npm run test:owned-domain-rehearsal` proves a generated root-domain artifact under `test-results/owned-domain-rehearsal/<timestamp>/summary.json` plus `test-results/owned-domain-rehearsal/<timestamp>/report.md`, and `npm run test:owned-domain-cutover-preflight` writes final-domain readiness evidence under `test-results/owned-domain-cutover-preflight/<timestamp>/summary.json` plus `test-results/owned-domain-cutover-preflight/<timestamp>/report.md`. These slow evidence reports, live Pages smoke, and CI-uploaded `game-smoke-summary`, `performance-audit`, and `render-ranking` artifacts include source revision provenance: branch, commit, dirty state, manifest game count, and newest manifest slugs.

For a full publish-ready check (the same shape CI runs), step through individually so the per-stage CI feedback matches:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm ci
npm run test:docs
npm run test:manifest-schema
npm run test:tag-coverage
npm run test:meta-files
npm run test:security-workflows
npm run test:github-security-settings
npm run test:live-smoke-slugs
npm run test:pages-artifact
npm run test:owned-domain-readiness
npm run test:owned-domain-cutover-preflight-contract
npm run test:owned-domain-rehearsal-contract
npm run test:tools
npm run test:publish-ready-contract
npm run test:capture-recipes
npm run test:generated-surfaces
npm run test:validator-fixtures
npm run test:catalog-perf
npm run test:workshop-feedback
npm run test:performance-baseline
npm run test:page-weight
npm run test:pwa-install-budget
npm run test:cover-assets
npm run test:game-contract
npm run test:storage-contract
npm run test:deep-links
npm run test:random-game
npm run test:keyboard-help
npm run test:pwa
npm run test:sw-update-toast
npm run test:fallback-pages
npm run test:player-session
npm run test:og-images
npm run test:game-jsonld
npm run test:seo
npm run test:feed
npm run test:a11y
npm run test:a11y-polish
npm run test:live-canvas-evidence
npm run test:runtime-storage
npm run test:pwa-runtime
npm run test:games
npm run capture:games:ci
npm run audit:perf:local
npm run audit:perf:ci
npm run test:publish-ready
npm run test:live-pages
npm run test:launch-evidence-current
npm run test:owned-domain-rehearsal
npm run test:owned-domain-cutover-preflight
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:docs` keeps contributor-facing validation docs aligned with the current publish-ready CI gates.
- `npm run test:manifest-schema` validates `websites/manifest.json` against [`schemas/manifest.schema.json`](schemas/manifest.schema.json) — the single source-of-truth contract that every generator (sitemap, feed, OG images, inject-meta) and downstream validator depends on. The same schema is wired into `.vscode/settings.json` so editors give contributors live autocomplete + inline validation while editing the manifest, catching typos like `tagss: [...]` at source instead of cascading into a wall of generator failures.
- `npm run test:tag-coverage` enforces the public catalog tag floor: every tag used by manifest games must appear in at least 3 games and must be present in `index.html` `CATEGORY_ORDER` so filter-chip ordering cannot silently drift.
- `npm run test:meta-files` enforces the OSS hygiene contract: `LICENSE` (MIT, copyright current to the calendar year), `.well-known/security.txt` (RFC 9116 with `Contact`/`Expires`/`Canonical`), `SECURITY.md` (GitHub-native disclosure policy linking to private advisories + the RFC 9116 surface), `humans.txt` (humanstxt.org format with `/* TEAM */`), `package.json` declares `"license": "MIT"`, and the README's intro slab carries the Validate Catalog + CodeQL + License: MIT badges so visitors see repo health at a glance.
- `npm run test:security-workflows` enforces that `.github/dependabot.yml` (npm + github-actions weekly updates), `.github/workflows/codeql.yml` (push + PR + weekly schedule, hardened least-privilege permissions, `security-extended` query pack, javascript-typescript analysis), `.github/workflows/deploy-pages.yml` (shared curated GitHub Pages artifact builder, modern Pages actions, least-privilege deploy permissions, `.well-known/security.txt` publication, touched-slug selection, and post-deploy live-smoke evidence artifact), and `.github/workflows/security-surfaces.yml` (the Security Surfaces workflow for GitHub-native repository settings drift) stay in place so dependency drift, inline-JS security regressions, Pages deployment drift, and security-settings drift surface before production.
- `npm run test:github-security-settings` is an authenticated remote gate for GitHub-native security state: vulnerability alerts, Dependabot security updates, private vulnerability reporting, secret scanning, secret scanning push protection, and open Dependabot / secret-scanning / CodeQL alert backlogs. It reads `GH_TOKEN` / `GITHUB_TOKEN` or falls back to local `gh auth token`, and is intentionally excluded from `npm test`. In Actions, `.github/workflows/security-surfaces.yml` uses `SECURITY_SURFACES_TOKEN` as the strict remote gate token when configured; without it, the Security Surfaces workflow records the default `GITHUB_TOKEN` API limitation as a warning while the local command remains strict.
- `npm run test:live-smoke-slugs` runs fast fixtures against `scripts/derive-live-smoke-slugs.mjs` so Deploy Pages touched-slug selection keeps mapping direct game pages, covers, OG covers, shared local scripts, docs-only fallbacks, de-duping, and `$GITHUB_ENV` output before production deploys. It also guards live-smoke source revision provenance wiring.
- `npm run test:pages-artifact` runs the same `scripts/build-pages-artifact.mjs` builder the Deploy Pages workflow uses, verifies the temporary artifact includes the intended public files plus `.well-known/security.txt`, creates `.nojekyll`, and rejects internal paths such as `.git`, `.github`, `.codex`, `.ai-sync`, `node_modules`, `output`, and `test-results`.
- `npm run test:owned-domain-readiness` dry-runs the canonical URL generators with `WORKSHOP_ARCADE_SITE_ORIGIN=https://arcade.example.test` and `WORKSHOP_ARCADE_SITE_BASE_PATH=/`, proving sitemap/feed/root meta/game JSON-LD output can move to a root domain without `/Workshop-Arcade/` leakage or tracked-file rewrites.
- `npm run test:owned-domain-cutover-preflight-contract` keeps the slow cutover preflight wired: confirms `npm run test:owned-domain-cutover-preflight` remains excluded from `npm test`, checks the placeholder-domain default, `WORKSHOP_ARCADE_CUSTOM_DOMAIN`, `WORKSHOP_ARCADE_CHECK_DNS`, `WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME`, GitHub Pages settings query, source revision provenance, and JSON/Markdown evidence under `test-results/owned-domain-cutover-preflight/<timestamp>/`.
- `npm run test:owned-domain-rehearsal-contract` keeps the slow root-domain rehearsal wired: confirms `npm run test:owned-domain-rehearsal` remains excluded from `npm test`, checks the live-smoke expected-root overrides, source revision provenance, and JSON/Markdown evidence under `test-results/owned-domain-rehearsal/<timestamp>/`.
- `npm run test:test-aggregator` keeps the `npm test` wiring honest: confirms `package.json` exposes `test` → `scripts/run-fast-tests.mjs` and `test:all` → fast runner + `test:games`, that the runner's `EXCLUDED_SCRIPTS` map lists exactly the browser-backed slow gates plus `test:all` (would recurse), and that every other `test:*` script is picked up automatically so new gates never silently drop out of `npm test`.
- `npm run test:publish-ready-contract` keeps the slow publish-readiness runner honest: confirms `npm run test:publish-ready` remains excluded from `npm test`, keeps the required release-stack commands, and writes source revision provenance plus JSON/Markdown evidence under `test-results/publish-ready/<timestamp>/`.
- `npm run test:launch-evidence-current` verifies the newest local `test-results/publish-ready/<timestamp>/summary.json` and `test-results/live-pages-smoke/<timestamp>/summary.json` plus their `report.md` files identify the current clean HEAD, clean dirty state, current manifest game count, and newest manifest slugs. It is intentionally excluded from `npm test` because it depends on gitignored evidence created by `npm run test:publish-ready` and `npm run test:live-pages`.
- `npm run test:contributor-onboarding` keeps the first-time-setup story aligned: `npm run setup` exists and pins Playwright chromium, `.devcontainer/devcontainer.json` uses a Playwright image + runs `npm ci && npm run setup` on create + forwards at least one static-server port, and `README.md` mentions both `npm run setup` and Codespaces.
- `npm run test:architecture-doc` keeps `ARCHITECTURE.md` honest: required sections (manifest, generators, validators, CI, add-a-game) are present, every generator script + every regeneration command in the add-a-game recipe is named, and the doc never references a script that no longer exists on disk.
- `npm run test:tools` runs `node --check` across repository Node tooling before heavier Playwright jobs start.
- `npm run test:capture-recipes` verifies every manifest game has a strict rendered-quality interaction recipe.
- `npm run test:generated-surfaces` verifies every manifest game is represented across generated integration surfaces: per-game OG cards, sitemap, feed, game meta/JSON-LD, and capture recipes.
- `npm run test:validator-fixtures` runs selected validators against throwaway broken repo fixtures so stale generated-surface and performance-baseline failures are proven without mutating tracked files.
- `npm run test:catalog-perf` enforces the catalog cover-image perf contract: the card template ships explicit width/height + `decoding="async"`, and `render()` uses `aboveFoldCoverCount()` to opt the first visible card row into eager loading + `fetchpriority="high"` while lazy-loading the rest with `fetchpriority="low"` so the LCP candidate is fetched first and off-screen covers don't compete for bandwidth.
- `npm run test:workshop-feedback` locks in the local feedback-draft contract: the Player picks header keeps "Suggest improvement" quiet, reveals a saved-draft count plus "Resume draft" only when `workshop_arcade_drafts_v1` contains valid drafts, loads the newest draft back into the Workshop modal, and avoids startup GitHub API calls.
- `npm run test:performance-baseline` keeps `docs/performance-baseline.md` aligned with the current manifest count and the strict CI budgets defined in `scripts/audit-pagespeed.mjs`.
- `npm run test:page-weight` statically sums the catalog local shell plus each manifest game's HTML and same-origin script dependencies, then compares those totals to the strict publish budgets before the slower browser performance audit runs. The catalog shell headroom policy requires at least a 20 KB / 5 request buffer below the Catalog budget, and the named exception headroom policy requires Lexica, Idle Tycoon, Arcade Jump, and Brick Breaker to keep at least 10 KB / 1 request below their named budgets so routine edits cannot silently consume the remaining launch margin.
- `npm run test:pwa-install-budget` statically sums the service-worker install payload (`sw.js`, install shell assets, the small newest-cover pre-cache set, and local PWA manifest icons) against the Catalog performance budget and requires a 15 KB / 5 request headroom buffer so offline support cannot silently approach the publish contract.
- `npm run test:cover-assets` verifies every manifest cover is a small local 16:9 SVG with no scripts, remote image references, embedded raster blobs, or unsafe SVG primitives.
- `npm run test:csp` verifies the `<meta http-equiv="Content-Security-Policy">` in `index.html` declares every critical directive (`default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `frame-src`, `object-src`, `base-uri`, `form-action`) and matches the catalog's runtime contract (e.g. `connect-src 'self'` for manifest/PWA fetches and `frame-src 'self'` for the player modal). Flags any remote `https://` script/connect entries so future remote dependencies must be explicitly confirmed.
- `npm run test:deep-links` locks in the per-game deep-link + Share contract: the catalog parses `#play=<slug>` on cold load and via `hashchange`, `openPlayer` keeps the URL hash in sync, and the player modal exposes a Share button wired to the Web Share API with a `navigator.clipboard.writeText` fallback so a single tap shares the canonical deep-link URL.
- `npm run test:url-filters` locks in the catalog URL state contract: `?q=`, `?tag=`, `?sort=` are parsed on cold load via `applyUrlStateFromLocation()`, every search/category/sort change calls `syncStateToUrl()` which writes back via `history.replaceState` (omitting defaults so the canonical URL stays clean), a `popstate` listener re-applies state on browser back/forward, and `?sort=` is gated by an allowlist of the three valid sort modes.
- `npm run test:favorites` locks in the catalog Favorites contract: a per-card `<button class="fav">` toggle (`type="button"` + `aria-pressed`), the versioned `FAVORITES_KEY` plus `loadFavorites`/`isFavorite`/`toggleFavorite` localStorage helpers, the dynamic "Favorites" filter chip (shown only when non-empty, mirroring "Recently"), `categoryCount`/`update` filtering, the `?tag=Favorites` bookmarkable URL state, and the `render()` wiring that toggles a game's favorite from its card.
- `npm run test:random-game` locks in the "🎲 Random" header button, the player-modal Random action, and the `r` keyboard shortcut: a `pickRandomGame()` function reads from `state.filtered` (falling back to `state.games`) so the random pick respects whatever filter the user has applied, can exclude the active player slug for in-player jumps, the keyboard handler skips while the focus is in an `<input>`/`<textarea>`/`contentEditable` surface, and the header, player, and key paths all end in `openPlayer`.
- `npm run test:keyboard-help` locks in the keyboard shortcuts help overlay: the header `?` button opens a native `<dialog>` that documents the `?`, `R`, `Ctrl`+`/`, `Esc`, and `Tab` shortcuts via `<kbd>` elements; the `?` key handler accepts both `e.key === '?'` and Shift+`/` (different keyboard layouts), skips while typing in an editable surface, and ignores modifier-key combos.
- `npm run test:pwa` verifies `app.webmanifest`, `sw.js`, the bounded service-worker runtime cache, and the matching `<link rel="manifest">` / service worker registration in `index.html` so the catalog stays installable and offline-capable.
- `npm run test:pwa-runtime` launches Chromium with service workers enabled and proves the installed worker controls the catalog, uses versioned caches, trims overflowing runtime cache entries, replays a visited game offline, and reaches the branded offline fallback when both network and catalog shell are unavailable.
- `npm run test:sw-update-toast` locks in the SW update notification UI: an `aside#swUpdateToast` with `role="status"`/`aria-live="polite"` hidden by default, the registration's `updatefound` listener watches the installing worker's `statechange` and surfaces the toast only when `navigator.serviceWorker.controller` is non-null (i.e. real update, not first install), and the Reload button calls `window.location.reload()` so PWA users aren't silently stuck on stale cache after a deploy.
- `npm run test:fallback-pages` enforces that `404.html` and `offline.html` exist, share the catalog theme tokens, are marked `noindex`, link back to the catalog home, and (for `404.html`) expose the manifest-aware did-you-mean search form.
- `npm run test:install-prompt` locks in the PWA install affordance: a hidden header "Install" button with an aria-label naming the install action + inline SVG icon, an `els.installAppBtn` mapping, a `let deferredInstallPrompt = null` cache, a `beforeinstallprompt` listener that calls `preventDefault()` + stashes the event + reveals the button, an `appinstalled` listener that hides it, and a click handler that calls `.prompt()` on the cached event then clears the reference so stale events can't be re-prompted.
- `npm run test:player-fullscreen` locks in the player-modal Fullscreen API toggle: a `#playerFullscreenBtn` with `aria-pressed` + enter/exit icon swap + (F) shortcut hint, the iframe declares both `allow="fullscreen"` and the legacy `allowfullscreen` attribute, `togglePlayerFullscreen()` exercises both `requestFullscreen()` and `exitFullscreen()`, a `fullscreenchange` listener re-syncs the icon when the user exits via browser chrome, `closePlayer()` calls `exitFullscreen()` first when the modal is currently fullscreen so closing from fullscreen doesn't wedge the page, and an "f"/"F" key shortcut toggles fullscreen while the player modal is visible.
- `npm run test:player-session` locks in the player-modal continuity controls: `#playerSave` reuses the existing Favorites store with `aria-pressed`, `#playerNext` chooses a deterministic next game from the current filtered list or related fallback, `#playerRandom` jumps to another filtered random game where possible, and `#playerMore` toggles an accessible related-games panel with up to four current-game-aware options without shrinking the iframe until the player asks for it.
- `npm run test:storage-contract` verifies every manifest game loads `workshop-runtime.js` before storage-touching game code so sandboxed play keeps the defensive storage fallback.
- `npm run test:runtime-storage` opens a sandboxed game frame in Chromium and proves `workshop-runtime.js` still provides working storage fallback behavior when native `localStorage` is blocked.
- `npm run test:live-canvas-evidence` runs focused Playwright fixtures for the live-smoke canvas evidence helper: hidden or zero-size canvases are recorded but ignored for aggregation, multiple visible canvases are sampled, the first nonblank visible canvas feeds the legacy top-level fields, and blank/no-visible-canvas failure paths keep useful messages.
- `npm run test:live-pages` runs a deployed-site smoke against the current hosted preview by default. Deploy Pages runs it automatically after production deploys and uses `scripts/derive-live-smoke-slugs.mjs` to set touched game slugs from the push diff when possible; run it manually for preview URLs, touched-slug release checks, owned-domain launch checks, or independent post-deploy evidence. Set `WORKSHOP_ARCADE_URL` to check another deployment and `WORKSHOP_ARCADE_LIVE_SLUGS=pinball-foundry,prism-relay,typeforge-cipher` or `WORKSHOP_ARCADE_TOUCHED_SLUGS` to choose the direct game pages; without an override it checks the three newest manifest entries. Use `WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1` for release evidence that must name touched slugs. It verifies the catalog, manifest, feed, sitemap, `app.webmanifest`, `sw.js`, fallback pages, `robots.txt`, `.well-known/security.txt`, selected games, no browser errors, no mobile overflow, no catalog startup GitHub API requests, deployed shell/catalog SHA-256 content hashes, deployed game HTML SHA-256 content hashes, rendered diagnostics, screenshots, canvas nonblank evidence, and that the deployed `sw.js` `SHELL_REVISION` matches the local revision. Use `WORKSHOP_ARCADE_EXPECTED_ROOT`, `WORKSHOP_ARCADE_EXPECTED_SITE_URL`, and `WORKSHOP_ARCADE_EXPECTED_SECURITY_CANONICAL` when smoking a generated artifact whose canonical origin differs from the local server URL. Use `WORKSHOP_ARCADE_EXPECTED_SW_REVISION` to pin a different expected revision, `WORKSHOP_ARCADE_SKIP_SW_REVISION=1` only for historical checks, or `WORKSHOP_ARCADE_SKIP_CONTENT_HASH=1` only when intentionally checking a historical/preview build whose content should not match local files, then read `test-results/live-pages-smoke/<timestamp>/summary.json` and `test-results/live-pages-smoke/<timestamp>/report.md`. The summary and report include source revision provenance for the exact branch, commit, worktree, and manifest checked.
- `npm run test:og-images` verifies every manifest game has a matching 1200×630 share card under `covers/og/<slug>.svg`, that the SVG contains the game's title text, and that `scripts/inject-game-meta.mjs` writes `og:image` / `twitter:image` pointing at it with `og:image:width=1200` + `og:image:height=630` so Twitter, Slack, Discord, Facebook, and LinkedIn render proper full-size unfurls. Run `npm run build:og-images` after editing the manifest to regenerate.
- `npm run test:game-jsonld` checks that every manifest game page has the JSON-LD `VideoGame` block emitted by `scripts/inject-game-meta.mjs` and that its name/url/image match the manifest. Run `npm run inject:meta` after editing the manifest to refresh.
- `npm run test:seo` verifies `sitemap.xml`, `robots.txt`, the JSON-LD `ItemList` block in `index.html`, and a second JSON-LD `WebSite` + `SearchAction` block (drives Google's "Sitelinks Search Box" feature — searches surface a box that deep-links into the catalog at `?q={query}`, the exact URL state `test:url-filters` enforces). Run `npm run build:sitemap` after editing the manifest to regenerate them.
- `npm run test:feed` verifies `feed.json` is a valid JSON Feed 1.1 mirror of the current manifest (newest-first, schema.org-aligned), and that `index.html` exposes the matching `<link rel="alternate" type="application/feed+json">` for auto-discovery. Run `npm run build:feed` after editing the manifest to regenerate it.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:a11y-polish` locks in the catalog page's secondary a11y guarantees: a visually-hidden-until-focused skip-to-content link, a `<noscript>` fallback explaining the JS dependency, and a `@media (prefers-reduced-motion: reduce)` block that collapses transitions and the card hover transform for users with vestibular sensitivities.
- `npm run test:games` starts a local static server, verifies the catalog player modal, player shelves, suggestion draft URL flow, and opens every manifest game on desktop and mobile viewports. It writes `test-results/smoke-games/<timestamp>/summary.json` with source revision provenance for the exact branch, commit, worktree, and manifest checked.
- `npm run capture:games:ci` runs the rendered-quality harness in strict mode and fails if any captured surface scores above 0. For optional local review, `npm run capture:games` writes the same ranked contact sheet plus `test-results/render-ranking/<timestamp>/summary.json` under `test-results/render-ranking/<timestamp>/` without CI strictness; both the summary and contact sheet include source revision provenance. The summary also records pass/fail status, expected/captured surface counts, and the last capture phase; unexpected early aborts still write a failure summary, with a partial contact sheet when at least one surface was captured.
- `npm run audit:perf:local` starts a local static server, points the strict Pagespeed-style performance audit at it, and cleans up the server. Use this for local publish checks so the audit proves the current worktree instead of live Pages; it writes `test-results/lighthouse-baseline/<timestamp>/summary.json` and `report.md` with source revision provenance.
- `npm run audit:perf:ci` runs the same strict Pagespeed-style performance audit against `WORKSHOP_ARCADE_URL` when set, otherwise the current hosted preview; CI sets the URL to its local static server.
- `npm run test:publish-ready` runs the local launch-QA stack in order: catalog validation, `npm test`, runtime probes, game smoke, strict render capture, local performance audit, and `git diff --check`. It stops on the first failure but still writes `summary.json` and `report.md` under `test-results/publish-ready/<timestamp>/`, including source revision provenance for the exact branch/commit/worktree and manifest it checked.
- `npm run test:owned-domain-rehearsal` builds the curated artifact into `test-results/owned-domain-rehearsal/<timestamp>/site`, regenerates root-domain sitemap/feed/meta/JSON-LD/OG/security canonical surfaces inside that artifact only, serves it at `/`, then runs live smoke plus the strict performance audit with content hashes checked against the generated artifact. Its report includes the same source revision provenance.
- `npm run test:owned-domain-cutover-preflight` defaults to the reserved placeholder `arcade.example.test`, runs the owned-domain rehearsal with `WORKSHOP_ARCADE_SITE_BASE_PATH=/`, and writes launch evidence without committing a fake domain. Set `WORKSHOP_ARCADE_CUSTOM_DOMAIN=<domain>` to validate a real hostname and query GitHub Pages settings read-only; add `WORKSHOP_ARCADE_CHECK_DNS=1` to verify DNS targets and `WORKSHOP_ARCADE_REQUIRE_PAGES_CNAME=1` to fail unless Pages settings already match the supplied domain. Its report includes source revision provenance before the domain-specific checks.

CI runs `validate-catalog.ps1`, `npm run test:docs`, `npm run test:tools`, `npm run test:publish-ready-contract`, `npm run test:owned-domain-rehearsal-contract`, `npm run test:owned-domain-cutover-preflight-contract`, `npm run test:capture-recipes`, `npm run test:generated-surfaces`, `npm run test:validator-fixtures`, `npm run test:manifest-schema`, `npm run test:tag-coverage`, `npm run test:live-smoke-slugs`, `npm run test:pages-artifact`, `npm run test:owned-domain-readiness`, `npm run test:catalog-perf`, `npm run test:workshop-feedback`, `npm run test:a11y`, `npm run test:runtime-storage`, `npm run test:pwa-runtime`, `npm run test:live-canvas-evidence`, `npm run test:games`, `npm run audit:perf:ci`, and `npm run capture:games:ci` on every push. The Validate Catalog workflow is split into catalog/docs/a11y, game smoke, performance audit, and render capture jobs, with source-identifying `game-smoke-summary`, `performance-audit`, and `render-ranking` artifacts uploaded for review (`test-results/smoke-games/<timestamp>/summary.json`, `test-results/lighthouse-baseline/<timestamp>/summary.json`, and `test-results/render-ranking/<timestamp>/summary.json`). Render-capture summaries are fail-safe evidence: even an unexpected harness abort records status, error, counts, last phase, and provenance. The current preview is still deployed by the repo-owned Deploy Pages workflow from a curated `_site` artifact assembled by `scripts/build-pages-artifact.mjs`; that workflow derives touched live-smoke slugs from the push diff, runs `npm run test:live-pages` with retry behavior, and uploads source-identifying `live-pages-smoke` evidence for 14 days. The Security Surfaces workflow runs `npm run test:github-security-settings` on push, weekly, and by manual dispatch so GitHub-native vulnerability alerts and secret scanning push protection cannot silently drift. These are maintenance surfaces, not the player-facing value proposition.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract. `ARCHITECTURE.md` walks through the script network (4 generators, 44 fast validators, 4-job CI workflow) and ends with a step-by-step "Adding a new game" recipe.

## License & Security Reports

Workshop Arcade is distributed under the [MIT License](LICENSE) — fork, modify, and remix freely as long as the copyright notice travels along. Security disclosures follow [RFC 9116](.well-known/security.txt) and the [SECURITY.md disclosure policy](SECURITY.md): please open a [private GitHub security advisory](https://github.com/jakethehoffer/Workshop-Arcade/security/advisories/new) for anything that could let a malicious game submission compromise visitors. The Deploy Pages workflow publishes the `.well-known/security.txt` surface with the live artifact assembled by `scripts/build-pages-artifact.mjs`. [CodeQL](.github/workflows/codeql.yml) scans the inline catalog JavaScript + the Node tooling on every push and weekly, and [Dependabot](.github/dependabot.yml) auto-PRs Playwright + GitHub Actions updates. Informal credits live in [humans.txt](humans.txt).

## Install / Offline Support

The catalog is a progressive web app. Visiting the current preview or future owned-domain site registers a small offline shell so future visits load instantly even on a flaky connection, and browsers that support `beforeinstallprompt` offer to install Workshop Arcade as a standalone app on the device home screen.

- `app.webmanifest` declares the install metadata (name, theme/background colors, icons in `covers/app-icon.svg` and `covers/app-icon-maskable.svg`).
- `sw.js` ships a versioned cache (`wa-v*`): the catalog shell, `websites/manifest.json`, and a small newest-cover set are pre-cached on install, while same-origin GETs use a stale-while-revalidate runtime cache capped at `RUNTIME_CACHE_MAX_ENTRIES` so long play sessions cannot grow storage without bound. Game files and additional covers are added to the runtime cache after first use and recent pages remain available offline.
- The service worker registration in `index.html` is feature-checked, deferred until the `load` event, and silently no-ops on `file://` previews or browsers without service worker support.
- Bump `VERSION` in `sw.js` whenever the cached shell needs to invalidate (e.g. structural changes to `index.html` or `websites/manifest.json` formats); old caches are deleted automatically on activate.

## Discoverability (Sitemap + Structured Data)

The catalog ships a few small static surfaces so search engines can index every game directly. Canonical URL generation lives in `scripts/site-config.mjs`; by default it targets `https://jakethehoffer.github.io/Workshop-Arcade/`, and a future owned-domain build can set `WORKSHOP_ARCADE_SITE_ORIGIN` plus `WORKSHOP_ARCADE_SITE_BASE_PATH=/` before regenerating. `npm run test:owned-domain-readiness` exercises that root-domain configuration in memory so the custom-domain path stays tested before a real domain is chosen, while `npm run test:owned-domain-cutover-preflight` records the final hostname, Pages settings, optional DNS checks, and rehearsal evidence when launch is close.

- `sitemap.xml` — one URL per manifest game plus the catalog root, with `lastmod` derived from each entry's `addedAt`. Generated from `websites/manifest.json`.
- `robots.txt` — allows all crawlers and points at the configured canonical sitemap.
- A JSON-LD `ItemList` block between `<!-- workshop-catalog-jsonld:start -->` markers in `index.html`, listing every game in manifest order so Google can render the catalog as a rich list.

After editing the manifest, regenerate the three surfaces in one step:

```powershell
npm run build:sitemap
```

`npm run test:seo` runs in CI (and is part of the publish-ready check list above) so any drift between the manifest and these surfaces fails before merge.

Feed readers and aggregators that prefer structured machine-readable input can subscribe to [`feed.json`](feed.json) — a JSON Feed 1.1 representation of the catalog, newest game first, regenerated alongside the sitemap. `npm run build:feed` rebuilds it; `npm run test:feed` enforces byte-equality and ordering in CI. `index.html` auto-discovers it via `<link rel="alternate" type="application/feed+json">`.
