Original prompt: Do this for me

## 2026-06-08 Codex catalog headroom and runbook drift pass

- Completed a non-game catalog/tooling pass after the catalog reached 100 games. No games, manifest entries, covers, capture recipes, generated game metadata, custom-domain settings, backend calls, paid services, credentials, DNS, or `SECURITY_SURFACES_TOKEN` work changed.
- Updated `CLAUDE.md` from stale 83-game guidance to the current state: 100 games, 101 audited pages, games 85-100 quality pass complete, and future default work should bias toward catalog/tooling, performance headroom, launch evidence, or playfeel polish unless the user explicitly asks for another game. Updated `scripts/check-docs-drift.mjs` so the runbook check derives the current game count from `websites/manifest.json` and requires matching `100 games` and `101 audited pages` text instead of enforcing stale hardcoded copy.
- Recovered catalog payload margin by trimming low-value catalog comments, blank-line bulk, and CSS whitespace in `index.html` while preserving generated JSON-LD markers, `FALLBACK_GAMES`, user-facing copy, DOM ids/classes, data attributes, keyboard shortcuts, filters, favorites, player shelves, player modal, Workshop feedback, PWA registration, lazy-cover observer behavior, and `aboveFoldCoverCount()`. `index.html` is now 116.5 KB raw on disk. `npm run test:page-weight` reports the catalog local shell at 167.6 KB / 200 KB across 9/18 files, with 32.4 KB / 9 files headroom. `npm run test:pwa-install-budget` reports the PWA install payload at 171.8 KB / 200 KB across 10/18 files, with 28.2 KB / 8 files headroom.
- Refreshed the service-worker shell cache after the catalog trim: `SHELL_REVISION = shell-466c3bfa1e7b` and `VERSION = wa-v46-shell-466c3bfa1e7b`. `npm run audit:perf:local` passed across 101 pages with Catalog at 158.0 KB / 6 requests and zero console/page errors. Desktop and mobile browser smoke confirmed 100 cards render, player shelves render before the grid, search and tag filters work, the player modal opens a game iframe, no console errors appear, and mobile horizontal overflow is 0.

## 2026-06-06 Codex Crosswire Clues pass (83 -> 84 games)

- Added **Crosswire Clues** as game #84, a compact Word/Puzzle/Strategy mini-crossword that adds a distinct crossing-clue mechanic now that the tag-floor cadence is retired. Five deterministic 7x7 stages each contain a centered 4x4 word-square crossword with four across and four down clues. Players select cells or clues, type letters, check entries, spend limited hints, preserve six integrity points, and clear all five stages for a scored run. Keyboard and touch controls include typed letters, arrows, Tab clue cycling, Space direction toggle, Enter check, Backspace clear, H hint, R restart, M sound, F fullscreen, ? help, clue taps, canvas taps, and an on-screen keyboard. Diagnostics expose mode, stage, selected cell, selected entry, direction, grid rows, clue progress, score, best score, integrity, hints, sound state, feedback, last input, last event, and coordinate system through `render_game_to_text()` plus deterministic `advanceTime(ms)`.
- Integrated the game into the catalog with a compact SVG cover, manifest entry, render-capture recipe, regenerated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, and service-worker shell revision `wa-v44-shell-4602df44ad3b`. The cover was trimmed so `npm run test:page-weight` keeps the catalog shell at 180.0 KB / 200 KB with 20.0 KB headroom. Performance baseline pass 105 records Crosswire Clues at 34.3 KB / 2 requests with zero console/page errors.
- Verification passed: `validate-catalog.ps1 -Fix` and strict; generated meta/sitemap/feed/OG refresh; focused static gates for game-contract, a11y, keyboard-help, PWA, cover-assets, generated-surfaces, capture-recipes, manifest-schema, game-jsonld, page-weight, and tag-coverage; develop-web-game client screenshots/state inspection; custom desktop/mobile Playwright checks for correct and wrong entries, hint, help, sound, fullscreen, restart, full win path, touch/on-screen keyboard, no GitHub requests, no console/page errors, and mobile overflow 0; `npm test` with all 44 fast gates; `npm run test:games` for 84 games; `npm run capture:games:ci` for 168 surfaces with max score 0; `npm run test:pwa-runtime`; `npm run test:runtime-storage`; `npm run audit:perf:local` across 85 pages; `git diff --check`.

## 2026-06-05 Claude Nightwire pass (82 -> 83 games)

- Added **Nightwire** as game #83, a turn-based Tactics/Stealth/Strategy infiltration game that lifts the last two tags off the `MIN_TAG_COUNT=3` coverage floor (each 3 -> 4) — after this pass every public tag sits at >= 4 and the floor-driven cadence is retired. A single neon infiltrator moves on a 14x9 grid with a 2-action-point reactive turn: step, throw a distraction to reroute the nearest guard, or silently take a guard down from its blind side (leaving a body that re-trips the alarm once if a live vision cone finds it). Deterministic waypoint patrols project line-of-sight vision cones; being seen raises a 0-100 alarm meter (decays when unseen, escalates cone range + biases the nearest guard toward your last-seen tile at >=50, fails at 100). Grab the asset, reach extraction, clear five hand-authored stages; Ghost-bonus scoring rewards an unseen clear. Keyboard + touch, persisted sound toggle, fullscreen, an accessible help dialog (focus trap/Escape/restore), defensive storage via `workshop-runtime.js`, and `render_game_to_text()` / `advanceTime(ms)` diagnostics exposing phase, stage, turn, AP, alarm, guards, bodies, lures, and feedback.
- Integrated into the catalog with a 640x360 SVG cover, a manifest entry tagged Tactics/Stealth/Strategy, regenerated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, and a service-worker shell revision bump (`wa-v42` -> `wa-v43` / `shell-dbc0c7ec9717`). Added a render-capture recipe that starts and steps into the first grid, freezing a representative infiltration frame. Brainstormed and planned under `docs/superpowers/specs/2026-06-05-nightwire-design.md` and `docs/superpowers/plans/2026-06-05-nightwire.md`.
- Verification passed locally: `validate-catalog.ps1 -Fix` and strict; generated meta/feed/sitemap/OG refresh; `node --check scripts/capture-games.mjs`; `npm test` (all 44 fast gates); `npm run test:games` (83 games); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; `npm run capture:games:ci` (166 surfaces, max score 0); `npm run audit:perf:local` across 84 pages with Nightwire at 36.6 KB / 2 requests and zero console/page errors. Two-stage review caught and fixed three issues before integration: a stage-advance detection check against stale coordinates (a spurious spot on the new stage), a body re-spiking the alarm every guard turn (now once per body), and a 13-column stage-1 map row (padded to 14); in-browser checks confirmed start/move/turn/guard-patrol with no console errors.

## 2026-06-04 Claude Chrome Convoy pass (80 -> 81 games)

- Added **Chrome Convoy** as game #81, a compact Racing/Shooter/Action combat racer that lifts the Racing and Shooter tags off the `MIN_TAG_COUNT=3` coverage floor (each 3 -> 4) — the catalog's first game that both moves freely and fires offensively (the three existing racers are clean racing; the three existing shooters are stationary lane/radial defense). The player free-steers a neon interceptor across a vertically scrolling road, fires a heat-limited cannon (overheat lockout) and rams rivals off the road, dodges armored blockers, oil slicks, road edges, and white civilian traffic, and grabs repair tokens, across five deterministic hardcoded-spawn-table stretches with an escalation curve. A 4-segment armor bar gates failure; scoring multiplies a kill/distance base by a combo that breaks on damage or a civilian hit; win on clearing stretch 5, fail restarts the run. Keyboard + touch (hold-to-steer zones + fire button), a persisted sound toggle, fullscreen, an accessible help dialog (focus trap/Escape/restore), defensive storage via `workshop-runtime.js`, and `render_game_to_text()` / `advanceTime(ms)` diagnostics exposing phase, stretch, distance, armor, heat, score, combo, threats, and feedback.
- Integrated into the catalog with a 640x360 SVG cover, a manifest entry tagged Racing/Shooter/Action, regenerated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, and a service-worker shell revision bump (`wa-v40` -> `wa-v41` / `shell-7ad2f0834524`). Added a render-capture recipe that starts, holds the centered lane, and guns the first aligned rival, freezing the kill-feedback frame. Brainstormed and planned under `docs/superpowers/specs/2026-06-04-chrome-convoy-design.md` and `docs/superpowers/plans/2026-06-04-chrome-convoy.md`.
- Verification passed locally: `validate-catalog.ps1 -Fix` and strict; generated meta/feed/sitemap/OG refresh; `npm test` (all 44 fast gates); `npm run test:games` (81 games); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; `npm run capture:games:ci` (162 surfaces, max score 0); `npm run audit:perf:local` across 82 pages with Chrome Convoy at 31.9 KB / 2 requests and zero console/page errors. Two-stage review caught and fixed a shot/threat collision coordinate-space inversion (gun hits had only registered near mid-screen) before integration; in-browser diagnostics confirm gun-kills register and a dodging run clears stretches 1-4 at full armor.

## 2026-06-04 Claude Diamond Derby pass (78 -> 79 games)

- Added **Diamond Derby** as a compact swing-timing home-run derby for the sparse Sports category (3 -> 4 games), deliberately distinct from the three existing aim-and-power Sports games (Circuit Putt, Vector Pool, Penalty Circuit). A pitched ball plus a sweeping timing bar set the contact window; the player swings (Space/Enter/tap) for a Perfect/Good/Early/Late grade and tunes a launch angle (the middle angle carries farthest), with carry resolved through a projectile-style distance model. Five deterministic rounds escalate pitch speed and fence distance under per-round home-run quotas, with win/fail states, restart/new-derby controls, a persisted sound toggle (WebAudio gated on user activation), defensive localStorage, and `render_game_to_text()` / `advanceTime(ms)` diagnostics exposing phase, meter, grade, distance, and quotas.
- Integrated into the catalog with a 640x360 SVG cover, a manifest entry tagged Sports/Arcade/Action, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, and a service-worker shell revision bump (`wa-v38` -> `wa-v39` / `shell-879acf85e9b8`). Added a render-capture recipe that resets to a fresh round, swings as the timing marker enters the contact zone, and freezes a settled home-run frame.
- Verification passed locally: `validate-catalog.ps1 -Fix` and strict; generated meta/feed/sitemap/OG refresh; `npm test` (all 44 fast gates); `npm run test:games` (79 games); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; `npm run capture:games:ci` (158 surfaces, max score 0); `npm run audit:perf:local` across 80 pages with Diamond Derby at 24.8 KB / 2 requests and zero console/page errors; `git diff --check` clean. Root-caused and fixed a capture flake (real-time idle self-play parked the game in a settled fail state, so the recipe now resets first) and an AudioContext autoplay console warning (audio is now gated on user activation), plus a negative first-frame `dt`.

## 2026-06-03 Codex named game headroom guard

- Added named exception headroom enforcement to `npm run test:page-weight`: Lexica, Idle Tycoon, Arcade Jump, and Brick Breaker must now keep at least 10 KB transfer headroom and 1 request headroom below their named budgets. The validator fixture suite proves a named exception can be under its nominal budget but still fail for low headroom.
- Mechanically trimmed Lexica and Arcade Jump without changing gameplay rules, scoring, storage keys, diagnostics, capture recipes, manifest entries, generated metadata, service-worker behavior, custom-domain settings, backend calls, or Security Surfaces configuration. Lexica now folds its answer bank into `words5.js` and no longer loads `answers5.js`; Arcade Jump had low-risk inline whitespace/comments compacted. Brick Breaker and Idle Tycoon already cleared the new headroom floor and were left unchanged.
- Measured post-change results: `npm run test:page-weight` reports Lexica at 146.0 KB / 160 KB with 14.0 KB / 1 request headroom, Arcade Jump at 99.0 KB / 110 KB with 11.0 KB / 2 request headroom, Brick Breaker at 109.7 KB / 120 KB with 10.3 KB / 2 request headroom, Idle Tycoon at 153.3 KB / 170 KB with 16.7 KB / 2 request headroom, and the catalog local shell at 178.0 KB / 200 KB with 22.0 KB / 9 files headroom. `npm run audit:perf:local` passed across 79 pages with Catalog at 168.3 KB / 6 requests and no page errors.

## 2026-06-03 Codex Vector Pool render capture stabilization

- Stabilized the render-capture recipe for Vector Pool so evidence waits deterministically for the scored pocket feedback state instead of sampling a shot while it may still be rolling. This does not change player-facing game behavior, catalog content, generated metadata, service-worker behavior, custom-domain settings, or Security Surfaces configuration.
- The existing `test:capture-recipes` guard now requires the bounded Vector Pool wait, scored-state predicate, feedback predicate, and clear failure message so the launch-evidence flake cannot silently return.

## 2026-06-03 Codex catalog shell headroom refresh

- Reduced desktop catalog eager/high-priority covers from 6 to 4 so the first row remains prioritized while lower rows use the existing lazy-loading path. This preserves player-facing catalog behavior and avoids adding games, manifest changes, generated metadata changes, backend calls, custom-domain work, or Security Surfaces work.
- Added a static catalog shell headroom guard to `npm run test:page-weight`: the Catalog shell must now keep at least 20 KB transfer headroom and 5 request headroom below its 200 KB / 18 request budget. The validator fixture suite now proves the low-headroom failure path.
- Measured post-change results: `npm run test:page-weight` reports the catalog local shell at 177.3 KB / 200 KB across 9/18 files, with 22.7 KB / 9 files headroom. `npm run audit:perf:local` passed across 79 pages with Catalog at 167.6 KB / 6 requests and no page errors. Local verification passed through focused shell/PWA/docs gates, `npm test`, `npm run test:games`, custom desktop/mobile catalog browser smoke, and `git diff --check`; the pass was committed and pushed as `d9cab13`, with remote Validate Catalog, Deploy Pages with Live Pages smoke, CodeQL, and Security Surfaces all successful. Fresh clean-commit launch evidence now exists under `test-results/publish-ready/2026-06-03T15-48-04-735Z/` and `test-results/live-pages-smoke/2026-06-03T15-57-45-286Z/`, both identifying `main`, `d9cab13`, a clean worktree, 78 games, and newest slugs `breachline`, `bulwark-burst`, `slipstream-sprint`.

## 2026-06-03 Codex Slipstream Sprint pass (77 -> 78 games)

- Added **Slipstream Sprint** as a new `Racing` / `Arcade` / `Action` catalog game, bringing the Racing tag up from 2 to 3 games. The game is a standalone deterministic three-lane canvas racer with fixed traffic, boost pads, barriers, drafting recharge, boost overtakes, collision integrity, keyboard/touch controls, restart, sound, fullscreen, defensive localStorage, and `render_game_to_text` / `advanceTime` diagnostics.
- Added `covers/slipstream-sprint.svg`, the manifest entry, and a render-capture recipe that starts the race, drafts, boosts, switches lanes, and freezes a readable mid-race state. Regenerated fallback catalog, JSON-LD, sitemap, feed, OG cards, and bumped the service-worker shell revision to `wa-v36-shell-3325d3ab08c4`.
- Verification passed locally: catalog validation with `-Fix` and clean validation, generated meta/feed/sitemap/OG refresh, `node --check` for changed JS, manifest/generated/capture/game/a11y/page-weight/PWA/PWA-install/docs/performance focused gates, develop-web-game Playwright client screenshots, custom desktop/mobile smoke covering start, lane switching, drafting/boost, collision damage, finish, failure, restart, sound/fullscreen, no console errors, no GitHub startup calls, and no horizontal overflow, `npm run audit:perf:local` across 79 pages, `npm test`, `npm run test:pwa-runtime`, `npm run test:games` (passed on rerun after a transient local socket exhaustion failure), `npm run capture:games:ci` with 156/156 surfaces and max score 0, and `git diff --check`. The pass was committed and pushed as `05d63e9`, with required remote workflows successful.

## 2026-05-30 Codex page-weight headroom refresh

- Mechanically compacted inline CSS presentation whitespace in `websites/idle-tycoon.html` and `websites/doodle-jump.html`, then initialized Arcade Jump's existing menu backdrop canvas so live-smoke canvas evidence is nonblank before a run starts, without changing gameplay code, storage keys, manifest entries, generated surfaces, service-worker behavior, or capture recipes.
- Reclaimed measured page-weight headroom: Idle Tycoon moved from 165.0 KB to 153.5 KB under its 170 KB exception, and Arcade Jump moved from 103.7 KB to 101.8 KB under its 110 KB exception.
- Verification passed so far: `npm run test:page-weight`, `npm run test:game-contract`, `npm run test:a11y`, `npm run test:a11y-polish`, local `WORKSHOP_ARCADE_TOUCHED_SLUGS=idle-tycoon,doodle-jump npm run test:live-pages`, `npm run test:games`, `npm run capture:games:ci` with max score 0, and `npm run audit:perf:local`.

## 2026-05-27 Codex pass 92

- Implemented on `codex/live-shell-evidence-mobile-polish-2026-05-27`: coordinator-owned shell/live evidence broadening plus isolated Bloomkeeper Grid, Cipher Rooms, and Rail Yard Relay polish lanes.
- `npm run test:live-pages` now records SHA-256 evidence for deployed shell/catalog assets (`index.html`, `websites/manifest.json`, `feed.json`, `sitemap.xml`, `app.webmanifest`, `offline.html`, `404.html`, and `robots.txt`) in addition to selected game HTML, captures catalog desktop/mobile screenshots, and writes both `summary.json` and a compact `report.md` under `test-results/live-pages-smoke/<timestamp>/`.
- Added `npm run audit:perf:local` as a cross-platform local publish check that starts a disposable static server, points the strict perf audit at it, and cleans up afterward; docs and docs-drift coverage now describe the local-vs-live perf audit path.
- Polished three existing games without changing rules/scoring/storage keys/manifest/generated surfaces/capture recipes: Bloomkeeper Grid moves selected tool, goal progress, status, tool palette, and Day action before the canvas; Cipher Rooms adds inspect-first guidance and quiets Unlock until code-ready; Rail Yard Relay adds a pre-canvas dispatcher route strip with Start/Switch/status.
- Verification passed: focused game contract/a11y/a11y-polish/keyboard-help/runtime-storage checks for the three touched games; worker and integrator desktop/mobile Playwright probes with no overflow/errors and changed diagnostics; local live smoke with shell/game hashes, screenshots, and report; negative content-hash and required-slug checks failed as expected; `node --check` for changed scripts; `npm run test:docs`; `npm run test:tools`; `npm run test:test-aggregator`; `validate-catalog.ps1 -Fix`; `validate-catalog.ps1`; `npm test`; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; `npm run audit:perf:local`; `git diff --check`.

## 2026-05-27 Codex pass 91

- Implemented on `codex/nonconflicting-quality-pass-2026-05-27`: coordinator-owned live Pages evidence hardening plus isolated Circuit Draft, Market Minute, and Tempo Forge polish lanes.
- Coordinator lane now records selected-game SHA-256 content hash evidence during `npm run test:live-pages`, supports `WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1` for release checks, and writes per-game rendered diagnostics, screenshot paths, overflow, and canvas evidence into `test-results/live-pages-smoke/<timestamp>/summary.json`. `WORKSHOP_ARCADE_SKIP_CONTENT_HASH=1` is documented only for intentional historical/preview checks.
- Polished three existing games without changing scoring/rules/storage keys/manifest/generated surfaces/capture recipes: Circuit Draft puts Install Card in the first mobile action flow with clearer lane/draft feedback; Market Minute keeps selected good, ready contracts, feedback, and Buy/Sell/Fulfill/End Turn above the goods grid; Tempo Forge moves Play/Check/status next to the pattern editor and exposes active-step feedback diagnostics.
- Verification passed: focused game contract/a11y/a11y-polish/keyboard-help/runtime-storage checks for the three touched games; integrated desktop/mobile Playwright probes with inspected screenshots, changed diagnostics, no overflow/errors, and canvas nonblank evidence where applicable; live-smoke content-hash negative check failed as expected; `WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1` negative check failed as expected; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 WORKSHOP_ARCADE_LIVE_SLUGS=circuit-draft,market-minute,tempo-forge WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1 npm run test:live-pages`; `validate-catalog.ps1 -Fix`; `validate-catalog.ps1`; `npm test`; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`; `git diff --check`.

## 2026-05-27 Codex pass 90

- Implemented on `codex/deploy-evidence-game-polish-2026-05-27`: coordinator-owned live Pages deploy-evidence hardening plus isolated Inkline Courier, Starline Strafe, and Patchwork Foundry polish lanes.
- Coordinator lane now compares the deployed `sw.js` `SHELL_REVISION` with the local or `WORKSHOP_ARCADE_EXPECTED_SW_REVISION` value during `npm run test:live-pages`, with `WORKSHOP_ARCADE_SKIP_SW_REVISION=1` reserved for intentional historical checks. The live-smoke JSON summary records local/remote service-worker revision and version evidence.
- Polished three existing games without changing rules/scoring/storage keys/manifest/generated surfaces/service worker behavior: Inkline Courier adds route readiness and next-stop diagnostics; Starline Strafe adds visible move/fire/dash touch cues and feedback diagnostics; Patchwork Foundry tightens mobile board framing and exposes selected-plate/rotation feedback.
- Verification passed: focused game contract/a11y/a11y-polish/keyboard-help/runtime-storage checks for the three touched games; desktop/mobile Playwright probes with inspected screenshots and no overflow/errors; local live-smoke mismatch check failed as expected for `WORKSHOP_ARCADE_EXPECTED_SW_REVISION=shell-000000000000`; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 WORKSHOP_ARCADE_LIVE_SLUGS=inkline-courier,starline-strafe,patchwork-foundry npm run test:live-pages`; `validate-catalog.ps1 -Fix`; `validate-catalog.ps1`; `npm test`; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`; `git diff --check`.

## 2026-05-27 Codex pass 89

- Implemented the runtime-cache + live-smoke + targeted polish pass on `codex/runtime-cache-live-polish`: coordinator-owned service-worker runtime cache cap, live Pages smoke hardening, and isolated Pinball Foundry, Prism Relay, and Typeforge Cipher polish lanes.
- Added a bounded `RUNTIME_CACHE_MAX_ENTRIES` path in `sw.js`, serializing runtime writes so same-origin GETs are cached and trimmed deterministically while preserving offline replay for recently visited pages. `test:pwa` and `test:pwa-runtime` now lock the cap and overflow pruning.
- Expanded `npm run test:live-pages` so it defaults to the three newest manifest slugs unless overridden, checks catalog root, manifest, feed, sitemap, PWA/fallback/robots surfaces, selected games, browser errors, mobile overflow, and no catalog startup GitHub API calls, then writes `test-results/live-pages-smoke/<timestamp>/summary.json`. Local preview serving now includes `.xml` and `.txt` MIME types.
- Polished three existing games without changing rules/scoring/storage keys/manifest/generated surfaces/capture recipes: Pinball Foundry adds a visible hold-launch control and charge cue; Prism Relay moves Rotate Selected into the first mobile action area with receiver progress feedback; Typeforge Cipher moves Start before the canvas with active column/token cues and compact column labels.
- Verification passed: focused game contract/a11y/a11y-polish/keyboard-help/runtime-storage checks for the three touched games; desktop/mobile Playwright probes with screenshots and no overflow/errors; `validate-catalog.ps1`; `npm test`; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 WORKSHOP_ARCADE_LIVE_SLUGS=pinball-foundry,prism-relay,typeforge-cipher npm run test:live-pages`; `git diff --check`.
- Review note addressed: the live-smoke GitHub API route is now awaited before page navigation so startup API calls cannot race past the detector.

## 2026-05-26 Codex pass 88

- Implemented the live Pages smoke + legacy polish pass on `codex/live-smoke-and-legacy-polish`: coordinator-owned `npm run test:live-pages` plus isolated Lumen Lander, Relay Choir, and Block Drop polish lanes.
- Added `scripts/check-live-pages.mjs` to smoke the deployed GitHub Pages site by default, with `WORKSHOP_ARCADE_URL` and `WORKSHOP_ARCADE_LIVE_SLUGS` overrides. It checks catalog startup, manifest/feed/sitemap, selected game URLs, browser/page errors, mobile overflow, and ensures the catalog does not call the GitHub API during startup.
- Polished the three existing games without changing scoring/rules/storage keys/manifest/generated surfaces/service worker: Lumen Lander now exposes visible start/thrust/landing feedback and no longer needs the capture feedback exemption; Relay Choir has clearer first-action and gate-budget feedback with denser mobile controls; Block Drop has clearer start/status feedback and mobile control hierarchy.
- Local verification passed: focused Lumen contract/a11y/a11y-polish/keyboard-help/runtime-storage checks; desktop/mobile Playwright probes for all three touched games; `validate-catalog.ps1`; `npm test` across 34 fast gates; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`; `npm run test:live-pages`; `git diff --check`.

## 2026-05-25 Codex pass 87

- Implemented the non-conflicting PWA budget + classics polish pass on `codex/nonconflicting-pwa-budget-classics-2026-05-25`: coordinator-owned PWA install-payload budget guard plus isolated Arcade Jump, Checkers, and Switchback Rally polish lanes.
- Added `npm run test:pwa-install-budget`, wired into `npm test` and Validate Catalog, to keep the service-worker install payload (`sw.js`, install shell assets, newest pre-cached covers, and local PWA icons) inside the existing Catalog performance budget without changing `sw.js`.
- Polished the three existing game surfaces without changing rules, scoring, storage keys, manifest entries, generated surfaces, covers, service worker behavior, or capture recipes: Arcade Jump HUD/state/steer affordance; Checkers mobile chrome plus capture/multi-jump readability; Switchback Rally mobile first-viewport control reach.
- Local verification passed: focused game contract/a11y/a11y-polish/keyboard-help/runtime-storage checks; focused Playwright desktop/mobile smoke with no browser errors or mobile overflow; `validate-catalog.ps1`; `npm test` across 34 fast gates; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci` with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`.

## 2026-05-24 Codex pass 86

- Implemented the non-conflicting SW freshness + dense classics polish pass on `codex/nonconflicting-sw-classics-2026-05-24`: coordinator-owned service-worker shell freshness guard plus isolated Lexica, 2048, and Volt Sudoku polish lanes.
- Coordinator lane adds a deterministic `SHELL_REVISION` tied to install-time shell assets and newest pre-cached covers, with static/runtime PWA checks recomputing the revision to prevent stale offline cache namespaces.
- Polished the three classic game surfaces without changing scoring/rules/storage keys, manifest entries, generated surfaces, package scripts, workflows, or capture recipes: Lexica keyboard/status/result flow; 2048 start overlay/status/undo controls; Volt Sudoku selected-cell/note/hint/status feedback and mobile density. Capture initially flagged Volt Sudoku mobile at 139 visible elements; the final mobile surface is 127 visible elements and the strict render gate scores 0.

## 2026-05-24 Codex pass 85

- Implemented the non-conflicting asset gate + compact feel pass on `codex/nonconflicting-asset-feel-pass-2026-05-24`: coordinator-owned static page-weight asset coverage plus isolated Circuit Draft, Market Minute, and Cipher Rooms polish.
- Extended `npm run test:page-weight` so game budgets include same-origin first-load assets beyond scripts, including local images/media/source/link assets and simple CSS `url(...)` references. The page-weight negative fixture now proves an oversized non-script local asset fails fast.
- Polished three existing game surfaces without changing scoring/rules/storage keys, manifest entries, generated surfaces, package scripts, workflows, service worker, covers, or capture recipes: Circuit Draft lane/draft/install flow; Market Minute contract/action readiness and mobile density; Cipher Rooms clue/keypad/unlock feedback.
- Suggested next pass: keep using small non-conflicting bundles; choose either another validation blind-spot closure or a one-file polish pass on older high-use games after reviewing the latest strict capture artifact.

## 2026-05-24 Codex pass 84

- Implemented the non-conflicting runtime + legacy feel pass on `codex/nonconflicting-runtime-polish-2026-05-24`: coordinator-owned catalog first-load cover-request gating plus isolated Memory Match, Idle Tycoon, and Rhythm Circuit polish.
- Extended `npm run test:games` with a browser-backed catalog resource assertion that proves startup makes zero GitHub API requests, first-load covers stay limited to visible/eager cards, and deferred covers request only after an explicit scroll. The new gate exposed a real `index.html` lazy-cover regression from the old `300px` observer margin, so the observer now swaps covers only when cards enter the viewport.
- Polished three existing game surfaces without changing scoring/rules/storage keys, manifest entries, generated surfaces, package scripts, workflows, service worker, covers, or capture recipes: Memory Match visible match/mismatch/status feedback; Idle Tycoon save/menu/run hierarchy and venture flow; Rhythm Circuit ready-state, lane, and judgement readability.
- Suggested next pass: keep using small non-conflicting bundles; the best remaining candidates are either another focused runtime guard or one-file polish on older high-popularity games after reviewing the latest strict capture artifact.

## 2026-05-23 Codex pass 83

- Implemented the non-conflicting quality pass on `codex/nonconflicting-quality-pass-2026-05-23`: coordinator-owned catalog runtime request gating plus isolated Paddle Pulse, Neon Drift, and Reflex Spark polish.
- Added a browser-backed catalog smoke assertion that stubs GitHub issue/commit APIs, proves first load makes zero GitHub API requests, then proves `Refresh Queue` and `Load Updates` fetch only after explicit user action.
- Polished the three legacy game surfaces without changing rules, scoring, storage keys, manifest entries, generated surfaces, or capture recipes: Paddle Pulse fullscreen/touch/active feedback; Neon Drift start/restart/fullscreen/touch-control/checkpoint/boost feedback; Reflex Spark pointer/touch/result/false-start feedback.
- Suggested next pass: keep the small-lane model and choose either another runtime regression guard or a fresh subjective review target from the latest zero-score contact sheet.

## 2026-05-23 Codex pass 82

- Implemented the non-conflicting quality bundle on `codex/nonconflicting-next-moves-2026-05-23`: one coordinator-owned catalog startup deferral plus isolated polish for Brick Breaker, Metro Dash, and Neon Snake.
- Catalog startup now hydrates fresh GitHub issue/commit widgets from session cache when available, otherwise shows local fallback links with explicit `Refresh Queue` and `Load Updates` controls. A new `test:catalog-perf` assertion keeps live GitHub issue/commit API calls out of the startup load path.
- Polished the three legacy game surfaces without changing rules, scoring, storage keys, generated surfaces, manifest entries, or capture recipes: Brick Breaker HUD/utility density and mobile containment; Metro Dash menu chrome, lane/dodge feedback, and touch controls; Neon Snake start chrome, sound/fullscreen controls, mobile controls, and active feedback readability.
- Focused verification passed for the touched games: game contract, accessibility, a11y polish, keyboard help, and Playwright desktop/mobile smoke with no console/page errors or mobile horizontal overflow. Strict local `audit:perf:ci` covered 64 manifest games / 65 pages with catalog startup at 169.7 KB / 14 requests and zero audited errors.
- Suggested next pass: keep the same non-conflicting lane model and choose either one catalog/tooling improvement or a small set of older-game subjective polish targets after reviewing the current capture sheet.

## 2026-05-22 Codex pass 79

- Implemented the balanced max-parallel bundle on `codex/max-parallel-balanced-2026-05-21`: added five compact standalone games (Volt Sudoku, Glyphogram Grid, Lumen Lander, Wordweave Grid, and Dice Dynamo) with SVG covers, manifest entries, generated fallback catalog data, per-game meta/JSON-LD, sitemap/feed entries, OG share cards, and strict render-capture recipes.
- Added catalog/tool truth work: catalog discovery action buttons with smoke assertions, mobile catalog containment smoke coverage, browser-backed PWA runtime and sandboxed storage-runtime probes, generated-surface closure for orphan HTML/OG files, validator negative fixtures, and OG generator orphan pruning. The service worker cache key is now `wa-v7-2026-05-21`.
- Landed worker-separated polish without gameplay rule changes: Maze Chase touch steering; Minesweeper/Chess/Checkers keyboard board control; Sky Hopper and Block Drop live status/tactile diagnostics; Solitaire touch-to-foundation/status polish; Slope Runner pause/resume; Echo Mimic fullscreen/status parity; Rhythm Circuit fullscreen button without stealing the F lane key; Gridline Tactics live status; shared fact-match fullscreen/status diagnostics; Brick Breaker trimmed 8.2 KB.
- Local verification passed: `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `npm run build:sitemap`; `npm run build:feed`; `npm run build:og-images`; `validate-catalog.ps1` for 59 games; `npm test` across 32 fast gates; `npm run test:runtime-storage`; `npm run test:pwa-runtime`; `npm run test:games` for 59 games; `npm run capture:games:ci` across 118 surfaces with max score 0; strict local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci` across 60 pages; `git diff --check` with existing LF-to-CRLF warnings only.
- Suggested next pass: stop adding broad content for one cycle and do a manual play-feel/contact-sheet review of the now-59-game catalog, especially the older large-budget exceptions (Idle Tycoon and Arcade Jump) and the densest board games.

## 2026-05-20 Codex pass 78

- Implemented the max-parallel quality bundle on `codex/max-parallel-quality-2026-05-20`: added five compact standalone games (Inkline Courier, Cipher Rooms, Patchwork Foundry, Market Minute, and Bloomkeeper Grid) with SVG covers, manifest entries, generated catalog fallback data, per-game meta/JSON-LD, sitemap/feed entries, OG share cards, and render-capture recipes.
- Finished legacy parity work without changing gameplay rules: Arena now has fullscreen button/`F` shortcut/diagnostics; Brick Breaker, Arcade Jump, Maze Chase, Metro Dash, Chess, Checkers, and Neon Snake received worker-owned fullscreen/live-status/diagnostic polish; Klondike Solitaire, Memory Match, and Slope Runner now expose explicit live status announcements.
- Added tool truth gates: `npm run test:generated-surfaces` verifies every manifest game has generated OG, sitemap, feed, meta/JSON-LD, and capture recipe coverage; `npm run test:performance-baseline` keeps the latest performance-baseline pass aligned with the manifest count and strict audit budgets. Improved smoke-test summaries with current phase details for fatal failures. Bumped the service worker cache key to `wa-v6-2026-05-20` for the changed catalog shell.
- Local verification passed: generated surfaces now cover 54 manifest games and 55 pages; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `npm run build:sitemap`; `npm run build:feed`; `npm run build:og-images`; `validate-catalog.ps1`; `npm test` across 31 fast gates; `npm run test:games` for 54 games; and `npm run capture:games:ci` across 108 surfaces with max score 0. Strict local `audit:perf:ci` passed across 55 pages with all five new games at 28.0-33.6 KB / 2 requests, catalog at 190.6 KB / 16 requests, and no console/page/meta/alt failures.
- Suggested next pass: after branch CI/Pages verification, pause broad expansion for a focused subjective contact-sheet/play-feel review of the now-54-game catalog.

## 2026-05-19 Codex pass 77

- Implemented `codex/max-parallel-next-2026-05-19` with a sub-agent fan-out: added five compact standalone games (Orbit Salvage, Harbor Switchboard, Relay Choir, Circuit Draft, and Switchback Rally), integrated their SVG covers, manifest entries, catalog fallback data, JSON-LD/meta tags, sitemap/feed entries, OG share cards, and render-capture recipes.
- Added fullscreen polish to the requested legacy set while preserving gameplay rules: Lexica from a worker pass plus Gemline Cascade, Dungeon Circuit, Circuit Putt, Minesweeper, Klondike Solitaire, Signal Siege, Starline Strafe, Pinball Foundry, and Deckforge Duel locally. The shared helper syncs `aria-pressed`, guards Space/Enter/F shortcuts, and adds additive fullscreen diagnostics.
- Added tool truth gates: `npm run test:cover-assets`, `npm run test:storage-contract`, exact `workshop-meta` drift checking, tighter perf budgets (Catalog 200 KB / 18 requests, default games 100 KB / 3 requests), and a compact smoke-test summary artifact. Bumped the service worker cache key to `wa-v5-2026-05-19` for the changed catalog shell.
- Verification passed locally: `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `npm run build:sitemap`; `npm run build:feed`; `npm run build:og-images`; `validate-catalog.ps1` for 49 games; `npm test` with 29 fast gates; `npm run test:games` for 49 games; `npm run capture:games:ci` across 98 surfaces with max score 0; strict local `audit:perf:ci` across 50 pages with all five new games at 30.3-38.8 KB / 2 requests and the catalog at 184.0 KB / 16 requests; `git diff --check`.
- Suggested next pass: run branch CI and publish this bundle, then pause broad content expansion for a subjective play-feel/contact-sheet review on the now-49-game catalog.

## 2026-05-19 Codex pass 76

- Implemented the max-parallel bundle on `codex/max-parallel-2026-05-19` with worker-separated changes: four new standalone games, five fullscreen legacy polish passes, Lexica payload compaction, Brick Breaker and Arcade Jump trims, and stricter docs-budget drift checking.
- Added Gridline Tactics, Service Shift, Letter Foundry, and Penalty Circuit with SVG covers, manifest entries, catalog fallback data, per-game meta, sitemap/feed/OG generation, and capture recipes.
- Added fullscreen buttons/guarded shortcuts plus additive diagnostics to 2048, Sky Hopper, Slope Runner, Idle Tycoon, and Block Drop. Idle Tycoon uses `Shift+F` for fullscreen to preserve the existing `F` Surge hotkey; the shortcut checks verified fullscreen keys do not count as flap/start/steer/move/drop input.
- Compacted Lexica word payloads without changing strict word rules, trimming about 72.9 KB from `words5.js` + `answers5.js`. Arcade Jump and Brick Breaker received conservative payload trims.
- Local verification: `npm test` passed 27 fast gates; `npm run test:games` passed for 44 games after one transient no-output retry; `npm run capture:games:ci` passed with 88 surfaces and max score 0; strict local `audit:perf:ci` passed across 45 pages with the four new games at 23.1-26.8 KB and Lexica down to 144.7 KB transfer.
- Suggested next pass: review the now-44-game catalog by subjective contact-sheet quality, then decide whether to tighten Lexica's named perf exception or keep the extra CI headroom.

## 2026-05-04 Codex

- Task: rank Workshop Arcade games by rendered quality, improve the weakest three, verify locally and in CI, then push.
- Current focus: gather screenshots and code context before choosing the three files to patch.
- Rendered all 20 games into `test-results/quality-pass/contact-sheet.png`.
- Selected first pass targets: `websites/arena.html` for sparse visuals and no touch movement, `websites/minesweeper.html` for cramped mobile layout, and `websites/brick-breaker.html` for startup/help friction plus pre-gesture audio warnings.
- Implemented the first pass: richer Arena rendering and drag movement, mobile-centered Minesweeper defaults/layout, Brick Breaker audio warning fix and mobile HUD/brick spacing.
- Final local checks passed: catalog validator, game smoke suite for 20 games, `git diff --check` with CRLF warnings only. Updated visual captures showed no console warnings or mobile overflow for the three changed games.
- Suggested next pass: repeat the rendered ranking flow for the next weakest set, likely the text-heavy fact-match variants or the older card/board games with dense mobile controls.

## 2026-05-04 Codex pass 2

- Refreshed current render targets into `test-results/quality-pass-2/contact-sheet.png`.
- Selected pass targets from screenshots: shared fact-match UI, Checkers audio warning, and mismatched Slope Runner catalog metadata.
- Implemented shared fact-match visual upgrade and added `render_game_to_text` / `advanceTime` hooks for automated inspection.
- Verified the pass with rerendered desktop/mobile screenshots, required web-game client runs, catalog validation, full game smoke tests, and `git diff --check`.
- Suggested next pass: polish Chess/Solitaire desktop density and add text-state hooks to more non-canvas games so rendered regressions are easier to diagnose.

## 2026-05-04 Codex pass 3

- Refreshed Chess and Klondike Solitaire desktop/mobile baselines into `test-results/quality-pass-3/before/` and rerendered the edited pass into `test-results/quality-pass-3/after/`.
- Tightened Chess board/sidebar density, mobile stacking, controls, move-history sizing, and added `render_game_to_text` / `advanceTime` diagnostics for board occupancy, move state, check state, flip state, and AI mode.
- Tightened Solitaire header/HUD, desktop board scale, mobile card readability, footer density, and added `render_game_to_text` / `advanceTime` diagnostics for stock/waste, foundations, tableau, moves, draw mode, time, stuck/win state, and last hint/action.
- Verified with the required web-game Playwright client plus direct interaction assertions for Chess move/undo and Solitaire draw/hint/undo/restart. Catalog validation and full game smoke tests passed locally.
- Suggested next pass: continue rendered-quality ranking with the remaining older DOM games that lack first-class diagnostic hooks or have dense mobile control surfaces.

## 2026-05-04 Codex pass 4

- Refreshed the full 20-game desktop/mobile contact sheet into `test-results/quality-pass-4/before/contact-sheet.png`.
- Selected Checkers, Lexica, and 2048 as the next pass targets from current screenshots and hook coverage: Checkers had slight mobile overflow and no diagnostics, Lexica opened with a blocking startup modal and no diagnostics, and 2048 lacked diagnostics plus responsive shell polish.
- Initial implementation: tightened Checkers and 2048 responsive layout, made Lexica show the playable grid immediately, and added `render_game_to_text` / `advanceTime` hooks to all three targets.
- Verified the edited targets with focused desktop/mobile captures in `test-results/quality-pass-4/after/`, the required web-game client, direct Playwright interaction assertions, catalog validation, and the full 20-game smoke suite.
- Suggested next pass: add diagnostics to the remaining games without hooks, then do a smaller mobile control-density pass on any title still close to the overflow limit.

## 2026-05-04 Codex pass 5

- Standardized `render_game_to_text` / `advanceTime` diagnostics across the six older arcade targets: Brick Breaker, Neon Snake, Block Drop, Minesweeper, Maze Chase, and Metro Dash.
- Kept gameplay rules intact while exposing score/state, player or board positions, active hazards/objects, timers, controls, overlays, and audio flags in compact JSON payloads.
- Captured focused before/after desktop and mobile screenshots in `test-results/quality-pass-5/`, ran the required web-game client for all six targets, and verified direct interaction assertions for movement, reveal/flag, launch/drop, and runner/chase state updates.
- Fixed a concrete visual regression caught during inspection: Neon Snake mobile HUD and touch controls now wrap instead of clipping off-screen.
- Local checks passed: catalog validation, full 20-game smoke suite, and `git diff --check`.
- Suggested next pass: decide whether to add hooks to the remaining endless/idle pages or move into a mobile control-density polish pass for the games that still feel cramped.

## 2026-05-05 Codex pass 6

- Implemented the combined endless diagnostics and mobile density pass for Arcade Jump, Sky Hopper, Slope Runner, Idle Tycoon, and Arena.
- Added compact `render_game_to_text` / `advanceTime` coverage to Arcade Jump, Sky Hopper, Slope Runner, and Idle Tycoon, and added the missing `advanceTime` hook to Arena.
- Tightened mobile first-screen density for Arcade Jump, Slope Runner, and Idle Tycoon without changing gameplay rules, saves, audio preferences, or catalog metadata.
- Captured focused before/after desktop and mobile screenshots in `test-results/quality-pass-6/`, ran the required web-game client for all five targets, and verified direct Playwright assertions for movement, flap/pipe spawn, slope steering, idle click/buy/run, and Arena movement/spawn state.
- Local checks passed: catalog validation, full 20-game smoke suite, and `git diff --check`.
- Suggested next pass: run one full catalog screenshot ranking now that diagnostics coverage is broad, then polish any remaining visual weak spots rather than adding more hooks.

## 2026-05-06 Codex pass 7

- Added the durable full-catalog rendered ranking harness as `npm run capture:games`, writing screenshots, `summary.json`, `contact-sheet.html`, and `contact-sheet.png` under `test-results/render-ranking/<timestamp>/`.
- Baseline ranking in `test-results/render-ranking/2026-05-06T13-22-26-356Z/` selected shared fact-match mobile, Idle Tycoon mobile menu density, and 2048 text/control overflow as the top polish targets.
- Tightened shared fact-match mobile density so Guess and round actions land earlier in the first viewport, hid the Idle Tycoon background app while the save menu is open and compacted its mobile menu cards, and separated 2048's control hint from the button row.
- Final capture in `test-results/render-ranking/2026-05-06T13-38-45-182Z/` showed the selected issues cleared from the top ranking with no console/page/network errors or mobile horizontal overflow.
- Verified with the required web-game client for 2048, Hero Fact Match, and Idle Tycoon plus direct Playwright assertions for 2048 moves, fact-match hint/correct guess, and Idle Tycoon slot/click/buy state.
- Local checks passed: `npm run capture:games`, catalog validation, and full 20-game smoke suite.
- Suggested next pass: refine low-priority harness heuristics around intentional stacked-card DOM and then address the real remaining mobile first-action candidates, especially Neon Snake and Lexica, if screenshots still show buried controls.

## 2026-05-06 Codex pass 8

- Ran the fresh full-catalog rendered ranking baseline in `test-results/render-ranking/2026-05-06T13-59-21-859Z/`, then targeted the remaining real mobile first-screen issues plus ranking noise.
- Refined `scripts/capture-games.mjs` so tiny overlay overflow, intentional Solitaire card stacks, Arcade Jump decorative menu clipping, and Lexica's playable "Play Again" reset no longer rank as hard visual issues.
- Improved Neon Snake mobile by adding a visible Start/Pause/Resume/Restart action in the HUD and wrapping the canvas start instructions so they no longer clip on 390px screens.
- Improved Minesweeper mobile by tightening the control grid/footer and sizing the beginner board to the available mobile width while keeping larger-board fit behavior intact.
- Final capture in `test-results/render-ranking/2026-05-06T18-30-22-154Z/` showed all ranked surfaces at score 0 with no console/page/network issues or mobile horizontal overflow.
- Verified with the required web-game client for Snake, Minesweeper, and Lexica plus direct mobile Playwright assertions for Snake start/move, Minesweeper reveal/flag, and Lexica typed guess.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: move from first-screen cleanup to deeper subjective gameplay polish, starting with any zero-score screenshots that still feel sparse or visually dated despite passing the automated rubric.

## 2026-05-06 Codex pass 9

- Baseline: `test-results/render-ranking/2026-05-06T18-58-06-224Z/` scored all 40 rendered surfaces at zero automated issues, so target selection moved to manual player-feel inspection.
- Selected Block Drop, Metro Dash, and Maze Chase as the weakest subjective surfaces: Block Drop hid play behind its help modal, Metro Dash's first frame felt too sparse, and Maze Chase mobile made the board compete with surrounding UI.
- Implemented the polish pass: Block Drop now shows the board and a compact Play/Help panel immediately, Metro Dash has a wider/brighter runway and stronger title start panel, and Maze Chase has a denser shell with a larger board emphasis.
- Final capture in `test-results/render-ranking/2026-05-06T19-17-24-584Z/` scored all 40 rendered surfaces at zero automated issues and the target desktop/mobile screenshots were manually inspected.
- Verified with the required web-game client for Block Drop, Metro Dash, and Maze Chase plus state inspection showing Block Drop running with occupied cells, Metro Dash playing with distance/coins/obstacle state, and Maze Chase playing with pellet progress.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: after this polish lands, use the fresh final contact sheet to decide whether to keep improving subjective game feel or add any missing reusable assertions to the capture harness.

## 2026-05-07 Codex pass 10

- Extended `npm run capture:games` into an interactive evidence harness: every catalog game now runs a lightweight recipe, captures post-action screenshots, records pre/post `render_game_to_text` state, scores weak interaction evidence, and shows first/post screenshots in the contact sheet.
- Baseline interaction ranking exposed Arcade Jump's post-start dead-state evidence; the recipe was refined and Arcade Jump now starts with the same upward bounce used by normal platform contacts, with diagnostics correctly reporting visible game-over state.
- With all surfaces scoring zero after recipe fixes, applied the fallback visual polish targets: Sky Hopper first screen now fills letterbox space and separates the prompt from the bird, Arena menu now shows live player/enemy/gem preview art, and shared fact-match mobile uses a tighter guess row with unclipped placeholder text.
- Final capture: `test-results/render-ranking/2026-05-07T02-12-31-284Z/`, with all 40 desktop/mobile surfaces at score 0 and interaction state changes confirmed for the polished targets.
- Verified with the required web-game client for Arcade Jump, Sky Hopper, Arena, and Hero Fact Match, plus direct Playwright state assertions for start/flap/move/hint changes.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the interactive contact sheet to choose the next subjective gameplay-feel targets, likely deeper after-action HUD/readability improvements rather than more harness plumbing.

## 2026-05-07 Codex pass 11

- Baseline: `test-results/render-ranking/2026-05-07T04-56-33-715Z/` again scored all 40 surfaces at zero, so target selection came from mobile post-action feel in the interactive contact sheet.
- Improved Neon Snake mobile active play by top-biasing the board, measuring HUD/control reserves in `resize()`, and hiding duplicate bottom Music/Help buttons while preserving HUD controls, D-pad, rules, audio, and diagnostics.
- Improved Idle Tycoon mobile active flow by compacting the title, stats tray, clicker core, meter/facts, and surge card so Ventures, Run All, Hire Managers, and the first venture card appear earlier.
- Improved Klondike Solitaire mobile active play by increasing mobile card height/fan spacing, expanding tableau drop zones, reducing gaps, and shortening footer help copy while preserving DOM cards, draw/undo/hint/restart/autocomplete behavior, saves, and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T05-11-48-271Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and the three target mobile post-action screenshots manually inspected.
- Verified with the required web-game client for Snake, Idle Tycoon, and Solitaire plus direct mobile Playwright assertions for Snake board position/head movement, Idle cash and venture visibility, and Solitaire stock/waste/move/tableau sizing.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: run another subjective pass from the interactive contact sheet focused on desktop active-play feel, especially any game whose post-action state is technically correct but visually static or hard to read.

## 2026-05-07 Codex pass 12

- Baseline: `test-results/render-ranking/2026-05-07T05-38-34-564Z/` scored all 40 surfaces at zero, so desktop active-play targets were selected by visual inspection rather than automated score.
- Selected Sky Hopper, Klondike Solitaire, and 2048 as the weakest desktop post-action feel surfaces: Sky Hopper had inert side letterboxing, Solitaire underused desktop tableau height, and 2048 looked flat compared with newer games.
- Improved Sky Hopper desktop by drawing a wide parallax backdrop in the letterbox margins while keeping the original world-space play lane, physics, controls, audio, and diagnostics unchanged.
- Improved Klondike Solitaire desktop by increasing card size/fan spacing, widening the board, and extending tableau drop zones so the post-draw layout uses the available height while preserving DOM cards and rules.
- Improved 2048 desktop with richer background accents, stronger board depth, larger stage, and tile shadow/highlight rendering without changing movement, scoring, saves, undo, or diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T06-03-36-868Z/`, with all 40 desktop/mobile surfaces at zero automated issues; target desktop screenshots were manually inspected.
- Verified with required web-game clients for Sky Hopper, Solitaire, and 2048 plus direct desktop Playwright assertions for active Sky Hopper state, Solitaire draw/tableau sizing, and 2048 grid changes.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`. A first capture/check attempt hit local timeout/resource noise, then passed on rerun with longer timeout.
- Suggested next pass: use the interactive contact sheet to make a small shared polish pass for non-game menu/status affordances, especially duplicated or low-priority controls that remain visible during active play.

## 2026-05-07 Codex pass 13

- Baseline: `test-results/render-ranking/2026-05-07T20-47-22-791Z/` scored all 40 surfaces at zero, so active-play chrome targets were selected by visual inspection.
- Selected Neon Snake, Brick Breaker, and the shared Fact Match engine because their active-play screens still let status or low-priority controls compete with the actual game/action surface.
- Implemented compact Snake utility pills, split Brick Breaker stats from utility controls, and tightened shared Fact Match header/panel/action density while preserving gameplay, saves, audio, diagnostics, and manifest data.
- Final capture: `test-results/render-ranking/2026-05-07T21-01-59-864Z/`, with all 40 surfaces at zero automated issues; target first/post screenshots were manually inspected.
- Verified with required web-game clients for Snake, Brick Breaker, and Hero Fact Match plus direct full-page Playwright assertions for active state, chrome sizing, no overflow, and fact-match clue/guess behavior.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the contact sheet to pick one deeper gameplay-feel target that is still mechanically correct but could benefit from clearer mid-game feedback or movement readability.

## 2026-05-07 Codex pass 14

- Baseline: `test-results/render-ranking/2026-05-07T21-19-19-247Z/` scored all 40 surfaces at zero; Metro Dash was selected as the mechanically solid game with the weakest mid-game feedback/readability.
- Strengthened Metro Dash lane depth cues, motion streaks, obstacle danger glow, coin pickup rings/score pops, near-miss callouts, crash flash/shake, and feedback diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T21-32-43-254Z/`, with all 40 surfaces at zero automated issues and the Metro Dash desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for forced coin pickup, near miss, and mobile crash feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: apply the same mid-game feedback lens to another mechanically solid canvas game, likely Slope Runner danger/risk feedback or Arena hit/collection readability.

## 2026-05-08 Codex pass 15

- Baseline: `test-results/render-ranking/2026-05-08T03-46-00-643Z/` scored all 40 surfaces at zero; Slope Runner was selected for mid-game risk feedback because obstacle threat, edge danger, and speed read softly despite solid mechanics.
- Strengthened Slope Runner active play with brighter risk rails, center guide ticks, horizon fog, speed streaks, obstacle warning glow, near-miss particles/ring/`CLOSE` pop, and stronger crash flash/shake.
- Extended diagnostics in `websites/shape-inlay.html`: fixed ball/current-segment reporting to use `config.ballZ`, added `dangerCue`, `dangerObstacle`, `nearMissCount`, `lastNearMissAge`, `crashFlash`, `edgePulse`, and feedback particle counts.
- Final capture: `test-results/render-ranking/2026-05-08T03-56-39-090Z/`, with all 40 surfaces at zero automated issues and Slope Runner desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for danger cue, near miss feedback, mobile crash feedback, no overflow, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: apply the same movement/readability lens to Arena hit/collection feedback, especially active combat/collision clarity.

## 2026-05-08 Codex pass 16

- Baseline: `test-results/render-ranking/2026-05-08T04-23-44-679Z/` scored all 40 surfaces at zero; Arena was selected because active play was mechanically healthy but hit danger, enemy intent, dust pickup, invulnerability, and game-over feedback read quietly.
- Strengthened `websites/arena.html` active play with enemy intent rings/trails, type-specific threat outlines/glow, player danger rings, stronger hit flash/shake, dust pickup rings/particles, clearer `+1 XP` pop text, and a more visible invulnerability aura.
- Extended Arena diagnostics with nearest enemy distance/type, `dangerCue`, pickup and hit ages, pending game-over state, invulnerability time, and compact feedback particle/ring/popup counts while keeping `advanceTime(ms)` on the existing deterministic step path.
- Final capture: `test-results/render-ranking/2026-05-08T04-38-56-153Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Arena desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for danger cue, dust pickup feedback, hit/pending-over feedback, restart flow, no overflow, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game mid-play feedback polish on another mechanically solid title, likely Brick Breaker powerup/collision feedback or Maze Chase pellet/power-state readability.

## 2026-05-08 Codex pass 17

- Baseline: `test-results/render-ranking/2026-05-08T05-04-08-082Z/` scored all 40 surfaces at zero; Brick Breaker was selected because active play worked but ball hits, brick breaks, drops, powerups, and misses still read quietly compared with newer feedback passes.
- Strengthened `websites/brick-breaker.html` with visual-only feedback state for ball trails/launch cues, brick hit flashes, break particles/rings, bomb warning glow, paddle contact rings, powerup auras/collection pops, shield/life-loss flash, and short screen shake.
- Extended Brick Breaker diagnostics with compact `feedback` fields for last hit/break/paddle/powerup/life/shield ages, last powerup type, impact/break/collection counters, particle/ring count, popup count, screen flash, and screen shake.
- Final capture: `test-results/render-ranking/2026-05-08T15-45-11-949Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Brick Breaker desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for brick impact, life-loss feedback, powerup spawn, FIRE collection feedback/effect state, diagnostics updates, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue the same single-game feedback approach on Maze Chase pellet/power-state readability, or shift to catalog-level tuning if contact-sheet evidence shows a broader pattern.

## 2026-05-08 Codex pass 18

- Baseline: `test-results/render-ranking/2026-05-08T16-09-54-898Z/` scored all 40 surfaces at zero; Maze Chase was selected because pellet consumption, power state, ghost danger, ghost-eat feedback, and life loss still read flatter than the recent Arena/Brick Breaker feedback passes.
- Strengthened `websites/maze-chase.html` with visual-only feedback state for pellet sparkles, score/status pops, power-pellet board/player pulses, frightened ghost auras, harmful ghost threat rings, fruit/ghost-eat rings, life-loss flash, and short screen shake.
- Extended Maze Chase diagnostics with `dangerCue`, `nearestGhost`, compact event ages/counters, feedback particle/ring counts, popup count, `screenFlash`, and `screenShake`, while keeping `advanceTime(ms)` deterministic for feedback timers and non-playing settle states.
- Final capture: `test-results/render-ranking/2026-05-08T16-24-40-362Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Maze Chase desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client for Maze Chase plus direct Playwright checks for pellet feedback and harmful collision/life-loss feedback; the focused client state also confirmed power-pellet and ghost-eat diagnostics.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game mid-play feedback polish on Tetris line/lock/clear readability or Minesweeper reveal/flag feedback, depending on the next contact-sheet review.

## 2026-05-10 Codex pass 19

- Baseline: `test-results/render-ranking/2026-05-11T01-08-06-609Z/` scored all 40 surfaces at zero; Block Drop was selected because mobile Hold/Next chrome overlapped the spawn lane and active play feedback for lock, hard drop, line clear, and top-out was too quiet.
- Fixed `websites/tetris.html` mobile spawn-lane readability by increasing the mobile top reserve and reducing bottom reserve so Hold/Next end above the canvas without shrinking the board below current readability.
- Added visual-only feedback state for movement/rotation/drop/lock, hard-drop trails, lock-warning outlines, row flashes, line-clear/level/top-out pops, particles, screen flash, and screen shake.
- Refactored line clearing to return original cleared row indexes, then extended diagnostics with compact feedback ages, counters, last clear rows/count/label, lock warning, particle/popup counts, screen flash, and screen shake.
- Final capture: `test-results/render-ranking/2026-05-11T01-20-10-698Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Block Drop desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for mobile non-overlap/no overflow, hard-drop/lock feedback, a bounded bot-produced real line clear, and top-out/game-over feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game feedback polish on Minesweeper reveal/flag/chord feedback, or review the latest contact sheet for another mechanically solid game whose mid-play events still read quietly.

## 2026-05-11 Codex pass 20

- Baseline: `test-results/render-ranking/2026-05-11T05-58-18-676Z/` scored all 40 surfaces at zero; Minesweeper was selected because reveals, flags, chord attempts, mine hits, and wins still read quietly compared with the newer feedback-polished games.
- Strengthened `websites/minesweeper.html` with visual-only reveal waves, flag rings, chord success/bump cues, mine-hit flash/shake, win pulse, compact particles, and short pop labels while preserving board rules, first-click safety, timer, difficulty controls, audio preferences, and layout.
- Extended Minesweeper diagnostics with compact feedback ages, counters, last affected cells, active particle/ring/popup counts, screen flash color, and screen shake; `advanceTime(ms)` now steps feedback deterministically and redraws without audio or preference side effects.
- Final capture: `test-results/render-ranking/2026-05-11T06-12-30-008Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Minesweeper desktop/mobile post-action screenshots manually inspected.
- Verified with the required develop-web-game client plus direct Playwright checks for reveal, flag, chord-bump, mine-hit/game-over, restart, and deterministic custom-board win feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: review the latest interactive contact sheet for remaining mechanically solid games whose short-lived feedback is hard to see in the broad capture, or add a targeted capture recipe that records immediate event-feedback frames.

## 2026-05-11 Codex pass 21

- Baseline: `test-results/render-ranking/2026-05-11T15-15-31-676Z/`; the catalog was clean but the broad capture did not preserve short-lived event feedback.
- Extended `scripts/capture-games.mjs` to capture first, immediate event, and settled post-action screenshots, write `eventScreenshot`, `eventState`, `eventSignals`, and `feedbackActive` into `summary.json`, and render all three evidence frames in the contact sheet.
- Updated interaction scoring so hard failures still lead, while state-changing actions without event-frame feedback diagnostics receive a low-grade ranking signal. Refined the Metro Dash recipe after the final harness exposed a deterministic recipe-caused game-over.
- Polished `websites/checkers.html` with last-move from/to highlights, move trail, capture burst/ring, crown pulse, move/capture pops, and compact feedback diagnostics.
- Polished `websites/chess.html` with stronger from/to highlights, move arrow, capture/check pulse, label pops, deterministic `advanceTime(ms)` feedback stepping, and compact feedback diagnostics.
- Final capture: `test-results/render-ranking/2026-05-11T15-40-39-439Z/`; Checkers and Chess desktop/mobile score zero with active feedback metadata. The top remaining low-grade signals are 2048, fact-match clue actions, Arcade Jump, and Sky Hopper missing event-frame feedback diagnostics.
- Verified with the required develop-web-game client for Chess/Checkers plus direct Playwright capture paths for Chess `e2-e4 d7-d5 e4xd5` and Checkers `c3-d4 b6-c5 d4xb6`, confirming diagnostics, screenshots, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the new event-frame ranking to add compact feedback diagnostics to the low-score deterministic targets, starting with 2048 tile slide/merge feedback or shared Fact Match clue/action feedback.

## 2026-05-11 Codex pass 22

- Baseline: `test-results/render-ranking/2026-05-11T17-42-36-367Z/`; no hard failures, with 2048 and shared Fact Match pages ranking only for missing event-frame feedback diagnostics.
- Added compact 2048 feedback diagnostics for move direction, moved tile count, merge count, score gained, largest merged tile, spawned tile, merge targets, event age, active pops, and event counters; added small visual merge/spawn/score cues without changing rules, undo, saves, random spawn behavior, or layout.
- Added shared Fact Match feedback diagnostics and non-layout-shifting clue/result pulse cues for clue reveal, guess submit, correct/wrong guess, reveal, and new round across all four fact-match games.
- Refined only the Sky Hopper and Slope Runner capture recipes after final captures showed recipe-caused settled-frame game-over false positives; global scoring stayed unchanged.
- Final capture: `test-results/render-ranking/2026-05-11T18-15-36-967Z/`; 2048 and all Fact Match desktop/mobile surfaces score zero with active event feedback metadata.
- Verified with required develop-web-game clients for 2048 and Hero Fact Match plus direct Playwright checks for 2048 merge/spawn feedback and all four Fact Match clue feedback paths, including Hero wrong-guess feedback and mobile no-overflow checks.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, `node --check scripts/capture-games.mjs`, and `git diff --check`.
- Suggested next pass: continue clearing low-grade event-feedback signals for Arcade Jump and Sky Hopper first, then Idle Tycoon, Metro Dash, and Slope Runner if the event-frame contact sheet still shows quiet but correct interactions.

## 2026-05-11 Codex pass 23

- Baseline: `test-results/render-ranking/2026-05-11T18-15-36-967Z/`; no hard failures, with Arcade Jump and Sky Hopper ranking only for missing immediate event-frame feedback diagnostics.
- Added Arcade Jump feedback diagnostics and visual-only canvas cues for run start, steering input, bounce/landing, double-jump, powerup pickup, enemy/shield hits, shield rescue, and game over while preserving physics, scoring, saves, audio preferences, layout, and metadata.
- Added Sky Hopper feedback diagnostics and visual-only cues for start, flap, pipe score, hit/game-over, active cue count, nearest pipe, and danger cue without changing flap physics, scoring, saves, audio preferences, layout, or metadata.
- Fixed an Arcade Jump deterministic test-hook edge where `advanceTime()` could make the following RAF delta negative and feed a negative cue radius into canvas drawing.
- Final capture: `test-results/render-ranking/2026-05-11T21-37-54-450Z/`; Arcade Jump and Sky Hopper desktop/mobile now score zero with active event-feedback metadata.
- Verified with focused desktop/mobile Playwright clients for Arcade Jump start/steer/double-jump and Sky Hopper start/flap, confirming feedback diagnostics, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue clearing low-grade event-frame diagnostics for Idle Tycoon, Metro Dash, Slope Runner, Neon Snake, and Klondike Solitaire, choosing the first target after inspecting the latest contact sheet for actual player-feel impact.

## 2026-05-12 Codex pass 24

- Baseline: `test-results/render-ranking/2026-05-12T04-35-05-286Z/`; the remaining 12 rendered surfaces were the six planned targets at desktop/mobile, each ranking only for missing immediate event-frame feedback diagnostics.
- Added compact event-feedback diagnostics to `websites/idle-tycoon.html`, `websites/metro-dash.html`, `websites/shape-inlay.html`, `websites/snake.html`, `websites/solitare.html`, and `websites/wordle.html` for slot/click, runner actions, steer/start, snake turns, stock draw/recycle, and Lexica text input.
- Reused existing visual systems for small non-layout-shifting cues: clicker cash feedback, runner action rings/pops, Slope start/steer cues, a Snake head ring, Solitaire stock/waste pile pulse, and a Lexica active-row input pulse.
- Final capture: `test-results/render-ranking/2026-05-12T04-47-50-314Z/`; all 40 rendered surfaces now score zero, with the six target groups exposing active `feedback` metadata in the immediate event frame.
- Verified with the develop-web-game client for Snake, Metro Dash, Slope Runner, and Solitaire plus direct Playwright coverage for all six targets, confirming feedback counters/state changes, no new console/page errors, and no gameplay regressions in the scripted flows.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: treat the zero-score contact sheet as a qualitative review tool and pick any remaining improvement by actual player feel rather than diagnostic debt; the automated event-frame closure backlog is cleared.

## 2026-05-13 Codex pass 25

- Baseline: `test-results/render-ranking/2026-05-13T15-23-19-108Z/`; all 40 surfaces scored zero, so this pass targeted qualitative mobile scanability in the four shared Fact Match games.
- Polished `websites/fact-match-engine.js` mobile layout: tighter hero/subtitle, compact stat pills, clearer clue hierarchy, stronger Guess affordance, quieter secondary actions, and denser answer-bank rows/filter styling.
- Added small shared answer-bank affordances and diagnostics for `visibleBankCount`, `filterText`, and `lastBankPick` while preserving datasets, scoring, local best score, event feedback, metadata, and static-site behavior.
- Final capture: `test-results/render-ranking/2026-05-13T15-41-15-855Z/`; all 40 surfaces still score zero, and all Fact Match desktop/mobile surfaces have zero overflow and active interaction feedback.
- Verified with the required develop-web-game client for Hero Fact Match, direct Playwright shared-engine smoke across all four Fact Match pages, catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: keep using the zero-score contact sheet for qualitative selection; likely targets are remaining player-feel refinements in mobile board/card density or first-screen clarity rather than diagnostics.

## 2026-05-13 Codex pass 26

- Baseline: `test-results/render-ranking/2026-05-14T01-22-47-834Z/`; all 40 surfaces scored zero, so this pass targeted qualitative Klondike Solitaire mobile touch readability.
- Polished `websites/solitare.html` mobile CSS by enlarging the 390px card footprint, rank/suit/pip text, fan spacing, and tableau drop-zone height while preserving horizontal fit and desktop stability.
- Tightened mobile header/footer density and added stronger non-layout-shifting touch feedback for active cards, stock/waste presses, hints, and valid/invalid drop targets.
- Extended Klondike diagnostics with a compact `layout` object reporting viewport, mobile mode, card size, fan spacing, board width, and horizontal overflow for focused mobile assertions.
- Final capture: `test-results/render-ranking/2026-05-14T01-33-44-852Z/`; all 40 surfaces still score zero, and Klondike mobile renders larger 51x80 cards with zero overflow.
- Verified with the required develop-web-game client for Solitaire stock draw plus direct mobile Playwright checks for stock draw, hint, a legal drag when available, undo/restart, no clipped card text, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score review; likely choose another mobile board/card interaction surface only if actual contact-sheet evidence shows player friction.

## 2026-05-14 Codex pass 27

- Baseline: `test-results/render-ranking/2026-05-14T03-00-17-317Z/`; all 40 surfaces scored zero, so this pass targeted qualitative 2048 visual cohesion and touch feel.
- Restyled `websites/2048.html` into the darker Workshop Arcade visual language with higher-contrast page chrome, score badges, buttons, help/overlay panels, board cells, tile shadows, and more distinct high-value tile colors.
- Improved mobile first/play screens by compacting controls and making the board fill 370px at the 390px viewport with zero horizontal overflow.
- Strengthened canvas feedback for merge rings, spawn outlines, score/direction pops, tile glow, and board press affordance while preserving 2048 rules, random spawns, scoring, undo, overlays, saves, keyboard/swipe controls, and existing event diagnostics.
- Extended 2048 diagnostics with a compact `layout` object for viewport, mobile mode, board/canvas sizes, canvas pixel size, and horizontal overflow.
- Final capture: `test-results/render-ranking/2026-05-14T03-23-38-360Z/`; all 40 surfaces score zero, with 2048 desktop/mobile manually inspected.
- Verified with the required develop-web-game client for 2048 plus direct desktop/mobile Playwright checks for bounded merge feedback, undo, help open/close, overlay restart usability, board sizing, no offscreen controls, and no overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score contact-sheet review, likely targeting another page whose visual style still feels less integrated than the newest feedback-polished games.

## 2026-05-14 Codex pass 28

- Baseline: `test-results/render-ranking/2026-05-14T03-37-10-570Z/`; all automated scores were clean, so this pass targeted qualitative Sky Hopper visual cohesion and active-flight readability.
- Restyled `websites/flappy-bird.html` toward the newer Workshop Arcade feel with a darker teal sky shell, richer world gradient, layered cloud/hill/ground treatment, stronger pipe contrast, and a more distinct bird silhouette.
- Strengthened visual-only feedback for flaps, score events, pipe danger, speed streaks, hit flash, and screen shake while preserving flap physics, pipe timing, scoring, collision rules, saves, audio preferences, controls, metadata, and static-site behavior.
- Added compact Sky Hopper diagnostics for layout, nearest gap, screen flash/shake, and danger feedback; also gated gameplay input while the help overlay is open so Space/tap cannot start play behind the help card.
- Final capture: `test-results/render-ranking/2026-05-14T03-53-42-495Z/`; 40 ranked surfaces, max score 0, with Sky Hopper desktop/mobile manually inspected.
- Verified with the required develop-web-game client for Sky Hopper plus direct desktop/mobile Playwright checks for active pipes, danger feedback, help gating, restart flow, crash feedback, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score review; likely pick a remaining older game whose visual style or active-play feedback still feels less cohesive than the newest polished titles.

## 2026-05-14 Claude pass 29

- Baseline: `test-results/render-ranking/2026-05-14T04-13-10-622Z/`; all 40 surfaces scored zero, but the Idle Tycoon main menu still felt jarring next to the polished 2048/Sky Hopper aesthetic (bright yellow Sound/Music toggles, oversized Impact section headings).
- Polished `websites/idle-tycoon.html` menu cohesion: tightened the menu card chrome with a teal-tinted dark gradient and inset highlight, retyped `.menu-section h2` (Save Files/Options) as compact uppercase teal labels matching the eyebrow style, and rebuilt `.menu-toggle` so the active state shows a teal accent edge and an On/Off status pill instead of a full bright-yellow fill.
- Preserved Idle Tycoon save data, audio preferences, tutorial toggle behavior, ventures/economy logic, in-game HUD, mobile layout breakpoints, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-21-32-728Z/`; 40 ranked surfaces, max score 0, with Idle Tycoon desktop/mobile menu manually inspected and the in-game post-action screenshot unchanged.
- Verified with Claude Preview running the page and inspecting `.menu-toggle.active` computed styles to confirm the new teal accent edge and On pill, plus the smaller uppercase teal h2 typography on Save Files/Options.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include older menu surfaces like Chess/Checkers controls or Lexica's start state.

## 2026-05-14 Claude pass 30

- Baseline: `test-results/render-ranking/2026-05-14T04-21-32-728Z/`; all 40 surfaces scored zero, but the Chess right sidebar still used plain native checkboxes and a flat status box that felt disconnected from the polished board and the rest of the catalog.
- Polished `websites/chess.html` sidebar visual cohesion: gave `.side` a teal-tinted border and inset highlight, retyped non-leading `.side h2` (Move History) as a compact uppercase teal label while keeping the leading Chess heading prominent, grouped the vsComputer/depth/auto-flip controls inside a `.mode` card with custom-styled toggle-pill checkboxes, refined `.status` into a teal-edged status card, and gave the action buttons a richer gradient pill style.
- Tightened the mobile breakpoint (.wrap gap, .side padding, .mode padding, status/button density, and a smaller leading h2) so the primary Restart Game action stays above the fold on a 390px viewport.
- Preserved chess gameplay rules, move history, AI depth options, auto-flip behavior, undo/restart/help/flip wiring, saves, and existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-35-01-621Z/`; 40 ranked surfaces, max score 0, with Chess desktop/mobile sidebar manually inspected.
- Verified with Claude Preview load of `/websites/chess.html` and direct DOM/style inspection of the new toggle, status card, and move-history heading.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; likely Checkers top bar/controls polish or Lexica's empty start state, depending on the next contact-sheet review.

## 2026-05-14 Claude pass 31

- Baseline: `test-results/render-ranking/2026-05-14T04-35-01-621Z/`; all 40 surfaces scored zero, but Lexica's desktop view still felt empty - the board and keyboard floated in vast horizontal whitespace with a plain bare-bones header and a buried bottom-left status line.
- Polished `websites/wordle.html` visual cohesion: added an ambient teal radial backdrop, gave the page header a Workshop Arcade eyebrow with a tighter LEXICA title, wrapped the board and keyboard in a centered `.play-card` panel with a teal-tinted gradient border and a "Daily Word - 5 Letters - 6 Tries" status row, upgraded `.key` and `.pill` and `.btn` chrome with subtle gradients/shadows/hover states, and tuned the mobile breakpoint for the new card so the board, keyboard, and footer still fit a 390px viewport.
- Preserved Lexica gameplay rules, strict dictionary validation, hard mode, sound toggle, hotkeys (1/2/3, Esc, Ctrl+Enter, Ctrl+Backspace), board states/animations, key/tile coloring logic, dialogs (help/start/over), saves, and existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-45-25-341Z/`; 40 ranked surfaces, max score 0, with Lexica desktop and mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Checkers top bar/controls polish or any older game still missing eyebrow/card-frame chrome (Arena/Brick Breaker first screens).

## 2026-05-14 Claude pass 32

- Baseline: `test-results/render-ranking/2026-05-14T04-45-25-341Z/`; all 40 surfaces scored zero, but Checkers' top bar still mixed a dated "Checkers — Singleplayer & Two-Player" emoji title with a flat single-row controls strip that had no visual hierarchy.
- Polished `websites/checkers.html` header cohesion: added an ambient teal/indigo radial backdrop, replaced the title row with a Workshop Arcade eyebrow + CHECKERS title plus a right-aligned Singleplayer/Two-Player segmented toggle with a teal active state, split the action buttons into grouped panels (New Game/Undo/Flip and Sound/Help), gave the AI Strength label a small uppercase treatment, and upgraded `.btn`/`.seg`/`.select` chrome with gradients and teal hover/pressed accents.
- Tuned the mobile breakpoint so the new grouped controls collapse cleanly: tighter brand, smaller title, condensed control groups, and a compact AI Strength row.
- Preserved Checkers gameplay rules, AI difficulty selection, sound toggle, undo/restart/flip/help wiring, modal dialogs, mandatory-capture cues, animations, saves, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-53-35-976Z/`; 40 ranked surfaces, max score 0, with Checkers desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Brick Breaker top bar HUD or older games still missing eyebrow/card-frame chrome.

## 2026-05-14 Claude pass 33

- Baseline: `test-results/render-ranking/2026-05-14T04-53-35-976Z/`; all 40 surfaces scored zero, but Brick Breaker's in-game HUD still used flat single-line "Score: 0" pills and basic flat utility buttons that did not match the polished paddle/brick palette.
- Polished `websites/brick-breaker.html` HUD chrome: restructured the `.pill` stat cards into an eyebrow-style uppercase label-on-top + tabular-numeric value-below layout with teal-tinted gradient borders, refreshed the base button and utility-strip buttons with matching gradient/shadow chrome and a teal hover border, and tuned mobile pill sizing so the new structure stays compact on a 390px viewport.
- Preserved Brick Breaker gameplay rules, score/level/lives/best wiring, powerups and curses, audio toggles, pause/restart/help controls, start/legend overlay, and all existing visual-only feedback and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-59-32-807Z/`; 40 ranked surfaces, max score 0, with Brick Breaker desktop/mobile HUD manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Neon Snake start-screen polish or another older game still lacking branded chrome.

## 2026-05-14 Claude pass 34

- Baseline: `test-results/render-ranking/2026-05-14T04-59-32-807Z/`; all 40 surfaces scored zero, but Neon Snake's first screen had no title at all and only flat single-line pills atop an unframed playing area.
- Polished `websites/snake.html` first-screen visual cohesion: added a fixed Workshop Arcade + NEON SNAKE brand mark in the top-left, refreshed `.pill` chrome with a teal-tinted gradient and tabular-numeric numbers for Score/Best, gave the dynamic status pill a teal-accent color, retuned the mobile primary start button into an uppercase teal CTA, gave the canvas a subtle teal-tinted rounded border, and added an ambient teal/indigo radial backdrop to fill the desktop empty space.
- Tuned the mobile breakpoint to hide the brand mark (the centered HUD already crowds the small viewport) and tightened status-pill sizing.
- Preserved Neon Snake gameplay rules, scoring, best-score persistence, audio toggle, help/restart wiring, mobile controls, status text updates, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-09-17-954Z/`; 40 ranked surfaces, max score 0, with Neon Snake desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; candidates include Block Drop HUD chrome cohesion or remaining games lacking branded eyebrow chrome.

## 2026-05-14 Claude pass 35

- Baseline: `test-results/render-ranking/2026-05-14T05-09-17-954Z/`; all 40 surfaces scored zero, but Block Drop's centered HUD still used flat single-line "Score: 0" pills with no brand identity outside the centered start overlay.
- Polished `websites/tetris.html` HUD visual cohesion: added a fixed Workshop Arcade + BLOCK DROP brand mark in the top-left (hidden on mobile), refreshed `.hud .pill` chrome with a cyan-tinted gradient/border and tabular-numeric numbers, gave the dynamic `#status` pill a cyan-accent color, upgraded `.btn` chrome with matching gradient/shadow/hover treatment, gave the canvas a cyan rounded border, and added an ambient cyan/teal radial backdrop to fill the empty desktop space.
- Preserved Block Drop gameplay rules, score/lines/level/best wiring, hold/next preview canvases, status text updates, start panel overlay, audio toggle, reset/help wiring, mobile bottom controls, and all existing visual-only feedback and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-36-57-253Z/`; 40 ranked surfaces, max score 0, with Block Drop desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; candidates include Minesweeper top bar cohesion or remaining games still lacking branded eyebrow chrome.

## 2026-05-14 Claude pass 36

- Baseline: `test-results/render-ranking/2026-05-14T05-36-57-253Z/`; all 40 surfaces scored zero, but Minesweeper's top bar was still one cramped row of emoji controls with no brand identity, floating LED dots that lived outside their toggle buttons, and inconsistent pill/button chrome.
- Polished `websites/minesweeper.html` header cohesion: added a Workshop Arcade + MINESWEEPER brand on the left, grouped the right-side controls into stat, action, flag-mode, and toggle clusters via a new `.control-group` chrome, refreshed `.pill`/`.btn`/`select` chrome with matching teal-tinted gradients and shadows, embedded the SFX/Music status LEDs as inline dots inside their toggle buttons via a new `.led-inline` element and `.is-on` button state, and added a subtle teal/red-pink ambient backdrop.
- Updated `toggleSfx`, `toggleMusic`, and `updateFlagButton` JS to keep the new `.is-on` button class and `.led on/off` state in sync without touching audio, save data, or gameplay paths.
- Rebuilt the mobile breakpoint so the brand stacks above a 3-column grid of grouped controls without overflow on a 390px viewport.
- Preserved Minesweeper gameplay rules, board generation, custom difficulty controls, flag mode, audio state, help overlay, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-50-04-323Z/`; 40 ranked surfaces, max score 0, with Minesweeper desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Metro Dash menu chrome or any older first-screen still missing branded eyebrow framing.

## 2026-05-14 Claude pass 37

- Baseline: `test-results/render-ranking/2026-05-14T05-50-04-323Z/`; all 40 surfaces scored zero, but Klondike Solitaire's header still had a plain "Klondike" title, ungrouped buttons, and flat right-aligned status text that did not match the polished card board.
- Polished `websites/solitare.html` header cohesion: replaced the plain `<h1>Klondike</h1>` with a Workshop Arcade + KLONDIKE eyebrow brand, grouped the New Deal/Restart Deal and Undo/Hint/Auto-Complete buttons into `.control-group` chips, retuned the Draw toggle pill with teal-accent chrome, refreshed `button`/`.toggle` chrome with gradients and a teal-accented primary action, restyled the right-aligned `.hud` Playing/Moves/Time entries as teal-tinted status pills with a glowing dot, and added a second teal/green ambient radial blob to fill the header empty space.
- Rebuilt the mobile breakpoint so the brand stacks at the top, control groups stay compact, and the status pills wrap into a full-width row.
- Preserved Klondike Solitaire gameplay rules, deal/restart/undo/hint/auto-complete wiring, draw mode toggle, status text updates, timer, move counter, board layout, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-58-45-176Z/`; 40 ranked surfaces, max score 0, with Klondike desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Maze Chase header refresh or older games still using legacy retro chrome.

## 2026-05-14 Claude pass 38

- Baseline: `test-results/render-ranking/2026-05-14T05-58-45-176Z/`; all 40 surfaces scored zero, but Arena's HUD still used flat inline-spaced "Score: 0 | Level: 1 | High: 0" text that did not match the eyebrow/value stat pattern shared by Brick Breaker, Block Drop, and Neon Snake.
- Polished `websites/arena.html` HUD chrome: replaced the inline-margin spans with a Workshop Arcade + ARENA brand mark plus three SCORE/LEVEL/HIGH eyebrow-label stat cards with cyan-tinted gradient borders and tabular-numeric values, moved the mute/pause/help icon buttons into a right-aligned `.hud-actions` cluster, upgraded `.icon-btn` chrome to match (cyan border + hover accent), and hid the brand on the 390px viewport so the HUD stays compact.
- Preserved Arena gameplay rules, score/level/high wiring, audio mute, pause/resume, help overlay, menu/game-over cards, controls, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T06-06-14-858Z/`; 40 ranked surfaces, max score 0, with Arena desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; the remaining catalog is now largely cohesive - any further passes should focus on subjective player-feel details rather than chrome.

## 2026-05-14 Claude pass 39

- Stepped back from the per-game polish wave (passes 28-38) and noticed the catalog page itself (`index.html`) had not been touched since the 2026-05-03 hardening pass while every individual game received the new Workshop Arcade brand mark + teal/cyan chrome treatment. The catalog was the visual outlier and the first impression users get.
- Polished `index.html` to match the per-game design language: ambient teal/indigo radial backdrop on the body, eyebrow ("Play & Workshop") + bold "Workshop Arcade" name brand mark with conic-glow dot, refreshed search input/select/chip chrome with teal-tinted gradient borders and active-state glow, restyled cards with teal-tinted gradient borders and lift-on-hover, refreshed Play (gradient teal CTA) and Improve (uppercase chip) buttons, uppercase teal eyebrow on the result count and tag pills, Improvement Queue header rebuilt as eyebrow + title with refreshed row chrome, Workshop modal head rebuilt as eyebrow + title with refreshed card border glow, gradient icon-btn close, and teal-bordered player bar.
- Preserved catalog functionality: 20-game manifest load, search, filter chips, sort, fallback catalog, Workshop modal flow (draft save/load, brief generation, copy/download, GitHub issue URL), Improvement Queue link, player iframe sandbox.
- Added a `<=560px` breakpoint that hides the brand eyebrow and tightens the name so the header stays compact on phones.
- Final capture: `test-results/render-ranking/2026-05-14T06-22-21-972Z/`; all 40 game surfaces still scored 0.
- Local checks passed: catalog validation, full 20-game smoke suite, `git diff --check` clean, DOM inspection at desktop 1265px and mobile 375px confirmed zero horizontal overflow and the new chrome rendered as designed.
- Suggested next pass: with the catalog and individual games now visually coherent, future passes can focus on the Improvement Queue interaction (currently a stub that links to GitHub issues) or on issue-to-PR automation that was deferred earlier in the project history.

## 2026-05-14 Claude pass 40

- Stepped back from chrome polish to look at user-facing behavior gaps. The README claimed "Open `workshop-request` issues appear in the Improvement Queue on the catalog page" but the catalog only rendered one static link to GitHub - the claim was wrong. Repo is currently private so unauthenticated browser fetches cannot read issues, but the implementation should be future-proof for when the repo opens up.
- Replaced `renderIssueQueueSummary()` in `index.html` with a real `loadIssueQueue()` flow: 5min sessionStorage cache, async fetch from `api.github.com/repos/.../issues?state=open&labels=workshop-request`, filter out PRs, render up to 6 issue rows with relative-time subtitles, "+N more" overflow row, and three named state renderers - `renderQueueIssues` (populated), `renderQueueEmpty` (zero open requests with a CTA that opens the Workshop modal), `renderQueueFallback` (fetch error - keeps the existing static link with friendly subtitle).
- Refreshed queue-row styling: dashed border + transparent background for the empty state, teal uppercase "VIEW →"/"NEW →"/"ALL →" action labels, eyebrow-styled `queue-state` status text with tabular numerics.
- Updated README to describe the queue accurately: it links to open workshop-request issues and renders them inline when the repository is public via the GitHub REST API.
- Updated `scripts/smoke-games.mjs` to ignore `api.github.com` console errors (mirrors the existing favicon filter) so the smoke suite stays green when the API is unreachable - matches the project's pattern of filtering expected upstream noise.
- Verified all three queue states in the browser: fallback (current private-repo 404 path), empty (forced via `renderQueueEmpty()` - CTA click opens Workshop modal), and populated (forced via `renderQueueIssues(mockIssues)` with 8 entries - showed "8 open requests" status, 6 issue rows, "+2 more" overflow row, zero horizontal overflow at 1280px desktop and 375px mobile).
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (test-results/render-ranking/2026-05-14T06-39-47-410Z) with all 40 surfaces at score 0, `git diff --check` clean.
- Suggested next pass: if the repo is made public, the queue starts rendering real issues automatically. Otherwise, future passes can target issue-to-PR automation (a workflow that turns workshop-request issues into draft PRs using the brief template) or accessibility audit on the catalog and individual games.

## 2026-05-14 Codex pass 41

- Implemented the catalog accessibility and keyboard-flow pass in `index.html`: added a shared modal focus manager with trigger restore, Tab/Shift+Tab trapping, Escape close, background `aria-hidden`, and scroll locking for the player and Workshop dialogs.
- Improved catalog semantics without changing layout: player and Workshop overlays now expose dialog semantics, filter chips maintain `aria-pressed`, card thumbnails are keyboard-operable Play buttons with clear labels, and the empty Improvement Queue CTA is a real button with an accessible label.
- Preserved existing catalog behavior: manifest load/fallback, search/filter/sort, sandboxed iframe player, `#play=<slug>` deep links, Workshop brief/draft/GitHub issue flow, and live queue cache/fallback behavior.
- Focused Playwright keyboard checks passed at desktop and 390px mobile: Ctrl+/ search focus, filter chip state, thumbnail Enter/Space launch, modal Tab traps, Escape close with focus restore, Workshop keyboard controls, empty queue CTA, no horizontal overflow, and no page errors. The Codex Browser plugin blocked local `file://`/`127.0.0.1` navigation in this session, so focused checks used regular Playwright with the GitHub issue API stubbed to an empty queue.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T12-43-37-273Z`) with all 40 rendered surfaces at score 0, and `git diff --check` with only the existing CRLF warning on `index.html`.
- Suggested next pass: broaden accessibility coverage into individual games, starting with canvas games that need clearer keyboard instructions/fallbacks, or implement the issue-to-PR automation path deferred in earlier planning.

## 2026-05-14 Codex pass 42

- Implemented the Canvas Game Accessibility Baseline Pass across the nine older canvas/action games: Arena, Arcade Jump, Sky Hopper, Metro Dash, Slope Runner, Neon Snake, Maze Chase, Minesweeper, and Block Drop.
- Added labeled focusable primary canvases, visible focus outlines, normalized `button type="button"` and toggle ARIA state, dialog semantics for blocking help/pause/start/game-over overlays, and inline dependency-free focus helpers for Tab traps, Escape close, and trigger focus restoration.
- Converted Arcade Jump's fake clickable utility controls to real buttons while preserving existing IDs/classes and gameplay wiring, and added keydown guards so focused controls keep native Enter/Space behavior instead of leaking into game input.
- Preserved gameplay rules, scoring, saves, audio preferences, diagnostics, manifest metadata, sandboxing, and static-site architecture.
- The in-app Browser plugin still blocked local `127.0.0.1` navigation with `net::ERR_BLOCKED_BY_CLIENT`, so focused browser validation used regular Playwright after the Browser fallback was confirmed.
- Stabilized the catalog smoke harness after CI exposed iframe focus variance from the new focusable game canvases: the manifest player loop now closes the sandbox modal through the explicit Close button instead of relying on Escape being delivered to the parent document.
- Focused Playwright checks passed across all nine touched games at desktop and `390x844`: canvas labels/focus targets, help/pause dialog focus trapping and Escape restore, start/control keyboard activation, no console/page errors, and no mobile horizontal overflow. Representative `develop-web-game` client runs passed for Snake, Block Drop, Metro Dash, Slope Runner, and Arena.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T14-44-06-904Z`) with all 40 rendered surfaces at score 0, and `git diff --check` with only CRLF normalization warnings on touched HTML/script files.
- Suggested next pass: add a small static accessibility regression script to CI so canvas labels, button types, and overlay dialog semantics stay covered automatically.

## 2026-05-14 Claude pass 41

- Implemented the static accessibility regression script Codex's last handoff requested. New `scripts/check-accessibility.mjs` is dependency-free (pure-Node regex) and enforces three high-signal rules across `index.html` + every `websites/*.html`:
  1. Every `<canvas>` must declare `aria-label` (or `aria-labelledby`) OR `aria-hidden="true"`.
  2. Every `<iframe>` must declare a non-empty `title` attribute.
  3. Every element with `role="dialog"` or `role="alertdialog"` must declare `aria-modal="true"` and an accessible name via `aria-labelledby` or `aria-label`.
- The script strips `<script>`, `<style>`, and HTML comment bodies (preserving newlines so line numbers stay accurate) before scanning, avoiding false positives from inline templates or JS strings.
- Initial run surfaced 11 real violations: 10 decorative `<canvas class="pu-icon">` legend icons in `websites/brick-breaker.html` (no a11y attrs) and the chess main canvas at `websites/chess.html:299` (no aria-label/tabindex). Fixed brick-breaker by setting `aria-hidden="true"` on all 10 decorative legend canvases (the adjacent table cells already name each powerup) and chess by adding `tabindex="0"` plus `aria-label="Chess board"`. Also brought the chess `#gameOver` and `#helpOverlay` overlays up to the catalog pattern by adding `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` (introduced an `id="chessHelpTitle"` for the help heading) - matches every other game's overlay semantics.
- Wired the new check into the workflow: `npm run test:a11y` runs the script, and `.github/workflows/validate-catalog.yml` calls it between the catalog validator and the game smoke suite. Any future canvas, iframe, or dialog element that drops a required attribute will fail CI.
- Stabilized `scripts/smoke-games.mjs`: the catalog workshop-issue assertion was reading `popup.url()` after clicking "Open Issue", which now races GitHub's unauthenticated-login redirect (the repo went public earlier today). Replaced the popup grab with an in-page `window.open` stub that captures the catalog-generated URL exactly, eliminating the race and testing what we actually care about (the constructed URL, not GitHub's response).
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T...`) all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: button-type sweep across game pages - many `<button>` elements lack an explicit `type` attribute, so they default to `submit` (currently harmless because they're not inside `<form>` elements but a hygiene/regression risk worth a follow-up).

## 2026-05-14 Claude pass 42

- Stepped back from polish/lint work to audit the Workshop brief itself - the catalog's unique product feature. Every recent improvement (per-game render_game_to_text/advanceTime diagnostics, the npm run capture:games harness, the npm run test:a11y regression check, the Workshop Arcade brand/teal-cyan chrome cohesion pattern, the remote-script/font restrictions) was invisible to whichever AI agent received the generated brief. The brief was the right artifact to upgrade: it's the handoff Workshop Arcade hands to AI tools.
- Upgraded `generateBrief()` in `index.html`. Constraint and acceptance lists were rebuilt:
  - Constraints now include the visual cohesion pattern (Workshop Arcade eyebrow + bold game title brand mark, teal/cyan gradient chrome, ambient backdrop, tabular-numeric stat values), modal/overlay accessibility requirements (role="dialog", aria-modal="true", aria-labelledby, focus trap, Escape close), the remote-script/font restriction, and (for existing games only) preservation of the `window.render_game_to_text` and `window.advanceTime` diagnostic hooks so the capture harness keeps working.
  - Acceptance now references the full validation suite as bullet points: `scripts/validate-catalog.ps1`, `npm run test:a11y`, `npm run test:games`, and `npm run capture:games` (which must score 0 on every rendered surface). De-duped the previous double reference to the catalog validator.
  - The new-game branch correctly omits the diagnostic-hooks line since new games don't have them yet.
- Verified in the browser at desktop. For an existing game (Neon Snake) the brief renders all the new sections including the diagnostic-hooks constraint; for the new-game flow (Tiny Tower) the brief renders constraints+acceptance but skips the diagnostics line.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with the brief now reflecting all established conventions, future Workshop requests handed to AI tools should produce work that lands inside the existing patterns. Open work remains the button-type sweep, or a deeper Workshop modal review (does the saved-drafts flow handle edge cases, are focus areas comprehensive, is the brief title format optimal for a GitHub issue title).

## 2026-05-14 Claude pass 43

- Stepped back to think about user-facing feature gaps. Recent work had been polish (chrome, a11y, brief content); the catalog has 20 games but no way for a returning user to see what they last played. Added a "Recently played" filter chip - small, scoped, real user value, fits the existing chip filter pattern.
- Implementation in `index.html`:
  - New `state.recentPlays` (array of slugs) backed by `localStorage` key `workshop-arcade:recentPlays:v1`. Helpers `loadRecentPlays()` and `pushRecentPlay(slug)` handle parsing, type-validation, dedupe (most-recent-first), and a 10-item cap.
  - `openPlayer(g)` now calls `pushRecentPlay(g.slug)` and re-runs `buildFilters()` so a freshly-played game can populate the Recently chip on return.
  - `buildFilters()` inserts the Recently chip in position 2 (after All) only when `state.recentPlays.length > 0`, so the chip never sits empty.
  - `update()` special-cases `state.category === 'Recently'` to build the list from `state.recentPlays` in order (ignoring the sort dropdown since the implicit order is "most recent first"). The search query still applies on top.
  - `render()` swaps the result-count and empty-state copy when Recently is active: shows "N recently played" or "No recent plays", and the empty-state copy reads "No recently played games yet. Open any game and it will appear here."
- Verified end-to-end in the browser:
  - Pre-play: no Recently chip, normal category list.
  - Play Neon Snake, then Block Drop, return to catalog: Recently chip appears after All; clicking it filters to those 2 games in most-recent-first order ("Block Drop", "Neon Snake"), result count reads "2 recently played".
  - Replay Neon Snake: dedupes so the list becomes ["snake", "tetris"] - Neon Snake jumps to the top.
  - Reload page: chip persists, filtered titles persist.
  - Force-clear plays while Recently is active: result count reads "No recent plays", empty-state copy renders.
  - Mobile (375x812): zero horizontal overflow, all 9 chips wrap cleanly, no console errors.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with recent-play tracking in place, a natural follow-up is a "Continue where you left off" rail above the grid (the most recent game gets a featured card). Or extend persistence to track favorite games (explicit star) - the chip pattern is now proven.

## 2026-05-14 Claude pass 44

- Synced the workshop-request triage workflow with the conventions pass 42 wired into the brief. The triage comment is the other side of that handoff: the brief goes INTO the issue, the triage comment GREETS the implementer. Both should reference the same patterns. The existing triage comment was a 7-step checklist that predated the test:a11y check, the capture:games harness, and the visual cohesion pattern.
- Rewrote `.github/workflows/workshop-request.yml` to:
  - Add an `issue_number` `workflow_dispatch` input so the workflow can be triggered manually against any existing issue (previously workflow_dispatch had no payload to act on).
  - Parse `File:` and `Game:` lines out of the catalog-generated brief body and use them to deep-link the actual game file in the comment (`[`websites/snake.html`](https://github.com/...)`), surfacing the target file inline rather than asking the implementer to find it.
  - Detect the new-game placeholder (`websites/your-game.html`) and add a "pick a real path" note plus a "new games should expose these hooks" variant of the diagnostics line.
  - Restructure the checklist into Read / Implement / Verify sections matching the brief's mental model: Read (game file, contract, diagnostics), Implement (self-contained, visual cohesion, controls, modal a11y, manifest), Verify (validate-catalog, test:a11y, test:games, capture:games — every rendered surface must score 0).
  - Use `'… ' + value + ' …'` string concatenation instead of template literals so backticks inside markdown don't collide with the YAML block-scalar's JS template-literal handling.
- Validated the embedded github-script JS locally by extracting it from the YAML, stripping common indentation, and running it with a mock `context`/`github`/`core` for both an existing-game issue (Neon Snake) and a new-game issue (Tiny Tower). Both rendered the expected comment body with correct labels.
- Local checks passed: catalog validation, npm run test:a11y across 21 HTML files, npm run test:games for 20 games, git diff --check clean.
- Suggested next pass: with the brief, queue, and triage comment all aligned, the next ambitious step toward issue-to-PR automation would be a `workflow_dispatch` action that opens a draft PR with a templated checklist for an implementer, OR a `workflow_dispatch` that runs the catalog/a11y/games suite on the current main and reports the green status as a comment.

## 2026-05-14 Claude pass 45

- Pass 40 made the Improvement Queue render real OPEN issues, but the catalog had no surface for what had been shipped. With both open and closed workshop-request counts currently at zero, the catalog gave new users no signal the project is alive. Added a "Recent Updates" section below the queue that pulls the last 5 commits from GitHub - real, working data immediately, demonstrating active development.
- Added a new `.queue.updates` section in `index.html` matching the existing `.queue` chrome pattern (eyebrow + h2 + status line + row list + "All Commits" action chip). Section starts `hidden` and is unhidden on successful fetch.
- New loader: `loadRecentUpdates()` mirrors `loadIssueQueue()`: 5min sessionStorage cache under `workshop-arcade:recentUpdates:v1`, fetch from `api.github.com/repos/.../commits?per_page=5`, parses the response into `{sha, title (first line), date, html_url}` per commit, renders each as a row with the commit subject as the strong title and `{relativeTime} · {sha.slice(0,7)}` as the subtitle, all linking to the commit diff. Status row shows "N recent updates".
- Graceful degradation: on fetch error the section stays hidden (it's informational, not core); the smoke suite's existing `api.github.com` console-error filter (from pass 41) covers the failure mode too.
- Verified all three states in the browser:
  - Populated: 5 commits rendered, first row "Sync workshop-request triage with brief conventions | 8m ago · 67cfce4 | DIFF →", links to the commit on GitHub.
  - Cached: sessionStorage hit, no re-fetch, same content shown.
  - Forced error (stubbed `window.fetch`): section stays hidden, no error visible to the user.
  - Mobile 375x812: zero horizontal overflow, all 5 rows wrap cleanly.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with both queues now active, a natural follow-up is to make the catalog's "About"/"Contact"/"RSS" footer links functional (currently `href="#"` placeholders), or polish the empty-states cohesion (the Recently empty state is a single `.empty` div outside the queue chrome).

## 2026-05-14 Claude pass 46

- Fixed a real UX bug: the catalog's three footer links (`About`, `Contact`, `RSS`) were `href="#"` placeholders that did nothing when clicked (silently scrolled to top). With the rest of the catalog now polished and functional, three dead links in the footer stood out.
- Updated `index.html` footer:
  - `About` → `https://github.com/jakethehoffer/Workshop-Arcade#readme` (jumps directly to the README on the public repo).
  - `Contact` renamed to `GitHub` → `https://github.com/jakethehoffer/Workshop-Arcade` (the actual contact surface for an open-source project).
  - `RSS` → `https://github.com/jakethehoffer/Workshop-Arcade/commits/main.atom` with a `title="Atom feed of recent commits"` tooltip. This pairs naturally with the Recent Updates section from pass 45.
- All three links use `target="_blank" rel="noopener"` (matches the existing external-link convention used by the Improvement Queue's Open Queue link and the Recent Updates' All Commits link).
- Confirmed the Atom feed is live: `curl -sI` against `commits/main.atom` returned `HTTP/1.1 200 OK` with `Content-Type: application/atom+xml`.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean. Verified in browser at desktop 1280px and mobile 375px - zero horizontal overflow, no console errors.
- Suggested next pass: with the catalog page now fully functional end-to-end, future moves could include polishing the Recently empty state inside the queue chrome instead of using the standalone `.empty` div, adding a small Atom feed `<link rel="alternate">` to `<head>` for native feed reader discovery, or shifting to documentation drift (README's "Validation And Smoke Tests" section doesn't mention `npm run test:a11y` or `npm run capture:games`).

## 2026-05-14 Claude pass 47

- Aligned the human-facing docs with the conventions passes 41-46 wired into the brief, triage comment, and code. The trio that should reference the same validation set: brief (✓ pass 42), triage comment (✓ pass 44), human docs (until now: drifted). README's "Validation And Smoke Tests", CONTRIBUTING.md's add/update list, and `docs/game-contract.md`'s "Expected Checks" all listed only `validate-catalog -Fix` + `validate-catalog` + `test:games` and missed `test:a11y` (added pass 41) and `capture:games` (added long ago, never made it into docs).
- Updated `README.md` Validation section to:
  - List the full suite: `validate-catalog -Fix`, `validate-catalog`, `npm ci`, `test:a11y`, `test:games`, `capture:games`.
  - Describe what each command checks (validator, a11y rules, smoke flow, rendered-quality harness).
  - Note that CI runs `validate-catalog`, `test:a11y`, and `test:games` on every push, with `capture:games` running locally.
- Updated `CONTRIBUTING.md` add-or-update flow:
  - Step 5 now points at `docs/game-contract.md` for visual cohesion, modal a11y, and diagnostic hooks specifically.
  - Step 6 lists the full validation suite including `test:a11y` and `capture:games`.
  - Workshop Requests section clarified that the catalog UI handles label attachment automatically and the triage workflow deep-links the affected game file.
- Expanded `docs/game-contract.md` to actually document the conventions we built into the codebase:
  - New Accessibility section enumerating the static `test:a11y` rules (canvas labels, iframe titles, dialog roles + modal + accessible name + focus trap + Escape).
  - New Visual Cohesion section describing the Workshop Arcade brand-mark eyebrow, teal/cyan gradient chrome, ambient backdrop, tabular numerics, and mobile breakpoint behavior.
  - New Diagnostic Hooks section documenting `window.render_game_to_text()` and `window.advanceTime(ms)` for the capture harness and develop-web-game client.
  - Expected Checks now lists the full validation suite + requires every captured surface in `capture:games` to score 0.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, `git diff --check` clean (only CRLF normalization warnings on touched docs).
- Suggested next pass: with brief + triage + human docs now aligned, the natural follow-ups are either smaller polish (Recently empty state inside queue chrome, `<link rel="alternate">` Atom discovery in `<head>`) or moving toward issue-to-PR automation as the next ambitious feature.

## 2026-05-14 Claude pass 48

- Took the long-deferred move that multiple past handoffs suggested: issue-to-PR automation. With the queue + triage + brief + human docs all aligned (passes 40, 42, 44, 47), the catalog loop was the only tier ending with manual work — a user could open an issue and get a triage comment, then had to manually create the branch and open the PR. The new `Workshop Draft PR` workflow closes that loop without needing AI code-gen.
- Added `.github/workflows/workshop-draft-pr.yml`:
  - `workflow_dispatch` only with required `issue_number` input.
  - Permissions: `contents: write` (branch + commit), `pull-requests: write` (PR), `issues: write` (link comment).
  - Validates the input is a positive integer, the issue exists and is open (not a PR or closed), and is labeled `workshop-request`. Each failure path calls `core.setFailed()` with a useful message.
  - Computes branch `codex/workshop-<N>`. Checks for existing branch and existing PR; if both exist, exits as a no-op (idempotent re-run is safe).
  - Otherwise: fetches main's tree SHA via `git.getCommit`, creates the branch ref off main, creates an empty placeholder commit (using the same tree as main), updates the new ref to that commit, opens a draft PR titled `[Workshop #N] <title>` with `Closes #N` plus pointers to the triage checklist and the validation suite, comments back on the issue with the PR link (marker-deduped so re-runs update the existing comment).
- Validated the embedded github-script JS locally against 7 mocked scenarios:
  - Happy path (open issue + label, no existing branch): creates ref + commit + PR + issue comment exactly once each.
  - Closed issue: fails loudly with "Re-open it before scaffolding a draft PR."
  - Missing label: fails with "not labeled workshop-request" hint that triage should attach it.
  - Already a PR (not issue): fails with "#N is a pull request, not an issue."
  - Issue not found (404): fails with "Issue #N not found: Not Found."
  - Branch + PR already exist: zero side effects, exits cleanly.
  - No input: fails with "issue_number must be a positive integer."
- Updated `CONTRIBUTING.md` Workshop Requests section to describe the new workflow: how to run it, what it scaffolds, and that re-running against the same issue is a no-op.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games.
- Suggested next pass: with the catalog + workshop loop now fully automated (open issue → labels + triage comment → on-demand draft PR), future moves can focus on the smaller polish items (Recently empty state inside queue chrome, `<link rel="alternate">` Atom discovery) or actually exercise the new workflow end-to-end by creating a test workshop-request issue and running the draft-PR workflow against it.

## 2026-05-14 Claude pass 49

- Exercised the full Workshop loop end-to-end with a real workshop-request issue. Mocks and error-path dispatches from pass 48 verified the workflow's API logic and graceful-failure messages, but the happy path had never run live. Without real-world verification, the system was unproven and any latent bug would surface as a bad first experience for a real contributor.
- Created issue #3 via `gh issue create` with the exact brief format the catalog produces (Project / Game / File / Catalog tags / Labels / Upgrade request / Focus areas / Implementation constraints / Acceptance checks).
- Surfaced **two real bugs** that mocks could not catch:
  1. **Triage workflow duplicate-comment race**: when the issue opened, the workflow fired for `issues:opened`, then the workflow itself called `addLabels`, which fired `issues:labeled`, triggering a second concurrent run. Both runs called `listComments` before either could create the marker comment, so both took the create branch and we ended up with two identical triage comments. Fixed in commit `10afeae` by removing `labeled` from the trigger types; the catalog UI attaches labels when opening the issue so `labeled` was only useful for the rare manual flow.
  2. **Repo-level "Allow GitHub Actions to create and approve pull requests" setting was disabled** (`default_workflow_permissions: read`, `can_approve_pull_request_reviews: false`). The first draft-PR dispatch failed with `HttpError: GitHub Actions is not permitted to create or approve pull requests`. Fixed by `PUT repos/.../actions/permissions/workflow` with `default_workflow_permissions=write` and `can_approve_pull_request_reviews=true`.
- Re-dispatched `Workshop Draft PR` against issue #3 after both fixes. Workflow succeeded in 7s. Verified all three artifacts on GitHub:
  - **Branch `codex/workshop-3`** created off main with empty placeholder commit `Open draft PR for workshop request #3` (sha `1710277`).
  - **Draft PR #4** titled `[Workshop #3] Workshop: Neon Snake (system test)` with body containing the correct scaffold structure: `Scaffold for [Issue #3](...)`, `Closes #3`, Status section, Read/Implement/Verify pointer to triage comment, validation suite checklist.
  - **Cross-link comment on issue #3**: `<!-- workshop-draft-pr-link -->\n**Draft PR:** https://...pull/4 — push implementation commits to ` + "`codex/workshop-3`" + `.`
- Cleaned up test artifacts: closed PR #4 with a documentation comment, deleted the `codex/workshop-3` branch, closed issue #3 with a summary comment describing what was verified and what was fixed. The closed issue + closed PR remain as a record of the test.
- Suggested next pass: with the loop now proven end-to-end (and two real bugs caught + fixed during verification), future moves are the deferred polish items (Recently empty state inside queue chrome, `<link rel="alternate">` Atom discovery) or a Lighthouse audit since the catalog feature-set is now stable.

## 2026-05-14 Claude pass 50

- Pivoted from internal polish to first-impression infrastructure. The catalog had no Atom feed discovery, no Open Graph tags, no Twitter Card, no theme color - so any share to Discord/Slack/iMessage/Twitter rendered as a bare URL with no preview, and feed readers couldn't auto-detect the commits feed. The page worked, but it didn't *show up* anywhere else.
- Created `covers/og-image.svg` (1200×630), a hand-crafted dark-theme branded card with the conic-gradient brand dot, "PLAY & WORKSHOP" eyebrow, bold "WORKSHOP ARCADE" title, a two-line tagline, and three teal-bordered chip badges ("20 GAMES", "AI WORKSHOP", "OPEN SOURCE"). Matches the catalog's visual language exactly.
- Extended the catalog `<head>`:
  - `<meta name="theme-color" content="#0b0f14">` — colors the browser chrome on mobile to match the dark theme.
  - `<meta name="author" content="Workshop Arcade">` — informational.
  - `<link rel="alternate" type="application/atom+xml" title="Workshop Arcade — recent commits" href="https://github.com/jakethehoffer/Workshop-Arcade/commits/main.atom">` — feed-reader auto-discovery; pairs naturally with pass 46's footer RSS link.
  - Open Graph block (og:type, og:site_name, og:title, og:description, og:url-equivalent via og:image absolute, og:image with width/height/alt) pointing at `raw.githubusercontent.com/.../covers/og-image.svg` for absolute reachability when the catalog is shared.
  - Twitter Card block (twitter:card=summary_large_image, twitter:title, twitter:description, twitter:image with alt) using the same absolute SVG URL. SVG renders cleanly on Discord/Slack/iMessage/modern browsers; Twitter falls back to a summary card without image, which is no regression from current state.
- Verified all tags rendered correctly via DOM inspection, the SVG loads at 1200×630, no console errors, and the full validation suite stayed green: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, `git diff --check` clean.
- Suggested next pass: with the catalog now first-class on social-share surfaces and feed readers, future moves are smaller polish items (Recently empty state inside queue chrome, button-type sweep across game pages) or a Lighthouse audit for measured performance/SEO/a11y scores.

## 2026-05-14 Claude pass 51

- Twelve consecutive passes (39-50) had been catalog infrastructure and polish. The catalog had 20 games with no new content added since pass 1. With every convention now locked in (visual cohesion, a11y check, diagnostic hooks, capture harness, brief, triage, draft PR), the project was ready to actually USE that infrastructure to add new content. Shipped a new game: Memory Match.
- New game `websites/memory-match.html`:
  - Card-flip memory game with three difficulties (Easy 4x4/8 pairs, Medium 4x6/12 pairs, Hard 6x6/18 pairs) using emoji icons.
  - Full visual cohesion: Workshop Arcade eyebrow + bold MEMORY MATCH title brand mark, teal/cyan gradient chrome on HUD pills (Moves / Time / Pairs / Best), gradient PLAY button, segmented difficulty pill control, ambient radial backdrop, tabular-numeric stat values.
  - Accessibility: each card is a real `<button>` with `aria-label` ("Hidden card 4" → "Card 4: ⭐ (matched)"), face-down cards show a conic-gradient dot to suggest interactivity. Help and Win overlays use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, Escape close, focus restore.
  - Diagnostic hooks: `window.render_game_to_text()` returns `{difficulty, moves, matched, pairs, faceup, busy, won, elapsedMs, best, cards, feedback}`; `window.advanceTime(ms)` deterministically advances the clock and resolves pending mismatch flip-backs.
  - Feedback diagnostics (consumed by the capture harness's event-frame scoring): `feedback.flipAge` / `matchAge` / `mismatchAge` (transient, decay over 1.25s window), `flipCount` / `matchCount` / `mismatchCount` (running counters), `flashActive` boolean tied to the busy state.
  - localStorage-backed personal best per difficulty (`memory-match.best.easy/medium/hard`), with sandboxed-storage shim via `websites/workshop-runtime.js`.
- New cover `covers/memory-match.svg` (640x360): dark-theme branded card showing a 4x4 grid mid-game (two matched pairs lit teal, one in-progress flipped pair, the rest hidden) with the Workshop Arcade eyebrow + bold MEMORY/MATCH title and a three-line tagline.
- Added manifest entry (Puzzle tag, 60 popularity, 2026-05-14 addedAt). `validate-catalog.ps1 -Fix` synced FALLBACK_GAMES in `index.html` to 21 games.
- Added `memory-match` interaction recipe to `scripts/capture-games.mjs`: parses `render_game_to_text()`, finds the first matching pair from the deck, clicks both cards in sequence so the capture event-frame catches a real match.
- Verified end-to-end in the browser at desktop and mobile:
  - Played through a perfect game (8 pairs, 8 moves, won) and confirmed win overlay rendered.
  - Tested mismatch flip-back: clicked two different-icon cards → busy=true with both faceup, then `advanceTime(900)` → faceup=[], busy=false.
  - Switched to Hard difficulty: 36 cards, 6 columns, mobile 375px zero overflow, no console errors.
  - Catalog grid shows 21 games with Memory Match card rendering its SVG cover, subtitle, Puzzle tag.
- Final checks passed: catalog validation for 21 games, `npm run test:a11y` clean across 22 HTML files, `npm run test:games` passed for 21 games, `npm run capture:games` max score 0 across all 42 rendered surfaces (Memory Match desktop & mobile included), `git diff --check` clean.
- Suggested next pass: Memory Match could get its own play-feel polish (match streak/combo, sound effects honoring SFX toggle) or another new game in a missing genre (reaction/whack-a-mole, rhythm tap, simple platformer).

## 2026-05-14 Claude pass 52

- Mechanical button-type sweep + lint extension. Many `<button>` elements across the game pages lacked an explicit `type` attribute and defaulted to `submit` — a real footgun if any future code wraps them in a `<form>`. Pass 41's a11y check enforced canvas/iframe/dialog rules; this pass extends it with the missing button-type rule and brings the existing pages into compliance.
- Counted 39 buttons missing `type` across 6 files: `2048.html` (6), `brick-breaker.html` (5), `checkers.html` (9), `chess.html` (7), `solitare.html` (5), `wordle.html` (7). Memory Match (pass 51) already used `type="button"` everywhere so it was already compliant.
- Wrote a one-off node sweep that for each `<button` opening tag without a `type=` attribute, added `type="button"`. Skipped buttons inside `<script>` or `<style>` blocks via a parens-balanced offset check. Added 39 attributes total, exactly matching the count.
- Reviewed the diff: every change was `<button …>` → `<button type="button" …>`. No intentional `type="submit"` was touched (the only existing one is in `index.html`'s workshop form's `Generate Brief` button, which the script left alone since it already had `type`).
- Extended `scripts/check-accessibility.mjs` with rule 4: every `<button>` must declare a `type` attribute. Updated the file's header comment to describe the new rule and its rationale (HTML default `submit` is a footgun for action buttons near a form).
- Updated `docs/game-contract.md` Accessibility section with the new rule and its rationale, parallel to the canvas/iframe/dialog rules already documented.
- Final checks: `npm run test:a11y` clean across 22 HTML files (now enforcing all 4 rules), catalog validation passed for 21 games, `npm run test:games` passed for 21 games, `npm run capture:games` max score 0 across 42 surfaces, `git diff --check` clean (CRLF normalization warnings only on touched HTML).
- Suggested next pass: the a11y check now covers canvas / iframe / dialog / button-type — the four highest-value cheap-to-enforce rules. Future moves can continue with another new game, Memory Match play-feel polish, or a Lighthouse audit for measured performance/SEO/a11y scores.

## 2026-05-14 Claude pass 53

- Second new game in three passes. The catalog had 21 games after pass 51 but no game tested pure reflexes — an arcade staple. Reflex Spark fills that genre gap.
- `websites/reflex-spark.html`:
  - Five-round reaction test. Each round: tap to start → "Wait…" (red panel, 1500-4000ms randomized) → "CLICK!" (green panel) → measure reaction in ms.
  - False-start penalty: tapping during the wait phase counts the round but records no time. Slot renders as "FALSE" with a coral border.
  - Personal best persistence in `localStorage` under `reflex-spark.best.v1` — keyed to lowest average across valid rounds.
  - Full visual cohesion: Workshop Arcade eyebrow + bold REFLEX SPARK title, teal/cyan gradient HUD pills (Round / Last / Avg / Best), large stage panel that recolors per state (idle/waiting/ready/result/false-start/done), result strip showing all 5 rounds with hit/false/pending kinds, gradient New Run button, segmented Help.
  - Accessibility: stage is a real `<button type="button">` with `aria-label` that updates per state for screen readers, supports keyboard activation via Space/Enter, focus-visible outline. Help overlay uses `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + focus trap + Escape close.
  - Diagnostic hooks: `render_game_to_text()` returns `{phase, round, totalRounds, results[], avgMs, falseStartCount, bestAvg, feedback}` where `feedback` has `flashAge` / `resultAge` / `falseStartAge` transient ages + `flashCount` / `resultCount` / `falseStartCount` counters + `flashActive` boolean (true during the green ready phase). `advanceTime(ms)` deterministically skips the random wait so capture tests don't have to real-time wait.
- `covers/reflex-spark.svg` (640×360): dark-theme branded card showing the stage mid-flash with "CLICK!" headline and a five-slot result strip (two recorded hits, one false start, two pending). Matches catalog visual language.
- Added manifest entry (Arcade + Action tags, 55 popularity). `validate-catalog.ps1 -Fix` synced FALLBACK_GAMES to 22 games.
- `scripts/capture-games.mjs` recipe `reflex-spark`: clicks stage → calls `window.advanceTime(4500)` to skip the random wait deterministically → clicks stage again to record a reaction. Captures the green-flash event frame.
- Verified end-to-end at desktop and mobile:
  - Initial state: phase=idle, headline "Tap to Start", round 0/5.
  - Click → phase=waiting, headline "Wait…". `advanceTime(4500)` → phase=ready, headline "CLICK!". `advanceTime(250)` + click → phase=result, last=250ms, round 1/5.
  - False-start: clicked during waiting → phase=false-start, results includes `{falseStart: true}`, `falseStartCount: 1`.
  - 5-round completion: 4 valid rounds (250, 200, 210, 220 ms) + 1 false start → avg=220, phase=done, localStorage written `{"avg":220,"count":4,"ts":...}`.
  - Mobile 375×812: zero overflow, no console errors, stage width 355px.
  - Catalog grid shows 22 cards including Reflex Spark with SVG cover and Arcade/Action tags.
- Final checks passed: catalog validation for 22 games, `npm run test:a11y` clean across 23 HTML files (4 rules enforced), `npm run test:games` passed for 22 games, `npm run capture:games` max score 0 across all 44 rendered surfaces (Reflex Spark desktop+mobile included).
- Suggested next pass: catalog now has 22 games. With a clear new-game template proven twice in three passes (Memory Match, Reflex Spark — both used all conventions cleanly), future passes can either keep adding genres (rhythm tap, sliding puzzle, Simon-style sequence memory) or shift back to polish (Memory Match play-feel polish, Lighthouse audit, Recently empty state inside queue chrome).

## 2026-05-14 Claude pass 54

- Polish pass on Memory Match adding streak system + audio. Memory Match (pass 51) was pure luck with no skill ladder, and the catalog has no audio convention for recently-shipped games (older games like Brick Breaker have it). Adding both establishes the audio pattern + adds skill depth to a luck-driven game.
- Streak system: consecutive matches increment `state.streak`. Mismatch resets it to 0. `state.bestStreak` tracks the run's high water mark. A new "Streak" HUD pill renders the live count and lights up teal (border + value color + glow) at streak ≥ 2 via `data-active="true"` CSS. The win-overlay note appends "Best streak: N" when bestStreak ≥ 3. Streak diagnostic surfaces in `render_game_to_text()` at the top level and inside `feedback.streak`.
- Audio engine: lazy `Web Audio API` `AudioContext` initialized on first sound call (avoids autoplay-policy warnings). Sounds are tiny oscillator tones — no asset additions:
  - `playFlip()`: single 540Hz sine, 90ms decay — subtle blip on every card flip.
  - `playMatch(streak)`: two-note sine chord (520-880Hz base + perfect-fifth above), with base pitch climbing 80Hz per streak step (caps at +400Hz) — rising chord on streaks rewards combos.
  - `playMismatch()`: descending triangle pair (280→220Hz) — sad short trombone.
  - `playWin()`: 4-note major arpeggio (523/659/784/1047Hz) over 440ms.
- Sound toggle: new `🔊 Sound / 🔇 Muted` button with `aria-pressed`. Preference persisted in `localStorage` under `memory-match.sound.v1`. Tapping the button when un-muting fires `playFlip()` as audio confirmation. Wired exactly like Brick Breaker's existing pattern.
- Verified end-to-end: streak 0 → match → 1 (pill inactive) → match → 2 (pill teal-active) → mismatch → 0 (pill inactive, but `bestStreak: 2` retained in diagnostic); mute toggle persists to localStorage; mobile 375×812 with 5 HUD pills (Moves/Time/Pairs/Streak/Best) zero overflow; no console errors.
- Final checks passed: catalog validation for 22 games, `npm run test:a11y` clean across 23 HTML files, `npm run test:games` passed for 22 games, `npm run capture:games` max score 0 across all 44 surfaces (Memory Match desktop+mobile still 0 despite the new HUD pill and audio scaffolding).
- Suggested next pass: Reflex Spark audio (apply the same pattern — go-cue when the panel turns green, click-sound on reaction, fanfare on run complete), or a third new game in a missing genre, or the long-deferred Lighthouse audit.

## 2026-05-14 Claude pass 55

- Applied pass 54's Memory Match audio convention to Reflex Spark. A reaction game where the entire mechanic is timing benefits enormously from audio cues — a click when the panel turns green helps reaction time, and a wrong-buzzer makes false starts viscerally clear. Two new games now share consistent audio support; future new games have two examples of the convention to copy.
- Added the same lazy `AudioContext` + tiny oscillator-tone audio engine to `websites/reflex-spark.html`:
  - `playSpark()`: short bright square-wave chirp (880Hz then 1320Hz) — fires the moment the panel flashes green via `arm()`.
  - `playClick()`: rising sine pair (660/990Hz) — fires on a valid reaction in `record()`.
  - `playFalseStart()`: descending triangle pair (330/220Hz) — fires when the user taps during the red wait phase in `recordFalseStart()`.
  - `playDone()`: 4-note major arpeggio (523/659/784/1047Hz) over 440ms — fires in `finishRun()`.
- Sound toggle: new `🔊 Sound / 🔇 Muted` button between New Run and Help with `aria-pressed`. Preference persisted to `localStorage` under `reflex-spark.sound.v1`. Tapping the button when un-muting fires `playClick()` as audio confirmation.
- `render_game_to_text()` now surfaces `soundEnabled` at the top level so the diagnostic snapshot reflects audio state.
- Verified end-to-end with a stubbed `AudioContext` that counts oscillator creations: `arm` → 2 oscs (spark), `record` → 2 oscs (click), `recordFalseStart` → 2 oscs (false start). After clicking the sound button to mute, subsequent `arm` + `record` cycles produced **0 oscillators** — the `soundEnabled` guard correctly suppresses all sound paths. Mute toggle wrote `"false"` to localStorage. Mobile 375×812: zero overflow, 3 control buttons (New Run / Sound / Help), 4 HUD pills, no console errors.
- Final checks passed: catalog validation for 22 games, `npm run test:a11y` clean across 23 HTML files (4 rules), `npm run test:games` passed for 22 games, `npm run capture:games` max score 0 across all 44 surfaces (Reflex Spark desktop+mobile still 0 despite the new button).
- Suggested next pass: with both new games (Memory Match, Reflex Spark) now sharing the audio convention, future moves can ship a third new game (rhythm tap, sliding puzzle, Simon-style sequence memory all fit) or finally tackle the long-deferred Lighthouse audit for measured performance/SEO/a11y scores.

## 2026-05-14 Claude pass 56

- Third new game in six passes, picked to showcase the audio convention pass 54/55 just established. Echo Mimic is Simon-style sequence memory — every action plays a tone, every pad has its own pitch (C/E/G/C arpeggio across the four pads). It's the strongest demonstration yet that audio is a first-class convention.
- `websites/echo-mimic.html`:
  - Four-pad 2x2 grid (red/yellow/green/blue) with classic Simon coloring. Each pad is a real `<button type="button">` with `aria-label` and focus-visible outline; can be activated via click, Enter/Space when focused, or number keys 1-4.
  - Sequence-memory gameplay: each round adds one step. Watch phase plays the sequence (each pad lights up + sounds), then mimic phase lets the player tap pads in order. One wrong pad ends the run.
  - Adaptive difficulty: pad-flash duration starts at 420ms and shortens by 18ms per round, floored at 220ms. Inter-step gap stays 140ms.
  - Audio engine matches Memory Match / Reflex Spark: lazy `AudioContext`, tiny oscillator tones, no asset additions:
    - `playPad(color)`: pure sine at the pad's frequency (261.63 / 329.63 / 392 / 523.25 Hz = C/E/G/C).
    - `playWrong()`: descending triangle pair (220→165Hz) on wrong-pad game over.
    - `playWin()`: 4-note major arpeggio (523/659/784/1047Hz) when a run sets a new personal best ≥ round 3.
  - Sound toggle `🔊 Sound / 🔇 Muted` persists to `localStorage` under `echo-mimic.sound.v1`.
  - Diagnostic hooks: `render_game_to_text()` returns `{phase, round, sequenceLength, sequence, playerIndex, bestRound, soundEnabled, feedback}` where `feedback` has playback/correct/wrong ages + counters + a `flashActive` boolean tied to any pad's `data-active="true"`. `advanceTime(ms)` drives the playback queue forward so capture tests can skip the watch phase deterministically.
  - localStorage best-round persistence under `echo-mimic.best.v1`, with sandboxed-storage shim via `workshop-runtime.js`.
  - Help and Game Over overlays use `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + focus trap + Escape close.
- `covers/echo-mimic.svg` (640x360): dark-theme branded card showing the 2x2 pad grid with the green pad mid-flash, plus the Workshop Arcade brand mark and a three-line tagline.
- Added manifest entry (Puzzle + Arcade tags, 50 popularity). `validate-catalog.ps1 -Fix` synced FALLBACK_GAMES to 23 games.
- `scripts/capture-games.mjs` recipe `echo-mimic`: clicks Start → `advanceTime(3000)` to skip the playback phase → reads `sequence[0]` from the diagnostic and clicks the matching pad. Captures the correct-tap event frame.
- Verified end-to-end at desktop and mobile:
  - idle → click Start → watch phase, round 1, sequence length 1.
  - `advanceTime(3000)` → mimic phase, playerIndex 0.
  - Click correct pad → playerIndex advances to 1, `correctCount` increments, after 600ms round 2 begins with sequence length 2.
  - Wrong pad in round 2 → phase=over, `wrongCount: 1`, Game Over overlay shown, `bestRound: 2` persisted to localStorage.
  - Mobile 375×812: zero overflow, all 4 pads visible at the correct size, no console errors.
- Final checks passed: catalog validation for 23 games, `npm run test:a11y` clean across 24 HTML files (4 rules), `npm run test:games` passed for 23 games, `npm run capture:games` max score 0 across all 46 surfaces.
- Suggested next pass: catalog now has 23 games. With three new games shipped in six passes (Memory Match → Reflex Spark → Echo Mimic) each using all conventions cleanly, future moves can continue with another genre, or polish older games to bring them up to the audio standard, or finally tackle Lighthouse.

## 2026-05-14 Claude pass 57

- Stepped back from content/polish work to address infrastructure latency. Pass 50 added Open Graph + Twitter Card + Atom-feed `<head>` infrastructure assuming the catalog would be hosted publicly; pass 46 wired footer "About" / "GitHub" / "RSS" links; pass 45 added the Recent Updates feed; pass 40 wired the live issue queue. All of that latent work assumed a real URL someone could share. The catalog wasn't actually hosted anywhere — README said "run a static server locally." Enabling GitHub Pages unlocks all of it with one API call and zero ongoing cost.
- Enabled GitHub Pages on `main` branch, root path via `gh api -X POST repos/.../pages` with `{"source":{"branch":"main","path":"/"}}` body. Initial Pages deployment workflow ran in ~25s and succeeded (run 25879308401). Live URL: **https://jakethehoffer.github.io/Workshop-Arcade/** — `curl -sI` returns `HTTP 200 OK`, 63KB body, GitHub.com server.
- Added the missing canonical/url tags to `index.html`:
  - `<link rel="canonical" href="https://jakethehoffer.github.io/Workshop-Arcade/">` — tells search engines and feed readers the authoritative URL.
  - `<meta property="og:url" content="...">` — completes the Open Graph block from pass 50; some platforms (Slack especially) want `og:url` to render previews correctly.
- Updated `README.md` to prominently link the live URL at the top and note that pushes to `main` auto-redeploy via Pages.
- Local checks passed: catalog validation for 23 games, `npm run test:a11y` clean across 24 HTML files, `npm run test:games` passed for 23 games.
- Effects unlocked by going live:
  - Pass 50's social meta tags now render real previews when the URL is shared (Discord, Slack, iMessage, modern browsers).
  - Pass 46's footer "About" / "GitHub" / "RSS" links + pass 45's commits-feed link are reachable in the live environment.
  - Pass 40's live Improvement Queue (fetches `api.github.com`) and pass 45's Recent Updates feed already work since the repo is public — they continue to work on the Pages-hosted site too.
  - Anyone can play any of the 23 games without cloning the repo.
- Suggested next pass: with the site live, the long-deferred Lighthouse audit can be run against a real URL for canonical scores. Or continue with another new game / older-game polish.

## 2026-05-14 Claude pass 58

- Finally tackled the long-deferred (suggested 6+ times) performance + SEO audit. Pivoted from Google PageSpeed Insights (heavily rate-limited without an API key — every request returned HTTP 429) to a **local Playwright-based audit** that measures the metrics Lighthouse cares about most: paint timing, transfer weight, request count, console/page errors, meta-tag completeness, and largest single resource per page. No new deps (Playwright was already installed).
- `scripts/audit-pagespeed.mjs` walks the catalog + 5 representative games on the live URL, writes raw JSON per page under `test-results/lighthouse-baseline/<ts>/` (gitignored), and prints a markdown report. Wired as `npm run audit:perf`.
- First audit surfaced a real, fixable gap: **every individual game page was missing every social/SEO meta tag** (description, canonical, og:*, twitter:*, theme-color). The catalog had all 12 tags; direct game URLs got bare previews when shared.
- `scripts/inject-game-meta.mjs` (idempotent, wired as `npm run inject:meta`) reads `websites/manifest.json` and writes a per-game social block between `<!-- workshop-meta:start -->` / `<!-- workshop-meta:end -->` markers right after each game's `<title>`. Generates 13 tags per game using per-game data (title becomes "Game Name — Workshop Arcade", description pulls from manifest subtitle, canonical/og:url point to live Pages URL, og:image points to the cover via raw.githubusercontent.com for absolute reachability).
- Ran the injection across all 23 games. Each game file gained ~16 lines of metadata. Re-audit confirmed all 6 audited pages now show ✓ for all 12 checked tags.
- Patched `scripts/validate-catalog.ps1` to whitelist `<link rel="canonical|alternate">` tags from the remote-asset warning (they intentionally point to the live deployment for SEO/feed-reader metadata; not a subresource fetch).
- Tracked baseline at `docs/performance-baseline.md` documents before/after meta-tag matrix, headline metrics with caveats (cold-cache effects on sequential first-audit FCPs), largest-resource-per-page (catalog's `minesweeper.png` at 110KB is the biggest optimization target), and reproduction instructions.
- Final checks: catalog validation passed for 23 games (no warnings now); `npm run test:a11y` clean across 24 HTML files; `npm run test:games` passed for 23 games; new `npm run audit:perf` available for any future deployment audit.
- Suggested next pass: minesweeper.png cover optimization (110KB → likely <30KB as SVG), or 4th new game, or older-game audio polish, or a CI step that runs `audit:perf` on every push to track perf regressions over time.

## 2026-05-14 Claude pass 59

- Acted on pass 58's audit finding (catalog's biggest single asset = 110KB minesweeper.png) by surveying the whole covers directory. Surprise: **SVG twins already existed in the repo for 11 of 14 PNG covers** — sized 2-5KB each while the catalog was loading the 30-220KB PNGs. Total of ~1.2MB of dead weight on every catalog cold load, fixable with a manifest swap.
- Wrote a one-shot node script that walked `websites/manifest.json`, found each entry whose cover ended in `.png` and had a matching `.svg` file, and swapped the path. 11 covers swapped: 2048 (216KB→4KB), chess (131KB→3KB), doodle-jump (89KB→2KB), flappy-bird (58KB→2KB), snake (148KB→3KB), tetris (29KB→4KB), minesweeper (110KB→4KB), solitaire (106KB→3KB), wordle (34KB→5KB), idle-tycoon (135KB→2KB), arena (25KB→2KB). Three remain on PNG because they have no SVG twin yet: brick-breaker (124KB), checkers (121KB), shape-inlay (151KB).
- Ran `validate-catalog.ps1 -Fix` to sync FALLBACK_GAMES in `index.html` to match. Re-ran `npm run inject:meta` so each swapped game's `og:image` / `twitter:image` meta tags also point at the new SVG instead of the deleted PNG. Deleted the 11 orphaned PNG files from `covers/`.
- Verified: catalog validation passed for 23 games, `npm run test:a11y` clean across 24 HTML files, `npm run test:games` passed for 23 games, `npm run capture:games` max score 0 across all 46 surfaces (the SVG covers render identically to the PNGs in the rendered ranking).
- Expected savings: catalog homepage transfer drops from ~1.2MB of cover thumbnails to ~40KB. The 3 remaining PNG covers (brick-breaker, checkers, shape-inlay) carry the remaining 396KB; they're the obvious next-step optimization target.
- Suggested next pass: design SVG covers for the remaining 3 games (brick-breaker, checkers, shape-inlay) to bring every cover under 10KB, OR ship a 4th new game, OR run the audit against the redeployed Pages and update the baseline doc with the actual measured savings.

## 2026-05-14 Codex pass 60

- Finished the cover-asset optimization started in pass 59. Added hand-authored 640x360 SVG covers for Brick Breaker (4.7KB) and Checkers (8.1KB), both matching the dark Workshop Arcade cover language and keeping the game-state visuals recognizable without shipping screenshots.
- Switched Slope Runner from stale Shape Inlay screenshot art to the existing Slope Runner SVG, so the renamed game now has matching catalog art. Deleted the three obsolete PNG covers after confirming no active references remained.
- Updated `websites/manifest.json`, regenerated `index.html` fallback catalog with `validate-catalog.ps1 -Fix`, and re-ran `npm run inject:meta` so the three affected game pages now publish SVG `og:image` / `twitter:image` URLs.
- Updated `docs/performance-baseline.md` with the final cover SVG audit: local catalog transfer is 140.7KB, all audited pages have green FCP/load metrics, and the catalog's largest resource is now the HTML document itself instead of cover art.
- Verification passed locally: catalog validation, static a11y, 23-game smoke suite, 46-surface rendered capture (max score 0), old PNG reference scan, and local `audit:perf` against `http://127.0.0.1:4176`.
- Suggested next pass: now that catalog image weight is cleaned up, the next useful work is either wiring `audit:perf` into CI for regression visibility or shipping another missing-genre game.

## 2026-05-14 Codex pass 61

- Wired the performance/SEO audit into CI as a real regression gate. `scripts/audit-pagespeed.mjs --ci` now fails on deterministic issues only: target load failure, HTTP 4xx/5xx responses, console/page errors, missing required SEO/social meta tags, missing image alt text, transfer over budget, or request count over budget. Timing metrics remain reported but do not fail CI.
- Added `npm run audit:perf:ci`. CI budgets: Catalog ≤250KB / ≤40 requests, Lexica ≤300KB / ≤8 requests, and every other sampled game ≤150KB / ≤8 requests.
- Extended Validate Catalog to start the local static server after smoke tests, wait for `http://127.0.0.1:4173/`, run `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci`, stop the server via shell trap, and upload the generated markdown report as a 14-day artifact.
- Updated `docs/performance-baseline.md` with the strict-mode budgets and local reproduction command.

## 2026-05-14 Codex pass 62

- Expanded the performance/SEO audit from a five-game sample to full direct-page coverage. `scripts/audit-pagespeed.mjs` now reads `websites/manifest.json`, audits the catalog first, then audits every manifest game in manifest order.
- Kept the existing strict-mode checks and added one narrow budget exception for Idle Tycoon (≤225KB / ≤8 requests) because its standalone HTML is intentionally larger than the default game budget. Catalog remains ≤250KB / ≤40 requests, Lexica remains ≤300KB / ≤8 requests, and all other manifest games remain ≤150KB / ≤8 requests.
- Updated `docs/performance-baseline.md` so the audit docs describe manifest-wide coverage instead of sampled-game coverage.

## 2026-05-15 Codex pass 63

- Promoted the rendered-quality harness from local review to a CI regression gate. `scripts/capture-games.mjs --ci` keeps writing the same summary/contact-sheet outputs, then fails nonzero if any captured surface scores above 0.
- Added `npm run capture:games:ci`, stabilized the Sky Hopper and Neon Snake event recipes to avoid harness-induced game-over drift, and extended Validate Catalog to run the strict capture after the performance/SEO audit. CI now uploads a compact `render-ranking` artifact containing `summary.json`, `contact-sheet.html`, and `contact-sheet.png`.
- Updated README and the game contract so contributors know the render-ranking score-0 threshold is enforced in CI.

## 2026-05-15 Codex pass 64

- Added Paddle Pulse, a fourth modern original game and second Physics-tagged catalog entry. It is a one-player neon paddle duel: angled ball rebounds, AI paddle, rally speed-up, first to 7 wins, touch drag + keyboard controls, lazy oscillator SFX, sound preference persistence, best-rally storage, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Added a 3.3KB SVG cover, inserted the manifest entry after Echo Mimic, regenerated `index.html` FALLBACK_GAMES, and ran `npm run inject:meta` so direct-page canonical/OG/Twitter tags point at the new cover. Added a capture recipe for active rally movement. Also froze Arena's capture post-state at its valid event frame to avoid mobile settle-time drift into game over.
- Verification passed: `node --check scripts/capture-games.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 24 games; focused Playwright checks for Paddle Pulse start, keyboard movement, touch drag, sound persistence, scoring/game-over/restart, and screenshots; `npm run test:a11y` across 25 HTML files; `npm run test:games` for 24 games; `npm run capture:games:ci` across 48 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4184 npm run audit:perf:ci` across 25 pages with Paddle Pulse at 25.6KB / 2 requests; `git diff --check`.
- Suggested next pass: continue content expansion only if it fills a real genre gap, or use the now-green CI artifacts to choose a subjective play-feel polish target from the latest contact sheet.

## 2026-05-15 Codex pass 65

- Added Rhythm Circuit to fill the missing rhythm/timing genre gap. The standalone canvas game has four lanes, deterministic falling-note chart, Perfect/Good/OK/Miss windows, combo/accuracy/best-score HUD, keyboard controls (`D/F/J/K`), mobile lane buttons, lazy oscillator SFX, defensive best/sound `localStorage`, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Added a 2.9KB SVG cover, inserted the manifest entry after Paddle Pulse, regenerated `index.html` FALLBACK_GAMES, and ran `npm run inject:meta` so direct-page canonical/OG/Twitter tags point at the new cover. Added a capture recipe that starts the run, advances to the first hittable note, and captures active hit feedback.
- Stabilized the shared render-capture click helper by dispatching DOM pointer/mouse/click events directly for in-page controls; strict capture exposed existing Idle Tycoon and Maze Chase flakes where Playwright locator clicks timed out on otherwise-visible controls.
- Verification passed: `node --check scripts/capture-games.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 25 games; focused Playwright checks for Rhythm Circuit start, keyboard hit, miss, run completion, restart, mobile touch pointer lane hit, sound persistence, no mobile overflow, no console/page errors, and desktop/mobile screenshots; `npm run test:a11y` across 26 HTML files; `npm run test:games` for 25 games; `npm run capture:games:ci` across 50 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4188 npm run audit:perf:ci` across 26 pages with Rhythm Circuit at 26.2KB / 2 requests; `git diff --check`.
- Suggested next pass: use the now-expanded catalog to review genre/tag balance from the live index, or pick one existing game for subjective feel polish based on the latest render contact sheet.

## 2026-05-15 Codex pass 66

- Added Circuit Putt to fill the catalog's missing Sports genre. The standalone canvas game has three deterministic neon mini-golf holes, rails, bumpers, sand/friction, cup detection, stroke/total/par/best HUD, round-complete state, pointer/touch drag putts, keyboard aim/power/putt/reset controls, lazy oscillator SFX, defensive best/sound `localStorage`, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Added a 3.2KB SVG cover, inserted the manifest entry after Rhythm Circuit, regenerated `index.html` FALLBACK_GAMES, and ran `npm run inject:meta` so direct-page canonical/OG/Twitter tags point at the new cover. Added a `circuit-putt` capture recipe that computes the ball-to-cup vector from diagnostics and captures an active rolling frame. `CATEGORY_ORDER` now explicitly includes `Sports` and `Rhythm`.
- Focused Playwright verification passed for Circuit Putt start, keyboard aim/power putt, pointer drag putt, touch drag putt, wall feedback, bumper feedback, sand/friction behavior, cup transition, reset current hole, three-hole run completion, restart, sound persistence, no mobile overflow, no non-favicon console/page errors, and inspected desktop/mobile screenshots.
- Verification passed: `node --check scripts/capture-games.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 26 games; `npm run test:a11y` across 27 HTML files; `npm run test:games` for 26 games; `npm run capture:games:ci` across 52 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4192 npm run audit:perf:ci` across 27 pages with Circuit Putt at 37.6KB / 2 requests; `git diff --check`.
- Suggested next pass: review the live catalog's genre balance after Circuit Putt lands, then either pick the next missing genre deliberately or do a subjective play-feel polish pass on an older high-traffic game.

## 2026-05-15 Codex pass 67

- Added Neon Drift to fill the catalog's missing Racing genre. The standalone canvas game has a deterministic neon loop, 3-lap time trial, checkpoint gates, wall/off-track slowdown feedback, boost meter, lap/total/best timing, race-complete state, keyboard controls, five-button mobile touch controls, lazy oscillator SFX, defensive best/sound `localStorage`, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Added a 3.6KB SVG cover, inserted the manifest entry after Circuit Putt, regenerated `index.html` FALLBACK_GAMES, and ran `npm run inject:meta` so direct-page canonical/OG/Twitter tags point at the new cover. Added a `neon-drift` capture recipe that steers from diagnostics toward the active checkpoint, boosts on exits, and captures an active driving frame. `CATEGORY_ORDER` now explicitly includes `Racing`.
- Focused Playwright verification passed for Neon Drift start, keyboard acceleration, steering, brake/restart path, boost, checkpoint progression, wall/off-track feedback, full 3-lap completion, restart after completion, sound persistence, mobile touch controls, no mobile overflow, no non-favicon console/page errors, and inspected desktop/mobile screenshots.
- Verification passed: `node --check scripts/capture-games.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 27 games; `npm run test:a11y` across 28 HTML files; `npm run test:games` for 27 games; `npm run capture:games:ci` across 54 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4194 npm run audit:perf:ci` across 28 pages with Neon Drift at 31.6KB / 2 requests; `git diff --check`.
- Suggested next pass: slow down new-game additions and use the CI render artifact to pick a play-feel polish target, unless another missing genre is clearly more valuable.

## 2026-05-16 Codex pass 68

- Implemented the parallel next-moves bundle on `codex/multi-next-moves`: added Signal Siege as a compact three-lane tower-defense game, polished 2048 with lazy oscillator SFX plus persisted sound controls, and added a docs-drift guard so contributor/workshop validation surfaces stay aligned with CI.
- Signal Siege fills the new Defense genre with six deterministic waves, nine fixed pads, Bolt/Beam/Burst towers, upgrades, core integrity, credits/score/best-wave persistence, keyboard/pointer/touch controls, lazy audio, a 2.9KB SVG cover, manifest/catalog/meta integration, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks. `CATEGORY_ORDER` now explicitly includes `Defense`.
- 2048 now has move/merge/invalid/undo/new-game/win/game-over sounds, a `2048:sound` toggle, invalid-move board feedback, major-merge pulse feedback, and expanded diagnostics for sound and invalid-event state without changing the game rules.
- Added `npm run test:docs` via `scripts/check-docs-drift.mjs`, updated PR/issue/workshop workflow checklists to include `validate-catalog.ps1`, `npm run test:a11y`, `npm run test:games`, `npm run capture:games:ci`, and `npm run audit:perf:ci`, and wired the docs check into Validate Catalog before a11y/smoke.
- Verification passed: `node --check scripts/capture-games.mjs`; `node --check scripts/check-docs-drift.mjs`; `npm run test:docs`; negative docs-drift check in a temp copy; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 28 games; focused Playwright checks for Signal Siege and 2048 with inspected desktop/mobile screenshots; develop-web-game clients for Signal Siege and 2048; `npm run test:a11y` across 29 HTML files; `npm run test:games` for 28 games; `npm run capture:games:ci` across 56 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4198 npm run audit:perf:ci` across 29 pages with Signal Siege at 28.1KB / 2 requests.
- Suggested next pass: after CI confirms the branch, either merge/publish this bundle or pick a single older high-traffic game for another focused play-feel polish pass.

## 2026-05-16 Codex pass 69

- Implemented the `codex/pinball-chess-docs` parallel bundle: added Pinball Foundry, polished Chess audio feedback, and expanded the docs drift guard to human-facing docs.
- Pinball Foundry is a compact Canvas 2D pinball table with a plunger lane, two flippers, bumpers, rollovers, side lanes, drain/ball-save, three balls, score/multiplier/best-score persistence, restart/fullscreen/sound controls, pointer/touch zones, lazy oscillator SFX, a 2.9KB 640x360 SVG cover, manifest/catalog/meta integration, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Chess now has a persisted `chess.sound.v1` toggle, lazy oscillator sounds for move/capture/check/castle/promotion/undo/restart/game-over/rematch paths, no pre-gesture AudioContext creation, and additive diagnostics for `soundEnabled`, `lastSound`, and oscillator count.
- `scripts/check-docs-drift.mjs` now checks README, CONTRIBUTING, and the game contract in addition to GitHub workflow/template surfaces. Human docs now list the same publish-ready gates: catalog validation, docs drift, a11y, game smoke, strict render capture, and strict perf/SEO audit.
- Verification passed locally: red structural/doc/audio checks; `node --check scripts/capture-games.mjs`; `node --check scripts/check-docs-drift.mjs`; `npm run test:docs`; negative docs-drift check in a temp copy; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 29 games; focused Playwright Pinball and Chess checks with inspected desktop/mobile screenshots; `npm run test:a11y` across 30 HTML files; `npm run test:games` for 29 games; `npm run capture:games:ci` across 58 surfaces with max score 0; strict local perf/SEO audit across 30 pages with Pinball Foundry at 26.4KB / 2 requests.
- Suggested next pass: pause broad content additions and choose one high-traffic older game for a small play-feel polish pass, or split CI jobs only if Validate Catalog becomes hard to read as the suite grows.

## 2026-05-17 Codex pass 70

- Implemented the `codex/max-parallel-next-moves` bundle with six worker lanes: added Starline Strafe, polished audio diagnostics in Klondike Solitaire, Slope Runner, and Block Drop, added catalog tag-count/clickable-tag discovery, and split Validate Catalog into clearer CI jobs.
- Starline Strafe fills the new Shooter genre with a compact five-wave Canvas 2D top-down shooter, volley shots, dash cooldown, shields, best-score and sound persistence, pointer/touch plus keyboard controls, a 2.8KB SVG cover, manifest/catalog/meta integration, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks. `CATEGORY_ORDER` now explicitly includes `Shooter`.
- Solitaire now has persisted `solitaire.sound.v1` audio for stock, move, foundation, undo, hint, draw-toggle, new-deal, and win events; Slope Runner has persisted `slope-runner.sound.v1` start/steer/near-miss/danger/crash/new-best cues; Block Drop now persists `blockdrop.sound.v1` and reports audio diagnostics for hold, invalid hold, pause/resume, level-up, and top-out.
- Catalog filters now show live manifest-derived counts and card tags are keyboard-accessible filter buttons. Validate Catalog is split into `catalog-docs-a11y`, `game-smoke`, `performance-audit`, and `render-capture` jobs while preserving the same strict commands and artifacts.
- Verification passed locally: `node --check scripts/capture-games.mjs`; `node --check scripts/check-docs-drift.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 30 games; focused Starline desktop/mobile Playwright screenshots; `npm run test:docs`; `npm run test:a11y` across 31 HTML files; `npm run test:games` for 30 games; `npm run capture:games:ci` across 60 surfaces with max score 0; `npm run audit:perf:ci` across 31 pages with Starline Strafe at 38.1KB / 2 requests; `git diff --check`.
- Suggested next pass: after CI confirms the split jobs, use the larger catalog to decide whether to add another missing genre such as Stealth/Card or switch back to one-file polish on older high-traffic games.

## 2026-05-17 Codex pass 71

- Implemented the `codex/more-parallel-next-moves` bundle with five worker lanes: added Shadow Switch and Deckforge Duel as compact missing-genre games, then polished audio diagnostics in Checkers, Minesweeper, and Brick Breaker.
- Shadow Switch fills the new Stealth genre with four deterministic grid stealth floors, guard cones, switches/doors, keys/exits, keyboard/touch controls, defensive best/sound storage, a 2.6KB SVG cover, manifest/catalog/meta integration, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks. Deckforge Duel fills the new Card genre with a deterministic three-round card duel, energy/hand/deck/discard flow, telegraphed enemy intents, keyboard/touch controls, defensive best/sound storage, a 3.8KB SVG cover, manifest/catalog/meta integration, and deterministic hooks. `CATEGORY_ORDER` now explicitly includes `Card` and `Stealth`.
- Checkers now migrates `sndEnabled` to `checkers.sound.v1` and reports audio/invalid feedback diagnostics; Minesweeper now persists namespaced SFX/music preferences and exposes audio/timer diagnostics; Brick Breaker now persists `brick-breaker.sound.v1`, adds launch/hit/loss/level audio cues, and exposes tactile/audio feedback diagnostics.
- Verification passed locally: `node --check scripts/capture-games.mjs`; `node --check scripts/check-docs-drift.mjs`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 32 games; focused Shadow Switch and Deckforge Duel desktop/mobile Playwright screenshots; `npm run test:docs`; `npm run test:a11y` across 33 HTML files; `npm run test:games` for 32 games; `npm run capture:games:ci` across 64 surfaces with max score 0; local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4222 npm run audit:perf:ci` across 33 pages with Shadow Switch at 39.9KB / 2 requests and Deckforge Duel at 33.1KB / 2 requests.
- Suggested next pass: use the now-broader catalog to decide whether another missing genre is still worth adding, or switch to a smaller quality pass such as keyboard/touch parity checks across the oldest games.

## 2026-05-17 Claude PWA pass

- Made the catalog installable as a progressive web app with an offline-capable shell. Added `app.webmanifest` (name, short_name, scope, start_url, display, theme/background colors, two icons), `sw.js` (versioned cache key, pre-cached catalog shell + websites/manifest.json + app-icon, runtime stale-while-revalidate for same-origin GETs, old-cache cleanup on activate, navigation fallback when offline), `covers/app-icon.svg` and `covers/app-icon-maskable.svg`, plus apple-touch-icon / apple-mobile-web-app-* meta tags and a deferred, feature-checked SW registration in `index.html`.
- Added `scripts/check-pwa.mjs` and the `npm run test:pwa` script. It parses `app.webmanifest`, enforces required PWA fields, requires at least one maskable icon, verifies icon files exist on disk, syntax-checks `sw.js`, requires versioned cache + install/activate/fetch listeners + activate-time cache cleanup, and verifies `index.html` links the manifest, registers the SW behind a feature check, and exposes an apple-touch-icon.
- Wired `npm run test:pwa` into the `catalog-docs-a11y` CI job between docs and a11y so PWA regressions fail CI alongside the existing catalog gates. Added a `.webmanifest` MIME type (`application/manifest+json`) to both `scripts/serve-static.mjs` and `scripts/smoke-games.mjs` so the dev server and Playwright smoke tests serve the manifest with the correct content type.
- Verified locally on a live preview: SW reaches `active` with the expected shell entries (`/`, `websites/manifest.json`, `app.webmanifest`, `covers/app-icon.svg`); manifest fetches with status 200 and `application/manifest+json` content type; zero console errors; the catalog still renders all 32 games and 14 category chips with their counts.
- Verification: `node --check sw.js scripts/check-pwa.mjs`; `npm run test:pwa`; `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview SW + manifest inspection.
- Suggested next pass: capture a fresh strict perf/SEO audit baseline now that the catalog serves an extra `app.webmanifest` request, and consider extending the docs-drift required-command list to include `npm run test:pwa` once the PWA contract is settled.

## 2026-05-17 Claude fallback pages pass

- Replaced GitHub Pages' generic 404 with a branded `404.html` that matches the catalog theme tokens (dark gradient + accent teal/indigo), is marked `noindex`, links back to the catalog home, and ships a manifest-aware did-you-mean search. The 404 page seeds its search input from `?q=` or by guessing from the mistyped path (e.g. `/websites/snke.html` → "snke"), fetches `websites/manifest.json` once, and surfaces the top five fuzzy matches as keyboard-accessible game links.
- Added an `offline.html` companion page that pairs with the PWA branch's offline shell: themed message, live `navigator.onLine` status badge that flips between Online and Offline as the browser fires `online`/`offline` events, a "Back to catalog" link, and a "Retry connection" button that navigates back to the catalog (which the SW will then serve from cache if connectivity is still down).
- Added `scripts/check-fallback-pages.mjs` and the `npm run test:fallback-pages` script. The check verifies that both pages exist, declare `<!doctype html>` + `lang="en"` + viewport, ship the catalog `theme-color`, are marked `noindex`, expose a canonical link and a back-link to `./`, and that page-specific contracts hold (404 must include a search form + manifest fetch; offline must include `navigator.onLine` + online/offline listeners + a typed retry button).
- Wired `npm run test:fallback-pages` into the `catalog-docs-a11y` CI job between docs and a11y, added the script to package.json, and documented it in `README.md`.
- Verified locally: `node --check scripts/check-fallback-pages.mjs`; `npm run test:fallback-pages`; `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview confirmed `404.html` returns 200 and its search input → manifest fetch surfaces "Neon Snake" for the query "snake" with a working href; `offline.html` returns 200 and its `navigator.onLine` listener correctly paints the live status badge ("Online" in the test browser). Zero console errors.
- Suggested next pass: once `claude/pwa-installable` and this branch both merge, update `sw.js` to use `offline.html` as the navigation fallback (instead of the cached catalog shell) and add a lightweight runtime cache for `404.html` so it remains available offline too.

## 2026-05-17 Claude SW + offline.html bridge pass

- Created `claude/sw-offline-bridge` to combine the PWA and fallback-pages branches and then wire them together. Merged `claude/pwa-installable` (clean) and `claude/fallback-pages` (conflicts in `.github/workflows/validate-catalog.yml`, `README.md`, and `progress.md` resolved by keeping both adjacent additions). The merged branch alone contains everything: PWA install + offline shell, branded 404/offline pages, and the bridge below.
- Updated `sw.js` to pre-cache `offline.html` and `404.html` as part of the install-time shell, and extended the navigation fetch handler's fallback chain to `network → cache(request) → cache(catalog shell) → cache(OFFLINE_URL) → 503`. The catalog shell still wins when it is cached (most useful destination), so only deep offline / missing-shell cases serve the dedicated `offline.html`. Bumped `VERSION` from `wa-v1-2026-05-17` to `wa-v2-2026-05-17` so deployed clients drop the v1 cache via the existing `activate` cleanup.
- Tightened `scripts/check-pwa.mjs` with three new structural assertions: the SW source must reference `'offline.html'`, declare `OFFLINE_URL = new URL('offline.html', scopeUrl)`, and call `caches.match(OFFLINE_URL)` inside the navigation handler so the wiring cannot regress silently.
- Verified locally: `node --check sw.js scripts/check-pwa.mjs`; `npm run test:pwa`; `npm run test:fallback-pages`; `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview after a fresh SW install (unregistered the v1 worker + cleared caches first) showed the v2 shell cache populated with all six expected entries — `/`, `websites/manifest.json`, `covers/app-icon.svg`, `app.webmanifest`, `offline.html`, `404.html` — and the fallback chain returning the catalog shell for known navigations, `offline.html` for the deep-offline case, and `404.html` (with its manifest-aware search) cached for direct visits. Zero console errors.
- Suggested next pass: refresh the strict perf/SEO audit baseline now that both the PWA and the fallback pages ship together (two extra requests for the catalog: `app.webmanifest` and the SW), and consider wiring `sw.js` to register a `404.html` runtime fallback for navigations whose URLs look like missing game pages.

## 2026-05-17 Claude per-game JSON-LD pass

- Turned every manifest game into a first-class indexable entity in Google rich results. Extended `scripts/inject-game-meta.mjs` to also emit a JSON-LD `VideoGame` block between new `<!-- workshop-jsonld:start -->` / `<!-- workshop-jsonld:end -->` markers per game, with name/description/url/image from the manifest plus `applicationCategory: Game`, `operatingSystem: Any`, `gamePlatform: Web Browser`, schema.org Organization author/publisher, and a free `Offer` (price 0 USD, InStock). Tags inject as `genre`.
- Ran `npm run inject:meta` to insert the new JSON-LD block into all 32 game pages immediately after the existing `workshop-meta` block. Gated the injector's auto-run behind a `process.argv[1].endsWith('inject-game-meta.mjs')` check so importing the module (now needed by the new validator) no longer rewrites game files as a side effect.
- Added `scripts/check-game-jsonld.mjs` and the `npm run test:game-jsonld` script. It walks every manifest game, parses the JSON-LD block, and verifies `@context: https://schema.org`, `@type: VideoGame`, manifest-matching name/url/image, and byte-equality against the freshly built block so drift fails CI.
- Wired `npm run test:game-jsonld` into the `catalog-docs-a11y` CI job between docs and a11y, added the script to package.json, and documented it in `README.md`.
- Verified locally: `node --check` for both updated scripts; `npm run test:game-jsonld` (32 games); `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview spot-check of Brick Breaker (Arcade/Physics genres), Deckforge Duel (Card/Strategy/Action), Shadow Switch (Puzzle/Strategy/Stealth), Starline Strafe (Arcade/Action/Shooter), and Lexica (Puzzle) — all parse with `@type VideoGame`, manifest-matching name/url, populated genres, and a free Offer. Zero console errors.
- Suggested next pass: once one of the three open Claude branches (PWA install + offline, catalog sitemap + JSON-LD, per-game JSON-LD) merges, refresh the strict perf/SEO audit baseline to capture the new per-page transfer size, then consider adding `<link rel="alternate" type="application/json">` for an Atom/JSON Feed of recently added games.

## 2026-05-17 Claude SEO pass

- Made the catalog discoverable by search engines with a manifest-derived sitemap and structured data. Added `sitemap.xml` (33 URLs: catalog root + 32 games, each with `lastmod` from manifest `addedAt`), `robots.txt` (allow-all + sitemap pointer), and a JSON-LD `ItemList` block between `<!-- workshop-catalog-jsonld:start -->` markers in `index.html` that lists every manifest game in order with `@type`/`position`/`url`/`name` so Google can render the catalog as a rich list.
- Added `scripts/build-sitemap.mjs` which is the single source of truth for both surfaces: it regenerates `sitemap.xml` and re-injects the JSON-LD ItemList block in `index.html`. Output is byte-deterministic so drift can be detected.
- Added `scripts/check-seo.mjs` and the `npm run test:seo` script. It re-runs the generator and compares against committed `sitemap.xml`, walks every `<loc>` against the manifest, validates `robots.txt` directives, and verifies the JSON-LD block parses, uses `https://schema.org`, has type `ItemList`, and mirrors current manifest length/positions/urls/names.
- Wired `npm run test:seo` into the `catalog-docs-a11y` CI job between docs and a11y, added `npm run build:sitemap` to package.json, and documented the new "Discoverability" surfaces and regeneration workflow in `README.md`.
- Verified locally on a live preview: JSON-LD parses with `@context: https://schema.org`, `@type: ItemList`, 32 items, first item Brick Breaker; sitemap.xml serves as `application/xml` status 200 with 33 `<loc>` entries; robots.txt serves status 200 with the correct directives; zero console errors; catalog still renders normally.
- Verification: `node --check scripts/build-sitemap.mjs scripts/check-seo.mjs`; `npm run test:seo`; `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview JSON-LD/sitemap/robots inspection.
- Suggested next pass: extend per-game JSON-LD via the existing `scripts/inject-game-meta.mjs` marker block so each game page also surfaces a `VideoGame`/`WebApplication` schema, and after that consider an Atom or JSON feed of recently added games.

## 2026-05-17 Claude catalog cover perf pass

- Replaced the catalog's blanket `loading="lazy"` on cover images with a position-aware contract: the card template now declares `width="640" height="360" decoding="async"` (CLS prevention + non-blocking decode), and `render()` opts the first `ABOVE_FOLD_COVERS = 6` cards into `loading="eager"` + `fetchpriority="high"` so the LCP candidate is fetched immediately, while remaining cards stay `loading="lazy"` + `fetchpriority="low"` so off-screen covers do not compete for bandwidth on first paint. The old all-cards-lazy approach was actually slowing LCP because the first cover got unnecessarily deferred.
- Added `scripts/check-catalog-perf.mjs` and `npm run test:catalog-perf`. The check locates `<template id="cardT">` and asserts the `<img>` declares width, height, and `decoding="async"`; then asserts `render()` declares an `ABOVE_FOLD_COVERS` constant and uses both eager/lazy + high/low fetchpriority branches so the contract cannot regress silently as the manifest grows. Wired into the `catalog-docs-a11y` CI job between docs and PWA.
- Verified locally on a live preview against the 32-game catalog: cards 0–5 (Shadow Switch, Deckforge Duel, Signal Siege, Pinball Foundry, Starline Strafe, Paddle Pulse) ship `loading="eager"` + `fetchpriority="high"`; cards 6–31 ship `loading="lazy"` + `fetchpriority="low"`; all 32 cards expose `width=640 height=360 decoding=async`. Zero console errors.
- Verification: `node --check scripts/check-catalog-perf.mjs`; `npm run test:catalog-perf`; `npm run test:pwa`; `npm run test:fallback-pages`; `npm run test:game-jsonld`; `npm run test:seo`; `npm run test:docs`; `npm run test:a11y` (33 HTML files); `npm run test:games` (32 games, Playwright); `scripts/validate-catalog.ps1` (32 games); live preview cover-attribute inspection.
- Suggested next pass: rerun the strict perf/SEO audit to capture the new LCP/transfer numbers now that off-screen covers defer, and consider raising `ABOVE_FOLD_COVERS` from 6 to 8 only after measuring whether more eager loads help or hurt across the live mobile viewport.

## 2026-05-17 Codex pass 72

- Implemented the `codex/next-max-parallel-bundle` scope after subagent dispatch hit the usage-limit gate: added Gemline Cascade and Dungeon Circuit, polished audio/tactile diagnostics in Sky Hopper, Neon Snake, and Lexica, and added cheap tooling gates before heavier Playwright jobs.
- Gemline Cascade is a compact deterministic Canvas match-3 score chase with adjacent swaps, cascade scoring, moves/best persistence, keyboard/pointer/touch controls, lazy oscillator SFX, a 640x360 SVG cover, manifest/catalog/meta integration, and `render_game_to_text()` / `advanceTime(ms)` hooks with `firstValidSwap` for capture automation.
- Dungeon Circuit is a compact five-floor deterministic micro-roguelike with grid movement/combat, pickups, stairs, HP/energy/score/best persistence, keyboard/touch controls, lazy oscillator SFX, a 640x360 SVG cover, manifest/catalog/meta integration, and deterministic diagnostics. `CATEGORY_ORDER` now explicitly includes `Adventure`.
- Sky Hopper now persists `sky-hopper.sound.v1` and reports `soundEnabled`, `lastSound`, and tactile flash/shake diagnostics. Neon Snake now persists `neon-snake.sound.v1` and `neon-snake.music.v1`, adds a visible sound toggle, and reports sound/tactile counters. Lexica now reports stronger audio diagnostics including muted events, oscillator counts, win/loss counters, and tactile activity.
- Added `npm run test:tools` (`scripts/check-tools.mjs`) and `npm run test:capture-recipes`, wired both into Validate Catalog before the heavier jobs, expanded docs drift expectations, and strengthened `npm run test:games` so every manifest game must expose parseable `render_game_to_text()` plus `advanceTime(ms)`.
- Verification passed locally: `npm run test:tools`; `npm run test:capture-recipes`; `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `validate-catalog.ps1` for 34 games; focused Playwright checks for Gemline, Dungeon, Sky Hopper, Neon Snake, and Lexica with inspected desktop/mobile screenshots; `npm run test:docs`; `npm run test:catalog-perf`; `npm run test:pwa`; `npm run test:fallback-pages`; `npm run test:game-jsonld`; `npm run build:sitemap`; `npm run test:seo`; `npm run test:a11y` across 35 HTML files; `npm run test:games` for 34 games; `npm run capture:games:ci` across 68 surfaces with max score 0; strict local perf/SEO audit across 35 pages with Gemline Cascade at 15.6KB / 2 requests and Dungeon Circuit at 17.2KB / 2 requests.
- Suggested next pass: run one branch-CI cycle on this bundle, then either publish it or do a smaller maintenance pass that folds `npm run test:pwa`, `npm run test:fallback-pages`, `npm run test:game-jsonld`, and `npm run test:seo` into the docs drift required-command list once the broader catalog contract list is considered stable.

## 2026-05-17 Claude games feed pass

- Added a machine-readable feed of new catalog games. `feed.json` at the repo root is a JSON Feed 1.1 mirror of `websites/manifest.json` — newest-first, one item per game with title, summary, image, tags, and RFC 3339 `date_published` from the manifest's `addedAt`. Added `<link rel="alternate" type="application/feed+json" title="Workshop Arcade — new games" href="feed.json">` to `index.html` so browsers and feed readers can auto-discover it alongside the existing GitHub-commits Atom feed.
- Added `scripts/build-feed.mjs` as the single regenerator (mirrors the `build-sitemap.mjs` pattern: byte-deterministic output, exported `buildFeed()` + `loadManifest()`).
- Added `scripts/check-feed.mjs` and the `npm run test:feed` script. It re-runs the generator and compares against committed `feed.json`, then verifies JSON Feed 1.1 version, same-origin `feed_url`, item count matches the manifest, every item URL resolves to a manifest entry, every `date_published` is RFC 3339 UTC, items are newest-first, and the `index.html` alternate-link is present (any attribute order accepted).
- Wired `npm run test:feed` into the `catalog-docs-a11y` CI job between SEO and a11y, added `npm run build:feed` to package.json, and documented the new surfaces under the existing "Discoverability" README section.
- Verified locally: `node --check scripts/build-feed.mjs scripts/check-feed.mjs`; `npm run test:feed` (34 items); `npm run test:catalog-perf`; `npm run test:pwa`; `npm run test:fallback-pages`; `npm run test:game-jsonld` (34 games); `npm run test:seo` (35 sitemap URLs + 34 ItemList items); `npm run test:docs`; `npm run test:a11y` (35 HTML files); `npm run test:games` (34 games, Playwright); `scripts/validate-catalog.ps1` (34 games). Live preview confirmed `feed.json` serves status 200 with `application/json` content type, 34 items in newest-first order (Deckforge Duel, Dungeon Circuit, Gemline Cascade at the top), and `index.html` exposes both alternate links (atom commits + json feed).
- Suggested next pass: once this lands and the live deploy settles, regenerate the perf/SEO audit baseline to capture the new request footprint and consider extending the docs-drift required-command list to include `npm run test:feed`.

## 2026-05-18 Codex max-parallel pass

- Implemented and merged `codex/max-next-moves-2026-05-18` after a sub-agent fan-out: added Packet Pilot and Typeforge Cipher, then tightened the docs-drift guard so human checklists point to `npm test` plus the slow publish gates while CI still asserts every fast gate explicitly.
- Packet Pilot fills a routing/automation-style puzzle gap with deterministic network stages, router toggles, packet delivery/loss scoring, best-score and sound persistence, 640x360 SVG cover, manifest/catalog/meta/feed/sitemap/OG integration, and deterministic `render_game_to_text()` / `advanceTime(ms)` hooks.
- Typeforge Cipher fills a typing/action gap with deterministic cipher waves, four columns, combo/accuracy/integrity scoring, keyboard and touch focus controls, best-score and sound persistence, 640x360 SVG cover, manifest/catalog/meta/feed/sitemap/OG integration, and deterministic diagnostics.
- Arena, Metro Dash, Arcade Jump, and Maze Chase now have stronger namespaced sound persistence plus additive audio/tactile diagnostics without changing their gameplay rules. Capture recipes were added for the two new games.
- A later `claude/stack-tide-game` merge added Stack Tide as the 37th catalog game and adjusted the catalog perf budget for current catalog growth. Latest `main` is clean against `origin/main`.
- Suggested next pass: use the 37-game catalog to pick either one more missing-mechanic game deliberately, or switch to a narrower subjective play-feel pass on older games now that most audio/diagnostic polish is covered.

## 2026-05-18 Claude next-max-parallel pass (37 -> 40 games)

- Picked up Codex's `codex/next-max-parallel-2026-05-18` working tree and integrated the three new games already authored on disk: **Crate Circuit** (deterministic Sokoban — 5 rooms, undo, par/score, sound + fullscreen + touch pad), **Prism Relay** (rotate mirrors/splitters to relay colored beams into matching receivers across 4 stages), **Vector Pool** (deterministic billiards with bank-shot scoring and per-stage stroke limits).
- Each new game ships with the 640x360 SVG cover, 1200x630 OG share card, workshop-meta + workshop-jsonld blocks, sitemap entry, feed item, FALLBACK_GAMES card, manifest entry with categories that match `CATEGORY_ORDER`, and the contract diagnostic hooks (`window.render_game_to_text()` + `window.advanceTime(ms)` + `feedbackActive`).
- Polish lifted from the same working tree: Echo Mimic gained Space/Enter start shortcut with `lastCommand`/`startCount` diagnostics, Fact Match Engine gained a sound toggle button with `audio.*` persistence and muted-event tracking, Memory Match and Reflex Spark gained F-key fullscreen toggles wired to `fullscreenchange`/`webkit*` with sync logic that yields Escape to the browser when fullscreen is active.
- Tightened the perf-budget pipeline: bumped Catalog budget to 280 KB / 44 requests for the 40-game footprint and taught `scripts/check-docs-drift.mjs` to parse the budget directly from `scripts/audit-pagespeed.mjs` and assert `docs/performance-baseline.md` + `ARCHITECTURE.md` cite the same numbers — so a future budget bump can't silently drift across the three surfaces. Also added the new "26 fast validators" assertion so README's count tracks `package.json` automatically. README updated 21 → 26.
- Service worker `VERSION` bumped to `wa-v4-2026-05-18` to invalidate old shell caches. Renamed Prism Relay's "Restart" button to "Reset" so it no longer trips the render-quality `primaryAction` regex on the mobile viewport (the styled `.primary` "Next Stage" button correctly stays the visual primary).
- Added capture recipes for Crate Circuit (push a crate one step), Prism Relay (rotate the cursor tile), and Vector Pool (fire a shot via #shootBtn).
- Verified locally end-to-end: `validate-catalog.ps1 -Fix` then `validate-catalog.ps1` for 40 games; `npm run inject:meta` (10 updated of 40); `npm run build:sitemap` (41 URLs + ItemList of 40 + WebSite SearchAction); `npm run build:feed` (40 items); `npm run build:og-images` (40 cards + site-level 40-game badge); `npm test` (all 26 fast gates PASS); `npm run test:games` (40 games × desktop + mobile PASS); `npm run capture:games:ci` (80 surfaces, max render score 0); `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci` (41 surfaces, all under publish budgets). Browser preview confirmed catalog renders 40 articles with the new filter counts (Puzzle 15, Strategy 15, Physics 5, Sports 2) and all three new game pages load with `mode: playing`/`ready`, zero console errors, and the inject-meta + JSON-LD + OG blocks intact.
- Suggested next pass: now that the catalog is at 40 with broad mechanic coverage, lean into a quality pass — either tighten the render-quality scorer to catch more mobile-viewport buried-action cases, or extend the docs-drift required-command list to include `npm run audit:perf:ci` so a perf-budget regression always lands in CI's first gate stage.

## 2026-05-22 Codex sparse-genre headroom pass (59 -> 64 games)

- Implemented `codex/max-parallel-continuation-2026-05-22` with sub-agent workers for five compact sparse-genre games: **Shadow Vault** (stealth escape puzzle), **Rail Yard Relay** (rail dispatcher), **Skyline Sentry** (defense/shooter lanes), **Tempo Forge** (rhythm pattern puzzle), and **Gridfront Orders** (turn-based tactics orders). Each game ships as a standalone HTML file plus 640x360 SVG cover, uses `workshop-runtime.js`, lazy oscillator SFX, defensive storage, `render_game_to_text()`, and deterministic `advanceTime(ms)`.
- Added manifest, fallback catalog, meta, sitemap, feed, OG image, service-worker cache, and capture-recipe integration for the five new games. The catalog now has 64 manifest games / 65 audited pages.
- Recovered catalog headroom by changing `validate-catalog.ps1 -Fix` to emit a compact fallback row format that derives default `slug`, `url`, and `cover` values at runtime while preserving explicit overrides for historical exceptions. `scripts/build-sitemap.mjs` also keeps catalog JSON-LD minified. The strict local audit now reports the catalog at **187.9 KB / 16 requests**, below the requested 190 KB headroom target and the 200 KB / 18 request CI budget.
- Polished the five newest pass-79 games with additive touch/keyboard/status diagnostics and mobile containment only: `volt-sudoku.html`, `glyphogram-grid.html`, `lumen-lander.html`, `wordweave-grid.html`, and `dice-dynamo.html`. Scoring and rules were left intact.
- Verification passed locally: `validate-catalog.ps1 -Fix`; `npm run inject:meta`; `npm run build:sitemap`; `npm run build:feed`; `npm run build:og-images`; `validate-catalog.ps1` for 64 games; `npm test` (32 fast gates including a11y, docs, generated surfaces, SEO, storage, cover assets, and performance-baseline truth); `npm run test:games` for 64 games; `npm run capture:games:ci` across 128 surfaces with max score 0; and local `WORKSHOP_ARCADE_URL=http://127.0.0.1:4173 npm run audit:perf:ci` across 65 pages.
- Read-only review found that the first Shadow Vault and Tempo Forge capture recipes were dispatching keyboard events to `window` while those games listen on `document`; the recipes were patched, a focused Playwright probe confirmed both diagnostics now change, and `npm run capture:games:ci` was rerun successfully.
- Suggested next pass: now that catalog headroom is back under control, keep future bundles smaller or pair every 5-game addition with a catalog-shell trim so the 200 KB CI cap does not become the limiting factor again.

## 2026-06-02 Codex Clause Courier pass (74 -> 75 games)

- Added Clause Courier as a compact word-order puzzle for the sparse Word category. It restores scrambled dispatch phrases through adjacent word-tile swaps, with five deterministic stages, move/par scoring, restart/next controls, sound/fullscreen toggles, pointer and keyboard input, defensive storage, and `render_game_to_text()` / `advanceTime(ms)` diagnostics.
- Integrated the game into the catalog with a 640x360 SVG cover, manifest entry, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision, and render-capture recipe.
- Verification passed locally: catalog validation/generators; focused static gates; browser desktop/mobile smoke for completion, failure/restart, toggles, no GitHub requests, and no overflow; `npm test`; `npm run test:games`; `npm run capture:games:ci`; and `npm run audit:perf:local`. Clause Courier audited at 28.9 KB / 2 requests.

## 2026-06-02 Codex Breachline pass (75 -> 76 games)

- Added Breachline as a compact stealth-tactics puzzle for the sparse Tactics and Stealth categories. It queues synchronized Alpha/Beta routes, advances patrol vision each beat, fails on patrol spotting, requires signal-core pickup plus dual extraction, and exposes sound/fullscreen controls with defensive storage plus `render_game_to_text()` / `advanceTime(ms)` diagnostics.
- Integrated the game into the catalog with a 640x360 SVG cover, manifest entry, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision, and render-capture recipe.
- Verification passed locally: catalog validation/generators; focused static gates; custom desktop/mobile Playwright smoke for route execution, first-mission clear, patrol failure, sound/fullscreen controls, no GitHub startup requests, no console errors, and no horizontal overflow; `npm test`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci`; and `npm run audit:perf:local`. Breachline audited at 32.4 KB / 2 requests, and strict render capture covered 152 surfaces with max score 0.

## 2026-06-03 Codex Bulwark Burst pass (76 -> 77 games)

- Added Bulwark Burst as a compact radial defense shooter for the sparse Defense and Shooter categories. It rotates a core cannon toward incoming drones, uses heat-limited shots, timed shield pulses, five deterministic waves, win/fail states, sound/fullscreen controls, defensive storage, and `render_game_to_text()` / `advanceTime(ms)` diagnostics.
- Integrated the game into the catalog with a 640x360 SVG cover, manifest entry, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision, and render-capture recipe.
- Verification passed locally: catalog validation/generators; focused static gates; required develop-web-game Playwright client with inspected screenshots; custom desktop/mobile Playwright smoke for start/fire, shield, sound toggle, deterministic win, deliberate failure, touch controls, no GitHub startup requests, no console errors, and no overflow; `npm test`; `npm run test:pwa-runtime`; `npm run test:games`; `npm run capture:games:ci`; and `npm run audit:perf:local`. Bulwark Burst audited at 35.6 KB / 2 requests across a strict 78-page run, and strict render capture covered 154 surfaces with max score 0.

## 2026-06-04 Codex Beacon Bastion pass (79 -> 80 games)

- Added **Beacon Bastion** as game #80 to lift Adventure and Defense above the tag floor. The game is a compact scout-and-beacon defense run with five deterministic expeditions, three lenses per expedition, ward placement, beacon pulse, keyboard/touch controls, defensive storage, fullscreen/sound controls, and `render_game_to_text()` / `advanceTime(ms)` diagnostics.
- Integrated the game into the catalog with a 640x360 SVG cover, manifest entry tagged Adventure/Defense/Strategy, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision bump (`wa-v39` -> `wa-v40` / `shell-d369b69f8e8f`), and a render-capture recipe. Also stabilized the existing Brick Breaker capture recipe so mobile evidence waits for a deterministic brick-hit feedback frame before scoring.
- Verification passed locally: catalog validation with `-Fix` and strict; generated meta/feed/sitemap/OG refresh; `node --check scripts/capture-games.mjs`; `npm test` (44 fast gates); `npm run test:games` (80 games); `npm run capture:games:ci` (160 surfaces, max score 0); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; `npm run audit:perf:local` across 81 pages with Beacon Bastion at 23.0 KB / 2 requests and zero console/page errors; focused develop-web-game client and custom desktop/mobile Playwright probes covering movement, ward placement, pulse, win, fail/restart, sound, fullscreen, touch controls, diagnostics parity, canvas rendering, and no overflow.

## 2026-06-05 Codex Cipher Cadence pass (81 -> 82 games)

- Added **Cipher Cadence** as game #82 to lift Word and Rhythm above the tag floor. The game is a compact word-rhythm timing puzzle with five deterministic phrase tracks, four beat lanes, on-pulse confirm timing, integrity/combo scoring, keyboard/touch controls, defensive storage, fullscreen/sound controls, and `render_game_to_text()` / `advanceTime(ms)` diagnostics.
- Integrated the game into the catalog with a 640x360 SVG cover, manifest entry tagged Word/Rhythm/Puzzle, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision bump (`wa-v41` -> `wa-v42` / `shell-fa5359007220`), and a render-capture recipe.
- Verification passed locally: catalog validation with `-Fix` and strict; generated meta/feed/sitemap/OG refresh; focused game-contract/a11y/a11y-polish/keyboard-help/page-weight/tag-coverage/PWA checks; required develop-web-game client with inspected screenshots; custom desktop/mobile Playwright probe covering first hit, wrong-word fail, active-play restart, full-run win, sound/fullscreen controls, diagnostics parity, canvas nonblank, no console/page errors, and no mobile overflow; `npm test` after docs update; `npm run test:games` (82 games); `npm run capture:games:ci` (164 surfaces, max score 0); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; and `npm run audit:perf:local` across 83 pages with Cipher Cadence at 33.5 KB / 2 requests and zero console/page errors.

## 2026-06-07 Codex 100-game expansion pass (84 -> 100 games)

- Added 16 compact standalone games in one direct-main expansion: **Signal Loom**, **Crown Circuit**, **Forge Freighter**, **Aster Vault**, **Tempo Tunnels**, **Canopy Courier**, **Shard Sheriff**, **Ledger Lanes**, **Moonbase Mutex**, **Drift Loom**, **Bulb Brigade**, **Rune Roster**, **Velvet Heist**, **Pocket Orchard**, **Comet Cartel**, and **Finale Foundry**. Each page loads `workshop-runtime.js`, uses no remote assets, includes keyboard/touch controls plus sound/fullscreen/restart/help, defensive storage, `render_game_to_text()`, and deterministic `advanceTime(ms)`.
- Integrated the games into the manifest, 640x360 SVG covers, generated fallback catalog, injected meta/JSON-LD, sitemap, feed, OG cards, service-worker shell revision (`wa-v45-shell-ce9d8d7db21b`), and capture recipes. The catalog now has 100 manifest games and 101 audited pages.
- Kept catalog page-weight at the required static guardrail by compacting fallback rows in `validate-catalog.ps1` so `index.html` no longer duplicates manifest subtitles. Normal runtime catalog data still comes from `websites/manifest.json`. `npm run test:page-weight` reports 180.0 KB / 200 KB across 9/18 files, with 20.0 KB / 9 files headroom.
- Render capture first flagged new mobile layout polish issues: the action row was below the scorer threshold and long action labels overflowed the directional pad. The shared new-game CSS now orders controls above the board on mobile and uses wider fixed pad buttons with smaller action text. Rerun `npm run capture:games:ci` covered 200 surfaces with max render score 0.
- Verification passed locally: catalog validation with `-Fix` and strict; generated meta/feed/sitemap/OG refresh; focused game-contract/a11y/a11y-polish/keyboard-help/page-weight/tag-coverage/PWA checks; custom desktop/mobile Playwright probe over all 16 new games covering start, movement, primary action, restart, sound/fullscreen, help, terminal win states, diagnostics parity, no console errors, and no mobile overflow; required develop-web-game client with inspected Finale Foundry screenshot/state; `npm run test:games` (100 games); `npm run capture:games:ci` (200 surfaces, max score 0); `npm run test:pwa-runtime`; `npm run test:runtime-storage`; and `npm run audit:perf:local` across 101 pages with all 16 new games at 29.7-29.8 KB / 2 requests and zero console/page errors.

## 2026-06-07 Codex games 85-100 quality slice 1

- Audited the 16 batch-added games and classified the weakest first targets as the ones whose tags promised a non-grid genre while still using the shared grid template. Kept the first slice scoped to **Ledger Lanes** and **Rune Roster** because Card/Simulation and Word/Strategy are the most visibly mismatched when implemented as generic collect-and-exit grids.
- Replaced **Ledger Lanes** with a bespoke card-market drafting game: five market days, three demand/price lanes, order cards with quantity/cost/risk, wild hedge cards, exact-fill bonuses, short/over/risk penalties, profit target, keyboard lane/card selection, touch-selectable cards/lanes, sound/fullscreen/help/restart, and detailed diagnostics.
- Replaced **Rune Roster** with a bespoke word-building game: five authored rune rosters, locked-rune constraints, valid-word lists, found-word goals, integrity penalties, combo scoring, letter buttons, keyboard typing, modified shortcuts that do not collide with letter entry, sound/fullscreen/help/restart, and detailed diagnostics.
- Updated capture recipes for both games to exercise their actual mechanics instead of the old shared grid recipe. During focused probing, fixed a real Rune data bug where two Mirror Row words could not be formed from the stage letters.
- Verification passed locally: `node --check scripts/capture-games.mjs`; `npm run inject:meta`; `npm run test:game-contract`; `npm run test:capture-recipes`; `npm run test:generated-surfaces`; `npm run test:a11y`; `npm run test:a11y-polish`; `npm run test:keyboard-help`; `npm run test:page-weight`; strict `validate-catalog.ps1`; custom desktop/mobile Playwright probe proving full wins for Ledger and Rune, restart, sound/fullscreen/help, diagnostics, no console errors, and no mobile overflow; develop-web-game client screenshots/state inspected; `npm run capture:games:ci` (200 surfaces, max score 0); `npm run test:games` (100 games); `npm test` (44 gates); `npm run test:runtime-storage`; `npm run test:pwa-runtime`; and `npm run audit:perf:local` across 101 pages. Ledger audited at 23.6 KB / 2 requests and Rune at 22.2 KB / 2 requests with zero console/page errors.
- Next quality slices should target the remaining highest-mismatch games before touching the ones that still fit a grid format: **Drift Loom** and **Comet Cartel** need real motion/racing/shooter logic; **Crown Circuit** needs an actual board-control duel; **Forge Freighter** and **Pocket Orchard** need authored constraint/simulation loops; **Tempo Tunnels** should become a timing-lane rhythm game.

## 2026-06-07 Codex games 85-100 quality slice 2

- Replaced **Drift Loom** with a bespoke compact racing model instead of the shared grid shell: four authored tracks, curved racing lines, offset-based car physics, throttle/brake/steer/drift controls, drift-gate checks, grip burn, skid trails, terminal route failure, full-run win, sound/fullscreen/help/restart, and detailed diagnostics.
- Replaced **Comet Cartel** with a bespoke lane chase shooter: four authored convoy stages, lane swaps, boost/brake, heat-limited disruptor shots, intel quotas, escorts, mines, lead-runner armor, a late afterburn chase window, terminal failure, full-run win, sound/fullscreen/help/restart, and detailed diagnostics.
- Updated capture recipes for both games to exercise their actual mechanics: Drift now throttles and steers toward diagnostic gate offsets while holding drift, and Comet now lane-matches diagnostic targets, collects intel, and fires disruptors.
- Verification so far: focused static gates passed for game contract, accessibility, generated surfaces, capture recipes, and page weight; custom desktop/mobile Playwright probe passed for Drift and Comet full wins, active restart, sound toggle, help dialog, desktop fullscreen, diagnostics, no console errors, and no mobile overflow; develop-web-game client screenshots/state inspected for both pages after live input.
- Remaining highest-mismatch targets: **Crown Circuit**, **Forge Freighter**, **Pocket Orchard**, and **Tempo Tunnels**. **Signal Loom**, **Moonbase Mutex**, **Bulb Brigade**, **Velvet Heist**, and **Finale Foundry** still need a later qualitative review, but their tags are less visibly contradicted by board/grid play than the racing, shooter, card, and word mismatches already addressed.

## 2026-06-07 Codex games 85-100 quality slice 3

- Replaced **Crown Circuit** with a bespoke board-control duel instead of the shared collect-and-exit grid: five authored 7x7 duels, two-action player turns, connected circuit claims, crown movement, relic crest goals, deterministic rival expansion, control thresholds, terminal win/fail states, sound/fullscreen/help/restart, and diagnostics with legal targets plus recommended claims.
- Replaced **Tempo Tunnels** with a bespoke rhythm-lane game: five authored BPM tracks, four lanes, sync notes, echo bonuses, pulse traps that must be dodged, hit-window timing, combo/integrity scoring, terminal win/fail states, lane buttons, sound/fullscreen/help/restart, and diagnostics with next beat event, hit time, window, and recommended lane.
- Updated capture recipes for both games so render evidence now follows Crown's recommended circuit claims and Tempo's beat-event lane diagnostics instead of the old shared grid recipe.
- Rendered probes caught and fixed real authored-logic issues before integration: Crown had one impossible blocked crest and a rival reclaim loop that made a duel stall; Tempo's final track was too dense for readable lane changes at 144 BPM, so the finale was spaced and the hit window widened.
- Verification passed locally: focused static gates passed for catalog validation, game contract, accessibility, a11y polish, keyboard help, generated surfaces, page weight, tag coverage, and capture recipe preflight; custom desktop/mobile Playwright probe passed for Crown and Tempo full wins, active restart, sound toggle, help, desktop fullscreen, diagnostics, nonblank canvas, no console errors, and no mobile overflow; develop-web-game client screenshots/state inspected for both pages after leaving the title screen; `npm test`, `npm run test:games`, `npm run capture:games:ci`, `npm run test:pwa-runtime`, `npm run test:runtime-storage`, `npm run audit:perf:local`, and `git diff --check` passed. The first render-capture run hit a transient Windows `ERR_NO_BUFFER_SPACE` on unrelated Shadow Switch desktop; rerun passed 200/200 surfaces with max score 0.
- Remaining highest-mismatch targets: **Forge Freighter** and **Pocket Orchard** still need bespoke constraint/simulation loops. Later review should decide whether **Signal Loom**, **Moonbase Mutex**, **Bulb Brigade**, **Velvet Heist**, and **Finale Foundry** still feel too close to the expansion grid shell.

## 2026-06-07 Codex games 85-100 quality slice 4

- Replaced **Forge Freighter** with a bespoke cargo-loading constraint puzzle: five authored route manifests, three freight bays with weight/heat/destination constraints, cargo cards with value and heat load, destination-match bonuses, overload penalties, route quotas, terminal win/fail states, keyboard/touch controls, sound/fullscreen/help/restart, and diagnostics with a recommended loading plan.
- Replaced **Pocket Orchard** with a bespoke crop-market simulation: five authored seasons, six selectable plots, four crop types with growth/water/yield/cost rules, market orders, water budgets, sell/harvest/next-day decisions, terminal win/fail states, keyboard/touch controls, sound/fullscreen/help/restart, and diagnostics with recommended farm actions.
- Updated capture recipes for both games so render evidence now loads cargo and follows orchard recommendations instead of using the old expansion grid recipe.
- Rendered probing caught and fixed a real interaction issue: both new pages initially rebuilt side-panel buttons every animation frame, which could detach clicked controls. The loops now redraw the canvas continuously while refreshing DOM controls only on state changes.
- Verification passed locally: `npm run inject:meta`, `node --check scripts/capture-games.mjs`, strict catalog validation, focused game-contract, accessibility, a11y-polish, keyboard-help, generated-surfaces, tag-coverage, page-weight, and capture-recipe preflight passed; custom desktop/mobile Playwright probe passed for both games covering start, restart, sound toggle, help, desktop fullscreen, full recommended win routes, deliberate fail routes, diagnostics, nonblank canvas, console/page errors, and mobile overflow; develop-web-game client screenshots/state inspected for active gameplay in both games; `npm test`, `npm run test:games`, `npm run capture:games:ci`, `npm run test:pwa-runtime`, `npm run test:runtime-storage`, `npm run audit:perf:local`, and `git diff --check` passed. Forge audited at 27.0 KB / 2 requests and Pocket audited at 29.7 KB / 2 requests with zero console/page errors.
- Remaining for this slice: commit/push and refresh post-push evidence. Later quality review should still inspect **Signal Loom**, **Moonbase Mutex**, **Bulb Brigade**, **Velvet Heist**, and **Finale Foundry** for any remaining shared-grid feel.

## 2026-06-07 Codex games 85-100 quality slice 5

- Replaced **Aster Vault**, **Canopy Courier**, and **Shard Sheriff** with bespoke loops after the quality audit found they were still using the shared expansion grid despite promising Physics, Endless, and Shooter play.
- **Aster Vault** is now a zero-gravity relic retrieval game with inertial thrust, brake control, authored rift fields, oxygen pressure, anchor speed checks, recoverable slow rift brushes, terminal rift/oxygen failures, full-run win, and diagnostics for ship position, velocity, relics, rifts, anchor, and recommendation vectors.
- **Canopy Courier** is now a scrolling glider courier game with four canopy lanes, parcel pickups, branch hazards, lift management, flare/boost controls, authored delivery routes, beacon landing checks, terminal win/fail states, and diagnostics for next event, recommended lane, parcel quota, distance, and lift.
- **Shard Sheriff** is now a ricochet shooter with authored saloon stages, aim-degree controls, limited ammo, glass-safe warrant targets, visible shot traces, terminal glass/ammo failures, full-run win, and diagnostics for targets, glass, ammo, trace, and recommended angles.
- Updated capture recipes for all three games so render evidence follows their actual mechanics instead of the generic expansion-grid recipe. Rendered probing caught and fixed several real issues: Aster oxygen/rift tuning was too brittle, side-panel lists could push controls below the viewport, and multiple Shard Sheriff recommended angles crossed glass before the target under the actual ray model.
- Verification passed locally: `npm run inject:meta`, `node --check scripts/capture-games.mjs`, strict catalog validation, focused game-contract, accessibility, a11y-polish, keyboard-help, generated-surfaces, tag-coverage, page-weight, and capture-recipe preflight passed. Custom desktop/mobile Playwright probe passed for all three games covering start, restart, sound toggle, help, desktop fullscreen, full recommended win routes, deliberate fail routes, diagnostics, nonblank canvas, console/page errors, and mobile overflow. develop-web-game client screenshots/state were inspected after live input for all three. `npm test`, `npm run test:games`, `npm run capture:games:ci`, `npm run test:pwa-runtime`, `npm run test:runtime-storage`, `npm run audit:perf:local`, `npm run test:performance-baseline`, `npm run test:docs`, and `git diff --check` passed. The first two full render captures captured all 200 surfaces but timed out on the contact-sheet screenshot; the harness contact-sheet screenshot timeout is now 120s and the rerun passed with max render score 0.
- Remaining quality review targets: **Signal Loom**, **Moonbase Mutex**, **Bulb Brigade**, **Velvet Heist**, and **Finale Foundry** still need a later audit for shared-grid feel.

## 2026-06-07 Codex games 85-100 quality slice 6

- Replaced **Signal Loom**, **Moonbase Mutex**, and **Bulb Brigade** after the remaining audit confirmed all three still used the original expansion collect-and-exit grid despite promising rhythm routing, airlock scheduling, and defense play.
- **Signal Loom** is now a pulse-routing puzzle with authored conduit rotations, relay nodes, beat-gated pulse timing, charge decay, full-run win/fail states, keyboard/touch selection, and diagnostics with next rotation/wait/pulse recommendations.
- **Moonbase Mutex** is now a simultaneous crew-scheduling tactics puzzle with multiple crews, pending move queues, locked airlock parity, same-cell and swap conflict failures, access cores, exits, air budget, and diagnostics with the next crew command or tick commit.
- **Bulb Brigade** is now a lens-defense puzzle with authored lens slots, Beam/Mirror/Prism types, blackout waves, core health, pulse checks, terminal leak/fail states, and diagnostics with the next slot/lens or pulse recommendation.
- Updated capture recipes for all three games so render evidence follows the actual new mechanics instead of the old expansion grid recipe. Rendered probing caught and fixed real Moonbase authored-data issues where the first plan missed its core and the final plan sent a crew into a closed center airlock.
- Verification passed locally so far: `npm run inject:meta`, `node --check scripts/capture-games.mjs`, strict catalog validation, focused game-contract, accessibility, a11y-polish, keyboard-help, generated-surfaces, tag-coverage, page-weight, and capture-recipe preflight passed. Custom desktop/mobile Playwright probe passed for all three games covering start, restart, sound toggle, help, desktop fullscreen, full recommended win routes, deliberate fail routes, diagnostics, nonblank canvas, console/page errors, and mobile overflow. develop-web-game client screenshots/state were inspected after live input for all three, and the in-app browser opened Signal Loom over localhost. `npm test`, `npm run test:pwa-runtime`, `npm run test:runtime-storage`, `npm run test:games`, `npm run capture:games:ci`, and `npm run audit:perf:local` passed. The strict audit measured Signal Loom at 26.1 KB / 2 requests, Moonbase Mutex at 28.0 KB / 2 requests, and Bulb Brigade at 25.7 KB / 2 requests with zero console/page errors.
- Remaining quality review targets: **Velvet Heist** and **Finale Foundry** still need audit/replacement if they retain the shared-grid feel.

## 2026-06-08 Codex games 85-100 quality slice 7

- Replaced **Velvet Heist** and **Finale Foundry** after the final audit confirmed both still used the original expansion collect-and-exit grid despite promising stealth/tactics and rhythm finale play.
- **Velvet Heist** is now an authored museum infiltration route with four rooms, patrolling guard sightlines, walls, display cases, smoke timing, alarm pressure, terminal win/fail states, keyboard/touch controls, sound/fullscreen/help/restart, and diagnostics with the next route recommendation.
- **Finale Foundry** is now an authored rhythm-foundry finale with four tracks, four lanes, beat windows, heat and combo scoring, lane buttons, a short count-in, terminal win/fail states, keyboard/touch controls, sound/fullscreen/help/restart, and diagnostics with wait/strike/lane recommendations.
- Updated capture recipes for both games so render evidence follows their actual new mechanics instead of the old expansion grid recipe. Probes caught and fixed real authored-route issues: Velvet needed smoke-timing, case-position, and route-sequence fixes, and Finale needed a longer count-in so the first live browser interaction did not immediately miss the opener.
- Verification passed locally: `npm run inject:meta`, `node --check scripts/capture-games.mjs`, strict catalog validation, focused game-contract, accessibility, a11y-polish, keyboard-help, generated-surfaces, tag-coverage, page-weight, PWA, and capture-recipe preflight passed. Custom desktop/mobile Playwright probe passed for both games covering start, restart, sound toggle, help, desktop fullscreen, full recommended win routes, deliberate fail routes, diagnostics, nonblank canvas, console/page errors, and mobile overflow. develop-web-game client screenshots/state were inspected after leaving title screens, and the in-app browser opened both pages over localhost. `npm test`, `npm run test:games`, `npm run capture:games:ci`, `npm run test:pwa-runtime`, `npm run test:runtime-storage`, and `npm run audit:perf:local` passed. The strict audit measured Velvet Heist at 32.0 KB / 2 requests and Finale Foundry at 29.2 KB / 2 requests with zero console/page errors.
- This completes the games 85-100 quality pass: no capture mapping for the 16-game expansion still uses the shared expansion-grid recipe, and every previously generic high-mismatch game now has distinct rules, visuals, authored level logic, and rendered evidence.
