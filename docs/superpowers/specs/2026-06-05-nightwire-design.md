# Nightwire — Design Spec

## Overview
Nightwire is a **turn-based tactical-stealth** game for the Workshop Arcade
catalog: a single neon infiltrator slips through compact guarded grids, spending
a small per-turn action budget to move, **silently take down** guards from their
blind side, and **distract** patrols, while staying out of deterministic vision
cones. Grab the asset, reach extraction, clear five stages. It is a single
self-contained `websites/nightwire.html` page (inline CSS + JS, Canvas 2D, plus
the shared `workshop-runtime.js`), targeting the audited ~25–35 KB / 2-request
budget.

## Goal & Catalog Rationale
The catalog has 82 games. The tag-coverage contract
([`scripts/check-tag-coverage.mjs`](../../../scripts/check-tag-coverage.mjs))
enforces `MIN_TAG_COUNT = 3`; after Chrome Convoy (#81) and Cipher Cadence (#82),
**`Stealth` and `Tactics` are the only two tags left at the floor (3 games each).**
Nightwire is tagged **`["Tactics", "Stealth", "Strategy"]`**, lifting **Tactics
3 → 4 and Stealth 3 → 4** in one game — the final floor-clearing pass, after
which every public tag sits at ≥ 4.

It occupies a Stealth+Tactics cell none of the five existing games do:

| Game | Timing | Units | Verbs | Objective |
|------|--------|-------|-------|-----------|
| **breachline** (Tac+Ste) | plan-then-execute (batch) | 2 synced agents | pure dodge | core + extract |
| shadow-switch (Ste) | real-time turn-based | 1 avatar | dodge + switches | key + exit |
| shadow-vault (Ste) | turn-based + alert meter | 1 avatar | dodge + keys | escape |
| gridline-tactics (Tac) | turn-based reactive | 2 units | move + attack | kill / reach goal |
| gridfront-orders (Tac) | order queue | 2 units | move + attack | kill / reach goal |
| **Nightwire** | **turn-based reactive** | **1 agent** | **takedown / distract / dodge** | **asset + extract** |

Nightwire is **reactive turn-by-turn** (you see the board and act, vs breachline's
commit-ahead batch), the player **acts on** guards (takedown/distract, vs the
shadow games' pure avoidance), and the goal is **silent infiltration & extraction**
(vs the tactics games' kill-all arenas).

## Technical Approach
- **Rendering:** Canvas 2D, fixed internal resolution `W = 960, H = 540` scaled by
  CSS; top-down neon-noir tile grid (~14×9).
- **Architecture:** single `websites/nightwire.html`; loads `workshop-runtime.js`
  (the shared sandbox-storage shim) before any storage access; no other deps.
- **Determinism:** fixed guard patrol tables + scripted guard/alarm logic. No
  `Math.random()` / `Date.now()` in the simulation, so the capture recipe and
  tests reproduce exactly.
- **Storage:** defensive storage (via the runtime shim) for best score + sound.

## Core Model & Turn Structure
- **Single infiltrator** on a tile grid — not a squad. The tactical depth comes
  from the action economy and guard manipulation, not unit count (the deliberate
  break from breachline's two synced agents and the tactics games' two units).
- **Turn-based, reactive:**
  1. **Your turn:** spend action points, then end the turn.
  2. **Guards' turn:** each guard advances one tile / rotates along its
     deterministic patrol, then **looks**.
  3. Repeat. Guards move only on their turn, so you always see the exact board
     before committing.
- **Action economy — 2 action points (AP) per turn:**
  - **Step** one cardinal tile = **1 AP**.
  - **Distract** = **1 AP**; **Takedown** = **2 AP** (the whole turn).
  - **Peek** = free; **end turn** passes any unspent AP.

## Guards, Vision & Detection
- **Guards:** position, facing, and a **deterministic patrol loop** (fixed, no
  RNG). On the guards' turn each advances one tile / rotates as scripted, then
  projects vision.
- **Vision cone:** a fan in the facing direction, range ~3 tiles, widening with
  distance; **walls block line-of-sight** per cell.
- **Detection — two explicit triggers:**
  1. **On your turn:** stepping *into* a currently-lit cone cell → spotted.
  2. **On the guards' turn:** a guard's new cone sweeping onto your tile (LoS
     clear) → spotted.
- **Alarm meter (0–100):** spotted = **+34** with a "Spotted!" beat; decays
  **−4** per unseen turn; **100 = caught → fail.**
- **Escalation:** at Alarm ≥ 50 ("Alert"), cones gain **+1 range** and the
  nearest guard biases its patrol toward your **last-seen tile** for two turns —
  deterministic, no hunt-AI.

## Tactical Verbs
- **Silent takedown:** when adjacent to a guard from its **flank/back** (you are
  *not* in its cone), spend **2 AP** (the whole turn) to drop it. It becomes a
  **body** on its tile.
- **Distract:** spend **1 AP** to throw a lure to a cardinal tile. On the next
  guards' turn, the nearest guard **within hearing (≤ 4 tiles; sound ignores
  walls; ties broken by lowest guard id)** turns toward / steps to the lure
  instead of patrolling, for one turn.
  **Limited to 2 lures per stage.**
- **Bodies = risk:** a body persists; any live guard's cone covering it **spikes
  alarm (+34) and sends that guard to investigate** (it moves toward the body for
  two turns, then resumes its patrol). Takedowns trade an immediate threat for a
  positional liability — the core tactical tension.
- **Peek (free):** hold to reveal cones one tile around the corner before
  committing a step — pure information, keeps a single-screen game fair.

## Objective, Stages, Win / Fail & Scoring
- **Per stage:** grab the **asset** (one intel pickup), then reach the
  **extraction** tile. **Uniform rule: the asset is always required before
  extraction works.**
- **Five deterministic stages**, escalating: ① move + cones → ② introduce
  takedown → ③ introduce distract + body risk → ④ denser patrols + alert
  escalation → ⑤ finale (multiple guards, a patrol covering extraction).
- **Win:** extract with the asset on stage 5. **Fail:** alarm reaches 100 →
  **restart the run** from stage 1 (matches sibling games; per-stage checkpoint
  is a noted later tweak, out of scope for v1).
- **Scoring:** per-stage base − turns taken − alarm accrued, plus a **Ghost
  bonus** for clearing a stage with **alarm never above 0 (fully unseen)** and an
  efficiency bonus for few turns; a stage multiplier; **best score persisted**.
  Rewards the clean ghost run.

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Step (1 AP) | ← ↑ ↓ → / WASD | Tap a highlighted adjacent tile |
| Takedown (2 AP) | F (valid flankable guard) | Tap a flankable guard |
| Distract (1 AP) | Q, then a direction | Distract button, then tap a direction |
| End turn | Space / E | End Turn button |
| Peek | hold Shift | (cones shown around the agent) |
| Start / Restart | Enter / R | Start / Restart button |

Plus standard chrome: a **sound** toggle, a **fullscreen** toggle, and a **Help**
overlay (`role="dialog"`, focus trap, `Escape` to close).

## Game States
1. **Menu / Ready** — title, best score, "Press Enter / Tap to Start".
2. **Playing** — active run with HUD; your-turn / guards'-turn beats.
3. **Win** — stage 5 extracted; final score, best-score update, restart prompt.
4. **Fail** — alarm hit 100; final score, best-score update, restart prompt.

## HUD
Teal/cyan gradient pills, tabular-numeric values: **Stage** n/5 · **Alarm** % ·
**AP** (•• remaining this turn) · **Lures** left · **Score** · **Best**. An
`aria-live` status line carries the latest beat ("Spotted!", "Guard down",
"Asset secured", "Body found!").

## Determinism & Diagnostic Hooks
Both global hooks required by the contract
([`docs/game-contract.md`](../../game-contract.md)) are exposed:

- `window.advanceTime(ms)` — settles any in-flight guard-move / alarm tween by
  `ms` (a near-no-op when the board is idle between turns) and returns
  `render_game_to_text()`. Deterministic.
- `window.render_game_to_text()` — returns a compact JSON snapshot:

```json
{
  "game": "nightwire",
  "phase": "menu | playing | win | fail",
  "stage": 1,
  "totalStages": 5,
  "turn": 0,
  "ap": 2,
  "maxAp": 2,
  "agent": { "x": 0, "y": 0 },
  "alarm": 0,
  "alertLevel": "calm | alert",
  "assetHeld": false,
  "asset": { "x": 0, "y": 0, "taken": false },
  "exit": { "x": 0, "y": 0 },
  "guards": [{ "id": 1, "x": 0, "y": 0, "dir": "N|E|S|W", "vision": 3, "down": false, "investigating": false }],
  "bodies": [{ "x": 0, "y": 0 }],
  "distractsLeft": 2,
  "lures": [{ "x": 0, "y": 0 }],
  "score": 0,
  "combo": 1,
  "best": 0,
  "sound": true,
  "feedback": "",
  "feedbackActive": false,
  "lastEvent": "",
  "coordinateSystem": "grid in tiles, origin top-left, x right, y down; dir is guard facing; you are spotted if you occupy a guard's vision cone with clear line-of-sight; take guards down from their flank/back (not while in their cone); grab the asset then reach exit; alarm 100 = caught"
}
```

`alertLevel` is `"alert"` when `alarm >= 50`, else `"calm"`. `feedbackActive` is
true while a status beat is fresh (for the capture harness's feedback signal).

## Accessibility & UI Conventions
Per the game contract:
- `<canvas>` declares a meaningful `aria-label` and `tabindex="0"`.
- Every `<button>` declares `type="button"`.
- The Help overlay uses `role="dialog"`, `aria-modal="true"`, an accessible name,
  a focus trap, focus restore, and `Escape` to close.
- HUD/text stays within the viewport at desktop and mobile widths; no horizontal
  scrolling on mobile (`overscroll-behavior:none; touch-action:none`).
- Visual cohesion: Workshop Arcade uppercase eyebrow over the bold title,
  teal/cyan gradient chrome on HUD pills and buttons, ambient radial backdrop,
  tabular-numeric counters.

## Manifest Entry
```json
{
  "id": "nightwire",
  "title": "Nightwire",
  "subtitle": "Infiltrate neon grids turn by turn: dodge vision cones, take down guards from the dark, distract patrols, grab the asset, and slip out unseen.",
  "tags": ["Tactics", "Stealth", "Strategy"],
  "slug": "nightwire",
  "url": "websites/nightwire.html",
  "cover": "covers/nightwire.svg",
  "addedAt": "2026-06-05",
  "popularity": 72
}
```

## Cover Image
- `covers/nightwire.svg` — a 640×360 neon-noir cover: a top-down grid fragment
  with a cyan infiltrator tile, an amber guard vision cone, a wall or two, and
  the "Nightwire" title. Consistent with the existing SVG cover style.
- `covers/og/nightwire.svg` — matching OG share card, generated by
  `npm run build:og-images`.

## Catalog Integration Footprint
**Hand-edited (7):**
1. `websites/nightwire.html` — the game (loads `workshop-runtime.js`).
2. `covers/nightwire.svg` — 640×360 cover.
3. `covers/og/nightwire.svg` — OG card (generated).
4. `websites/manifest.json` — the entry above.
5. `scripts/capture-games.mjs` — a `"nightwire"` recipe (`expectsStart:true`;
   start → step beside a guard's blind side → takedown → freeze the
   `feedbackActive` frame).
6. `sw.js` — bump the service-worker shell revision (`wa-v42` → `wa-v43`, with the
   `shell-<hash>` token **recomputed** from `check-pwa.mjs`'s expected value, not
   guessed).
7. `progress.md` — changelog entry; plus a new `docs/performance-baseline.md`
   pass section citing **83 manifest games / 84 pages total**.

**Auto-regenerated** by `validate-catalog.ps1 -Fix` + build scripts (do not
hand-edit): fallback catalog in `index.html`, injected meta / JSON-LD,
`sitemap.xml`, `feed.json`, `covers/og-image.svg`.

`index.html` `CATEGORY_ORDER` already contains both `Tactics` and `Stealth` — no
chip-list change.

## Capture Recipe
Add a slug-keyed entry to the `recipes` map in `scripts/capture-games.mjs`:

```js
"nightwire": {
  name: "start, approach a guard's blind side, and take it down",
  expectsStart: true,
  freezePostAtEvent: true,
  run: async (page) => { /* start -> step adjacent to a guard's flank -> press F -> advanceTime to the takedown feedback frame */ },
}
```

The recipe must reach a representative frame (a guard going down, `feedbackActive`
true) and produce a render-ranking score of 0, like every sibling game.

## Verification Gauntlet
The standard per-game pass, run before landing:
- `validate-catalog.ps1 -Fix` then strict
- `npm run inject:meta`, `npm run build:sitemap`, `npm run build:feed`,
  `npm run build:og-images`
- `npm test` (all fast `test:*` gates, incl. `test:storage-contract`,
  `test:tag-coverage`, `test:game-contract`, `test:pwa`, `test:performance-baseline`)
- `npm run test:games`
- `npm run capture:games:ci` (every captured surface scores 0)
- `npm run audit:perf:local` (Nightwire within the ~25–35 KB / 2-request budget,
  zero console/page errors)
- `npm run test:pwa-runtime`, `npm run test:runtime-storage`
- A custom desktop + mobile Playwright probe covering: start, step, takedown,
  distract, spotted → alarm rise, body-spotted spike, deterministic win,
  fail/restart, touch controls, diagnostics parity, no GitHub startup requests,
  no console errors, no horizontal overflow.

## Out of Scope (v1 / YAGNI)
- Per-stage checkpoint on fail (full-run restart only).
- A second controllable unit / squad (single agent only).
- Lethal ranged combat or weapons (takedowns are silent melee from the blind side).
- A full hunt / reinforcement AI (escalation is the deterministic last-seen-tile bias).
- Procedural levels (the five stages are hand-authored, deterministic).
