# Workshop Arcade

Workshop Arcade is a static catalog of browser games. Each game lives as a standalone HTML file under `websites/`, with catalog metadata in `websites/manifest.json` and cover art in `covers/`.

The catalog includes a Workshop flow for players or builders to turn a game idea into an AI-ready improvement brief. Briefs can be copied, downloaded, saved locally in the browser, or opened as a pre-filled GitHub issue before being used with an AI coding tool. Open `workshop-request` issues appear in the Improvement Queue on the catalog page.

## Local Development

Run a static server from the repo root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Validation

Before publishing catalog changes, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
```

The validator checks that every manifest entry has a real game file, cover asset, safe relative paths, unique ids/slugs, and a synchronized fallback catalog in `index.html`.

See `CONTRIBUTING.md` for the full add/update/remove checklist.
