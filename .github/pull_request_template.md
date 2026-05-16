## Summary

- 

## Catalog Checks

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix`
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1`
- [ ] `npm run test:docs`
- [ ] `npm run test:a11y`
- [ ] `npm run test:games`
- [ ] `npm run capture:games:ci`
- [ ] `npm run audit:perf:ci`
- [ ] New or changed games have a `websites/*.html` file and a cover under `covers/`.
- [ ] `websites/manifest.json` and the generated `FALLBACK_GAMES` list in `index.html` stay synchronized.
- [ ] Game pages follow `docs/game-contract.md`.
- [ ] Removed games are deleted from the manifest, fallback catalog, game file, and cover assets.

## Browser Checks

- [ ] Catalog loads and shows the expected game count.
- [ ] Changed game opens in the sandbox player modal from its Play button.
- [ ] The player modal closes with Escape and the external-open fallback works.
- [ ] Workshop Improve flow still generates an issue-ready brief.
- [ ] No obvious mobile horizontal overflow.
