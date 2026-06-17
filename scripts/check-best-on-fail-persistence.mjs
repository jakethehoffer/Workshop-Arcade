#!/usr/bin/env node
// Browser-backed "best persists on any run-end" probe (audit item S7).
//
// Several games DISPLAY their best live as `Math.max(state.best, state.score)`
// but only WRITE the BEST_KEY on a full win. So a high-scoring run that FAILS
// shows an inflated Best in the HUD and in render_game_to_text(), yet nothing is
// persisted — on reload the Best silently reverts to the last *won* value (often
// 0). The displayed Best is a lie for the most common run outcome (a loss).
//
// This probe, per game, drives a real failing run that scores above the stored
// best, then asserts the score was actually persisted: localStorage[BEST_KEY]
// equals the failed-run metric, and after a reload the diagnostic best still
// reports that value. Before the fix this fails (storage is empty / best reverts
// to 0); after persisting best on every run-end it passes.
//
// Each driver plays through the real DOM (keyboard + Start button) to a genuine
// game-over with a positive score — no internal state poking — so it doubles as
// a regression guard that the fail/game-over path commits the best.

import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

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
      if (!filePath) { response.writeHead(404).end('Not found'); return; }
      const handle = await open(filePath, 'r');
      let content;
      try {
        if (!(await handle.stat()).isFile()) { response.writeHead(404).end('Not found'); return; }
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
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

// ---- small driving helpers -------------------------------------------------

const readState = (page) =>
  page.evaluate(() => { try { return JSON.parse(window.render_game_to_text()); } catch { return null; } });

const sleep = (page, ms) => page.waitForTimeout(ms);

async function tap(page, key, times = 1) {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

// ---- per-game drivers: play a real run to a scored game-over ----------------
//
// Each returns the failing-run metric (score/cash) it produced, or throws if it
// could not reach a positive-score failure (a driver bug, distinct from the
// persistence bug this probe is testing).

async function driveShardSheriff(page) {
  // Stage 0 "Main Street" has one target at aim 0 -> a hit clears the stage
  // (score banked) and advances to stage 1, where firing at aim ~0 strikes the
  // glass at (530,278) and fails the run with the banked score intact.
  await page.click('#startBtn');
  await tap(page, 'Space'); // fire stage-0 target at aim 0 -> clears, advances
  for (let i = 0; i < 8; i++) {
    const s = await readState(page);
    if (!s || s.mode === 'failed') break;
    // steer aim toward 0 (stage 1 loads at aim -25), then fire into the glass
    for (let g = 0; g < 40; g++) {
      const cur = await readState(page);
      if (!cur || Math.abs(cur.aim) <= 1) break;
      await tap(page, cur.aim < 0 ? 'ArrowUp' : 'ArrowDown'); // +/-2 deg
    }
    await tap(page, 'Space'); // fire -> glass hit -> failed
  }
  const end = await readState(page);
  if (!end || end.mode !== 'failed' || !(end.score > 0)) {
    throw new Error(`driver did not reach a scored failure (got ${JSON.stringify(end && { mode: end.mode, score: end.score })})`);
  }
  return end.score;
}

async function driveRuneRoster(page) {
  // Stage 0 "Vowel Lock" (letters STONERA, must T): spell "tone" for points,
  // then drain integrity (6) with empty submits to fail with the points banked.
  await page.click('#startBtn');
  await tap(page, 't'); await tap(page, 'o'); await tap(page, 'n'); await tap(page, 'e');
  await tap(page, 'Enter'); // submit valid word -> score
  for (let i = 0; i < 8; i++) {
    const s = await readState(page);
    if (!s || s.mode === 'failed') break;
    await tap(page, 'Enter'); // empty submit -> integrity--
  }
  const end = await readState(page);
  if (!end || end.mode !== 'failed' || !(end.score > 0)) {
    throw new Error(`driver did not reach a scored failure (got ${JSON.stringify(end && { mode: end.mode, score: end.score })})`);
  }
  return end.score;
}

async function driveVelvetHeist(page) {
  // Follow the recommended plan to bank score, then submit two deliberately
  // wrong beats so the alarm chain fails the heist with score remaining.
  const dirKey = { N: 'ArrowUp', S: 'ArrowDown', W: 'ArrowLeft', E: 'ArrowRight' };
  await page.click('#startBtn');
  for (let i = 0; i < 24; i++) {
    const s = await readState(page);
    if (!s || s.mode !== 'playing') break;
    if (s.score >= 48) break; // enough to survive two -8 alarm penalties
    if (s.routeIndex >= s.routeLength - 1) break; // don't finish a stage (would win/advance)
    const rec = s.recommendation;
    if (rec && rec.type === 'move') await tap(page, dirKey[rec.dir] || 'ArrowUp');
    else await tap(page, 'Space');
  }
  // Two wrong beats: when a move is expected, fire an action (and vice versa).
  for (let i = 0; i < 4; i++) {
    const s = await readState(page);
    if (!s || s.mode === 'failed') break;
    const rec = s.recommendation;
    if (rec && rec.type === 'move') await tap(page, 'Space');       // wrong action
    else await tap(page, 'ArrowUp');                                // wrong move
  }
  const end = await readState(page);
  if (!end || end.mode !== 'failed' || !(end.score > 0)) {
    throw new Error(`driver did not reach a scored failure (got ${JSON.stringify(end && { mode: end.mode, score: end.score })})`);
  }
  return end.score;
}

async function drivePocketOrchard(page) {
  // Starting cash is 24 (> 0). Advance days without filling any order; when the
  // market closes the run fails with cash unspent.
  await page.click('#startBtn');
  for (let i = 0; i < 16; i++) {
    const s = await readState(page);
    if (!s || s.mode === 'failed') break;
    await tap(page, 'Space'); // nextDay
  }
  const end = await readState(page);
  if (!end || end.mode !== 'failed' || !(end.cash > 0)) {
    throw new Error(`driver did not reach a scored failure (got ${JSON.stringify(end && { mode: end.mode, cash: end.cash })})`);
  }
  return end.cash;
}

async function driveDriftLoom(page) {
  // Real-time: hold throttle + drift, steer onto the first gate's offset to bank
  // points, then release drift and let the run miss the rest / run progress out
  // so it fails with the gate score banked.
  await page.click('#startBtn');
  await page.keyboard.down('ArrowUp');   // throttle
  await page.keyboard.down('Space');     // drift
  let leftDown = false, rightDown = false;
  const setSteer = async (dir) => {
    if (dir === 'L') { if (!leftDown) { await page.keyboard.down('ArrowLeft'); leftDown = true; } if (rightDown) { await page.keyboard.up('ArrowRight'); rightDown = false; } }
    else if (dir === 'R') { if (!rightDown) { await page.keyboard.down('ArrowRight'); rightDown = true; } if (leftDown) { await page.keyboard.up('ArrowLeft'); leftDown = false; } }
    else { if (leftDown) { await page.keyboard.up('ArrowLeft'); leftDown = false; } if (rightDown) { await page.keyboard.up('ArrowRight'); rightDown = false; } }
  };
  for (let i = 0; i < 200; i++) {
    const s = await readState(page);
    if (!s) break;
    if (s.passedGates >= 1 || s.mode !== 'playing') break;
    const target = s.nextGate ? s.nextGate.offset : -52;
    if (s.offset > target + 6) await setSteer('L');
    else if (s.offset < target - 6) await setSteer('R');
    else await setSteer('hold');
    await sleep(page, 20);
  }
  await setSteer('hold');
  await page.keyboard.up('Space');       // stop drifting -> remaining gates miss
  for (let i = 0; i < 400; i++) {
    const s = await readState(page);
    if (!s || s.mode === 'failed' || s.mode === 'won') break;
    await sleep(page, 20);
  }
  await page.keyboard.up('ArrowUp');
  const end = await readState(page);
  if (!end || end.mode !== 'failed' || !(end.score > 0)) {
    throw new Error(`driver did not reach a scored failure (got ${JSON.stringify(end && { mode: end.mode, score: end.score, passedGates: end && end.passedGates })})`);
  }
  return end.score;
}

const GAMES = [
  { url: 'websites/shard-sheriff.html', key: 'shard-sheriff.best.v2', metric: 'score', drive: driveShardSheriff },
  { url: 'websites/rune-roster.html', key: 'rune-roster.best.v2', metric: 'score', drive: driveRuneRoster },
  { url: 'websites/velvet-heist.html', key: 'velvet-heist.best.v2', metric: 'score', drive: driveVelvetHeist },
  { url: 'websites/pocket-orchard.html', key: 'pocket-orchard.best.v2', metric: 'cash', drive: drivePocketOrchard },
  { url: 'websites/drift-loom.html', key: 'drift-loom.best.v3', metric: 'score', drive: driveDriftLoom },
];

const issues = [];
function fail(message) { issues.push(message); }

async function checkGame(browser, baseUrl, game) {
  const context = await browser.newContext();
  const attempts = game.drive === driveDriftLoom ? 3 : 1; // the real-time driver gets retries
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${game.url}: page error during run: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') fail(`${game.url}: console error during run: ${message.text()}`); });

    let metric = 0;
    let lastErr = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
      await page.evaluate((key) => { try { localStorage.removeItem(key); } catch {} }, game.key);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
      try {
        metric = await game.drive(page);
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
      }
    }
    if (lastErr) { fail(`${game.url}: ${lastErr.message}`); return; }

    // 1) Persisted to storage on the failing run-end?
    const stored = await page.evaluate((key) => { try { return localStorage.getItem(key); } catch { return null; } }, game.key);
    const storedNum = Number(stored);
    if (stored === null || !Number.isFinite(storedNum) || storedNum !== metric) {
      fail(`${game.url}: best of ${metric} from a FAILED run was not persisted (localStorage[${game.key}] = ${JSON.stringify(stored)}); a losing high score must commit the best, not only a win`);
    }

    // 2) Honest after reload? (the displayed best must not revert)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    const reloadedBest = await page.evaluate(() => { try { return JSON.parse(window.render_game_to_text()).best; } catch { return null; } });
    if (reloadedBest !== metric) {
      fail(`${game.url}: after reload the displayed best is ${JSON.stringify(reloadedBest)} but the failed run scored ${metric} — the HUD showed an inflated best that reverted`);
    }
  } finally {
    await context.close();
  }
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  browser = await chromium.launch({ headless: true });
  for (const game of GAMES) {
    await checkGame(browser, started.baseUrl, game);
  }
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

if (issues.length) {
  console.error(`Best-on-fail persistence check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Best-on-fail persistence check passed: ${GAMES.length} game(s) persist a losing high score and report it honestly after reload.`);
