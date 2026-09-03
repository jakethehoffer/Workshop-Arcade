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
//
// A game marked `strict` holds a stronger contract: it must reject EVERY stored
// form it never wrote itself, not merely the ones that produce NaN. Number()
// coercion silently accepts '0x10' as 16, ' 7 ' and '007' as 7, '1e2' as 100 and
// '12.7' as a fractional score -- each finite and non-negative, so the lenient
// assertion above waves them through, and each would install a record the player
// never earned. Strict games must return exactly 0 for those, and must still
// round-trip a legitimate stored value, so "always return 0" cannot pass.

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
  { url: 'websites/dice-dynamo.html', key: 'dice-dynamo.best.v1', field: 'best' },
  { url: 'websites/snake.html', key: 'neonsnake_best', field: 'best', strict: true, legit: 42 },
];

// Forms a game never writes for itself. String(integer) is what every best
// writer in this repo stores, so a parser that requires the stored text to
// round-trip through Number rejects all of these; a bare Number() accepts them.
const COERCION_ONLY_VALUES = ['0x10', ' 7 ', '007', '1e2', '12.7', '+7'];

// A bare Number() lets through far more than NaN: "Infinity" and "1e999" both
// become Infinity, which JSON.stringify writes as null and so breaks the
// diagnostics contract outright, and a negative stored value shows a negative
// best. Every listed game must survive all of these.
const HOSTILE_BEST_VALUES = ['not-a-number-xyz', 'Infinity', '1e999', '-1'];

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

async function readBest(browser, baseUrl, game, seed) {
  const context = await browser.newContext();
  try {
    if (seed !== null) {
      await context.addInitScript((s) => {
        try { localStorage.setItem(s.key, s.value); } catch (_) {}
      }, { key: game.key, value: seed });
    }
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${game.url} [${seed}]: page error with best stored: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`${game.url} [${seed}]: console error with best stored: ${message.text()}`);
    });
    await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    return await page.evaluate((field) => {
      try { return JSON.parse(window.render_game_to_text())[field]; } catch (error) { return `unparseable: ${error.message}`; }
    }, game.field);
  } finally {
    await context.close();
  }
}

async function checkStrictGame(browser, baseUrl, game) {
  for (const value of COERCION_ONLY_VALUES) {
    const got = await readBest(browser, baseUrl, game, value);
    if (got !== 0) {
      fail(`${game.url}: ${game.field} must be exactly 0 when storage holds ${JSON.stringify(value)} (got ${JSON.stringify(got)}) — Number() coercion accepts a form this game never wrote, installing a record nobody earned`);
    }
  }
  // ...and the rejection must not be "always 0": a value the game really wrote
  // has to survive, or the guard would have silently deleted the feature.
  const legit = await readBest(browser, baseUrl, game, String(game.legit));
  if (legit !== game.legit) {
    fail(`${game.url}: ${game.field} must restore a legitimately stored best of ${game.legit} (got ${JSON.stringify(legit)}) — the strict guard is rejecting real records too`);
  }
}

async function checkGame(browser, baseUrl, game, hostile) {
  const context = await browser.newContext();
  try {
    // Seed a corrupt best value before the game's scripts run.
    await context.addInitScript((seed) => {
      try { localStorage.setItem(seed.key, seed.value); } catch (_) {}
    }, { key: game.key, value: hostile });
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${game.url} [${hostile}]: page error with corrupt best stored: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`${game.url} [${hostile}]: console error with corrupt best stored: ${message.text()}`);
    });
    await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    const value = await page.evaluate((field) => {
      try { return JSON.parse(window.render_game_to_text())[field]; } catch (error) { return `unparseable: ${error.message}`; }
    }, game.field);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      fail(`${game.url}: ${game.field} must be a finite number >= 0 when storage holds ${JSON.stringify(hostile)} (got ${JSON.stringify(value)}) — an unguarded Number() turns it into NaN or Infinity and bricks the best display`);
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
    for (const hostile of HOSTILE_BEST_VALUES) {
      await checkGame(browser, started.baseUrl, game, hostile);
    }
    if (game.strict) await checkStrictGame(browser, started.baseUrl, game);
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

const strictCount = BEST_SCORE_GAMES.filter((g) => g.strict).length;
console.log(`Best-score guard check passed: ${BEST_SCORE_GAMES.length} game(s) x ${HOSTILE_BEST_VALUES.length} corrupt stored value(s) all fall back to a finite best >= 0; ${strictCount} strict game(s) also reject ${COERCION_ONLY_VALUES.length} coercion-only form(s) and still restore a real record.`);
