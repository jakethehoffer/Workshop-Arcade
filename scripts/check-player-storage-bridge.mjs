#!/usr/bin/env node
// Browser-backed player storage bridge probe.
//
// The catalog player runs games inside `sandbox="allow-scripts"` iframes, so
// their origin is opaque and real localStorage is unreachable. The storage
// bridge keeps persistence anyway: the catalog seeds each game with its saved
// entries via a `#wa-storage=` fragment, and workshop-runtime.js forwards
// writes back to the catalog over postMessage, where they land in the parent
// origin's localStorage under `workshop-arcade:game:<slug>:`.
//
// This probe drives the real catalog page in Chromium and proves:
//   1. Direct (top-level) game loads keep native localStorage and never
//      create mirror keys — the bridge stays dormant.
//   2. A game opened in the player sees previously saved entries (seeding).
//   3. Writes inside the player land in the parent mirror (write-behind).
//   4. `clear()` inside a game only removes that game's mirror keys — other
//      games' mirrors and catalog shell keys survive.
//   5. Saved values survive a full page reload and player reopen.

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
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const GAME_SLUG = 'echo-mimic';
const GAME_URL = `websites/${GAME_SLUG}.html`;
const MIRROR_PREFIX = `workshop-arcade:game:${GAME_SLUG}:`;
const OTHER_MIRROR_KEY = 'workshop-arcade:game:zzz-other-game:keep';
const SHELL_KEY = 'workshop-arcade:favorites:v1';
const WAIT_MS = 8000;

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

async function gameFrame(page) {
  await page.waitForSelector('#playerFrame[src]', { timeout: WAIT_MS });
  const frameHandle = await page.locator('#playerFrame').elementHandle();
  const frame = await frameHandle?.contentFrame();
  if (!frame) throw new Error('player iframe did not expose a content frame');
  await frame.waitForFunction(() => typeof window.render_game_to_text === 'function', undefined, { timeout: WAIT_MS });
  return frame;
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  const baseUrl = started.baseUrl;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => fail(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') fail(`console error: ${message.text()}`);
  });

  // 1. Direct top-level game load: native storage, no bridge, no mirror keys.
  await page.goto(new URL(GAME_URL, baseUrl).href, { waitUntil: 'domcontentloaded' });
  const direct = await page.evaluate(() => {
    localStorage.setItem('wa-bridge-direct-probe', 'direct');
    const value = localStorage.getItem('wa-bridge-direct-probe');
    const mirrored = Object.keys(localStorage).filter((key) => key.startsWith('workshop-arcade:game:'));
    localStorage.removeItem('wa-bridge-direct-probe');
    return { value, mirrored };
  });
  if (direct.value !== 'direct') {
    fail(`direct game load must keep native localStorage (got ${JSON.stringify(direct.value)})`);
  }
  if (direct.mirrored.length > 0) {
    fail(`direct game load must not create mirror keys (found ${direct.mirrored.join(', ')})`);
  }

  // Seed parent-side state before opening the player: one saved entry for the
  // game (seeding proof), one foreign mirror, and one catalog shell key
  // (clear() scoping proof).
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ mirrorPrefix, otherKey, shellKey }) => {
    localStorage.setItem(`${mirrorPrefix}doomed`, 'seeded-value');
    localStorage.setItem(otherKey, 'safe');
    if (localStorage.getItem(shellKey) === null) {
      localStorage.setItem(shellKey, '[]');
    }
  }, { mirrorPrefix: MIRROR_PREFIX, otherKey: OTHER_MIRROR_KEY, shellKey: SHELL_KEY });

  // 2 + 3. Open the player; the game must see the seeded entry, and a new
  // write must land in the parent mirror.
  await page.goto(`${baseUrl}#play=${GAME_SLUG}`, { waitUntil: 'domcontentloaded' });
  let frame = await gameFrame(page);
  const seeded = await frame.evaluate(() => window.localStorage.getItem('doomed'));
  if (seeded !== 'seeded-value') {
    fail(`player game must see seeded entry "doomed" (got ${JSON.stringify(seeded)})`);
  }
  await frame.evaluate(() => {
    window.localStorage.setItem('bridge-probe', '42');
  });
  try {
    await page.waitForFunction(
      (key) => localStorage.getItem(key) === '42',
      `${MIRROR_PREFIX}bridge-probe`,
      { timeout: WAIT_MS }
    );
  } catch {
    fail('player write did not reach the parent mirror (write-behind missing)');
  }

  // 4. clear() inside the game wipes only this game's mirror.
  await frame.evaluate(() => window.localStorage.clear());
  try {
    await page.waitForFunction(
      (prefix) => Object.keys(localStorage).every((key) => !key.startsWith(prefix)),
      MIRROR_PREFIX,
      { timeout: WAIT_MS }
    );
  } catch {
    fail('clear() inside the player did not remove the game mirror keys');
  }
  const scoped = await page.evaluate(({ otherKey, shellKey }) => ({
    other: localStorage.getItem(otherKey),
    shell: localStorage.getItem(shellKey),
  }), { otherKey: OTHER_MIRROR_KEY, shellKey: SHELL_KEY });
  if (scoped.other !== 'safe') {
    fail(`clear() must not touch other games' mirrors (got ${JSON.stringify(scoped.other)})`);
  }
  if (scoped.shell === null) {
    fail('clear() must not touch catalog shell keys');
  }

  // 5. Persistence: write again, reload the whole catalog, reopen the player,
  // and the value must come back through the seed.
  await frame.evaluate(() => {
    window.localStorage.setItem('bridge-probe', '42');
  });
  try {
    await page.waitForFunction(
      (key) => localStorage.getItem(key) === '42',
      `${MIRROR_PREFIX}bridge-probe`,
      { timeout: WAIT_MS }
    );
  } catch {
    fail('post-clear player write did not reach the parent mirror');
  }
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.goto(`${baseUrl}#play=${GAME_SLUG}`, { waitUntil: 'domcontentloaded' });
  frame = await gameFrame(page);
  const revived = await frame.evaluate(() => window.localStorage.getItem('bridge-probe'));
  if (revived !== '42') {
    fail(`saved value must survive reload and player reopen (got ${JSON.stringify(revived)})`);
  }

  await page.close();
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (issues.length) {
  console.error(`Player storage bridge check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Player storage bridge check passed for ${GAME_SLUG} (seed, write-behind, scoped clear, reload persistence).`);
