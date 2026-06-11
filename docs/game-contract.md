# Workshop Arcade Game Contract

Every catalog game should be a standalone browser experience that works directly from `websites/*.html` and inside the catalog sandbox player.

## Required Behavior

- Provide a clear start or ready state, plus a restart path after game over or completion.
- Support keyboard controls where the game needs movement or actions.
- Support touch or pointer controls for mobile play.
- Keep text, controls, and HUD elements within the viewport at desktop and mobile widths.
- Avoid horizontal scrolling on mobile.
- Store scores/settings defensively, because sandboxed play can block native `localStorage`. Inside the catalog player, `workshop-runtime.js` bridges those saves back to the catalog origin (`workshop-arcade:game:<slug>:` keys) so they persist between sessions; games keep using `localStorage` normally and need no bridge-specific code.
- Keep remote scripts, trackers, fonts, heavyweight runtimes, and generated dependency folders out of game pages.
- Keep catalog metadata, cover art, and fallback catalog entries synchronized.

## Accessibility

The static `npm run test:a11y` check enforces these rules:

- Every `<canvas>` must declare `aria-label` (with a meaningful description) or `aria-hidden="true"` if it is decorative.
- Interactive canvases also need `tabindex="0"` so keyboard users can focus them.
- Every `<iframe>` must declare a non-empty `title` attribute.
- Every element with `role="dialog"` or `role="alertdialog"` must also declare `aria-modal="true"` and an accessible name via `aria-labelledby` or `aria-label`. Modals must trap focus, restore focus on close, and respond to `Escape`.
- Every `<button>` must declare a `type` attribute. The HTML default is `"submit"`, which silently submits any enclosing `<form>` — a real footgun for action buttons that happen to live near a form. Use `type="button"` for plain action buttons and `type="submit"` only when actually submitting a form.

## Visual Cohesion

Match the catalog visual language across the per-game page so the catalog reads as one product:

- Header brand mark: small uppercase eyebrow `Workshop Arcade` over the bold game title.
- Teal/cyan gradient chrome on HUD pills, action buttons, and stat cards.
- Ambient radial backdrop (teal/indigo blobs) to fill desktop empty space.
- Tabular-numeric values for scores and counters.
- Mobile breakpoints should keep the title brand mark out of the viewport when it crowds the HUD.

## Diagnostic Hooks

Existing games expose two diagnostic functions on `window` so the rendered-quality harness (`npm run capture:games:ci`, or optional local `npm run capture:games` review) and the `develop-web-game` Playwright client can observe state without depending on canvas pixels:

- `window.render_game_to_text()` returns a compact JSON snapshot of the active game state (score, level, player position, hazards, overlays, etc.).
- `window.advanceTime(ms)` deterministically advances the game clock by `ms` milliseconds for tests that need to settle a frame-driven effect.

Every existing game must preserve both hooks during maintenance.

## Expected Checks

Run these before opening a PR:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
npm run inject:meta
npm run build:sitemap
npm run build:feed
npm run build:og-images
npm test
npm run test:games
npm run capture:games:ci
npm run audit:perf:ci
```

Every captured surface in `npm run capture:games:ci` must score 0, and the CI render capture job uploads the compact render-ranking report. `npm test` runs every fast `test:*` gate, including docs drift, manifest schema, catalog perf, PWA, fallback pages, OG images, JSON-LD, SEO, feed, and a11y polish. Use `npm run capture:games` for optional local contact-sheet review when you want to inspect desktop/mobile surfaces without strict CI failure handling. Use `npm ci` first when Node dependencies are not installed.
