# Workshop Arcade

[![Validate Catalog](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/validate-catalog.yml/badge.svg)](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/validate-catalog.yml)
[![CodeQL](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/codeql.yml/badge.svg)](https://github.com/jakethehoffer/Workshop-Arcade/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live: GitHub Pages](https://img.shields.io/badge/live-jakethehoffer.github.io%2FWorkshop--Arcade-5eead4)](https://jakethehoffer.github.io/Workshop-Arcade/)

**Live:** [https://jakethehoffer.github.io/Workshop-Arcade/](https://jakethehoffer.github.io/Workshop-Arcade/)

Workshop Arcade is a static catalog of browser games. Each game lives as a standalone HTML file under `websites/`, with catalog metadata in `websites/manifest.json` and cover art in `covers/`.

The catalog includes a sandboxed player modal and a Workshop flow for players or builders to turn a game idea into an AI-ready improvement brief. Briefs can be copied, downloaded, saved locally in the browser, or opened as a pre-filled GitHub issue before being used with an AI coding tool. The Improvement Queue on the catalog page fetches open `workshop-request` issues inline via the GitHub REST API, and the Recent Updates feed shows the last five commits.

The site is hosted via GitHub Pages from the `main` branch root. Pushes to `main` redeploy automatically.

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

`npm test` invokes `scripts/run-fast-tests.mjs`, which auto-discovers every fast `test:*` npm script and runs them in sequence with a per-gate PASS/FAIL summary. Browser-backed runtime probes stay explicit (`npm run test:runtime-storage`, `npm run test:pwa-runtime`) alongside the slow `npm run test:games` Playwright suite. The deployed-site smoke (`npm run test:live-pages`) is also explicit because it hits GitHub Pages or `WORKSHOP_ARCADE_URL`. `npm run test:all` adds `test:games` on top of the fast runner.

For a full publish-ready check (the same shape CI runs), step through individually so the per-stage CI feedback matches:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm ci
npm run test:docs
npm run test:manifest-schema
npm run test:meta-files
npm run test:security-workflows
npm run test:tools
npm run test:capture-recipes
npm run test:generated-surfaces
npm run test:validator-fixtures
npm run test:catalog-perf
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
npm run test:og-images
npm run test:game-jsonld
npm run test:seo
npm run test:feed
npm run test:a11y
npm run test:a11y-polish
npm run test:runtime-storage
npm run test:pwa-runtime
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

- `validate-catalog.ps1` checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, local subresources, no remote scripts/fonts, and a synchronized fallback catalog in `index.html`. The `-Fix` form regenerates `FALLBACK_GAMES` automatically.
- `npm run test:docs` keeps contributor-facing validation docs aligned with the current publish-ready CI gates.
- `npm run test:manifest-schema` validates `websites/manifest.json` against [`schemas/manifest.schema.json`](schemas/manifest.schema.json) — the single source-of-truth contract that every generator (sitemap, feed, OG images, inject-meta) and downstream validator depends on. The same schema is wired into `.vscode/settings.json` so editors give contributors live autocomplete + inline validation while editing the manifest, catching typos like `tagss: [...]` at source instead of cascading into a wall of generator failures.
- `npm run test:meta-files` enforces the OSS hygiene contract: `LICENSE` (MIT, copyright current to the calendar year), `.well-known/security.txt` (RFC 9116 with `Contact`/`Expires`/`Canonical`), `SECURITY.md` (GitHub-native disclosure policy linking to private advisories + the RFC 9116 surface), `humans.txt` (humanstxt.org format with `/* TEAM */`), `package.json` declares `"license": "MIT"`, and the README's intro slab carries the Validate Catalog + CodeQL + License: MIT badges so visitors see repo health at a glance.
- `npm run test:security-workflows` enforces that `.github/dependabot.yml` (npm + github-actions weekly updates) and `.github/workflows/codeql.yml` (push + PR + weekly schedule, hardened least-privilege permissions, `security-extended` query pack, javascript-typescript analysis) both stay in place so dependency drift and inline-JS security regressions surface as PR checks instead of going to production.
- `npm run test:test-aggregator` keeps the `npm test` wiring honest: confirms `package.json` exposes `test` → `scripts/run-fast-tests.mjs` and `test:all` → fast runner + `test:games`, that the runner's `EXCLUDED_SCRIPTS` map lists exactly the browser-backed slow gates plus `test:all` (would recurse), and that every other `test:*` script is picked up automatically so new gates never silently drop out of `npm test`.
- `npm run test:contributor-onboarding` keeps the first-time-setup story aligned: `npm run setup` exists and pins Playwright chromium, `.devcontainer/devcontainer.json` uses a Playwright image + runs `npm ci && npm run setup` on create + forwards at least one static-server port, and `README.md` mentions both `npm run setup` and Codespaces.
- `npm run test:architecture-doc` keeps `ARCHITECTURE.md` honest: required sections (manifest, generators, validators, CI, add-a-game) are present, every generator script + every regeneration command in the add-a-game recipe is named, and the doc never references a script that no longer exists on disk.
- `npm run test:tools` runs `node --check` across repository Node tooling before heavier Playwright jobs start.
- `npm run test:capture-recipes` verifies every manifest game has a strict rendered-quality interaction recipe.
- `npm run test:generated-surfaces` verifies every manifest game is represented across generated integration surfaces: per-game OG cards, sitemap, feed, game meta/JSON-LD, and capture recipes.
- `npm run test:validator-fixtures` runs selected validators against throwaway broken repo fixtures so stale generated-surface and performance-baseline failures are proven without mutating tracked files.
- `npm run test:catalog-perf` enforces the catalog cover-image perf contract: the card template ships explicit width/height + `decoding="async"`, and `render()` opts the first `ABOVE_FOLD_COVERS` cards into eager loading + `fetchpriority="high"` while lazy-loading the rest with `fetchpriority="low"` so the LCP candidate is fetched first and off-screen covers don't compete for bandwidth.
- `npm run test:performance-baseline` keeps `docs/performance-baseline.md` aligned with the current manifest count and the strict CI budgets defined in `scripts/audit-pagespeed.mjs`.
- `npm run test:page-weight` statically sums the catalog local shell plus each manifest game's HTML and same-origin script dependencies, then compares those totals to the strict publish budgets before the slower browser performance audit runs.
- `npm run test:pwa-install-budget` statically sums the service-worker install payload (`sw.js`, install shell assets, newest pre-cached covers, and local PWA manifest icons) against the Catalog performance budget so offline support cannot silently exceed the publish contract.
- `npm run test:cover-assets` verifies every manifest cover is a small local 16:9 SVG with no scripts, remote image references, embedded raster blobs, or unsafe SVG primitives.
- `npm run test:csp` verifies the `<meta http-equiv="Content-Security-Policy">` in `index.html` declares every critical directive (`default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `frame-src`, `object-src`, `base-uri`, `form-action`) and matches the catalog's runtime contract (e.g. `connect-src` allows `https://api.github.com` for the issue queue + recent updates feeds, `frame-src 'self'` for the player modal). Flags any remote `https://` script-src entries so future remote-script dependencies must be explicitly confirmed.
- `npm run test:deep-links` locks in the per-game deep-link + Share contract: the catalog parses `#play=<slug>` on cold load and via `hashchange`, `openPlayer` keeps the URL hash in sync, and the player modal exposes a Share button wired to the Web Share API with a `navigator.clipboard.writeText` fallback so a single tap shares the canonical deep-link URL.
- `npm run test:url-filters` locks in the catalog URL state contract: `?q=`, `?tag=`, `?sort=` are parsed on cold load via `applyUrlStateFromLocation()`, every search/category/sort change calls `syncStateToUrl()` which writes back via `history.replaceState` (omitting defaults so the canonical URL stays clean), a `popstate` listener re-applies state on browser back/forward, and `?sort=` is gated by an allowlist of the three valid sort modes.
- `npm run test:random-game` locks in the "🎲 Random" header button + `r` keyboard shortcut: a `pickRandomGame()` function reads from `state.filtered` (falling back to `state.games`) so the random pick respects whatever filter the user has applied, the keyboard handler skips while the focus is in an `<input>`/`<textarea>`/`contentEditable` surface, and the click + key paths both end in `openPlayer`.
- `npm run test:keyboard-help` locks in the keyboard shortcuts help overlay: the header `?` button opens a native `<dialog>` that documents the `?`, `R`, `Ctrl`+`/`, `Esc`, and `Tab` shortcuts via `<kbd>` elements; the `?` key handler accepts both `e.key === '?'` and Shift+`/` (different keyboard layouts), skips while typing in an editable surface, and ignores modifier-key combos.
- `npm run test:pwa` verifies `app.webmanifest`, `sw.js`, the bounded service-worker runtime cache, and the matching `<link rel="manifest">` / service worker registration in `index.html` so the catalog stays installable and offline-capable.
- `npm run test:pwa-runtime` launches Chromium with service workers enabled and proves the installed worker controls the catalog, uses versioned caches, trims overflowing runtime cache entries, replays a visited game offline, and reaches the branded offline fallback when both network and catalog shell are unavailable.
- `npm run test:sw-update-toast` locks in the SW update notification UI: an `aside#swUpdateToast` with `role="status"`/`aria-live="polite"` hidden by default, the registration's `updatefound` listener watches the installing worker's `statechange` and surfaces the toast only when `navigator.serviceWorker.controller` is non-null (i.e. real update, not first install), and the Reload button calls `window.location.reload()` so PWA users aren't silently stuck on stale cache after a deploy.
- `npm run test:fallback-pages` enforces that `404.html` and `offline.html` exist, share the catalog theme tokens, are marked `noindex`, link back to the catalog home, and (for `404.html`) expose the manifest-aware did-you-mean search form.
- `npm run test:install-prompt` locks in the PWA install affordance: a hidden header "Install" button with an aria-label naming the install action + inline SVG icon, an `els.installAppBtn` mapping, a `let deferredInstallPrompt = null` cache, a `beforeinstallprompt` listener that calls `preventDefault()` + stashes the event + reveals the button, an `appinstalled` listener that hides it, and a click handler that calls `.prompt()` on the cached event then clears the reference so stale events can't be re-prompted.
- `npm run test:player-fullscreen` locks in the player-modal Fullscreen API toggle: a `#playerFullscreenBtn` with `aria-pressed` + enter/exit icon swap + (F) shortcut hint, the iframe declares both `allow="fullscreen"` and the legacy `allowfullscreen` attribute, `togglePlayerFullscreen()` exercises both `requestFullscreen()` and `exitFullscreen()`, a `fullscreenchange` listener re-syncs the icon when the user exits via browser chrome, `closePlayer()` calls `exitFullscreen()` first when the modal is currently fullscreen so closing from fullscreen doesn't wedge the page, and an "f"/"F" key shortcut toggles fullscreen while the player modal is visible.
- `npm run test:storage-contract` verifies every manifest game loads `workshop-runtime.js` before storage-touching game code so sandboxed play keeps the defensive storage fallback.
- `npm run test:runtime-storage` opens a sandboxed game frame in Chromium and proves `workshop-runtime.js` still provides working storage fallback behavior when native `localStorage` is blocked.
- `npm run test:live-pages` runs a post-deploy smoke against [the live GitHub Pages site](https://jakethehoffer.github.io/Workshop-Arcade/) by default. Set `WORKSHOP_ARCADE_URL` to check another deployment and `WORKSHOP_ARCADE_LIVE_SLUGS=pinball-foundry,prism-relay,typeforge-cipher` to choose the direct game pages; without an override it checks the three newest manifest entries. It verifies the catalog, manifest, feed, sitemap, `app.webmanifest`, `sw.js`, fallback pages, `robots.txt`, selected games, no browser errors, no mobile overflow, no catalog startup GitHub API requests, and that the deployed `sw.js` `SHELL_REVISION` matches the local revision. Use `WORKSHOP_ARCADE_EXPECTED_SW_REVISION` to pin a different expected revision, or `WORKSHOP_ARCADE_SKIP_SW_REVISION=1` only for intentional historical checks, then read the JSON summary under `test-results/live-pages-smoke/`.
- `npm run test:og-images` verifies every manifest game has a matching 1200×630 share card under `covers/og/<slug>.svg`, that the SVG contains the game's title text, and that `scripts/inject-game-meta.mjs` writes `og:image` / `twitter:image` pointing at it with `og:image:width=1200` + `og:image:height=630` so Twitter, Slack, Discord, Facebook, and LinkedIn render proper full-size unfurls. Run `npm run build:og-images` after editing the manifest to regenerate.
- `npm run test:game-jsonld` checks that every manifest game page has the JSON-LD `VideoGame` block emitted by `scripts/inject-game-meta.mjs` and that its name/url/image match the manifest. Run `npm run inject:meta` after editing the manifest to refresh.
- `npm run test:seo` verifies `sitemap.xml`, `robots.txt`, the JSON-LD `ItemList` block in `index.html`, and a second JSON-LD `WebSite` + `SearchAction` block (drives Google's "Sitelinks Search Box" feature — searches surface a box that deep-links into the catalog at `?q={query}`, the exact URL state `test:url-filters` enforces). Run `npm run build:sitemap` after editing the manifest to regenerate them.
- `npm run test:feed` verifies `feed.json` is a valid JSON Feed 1.1 mirror of the current manifest (newest-first, schema.org-aligned), and that `index.html` exposes the matching `<link rel="alternate" type="application/feed+json">` for auto-discovery. Run `npm run build:feed` after editing the manifest to regenerate it.
- `npm run test:a11y` enforces the static accessibility regression rules: every `<canvas>` declares `aria-label` or `aria-hidden="true"`, every `<iframe>` declares a non-empty `title`, and every `role="dialog"`/`role="alertdialog"` declares `aria-modal="true"` plus an accessible name.
- `npm run test:a11y-polish` locks in the catalog page's secondary a11y guarantees: a visually-hidden-until-focused skip-to-content link, a `<noscript>` fallback explaining the JS dependency, and a `@media (prefers-reduced-motion: reduce)` block that collapses transitions and the card hover transform for users with vestibular sensitivities.
- `npm run test:games` starts a local static server, verifies the catalog player modal and Workshop issue-URL flow, and opens every manifest game on desktop and mobile viewports.
- `npm run capture:games:ci` runs the rendered-quality harness in strict mode and fails if any captured surface scores above 0. For optional local review, `npm run capture:games` writes the same ranked contact sheet under `test-results/render-ranking/<timestamp>/` without CI strictness.
- `npm run audit:perf:ci` starts from the Pagespeed-style performance audit in strict mode and fails on publish-budget regressions.

CI runs `validate-catalog.ps1`, `npm run test:docs`, `npm run test:tools`, `npm run test:capture-recipes`, `npm run test:validator-fixtures`, `npm run test:a11y`, `npm run test:runtime-storage`, `npm run test:pwa-runtime`, `npm run test:games`, `npm run audit:perf:ci`, and `npm run capture:games:ci` on every push. The Validate Catalog workflow is split into catalog/docs/a11y, game smoke, performance audit, and render capture jobs, with compact performance and render-ranking artifacts uploaded for review.

See `CONTRIBUTING.md` and `docs/game-contract.md` for the full add/update/remove checklist and per-game quality contract. `ARCHITECTURE.md` walks through the script network (4 generators, 34 fast validators, 4-job CI workflow) and ends with a step-by-step "Adding a new game" recipe.

## License & Security Reports

Workshop Arcade is distributed under the [MIT License](LICENSE) — fork, modify, and remix freely as long as the copyright notice travels along. Security disclosures follow [RFC 9116](.well-known/security.txt) and the [SECURITY.md disclosure policy](SECURITY.md): please open a [private GitHub security advisory](https://github.com/jakethehoffer/Workshop-Arcade/security/advisories/new) for anything that could let a malicious game submission compromise visitors. [CodeQL](.github/workflows/codeql.yml) scans the inline catalog JavaScript + the Node tooling on every push and weekly, and [Dependabot](.github/dependabot.yml) auto-PRs Playwright + GitHub Actions updates. Informal credits live in [humans.txt](humans.txt).

## Install / Offline Support

The catalog is a progressive web app. Visiting [the live site](https://jakethehoffer.github.io/Workshop-Arcade/) registers a small offline shell so future visits load instantly even on a flaky connection, and browsers that support `beforeinstallprompt` offer to install Workshop Arcade as a standalone app on the device home screen.

- `app.webmanifest` declares the install metadata (name, theme/background colors, icons in `covers/app-icon.svg` and `covers/app-icon-maskable.svg`).
- `sw.js` ships a versioned cache (`wa-v*`): the catalog shell and `websites/manifest.json` are pre-cached on install, and same-origin GETs use a stale-while-revalidate runtime cache capped at `RUNTIME_CACHE_MAX_ENTRIES` so long play sessions cannot grow storage without bound. Game files are added to the runtime cache after first play and recent pages remain available offline.
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

Feed readers and aggregators that prefer structured machine-readable input can subscribe to [`feed.json`](feed.json) — a JSON Feed 1.1 representation of the catalog, newest game first, regenerated alongside the sitemap. `npm run build:feed` rebuilds it; `npm run test:feed` enforces byte-equality and ordering in CI. `index.html` auto-discovers it via `<link rel="alternate" type="application/feed+json">`.
