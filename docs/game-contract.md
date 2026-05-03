# Workshop Arcade Game Contract

Every catalog game should be a standalone browser experience that works directly from `websites/*.html` and inside the catalog sandbox player.

## Required Behavior

- Provide a clear start or ready state, plus a restart path after game over or completion.
- Support keyboard controls where the game needs movement or actions.
- Support touch or pointer controls for mobile play.
- Keep text, controls, and HUD elements within the viewport at desktop and mobile widths.
- Avoid horizontal scrolling on mobile.
- Store scores/settings defensively, because sandboxed play can block native `localStorage`.
- Keep remote scripts, trackers, heavyweight runtimes, and generated dependency folders out of game pages.
- Keep catalog metadata, cover art, and fallback catalog entries synchronized.

## Expected Checks

Run these before opening a PR:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run test:games
```

Use `npm ci` first when Node dependencies are not installed.
