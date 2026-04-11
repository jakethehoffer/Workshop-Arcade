# Metro Dash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D-style endless runner game (Metro Dash) as a single self-contained HTML file for the Workshop Arcade catalog.

**Architecture:** Single HTML file with Canvas 2D rendering using pseudo-3D perspective projection. Player runs through a subway tunnel, switches between 3 lanes, jumps over barriers, and slides under obstacles. dt-normalized physics, touch/swipe support, localStorage high scores. Follows existing game conventions (fullscreen canvas, help overlay, dark theme).

**Tech Stack:** Vanilla HTML5 + Canvas 2D + Web Audio API. No external dependencies.

---

### Task 1: HTML Shell, Canvas Setup & Perspective Track

**Files:**
- Create: `websites/metro-dash.html`

- [ ] **Step 1: Create the HTML shell with CSS and canvas**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Metro Dash — Fullscreen</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  html, body { height:100%; margin:0; }
  body {
    background:#1a1a2e;
    overscroll-behavior:none;
    touch-action:none;
    -webkit-user-select:none; user-select:none;
  }
  canvas#game {
    position:fixed; inset:0;
    width:100vw; height:100vh;
    display:block;
    background:#1a1a2e;
  }
  .help-btn {
    position:fixed; top:12px; right:12px; z-index:50;
    background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.3);
    color:#fff; padding:8px 12px; border-radius:10px; font-weight:700;
    cursor:pointer; font-size:16px; backdrop-filter:blur(4px);
  }
  .help-btn:hover { background:rgba(0,0,0,0.7); }
  .pause-btn {
    position:fixed; top:12px; right:70px; z-index:50;
    background:rgba(0,0,0,0.5); border:2px solid rgba(255,255,255,0.3);
    color:#fff; padding:8px 12px; border-radius:10px; font-weight:700;
    cursor:pointer; font-size:16px; backdrop-filter:blur(4px);
    display:none;
  }
  .pause-btn:hover { background:rgba(0,0,0,0.7); }
  .overlay { position:fixed; inset:0; display:none; place-items:center; pointer-events:none; z-index:100; background:rgba(0,0,0,0.7); }
  .overlay.show { display:grid; pointer-events:auto; }
  .help-card { background:#faf8ef; border:2px solid #776e65; padding:24px 26px; border-radius:16px; max-width:min(92vw, 500px); box-shadow:0 10px 30px rgba(0,0,0,.5); pointer-events:auto; color:#776e65; }
  .help-card h2 { margin:0 0 16px 0; font-size:24px; color:#776e65; }
  .help-card p { margin:8px 0; line-height:1.6; }
  .help-card .controls-grid { display:grid; grid-template-columns:1fr; gap:10px; margin:16px 0; }
  .help-card .control-row { display:flex; align-items:center; gap:12px; }
  .help-card kbd { background:#bbada0; border:1px solid #8f7a66; border-bottom-width:3px; padding:4px 10px; border-radius:8px; font-weight:700; font-family:inherit; display:inline-block; color:#f9f6f2; }
  .help-card .btn-close { margin-top:16px; width:100%; background:#8f7a66; color:#fff; border:none; padding:10px; border-radius:10px; font-weight:700; cursor:pointer; }
  .help-card .btn-close:active { transform:translateY(1px); }
</style>
</head>
<body>
<canvas id="game"></canvas>
<button class="pause-btn" id="pauseBtn" title="Pause (P)">⏸ Pause</button>
<button class="help-btn" id="helpBtn" title="Help (H)">❓ Help</button>

<!-- Help Menu -->
<div class="overlay" id="helpOverlay">
  <div class="help-card">
    <h2>How to Play Metro Dash</h2>
    <p><b>Objective:</b> Sprint through the subway, dodging obstacles and collecting coins. How far can you run?</p>
    <div class="controls-grid">
      <div class="control-row"><span><kbd>←</kbd> / <kbd>A</kbd> / Swipe Left</span><span>Move left</span></div>
      <div class="control-row"><span><kbd>→</kbd> / <kbd>D</kbd> / Swipe Right</span><span>Move right</span></div>
      <div class="control-row"><span><kbd>↑</kbd> / <kbd>W</kbd> / <kbd>Space</kbd> / Swipe Up</span><span>Jump</span></div>
      <div class="control-row"><span><kbd>↓</kbd> / <kbd>S</kbd> / Swipe Down</span><span>Slide</span></div>
      <div class="control-row"><span><kbd>P</kbd> / <kbd>Esc</kbd></span><span>Pause</span></div>
    </div>
    <p><b>Tips:</b></p>
    <ul style="margin:8px 0; padding-left:20px; line-height:1.8;">
      <li>Switch lanes to dodge trains and barriers</li>
      <li>Jump over low barriers, slide under overhead bars</li>
      <li>Collect coins for bonus points</li>
      <li>Speed increases the further you run!</li>
    </ul>
    <button class="btn-close" id="helpClose">Close</button>
  </div>
</div>

<!-- Pause Menu -->
<div class="overlay" id="pauseOverlay">
  <div class="help-card">
    <h2>Paused</h2>
    <p>Game is paused.</p>
    <button class="btn-close" id="resumeBtn">Resume</button>
    <button class="btn-close" id="restartFromPause" style="margin-top:8px; background:#c38957;">Restart</button>
  </div>
</div>

<script>
```

- [ ] **Step 2: Add canvas setup, HiDPI support, and perspective constants**

Inside the `<script>` tag:

```javascript
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

/* ----- HiDPI fullscreen ----- */
let W, H, dpr;
function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener("resize", resizeCanvas, { passive: true });
resizeCanvas();

/* ----- Perspective constants ----- */
const VANISH_Y_RATIO = 0.38;   // vanishing point 38% from top
const TRACK_BOTTOM_W_RATIO = 0.7; // track width at bottom as ratio of canvas width
const TRACK_TOP_W_RATIO = 0.02;   // track width at vanishing point
const HORIZON_LINE = () => H * VANISH_Y_RATIO * dpr;
const NUM_LANES = 3;

/* ----- Perspective math ----- */
// z goes from 0 (at player, bottom) to 1 (at vanishing point)
function projectX(laneOffset, z) {
  // laneOffset: -1 (left), 0 (center), 1 (right)
  const cx = canvas.width / 2;
  const trackW = lerp(canvas.width * TRACK_BOTTOM_W_RATIO, canvas.width * TRACK_TOP_W_RATIO, z);
  const laneW = trackW / NUM_LANES;
  return cx + laneOffset * laneW;
}

function projectY(z) {
  return lerp(canvas.height, HORIZON_LINE(), z);
}

function projectScale(z) {
  return lerp(1, 0.02, z);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
```

- [ ] **Step 3: Draw the perspective track with lane markers and ties**

```javascript
/* ----- Track rendering ----- */
function drawTunnel() {
  const cx = canvas.width / 2;
  const vanY = HORIZON_LINE();

  // Tunnel background gradient
  const grad = ctx.createLinearGradient(0, vanY, 0, canvas.height);
  grad.addColorStop(0, "#2a2a3e");
  grad.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ceiling
  ctx.fillStyle = "#12121f";
  ctx.fillRect(0, 0, canvas.width, vanY);

  // Ceiling lights (receding into distance)
  for (let i = 0; i < 20; i++) {
    const z = i / 20;
    const y = projectY(z);
    const scale = projectScale(z);
    const lightW = 60 * scale * dpr;
    const lightH = 4 * scale * dpr;
    if (lightH < 0.5) continue;
    ctx.fillStyle = `rgba(255, 220, 150, ${0.6 * (1 - z)})`;
    ctx.fillRect(cx - lightW / 2, y - 10 * scale * dpr, lightW, lightH);
  }

  // Track floor
  const trackBotW = canvas.width * TRACK_BOTTOM_W_RATIO;
  const trackTopW = canvas.width * TRACK_TOP_W_RATIO;

  // Draw track surface
  ctx.beginPath();
  ctx.moveTo(cx - trackBotW / 2, canvas.height);
  ctx.lineTo(cx - trackTopW / 2, vanY);
  ctx.lineTo(cx + trackTopW / 2, vanY);
  ctx.lineTo(cx + trackBotW / 2, canvas.height);
  ctx.closePath();
  ctx.fillStyle = "#3a3a4e";
  ctx.fill();

  // Lane dividers
  for (let lane = -1; lane <= 1; lane += 2) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 200, 50, 0.4)";
    ctx.lineWidth = 2 * dpr;
    const divider = lane * 0.333;
    for (let z = 0; z < 1; z += 0.01) {
      const x = projectX(divider, z);
      const y = projectY(z);
      if (z === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
```

- [ ] **Step 4: Add scrolling track ties for motion effect**

```javascript
let tieOffset = 0;

function drawTrackTies(dt60, speed) {
  const cx = canvas.width / 2;
  tieOffset = (tieOffset + speed * dt60 * 0.02) % 0.05;

  for (let i = 0; i < 40; i++) {
    const z = (i / 40 + tieOffset) % 1;
    if (z > 0.98) continue;
    const y = projectY(z);
    const scale = projectScale(z);
    const trackW = lerp(canvas.width * TRACK_BOTTOM_W_RATIO, canvas.width * TRACK_TOP_W_RATIO, z);
    const tieH = Math.max(1, 3 * scale * dpr);

    ctx.fillStyle = `rgba(100, 80, 60, ${0.5 * (1 - z)})`;
    ctx.fillRect(cx - trackW / 2, y, trackW, tieH);
  }
}
```

- [ ] **Step 5: Add tunnel walls**

```javascript
function drawTunnelWalls() {
  const cx = canvas.width / 2;
  const vanY = HORIZON_LINE();
  const trackBotW = canvas.width * TRACK_BOTTOM_W_RATIO;
  const trackTopW = canvas.width * TRACK_TOP_W_RATIO;

  // Left wall
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cx - trackTopW / 2, vanY);
  ctx.lineTo(cx - trackBotW / 2, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  const lwGrad = ctx.createLinearGradient(0, 0, cx - trackBotW / 2, 0);
  lwGrad.addColorStop(0, "#0e0e1a");
  lwGrad.addColorStop(1, "#1e1e30");
  ctx.fillStyle = lwGrad;
  ctx.fill();

  // Right wall
  ctx.beginPath();
  ctx.moveTo(canvas.width, 0);
  ctx.lineTo(cx + trackTopW / 2, vanY);
  ctx.lineTo(cx + trackBotW / 2, canvas.height);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  const rwGrad = ctx.createLinearGradient(cx + trackBotW / 2, 0, canvas.width, 0);
  rwGrad.addColorStop(0, "#1e1e30");
  rwGrad.addColorStop(1, "#0e0e1a");
  ctx.fillStyle = rwGrad;
  ctx.fill();
}
```

- [ ] **Step 6: Wire up a basic game loop that draws the track**

```javascript
/* ----- Game state ----- */
let state = "title"; // "title" | "playing" | "paused" | "gameover"
let lastTime = null;
let gameSpeed = 5;

/* ----- Main loop ----- */
function loop(now) {
  if (lastTime === null) { lastTime = now; requestAnimationFrame(loop); return; }
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;
  const dt60 = dt * 60;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawTunnel();
  drawTrackTies(dt60, state === "playing" ? gameSpeed : 2);
  drawTunnelWalls();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
```

- [ ] **Step 7: Open in browser and verify perspective track renders correctly**

Open `websites/metro-dash.html` in a browser. You should see a perspective subway tunnel with 3 lanes, lane dividers, scrolling track ties, tunnel walls, and ceiling lights converging at a vanishing point.

- [ ] **Step 8: Commit**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): add HTML shell with perspective tunnel rendering"
```

---

### Task 2: Player Character & Lane Switching

**Files:**
- Modify: `websites/metro-dash.html`

- [ ] **Step 1: Add player state and rendering**

After the perspective math section, add:

```javascript
/* ----- Player ----- */
const player = {
  lane: 0,        // -1, 0, 1
  targetLane: 0,
  laneX: 0,       // smooth interpolated position (-1 to 1)
  y: 0,           // vertical offset (jump/slide)
  vy: 0,          // vertical velocity
  isJumping: false,
  isSliding: false,
  slideTimer: 0,
  height: 1,      // 1 = normal, 0.5 = sliding
  runPhase: 0,    // animation cycle
};

const LANE_SWITCH_SPEED = 0.15; // lerp factor per frame at 60fps
const JUMP_VELOCITY = -0.6;
const GRAVITY = 0.035;
const SLIDE_DURATION = 30; // frames at 60fps
const PLAYER_Z = 0.15; // how far "into" the screen the player is drawn

function updatePlayer(dt60) {
  // Smooth lane switching
  player.laneX = lerp(player.laneX, player.targetLane, 1 - Math.pow(1 - LANE_SWITCH_SPEED, dt60));

  // Jump physics
  if (player.isJumping) {
    player.vy += GRAVITY * dt60;
    player.y += player.vy * dt60;
    if (player.y >= 0) {
      player.y = 0;
      player.vy = 0;
      player.isJumping = false;
    }
  }

  // Slide timer
  if (player.isSliding) {
    player.slideTimer -= dt60;
    player.height = 0.5;
    if (player.slideTimer <= 0) {
      player.isSliding = false;
      player.height = 1;
    }
  } else {
    player.height = 1;
  }

  // Run animation
  if (state === "playing") {
    player.runPhase += dt60 * 0.3;
  }
}

function drawPlayer() {
  const z = PLAYER_Z;
  const scale = projectScale(z) * dpr;
  const baseH = 80 * scale;
  const h = baseH * player.height;
  const w = 30 * scale;
  const x = projectX(player.laneX, z);
  const baseY = projectY(z);
  const jumpOffset = player.y * 200 * scale;
  const y = baseY + jumpOffset;

  // Body
  const bodyY = y - h;
  ctx.fillStyle = "#4fc3f7";
  ctx.fillRect(x - w / 2, bodyY, w, h * 0.6);

  // Legs (animated)
  const legSwing = Math.sin(player.runPhase) * 8 * scale;
  ctx.fillStyle = "#1565c0";
  ctx.fillRect(x - w / 3, bodyY + h * 0.6, w * 0.3, h * 0.4 + legSwing);
  ctx.fillRect(x + w / 15, bodyY + h * 0.6, w * 0.3, h * 0.4 - legSwing);

  // Head
  const headR = 10 * scale;
  ctx.fillStyle = "#ffe0b2";
  ctx.beginPath();
  ctx.arc(x, bodyY - headR * 0.5, headR, 0, Math.PI * 2);
  ctx.fill();

  // Hat/cap
  ctx.fillStyle = "#e53935";
  ctx.fillRect(x - headR * 1.2, bodyY - headR * 1.5, headR * 2.4, headR * 0.7);
}
```

- [ ] **Step 2: Add lane switching input actions**

```javascript
/* ----- Input actions ----- */
function moveLeft() {
  if (state !== "playing") return;
  if (player.targetLane > -1) player.targetLane--;
}

function moveRight() {
  if (state !== "playing") return;
  if (player.targetLane < 1) player.targetLane++;
}

function doJump() {
  if (state !== "playing") return;
  if (player.isJumping || player.isSliding) return;
  player.isJumping = true;
  player.vy = JUMP_VELOCITY;
}

function doSlide() {
  if (state !== "playing") return;
  if (player.isJumping || player.isSliding) return;
  player.isSliding = true;
  player.slideTimer = SLIDE_DURATION;
}
```

- [ ] **Step 3: Wire up keyboard controls**

```javascript
/* ----- Keyboard input ----- */
document.addEventListener("keydown", e => {
  if (e.repeat) return;

  // Start game
  if (state === "title" && (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW")) {
    startGame();
    return;
  }

  // Restart from game over
  if (state === "gameover" && (e.code === "Space" || e.code === "Enter")) {
    startGame();
    return;
  }

  // Pause/unpause
  if (e.code === "KeyP" || (e.code === "Escape" && state === "playing")) {
    togglePause();
    return;
  }
  if (e.code === "Escape" && state === "paused") {
    togglePause();
    return;
  }

  // Help
  if (e.code === "KeyH" && !e.repeat) {
    if (helpOverlay.classList.contains("show")) closeHelp();
    else openHelp();
    return;
  }

  // Movement
  if (e.code === "ArrowLeft" || e.code === "KeyA") moveLeft();
  if (e.code === "ArrowRight" || e.code === "KeyD") moveRight();
  if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") doJump();
  if (e.code === "ArrowDown" || e.code === "KeyS") doSlide();
});
```

- [ ] **Step 4: Add touch/swipe controls**

```javascript
/* ----- Touch/swipe input ----- */
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
const SWIPE_THRESHOLD = 30;

canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = performance.now();

  if (state === "title" || state === "gameover") {
    startGame();
  }
}, { passive: false });

canvas.addEventListener("touchend", e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const elapsed = performance.now() - touchStartTime;

  if (elapsed > 300) return; // too slow for swipe

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
    if (dx < 0) moveLeft();
    else moveRight();
  } else if (Math.abs(dy) > SWIPE_THRESHOLD) {
    if (dy < 0) doJump();
    else doSlide();
  }
}, { passive: false });
```

- [ ] **Step 5: Add game state management functions**

```javascript
/* ----- Game state management ----- */
const HS_KEY = "metrodash_highscore";
let highScore = 0;
try { highScore = Number(localStorage.getItem(HS_KEY) || 0); } catch(_) {}

let distance = 0;
let coins = 0;
let newBestThisRun = false;

function startGame() {
  state = "playing";
  distance = 0;
  coins = 0;
  gameSpeed = 5;
  player.lane = 0;
  player.targetLane = 0;
  player.laneX = 0;
  player.y = 0;
  player.vy = 0;
  player.isJumping = false;
  player.isSliding = false;
  player.slideTimer = 0;
  player.height = 1;
  player.runPhase = 0;
  obstacles.length = 0;
  coinObjects.length = 0;
  spawnTimer = 0;
  coinSpawnTimer = 0;
  newBestThisRun = false;
  pauseBtn.style.display = "block";
}

function setGameOver() {
  state = "gameover";
  pauseBtn.style.display = "none";
  if (distance > highScore) {
    highScore = Math.floor(distance);
    newBestThisRun = true;
    try { localStorage.setItem(HS_KEY, String(highScore)); } catch(_) {}
  }
}

function togglePause() {
  if (state === "playing") {
    state = "paused";
    pauseOverlay.classList.add("show");
  } else if (state === "paused") {
    state = "playing";
    pauseOverlay.classList.remove("show");
    lastTime = null; // reset dt to avoid jump
  }
}
```

- [ ] **Step 6: Update the main loop to include player**

Replace the simple game loop with:

```javascript
/* ----- Main loop ----- */
function loop(now) {
  if (lastTime === null) { lastTime = now; requestAnimationFrame(loop); return; }
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;
  const dt60 = dt * 60;

  if (state === "paused" || helpOpen) {
    requestAnimationFrame(loop);
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const currentSpeed = state === "playing" ? gameSpeed : 2;

  // Update
  if (state === "playing") {
    updatePlayer(dt60);
    distance += currentSpeed * dt60 * 0.1;
    gameSpeed = 5 + distance * 0.005; // gradual speed ramp
  }

  // Draw
  drawTunnel();
  drawTrackTies(dt60, currentSpeed);
  drawTunnelWalls();
  if (state !== "title") drawPlayer();

  // HUD & overlays
  drawHUD();
  if (state === "title") drawTitleScreen();
  if (state === "gameover") drawGameOver();

  requestAnimationFrame(loop);
}
```

- [ ] **Step 7: Add HUD and screen overlays**

```javascript
/* ----- Text helper ----- */
function drawText(txt, x, y, size = 24, align = "center", color = "#fff") {
  ctx.font = `bold ${size}px system-ui, -apple-system, Segoe UI, Arial`;
  ctx.textAlign = align;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillText(txt, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(txt, x, y);
}

/* ----- HUD ----- */
function drawHUD() {
  if (state !== "playing") return;
  drawText(`${Math.floor(distance)}m`, W / 2, 40, 28);
  drawText(`Coins: ${coins}`, 20, 40, 18, "left", "#ffd700");
}

/* ----- Title screen ----- */
function drawTitleScreen() {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, W, H);
  drawText("METRO DASH", W / 2, H * 0.35, 48, "center", "#4fc3f7");
  drawText("Sprint through the subway!", W / 2, H * 0.35 + 40, 18, "center", "#aaa");
  drawText("Tap or press SPACE to start", W / 2, H * 0.55, 22);
  if (highScore > 0) {
    drawText(`Best: ${highScore}m`, W / 2, H * 0.55 + 35, 18, "center", "#ffd700");
  }
}

/* ----- Game over screen ----- */
function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);
  drawText(newBestThisRun ? "New High Score!" : "Game Over", W / 2, H * 0.38, 36);
  drawText(`Distance: ${Math.floor(distance)}m`, W / 2, H * 0.38 + 40, 22);
  drawText(`Coins: ${coins}`, W / 2, H * 0.38 + 68, 20, "center", "#ffd700");
  drawText(`Best: ${highScore}m`, W / 2, H * 0.38 + 96, 18, "center", "#aaa");
  drawText("Tap or press SPACE to restart", W / 2, H * 0.65, 20);
}
```

- [ ] **Step 8: Wire up help/pause overlay JS**

```javascript
/* ----- Help overlay ----- */
const helpBtn = document.getElementById("helpBtn");
const helpOverlay = document.getElementById("helpOverlay");
const helpClose = document.getElementById("helpClose");
const pauseBtn = document.getElementById("pauseBtn");
const pauseOverlay = document.getElementById("pauseOverlay");
const resumeBtn = document.getElementById("resumeBtn");
const restartFromPause = document.getElementById("restartFromPause");

let helpOpen = false;
function openHelp() { helpOpen = true; helpOverlay.classList.add("show"); }
function closeHelp() { helpOpen = false; helpOverlay.classList.remove("show"); }

helpBtn.onclick = e => { e.preventDefault(); openHelp(); };
helpClose.onclick = e => { e.preventDefault(); closeHelp(); };
helpOverlay.addEventListener("click", e => { if (e.target === helpOverlay) closeHelp(); });
pauseBtn.onclick = e => { e.preventDefault(); togglePause(); };
resumeBtn.onclick = e => { e.preventDefault(); togglePause(); };
restartFromPause.onclick = e => {
  e.preventDefault();
  pauseOverlay.classList.remove("show");
  startGame();
};

// Click on canvas to start (mouse)
canvas.addEventListener("mousedown", () => {
  if (state === "title" || state === "gameover") startGame();
});

/* ----- Visibility (pause when tab hidden) ----- */
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") togglePause();
});
```

- [ ] **Step 9: Verify player renders and lane switching works**

Open in browser. Press Space to start, use arrow keys to switch lanes. Player should smoothly animate between lanes, jump with up arrow, slide with down arrow.

- [ ] **Step 10: Commit**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): add player character with lane switching, jump, slide"
```

---

### Task 3: Obstacles & Collision Detection

**Files:**
- Modify: `websites/metro-dash.html`

- [ ] **Step 1: Add obstacle system**

Add after the player code:

```javascript
/* ----- Obstacles ----- */
const obstacles = [];
let spawnTimer = 0;
const OBSTACLE_TYPES = ["barrier", "train", "overhead"];

function spawnObstacle() {
  const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
  let lane, width;

  if (type === "train") {
    // Trains can span 1-2 lanes
    lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    width = Math.random() < 0.4 ? 2 : 1; // 40% chance of 2-lane train
    // Ensure at least one lane is free
    if (width === 2 && lane === 0) lane = Math.random() < 0.5 ? -1 : 0;
    if (width === 2 && lane === 1) lane = 0;
  } else {
    lane = Math.floor(Math.random() * 3) - 1;
    width = 1;
  }

  obstacles.push({
    type,
    lane,
    width,
    z: 1.0, // starts at the far end
  });
}

function updateObstacles(dt60) {
  const speed = gameSpeed * 0.008 * dt60;
  spawnTimer += dt60;

  // Adaptive spawn rate — faster game = more frequent obstacles
  const spawnInterval = Math.max(30, 60 - distance * 0.03);
  if (spawnTimer >= spawnInterval) {
    spawnObstacle();
    spawnTimer = 0;
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.z -= speed;

    // Remove if past player
    if (obs.z < -0.05) {
      obstacles.splice(i, 1);
      continue;
    }

    // Collision detection — check if obstacle overlaps player
    if (obs.z > PLAYER_Z - 0.03 && obs.z < PLAYER_Z + 0.03) {
      const playerLane = player.targetLane;
      let hit = false;

      // Check lane overlap
      for (let l = 0; l < obs.width; l++) {
        if (obs.lane + l === playerLane) {
          if (obs.type === "barrier" && player.isJumping) continue; // jumped over
          if (obs.type === "overhead" && player.isSliding) continue; // slid under
          hit = true;
        }
      }

      if (hit) setGameOver();
    }
  }
}

function drawObstacles() {
  for (const obs of obstacles) {
    if (obs.z < 0 || obs.z > 1) continue;
    const scale = projectScale(obs.z) * dpr;
    const y = projectY(obs.z);

    for (let l = 0; l < obs.width; l++) {
      const lanePos = obs.lane + l;
      const x = projectX(lanePos, obs.z);

      if (obs.type === "barrier") {
        // Low barrier — orange/yellow striped block
        const bw = 40 * scale;
        const bh = 25 * scale;
        ctx.fillStyle = "#ff9800";
        ctx.fillRect(x - bw / 2, y - bh, bw, bh);
        // Stripe
        ctx.fillStyle = "#f57c00";
        ctx.fillRect(x - bw / 2, y - bh * 0.6, bw, bh * 0.3);
      } else if (obs.type === "train") {
        // Train — tall colored rectangle
        const tw = 45 * scale;
        const th = 80 * scale;
        ctx.fillStyle = "#1565c0";
        ctx.fillRect(x - tw / 2, y - th, tw, th);
        // Windows
        ctx.fillStyle = "#bbdefb";
        const winH = 12 * scale;
        const winY = y - th * 0.7;
        ctx.fillRect(x - tw * 0.35, winY, tw * 0.25, winH);
        ctx.fillRect(x + tw * 0.1, winY, tw * 0.25, winH);
        // Stripe
        ctx.fillStyle = "#0d47a1";
        ctx.fillRect(x - tw / 2, y - th * 0.15, tw, th * 0.15);
      } else if (obs.type === "overhead") {
        // Overhead bar — horizontal beam near top of player
        const ow = 50 * scale;
        const oh = 10 * scale;
        const beamY = y - 60 * scale;
        ctx.fillStyle = "#757575";
        ctx.fillRect(x - ow / 2, beamY, ow, oh);
        // Support posts
        ctx.fillStyle = "#616161";
        ctx.fillRect(x - ow / 2, beamY, 4 * scale, 60 * scale);
        ctx.fillRect(x + ow / 2 - 4 * scale, beamY, 4 * scale, 60 * scale);
      }
    }
  }
}
```

- [ ] **Step 2: Wire obstacles into the game loop**

In the main loop `update` section (inside `if (state === "playing")`), add:

```javascript
    updateObstacles(dt60);
```

In the draw section, after `drawTunnelWalls()` and before `drawPlayer()`:

```javascript
  drawObstacles();
```

- [ ] **Step 3: Verify obstacles spawn, approach, and collision works**

Open in browser. Start the game. Obstacles should appear in the distance and grow as they approach. Lane switching should dodge them. Jumping should clear barriers, sliding should clear overhead bars. Hitting a train/barrier should trigger game over.

- [ ] **Step 4: Commit**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): add obstacle spawning, rendering, and collision detection"
```

---

### Task 4: Coins & Scoring

**Files:**
- Modify: `websites/metro-dash.html`

- [ ] **Step 1: Add coin system**

```javascript
/* ----- Coins ----- */
const coinObjects = [];
let coinSpawnTimer = 0;

function spawnCoinRow() {
  const lane = Math.floor(Math.random() * 3) - 1;
  const count = 3 + Math.floor(Math.random() * 3); // 3-5 coins in a row
  for (let i = 0; i < count; i++) {
    coinObjects.push({
      lane,
      z: 1.0 + i * 0.03, // spread out in depth
      collected: false,
    });
  }
}

function updateCoins(dt60) {
  const speed = gameSpeed * 0.008 * dt60;
  coinSpawnTimer += dt60;

  if (coinSpawnTimer >= 45) {
    spawnCoinRow();
    coinSpawnTimer = 0;
  }

  for (let i = coinObjects.length - 1; i >= 0; i--) {
    const coin = coinObjects[i];
    coin.z -= speed;

    if (coin.z < -0.05) {
      coinObjects.splice(i, 1);
      continue;
    }

    // Collection check
    if (!coin.collected && coin.z > PLAYER_Z - 0.025 && coin.z < PLAYER_Z + 0.025) {
      if (coin.lane === player.targetLane) {
        coin.collected = true;
        coins += 10;
      }
    }
  }
}

function drawCoins() {
  for (const coin of coinObjects) {
    if (coin.collected || coin.z < 0 || coin.z > 1) continue;
    const scale = projectScale(coin.z) * dpr;
    const x = projectX(coin.lane, coin.z);
    const y = projectY(coin.z) - 20 * scale;
    const r = 8 * scale;

    if (r < 1) continue;

    // Gold circle
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle
    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

- [ ] **Step 2: Wire coins into the game loop**

In the update section after `updateObstacles(dt60)`:

```javascript
    updateCoins(dt60);
```

In the draw section, after `drawObstacles()` and before `drawPlayer()`:

```javascript
  drawCoins();
```

Also add `coinObjects.length = 0;` and `coinSpawnTimer = 0;` to the `startGame()` function (already included in Task 2's startGame).

- [ ] **Step 3: Verify coins appear and are collectible**

Open in browser. Coins should appear as gold circles in lanes. Running through them should increase the coin counter in the HUD.

- [ ] **Step 4: Commit**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): add coin spawning, collection, and score display"
```

---

### Task 5: Audio (SFX + Music)

**Files:**
- Modify: `websites/metro-dash.html`

- [ ] **Step 1: Add Web Audio API setup and SFX**

Add after the coin code:

```javascript
/* ----- Audio ----- */
let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.2;
    musicGain.connect(masterGain);
  }
}

function resumeAudio() {
  ensureAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function playTone(freq, time, dur, type = "sine", gain = 0.1, target = sfxGain) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0.001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(g).connect(target);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

const SFX = {
  coin() {
    ensureAudio(); if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(880, t, 0.08, "triangle", 0.1);
    playTone(1320, t + 0.06, 0.1, "triangle", 0.08);
  },
  jump() {
    ensureAudio(); if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.12);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  },
  slide() {
    ensureAudio(); if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  },
  hit() {
    ensureAudio(); if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(200, t, 0.2, "sine", 0.15);
    playTone(100, t + 0.1, 0.3, "sine", 0.1);
  },
  newHigh() {
    ensureAudio(); if (!audioCtx) return;
    const t = audioCtx.currentTime;
    playTone(523, t, 0.12, "triangle", 0.1);
    playTone(659, t + 0.1, 0.12, "triangle", 0.08);
    playTone(784, t + 0.2, 0.15, "triangle", 0.08);
  }
};
```

- [ ] **Step 2: Wire SFX into actions**

Add `SFX.coin();` in the coin collection check, `SFX.jump();` in `doJump()`, `SFX.slide();` in `doSlide()`, `SFX.hit();` and `SFX.newHigh();` in `setGameOver()`.

Specifically:
- In `doJump()` after setting `player.vy`: add `SFX.jump();`
- In `doSlide()` after setting `player.isSliding`: add `SFX.slide();`
- In the coin collection block after `coins += 10;`: add `SFX.coin();`
- In `setGameOver()`: add `if (newBestThisRun) SFX.newHigh(); else SFX.hit();`
- In `startGame()`: add `resumeAudio();`

- [ ] **Step 3: Add background music (simple driving beat)**

```javascript
/* ----- Background music ----- */
const TEMPO = 130;
const STEP_DUR = 60 / TEMPO / 4;
let musicState = { on: false, timer: null, nextTime: 0, step: 0 };

function scheduleMusicStep(time, step) {
  const pos = step % 16;
  // Kick
  if (pos % 4 === 0) {
    playTone(55, time, 0.15, "sine", 0.15, musicGain);
  }
  // Hi-hat
  if (pos % 2 === 0) {
    if (!audioCtx) return;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.03, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.03, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    const filt = audioCtx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 8000;
    src.connect(filt).connect(g).connect(musicGain);
    src.start(time);
    src.stop(time + 0.05);
  }
  // Bass note
  if (pos === 0 || pos === 8) {
    const notes = [55, 55, 65.41, 73.42]; // A, A, C, D
    const bar = Math.floor(step / 16) % 4;
    playTone(notes[bar], time, 0.3, "sine", 0.1, musicGain);
  }
}

function startMusic() {
  ensureAudio();
  if (!audioCtx || musicState.on) return;
  musicState.on = true;
  musicState.nextTime = audioCtx.currentTime + 0.05;
  musicState.timer = setInterval(() => {
    if (!musicState.on || !audioCtx) return;
    while (musicState.nextTime < audioCtx.currentTime + 0.15) {
      scheduleMusicStep(musicState.nextTime, musicState.step);
      musicState.nextTime += STEP_DUR;
      musicState.step++;
    }
  }, 25);
}

function stopMusic() {
  if (musicState.timer) clearInterval(musicState.timer);
  musicState.timer = null;
  musicState.on = false;
}
```

- [ ] **Step 4: Wire music into game states**

In `startGame()`: add `startMusic();`
In `setGameOver()`: add `stopMusic();`
In `togglePause()`: in pause branch add `stopMusic();`, in resume branch add `startMusic();`
In visibility change handler: add `stopMusic();` when hidden, `if (state==="playing") startMusic();` when visible.

- [ ] **Step 5: Verify SFX and music play correctly**

Open in browser. Music should play during gameplay. Coin, jump, slide, and crash sounds should trigger at appropriate moments.

- [ ] **Step 6: Commit**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): add Web Audio SFX and background music"
```

---

### Task 6: SVG Cover & Manifest Update

**Files:**
- Create: `covers/metro-dash.svg`
- Modify: `websites/manifest.json`

- [ ] **Step 1: Create the SVG cover image**

Create `covers/metro-dash.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <rect width="640" height="360" fill="#1a1a2e"/>
  <!-- Tunnel ceiling -->
  <rect width="640" height="137" fill="#12121f"/>
  <!-- Perspective track -->
  <polygon points="320,137 325,137 430,360 210,360" fill="#3a3a4e"/>
  <!-- Lane dividers -->
  <line x1="282" y1="360" x2="321" y2="137" stroke="rgba(255,200,50,0.4)" stroke-width="1.5"/>
  <line x1="358" y1="360" x2="323" y2="137" stroke="rgba(255,200,50,0.4)" stroke-width="1.5"/>
  <!-- Left wall -->
  <polygon points="0,0 320,137 210,360 0,360" fill="#0e0e1a" opacity="0.8"/>
  <!-- Right wall -->
  <polygon points="640,0 325,137 430,360 640,360" fill="#0e0e1a" opacity="0.8"/>
  <!-- Ceiling lights -->
  <rect x="305" y="80" width="30" height="3" rx="1" fill="#ffdc96" opacity="0.5"/>
  <rect x="310" y="100" width="20" height="2" rx="1" fill="#ffdc96" opacity="0.4"/>
  <rect x="314" y="115" width="12" height="2" rx="1" fill="#ffdc96" opacity="0.3"/>
  <rect x="316" y="125" width="8" height="1" rx="1" fill="#ffdc96" opacity="0.2"/>
  <!-- Track ties -->
  <line x1="230" y1="300" x2="410" y2="300" stroke="#64503c" stroke-width="2" opacity="0.4"/>
  <line x1="250" y1="270" x2="390" y2="270" stroke="#64503c" stroke-width="1.5" opacity="0.35"/>
  <line x1="265" y1="240" x2="375" y2="240" stroke="#64503c" stroke-width="1.5" opacity="0.3"/>
  <line x1="278" y1="215" x2="362" y2="215" stroke="#64503c" stroke-width="1" opacity="0.25"/>
  <!-- Player character -->
  <rect x="302" y="280" width="16" height="40" rx="2" fill="#4fc3f7"/>
  <circle cx="310" cy="274" r="7" fill="#ffe0b2"/>
  <rect x="300" y="268" width="20" height="5" rx="1" fill="#e53935"/>
  <!-- Legs -->
  <rect x="304" y="320" width="5" height="18" fill="#1565c0"/>
  <rect x="312" y="320" width="5" height="14" fill="#1565c0"/>
  <!-- Coins -->
  <circle cx="310" cy="230" r="5" fill="#ffd700"/>
  <circle cx="310" cy="210" r="4.5" fill="#ffd700" opacity="0.8"/>
  <circle cx="310" cy="192" r="4" fill="#ffd700" opacity="0.6"/>
  <!-- Obstacle (train in distance) -->
  <rect x="340" y="175" width="18" height="35" rx="1" fill="#1565c0" opacity="0.7"/>
  <rect x="343" y="182" width="5" height="5" fill="#bbdefb" opacity="0.7"/>
  <rect x="350" y="182" width="5" height="5" fill="#bbdefb" opacity="0.7"/>
  <!-- Title -->
  <text x="320" y="40" font-family="'Segoe UI',Arial,sans-serif" font-size="32" font-weight="bold" fill="#4fc3f7" text-anchor="middle" letter-spacing="4">METRO DASH</text>
  <!-- Subtitle -->
  <text x="320" y="60" font-family="'Segoe UI',Arial,sans-serif" font-size="12" fill="#aaa" text-anchor="middle" opacity="0.6">Sprint through the subway</text>
</svg>
```

- [ ] **Step 2: Update manifest.json with cover path**

Change the metro-dash entry's cover field from `""` to `"covers/metro-dash.svg"`:

```json
{
  "id": "metro-dash",
  "title": "Metro Dash",
  "subtitle": "Sprint through the subway dodging obstacles.",
  "tags": ["Arcade", "Endless", "Action"],
  "slug": "metro-dash",
  "url": "websites/metro-dash.html",
  "cover": "covers/metro-dash.svg",
  "addedAt": "2025-10-08",
  "popularity": 83
}
```

- [ ] **Step 3: Verify cover shows in the catalog**

Open `index.html` in a browser. Metro Dash should appear in the grid with the SVG cover showing a perspective subway tunnel scene.

- [ ] **Step 4: Commit**

```bash
git add covers/metro-dash.svg websites/manifest.json
git commit -m "feat(metro-dash): add SVG cover and update manifest"
```

---

### Task 7: Polish & Final Verification

**Files:**
- Modify: `websites/metro-dash.html`

- [ ] **Step 1: Ensure the closing script and body tags are present**

Make sure `metro-dash.html` ends with:

```html
/* ----- Boot ----- */
requestAnimationFrame(loop);
</script>
</body>
</html>
```

- [ ] **Step 2: Full playthrough test**

Verify in browser:
1. Title screen shows with "Metro Dash" and instructions
2. Space/tap starts the game
3. Lane switching (arrows/WASD/swipe) works smoothly
4. Jump clears barriers
5. Slide ducks under overhead bars
6. Coins are collectible and score updates
7. Trains block lanes correctly
8. Speed ramps up over time
9. Game over triggers on collision
10. High score persists across sessions (localStorage)
11. Pause (P/Esc) works
12. Help overlay (H) works
13. Touch/swipe controls work on mobile viewport

- [ ] **Step 3: Commit final polish**

```bash
git add websites/metro-dash.html
git commit -m "feat(metro-dash): complete game polish and final cleanup"
```
