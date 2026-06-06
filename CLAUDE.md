# Workshop Arcade Agent Runbook

Use this file as the fast agent entrypoint for Workshop Arcade work. It is a complement to `AGENTS.md`, `CONTRIBUTING.md`, `docs/game-contract.md`, and `ARCHITECTURE.md`, not a replacement for them.

## Current State

- The catalog is a static single-page arcade with standalone game HTML in `websites/`, cover art in `covers/`, and catalog data in `websites/manifest.json`.
- As of game #83, Nightwire, the catalog has 83 games and every public tag is >= 4. The old sparse-tag floor cadence is retired; choose future games for quality, variety, or a genuinely new mechanic rather than only tag count.
- The user's workflow preference is autonomous execution with no PR. Commit directly to `main` and push when the work is ready, unless the user explicitly says otherwise.

## Start And Handoff

- Run `.ai-sync` before project work and read the shared state:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.ai-sync\ai-sync.ps1" -Action start -Agent claude
```

- Use `-Agent codex` instead when the active agent is Codex.
- Read `.ai-sync/state.md`, `.ai-sync/handoff.md`, and `.ai-sync/claude-context.md` when present.
- Before finishing meaningful work, write a concise `.ai-sync` handoff with changed files, commands run, blockers, and the next useful step.

## New Game Checklist

- Keep each game as a self-contained `websites/<slug>.html` page with no remote assets and a compact request/transfer footprint.
- Load `workshop-runtime.js` before game code touches storage.
- Expose deterministic diagnostics: `window.render_game_to_text()` returns parseable JSON and `window.advanceTime(ms)` advances the game for tests.
- Support keyboard and touch, including restart, sound, fullscreen, and accessible help where applicable.
- Add or update the usual game footprint together: `websites/<slug>.html`, `covers/<slug>.svg`, `websites/manifest.json`, `scripts/capture-games.mjs`, `docs/performance-baseline.md`, and `progress.md`.
- Regenerate derived surfaces when the manifest changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
npm run inject:meta
npm run build:sitemap
npm run build:feed
npm run build:og-images
```

- Update `sw.js` by recomputing the current install shell hash so `SHELL_REVISION` matches the checked shell assets. `npm run test:pwa` will fail if the revision is stale.

## Verification

- For a new or changed game, run focused checks first, then the broad gates:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm test
npm run test:games
npm run capture:games:ci
npm run test:pwa-runtime
npm run test:runtime-storage
npm run audit:perf:local
git diff --check
```

- Use the develop-web-game Playwright client or custom Playwright probes for touched gameplay. Inspect desktop and mobile screenshots, diagnostics, touch/keyboard controls, and console errors.
- After pushing `main`, wait for GitHub Actions and run:

```powershell
npm run test:current-head-workflows
```

- Run clean-HEAD launch evidence when source commits should have fresh deployed proof, especially when public Pages artifact inputs changed:

```powershell
npm run test:launch-evidence-refresh
```

## Scope Defaults

- Do not change backend services, paid accounts, credentials, custom domains, `SECURITY_SURFACES_TOKEN`, or DNS unless the user explicitly asks.
- Do not open a PR. If a branch is necessary for an unusual reason, push the branch without creating a pull request.
- Keep generated artifacts, service worker revisions, performance baselines, and `progress.md` aligned with the actual files and tests from the same pass.
