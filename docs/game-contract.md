# Workshop Arcade Game Contract

Every catalog game should be a standalone browser experience that works directly from `websites/*.html` and inside the catalog sandbox player.

## Required Behavior

- Provide a clear start or ready state, plus a restart path after game over or completion.
- Support keyboard controls where the game needs movement or actions.
- Support touch or pointer controls for mobile play.
- Keep text, controls, and HUD elements within the viewport at desktop and mobile widths.
- Avoid horizontal scrolling on mobile.
- Store scores/settings defensively, because sandboxed play can block native `localStorage`.
- Keep remote scripts, trackers, fonts, heavyweight runtimes, and generated dependency folders out of game pages.
- Keep catalog metadata, cover art, and fallback catalog entries synchronized.

## Accessibility

The static `npm run test:a11y` check enforces these rules:

- Every `<canvas>` must declare `aria-label` (with a meaningful description) or `aria-hidden="true"` if it is decorative.
- Interactive canvases also need `tabindex="0"` so keyboard users can focus them.
- Every `<iframe>` must declare a non-empty `title` attribute.
- Every element with `role="dialog"` or `role="alertdialog"` must also declare `aria-modal="true"` and an accessible name via `aria-labelledby` or `aria-label`. Modals must trap focus, restore focus on close, and respond to `Escape`.

## Visual Cohesion

Match the catalog visual language across the per-game page so the catalog reads as one product:

- Header brand mark: small uppercase eyebrow `Workshop Arcade` over the bold game title.
- Teal/cyan gradient chrome on HUD pills, action buttons, and stat cards.
- Ambient radial backdrop (teal/indigo blobs) to fill desktop empty space.
- Tabular-numeric values for scores and counters.
- Mobile breakpoints should keep the title brand mark out of the viewport when it crowds the HUD.

## Diagnostic Hooks

Existing games expose two diagnostic functions on `window` so the rendered-quality harness (`npm run capture:games`) and the `develop-web-game` Playwright client can observe state without depending on canvas pixels:

- `window.render_game_to_text()` returns a compact JSON snapshot of the active game state (score, level, player position, hazards, overlays, etc.).
- `window.advanceTime(ms)` deterministically advances the game clock by `ms` milliseconds for tests that need to settle a frame-driven effect.

New games should expose both hooks before landing.

## Expected Checks

Run these before opening a PR:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run test:a11y
npm run test:games
npm run capture:games
```

Every captured surface in `npm run capture:games` must score 0. Use `npm ci` first when Node dependencies are not installed.
