# Chrome Convoy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Chrome Convoy — a Spy-Hunter-style combat racer (free-steer, gun + ram, five deterministic stretches) — as game #81 in the Workshop Arcade catalog, lifting the `Racing` and `Shooter` tags off the coverage floor.

**Architecture:** A single self-contained `websites/chrome-convoy.html` (inline CSS + JS, Canvas 2D, no remote requests) on a fixed 960×540 internal canvas scaled by CSS, mirroring the current game idiom (slipstream-sprint / bulwark-burst). Vertically scrolling road; the player car is fixed near the bottom and steers horizontally; threats stream downward from deterministic hardcoded spawn tables; a heat-limited cannon plus free ram destroys rivals; a 4-segment armor bar gates failure. Then the standard catalog integration (cover, manifest, generated surfaces, capture recipe, service-worker bump) and verification gauntlet.

**Tech Stack:** Vanilla HTML5 + Canvas 2D + Web Audio API. Node + Playwright test harness already in the repo. PowerShell `validate-catalog.ps1` for catalog sync.

**Reference files to mirror (read these first):** `websites/slipstream-sprint.html` (racing/scroll/steer + touch), `websites/bulwark-burst.html` (shooter + heat + waves + diagnostics), `docs/game-contract.md` (the contract), `docs/superpowers/specs/2026-06-04-chrome-convoy-design.md` (this spec).

**Conventions used in this plan:**
- The game uses a fixed internal resolution `W = 960, H = 540`; CSS scales the canvas to fit. All sim coordinates are normalized: `playerX`, threat `x` ∈ [0,1] across the road; threat `y` ∈ [0,1] from far (top) to the player row (bottom).
- `state.mode` ∈ `"menu" | "playing" | "win" | "fail"` — these strings ARE the diagnostic `phase` values (matches the spec schema 1:1, no translation layer).
- Verification leans on browser checks + the diagnostic hooks (run snippets in DevTools console) per task, with the full automated gauntlet at the end — matching the existing metro-dash plan pattern.

---

### Task 1: HTML shell — head, brand, canvas, HUD, controls, help overlay

**Files:**
- Create: `websites/chrome-convoy.html`

- [ ] **Step 1: Create the file with the full static scaffold**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Chrome Convoy — Workshop Arcade</title>
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
  .wrap{width:min(96vw,720px); display:grid; gap:10px}
  .brand{display:flex; align-items:baseline; gap:10px}
  .eyebrow{color:var(--cyan); font-size:10px; font-weight:950; letter-spacing:.2em; text-transform:uppercase}
  .title{font-size:clamp(22px,4vw,34px); font-weight:950; text-transform:uppercase; margin:0; line-height:1}
  .hud{display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px}
  .pill{
    border:1px solid var(--line); border-radius:10px; padding:7px 8px;
    background:linear-gradient(180deg,var(--panel2),var(--panel));
    box-shadow:0 14px 34px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.06);
  }
  .label{color:var(--cyan); font-size:9px; font-weight:950; letter-spacing:.12em; text-transform:uppercase}
  .value{font-size:17px; font-weight:950; font-variant-numeric:tabular-nums}
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
  /* On-screen touch controls overlaid on the stage */
  .touch{position:absolute; inset:0; display:none; pointer-events:none}
  .touch .zone{position:absolute; top:0; bottom:0; width:34%; pointer-events:auto}
  .touch .zone.left{left:0} .touch .zone.right{right:0}
  .touch .fire{position:absolute; right:10px; bottom:10px; width:84px; height:84px; border-radius:50%;
    pointer-events:auto; border:2px solid rgba(103,232,249,.6); color:var(--ink); font-weight:900;
    background:radial-gradient(circle at 50% 35%, rgba(103,232,249,.35), rgba(11,29,47,.9));}
  body.touch-on .touch{display:block}
  /* Help dialog */
  .overlay{position:fixed; inset:0; display:none; place-items:center; background:rgba(2,9,18,.74); z-index:50}
  .overlay.show{display:grid}
  .card{width:min(92vw,460px); background:linear-gradient(180deg,var(--panel2),var(--panel));
    border:1px solid var(--line); border-radius:16px; padding:20px; box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .card h2{margin:0 0 12px; font-size:20px}
  .card .row{display:flex; justify-content:space-between; gap:12px; margin:7px 0; font-size:14px}
  .card kbd{background:#0a1c2e; border:1px solid var(--line); border-bottom-width:3px; border-radius:7px; padding:2px 8px; font-weight:800}
  @media(max-width:560px){
    .hud{grid-template-columns:repeat(3,minmax(0,1fr))}
    .brand{display:none}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span class="eyebrow">Workshop Arcade</span><h1 class="title">Chrome Convoy</h1></div>
  <div class="hud">
    <div class="pill"><div class="label">Stretch</div><div class="value" id="stretchValue">1 / 5</div></div>
    <div class="pill"><div class="label">Armor</div><div class="value good" id="armorValue">4</div></div>
    <div class="pill"><div class="label">Heat</div><div class="value" id="heatValue">0%</div></div>
    <div class="pill"><div class="label">Score</div><div class="value" id="scoreValue">0</div></div>
    <div class="pill"><div class="label">Best</div><div class="value" id="bestValue">0</div></div>
  </div>
  <div class="stage">
    <canvas id="game" width="960" height="540" tabindex="0"
      aria-label="Chrome Convoy combat racer. Steer a neon interceptor left and right across a scrolling road, fire a heat-limited cannon at red rival cars ahead, ram them off the road, dodge armored blockers, oil slicks and the road edges, avoid white civilian traffic, grab repair tokens, and clear five stretches without losing all four armor segments."></canvas>
    <div class="touch" id="touchLayer" aria-hidden="true">
      <div class="zone left" id="zoneLeft"></div>
      <div class="zone right" id="zoneRight"></div>
      <button class="fire" id="fireBtn" type="button">FIRE</button>
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
    <div class="row"><span>Steer</span><span><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> / hold screen sides</span></div>
    <div class="row"><span>Fire cannon</span><span><kbd>Space</kbd> / <kbd>↑</kbd> / FIRE</span></div>
    <div class="row"><span>Ram</span><span>steer into a rival</span></div>
    <div class="row"><span>Start / Restart</span><span><kbd>Enter</kbd> / <kbd>R</kbd></span></div>
    <p style="font-size:13px;color:#9fd6e6;margin:12px 0 0">Destroy red rivals, dodge armored blockers, oil and the road edges. Don't gun white civilians. Clear five stretches.</p>
    <button class="btn primary" id="helpClose" type="button" style="margin-top:14px;width:100%">Close</button>
  </div>
</div>

<script>
"use strict";
// Implementation added in later tasks.
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the static shell renders**

Open `websites/chrome-convoy.html` in a browser. Expected: the "Workshop Arcade / Chrome Convoy" brand, a 5-pill HUD row, an empty dark 16:9 canvas panel, a status line, and the control buttons. Open DevTools → Console; expected: **no errors**.

- [ ] **Step 3: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add HTML shell, HUD, controls, and help overlay"
```

---

### Task 2: Engine scaffold — helpers, storage, audio, state, loop

**Files:**
- Modify: `websites/chrome-convoy.html` (inside the `<script>` block, replacing the `// Implementation added in later tasks.` comment)

- [ ] **Step 1: Add element cache, math helpers, and the defensive storage wrapper**

```javascript
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });
const W = 960, H = 540;

const els = {
  stretch: $("stretchValue"), armor: $("armorValue"), heat: $("heatValue"),
  score: $("scoreValue"), best: $("bestValue"), status: $("status"),
  start: $("startBtn"), restart: $("restartBtn"), sound: $("soundBtn"),
  full: $("fullBtn"), help: $("helpBtn"), helpClose: $("helpClose"),
  helpOverlay: $("helpOverlay"), fire: $("fireBtn"),
  zoneLeft: $("zoneLeft"), zoneRight: $("zoneRight"),
};

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const lerp = (a, b, t) => a + (b - a) * t;
const round = (v) => Math.round(v * 100) / 100;

// Defensive storage (sandboxed play can block native localStorage) — mirrors slipstream-sprint.html.
function storage() {
  if (window.workshopStorage) return window.workshopStorage;
  try { return window.localStorage; } catch (_) { return null; }
}
function readStore(key, fallback) {
  const s = storage();
  if (!s) return fallback;
  try { const v = s.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; }
}
function writeStore(key, value) {
  const s = storage();
  if (!s) return;
  try { s.setItem(key, String(value)); } catch (_) {}
}
const BEST_KEY = "chrome-convoy:best";
const SOUND_KEY = "chrome-convoy:sound";
```

- [ ] **Step 2: Add the Web Audio tone helper (gated on sound)**

```javascript
let audio = null;
function ensureAudio() {
  if (!state.sound || audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}
function tone(freq, dur = 0.07, gain = 0.035, type = "triangle") {
  if (!state.sound) return;
  ensureAudio();
  if (!audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const now = audio.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}
```

- [ ] **Step 3: Add the state object and tuning constants**

```javascript
const MAX_ARMOR = 4;
const TOTAL_STRETCHES = 5;
const ROAD_W = 520;                 // road band width in canvas px
const ROAD_L = (W - ROAD_W) / 2;    // 220
const ROAD_R = ROAD_L + ROAD_W;     // 740
const PLAYER_Y = H - 92;            // fixed player row (px)
const TOP_Y = 36;                   // where threats enter
const CAR_W = 46, CAR_H = 78;       // car footprint (px)
const STEER_ACCEL = 5.2;            // per second, in normalized units
const STEER_DAMP = 8.0;             // velocity damping
const STRETCH_MS = 18000;           // ms of scroll to clear one stretch
const HEAT_PER_SHOT = 0.16;
const HEAT_VENT = 0.42;             // per second
const FIRE_CD = 0.16;               // s between shots
const SHOT_SPEED = 1.9;             // normalized y per second (upward)

const state = {
  mode: "menu",        // menu | playing | win | fail  (also the diagnostic phase)
  stretch: 0,          // 0-based
  dist: 0,             // 0..1 progress through current stretch
  checkpoint: 0,       // stretches cleared
  armor: MAX_ARMOR,
  heat: 0, overheated: false, cool: 0,
  score: 0, combo: 1, best: 0,
  playerX: 0.5, vx: 0, steer: 0,
  firing: false, fireCd: 0,
  shots: [],           // {x, y}  x:0..1 across road, y:0..1 up from player
  threats: [],         // {id,type,x,y,hp,maxHp,dead}
  spawnIdx: 0,
  sound: true,
  feedback: "", feedbackTimer: 0,
  lastInput: "", lastEvent: "",
  nextId: 1,
};
state.best = Number(readStore(BEST_KEY, 0)) || 0;
state.sound = readStore(SOUND_KEY, "1") !== "0";
```

- [ ] **Step 4: Add stub update/draw/syncHud/setFeedback and the main loop**

```javascript
function setFeedback(text, dur = 1.6) {
  state.feedback = text; state.feedbackTimer = dur;
  els.status.textContent = text;
}

function syncHud() {
  els.stretch.textContent = (Math.min(state.stretch + 1, TOTAL_STRETCHES)) + " / " + TOTAL_STRETCHES;
  els.armor.textContent = String(state.armor);
  els.armor.className = "value " + (state.armor > 2 ? "good" : state.armor > 1 ? "hot" : "bad");
  els.heat.textContent = Math.round(state.heat * 100) + "%";
  els.heat.className = "value " + (state.overheated ? "bad" : state.heat > 0.6 ? "hot" : "");
  els.score.textContent = String(Math.round(state.score));
  els.best.textContent = String(Math.round(state.best));
  els.sound.textContent = "Sound: " + (state.sound ? "On" : "Off");
  els.sound.setAttribute("aria-pressed", state.sound ? "true" : "false");
  els.start.textContent = state.mode === "playing" ? "Driving"
    : state.mode === "win" ? "Drive Again" : state.mode === "fail" ? "Retry" : "Start";
}

function update(dt) {
  if (state.feedbackTimer > 0) state.feedbackTimer = Math.max(0, state.feedbackTimer - dt);
  // movement/combat/threats added in later tasks
}

function draw() {
  ctx.fillStyle = "#020912";
  ctx.fillRect(0, 0, W, H);
  // road/player/threats added in later tasks
  if (state.mode !== "playing") drawOverlay();
}

function drawOverlay() {
  ctx.fillStyle = "rgba(2,9,18,.62)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e7fbff";
  ctx.textAlign = "center";
  ctx.font = "950 40px system-ui,Segoe UI,Arial";
  const titles = { menu: "Chrome Convoy", win: "Convoy Cleared", fail: "Wrecked" };
  ctx.fillText(titles[state.mode] || "Chrome Convoy", W / 2, H / 2 - 14);
  ctx.font = "800 18px system-ui,Segoe UI,Arial";
  ctx.fillStyle = "#67e8f9";
  const hint = state.mode === "menu" ? "Press Enter or tap to start"
    : state.mode === "win" ? "Enter / R to drive again" : "Enter / R to retry";
  ctx.fillText(hint, W / 2, H / 2 + 22);
}

let lastFrame = 0;
function loop(ts) {
  if (!lastFrame) lastFrame = ts;
  const dt = Math.min(0.05, Math.max(0, (ts - lastFrame) / 1000));
  lastFrame = ts;
  if (state.mode === "playing") update(dt);
  draw();
  syncHud();
  requestAnimationFrame(loop);
}
syncHud();
draw();
requestAnimationFrame(loop);
```

- [ ] **Step 5: Verify the loop boots**

Reload in browser. Expected: the canvas paints a dark field with the "Chrome Convoy" + "Press Enter or tap to start" overlay; HUD reads `1 / 5`, armor `4`, heat `0%`. Console: **no errors**.

- [ ] **Step 6: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add engine scaffold, storage, audio, state, loop"
```

---

### Task 3: Road rendering and vertical scroll

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add a scroll accumulator and road renderer**

Add above `draw()`:

```javascript
let scrollY = 0; // px, advances while playing for lane-dash motion

function drawRoad() {
  // grass/shoulders
  ctx.fillStyle = "#04161a";
  ctx.fillRect(0, 0, W, H);
  // asphalt
  ctx.fillStyle = "#0c1622";
  ctx.fillRect(ROAD_L, 0, ROAD_W, H);
  // glowing edges
  ctx.fillStyle = "#67e8f9";
  ctx.fillRect(ROAD_L - 4, 0, 4, H);
  ctx.fillRect(ROAD_R, 0, 4, H);
  // dashed centre lanes (3 dashed lines), scrolling
  ctx.fillStyle = "rgba(231,251,255,.55)";
  const dash = 34, gap = 30, period = dash + gap;
  for (let i = 1; i <= 2; i++) {
    const x = ROAD_L + (ROAD_W * i / 3) - 3;
    let y = -(scrollY % period);
    for (; y < H; y += period) ctx.fillRect(x, y, 6, dash);
  }
}
```

- [ ] **Step 2: Drive the scroll and stretch progress in `update`**

Replace the `update(dt)` body's comment line with:

```javascript
  // advance the stretch + scroll
  scrollY += dt * 520;
  state.dist = clamp(state.dist + dt * 1000 / STRETCH_MS, 0, 1);
```

- [ ] **Step 3: Call `drawRoad()` from `draw()`**

In `draw()`, replace the `// road/player/threats added in later tasks` comment with:

```javascript
  drawRoad();
```

- [ ] **Step 4: Temporarily allow starting to test scroll**

Add this temporary boot line right before `requestAnimationFrame(loop);` (it will be replaced by real input in Task 4):

```javascript
canvas.addEventListener("pointerdown", () => { if (state.mode !== "playing") { state.mode = "playing"; } });
```

- [ ] **Step 5: Verify scrolling road**

Reload, click the canvas. Expected: dashed lane lines scroll downward, cyan road edges, asphalt band centered. Console: no errors. (Remove nothing yet — Task 4 replaces the temporary listener.)

- [ ] **Step 6: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add scrolling road rendering and stretch progress"
```

---

### Task 4: Player car, free-steer movement, and steering input

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add coordinate helpers and the player renderer**

```javascript
// normalized x (0..1 across road, accounting for car width) -> canvas px (car centre)
function playerPx(x) { return lerp(ROAD_L + CAR_W / 2, ROAD_R - CAR_W / 2, x); }
function threatPx(x) { return lerp(ROAD_L + CAR_W / 2, ROAD_R - CAR_W / 2, x); }
function threatPy(y) { return lerp(TOP_Y, PLAYER_Y, y); }

function drawCar(cx, cy, w, h, body, glass) {
  ctx.fillStyle = body;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = glass;
  ctx.fillRect(cx - w / 2 + 6, cy - h / 2 + 10, w - 12, h * 0.32);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(cx - w / 2 + 4, cy + h / 2 - 10, w - 8, 6);
}

function drawPlayer() {
  const cx = playerPx(state.playerX);
  drawCar(cx, PLAYER_Y, CAR_W, CAR_H, "#22d3ee", "#0a3a44");
  // muzzle glow when firing
  if (state.firing && !state.overheated) {
    ctx.fillStyle = "rgba(250,204,21,.8)";
    ctx.fillRect(cx - 3, PLAYER_Y - CAR_H / 2 - 8, 6, 8);
  }
}
```

- [ ] **Step 2: Add steering physics to `update`**

Append to the `update(dt)` body (after the scroll lines):

```javascript
  // steer with light momentum, clamp to road
  state.vx += state.steer * STEER_ACCEL * dt;
  state.vx -= state.vx * Math.min(1, STEER_DAMP * dt);
  state.playerX = clamp(state.playerX + state.vx * dt, 0, 1);
  if ((state.playerX <= 0 && state.vx < 0) || (state.playerX >= 1 && state.vx > 0)) state.vx = 0;
```

- [ ] **Step 3: Add run lifecycle functions**

```javascript
function resetRun() {
  Object.assign(state, {
    mode: "playing", stretch: 0, dist: 0, checkpoint: 0,
    armor: MAX_ARMOR, heat: 0, overheated: false, cool: 0,
    score: 0, combo: 1, playerX: 0.5, vx: 0, steer: 0,
    firing: false, fireCd: 0, shots: [], threats: [], spawnIdx: 0,
    feedback: "", feedbackTimer: 0, lastEvent: "start", nextId: 1,
  });
  setFeedback("Stretch 1 — go!", 1.4);
}
function startRun() {
  ensureAudio();
  if (state.mode === "playing") return;
  resetRun();
  canvas.focus({ preventScroll: true });
}
```

- [ ] **Step 4: Replace the temporary listener with real steering + start input**

Delete the temporary `canvas.addEventListener("pointerdown", ...)` line from Task 3 Step 4, and add:

```javascript
function setSteer(dir) { state.steer = dir; state.lastInput = "steer:" + dir; }

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") { e.preventDefault(); setSteer(-1); }
  else if (k === "arrowright" || k === "d") { e.preventDefault(); setSteer(1); }
  else if (k === "enter" || k === "r") {
    e.preventDefault();
    if (state.mode !== "playing") startRun(); else if (k === "r") startRun();
  }
});
document.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if ((k === "arrowleft" || k === "a") && state.steer < 0) setSteer(0);
  if ((k === "arrowright" || k === "d") && state.steer > 0) setSteer(0);
});

els.start.addEventListener("click", startRun);
els.restart.addEventListener("click", startRun);
canvas.addEventListener("pointerdown", () => { if (state.mode !== "playing") startRun(); });
```

- [ ] **Step 5: Draw the player**

In `draw()`, add after `drawRoad();`:

```javascript
  if (state.mode !== "menu") drawPlayer();
```

- [ ] **Step 6: Verify steering**

Reload, press Enter. Expected: a cyan car near the bottom; ←/→ (and A/D) steer it smoothly with momentum and it stops at the road edges. Console: no errors.

- [ ] **Step 7: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add player car, free-steer movement, and steering input"
```

---

### Task 5: Cannon — fire input, heat limit, and projectiles

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add fire logic and shot update**

```javascript
function fire() {
  if (state.mode !== "playing" || state.overheated || state.fireCd > 0) return;
  state.shots.push({ x: state.playerX, y: 0 });
  state.fireCd = FIRE_CD;
  state.heat = clamp(state.heat + HEAT_PER_SHOT, 0, 1);
  if (state.heat >= 1) { state.overheated = true; setFeedback("Overheated!", 1.0); tone(120, 0.18, 0.04, "sawtooth"); }
  else tone(680, 0.05, 0.03, "square");
}

function updateShots(dt) {
  state.fireCd = Math.max(0, state.fireCd - dt);
  state.heat = clamp(state.heat - HEAT_VENT * dt, 0, 1);
  if (state.overheated && state.heat <= 0.25) state.overheated = false;
  if (state.firing) fire();
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const s = state.shots[i];
    s.y += SHOT_SPEED * dt;          // travels up the road (toward far end)
    if (s.y > 1.05) state.shots.splice(i, 1);
  }
}

function drawShots() {
  ctx.fillStyle = "#facc15";
  for (const s of state.shots) {
    const px = threatPx(s.x);
    const py = lerp(PLAYER_Y - CAR_H / 2, TOP_Y, s.y);
    ctx.fillRect(px - 2, py - 10, 4, 12);
  }
}
```

- [ ] **Step 2: Wire fire into `update` and `draw`**

In `update(dt)`, append:

```javascript
  updateShots(dt);
```

In `draw()`, add after `drawRoad();` and before `drawPlayer()`:

```javascript
  drawShots();
```

- [ ] **Step 3: Add fire input (keyboard + buttons)**

In the `keydown` handler, add another branch (inside the same listener):

```javascript
  else if (k === " " || k === "arrowup" || k === "w") { e.preventDefault(); state.firing = true; }
```

In the `keyup` handler, add:

```javascript
  if (k === " " || k === "arrowup" || k === "w") state.firing = false;
```

- [ ] **Step 4: Verify firing + heat**

Reload, press Enter, hold Space. Expected: yellow shots stream upward; the Heat pill climbs; holding to 100% shows "Overheated!" and firing stops until heat vents back under ~25%. Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add heat-limited cannon and projectiles"
```

---

### Task 6: Threats — deterministic spawn tables and rendering

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add the five hardcoded per-stretch spawn tables**

Each entry is `{ t, x, type, hp }` where `t` is the progress point (0..1 through the stretch) at which the threat enters at `y=0`, `x` is the lane position (0..1), `type` is one of `rival|blocker|oil|civ|token`, and `hp` applies to destructibles. No RNG — fully deterministic (mirrors bulwark-burst's `waves` arrays).

```javascript
const SPAWNS = [
  // Stretch 1 — light traffic, teach steer + fire
  [ {t:.10,x:.5,type:"rival",hp:1}, {t:.22,x:.2,type:"rival",hp:1}, {t:.34,x:.8,type:"rival",hp:1},
    {t:.46,x:.5,type:"token"}, {t:.60,x:.3,type:"rival",hp:1}, {t:.74,x:.7,type:"rival",hp:1},
    {t:.88,x:.5,type:"rival",hp:1} ],
  // Stretch 2 — add armored blockers
  [ {t:.10,x:.3,type:"rival",hp:1}, {t:.20,x:.7,type:"blocker",hp:3}, {t:.34,x:.5,type:"rival",hp:1},
    {t:.46,x:.15,type:"rival",hp:1}, {t:.55,x:.8,type:"token"}, {t:.64,x:.5,type:"blocker",hp:3},
    {t:.78,x:.35,type:"rival",hp:1}, {t:.90,x:.65,type:"rival",hp:1} ],
  // Stretch 3 — oil + edge pressure
  [ {t:.08,x:.5,type:"oil"}, {t:.18,x:.25,type:"rival",hp:1}, {t:.30,x:.8,type:"oil"},
    {t:.42,x:.5,type:"rival",hp:1}, {t:.52,x:.2,type:"blocker",hp:3}, {t:.60,x:.85,type:"token"},
    {t:.70,x:.5,type:"oil"}, {t:.80,x:.35,type:"rival",hp:1}, {t:.92,x:.7,type:"rival",hp:1} ],
  // Stretch 4 — dense rival weaving + a civilian to avoid
  [ {t:.08,x:.2,type:"rival",hp:1}, {t:.16,x:.8,type:"rival",hp:1}, {t:.26,x:.5,type:"civ"},
    {t:.36,x:.3,type:"rival",hp:1}, {t:.44,x:.7,type:"rival",hp:1}, {t:.52,x:.5,type:"blocker",hp:3},
    {t:.62,x:.85,type:"token"}, {t:.70,x:.2,type:"rival",hp:1}, {t:.80,x:.6,type:"rival",hp:1},
    {t:.90,x:.4,type:"rival",hp:1} ],
  // Stretch 5 — armored-convoy finale
  [ {t:.08,x:.5,type:"blocker",hp:3}, {t:.16,x:.25,type:"rival",hp:2}, {t:.24,x:.75,type:"rival",hp:2},
    {t:.34,x:.5,type:"civ"}, {t:.42,x:.2,type:"blocker",hp:3}, {t:.50,x:.8,type:"blocker",hp:3},
    {t:.58,x:.5,type:"token"}, {t:.66,x:.35,type:"rival",hp:2}, {t:.74,x:.65,type:"rival",hp:2},
    {t:.84,x:.5,type:"rival",hp:2}, {t:.93,x:.3,type:"rival",hp:2} ],
];
const THREAT_SPEED = 0.95; // normalized y per second (toward the player)
```

- [ ] **Step 2: Spawn from the table as the stretch progresses**

```javascript
function updateSpawns() {
  const table = SPAWNS[state.stretch] || [];
  while (state.spawnIdx < table.length && state.dist >= table[state.spawnIdx].t) {
    const def = table[state.spawnIdx];
    state.threats.push({
      id: state.nextId++, type: def.type, x: def.x, y: 0,
      hp: def.hp || 0, maxHp: def.hp || 0, dead: false,
    });
    state.spawnIdx++;
  }
}

function updateThreats(dt) {
  for (let i = state.threats.length - 1; i >= 0; i--) {
    const th = state.threats[i];
    th.y += THREAT_SPEED * dt;
    if (th.y > 1.12 || th.dead) state.threats.splice(i, 1);
  }
}
```

- [ ] **Step 3: Render threats by type**

```javascript
const THREAT_COLOR = {
  rival: ["#fb7185", "#3a0d18"], blocker: ["#94a3b8", "#1e293b"],
  civ: ["#e2e8f0", "#334155"],
};
function drawThreats() {
  for (const th of state.threats) {
    const px = threatPx(th.x), py = threatPy(th.y);
    if (th.type === "oil") {
      ctx.fillStyle = "rgba(20,30,42,.92)"; ctx.beginPath();
      ctx.ellipse(px, py, 34, 16, 0, 0, Math.PI * 2); ctx.fill();
    } else if (th.type === "token") {
      ctx.fillStyle = "#a3e635"; ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#04161a"; ctx.fillRect(px - 7, py - 2, 14, 4); ctx.fillRect(px - 2, py - 7, 4, 14);
    } else {
      const [body, glass] = THREAT_COLOR[th.type] || THREAT_COLOR.rival;
      drawCar(px, py, CAR_W, CAR_H, body, glass);
      if (th.type === "blocker" && th.maxHp > 0) { // armor pips
        ctx.fillStyle = "#facc15";
        for (let p = 0; p < th.hp; p++) ctx.fillRect(px - 15 + p * 11, py - CAR_H / 2 - 6, 8, 4);
      }
    }
  }
}
```

- [ ] **Step 4: Wire spawns/threats into `update` and `draw`**

In `update(dt)`, append (after `updateShots(dt);`):

```javascript
  updateSpawns();
  updateThreats(dt);
```

In `draw()`, add `drawThreats();` after `drawShots();` and before `drawPlayer();`.

- [ ] **Step 5: Verify threats stream**

Reload, press Enter. Expected: red rivals, gray blockers (with yellow armor pips), white civilians, dark oil ellipses, and green repair tokens stream down from the top in the scripted order. Console: no errors.

- [ ] **Step 6: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add deterministic threat spawn tables and rendering"
```

---

### Task 7: Collision, combat resolution, and armor

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add armor-damage and combo helpers**

```javascript
function damage(n, reason) {
  state.armor = clamp(state.armor - n, 0, MAX_ARMOR);
  state.combo = 1;
  state.lastEvent = reason;
  setFeedback(reason, 1.0);
  tone(140, 0.16, 0.04, "sawtooth");
  if (state.armor <= 0) failRun(reason);
}
function killRival(th, viaRam) {
  th.dead = true;
  const base = viaRam ? 90 : 70;
  state.score += base * state.combo;
  state.combo = Math.min(9, state.combo + 1);
  state.lastEvent = viaRam ? "ram-kill" : "gun-kill";
  tone(viaRam ? 220 : 520, 0.09, 0.04, "square");
}
```

- [ ] **Step 2: Add shot↔threat and player↔threat collision**

```javascript
const NEAR_Y = 0.06;      // y half-window for "same row" hits
function overlapX(ax, bx, halfW) { return Math.abs(threatPx(ax) - threatPx(bx)) < halfW; }

function resolveCombat() {
  // shots hit destructibles (rival/blocker)
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const s = state.shots[i];
    for (const th of state.threats) {
      if (th.dead || (th.type !== "rival" && th.type !== "blocker")) continue;
      if (Math.abs(th.y - s.y) < NEAR_Y && overlapX(th.x, s.x, CAR_W * 0.6)) {
        state.shots.splice(i, 1);
        th.hp -= 1;
        if (th.hp <= 0) { if (th.type === "rival") killRival(th, false); else { th.dead = true; state.score += 40; } }
        else tone(300, 0.04, 0.02, "square");
        break;
      }
    }
  }
  // player collides with threats at its row
  for (const th of state.threats) {
    if (th.dead || th.y < 1 - NEAR_Y || th.y > 1 + NEAR_Y) continue;
    if (!overlapX(th.x, state.playerX, CAR_W * 0.82)) continue;
    if (th.type === "token") { th.dead = true; state.armor = clamp(state.armor + 1, 0, MAX_ARMOR); setFeedback("Armor +1", 0.9); tone(880, 0.1, 0.04, "triangle"); }
    else if (th.type === "rival") { killRival(th, true); damage(1, "Rammed a rival"); }
    else if (th.type === "civ") { th.dead = true; state.combo = 1; state.score = Math.max(0, state.score - 60); setFeedback("Hit a civilian! Combo lost", 1.1); tone(180, 0.12, 0.03, "sine"); }
    else if (th.type === "oil") { th.dead = true; state.vx += (state.playerX < 0.5 ? 0.5 : -0.5); setFeedback("Oil slick!", 0.8); }
    else if (th.type === "blocker") { damage(1, "Slammed a blocker"); th.y = 1.2; }
  }
  // road-edge contact chips armor
  if ((state.playerX <= 0.001 || state.playerX >= 0.999) && state.mode === "playing") {
    state.edgeTimer = (state.edgeTimer || 0) + 1;
    if (state.edgeTimer % 30 === 0) damage(1, "Scraped the edge");
  } else state.edgeTimer = 0;
}
```

- [ ] **Step 3: Wire `resolveCombat()` into `update`**

In `update(dt)`, append (after `updateThreats(dt);`):

```javascript
  resolveCombat();
```

- [ ] **Step 4: Add a placeholder `failRun` (replaced fully in Task 8)**

Add temporarily above `resetRun()` so `damage()` resolves:

```javascript
function failRun(reason) { state.mode = "fail"; setFeedback((reason || "Wrecked") + " — Enter to retry", 4); tone(90, 0.4, 0.05, "sawtooth"); }
```

- [ ] **Step 5: Verify combat**

Reload, press Enter. Expected: shooting a red rival destroys it and bumps score; ramming a rival destroys it but drops an armor segment; a blocker needs 3 hits; driving onto a token adds armor; hitting a civilian drops score + combo; hugging an edge slowly chips armor; armor 0 → "Wrecked" overlay. Console: no errors.

- [ ] **Step 6: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add collision, combat resolution, and armor"
```

---

### Task 8: Stretch progression, win/fail, and scoring

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Replace the placeholder `failRun` and add `winRun` + `nextStretch`**

Delete the temporary `failRun` from Task 7 Step 4 and add:

```javascript
function commitBest() {
  if (state.score > state.best) { state.best = Math.round(state.score); writeStore(BEST_KEY, state.best); }
}
function failRun(reason) {
  if (state.mode !== "playing") return;
  state.mode = "fail"; commitBest();
  setFeedback((reason || "Wrecked") + " — Enter to retry", 4);
  tone(90, 0.4, 0.05, "sawtooth");
}
function winRun() {
  state.mode = "win"; state.checkpoint = TOTAL_STRETCHES; commitBest();
  setFeedback("Convoy cleared! Enter to drive again", 5);
  tone(523, 0.12, 0.05, "triangle");
}
function nextStretch() {
  state.checkpoint = state.stretch + 1;
  if (state.checkpoint >= TOTAL_STRETCHES) { winRun(); return; }
  state.stretch++; state.dist = 0; state.spawnIdx = 0; state.threats.length = 0; state.shots.length = 0;
  state.score += 120; // checkpoint bonus
  setFeedback("Stretch " + (state.stretch + 1) + "!", 1.3);
  tone(660, 0.1, 0.04, "triangle");
}
```

- [ ] **Step 2: Trigger stretch completion in `update`**

In `update(dt)`, after the scroll/`state.dist` line in Task 3, add a completion check (append right after `state.dist = clamp(...)`):

```javascript
  if (state.dist >= 1 && state.mode === "playing") nextStretch();
```

- [ ] **Step 3: Add a passive distance score**

In `update(dt)`, append (near the end, after `resolveCombat();`):

```javascript
  state.score += dt * 6 * state.combo; // distance-traveled component
```

- [ ] **Step 4: Verify progression**

Reload, press Enter, and survive. Expected: at the end of each stretch the HUD `Stretch` advances and a "Stretch N!" banner shows; clearing stretch 5 shows "Convoy cleared!"; the Best pill updates and persists across reloads (best score survives F5). Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add stretch progression, win/fail, and scoring"
```

---

### Task 9: Touch controls, sound toggle, fullscreen, and help overlay

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Enable on-screen touch controls when a touch device is detected**

```javascript
if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) {
  document.body.classList.add("touch-on");
}
function bindHold(el, dir) {
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); if (state.mode !== "playing") startRun(); setSteer(dir); });
  const release = () => { if (state.steer === dir) setSteer(0); };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointerleave", release);
  el.addEventListener("pointercancel", release);
}
bindHold(els.zoneLeft, -1);
bindHold(els.zoneRight, 1);
els.fire.addEventListener("pointerdown", (e) => { e.preventDefault(); if (state.mode !== "playing") startRun(); state.firing = true; });
els.fire.addEventListener("pointerup", () => state.firing = false);
els.fire.addEventListener("pointerleave", () => state.firing = false);
```

- [ ] **Step 2: Add the sound toggle**

```javascript
els.sound.addEventListener("click", () => {
  state.sound = !state.sound;
  writeStore(SOUND_KEY, state.sound ? "1" : "0");
  if (state.sound) { ensureAudio(); tone(520, 0.07, 0.03); }
  syncHud();
});
```

- [ ] **Step 3: Add the fullscreen toggle**

```javascript
els.full.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch (_) {}
});
```

- [ ] **Step 4: Add the help dialog with focus trap, Escape, and focus restore**

```javascript
let helpReturn = null;
function openHelp() {
  helpReturn = document.activeElement;
  els.helpOverlay.classList.add("show");
  els.helpClose.focus();
}
function closeHelp() {
  els.helpOverlay.classList.remove("show");
  if (helpReturn && helpReturn.focus) helpReturn.focus();
}
els.help.addEventListener("click", openHelp);
els.helpClose.addEventListener("click", closeHelp);
els.helpOverlay.addEventListener("click", (e) => { if (e.target === els.helpOverlay) closeHelp(); });
document.addEventListener("keydown", (e) => {
  if (!els.helpOverlay.classList.contains("show")) return;
  if (e.key === "Escape") { e.preventDefault(); closeHelp(); }
  if (e.key === "Tab") { e.preventDefault(); els.helpClose.focus(); } // single focusable: trap on it
});
```

- [ ] **Step 5: Verify controls**

Reload. Expected: Sound toggles between On/Off and persists across reload; Fullscreen enters/exits; Help opens (focus moves to Close), Escape and the Close button both dismiss it and restore focus. In a mobile viewport (DevTools device toolbar) the left/right hold zones steer and the FIRE button shoots. Console: no errors.

- [ ] **Step 6: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add touch controls, sound, fullscreen, and help overlay"
```

---

### Task 10: Diagnostic hooks (render_game_to_text + advanceTime)

**Files:**
- Modify: `websites/chrome-convoy.html`

- [ ] **Step 1: Add the snapshot, render text, and deterministic stepper**

Add near the end of the script, after all the above:

```javascript
function snapshot() {
  return {
    game: "chrome-convoy",
    phase: state.mode,                 // menu | playing | win | fail
    stretch: Math.min(state.stretch + 1, TOTAL_STRETCHES),
    totalStretches: TOTAL_STRETCHES,
    distance: round(state.dist),       // 0..1 progress through current stretch
    checkpoint: state.checkpoint,      // stretches cleared
    armor: state.armor, maxArmor: MAX_ARMOR,
    heat: round(state.heat), overheated: state.overheated,
    score: Math.round(state.score), combo: state.combo, best: Math.round(state.best),
    playerX: round(state.playerX),
    threats: state.threats.slice(0, 8).map((t) => ({ type: t.type, x: round(t.x), y: round(t.y), hp: t.hp })),
    shots: state.shots.length,
    sound: state.sound,
    lastInput: state.lastInput, lastEvent: state.lastEvent,
    coordinateSystem: "playerX 0=left road edge ->1=right edge; distance 0->1 is progress through the current stretch; checkpoint counts stretches cleared; threats stream from y=0 (far) to y=1 (at player); fire destroys rivals, ram costs armor, do not destroy civilians; clear 5 stretches to win",
  };
}
function renderText() { return JSON.stringify(snapshot()); }
function stepMs(ms) {
  const total = clamp(Number(ms) || 0, 0, 10000);
  let elapsed = 0;
  while (elapsed < total) {
    const chunk = Math.min(40, total - elapsed) / 1000;
    if (state.mode === "playing") update(chunk);
    elapsed += chunk * 1000;
  }
  draw(); syncHud();
  return renderText();
}
window.render_game_to_text = renderText;
window.advanceTime = stepMs;
```

- [ ] **Step 2: Verify the hooks in the console**

Reload, then in DevTools console run:

```javascript
JSON.parse(render_game_to_text()).phase        // expect "menu"
startBtn.click(); advanceTime(2000);            // step 2s of play deterministically
JSON.parse(render_game_to_text())               // expect phase:"playing", armor:4, threats:[...], distance ~0.11
```

Expected: the first returns `"menu"`; after starting and advancing, `phase` is `"playing"`, `distance` advanced deterministically, and `threats` lists streamed entries with `type/x/y`. Run `advanceTime(2000)` twice more and confirm `distance` increases identically on repeated reloads (determinism). Console: no errors.

- [ ] **Step 3: Commit**

```bash
git add websites/chrome-convoy.html
git commit -m "feat(chrome-convoy): add render_game_to_text and advanceTime diagnostics"
```

---

### Task 11: SVG cover art

**Files:**
- Create: `covers/chrome-convoy.svg`

- [ ] **Step 1: Create the 640×360 neon cover**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#06111e"/><stop offset="1" stop-color="#030713"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <!-- road band -->
  <rect x="210" y="0" width="220" height="360" fill="#0c1622"/>
  <rect x="206" y="0" width="4" height="360" fill="#67e8f9"/>
  <rect x="430" y="0" width="4" height="360" fill="#67e8f9"/>
  <!-- lane dashes -->
  <g fill="rgba(231,251,255,.5)">
    <rect x="281" y="30" width="6" height="34"/><rect x="281" y="94" width="6" height="34"/>
    <rect x="281" y="158" width="6" height="34"/><rect x="281" y="222" width="6" height="34"/>
    <rect x="353" y="30" width="6" height="34"/><rect x="353" y="94" width="6" height="34"/>
    <rect x="353" y="158" width="6" height="34"/><rect x="353" y="222" width="6" height="34"/>
  </g>
  <!-- rivals ahead (red) -->
  <g>
    <rect x="240" y="120" width="40" height="66" rx="6" fill="#fb7185"/><rect x="246" y="130" width="28" height="20" fill="#3a0d18"/>
    <rect x="360" y="90" width="40" height="66" rx="6" fill="#fb7185"/><rect x="366" y="100" width="28" height="20" fill="#3a0d18"/>
  </g>
  <!-- player interceptor (cyan) + tracer -->
  <rect x="299" y="252" width="46" height="78" rx="7" fill="#22d3ee"/>
  <rect x="305" y="264" width="34" height="24" fill="#0a3a44"/>
  <rect x="319" y="150" width="6" height="100" fill="#facc15" opacity=".85"/>
  <!-- title -->
  <text x="40" y="70" font-family="'Segoe UI',Arial,sans-serif" font-size="42" font-weight="900" fill="#67e8f9" letter-spacing="2">CHROME</text>
  <text x="40" y="116" font-family="'Segoe UI',Arial,sans-serif" font-size="42" font-weight="900" fill="#e7fbff" letter-spacing="2">CONVOY</text>
  <text x="42" y="140" font-family="'Segoe UI',Arial,sans-serif" font-size="13" fill="#a3e635" letter-spacing="3">RACING · SHOOTER</text>
</svg>
```

- [ ] **Step 2: Verify the cover**

Open `covers/chrome-convoy.svg` in a browser. Expected: a neon road scene with cyan player car firing a tracer at red rivals and the "CHROME CONVOY" title. (The OG share card `covers/og/chrome-convoy.svg` is generated automatically in Task 13 by `npm run build:og-images`.)

- [ ] **Step 3: Commit**

```bash
git add covers/chrome-convoy.svg
git commit -m "feat(chrome-convoy): add SVG cover art"
```

---

### Task 12: Manifest entry, meta injection, and fallback-catalog regen

**Files:**
- Modify: `websites/manifest.json`
- Modify (generated): `websites/chrome-convoy.html` (meta/JSON-LD blocks), `index.html` (FALLBACK_GAMES), `sitemap.xml`, `feed.json`, `covers/og-image.svg`
- Create (generated): `covers/og/chrome-convoy.svg`

- [ ] **Step 1: Append the manifest entry**

Add this object as the **last** element of the array in `websites/manifest.json` (add a comma after the current last entry, `beacon-bastion`):

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

- [ ] **Step 2: Regenerate injected meta, sitemap, feed, and OG images**

Run (PowerShell, repo root):

```powershell
npm run inject:meta
npm run build:sitemap
npm run build:feed
npm run build:og-images
```

Expected: `inject:meta` fills the `<!-- workshop-meta:start -->…` and `<!-- workshop-jsonld:start -->…` blocks in `chrome-convoy.html`; `build:og-images` creates `covers/og/chrome-convoy.svg` and refreshes `covers/og-image.svg`; `build:sitemap`/`build:feed` add the new page. No errors.

- [ ] **Step 3: Sync the fallback catalog and validate**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1 -Fix
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-catalog.ps1
```

Expected: `-Fix` rewrites the `FALLBACK_GAMES` constant in `index.html` to include chrome-convoy; the strict run prints success with **0 errors**.

- [ ] **Step 4: Verify the catalog card**

Open `index.html` in a browser. Expected: a "Chrome Convoy" card with its cover appears; the `Racing` and `Shooter` filter chips now read **4**. Click the card → the game opens in the player. Console: no errors.

- [ ] **Step 5: Commit**

```bash
git add websites/manifest.json websites/chrome-convoy.html index.html sitemap.xml feed.json covers/og-image.svg covers/og/chrome-convoy.svg
git commit -m "feat(chrome-convoy): register in manifest, meta, sitemap, feed, OG, and fallback catalog"
```

---

### Task 13: Capture recipe and service-worker bump

**Files:**
- Modify: `scripts/capture-games.mjs`
- Modify: `sw.js`

- [ ] **Step 1: Add the capture recipe**

In `scripts/capture-games.mjs`, find the `recipes` object (the slug-keyed map, near line 557) and add this entry alongside the others (e.g. right after the `"beacon-bastion"` entry):

```javascript
    "chrome-convoy": {
      name: "start, steer, and gun the first rival",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(900);                 // let the first rival stream in
          document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.advanceTime(700);                 // fire and let a shot connect
          document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.advanceTime(200);
        });
      },
    },
```

- [ ] **Step 2: Verify the recipe preflight and `node --check`**

```powershell
node --check scripts/capture-games.mjs
npm run test:capture-recipes
```

Expected: `node --check` prints nothing (valid syntax); `test:capture-recipes` reports the preflight passed for all manifest games (now including chrome-convoy).

- [ ] **Step 3: Bump the service-worker shell revision**

In `sw.js`, locate the cache version constant (the `wa-vNN` token and its shell hash — search for `wa-v`) and increment it (e.g. `wa-v40` → `wa-v41`). Match the exact format already present; if there is a paired `shell-<hash>` token, update it the same way the previous game commit (`1a6288b`) did.

- [ ] **Step 4: Verify the PWA gates**

```powershell
npm run test:pwa
```

Expected: PWA static checks pass with the bumped revision.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-games.mjs sw.js
git commit -m "feat(chrome-convoy): add capture recipe and bump service-worker shell revision"
```

---

### Task 14: Full verification gauntlet and changelog

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run the fast gate aggregate**

```powershell
npm test
```

Expected: every fast `test:*` gate prints PASS in the summary (includes `test:game-contract`, `test:tag-coverage` — now reporting the weakest tag ≥4 with Racing/Shooter at 4 — `test:capture-recipes`, `test:cover-assets`, `test:manifest-schema`, `test:meta-files`, `test:og-images`, `test:feed`, `test:seo`, `test:game-jsonld`, `test:generated-surfaces`, `test:a11y`, `test:a11y-polish`, `test:csp`, `test:page-weight`, etc.). Exit code 0. If any gate fails, fix the cause and re-run before proceeding.

- [ ] **Step 2: Run the browser-backed game + render gates**

```powershell
npm run test:games
npm run capture:games:ci
npm run test:pwa-runtime
npm run test:runtime-storage
```

Expected: `test:games` passes for all 81 games (chrome-convoy exposes both hooks, no console errors, no mobile overflow); `capture:games:ci` reports **max render score 0** across all surfaces (including the new chrome-convoy desktop+mobile captures); pwa-runtime and runtime-storage pass.

- [ ] **Step 3: Run the local performance audit**

```powershell
npm run audit:perf:local
```

Expected: chrome-convoy is within the ~25–35 KB / 2-request budget with zero console/page errors, and the run passes.

- [ ] **Step 4: Add the changelog entry**

Append a dated section to `progress.md` mirroring the style of the existing entries (e.g. the "2026-06-04 Codex Beacon Bastion pass" block), summarizing: Chrome Convoy added as game #81 lifting Racing/Shooter off the floor; the free-steer + heat-cannon + ram mechanics; five deterministic stretches; integration (cover, manifest, generated surfaces, capture recipe, SW bump); and the full list of verification commands that passed with their headline numbers (81 games, capture max score 0, KB/requests).

- [ ] **Step 5: Final commit**

```bash
git add progress.md
git commit -m "docs(chrome-convoy): record game #81 pass in progress log"
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- Overview / single-file / KB budget → Task 1–2 + Task 14 Step 3.
- Goal & tag rationale (Racing+Shooter to 4) → Task 12 Step 1 (tags) + Task 14 Step 1 (`test:tag-coverage`).
- Technical approach / determinism / storage → Task 2 (storage, no-RNG state) + Task 6 (hardcoded `SPAWNS`).
- Movement model (free-steer, fixed vertical, edge damage) → Task 4 + Task 7 Step 2 (edge).
- Combat & threat model (cannon+heat, ram, rivals/blockers/oil/civ/token, armor) → Tasks 5, 6, 7.
- Run structure (5 stretches, escalation, finale) → Task 6 (`SPAWNS`) + Task 8.
- Win/fail/scoring (combo, best persist) → Task 8.
- Controls (keyboard+touch+sound+fullscreen+help) → Tasks 4, 5, 9.
- Game states / HUD → Task 2 (`syncHud`, `drawOverlay`) + Task 9.
- Diagnostics schema → Task 10 (snapshot matches the spec field-for-field).
- Accessibility & UI cohesion → Task 1 (canvas aria-label+tabindex, button types, dialog role/aria-modal, eyebrow/title/pills/tabular-nums) + Task 9 (focus trap/Escape/restore).
- Manifest entry / cover / OG → Tasks 11, 12.
- Integration footprint (7 hand-edited files) → game html (1–10), cover (11), manifest+sw+recipe+progress (12–14); generated surfaces regenerated in 12.
- Verification gauntlet → Task 14.
- Out-of-scope items → not implemented (no boost, no boss entity, full-run restart only, single road) — confirmed absent from the tasks.

**Placeholder scan:** No "TBD/TODO". Two intentional, fully-specified deferrals: the `sw.js` version token (Task 13 Step 3 names the exact token to bump and references commit `1a6288b` for the format) and the `progress.md` prose (Task 14 Step 4 specifies the required content) — both are content the engineer writes by matching an existing pattern, not missing logic.

**Type/name consistency:** `state` fields are defined once (Task 2 Step 3) and reused verbatim. Function names are consistent across tasks: `startRun`/`resetRun`/`failRun`/`winRun`/`nextStretch`, `fire`/`updateShots`, `updateSpawns`/`updateThreats`/`drawThreats`, `resolveCombat`/`damage`/`killRival`, `snapshot`/`renderText`/`stepMs`, `drawRoad`/`drawCar`/`drawPlayer`/`drawShots`. `failRun` is introduced as a placeholder in Task 7 Step 4 and explicitly replaced in Task 8 Step 1 (called out to avoid a duplicate-definition bug). `threatPx/threatPy/playerPx` defined in Task 4 and reused in Tasks 5–7. `state.mode` strings (`menu/playing/win/fail`) are used identically in logic, `drawOverlay`, `syncHud`, and the diagnostic `phase`.
