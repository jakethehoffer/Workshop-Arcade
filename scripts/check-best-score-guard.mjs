#!/usr/bin/env node
// Browser-backed best-score NaN-guard probe.
//
// Several games read a persisted best with `Number(localStorage.getItem(KEY) ||
// 0)`. The `|| 0` only catches null/empty — a non-numeric stored value (corrupt
// storage, or a tampered value injected through the player storage bridge's
// `#wa-storage=` seed) yields `Number("xyz") === NaN`, which propagates into the
// best/high display and serializes as `null` in render_game_to_text(), bricking
// the feature. (rhythm-circuit's `Math.max(0, Number(...))` does not help —
// `Math.max(0, NaN)` is NaN.)
//
// This probe seeds each game's best key with a non-numeric value before load and
// asserts the game's diagnostic best/high field is still a finite number >= 0.

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

// Games that persist a best/high score and must survive a non-numeric stored
// value. key = its localStorage key; field = the best/high field in
// render_game_to_text().
const BEST_SCORE_GAMES = [
  { url: 'websites/arena.html', key: 'canvasArena:highscore:v1', field: 'highScore' },
  { url: 'websites/flappy-bird.html', key: 'skyhopper_highscore', field: 'highScore' },
  { url: 'websites/rhythm-circuit.html', key: 'rhythm-circuit.bestScore.v1', field: 'bestScore' },
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
    // Seed a non-numeric best value before the game's scripts run.
    await context.addInitScript((key) => {
      try { localStorage.setItem(key, 'not-a-number-xyz'); } catch (_) {}
    }, game.key);
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${game.url}: page error with corrupt best stored: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`${game.url}: console error with corrupt best stored: ${message.text()}`);
    });
    await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    const value = await page.evaluate((field) => {
      try { return JSON.parse(window.render_game_to_text())[field]; } catch (error) { return `unparseable: ${error.message}`; }
    }, game.field);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      fail(`${game.url}: ${game.field} must be a finite number >= 0 when storage holds a non-numeric best (got ${JSON.stringify(value)}) — an unguarded Number() makes it NaN and bricks the best display`);
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
  for (const game of BEST_SCORE_GAMES) {
    await checkGame(browser, started.baseUrl, game);
  }
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

if (issues.length) {
  console.error(`Best-score guard check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Best-score guard check passed: ${BEST_SCORE_GAMES.length} game(s) fall back to a finite best when storage holds a non-numeric value.`);
