# Contributing to Workshop Arcade

Workshop Arcade is intentionally static: games are single HTML files in `websites/`, catalog data lives in `websites/manifest.json`, and cover art lives in `covers/`.

## Add or Update a Game

1. Add or edit the game file in `websites/`.
2. Add or update a cover in `covers/`.
3. Update `websites/manifest.json`.
4. Include `websites/workshop-runtime.js` before game scripts so sandboxed play has safe storage fallback.
5. Follow `docs/game-contract.md` (in particular: visual cohesion pattern, modal/overlay accessibility, and diagnostic hooks).
6. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run test:docs
npm run test:tools
npm run test:capture-recipes
npm run test:a11y
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

These are the publish-ready gates mirrored by CI: docs drift, tooling syntax, capture recipe preflight, accessibility, game smoke coverage, strict render capture, and strict performance audit. CI groups them as catalog/docs/a11y, game smoke, performance audit, and render capture jobs. `npm run capture:games` is useful for optional local contact-sheet review, but `npm run capture:games:ci` is the enforced publish gate and every rendered surface must score 0.

## Remove a Game

Remove all of these together:

- Its `websites/*.html` file
- Its cover image or SVG
- Its `websites/manifest.json` entry

Then run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix` so `FALLBACK_GAMES` stays synchronized.

## Workshop Requests

Use the catalog's `Improve` button to generate an AI-ready brief. Submitting it opens a pre-filled GitHub issue with the `workshop-request` label already attached, which surfaces it in the Improvement Queue on the catalog.

The `Workshop Request Triage` workflow adds implementation labels and a checklist comment with deep links to the affected game file. It does not run AI code generation or require API keys.

When you're ready to start work, run the `Workshop Draft PR` workflow manually (`Actions -> Workshop Draft PR -> Run workflow`) with the issue number. It scaffolds a `codex/workshop-<N>` branch from main, opens a draft PR titled `[Workshop #N] <title>` that closes the issue, and comments the PR link back on the issue. The PR body references the triage checklist and the validation suite the implementer must run before flipping to ready-for-review. Re-running the workflow against the same issue is a no-op once the branch and PR exist.
