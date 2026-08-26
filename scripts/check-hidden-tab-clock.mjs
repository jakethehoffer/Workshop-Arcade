#!/usr/bin/env node
// Hidden-tab clock probe.
//
// A browser delivers NO animation frames to a background tab, then delivers one
// frame the moment you come back. A loop that advances its clock by the raw gap
// between frames therefore charges the player's entire absence in a single step.
// Measured on memory-match before the 2026-08-26 fix: a 30-second tab switch
// added exactly 30,000ms to the run timer, and because Best is decided on moves
// first with TIME AS THE TIEBREAK, an interrupted run lost a tiebreak it had
// already won.
//
// This is the mirror image of the fixed-dt-per-frame bug the catalog was swept
// for earlier: fixed-dt UNDER-measures elapsed time (double speed at 120Hz),
// a raw delta OVER-measures it. Both live in the same line of code, and no
// existing gate can see either one.
//
// Method, deliberately unit-free so a 33ms dt clamp is never mistaken for
// "33 seconds": replace requestAnimationFrame with a hand-pumped queue, drive
// the game into a live state, then on two FRESH pages deliver one frame after a
// SHORT gap and one after a LONG gap (3x the short one). A clock that bills the
// absence scales with the gap; a clamped clock does not move appreciably at
// all. Comparing the two gaps needs no knowledge of the field's units.
//
// The game list below is not hand-curated: it is every game whose diagnostics
// were MEASURED to expose a moving run-time field during a runtime census of
// all 100 games. Re-run that census (not a grep) when adding games.

import { createServer } from 'node:http';
import { open, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHORT_GAP_MS = 10000;
const LONG_GAP_MS = 30000;
// A clamped loop may legitimately charge one clamp per late frame. No game in
// this catalog clamps above 1000ms, so anything past this is billing the gap.
const MAX_ALLOWED_CHARGE_MS = 1200;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

// Every game measured to expose a moving run-time field in render_game_to_text().
// `field` is the diagnostics path that carries the run clock; `unit` is what the
// game reports it in, so the charge can be compared against one shared budget.
const TIMED_GAMES = [
  { path: 'websites/memory-match.html', field: 'elapsedMs', unit: 'ms' },
  { path: 'websites/rhythm-circuit.html', field: 'time', unit: 'ms' },
  { path: 'websites/typeforge-cipher.html', field: 'time', unit: 'ms' },
  { path: 'websites/stack-tide.html', field: 'time', unit: 'ms' },
  { path: 'websites/volt-sudoku.html', field: 'elapsedMs', unit: 'ms' },
  { path: 'websites/tempo-tunnels.html', field: 'timeMs', unit: 'ms' },
  { path: 'websites/finale-foundry.html', field: 'timeMs', unit: 'ms' },
  // Deliberately NOT listed, and named here so an omission is never mistaken
  // for an oversight. The census surfaced a moving numeric time field in four
  // further games, none of which is a run clock a player is judged on:
  //   switchback-rally  replay.elapsedMs   only runs while a committed lap plays back
  //   tetris            timers.dropAcc     a piece-drop accumulator, reset every drop
  //   pinball-foundry   feedback.time      a message-decay countdown
  //   cipher-rooms      feedback.timerMs   a message-decay countdown
  // A decay timer that skips ahead loses a banner early; it cannot cost a
  // record. Add a game here only after MEASURING that it exposes a real run
  // clock, never from reading the source.
  { path: 'websites/neon-drift.html', field: 'time.elapsed', unit: 's' },
  { path: 'websites/shadow-switch.html', field: 'time', unit: 's' },
  { path: 'websites/arena.html', field: 'time', unit: 's' },
  { path: 'websites/service-shift.html', field: 'time', unit: 's' },
  { path: 'websites/orbit-salvage.html', field: 'elapsed', unit: 's' },
  { path: 'websites/harbor-switchboard.html', field: 'time', unit: 's' },
  { path: 'websites/skyline-sentry.html', field: 'wave.time', unit: 's' },
  { path: 'websites/bulwark-burst.html', field: 'wave.time', unit: 's' },
  { path: 'websites/slipstream-sprint.html', field: 'runTime', unit: 's' },
];

const issues = [];
function fail(message) {
  issues.push(message);
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(repoRoot, relative);
  return target.startsWith(repoRoot) ? target : null;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const filePath = resolveRequestPath(request.url || '/');
      if (!filePath) {
        response.writeHead(404).end('Not found');
        return;
      }
      const handle = await open(filePath, 'r');
      let content;
      try {
        if (!(await handle.stat()).isFile()) {
          response.writeHead(404).end('Not found');
          return;
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

// Installed before any game script so the game's own loop enqueues into it.
const rafHook = () => {
  const queue = [];
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = (id) => { if (queue[id - 1]) queue[id - 1] = null; };
  window.__pump = (ts) => {
    const callbacks = queue.splice(0, queue.length).filter(Boolean);
    for (const cb of callbacks) {
      try { cb(ts); } catch (error) { window.__tickError = String(error && error.message || error); }
    }
    return callbacks.length;
  };
  // One monotonic cursor for the whole page life. Pumping a timestamp EARLIER
  // than the previous one hands the game a negative frame delta and every
  // measurement after it is nonsense.
  window.__t = 200000;
  window.__step = (ms) => { window.__t += ms; return window.__pump(window.__t); };
  window.__readField = (path) => {
    let snapshot;
    try { snapshot = JSON.parse(window.render_game_to_text()); } catch { return null; }
    let value = snapshot;
    for (const key of path.split('.')) {
      if (value === null || typeof value !== 'object') return null;
      value = value[key];
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
};

// Escalating start, stopping the INSTANT the run clock moves. Escalating past a
// game that is already running is actively harmful: the later stages click
// board children and canvas points, which on a started game hit Restart or a
// difficulty switch and put the clock back to zero. A game we never started
// would report "no movement", which is a FALSE PASS - the dangerous direction -
// so the caller treats a clock that never moves as a failure, never as clean.
const START_STAGES = [
  // 1: the primary action button.
  (page) => page.evaluate(() => {
    const re = /^(start|play|begin|new game|new run|go|launch|deal|drop|deploy|resume|run)\b/i;
    for (const button of Array.from(document.querySelectorAll('button, [role="button"]'))) {
      const label = (button.textContent || '').trim();
      if (re.test(label) && button.offsetParent !== null && !button.disabled) { button.click(); return; }
    }
  }),
  // 2: the usual "any key starts it" games.
  async (page) => {
    for (const key of ['Space', 'Enter', 'ArrowRight', 'ArrowUp']) await page.keyboard.press(key).catch(() => {});
  },
  // 3: a pointer press on the play surface. Use a real PointerEvent with a
  // pointerId - a bare MouseEvent named "pointerdown" makes any game that calls
  // setPointerCapture throw, which then reads as a game defect rather than a
  // probe defect.
  (page) => page.evaluate(() => {
    const stage = document.querySelector('canvas, #stage, #game');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const init = {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse',
      clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.6,
    };
    for (const type of ['pointerdown', 'pointerup']) { try { stage.dispatchEvent(new PointerEvent(type, init)); } catch {} }
    for (const type of ['mousedown', 'mouseup', 'click']) { try { stage.dispatchEvent(new MouseEvent(type, init)); } catch {} }
  }),
  // 4: cell/card games start on a playable CHILD. Try board containers in
  // specificity order - querySelector on a combined selector returns the
  // segmented difficulty control first, and clicking that RESETS the run.
  (page) => page.evaluate(() => {
    const cellSelector = 'button, [role="gridcell"], [role="button"], td, .cell, .card';
    for (const containerSelector of ['#board', '#grid', '#cards', '.board', '.grid', '[role="grid"]', 'table']) {
      for (const container of Array.from(document.querySelectorAll(containerSelector))) {
        const cells = Array.from(container.querySelectorAll(cellSelector))
          .filter((el) => el.offsetParent !== null && !el.disabled);
        if (cells.length < 4) continue;
        let clicks = 0;
        for (const cell of cells) { try { cell.click(); } catch {} if (++clicks >= 2) return; }
        return;
      }
    }
  }),
];

const clockIsRunning = (page, field) => page.evaluate((f) => {
  const before = window.__readField(f);
  for (let i = 0; i < 3; i++) window.__step(16.7);
  const after = window.__readField(f);
  return before !== null && after !== null && before !== after;
}, field);

async function openGame(context, baseUrl, game) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(rafHook);
  await page.goto(new URL(game.path, baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
  let running = await clockIsRunning(page, game.field);
  for (const stage of START_STAGES) {
    if (running) break;
    await stage(page);
    running = await clockIsRunning(page, game.field);
  }
  return { page, errors, running };
}

// Settle on healthy frames, then deliver ONE frame `gapMs` late - exactly what
// a browser does when you return from another tab - and report the charge.
async function chargeForGap(context, baseUrl, game, gapMs) {
  const { page, errors, running } = await openGame(context, baseUrl, game);
  const result = await page.evaluate(({ field, gap }) => {
    for (let i = 0; i < 20; i++) window.__step(16.7);
    const settled = window.__readField(field);
    window.__step(16.7);
    const before = window.__readField(field);
    window.__step(gap);
    const after = window.__readField(field);
    return { settled, before, after, tickError: window.__tickError || null };
  }, { field: game.field, gap: gapMs });
  await page.close();
  return { ...result, errors, running };
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  const { baseUrl } = started;
  browser = await chromium.launch({ headless: true });

  for (const game of TIMED_GAMES) {
    const context = await browser.newContext();
    try {
      const short = await chargeForGap(context, baseUrl, game, SHORT_GAP_MS);
      const long = await chargeForGap(context, baseUrl, game, LONG_GAP_MS);

      const pageErrors = [...short.errors, ...long.errors];
      if (pageErrors.length) fail(`${game.path}: page/console errors: ${JSON.stringify(pageErrors.slice(0, 2))}`);
      if (short.tickError) fail(`${game.path}: threw inside its frame callback: ${short.tickError}`);

      if (short.before === null || short.after === null || long.before === null || long.after === null) {
        fail(`${game.path}: run clock field "${game.field}" is missing from render_game_to_text()`);
        continue;
      }
      // A clock that never moved means the probe failed to start the game, and
      // an unstarted game cannot demonstrate anything. Treat it as a failure so
      // the check can never silently cover nothing.
      if (!short.running || !long.running || (short.settled === short.before && short.before === short.after)) {
        fail(`${game.path}: run clock "${game.field}" never advanced, so this game was not driven into play — the probe proves nothing and must be repaired`);
        continue;
      }

      const toMs = game.unit === 's' ? 1000 : 1;
      const shortCharge = Math.abs(short.after - short.before) * toMs;
      const longCharge = Math.abs(long.after - long.before) * toMs;

      if (longCharge > MAX_ALLOWED_CHARGE_MS) {
        fail(`${game.path}: one frame arriving ${LONG_GAP_MS}ms late charged "${game.field}" ${Math.round(longCharge)}ms (limit ${MAX_ALLOWED_CHARGE_MS}ms) — a hidden tab is billed to the player`);
      }
      // Independent of the absolute budget: the charge must not SCALE with the
      // absence. Tripling the gap must not roughly triple the bill.
      if (shortCharge > 0 && longCharge / shortCharge >= 2.4) {
        fail(`${game.path}: charge for "${game.field}" scales with the gap (${Math.round(shortCharge)}ms at ${SHORT_GAP_MS}ms away, ${Math.round(longCharge)}ms at ${LONG_GAP_MS}ms) — the clock is billing real absence, not a clamped frame`);
      }
    } catch (error) {
      fail(`${game.path}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await context.close().catch(() => {});
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (issues.length) {
  console.error(`Hidden-tab clock check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Hidden-tab clock check passed: ${TIMED_GAMES.length} timed game(s) charge at most a clamped frame when one animation frame arrives ${LONG_GAP_MS}ms late, and none bills a charge that scales with the absence.`);
