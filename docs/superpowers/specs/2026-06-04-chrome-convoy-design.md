# Chrome Convoy — Design Spec

## Overview
Chrome Convoy is a Spy-Hunter-style **combat racer** for the Workshop Arcade
catalog: the player steers a neon interceptor down a vertically scrolling road,
guns and rams a hostile convoy, dodges traffic and hazards, and clears five
deterministic stretches to reach the finish. It is a single self-contained
`websites/chrome-convoy.html` page (inline CSS + JS, Canvas 2D, zero remote
requests), targeting the audited ~25–35 KB / 2-request budget.

## Goal & Catalog Rationale
The catalog has 80 games. The tag-coverage contract
([`scripts/check-tag-coverage.mjs`](../../../scripts/check-tag-coverage.mjs))
enforces `MIN_TAG_COUNT = 3`; six tags currently sit exactly at that floor
(Rhythm, Racing, Shooter, Stealth, Tactics, Word). Chrome Convoy is tagged
**`["Racing", "Shooter", "Action"]`**, lifting **Racing 3 → 4** and
**Shooter 3 → 4** in a single game — matching the recent cadence of filling two
floor tags per addition.

It is also a genuine genre gap: the three existing racers
(neon-drift, switchback-rally, slipstream-sprint) are all *clean* racing, and
the three existing shooters (starline-strafe, skyline-sentry, bulwark-burst)
are all *stationary lane/radial defense*. Nothing in the catalog both **moves
freely and fires offensively** — that is the fresh space Chrome Convoy occupies.

## Technical Approach
- **Rendering:** Canvas 2D, top-down road that scrolls vertically toward the
  player to convey forward speed (the metro-dash scroll model).
- **Architecture:** single `websites/chrome-convoy.html`, no external deps.
- **Physics/clock:** `dt`-normalized, frame-rate independent, matching existing
  game conventions.
- **Determinism:** seeded PRNG + scripted per-stretch spawn tables. No
  `Date.now()` / `Math.random()` in the simulation loop, so the capture recipe
  and tests reproduce exactly.
- **Storage:** defensive storage wrapper (sandboxed play can block native
  `localStorage`) for best score + sound preference.

## Movement Model
- **Free horizontal steering** across the road width (not discrete lanes), with
  light momentum so it reads as *driving*, not lane-hopping. This is the
  deliberate differentiator from the catalog's existing lane/tap games.
- **Vertical position is fixed** (player sits in the lower third); the world
  scrolls down past it. The player does not drive up/down — closing on rivals
  happens because rivals stream toward the player.
- `playerX` is clamped to the asphalt; drifting onto the **road edge** costs
  armor (this is what makes free-steer matter).

## Combat & Threat Model
- **Primary weapon — forward twin-cannon, heat-limited.** A heat bar fills while
  firing and vents when released; overheat triggers a brief firing lockout.
  (Reuses the proven bulwark-burst heat model; prevents trigger-spam.)
- **Secondary — ram (free, no extra button).** Steering hard into a rival
  side-swipes it off the road; ammo-free but costs the player chip armor too —
  a risk/reward use of the steering already in hand.
- **Threats (all stream from the far edge toward the player):**
  - **Rival cars** (red) — weave toward the player; destroyed by gunfire or ram.
    The primary scoring targets.
  - **Armored blockers** — shrug off light fire; require sustained fire or a
    dodge. They wall the road to force steering.
  - **Static hazards** — oil slicks (momentary steer-slip), cones/barriers (chip
    armor on contact), and the road edges (off-asphalt = chip armor).
  - **Neutral traffic** (white/civilian) — must **not** be destroyed. Gunning or
    ramming one costs score and breaks the combo, but **never ends the run**
    (kept deliberately non-punishing).
  - **Repair tokens** — rare pickups in the stream; restore one armor segment.
- **Armor:** a 4-segment bar. Enemy fire, collisions, hazards, and off-road
  contact chip it; reaching 0 = wreck (fail).

## Run Structure & Difficulty
- **Five deterministic stretches.** Each is a fixed-length seeded scroll with a
  scripted spawn table; a checkpoint banner appears between stretches. Clearing
  stretch 5's finish line = **win**.
- **Escalation curve:**
  1. Light traffic — teaches steer + fire.
  2. Adds armored blockers.
  3. Adds oil slicks + road-edge pressure.
  4. Dense rival weaving.
  5. Armored-convoy finale — a thicker hostile pack (not a separate boss entity
     with its own HP bar; stays in budget).

## Win / Fail / Scoring
- **Win:** cross stretch 5's finish line.
- **Fail:** armor → 0 = wreck → restart the run from stretch 1 (simplest, fully
  deterministic, matches sibling games; per-checkpoint resume is noted as an
  easy later tweak, out of scope for v1).
- **Scoring:** points per rival destroyed (small bonus for a ram kill), plus a
  distance-traveled component (total road cleared across the run, distinct from
  the per-stretch `distance` diagnostic field), multiplied by a **combo** that climbs with consecutive
  kills taken with no armor damage and no civilian hit, and resets when either
  happens. End-of-run score and **best score persist** via defensive storage.

## Controls

| Action       | Keyboard          | Touch                |
|--------------|-------------------|----------------------|
| Steer left   | ← / A             | Hold left zone       |
| Steer right  | → / D             | Hold right zone      |
| Fire         | Space / ↑         | Fire button          |
| Ram          | (steer into rival)| (steer into rival)   |
| Start/Restart| Enter / R         | Start / Restart btn  |

Plus standard catalog chrome: a **sound** toggle, a **fullscreen** toggle, and a
**Help** overlay (controls grid, `Escape` to close).

## Game States
1. **Menu / Ready** — title, best score, "Press Enter / Tap to Start".
2. **Playing** — active run with HUD.
3. **Win** — stretch 5 cleared; final score, best-score update, restart prompt.
4. **Fail** — wreck; final score, best-score update, restart prompt.

## HUD
- Top-left: armor segments + heat bar.
- Top-center: stretch indicator (e.g. `STRETCH 3 / 5`) and distance progress.
- Top-right: score + best (tabular-numeric), sound/fullscreen/help buttons.

## Spawning & Determinism
- Each stretch draws from a scripted spawn table seeded per run; spawn timing,
  lane offset, and type are deterministic functions of (stretch, seed, elapsed).
- A guaranteed passable gap is maintained so every stretch is clearable without
  taking unavoidable damage.
- Minimum spacing between consecutive threats preserves reaction time.

## Diagnostic Hooks
Both global hooks required by the contract
([`docs/game-contract.md`](../../game-contract.md)) are exposed before landing:

- `window.advanceTime(ms)` — deterministically advances the sim clock in ~40 ms
  slices, then returns `render_game_to_text()`.
- `window.render_game_to_text()` — returns a compact JSON snapshot:

```json
{
  "phase": "menu | playing | win | fail",
  "stretch": 1,
  "totalStretches": 5,
  "distance": 0.0,
  "checkpoint": 0,
  "armor": 4,
  "maxArmor": 4,
  "heat": 0.0,
  "overheated": false,
  "score": 0,
  "combo": 1,
  "best": 0,
  "playerX": 0.5,
  "threats": [{ "type": "rival|blocker|hazard|civilian|token", "x": 0.0, "y": 0.0 }],
  "sound": true,
  "coordinateSystem": "playerX 0=left road edge -> 1=right edge; distance 0->1 is progress through the current stretch; checkpoint counts stretches cleared; threats stream from y=0 (far) to y=1 (at player); fire destroys rivals, ram costs armor, do not destroy civilians; clear 5 stretches to win"
}
```

`distance` is **per-stretch progress (0 → 1)**; `checkpoint` is the count of
stretches already cleared — they are intentionally separate to avoid ambiguity.

## Accessibility & UI Conventions
Per the game contract:
- `<canvas>` declares a meaningful `aria-label` and `tabindex="0"`.
- Every `<button>` declares `type="button"`.
- The Help overlay uses `role="dialog"`, `aria-modal="true"`, an accessible
  name, focus trap, focus restore, and `Escape` to close.
- HUD/text stays within the viewport at desktop and mobile widths; no horizontal
  scrolling on mobile (`overscroll-behavior:none; touch-action:none`).
- Visual cohesion: Workshop Arcade uppercase eyebrow over the bold title,
  teal/cyan gradient chrome on HUD pills and buttons, ambient radial backdrop,
  tabular-numeric counters.

## Manifest Entry
```json
{
  "id": "chrome-convoy",
  "title": "Chrome Convoy",
  "subtitle": "Steer a neon interceptor down a scrolling gauntlet, gun and ram the hostile convoy, and clear five deterministic stretches.",
  "tags": ["Racing", "Shooter", "Action"],
  "slug": "chrome-convoy",
  "url": "websites/chrome-convoy.html",
  "cover": "covers/chrome-convoy.svg",
  "addedAt": "2026-06-04",
  "popularity": 70
}
```

## Cover Image
- `covers/chrome-convoy.svg` — a 640×360 neon cover: top-down view of a scrolling
  road, the player interceptor near the bottom firing tracer rounds, red rival
  cars ahead, with the "Chrome Convoy" title. Consistent with existing SVG cover
  style.
- `covers/og/chrome-convoy.svg` — matching OG share card.

## Catalog Integration Footprint
**Hand-edited (7):**
1. `websites/chrome-convoy.html` — the game.
2. `covers/chrome-convoy.svg` — 640×360 cover.
3. `covers/og/chrome-convoy.svg` — OG card.
4. `websites/manifest.json` — the entry above.
5. `scripts/capture-games.mjs` — a `"chrome-convoy"` recipe (see below).
6. `sw.js` — bump the service-worker shell revision (`wa-vNN` + shell hash).
7. `progress.md` — changelog entry.

**Auto-regenerated** by `validate-catalog.ps1 -Fix` + build scripts (do not
hand-edit): fallback catalog, injected meta / JSON-LD, `sitemap.xml`,
`feed.json`, `covers/og-image.svg`, `docs/performance-baseline.md`.

`index.html` needs **no** change — `CATEGORY_ORDER` already contains both
`Racing` and `Shooter`.

## Capture Recipe
Add a slug-keyed entry to the `recipes` map in `scripts/capture-games.mjs`:

```js
"chrome-convoy": {
  name: "start, steer, and gun the first rival",
  expectsStart: true,
  freezePostAtEvent: true,
  run: async (page) => { /* start -> steer toward a rival -> fire -> advanceTime to a kill frame */ },
}
```

The recipe must reach a representative interactive frame (a rival being
destroyed) and produce a render-ranking score of 0, like every sibling game.

## Verification Gauntlet
The standard per-game pass, run before landing:
- `validate-catalog.ps1 -Fix` then strict
- `npm run inject:meta`, `npm run build:sitemap`, `npm run build:feed`,
  `npm run build:og-images`
- `npm test` (all fast `test:*` gates)
- `npm run test:games`
- `npm run capture:games:ci` (every captured surface scores 0)
- `npm run audit:perf:local` (Chrome Convoy within the ~25–35 KB / 2-request
  budget, zero console/page errors)
- `npm run test:pwa-runtime`, `npm run test:runtime-storage`
- A custom desktop + mobile Playwright smoke covering: start, steer, fire-kill,
  ram, take-damage, fail/restart, deterministic win, touch controls, diagnostics
  parity, no GitHub startup requests, no console errors, no horizontal overflow.

## Out of Scope (v1 / YAGNI)
- Per-checkpoint resume on fail (full-run restart only).
- A boost/brake third verb (input stays steer + fire; ram is the free third
  option).
- A distinct boss entity with its own HP bar (the finale is a denser pack).
- Multiple weapons, upgrades, currency, or persistent progression.
- Multiple tracks/themes beyond the single neon road.
