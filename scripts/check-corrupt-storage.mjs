#!/usr/bin/env node
// Browser-backed corrupt-storage robustness probe.
//
// Every catalog game reads persisted settings/scores/progress from localStorage
// on load. The game contract requires those reads to be defensive, because a
// stored value can be malformed: corrupted storage, a partial write, a different
// game's key colliding in the sandbox, or a tampered value injected through the
// player storage bridge's `#wa-storage=` seed. An unguarded `JSON.parse` (or a
// downstream `.foo` on a value whose SHAPE is wrong) throws during init and
// white-screens the game before it can render.
//
// This probe generalizes scripts/check-best-score-guard.mjs from "the best field
// stays a finite number" to "the game survives at all". For each game it first
// instruments localStorage.getItem to record exactly which keys the game reads on
// load (the real crash surface — no source-scraping guesswork), then seeds each
// of those keys in turn with a battery of malformed values (broken JSON, and
// valid-JSON-of-the-wrong-shape) and reloads, asserting the game still
// initializes: no uncaught page error and window.render_game_to_text() still
// returns parseable JSON. A game that throws on any corrupt value is reported
// with the exact key + value that broke it.

import { createServer } from 'node:http';
import { open, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
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

// Malformed values a corrupt store could hold. Broken JSON catches unguarded
// JSON.parse; the valid-JSON-of-wrong-shape values catch reads that parse fine
// then assume a shape (e.g. `parsed.best.chips` when parsed is an array/number).
const CORRUPT_VALUES = ['{bad', 'not-json', 'null', 'true', '0', '"x"', '[]', '1e999'];
const CONCURRENCY = 4;

// Recorder for the keys a game reads from storage during load.
const RECORD_READS = `(() => {
  try {
    window.__waReadKeys = [];
    const proto = Object.getPrototypeOf(window.localStorage);
    const orig = proto.getItem;
    proto.getItem = function (k) { try { window.__waReadKeys.push(String(k)); } catch (_) {} return orig.call(this, k); };
  } catch (_) {}
})();`;

const issues = [];
const fail = (m) => issues.push(m);

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
      } finally { await handle.close(); }
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream' });
      response.end(content);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

// Load the game once with getItem instrumented; return the keys it read on load.
async function discoverReadKeys(browser, target) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(RECORD_READS);
    const page = await context.newPage();
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 }).catch(() => {});
    const keys = await page.evaluate(() => Array.from(new Set(window.__waReadKeys || []))).catch(() => []);
    // Ignore obvious non-storage reads (none expected, but keep it tight).
    return keys.filter((k) => typeof k === 'string' && k.length > 0 && k.length <= 120);
  } finally { await context.close(); }
}

// One isolated test: a fresh context seeded with ONLY `key=value` corrupt, then
// load the game and assert it initialized (no page error, valid diagnostics).
async function probeCorruptKey(browser, target, gameUrl, key, value) {
  const context = await browser.newContext();
  const pageErrors = [];
  try {
    await context.addInitScript(([k, v]) => { try { localStorage.clear(); localStorage.setItem(k, v); } catch (_) {} }, [key, value]);
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 6000 });
      const probe = await page.evaluate(() => {
        try { JSON.parse(window.render_game_to_text()); return null; }
        catch (e) { return `render_game_to_text unparseable: ${e.message}`; }
      });
      if (probe) fail(`${gameUrl}: ${probe} when ${key}=${JSON.stringify(value)}`);
      else if (pageErrors.length) fail(`${gameUrl}: uncaught page error when ${key}=${JSON.stringify(value)}: ${pageErrors[0]}`);
    } catch (e) {
      fail(`${gameUrl}: failed to initialize when ${key}=${JSON.stringify(value)} (${String(e.message || e).split('\n')[0]})`);
    }
  } finally { await context.close(); }
}

async function checkGame(browser, baseUrl, game) {
  const target = new URL(game.url, baseUrl).href;
  const keys = await discoverReadKeys(browser, target);
  game.keyCount = keys.length;
  for (const key of keys) {
    for (const value of CORRUPT_VALUES) {
      await probeCorruptKey(browser, target, game.url, key, value);
    }
  }
}

async function runPool(items, size, worker) {
  let i = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i]; i += 1;
      await worker(item);
      done += 1;
      if (done % 20 === 0) console.log(`  ...${done}/${items.length} games probed`);
    }
  }));
}

let server;
let browser;
let games = [];
try {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'websites/manifest.json'), 'utf8'));
  games = manifest.map((e) => ({ url: e.url.replace(/^\/+/, ''), keyCount: 0 }));
  const started = await startServer();
  server = started.server;
  browser = await chromium.launch({ headless: true });
  await runPool(games, CONCURRENCY, (game) => checkGame(browser, started.baseUrl, game));
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

if (issues.length) {
  console.error(`Corrupt-storage check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const keyTotal = games.reduce((s, g) => s + (g.keyCount || 0), 0);
console.log(`Corrupt-storage check passed: all ${games.length} games initialize cleanly across ${keyTotal} on-load storage read(s) x ${CORRUPT_VALUES.length} malformed values (no page error, render_game_to_text() still valid).`);
