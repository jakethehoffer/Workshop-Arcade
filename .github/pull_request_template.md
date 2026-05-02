## Summary

- 

## Catalog Checks

- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1`
- [ ] New or changed games have a `websites/*.html` file and a cover under `covers/`.
- [ ] `websites/manifest.json` and the `FALLBACK_GAMES` list in `index.html` stay synchronized.
- [ ] Removed games are deleted from the manifest, fallback catalog, game file, and cover assets.

## Browser Checks

- [ ] Catalog loads and shows the expected game count.
- [ ] Changed game opens from its Play button.
- [ ] Workshop Improve flow still generates an issue-ready brief.
- [ ] No obvious mobile horizontal overflow.
