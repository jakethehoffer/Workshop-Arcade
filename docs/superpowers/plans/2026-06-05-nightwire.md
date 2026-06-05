# Nightwire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Nightwire — a turn-based tactical-stealth game (single infiltrator, 2-AP turns, silent takedowns + distractions, deterministic vision-cone patrols, alarm meter, five stages) — as game #83, lifting the `Tactics` and `Stealth` tags off the coverage floor.

**Architecture:** A single self-contained `websites/nightwire.html` (inline CSS + JS, Canvas 2D, fixed 960×540 scaled by CSS) that also loads the shared `workshop-runtime.js` storage shim. The sim is **turn-based and event-driven**: player input mutates state synchronously and ends the turn; a `guardsTurn()` then advances deterministic patrols, recomputes vision cones, and resolves detection. A lightweight `requestAnimationFrame` loop only *draws* (and ages the feedback timer). Then the standard catalog integration and verification gauntlet.

**Tech Stack:** Vanilla HTML5 + Canvas 2D + Web Audio API + the repo's `workshop-runtime.js`. Node + Playwright test harness. PowerShell `validate-catalog.ps1`.

**Reference files to mirror (read first):** `websites/breachline.html` and `websites/shadow-vault.html` (grid + vision-cone + turn idioms), `websites/bulwark-burst.html` (storage/audio/fullscreen/help/diagnostics idioms), `docs/game-contract.md`, and this spec: `docs/superpowers/specs/2026-06-05-nightwire-design.md`.

**Conventions:**
- Fixed internal resolution `W = 960, H = 540`; a `GW × GH = 14 × 9` tile grid, tile `T = 56`, origin `OX = (W - GW*T)/2 = 88`, `OY = (H - GH*T)/2 = 18`. Tile `(x,y)` → pixel `(OX + x*T, OY + y*T)`.
- `state.mode` ∈ `"menu" | "playing" | "win" | "fail"` — these strings ARE the diagnostic `phase`.
- All logic is deterministic: hand-authored levels, waypoint patrols, no `Math.random()` / `Date.now()` in the sim.
- Per-task verification leans on browser checks, the diagnostic hooks, and the final gauntlet (matching the chrome-convoy / metro-dash plan pattern). The implementer should verify behaviour with a throwaway headless Playwright probe (delete before committing), then rely on the gauntlet.

---

### Task 1: HTML shell — head, runtime shim, canvas, HUD, controls, help

**Files:**
- Create: `websites/nightwire.html`

- [ ] **Step 1: Create the file with the full static scaffold**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Nightwire — Workshop Arcade</title>
<!-- workshop-meta:start -->
<!-- workshop-meta:end -->
<!-- workshop-jsonld:start -->
<!-- workshop-jsonld:end -->
<link rel="icon" href="data:," />
<style>
  :root{
    --bg:#06111e; --panel:#0b1d2f; --panel2:#10283f;
    --cyan:#67e8f9; --lime:#a3e635; --gold:#facc15; --pink:#fb7185;
    --line:rgba(103,232,249,.28); --ink:#e7fbff;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; min-height:100dvh; color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
    display:grid; place-items:center; gap:10px; padding:12px;
    overscroll-behavior:none; -webkit-user-select:none; user-select:none;
    background:
      radial-gradient(820px 520px at 8% -14%, rgba(103,232,249,.20), transparent 62%),
      radial-gradient(780px 480px at 95% 0%, rgba(251,113,133,.15), transparent 65%),
      linear-gradient(180deg,#06111e,#030713 86%);
  }
  .wrap{width:min(96vw,760px); display:grid; gap:10px}
  .brand{display:flex; align-items:baseline; gap:10px}
  .eyebrow{color:var(--cyan); font-size:10px; font-weight:950; letter-spacing:.2em; text-transform:uppercase}
  .title{font-size:clamp(22px,4vw,34px); font-weight:950; text-transform:uppercase; margin:0; line-height:1}
  .hud{display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px}
  .pill{
    border:1px solid var(--line); border-radius:10px; padding:7px 8px;
    background:linear-gradient(180deg,var(--panel2),var(--panel));
    box-shadow:0 14px 34px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.06);
  }
  .label{color:var(--cyan); font-size:9px; font-weight:950; letter-spacing:.12em; text-transform:uppercase}
  .value{font-size:16px; font-weight:950; font-variant-numeric:tabular-nums}
  .good{color:var(--lime)} .hot{color:var(--gold)} .bad{color:var(--pink)}
  .stage{position:relative; border-radius:14px; overflow:hidden; border:1px solid var(--line); background:#020912}
  canvas#game{display:block; width:100%; height:auto; aspect-ratio:16/9; touch-action:none; background:#020912}
  .status{min-height:18px; text-align:center; font-weight:800; font-size:13px; color:var(--cyan)}
  .controls{display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
  .btn{
    border:1px solid var(--line); border-radius:10px; padding:9px 14px; cursor:pointer;
    color:var(--ink); font-weight:900; font-size:13px;
    background:linear-gradient(180deg,var(--panel2),var(--panel));
  }
  .btn:active{transform:translateY(1px)}
  .btn.primary{background:linear-gradient(180deg,#0e7490,#155e75); border-color:rgba(103,232,249,.5)}
  /* touch action buttons overlaid bottom-right of the stage */
  .touch{position:absolute; right:8px; bottom:8px; display:none; gap:6px; pointer-events:none}
  .touch .tbtn{pointer-events:auto; border:1px solid var(--line); border-radius:9px; padding:8px 10px;
    font-weight:900; font-size:12px; color:var(--ink); background:rgba(11,29,47,.86)}
  body.touch-on .touch{display:flex}
  .overlay{position:fixed; inset:0; display:none; place-items:center; background:rgba(2,9,18,.74); z-index:50}
  .overlay.show{display:grid}
  .card{width:min(92vw,470px); background:linear-gradient(180deg,var(--panel2),var(--panel));
    border:1px solid var(--line); border-radius:16px; padding:20px; box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .card h2{margin:0 0 12px; font-size:20px}
  .card .row{display:flex; justify-content:space-between; gap:12px; margin:7px 0; font-size:14px}
  .card kbd{background:#0a1c2e; border:1px solid var(--line); border-bottom-width:3px; border-radius:7px; padding:2px 8px; font-weight:800}
  @media(max-width:600px){ .hud{grid-template-columns:repeat(3,minmax(0,1fr))} .brand{display:none} }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="eyebrow">Workshop Arcade</span><h1 class="title">Nightwire</h1></div>
  <div class="hud">
    <div class="pill"><div class="label">Stage</div><div class="value" id="stageValue">1 / 5</div></div>
    <div class="pill"><div class="label">Alarm</div><div class="value good" id="alarmValue">0%</div></div>
    <div class="pill"><div class="label">AP</div><div class="value" id="apValue">••</div></div>
    <div class="pill"><div class="label">Lures</div><div class="value" id="luresValue">2</div></div>
    <div class="pill"><div class="label">Score</div><div class="value" id="scoreValue">0</div></div>
    <div class="pill"><div class="label">Best</div><div class="value" id="bestValue">0</div></div>
  </div>
  <div class="stage">
    <canvas id="game" width="960" height="540" tabindex="0"
      aria-label="Nightwire turn-based tactical stealth. Move a single infiltrator one tile at a time across a neon grid, staying out of amber guard vision cones. Spend two action points per turn to step, throw a distraction to lure a guard, or silently take down a guard from its blind side. Grab the asset and reach the exit across five stages without the alarm filling."></canvas>
    <div class="touch" id="touchLayer" aria-hidden="true">
      <button class="tbtn" id="distractBtn" type="button">Distract</button>
      <button class="tbtn" id="endTurnBtn" type="button">End Turn</button>
    </div>
  </div>
  <div class="status" id="status" aria-live="polite"></div>
  <div class="controls">
    <button class="btn primary" id="startBtn" type="button">Start</button>
    <button class="btn" id="restartBtn" type="button">Restart</button>
    <button class="btn" id="soundBtn" type="button" aria-pressed="true">Sound: On</button>
    <button class="btn" id="fullBtn" type="button">Fullscreen</button>
    <button class="btn" id="helpBtn" type="button">Help</button>
  </div>
</div>

<div class="overlay" id="helpOverlay" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
  <div class="card">
    <h2 id="helpTitle">How to play</h2>
    <div class="row"><span>Move (1 AP)</span><span><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> / <kbd>WASD</kbd> / tap a tile</span></div>
    <div class="row"><span>Take down (2 AP)</span><span><kbd>F</kbd> next to a guard's blind side / tap it</span></div>
    <div class="row"><span>Distract (1 AP)</span><span><kbd>Q</kbd> + a direction</span></div>
    <div class="row"><span>End turn</span><span><kbd>Space</kbd> / <kbd>E</kbd></span></div>
    <div class="row"><span>Peek cones</span><span>hold <kbd>Shift</kbd></span></div>
    <div class="row"><span>Start / Restart</span><span><kbd>Enter</kbd> / <kbd>R</kbd></span></div>
    <p style="font-size:13px;color:#9fd6e6;margin:12px 0 0">Stay out of amber cones. Take guards down from behind — but a body in a cone re-trips the alarm. Grab the asset, reach the exit, stay unseen.</p>
    <button class="btn primary" id="helpClose" type="button" style="margin-top:14px;width:100%">Close</button>
  </div>
</div>

<script src="workshop-runtime.js"></script>
<script>
"use strict";
// Implementation added in later tasks.
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the static shell**

Open `websites/nightwire.html` in a browser. Expected: "Workshop Arcade / Nightwire" brand, a 6-pill HUD, an empty dark 16:9 canvas, status line, control buttons. DevTools console: **no errors** (note: `workshop-runtime.js` resolves to `websites/workshop-runtime.js`, which exists).

- [ ] **Step 3: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add HTML shell, HUD, controls, and help overlay"
```

---

### Task 2: Engine scaffold — helpers, storage, audio, state, draw loop

**Files:**
- Modify: `websites/nightwire.html` (replace the `// Implementation added in later tasks.` comment)

- [ ] **Step 1: Element cache, math helpers, defensive storage**

```javascript
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });
const W = 960, H = 540;
const GW = 14, GH = 9, T = 56, OX = (W - GW * T) / 2, OY = (H - GH * T) / 2;

const els = {
  stage: $("stageValue"), alarm: $("alarmValue"), ap: $("apValue"), lures: $("luresValue"),
  score: $("scoreValue"), best: $("bestValue"), status: $("status"),
  start: $("startBtn"), restart: $("restartBtn"), sound: $("soundBtn"),
  full: $("fullBtn"), help: $("helpBtn"), helpClose: $("helpClose"), helpOverlay: $("helpOverlay"),
  distract: $("distractBtn"), endTurn: $("endTurnBtn"),
};

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const key = (x, y) => x + "," + y;

// Defensive storage via the shared workshop-runtime.js shim — mirrors bulwark-burst.html.
function storage() {
  if (window.workshopStorage) return window.workshopStorage;
  try { return window.localStorage; } catch (_) { return null; }
}
function readStore(k, fb) {
  const s = storage(); if (!s) return fb;
  try { const v = s.getItem(k); return v === null ? fb : v; } catch (_) { return fb; }
}
function writeStore(k, v) {
  const s = storage(); if (!s) return;
  try { s.setItem(k, String(v)); } catch (_) {}
}
const BEST_KEY = "nightwire:best";
const SOUND_KEY = "nightwire:sound";
```

- [ ] **Step 2: Web Audio tone helper**

```javascript
let audio = null;
function ensureAudio() {
  if (!state.sound || audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}
function tone(freq, dur = 0.07, gain = 0.035, type = "triangle") {
  if (!state.sound) return;
  ensureAudio(); if (!audio) return;
  const osc = audio.createOscillator(), amp = audio.createGain(), now = audio.currentTime;
  osc.type = type; osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(now); osc.stop(now + dur + 0.02);
}
```

- [ ] **Step 3: Constants and state object**

```javascript
const MAX_AP = 2, BASE_VISION = 3, ALERT_VISION = 4;
const ALARM_SPOT = 34, ALARM_DECAY = 4, ALARM_MAX = 100, ALERT_THRESH = 50;
const HEAR_RANGE = 4, LURES_PER_STAGE = 2, INVEST_TURNS = 2, ALERT_BIAS_TURNS = 2;
const TOTAL_STAGES = 5;
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

const state = {
  mode: "menu",            // menu | playing | win | fail  (== diagnostic phase)
  stage: 0,                // 0-based
  turn: 0,
  ap: MAX_AP,
  agent: { x: 1, y: 1 },
  walls: new Set(),        // "x,y"
  asset: { x: 0, y: 0, taken: false },
  assetHeld: false,
  exit: { x: 0, y: 0 },
  guards: [],              // {id,x,y,dir,patrol:[[x,y]...],wp,down,invest,investTurns}
  bodies: [],              // {x,y}
  lures: [],               // {x,y}
  distractsLeft: LURES_PER_STAGE,
  cones: new Set(),        // "x,y" cone cells, recomputed each draw
  alarm: 0,
  alert: false,
  lastSeen: null,          // {x,y}
  biasTurns: 0,
  pendingDistract: false,  // armed: next direction throws a lure
  peek: false,
  score: 0, combo: 1, best: 0,
  sound: true,
  feedback: "", feedbackTimer: 0,
  lastEvent: "",
};
state.best = Number(readStore(BEST_KEY, 0)) || 0;
state.sound = readStore(SOUND_KEY, "1") !== "0";
```

- [ ] **Step 4: Feedback, HUD, draw stub, render loop**

```javascript
function setFeedback(text, dur = 1.6) { state.feedback = text; state.feedbackTimer = dur; els.status.textContent = text; }

function syncHud() {
  els.stage.textContent = Math.min(state.stage + 1, TOTAL_STAGES) + " / " + TOTAL_STAGES;
  els.alarm.textContent = Math.round(state.alarm) + "%";
  els.alarm.className = "value " + (state.alarm >= ALERT_THRESH ? "bad" : state.alarm > 0 ? "hot" : "good");
  els.ap.textContent = state.mode === "playing" ? ("•".repeat(state.ap) + "·".repeat(MAX_AP - state.ap)) : "—";
  els.lures.textContent = String(state.distractsLeft);
  els.score.textContent = String(Math.round(state.score));
  els.best.textContent = String(Math.round(state.best));
  els.sound.textContent = "Sound: " + (state.sound ? "On" : "Off");
  els.sound.setAttribute("aria-pressed", state.sound ? "true" : "false");
  els.start.textContent = state.mode === "playing" ? "Infiltrating"
    : state.mode === "win" ? "Play Again" : state.mode === "fail" ? "Retry" : "Start";
}

function draw() {
  ctx.fillStyle = "#020912"; ctx.fillRect(0, 0, W, H);
  // grid/cones/agent added in later tasks
  if (state.mode !== "playing") drawOverlay();
}
function drawOverlay() {
  ctx.fillStyle = "rgba(2,9,18,.62)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e7fbff"; ctx.textAlign = "center";
  ctx.font = "950 40px system-ui,Segoe UI,Arial";
  const titles = { menu: "Nightwire", win: "Extracted", fail: "Caught" };
  ctx.fillText(titles[state.mode] || "Nightwire", W / 2, H / 2 - 14);
  ctx.font = "800 18px system-ui,Segoe UI,Arial"; ctx.fillStyle = "#67e8f9";
  const hint = state.mode === "menu" ? "Press Enter or tap to start"
    : state.mode === "win" ? "Enter / R to play again" : "Enter / R to retry";
  ctx.fillText(hint, W / 2, H / 2 + 22);
}

let lastFrame = 0;
function loop(ts) {
  if (!lastFrame) lastFrame = ts;
  const dt = clamp((ts - lastFrame) / 1000, 0, 0.05); lastFrame = ts;
  if (state.feedbackTimer > 0) state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
  draw(); syncHud();
  requestAnimationFrame(loop);
}
syncHud(); draw(); requestAnimationFrame(loop);
```

- [ ] **Step 2..4 verify + commit**

Reload: dark canvas with the "Nightwire / Press Enter or tap to start" overlay, HUD reads `1 / 5`, alarm `0%`, AP `—`. No console errors.

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add engine scaffold, storage shim, audio, state, draw loop"
```

---

### Task 3: Level data + parser

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Add the five hand-authored levels (ASCII maps + guard waypoints) and a parser**

Legend: `#` wall · `.` floor · `A` agent start · `*` asset · `E` exit · digits `1`–`4` mark a guard's *start* tile (its `patrol[0]`). Each map is `GH=9` rows of `GW=14` chars. Guard facing + patrol waypoints are given per level; a guard steps one tile per guard-turn toward its current waypoint, looping. No RNG.

```javascript
const LEVELS = [
  { // Stage 1 — teach movement + a single patrol
    map: [
      "##############",
      "#A...........#",
      "#.####.####..#",
      "#....1.....*.#",
      "#.####.####..#",
      "#............#",
      "#.####.####..#",
      "#E..........#",
      "##############",
    ],
    guards: [{ dir: "E", patrol: [[5, 3], [11, 3], [5, 3], [1, 3]] }],
  },
  { // Stage 2 — introduce takedown: a guard with its back turnable
    map: [
      "##############",
      "#A....#......#",
      "#.###.#.###..#",
      "#...1.#...2..#",
      "#.###.#.###..#",
      "#.....#....*.#",
      "#.###.#.###..#",
      "#E....#......#",
      "##############",
    ],
    guards: [
      { dir: "E", patrol: [[4, 3], [4, 7], [4, 1], [4, 3]] },
      { dir: "W", patrol: [[10, 3], [8, 3], [10, 3], [12, 3]] },
    ],
  },
  { // Stage 3 — distractions + body risk: two crossing patrols
    map: [
      "##############",
      "#A.....#.....#",
      "#.####.#.###.#",
      "#.1..........#",
      "#.####.#.###.#",
      "#......#...*.#",
      "#.####.#.###.#",
      "#.2.........E#",
      "##############",
    ],
    guards: [
      { dir: "E", patrol: [[2, 3], [12, 3], [2, 3]] },
      { dir: "E", patrol: [[2, 7], [12, 7], [2, 7]] },
    ],
  },
  { // Stage 4 — denser patrols + alert escalation
    map: [
      "##############",
      "#A...#....#..#",
      "#.##.#.##.#..#",
      "#..1...2.....#",
      "#.##.#.##.#..#",
      "#....#...#.*.#",
      "#.##.#.##.#3.#",
      "#E...#.......#",
      "##############",
    ],
    guards: [
      { dir: "E", patrol: [[3, 3], [11, 3], [3, 3], [1, 3]] },
      { dir: "W", patrol: [[7, 3], [7, 7], [7, 1], [7, 3]] },
      { dir: "N", patrol: [[11, 6], [11, 1], [11, 6], [11, 7]] },
    ],
  },
  { // Stage 5 — finale: four guards, a patrol covering the exit
    map: [
      "##############",
      "#A..#....#...#",
      "#.#.#.##.#.#.#",
      "#.1.....2..*.#",
      "#.#.#.##.#.#.#",
      "#...#3...#...#",
      "#.#.#.##.#.#4#",
      "#E.....#.....#",
      "##############",
    ],
    guards: [
      { dir: "E", patrol: [[2, 3], [10, 3], [2, 3]] },
      { dir: "W", patrol: [[7, 3], [7, 7], [7, 3], [7, 1]] },
      { dir: "E", patrol: [[5, 5], [11, 5], [5, 5], [1, 5]] },
      { dir: "N", patrol: [[11, 6], [11, 1], [1, 1], [1, 7], [11, 7]] },
    ],
  },
];

function loadLevel(i) {
  const lv = LEVELS[i];
  state.walls = new Set();
  state.guards = []; state.bodies = []; state.lures = [];
  state.distractsLeft = LURES_PER_STAGE;
  let gi = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const c = lv.map[y][x];
      if (c === "#") state.walls.add(key(x, y));
      else if (c === "A") state.agent = { x, y };
      else if (c === "*") state.asset = { x, y, taken: false };
      else if (c === "E") state.exit = { x, y };
      else if (c >= "1" && c <= "9") {
        const g = lv.guards[gi++];
        state.guards.push({ id: Number(c), x, y, dir: g.dir, patrol: g.patrol, wp: 1, down: false, invest: null, investTurns: 0 });
      }
    }
  }
  state.assetHeld = false; state.alarm = 0; state.alert = false; state.lastSeen = null; state.biasTurns = 0;
  state.ap = MAX_AP; state.pendingDistract = false;
}

const isWall = (x, y) => x < 0 || y < 0 || x >= GW || y >= GH || state.walls.has(key(x, y));
const guardAt = (x, y) => state.guards.find((g) => !g.down && g.x === x && g.y === y);
```

- [ ] **Step 2: Verify the maps parse** — temporarily add `loadLevel(0); state.mode="playing";` before `syncHud();` at the boot line, reload, confirm no console error, then **remove that temporary line** (Task 5 wires real start). (Nothing visible yet — rendering comes in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add five deterministic levels and the map parser"
```

---

### Task 4: Grid, walls, asset, exit, agent rendering

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Add tile/board renderers**

```javascript
const px = (x) => OX + x * T, py = (y) => OY + y * T;

function drawBoard() {
  // floor + grid
  ctx.fillStyle = "#04161a"; ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (isWall(x, y)) {
      ctx.fillStyle = "#0e2030"; ctx.fillRect(px(x), py(y), T, T);
      ctx.strokeStyle = "rgba(103,232,249,.18)"; ctx.lineWidth = 1; ctx.strokeRect(px(x) + .5, py(y) + .5, T - 1, T - 1);
    } else {
      ctx.fillStyle = ((x + y) & 1) ? "#0a1622" : "#0b1a28"; ctx.fillRect(px(x), py(y), T, T);
    }
  }
  // exit
  ctx.fillStyle = state.assetHeld ? "#a3e635" : "rgba(163,230,53,.35)";
  ctx.fillRect(px(state.exit.x) + 8, py(state.exit.y) + 8, T - 16, T - 16);
  ctx.fillStyle = "#04161a"; ctx.font = "900 12px system-ui"; ctx.textAlign = "center";
  ctx.fillText("EXIT", px(state.exit.x) + T / 2, py(state.exit.y) + T / 2 + 4);
  // asset
  if (!state.asset.taken) {
    ctx.fillStyle = "#facc15"; ctx.beginPath();
    ctx.arc(px(state.asset.x) + T / 2, py(state.asset.y) + T / 2, 12, 0, Math.PI * 2); ctx.fill();
  }
}

function drawAgent() {
  const cx = px(state.agent.x) + T / 2, cy = py(state.agent.y) + T / 2;
  ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0a3a44"; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
}
```

- [ ] **Step 2: Call them from `draw()`** — replace the `// grid/cones/agent added in later tasks` comment with:

```javascript
  if (state.mode !== "menu") { drawBoard(); /* cones (Task 6) */ /* bodies+guards (Task 6) */ drawAgent(); }
```

- [ ] **Step 3: Verify** — temporarily set `loadLevel(0); state.mode="playing";` at boot again, reload: a 14×9 neon grid with walls, a gold asset dot, a green EXIT tile, and the cyan agent. Remove the temporary line. No console errors.

- [ ] **Step 4: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): render grid, walls, asset, exit, and agent"
```

---

### Task 5: Turn structure, AP, player movement, run lifecycle

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Run lifecycle**

```javascript
function focusCanvas() { canvas.focus({ preventScroll: true }); }
function startRun() {
  ensureAudio();
  if (state.mode === "playing") return;
  state.mode = "playing"; state.stage = 0; state.score = 0; state.combo = 1;
  state.turn = 0; loadLevel(0);
  setFeedback("Stage 1 — infiltrate.", 1.6); focusCanvas();
}
function restartRun() { ensureAudio(); state.mode = "playing"; state.stage = 0; state.score = 0; state.combo = 1; state.turn = 0; loadLevel(0); setFeedback("Restarted.", 1.0); focusCanvas(); }
function commitBest() { if (state.score > state.best) { state.best = Math.round(state.score); writeStore(BEST_KEY, state.best); } }
function failRun(reason) {
  if (state.mode !== "playing") return;
  state.mode = "fail"; commitBest(); setFeedback((reason || "Caught") + " — Enter to retry", 4); tone(90, 0.4, 0.05, "sawtooth");
}
```

- [ ] **Step 2: Player movement + AP + end-turn (guard resolution stubbed until Task 6)**

```javascript
function tryMove(dx, dy) {
  if (state.mode !== "playing" || state.ap <= 0) return;
  const nx = state.agent.x + dx, ny = state.agent.y + dy;
  if (isWall(nx, ny) || guardAt(nx, ny)) return;
  state.agent.x = nx; state.agent.y = ny; state.ap -= 1; state.lastEvent = "move";
  pickups();
  if (cellInCones(nx, ny)) onSpotted();          // step-into-cone detection (Task 7 defines these)
  if (state.ap <= 0) endTurn();
}
function pickups() {
  if (!state.asset.taken && state.agent.x === state.asset.x && state.agent.y === state.asset.y) {
    state.asset.taken = true; state.assetHeld = true; state.lastEvent = "asset"; setFeedback("Asset secured.", 1.2); tone(880, 0.09, 0.04, "triangle");
  }
  if (state.assetHeld && state.agent.x === state.exit.x && state.agent.y === state.exit.y) advanceStage();
}
function endTurn() {
  if (state.mode !== "playing") return;
  guardsTurn();                                  // Task 6
  if (state.mode !== "playing") return;
  state.turn += 1; state.ap = MAX_AP; state.pendingDistract = false;
}
// Temporary stubs so this task runs before Task 6/7 land them; replaced there.
function guardsTurn() {}
function cellInCones() { return false; }
function onSpotted() {}
function advanceStage() {}  // replaced in Task 9
```

- [ ] **Step 3: Input wiring (steer/fire/start/end-turn/peek)**

```javascript
function setPeek(on) { state.peek = on; }
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") { e.preventDefault(); moveOrDistract(-1, 0); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); moveOrDistract(1, 0); }
  else if (k === "arrowup" || k === "w") { e.preventDefault(); moveOrDistract(0, -1); }
  else if (k === "arrowdown" || k === "s") { e.preventDefault(); moveOrDistract(0, 1); }
  else if (k === " " || k === "e") { e.preventDefault(); if (state.mode === "playing") endTurn(); }
  else if (k === "shift") { setPeek(true); }
  else if (k === "enter" || k === "r") { e.preventDefault(); if (state.mode !== "playing") startRun(); else if (k === "r") restartRun(); }
  // f (takedown) and q (distract-arm) wired in Task 8
});
document.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "shift") setPeek(false); });

function moveOrDistract(dx, dy) {
  if (state.pendingDistract) { throwLure(dx, dy); return; }   // throwLure defined in Task 8
  tryMove(dx, dy);
}
function throwLure() {}  // replaced in Task 8

els.start.addEventListener("click", startRun);
els.restart.addEventListener("click", restartRun);
els.endTurn.addEventListener("click", () => { if (state.mode === "playing") endTurn(); else startRun(); });
canvas.addEventListener("pointerdown", (e) => {
  if (state.mode !== "playing") { startRun(); return; }
  // tap-to-step / tap-guard handled in Task 8 (needs takedown); for now, tap an adjacent floor tile steps
  const rect = canvas.getBoundingClientRect();
  const gx = Math.floor(((e.clientX - rect.left) / rect.width * W - OX) / T);
  const gy = Math.floor(((e.clientY - rect.top) / rect.height * H - OY) / T);
  const dx = gx - state.agent.x, dy = gy - state.agent.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) tryMove(dx, dy);
});
```

- [ ] **Step 4: Verify** — reload, press Enter. Expected: agent steps with arrows/WASD, two steps then the turn ends and AP resets (watch the AP pill go `••`→`•·`→`—`/`••`); walking onto the asset shows "Asset secured" and the EXIT brightens. No guard motion yet. No console errors.

- [ ] **Step 5: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add turn structure, action points, and player movement"
```

---

### Task 6: Guards — patrol movement, facing, vision cones

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Patrol stepping + the real `guardsTurn` (replaces the Task 5 stub)**

Delete the temporary `function guardsTurn() {}` from Task 5 and add:

```javascript
function stepToward(g, tx, ty) {
  const dx = tx - g.x, dy = ty - g.y;
  let mx = 0, my = 0;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) mx = Math.sign(dx);
  else if (dy !== 0) my = Math.sign(dy);
  else if (dx !== 0) mx = Math.sign(dx);
  if (mx === 0 && my === 0) return;
  const nx = g.x + mx, ny = g.y + my;
  if (isWall(nx, ny) || guardAt(nx, ny)) return;     // blocked: hold position this turn
  g.x = nx; g.y = ny;
  g.dir = mx > 0 ? "E" : mx < 0 ? "W" : my > 0 ? "S" : "N";
}
function lureInHearing(g) {
  let best = null, bestD = HEAR_RANGE + 1;
  for (const L of state.lures) {
    const d = Math.abs(L.x - g.x) + Math.abs(L.y - g.y);
    if (d <= HEAR_RANGE && d < bestD) { bestD = d; best = L; }
  }
  return best;
}
function moveGuard(g) {
  if (g.invest) {                                   // investigating a body
    stepToward(g, g.invest.x, g.invest.y);
    if (--g.investTurns <= 0) g.invest = null;
    return;
  }
  const lure = lureInHearing(g);
  if (lure) { stepToward(g, lure.x, lure.y); return; }
  if (state.alert && state.lastSeen && state.biasTurns > 0 && g === nearestGuard(state.lastSeen)) {
    stepToward(g, state.lastSeen.x, state.lastSeen.y); return;
  }
  const wp = g.patrol[g.wp];
  if (g.x === wp[0] && g.y === wp[1]) g.wp = (g.wp + 1) % g.patrol.length;
  const t = g.patrol[g.wp];
  stepToward(g, t[0], t[1]);
}
function nearestGuard(p) {
  let best = null, bestD = 1e9;
  for (const g of state.guards) { if (g.down) continue; const d = Math.abs(g.x - p.x) + Math.abs(g.y - p.y); if (d < bestD || (d === bestD && best && g.id < best.id)) { bestD = d; best = g; } }
  return best;
}
```

- [ ] **Step 2: Vision cone computation with line-of-sight**

```javascript
function losClear(x0, y0, x1, y1) {           // walls block sight; endpoints excluded from blocking
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (state.walls.has(key(x, y))) return false;
  }
  return true;
}
function coneCells(g) {
  const cells = new Set(); const [fx, fy] = DIRS[g.dir]; const px2 = -fy, py2 = fx;  // perpendicular
  const range = state.alert ? ALERT_VISION : BASE_VISION;
  for (let k = 1; k <= range; k++) {
    const spread = k - 1;                       // widens with distance
    for (let s = -spread; s <= spread; s++) {
      const cx = g.x + fx * k + px2 * s, cy = g.y + fy * k + py2 * s;
      if (isWall(cx, cy)) continue;
      if (losClear(g.x, g.y, cx, cy)) cells.add(key(cx, cy));
    }
  }
  return cells;
}
function computeCones() {
  state.cones = new Set();
  for (const g of state.guards) { if (g.down) continue; for (const c of coneCells(g)) state.cones.add(c); }
}
function cellInCones(x, y) { computeCones(); return state.cones.has(key(x, y)); }
```

(Note: `cellInCones` here **replaces** the Task 5 temporary stub — delete that stub.)

- [ ] **Step 3: Wire `guardsTurn` (real version) and render guards + cones + bodies**

Add the real `guardsTurn` (it calls detection from Task 7, stubbed here until Task 7 lands `resolveDetection`):

```javascript
function guardsTurn() {
  for (const g of state.guards) { if (!g.down) moveGuard(g); }
  computeCones();
  resolveDetection();                            // Task 7 (temporary stub below)
  if (state.biasTurns > 0) state.biasTurns--;
  for (const L of state.lures) L.age = (L.age || 0) + 1;
  state.lures = state.lures.filter((L) => (L.age || 0) < 1);   // a lure lasts one guard turn
}
function resolveDetection() {}                   // replaced in Task 7
```

Rendering — add `drawCones`, `drawGuards`, `drawBodies`, and call them in `draw()`:

```javascript
function drawCones() {
  if (state.mode !== "playing") return;
  computeCones();
  ctx.fillStyle = state.alert ? "rgba(251,113,133,.20)" : "rgba(250,204,21,.16)";
  for (const c of state.cones) { const [x, y] = c.split(",").map(Number); ctx.fillRect(px(x), py(y), T, T); }
}
function drawBodies() {
  ctx.fillStyle = "rgba(148,163,184,.5)";
  for (const b of state.bodies) { ctx.beginPath(); ctx.arc(px(b.x) + T / 2, py(b.y) + T / 2, 13, 0, Math.PI * 2); ctx.fill(); }
}
function drawGuards() {
  for (const g of state.guards) {
    if (g.down) continue;
    const cx = px(g.x) + T / 2, cy = py(g.y) + T / 2;
    ctx.fillStyle = g.invest ? "#fb7185" : "#f59e0b";
    ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
    const [fx, fy] = DIRS[g.dir];                 // facing tick
    ctx.strokeStyle = "#1b1206"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + fx * 12, cy + fy * 12); ctx.stroke();
  }
}
```

In `draw()`, change the Task 4 line to:

```javascript
  if (state.mode !== "menu") { drawBoard(); drawCones(); drawBodies(); drawGuards(); drawAgent(); }
```

- [ ] **Step 4: Verify** — reload, press Enter, end a few turns (Space). Guards advance along patrols, rotate to face travel, and project amber cones that respect walls. No console errors.

- [ ] **Step 5: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add guard patrols, facing, and line-of-sight vision cones"
```

---

### Task 7: Detection, alarm meter, alert escalation

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Real detection (replaces the Task 6 `resolveDetection` stub and the Task 5 `onSpotted` stub)**

```javascript
function raiseAlarm(n, reason) {
  state.alarm = clamp(state.alarm + n, 0, ALARM_MAX);
  state.combo = 1; state.lastEvent = reason || "spotted";
  if (state.alarm >= ALARM_MAX) { failRun("Alarm maxed"); return; }
  state.alert = state.alarm >= ALERT_THRESH;
  state.lastSeen = { x: state.agent.x, y: state.agent.y }; state.biasTurns = ALERT_BIAS_TURNS;
}
function onSpotted() {                              // immediate (player stepped into a cone)
  raiseAlarm(ALARM_SPOT, "spotted"); setFeedback("Spotted!", 1.2); tone(180, 0.16, 0.05, "sawtooth");
}
function resolveDetection() {                        // end of guards' turn
  let spotted = false;
  if (state.cones.has(key(state.agent.x, state.agent.y))) spotted = true;
  // bodies seen by a live cone → spike + that guard investigates
  for (const b of state.bodies) {
    if (state.cones.has(key(b.x, b.y))) {
      const g = nearestGuard(b);
      if (g && !g.invest) { g.invest = { x: b.x, y: b.y }; g.investTurns = INVEST_TURNS; }
      raiseAlarm(ALARM_SPOT, "body"); setFeedback("Body spotted!", 1.2); tone(160, 0.18, 0.05, "sawtooth");
    }
  }
  if (spotted) { raiseAlarm(ALARM_SPOT, "spotted"); setFeedback("Spotted!", 1.2); tone(180, 0.16, 0.05, "sawtooth"); }
  else { state.alarm = Math.max(0, state.alarm - ALARM_DECAY); state.alert = state.alarm >= ALERT_THRESH; }
}
```

(Delete the temporary `function onSpotted() {}` from Task 5 and `function resolveDetection() {}` from Task 6.)

- [ ] **Step 2: Verify** — reload, press Enter, deliberately step into a cone (or end turns until a cone sweeps onto you). Alarm pill rises by 34 and flashes "Spotted!"; at ≥50% the cones turn pink and gain a tile of range; let it reach 100% to confirm "Caught" fail + restart. Unseen turns tick the alarm down by 4. No console errors.

- [ ] **Step 3: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add detection, alarm meter, and alert escalation"
```

---

### Task 8: Tactical verbs — takedown, distract, peek, bodies

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Takedown (replaces no prior code; adds `F` + adjacency/flank check)**

```javascript
function adjacentGuard() {
  for (const d in DIRS) { const [dx, dy] = DIRS[d]; const g = guardAt(state.agent.x + dx, state.agent.y + dy); if (g) return g; }
  return null;
}
function inGuardCone(g, x, y) { return coneCells(g).has(key(x, y)); }
function tryTakedown() {
  if (state.mode !== "playing" || state.ap < 2) return;
  const g = adjacentGuard();
  if (!g) { setFeedback("No guard adjacent.", 0.8); return; }
  if (inGuardCone(g, state.agent.x, state.agent.y)) { setFeedback("In its sights — can't sneak up.", 1.0); return; }
  g.down = true; state.bodies.push({ x: g.x, y: g.y }); state.ap = 0;
  state.lastEvent = "takedown"; setFeedback("Guard down.", 1.0); tone(220, 0.1, 0.045, "square");
  endTurn();
}
```

- [ ] **Step 2: Distract (arm with `Q`, then a direction throws a lure) — replaces the Task 5 `throwLure` stub**

```javascript
function armDistract() {
  if (state.mode !== "playing" || state.ap < 1) return;
  if (state.distractsLeft <= 0) { setFeedback("No lures left.", 0.8); return; }
  state.pendingDistract = true; setFeedback("Distract: pick a direction.", 1.2);
}
function throwLure(dx, dy) {
  state.pendingDistract = false;
  if (state.distractsLeft <= 0 || state.ap < 1) return;
  const lx = state.agent.x + dx, ly = state.agent.y + dy;
  if (isWall(lx, ly)) { setFeedback("Blocked — pick another direction.", 1.0); return; }
  state.lures.push({ x: lx, y: ly, age: 0 }); state.distractsLeft -= 1; state.ap -= 1;
  state.lastEvent = "distract"; setFeedback("Lure thrown.", 1.0); tone(520, 0.07, 0.03);
  if (state.ap <= 0) endTurn();
}
```

(Delete the temporary `function throwLure() {}` from Task 5.)

- [ ] **Step 3: Wire `F`/`Q` keys and touch buttons / tap-guard**

In the `keydown` handler add two branches (inside the same listener, before the `enter`/`r` branch):

```javascript
  else if (k === "f") { e.preventDefault(); tryTakedown(); }
  else if (k === "q") { e.preventDefault(); armDistract(); }
```

Update the `canvas` `pointerdown` handler's playing branch so a tap on an adjacent guard takes it down, else steps:

```javascript
  const tappedGuard = guardAt(gx, gy);
  if (tappedGuard && Math.abs(gx - state.agent.x) + Math.abs(gy - state.agent.y) === 1) { tryTakedown(); return; }
  if (Math.abs(dx) + Math.abs(dy) === 1) tryMove(dx, dy);
```

Wire the Distract touch button:

```javascript
els.distract.addEventListener("click", () => { if (state.mode === "playing") armDistract(); });
```

- [ ] **Step 4: Peek rendering** — in `drawCones`, when `state.peek` is true, also outline the cones brighter so the player can read them before moving. Append inside `drawCones` after the fill loop:

```javascript
  if (state.peek) { ctx.strokeStyle = "rgba(231,251,255,.5)"; ctx.lineWidth = 2; for (const c of state.cones) { const [x, y] = c.split(",").map(Number); ctx.strokeRect(px(x) + 1, py(y) + 1, T - 2, T - 2); } }
```

- [ ] **Step 5: Verify** — reload, play: step beside a guard's back and press F → "Guard down", a grey body appears, turn ends. Press Q then a direction → a lure appears and on the next guard turn the nearest guard diverts to it. End turns until a live cone passes over a body → "Body spotted!" + alarm spike + that guard turns pink and walks to the body. Hold Shift to outline cones. No console errors.

- [ ] **Step 6: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add takedowns, distractions, peek, and body risk"
```

---

### Task 9: Asset, stage progression, win/fail, scoring

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Stage progression + win + scoring (replaces the Task 5 `advanceStage` stub)**

```javascript
let stageUnseen = true;   // tracks Ghost bonus for the current stage
function advanceStage() {
  // score the cleared stage
  const base = 400, ghost = stageUnseen ? 250 : 0;
  const eff = Math.max(0, 180 - state.turn * 8);
  state.score += (base + ghost + eff) * state.combo;
  state.combo = Math.min(6, state.combo + 1);
  state.lastEvent = "stage-clear";
  if (state.stage + 1 >= TOTAL_STAGES) { winRun(); return; }
  state.stage += 1; state.turn = 0; loadLevel(state.stage); stageUnseen = true;
  setFeedback("Stage " + (state.stage + 1) + ".", 1.3); tone(660, 0.1, 0.04, "triangle");
}
function winRun() { state.mode = "win"; commitBest(); setFeedback("Extracted! Enter to play again", 5); tone(523, 0.12, 0.05, "triangle"); }
```

- [ ] **Step 2: Track "unseen" for the Ghost bonus** — in `raiseAlarm`, set `stageUnseen = false;` (any alarm rise breaks the ghost run). Add that one line at the top of `raiseAlarm`'s body. Also reset `stageUnseen = true;` inside `startRun`/`restartRun` (after `loadLevel(0)`).

- [ ] **Step 3: Verify** — reload, clear stage 1 (grab asset, reach exit) → "Stage 2" with a score bump; a fully-unseen clear should award noticeably more (Ghost bonus). Clear all five → "Extracted!" and Best persists across reload. Getting caught restarts the run. No console errors.

- [ ] **Step 4: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add stage progression, win/fail, and ghost-bonus scoring"
```

---

### Task 10: Sound toggle, fullscreen, help dialog, touch enable

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Enable touch buttons on coarse pointers + sound/fullscreen**

```javascript
if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) document.body.classList.add("touch-on");

els.sound.addEventListener("click", () => {
  state.sound = !state.sound; writeStore(SOUND_KEY, state.sound ? "1" : "0");
  if (state.sound) { ensureAudio(); tone(520, 0.07, 0.03); } syncHud();
});
els.full.addEventListener("click", async () => {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); else await document.exitFullscreen?.(); } catch (_) {}
});
```

- [ ] **Step 2: Help dialog with focus trap, Escape, focus restore**

```javascript
let helpReturn = null;
function openHelp() { helpReturn = document.activeElement; els.helpOverlay.classList.add("show"); els.helpClose.focus(); }
function closeHelp() { els.helpOverlay.classList.remove("show"); if (helpReturn && helpReturn.focus) helpReturn.focus(); }
els.help.addEventListener("click", openHelp);
els.helpClose.addEventListener("click", closeHelp);
els.helpOverlay.addEventListener("click", (e) => { if (e.target === els.helpOverlay) closeHelp(); });
document.addEventListener("keydown", (e) => {
  if (!els.helpOverlay.classList.contains("show")) return;
  if (e.key === "Escape") { e.preventDefault(); closeHelp(); }
  if (e.key === "Tab") { e.preventDefault(); els.helpClose.focus(); }
});
```

- [ ] **Step 3: Verify** — Sound toggles + persists; Fullscreen enters/exits; Help opens (focus to Close), Escape/Close dismiss and restore focus; in a mobile viewport the Distract / End Turn buttons show and work. No console errors.

- [ ] **Step 4: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add sound, fullscreen, help dialog, and touch controls"
```

---

### Task 11: Diagnostic hooks (render_game_to_text + advanceTime)

**Files:**
- Modify: `websites/nightwire.html`

- [ ] **Step 1: Snapshot + hooks**

```javascript
function snapshot() {
  return {
    game: "nightwire",
    phase: state.mode,
    stage: Math.min(state.stage + 1, TOTAL_STAGES), totalStages: TOTAL_STAGES,
    turn: state.turn, ap: state.ap, maxAp: MAX_AP,
    agent: { x: state.agent.x, y: state.agent.y },
    alarm: Math.round(state.alarm), alertLevel: state.alert ? "alert" : "calm",
    assetHeld: state.assetHeld, asset: { x: state.asset.x, y: state.asset.y, taken: state.asset.taken },
    exit: { x: state.exit.x, y: state.exit.y },
    guards: state.guards.slice(0, 8).map((g) => ({ id: g.id, x: g.x, y: g.y, dir: g.dir, vision: state.alert ? ALERT_VISION : BASE_VISION, down: g.down, investigating: !!g.invest })),
    bodies: state.bodies.map((b) => ({ x: b.x, y: b.y })),
    distractsLeft: state.distractsLeft, lures: state.lures.map((L) => ({ x: L.x, y: L.y })),
    score: Math.round(state.score), combo: state.combo, best: Math.round(state.best),
    sound: state.sound, feedback: state.feedback, feedbackActive: state.feedbackTimer > 0,
    lastEvent: state.lastEvent,
    coordinateSystem: "grid in tiles, origin top-left, x right, y down; dir is guard facing; you are spotted in a guard's vision cone with clear line-of-sight; take guards down from their flank/back (not while in their cone); grab the asset then reach exit; alarm 100 = caught",
  };
}
function renderText() { return JSON.stringify(snapshot()); }
function advanceTime(ms) {
  const sec = clamp(Number(ms) || 0, 0, 10000) / 1000;
  if (state.feedbackTimer > 0) state.feedbackTimer = Math.max(0, state.feedbackTimer - sec);
  draw(); syncHud(); return renderText();
}
window.render_game_to_text = renderText;
window.advanceTime = advanceTime;
```

- [ ] **Step 2: Verify in the console**

Reload, then in DevTools:

```javascript
JSON.parse(render_game_to_text()).phase            // "menu"
startBtn.click(); JSON.parse(render_game_to_text()) // phase "playing", stage 1, ap 2, guards[...]
```

Dispatch a couple of `ArrowRight` keydowns and confirm `agent.x` increases and `ap` decreases deterministically; reload and repeat to confirm identical results (determinism). No console errors.

- [ ] **Step 3: Commit**

```bash
git add websites/nightwire.html
git commit -m "feat(nightwire): add render_game_to_text and advanceTime diagnostics"
```

---

### Task 12: SVG cover art

**Files:**
- Create: `covers/nightwire.svg`

- [ ] **Step 1: Create the 640×360 neon cover**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06111e"/><stop offset="1" stop-color="#030713"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <!-- grid fragment -->
  <g stroke="rgba(103,232,249,.18)" stroke-width="1" fill="none">
    <rect x="300" y="60" width="300" height="240"/>
    <line x1="360" y1="60" x2="360" y2="300"/><line x1="420" y1="60" x2="420" y2="300"/>
    <line x1="480" y1="60" x2="480" y2="300"/><line x1="540" y1="60" x2="540" y2="300"/>
    <line x1="300" y1="120" x2="600" y2="120"/><line x1="300" y1="180" x2="600" y2="180"/><line x1="300" y1="240" x2="600" y2="240"/>
  </g>
  <!-- guard vision cone -->
  <polygon points="510,150 600,90 600,210" fill="rgba(250,204,21,.18)"/>
  <circle cx="510" cy="150" r="14" fill="#f59e0b"/>
  <!-- asset + exit -->
  <circle cx="450" cy="210" r="11" fill="#facc15"/>
  <rect x="312" y="252" width="36" height="36" rx="4" fill="rgba(163,230,53,.5)"/>
  <!-- infiltrator -->
  <circle cx="330" cy="90" r="15" fill="#22d3ee"/><circle cx="330" cy="90" r="6" fill="#0a3a44"/>
  <!-- title -->
  <text x="40" y="150" font-family="'Segoe UI',Arial,sans-serif" font-size="56" font-weight="900" fill="#67e8f9" letter-spacing="2">NIGHT</text>
  <text x="40" y="208" font-family="'Segoe UI',Arial,sans-serif" font-size="56" font-weight="900" fill="#e7fbff" letter-spacing="2">WIRE</text>
  <text x="42" y="240" font-family="'Segoe UI',Arial,sans-serif" font-size="13" fill="#a3e635" letter-spacing="3">TACTICS · STEALTH</text>
</svg>
```

- [ ] **Step 2: Verify** — open `covers/nightwire.svg`: a neon grid with a cyan infiltrator, an amber guard + cone, a gold asset, a green exit, and the "NIGHTWIRE" title. (OG card generated in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add covers/nightwire.svg
git commit -m "feat(nightwire): add SVG cover art"
```

---

### Task 13: Manifest entry, meta injection, fallback-catalog regen

**Files:**
- Modify: `websites/manifest.json`
- Modify (generated): `websites/nightwire.html` (meta blocks), `index.html`, `sitemap.xml`, `feed.json`, `covers/og-image.svg`
- Create (generated): `covers/og/nightwire.svg`

- [ ] **Step 1: Append the manifest entry** as the **last** array element in `websites/manifest.json` (add a comma after the current last entry):

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

- [ ] **Step 2: Regenerate meta, sitemap, feed, OG images**

```powershell
npm run inject:meta
npm run build:sitemap
npm run build:feed
npm run build:og-images
```

Expected: `inject:meta` fills the meta + JSON-LD blocks in `nightwire.html`; `build:og-images` creates `covers/og/nightwire.svg` + refreshes `covers/og-image.svg`; sitemap/feed updated. No errors.

- [ ] **Step 3: Sync fallback catalog + validate**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
```

Expected: `-Fix` rewrites `FALLBACK_GAMES` in `index.html`; strict run prints success with **0 errors**.

- [ ] **Step 4: Verify** — open `index.html`: a "Nightwire" card with cover appears; the `Tactics` and `Stealth` filter chips now read **4**. No console errors.

- [ ] **Step 5: Commit**

```bash
git add websites/manifest.json websites/nightwire.html index.html sitemap.xml feed.json covers/og-image.svg covers/og/nightwire.svg
git commit -m "feat(nightwire): register in manifest, meta, sitemap, feed, OG, and fallback catalog"
```

---

### Task 14: Capture recipe + service-worker bump

**Files:**
- Modify: `scripts/capture-games.mjs`
- Modify: `sw.js`

- [ ] **Step 1: Add the capture recipe** to the `recipes` map in `scripts/capture-games.mjs` (insert alongside the others, e.g. right after the `"chrome-convoy"` entry):

```javascript
    "nightwire": {
      name: "start, approach a guard's blind side, and take it down",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const press = (key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
          document.querySelector("#startBtn")?.click();
          window.advanceTime(120);
          // Stage 1 guard patrols the middle row; step down toward it and take it down from behind.
          press("ArrowDown"); press("ArrowDown"); window.advanceTime(120);
          press("f");                       // takedown if adjacent + flankable
          window.advanceTime(300);
        });
      },
    },
```

(The exact key sequence may need a tile or two of adjustment so the agent ends adjacent to the stage-1 guard's blind side; tune against `render_game_to_text()` until `lastEvent` is `"takedown"` or the agent is simply mid-infiltration with `feedbackActive` true — either reaches a representative non-menu frame that scores 0.)

- [ ] **Step 2: Verify recipe**

```powershell
node --check scripts/capture-games.mjs
npm run test:capture-recipes
```

Expected: valid syntax; preflight passes for all manifest games.

- [ ] **Step 3: Bump the service-worker shell revision** — in `sw.js`, the shell hash is **content-derived** and verified by `check-pwa.mjs`. Get the expected value first:

```powershell
npm run test:pwa
```

It will fail with `SHELL_REVISION is shell-XXXX, expected shell-YYYY from current install-time shell assets`. Set `sw.js` accordingly — bump `VERSION` from `wa-v42` to `wa-v43` and set both `SHELL_REVISION` and the hash in `VERSION` to the expected `shell-YYYY`:

```javascript
const SHELL_REVISION = 'shell-YYYY';            // the value check-pwa.mjs reported as expected
const VERSION = 'wa-v43-shell-YYYY';
```

Then re-run `npm run test:pwa` → passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-games.mjs sw.js
git commit -m "feat(nightwire): add capture recipe and bump service-worker shell revision"
```

---

### Task 15: Full verification gauntlet + baseline + changelog

**Files:**
- Modify: `docs/performance-baseline.md`, `progress.md`

- [ ] **Step 1: Fast gates**

```powershell
npm test
```

Expected: all fast `test:*` gates PASS — including `test:storage-contract` (the `workshop-runtime.js` include is present), `test:tag-coverage` (weakest tag now ≥4; Tactics + Stealth at 4), `test:game-contract`, `test:capture-recipes`, `test:pwa`, `test:cover-assets`, `test:a11y`. Exit 0. Note: `test:performance-baseline` will FAIL until Step 3 — that's expected; fix it there.

- [ ] **Step 2: Browser + render + perf gates**

```powershell
npm run test:games
npm run capture:games:ci
npm run test:pwa-runtime
npm run test:runtime-storage
npm run audit:perf:local
```

Expected: `test:games` passes for all 83 games; `capture:games:ci` reports **max render score 0** (incl. nightwire desktop+mobile); pwa-runtime + runtime-storage pass; `audit:perf:local` passes with Nightwire within the ~25–35 KB / 2-request budget and zero console/page errors. Record Nightwire's transfer KB from the audit report for Step 3.

- [ ] **Step 3: Update the performance baseline** — add a NEW pass section at the **top** of `docs/performance-baseline.md` (above the most recent section), modeled on the existing latest section, citing **83 manifest games** and **84 pages total**, with a table that includes Catalog, Lexica, Idle Tycoon, Arcade Jump, Brick Breaker, and Nightwire rows (use the real numbers from the Step 2 audit). Then re-run `npm run test:performance-baseline` → passes, and re-run `npm test` to confirm all fast gates are green.

- [ ] **Step 4: Changelog** — add a dated section at the top of `progress.md` mirroring the existing latest entry: Nightwire added as game #83 lifting Tactics + Stealth off the floor (both 3→4, clearing the floor entirely); the turn-based 2-AP infiltration with takedowns/distractions/alarm; integration (cover, manifest, generated surfaces, capture recipe, SW bump `wa-v42`→`wa-v43`); and the verification commands that passed with headline numbers (83 games, capture max score 0, KB/requests).

- [ ] **Step 5: Final commit**

```bash
git add docs/performance-baseline.md progress.md
git commit -m "docs(nightwire): record game #83 pass in perf baseline and progress log"
```

---

## Self-Review

**Spec coverage** (spec section → task):
- Overview / single-file / KB budget → Tasks 1–2, 15.
- Goal & tag rationale (Tactics+Stealth → 4) → Task 13 (tags) + Task 15 (`test:tag-coverage`).
- Technical approach / determinism / storage shim → Task 2 (storage via `workshop-runtime.js`, no-RNG state) + Task 3 (hand-authored `LEVELS`, waypoint patrols).
- Core model & turn structure (single agent, 2-AP reactive) → Tasks 2, 5.
- Guards/vision/detection (cones, LoS, alarm, escalation) → Tasks 6, 7.
- Tactical verbs (takedown/distract/bodies/peek) → Task 8.
- Objective/stages/win-fail/scoring (asset gate, 5 stages, Ghost bonus) → Tasks 5 (pickups), 9.
- Controls/HUD/states/a11y → Tasks 1, 2 (HUD/states), 5/8 (inputs), 10 (sound/fullscreen/help/focus-trap).
- Diagnostics schema → Task 11 (snapshot matches the spec field-for-field).
- Manifest/cover/OG → Tasks 12, 13.
- Integration footprint (7 hand-edited) → game html (1–11), cover (12), manifest+sw+recipe+progress+baseline (13–15); generated surfaces regenerated in 13.
- Verification gauntlet → Task 15.
- Out-of-scope (full-run restart, single agent, no ranged combat, no hunt-AI beyond bias, hand-authored levels) → respected; not implemented.

**Placeholder scan:** No "TBD/TODO". Intentional, fully-specified deferrals: the `sw.js` hash (Task 14 Step 3 gets the exact expected value from `check-pwa.mjs`), the capture recipe key-sequence tuning (Task 14 Step 1 says how to tune against the diagnostic), and the `progress.md` / baseline prose (Tasks 15 Steps 3–4 specify required content) — all content the engineer writes by matching an existing pattern, not missing logic.

**Type/name consistency:** `state` shape defined once (Task 2) and reused. Functions named consistently across tasks: `startRun`/`restartRun`/`failRun`/`winRun`/`advanceStage`, `tryMove`/`pickups`/`endTurn`, `guardsTurn`/`moveGuard`/`stepToward`/`coneCells`/`computeCones`/`cellInCones`, `resolveDetection`/`raiseAlarm`/`onSpotted`, `tryTakedown`/`adjacentGuard`/`inGuardCone`/`armDistract`/`throwLure`, `snapshot`/`renderText`/`advanceTime`, `drawBoard`/`drawCones`/`drawGuards`/`drawBodies`/`drawAgent`. Each temporary stub (`guardsTurn`, `cellInCones`, `onSpotted`, `advanceStage`, `throwLure`, `resolveDetection`) is introduced in an early task and **explicitly deleted/replaced** in the task that lands the real version (called out at each site to avoid duplicate-definition bugs). `state.mode` strings (`menu/playing/win/fail`) are used identically in logic, `drawOverlay`, `syncHud`, and the diagnostic `phase`.
