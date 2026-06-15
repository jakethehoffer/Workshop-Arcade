#!/usr/bin/env node
// Browser-backed real-time progression probe.
//
// Some time-driven games (a beat clock, a playback head) advance state only
// inside window.advanceTime(ms). Because the smoke and render-capture harnesses
// drive games through advanceTime, a game can pass CI while being FROZEN for
// real players — its clock never ticks without a real requestAnimationFrame
// loop. signal-loom shipped exactly this way (stages 2+ unwinnable because the
// gate beat stayed at 0); tempo-forge's playback preview was dead for the same
// reason.
//
// This probe drives each listed game through REAL elapsed time only (no
// advanceTime call) and asserts its time-driven diagnostic actually advances.
// It is the gate that catches the "diagnostic hook diverged from the real
// loop" class.

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

// Each entry starts the game's time-driven mode by clicking a control, then we
// assert `field` climbs above 0 under real time alone (no advanceTime).
const TIME_DRIVEN_GAMES = [
  { url: 'websites/signal-loom.html', startSelector: '#startBtn', field: 'beat', mode: 'playing' },
  { url: 'websites/tempo-forge.html', startSelector: '#playBtn', field: 'beat', mode: 'playback' },
];

const issues = [];
function fail(message) { issues.push(message); }

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

async function checkGame(browser, baseUrl, game) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${game.url}: page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`${game.url}: console error: ${message.text()}`);
    });
    await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });

    // Enter the time-driven mode via a real control click.
    await page.click(game.startSelector, { timeout: 4000 });
    const reached = await page.evaluate((field) => {
      try { return JSON.parse(window.render_game_to_text())[field]; } catch { return 'unreadable'; }
    }, game.field);
    if (reached !== 0) {
      fail(`${game.url}: expected ${game.field} to start at 0 after entering ${game.mode} (got ${JSON.stringify(reached)}); cannot prove real-time progression`);
      return;
    }

    // The crux: advance ONLY real wall-clock time (never advanceTime) and require
    // the time-driven field to climb. A frozen game (no real rAF loop) stays at 0.
    try {
      await page.waitForFunction(
        (field) => {
          try { return JSON.parse(window.render_game_to_text())[field] >= 1; } catch { return false; }
        },
        game.field,
        { timeout: 4000, polling: 100 }
      );
    } catch {
      fail(`${game.url}: ${game.field} never advanced under real time — game is frozen without advanceTime (missing real requestAnimationFrame loop)`);
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
  for (const game of TIME_DRIVEN_GAMES) {
    await checkGame(browser, started.baseUrl, game);
  }
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

if (issues.length) {
  console.error(`Real-time progression check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Real-time progression check passed: ${TIME_DRIVEN_GAMES.length} time-driven game(s) advance under real time without advanceTime.`);
