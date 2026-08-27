#!/usr/bin/env node
// Browser-backed reduced-motion baseline probe.
//
// Game pages run their own inline CSS with no shared stylesheet, so retrofitting
// `prefers-reduced-motion` per game would mean editing every frozen game file.
// Instead, workshop-runtime.js — which every game loads first — injects one
// `@media (prefers-reduced-motion: reduce)` reset that neutralizes CSS
// animations/transitions across the whole corpus from a single file. (Canvas
// gameplay motion is JS-driven and remains a per-game concern; this covers the
// CSS layer only.)
//
// This probe drives a real game page in Chromium and proves:
//   1. The runtime injects the reduced-motion <style> on every game load.
//   2. Under `prefers-reduced-motion: reduce`, a CSS animation/transition is
//      neutralized (the !important reset wins over inline durations).
//   3. Under `no-preference`, the same durations are left intact — so the reset
//      is correctly gated to the media query and never disables motion for
//      users who did not ask for it.

import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_PATH = 'websites/echo-mimic.html';
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);
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
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}/` };
}

// Returns the computed animation/transition durations (ms) for a freshly
// inserted probe element plus whether the runtime injected its reset style.
async function probe(browser, baseUrl, reducedMotion) {
  const context = await browser.newContext({ reducedMotion });
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`[${reducedMotion}] page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`[${reducedMotion}] console error: ${message.text()}`);
    });
    await page.goto(new URL(GAME_PATH, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    return await page.evaluate(() => {
      const styleEl = document.querySelector('style[data-workshop-reduced-motion]');
      const el = document.createElement('div');
      el.style.animationName = 'wa-probe-spin';
      el.style.animationDuration = '9s';
      el.style.transitionProperty = 'opacity';
      el.style.transitionDuration = '9s';
      document.body.appendChild(el);
      const computed = getComputedStyle(el);
      const parseMs = (value) => {
        const first = String(value || '').split(',')[0].trim();
        if (first.endsWith('ms')) return parseFloat(first);
        if (first.endsWith('s')) return parseFloat(first) * 1000;
        return Number.NaN;
      };
      const result = {
        injected: !!styleEl,
        animationMs: parseMs(computed.animationDuration),
        transitionMs: parseMs(computed.transitionDuration),
      };
      el.remove();
      return result;
    });
  } finally {
    await context.close();
  }
}

// Games that gate decorative canvas motion (screen shake, particles) behind a
// prefers-reduced-motion read expose a top-level `reducedMotion` flag in
// render_game_to_text(). This list grows as the accessibility campaign covers
// more games; each entry is verified to report the live media state and to load
// without console/page errors under both settings.
const MOTION_AWARE_GAMES = [
  'websites/bulwark-burst.html',
  'websites/tetris.html',
  'websites/flappy-bird.html',
  'websites/maze-chase.html',
  'websites/minesweeper.html',
  'websites/doodle-jump.html',
  'websites/metro-dash.html',
  'websites/arena.html',
  'websites/slipstream-sprint.html',
  'websites/lumen-lander.html',
  'websites/skyline-sentry.html',
  'websites/brick-breaker.html',
  'websites/paddle-pulse.html',
  'websites/neon-drift.html',
  'websites/comet-cartel.html',
  'websites/chrome-convoy.html',
  'websites/relay-choir.html',
  'websites/2048.html',
  'websites/shape-inlay.html',
  'websites/signal-siege.html',
  'websites/shadow-switch.html',
  'websites/shadow-vault.html',
  'websites/circuit-putt.html',
  'websites/snake.html',
  'websites/stack-tide.html',
  'websites/pinball-foundry.html',
  'websites/harbor-switchboard.html',
  'websites/service-shift.html',
  'websites/slipsort.html',
  'websites/orbit-salvage.html',
  'websites/gridline-tactics.html',
  'websites/diamond-derby.html',
  'websites/drift-loom.html',
  'websites/bulb-brigade.html',
  'websites/last-light.html',
  'websites/starline-strafe.html',
  // Added 2026-08-16 after a runtime census of all 100 games: these already
  // reported the live media state and loaded clean under both settings, they
  // were simply never listed, so nothing protected them from regressing.
  'websites/aster-vault.html',
  'websites/blackjack.html',
  'websites/chromalock.html',
  'websites/dungeon-circuit.html',
  'websites/eclipse-grid.html',
  'websites/floodgate.html',
  'websites/flux-reversi.html',
  'websites/fourfall.html',
  'websites/gemline-cascade.html',
  'websites/rune-roster.html',
  'websites/seedline.html',
  'websites/shard-sheriff.html',
  // Already gated its sparks, shake, confetti, squash and bob behind a live
  // matchMedia read; it just never reported the flag, so it sat outside here.
  'websites/pylon-shift.html',
  // DOM-rendered game (no canvas): all of its motion is CSS transitions and
  // keyframes, neutralized under reduce by its own media block plus the
  // runtime reset. It now reports the live matchMedia state, so that coverage
  // is verifiable here rather than assumed.
  'websites/memory-match.html',
  // Also DOM-rendered with no canvas, so the CSS reset plus its own media block
  // really is complete coverage. Added 2026-08-27 once it reported the flag.
  'websites/cipher-rooms.html',
  // DOM tiles too. Its own file has no media query at all, but its motion is
  // entirely CSS keyframes (tile flip, row shake, input pulse), which the shared
  // runtime reset collapses to ~0 under reduce — measured at 1e-05s. Listing it
  // makes that dependency on the shared reset a tested fact.
  'websites/wordle.html',
];

async function gameReducedMotionFlag(browser, baseUrl, gamePath, reducedMotion) {
  const context = await browser.newContext({ reducedMotion });
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`[${gamePath} ${reducedMotion}] page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') fail(`[${gamePath} ${reducedMotion}] console error: ${message.text()}`);
    });
    await page.goto(new URL(gamePath, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: 8000 });
    return await page.evaluate(() => {
      try {
        return JSON.parse(window.render_game_to_text()).reducedMotion;
      } catch (error) {
        return `unparseable: ${error.message}`;
      }
    });
  } finally {
    await context.close();
  }
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  const baseUrl = started.baseUrl;
  browser = await chromium.launch({ headless: true });

  const reduced = await probe(browser, baseUrl, 'reduce');
  const normal = await probe(browser, baseUrl, 'no-preference');

  if (!reduced.injected) fail('runtime did not inject style[data-workshop-reduced-motion] under reduce');
  if (!normal.injected) fail('runtime did not inject style[data-workshop-reduced-motion] under no-preference');

  // Under reduce, the !important reset must collapse CSS motion to ~0.
  if (!(reduced.animationMs <= 1)) {
    fail(`reduced-motion did not neutralize animation-duration (got ${reduced.animationMs}ms, expected <= 1ms)`);
  }
  if (!(reduced.transitionMs <= 1)) {
    fail(`reduced-motion did not neutralize transition-duration (got ${reduced.transitionMs}ms, expected <= 1ms)`);
  }

  // Under no-preference, durations must be left intact (gating proof).
  if (!(normal.animationMs >= 1000)) {
    fail(`no-preference must keep animation-duration intact (got ${normal.animationMs}ms, expected >= 1000ms)`);
  }
  if (!(normal.transitionMs >= 1000)) {
    fail(`no-preference must keep transition-duration intact (got ${normal.transitionMs}ms, expected >= 1000ms)`);
  }

  // Motion-aware games must report the live reduced-motion state in their
  // diagnostics so the canvas-motion gating is verifiable, not just visual.
  for (const gamePath of MOTION_AWARE_GAMES) {
    const underReduce = await gameReducedMotionFlag(browser, baseUrl, gamePath, 'reduce');
    if (underReduce !== true) {
      fail(`${gamePath}: render_game_to_text().reducedMotion must be true under reduce (got ${JSON.stringify(underReduce)})`);
    }
    const underNormal = await gameReducedMotionFlag(browser, baseUrl, gamePath, 'no-preference');
    if (underNormal !== false) {
      fail(`${gamePath}: render_game_to_text().reducedMotion must be false under no-preference (got ${JSON.stringify(underNormal)})`);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (issues.length) {
  console.error(`Reduced-motion baseline check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Reduced-motion baseline check passed: workshop-runtime.js injects a gated prefers-reduced-motion reset, and ${MOTION_AWARE_GAMES.length} motion-aware game(s) report the live reduced-motion state in diagnostics.`);
