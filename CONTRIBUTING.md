# Contributing to Workshop Arcade

Workshop Arcade is intentionally static: games are single HTML files in `websites/`, catalog data lives in `websites/manifest.json`, and cover art lives in `covers/`.

## Catalog Content Freeze

The exact 100-game catalog is frozen until the user explicitly changes their mind. Do not add, remove, rename, replace, or scaffold a game. `catalog-freeze.json` is the durable policy record, and `npm run test:catalog-freeze` rejects changes to the manifest slug set or the `websites/*.html` game-file set.

## Update an Existing Game

1. Edit the existing game file in `websites/`.
2. Update its existing cover in `covers/` only when needed.
3. Update the existing `websites/manifest.json` entry only when player-facing metadata changed; do not change its identity or URL.
4. Include `websites/workshop-runtime.js` before game scripts so sandboxed play has safe storage fallback.
5. Follow `docs/game-contract.md` (in particular: visual cohesion pattern, modal/overlay accessibility, and diagnostic hooks).
6. Regenerate derived surfaces when the manifest changes:

```powershell
npm run inject:meta
npm run build:sitemap
npm run build:feed
npm run build:og-images
```

7. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm test
npm run test:catalog-freeze
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

These are the publish-ready gates mirrored by CI: catalog validation, every fast `test:*` gate through `npm test`, game smoke coverage, strict render capture, and strict performance audit. CI groups them as catalog/docs/a11y, game smoke, performance audit, and render capture jobs. `npm run capture:games` is useful for optional local contact-sheet review, but `npm run capture:games:ci` is the enforced publish gate and every rendered surface must score 0.

## Workshop Requests

Use the catalog's `Improve` button to generate an AI-ready brief for an existing game. New-game submissions are disabled while the content freeze is active. Submitting an improvement opens a pre-filled GitHub issue with the `workshop-request` label already attached, which surfaces it in the Improvement Queue on the catalog.

The `Workshop Request Triage` workflow adds implementation labels and a checklist comment with deep links to the affected game file. It does not run AI code generation or require API keys.

When you're ready to start work, run the `Workshop Draft PR` workflow manually (`Actions -> Workshop Draft PR -> Run workflow`) with the issue number. It scaffolds a `codex/workshop-<N>` branch from main, opens a draft PR titled `[Workshop #N] <title>` that closes the issue, and comments the PR link back on the issue. The PR body references the triage checklist and the validation suite the implementer must run before flipping to ready-for-review. Re-running the workflow against the same issue is a no-op once the branch and PR exist.
