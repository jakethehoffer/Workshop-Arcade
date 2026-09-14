#!/usr/bin/env node
// Browser-backed PWA runtime probe.
//
// The static PWA contract checks service-worker source wiring. This test uses
// a real Chromium context to prove the shipped worker can control the catalog,
// cache an opened game, replay those surfaces offline, and surface the branded
// offline fallback after both a navigation miss and the cached catalog shell
// are unavailable.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const sitePrefix = '/Workshop-Arcade/';
let expectedOutage = false;
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function fail(message) {
  issues.push(message);
}

function quotedStrings(source) {
  return [...source.matchAll(/(['"])(.*?)\1/g)].map((match) => match[2]);
}

function readShellAssetFiles(swSource) {
  const match = swSource.match(/const\s+shellAssets\s*=\s*\[([\s\S]*?)\]\.map\s*\(/);
  if (!match) {
    throw new Error('Unable to parse shellAssets array for SHELL_REVISION check');
  }
  return quotedStrings(match[1]).map((asset) => asset === '' ? 'index.html' : asset);
}

async function expectedShellRevision() {
  const swSource = await readFile(join(repoRoot, 'sw.js'), 'utf8');
  const count = Number(swSource.match(/const\s+COVER_PREFETCH_COUNT\s*=\s*(\d+)/)?.[1] || 0);
  const manifest = JSON.parse(await readFile(join(repoRoot, 'websites/manifest.json'), 'utf8'));
  const coverFiles = Array.isArray(manifest)
    ? [...manifest]
      .sort((a, b) => String(b?.addedAt || '').localeCompare(String(a?.addedAt || '')))
      .slice(0, count)
      .map((game) => game?.cover)
      .filter((cover) => typeof cover === 'string' && cover.length > 0)
    : [];
  const shellFiles = [
    ...readShellAssetFiles(swSource),
    ...coverFiles,
  ];
  const hash = createHash('sha256');

  for (const relative of shellFiles) {
    const content = await readFile(join(repoRoot, relative), 'utf8');
    hash.update(relative);
    hash.update('\0');
    hash.update(content.replace(/\r\n?/g, '\n'));
    hash.update('\0');
  }

  return `shell-${hash.digest('hex').slice(0, 12)}`;
}

function requestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  if (!pathname.startsWith(sitePrefix)) return null;
  const relative = pathname === sitePrefix ? 'index.html' : pathname.slice(sitePrefix.length);
  const target = resolve(repoRoot, relative);
  return target.startsWith(repoRoot + '\\') || target.startsWith(repoRoot + '/') ? target : null;
}

async function startServer(port = 0) {
  const server = createServer(async (request, response) => {
    try {
      const file = requestPath(request.url || '/');
      if (!file) {
        response.writeHead(404).end('Not found');
        return;
      }
      const handle = await open(file, 'r');
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
        'content-type': mimeTypes.get(extname(file).toLowerCase()) || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}${sitePrefix}` };
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  const baseUrl = started.baseUrl;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/ERR_INTERNET_DISCONNECTED|status of 404/i.test(message.text())) return;
    if (expectedOutage && /ERR_CONNECTION_REFUSED|status of 503/i.test(message.text())) return;
    fail(`console error: ${message.text()}`);
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const expectedRevision = await expectedShellRevision();
  const cacheTruth = await page.evaluate(async () => {
    const swText = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const version = swText.match(/const VERSION = ['"`]([^'"`]+)['"`]/)?.[1] || '';
    const shellRevision = swText.match(/const SHELL_REVISION = ['"`]([^'"`]+)['"`]/)?.[1] || '';
    const names = await caches.keys();
    return { version, shellRevision, names };
  });
  if (cacheTruth.shellRevision !== expectedRevision) {
    fail(`service worker shell revision mismatch: expected ${expectedRevision}, got ${cacheTruth.shellRevision || 'missing'}`);
  }
  if (!cacheTruth.version.includes(cacheTruth.shellRevision)) {
    fail(`cache version "${cacheTruth.version}" does not include shell revision "${cacheTruth.shellRevision}"`);
  }
  if (!cacheTruth.version || !cacheTruth.names.length || cacheTruth.names.some((name) => !name.startsWith(cacheTruth.version))) {
    fail(`cache revision truth mismatch: ${JSON.stringify(cacheTruth)}`);
  }

  // Play ONLY through the real catalog player before the outage. Clear the
  // ordinary HTTP cache so it cannot disguise a missing service-worker copy.
  for (const slug of ['echo-mimic', 'wordle']) {
    await page.evaluate(slug => { location.hash = 'play=' + slug; }, slug);
    await page.waitForSelector('#playerFrame[src]');
    const frame = await (await page.locator('#playerFrame').elementHandle()).contentFrame();
    await frame.waitForFunction(() => typeof render_game_to_text === 'function');
    await frame.evaluate(() => localStorage.setItem('offline-save-probe', 'before outage'));
    await page.waitForFunction(slug => localStorage.getItem('workshop-arcade:game:' + slug + ':offline-save-probe') === 'before outage', slug);
    await page.locator('#playerClose').click();
    await page.waitForFunction(async slug => !!(await caches.match(new URL('websites/' + slug + '.html', location.href))), slug);
  }
  await page.waitForFunction(async () => !!(await caches.match(new URL('websites/words5.js', location.href))));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  expectedOutage = true;
  await context.setOffline(true);
  await page.reload({waitUntil: 'domcontentloaded'});
  const screenshots = join(repoRoot, 'test-results', 'adversarial-fixes');
  await mkdir(screenshots, {recursive: true});
  for (const [slug, viewport] of [['echo-mimic', {width: 1280, height: 820}], ['wordle', {width: 390, height: 844}]]) {
    await page.setViewportSize(viewport);
    await page.evaluate(slug => { location.hash = 'play=' + slug; }, slug);
    await page.waitForURL('**/websites/' + slug + '.html#wa-player=' + slug);
    await page.waitForFunction(() => typeof render_game_to_text === 'function');
    const saved = await page.evaluate(() => localStorage.getItem('offline-save-probe'));
    if (saved !== 'before outage') fail(slug + ': offline player lost its in-player save');
    await page.evaluate(() => localStorage.setItem('offline-save-probe', 'during outage'));
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => typeof render_game_to_text === 'function');
    if (await page.evaluate(() => localStorage.getItem('offline-save-probe')) !== 'during outage') fail(slug + ': offline reload lost its save');
    if (slug === 'echo-mimic') {
      await page.getByRole('button', {name: 'Start a run', exact: true}).click();
      await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === 'mimic');
      const pad = await page.evaluate(() => JSON.parse(render_game_to_text()).sequence[0]);
      await page.locator('.pad').nth(pad).click();
      await page.waitForFunction(() => JSON.parse(render_game_to_text()).round === 2);
    } else {
      for (const letter of 'crane') await page.locator(`.key[data-key="${letter}"]`).click();
      await page.locator('.key[data-key="enter"]').click();
      await page.waitForFunction(() => JSON.parse(render_game_to_text()).guessesUsed === 1);
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(slug + ': offline page overflows horizontally');
    await page.screenshot({path: join(screenshots, slug + '-offline.png'), fullPage: true});
    await page.goto(baseUrl);
  }
  await context.setOffline(false);
  expectedOutage = false;
  await page.reload();
  await page.evaluate(() => { location.hash = 'play=echo-mimic'; });
  await page.waitForSelector('#playerFrame[src]');
  let replayFrame = await (await page.locator('#playerFrame').elementHandle()).contentFrame();
  await replayFrame.waitForFunction(() => typeof render_game_to_text === 'function');
  if (await replayFrame.evaluate(() => localStorage.getItem('offline-save-probe')) !== 'during outage') fail('returning online lost the offline save');
  await page.locator('#playerClose').click();

  // A real server outage can leave navigator.onLine true. Exercise that case
  // too, with no ordinary HTTP cache left to mask the broken iframe path.
  await cdp.send('Network.clearBrowserCache');
  expectedOutage = true;
  await new Promise(resolveClose => server.close(resolveClose));
  server = null;
  if (!await page.evaluate(() => navigator.onLine)) fail('real outage probe must keep navigator.onLine true');
  await page.evaluate(() => { location.hash = 'play=echo-mimic'; });
  await page.waitForURL('**/websites/echo-mimic.html#wa-player=echo-mimic');
  await page.waitForFunction(() => typeof render_game_to_text === 'function');
  await page.goto(baseUrl);
  await page.evaluate(() => { location.hash = 'play=checkers'; });
  await page.waitForURL(/\/offline\.html(?:#.*)?$/);
  if (!/offline/i.test(await page.locator('body').innerText())) fail('never-cached game must show the offline fallback');
  await page.getByRole('link', {name: /back to catalog/i}).click();
  await page.waitForURL(baseUrl);
  await page.waitForSelector('#grid .card');

  // Resume the existing cache-cap and direct-navigation tests on this origin.
  const restarted = await startServer(Number(new URL(baseUrl).port));
  server = restarted.server;
  expectedOutage = false;

  const replayUrl = new URL('websites/echo-mimic.html', baseUrl).href;
  await page.goto(replayUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
  await page.waitForFunction(async (url) => !!(await caches.match(url)), replayUrl);

  await context.setOffline(true);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('#grid').count())) {
    fail('offline catalog shell did not render the catalog grid');
  }
  await page.goto(replayUrl, { waitUntil: 'domcontentloaded' });
  if (!/Echo Mimic/i.test(await page.title())) {
    fail('previously visited game did not replay offline');
  }

  await context.setOffline(false);
  const runtimeTrimTruth = await page.evaluate(async (rootUrl) => {
    const swText = await (await fetch(new URL('sw.js', rootUrl).href, { cache: 'no-store' })).text();
    const maxEntries = Number(swText.match(/const\s+RUNTIME_CACHE_MAX_ENTRIES\s*=\s*(\d+)/)?.[1] || 0);
    if (!Number.isFinite(maxEntries) || maxEntries < 16) {
      return { error: `invalid runtime cache max entries: ${maxEntries || 'missing'}` };
    }

    const probeUrls = [];
    for (let index = 0; index < maxEntries + 8; index += 1) {
      const probeUrl = new URL(`websites/manifest.json?runtime-cache-probe=${index}`, rootUrl).href;
      const response = await fetch(probeUrl);
      if (!response.ok) return { error: `probe fetch ${index} returned ${response.status}` };
      probeUrls.push(probeUrl);
    }

    let runtimeName = '';
    let runtimeUrls = [];
    let probeKeys = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      runtimeName = (await caches.keys()).find((name) => name.endsWith('-runtime')) || '';
      if (runtimeName) {
        const runtimeCache = await caches.open(runtimeName);
        runtimeUrls = (await runtimeCache.keys()).map((request) => request.url);
        probeKeys = runtimeUrls.filter((url) => url.includes('runtime-cache-probe='));
        if (probeKeys.includes(probeUrls[probeUrls.length - 1])) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!runtimeName) return { error: 'runtime cache missing after probe fetches' };
    return {
      maxEntries,
      runtimeName,
      runtimeCount: runtimeUrls.length,
      probeCount: probeKeys.length,
      oldestProbeCached: probeKeys.includes(probeUrls[0]),
      newestProbeCached: probeKeys.includes(probeUrls[probeUrls.length - 1]),
    };
  }, baseUrl);
  if (runtimeTrimTruth.error) {
    fail(runtimeTrimTruth.error);
  } else {
    if (runtimeTrimTruth.runtimeCount > runtimeTrimTruth.maxEntries) {
      fail(`runtime cache contains ${runtimeTrimTruth.runtimeCount} entries, exceeding cap ${runtimeTrimTruth.maxEntries}`);
    }
    if (runtimeTrimTruth.probeCount > runtimeTrimTruth.maxEntries) {
      fail(`runtime cache contains ${runtimeTrimTruth.probeCount} probe entries, exceeding cap ${runtimeTrimTruth.maxEntries}`);
    }
    if (runtimeTrimTruth.oldestProbeCached) {
      fail('runtime cache did not prune the oldest overflow probe entry');
    }
    if (!runtimeTrimTruth.newestProbeCached) {
      fail('runtime cache pruned the newest probe entry instead of retaining recent runtime content');
    }
  }

  await page.evaluate(async (rootUrl) => {
    for (const cache of await caches.keys()) {
      const opened = await caches.open(cache);
      for (const request of await opened.keys()) {
        if (request.url === rootUrl || request.url === new URL('index.html', rootUrl).href) {
          await opened.delete(request);
        }
      }
    }
  }, baseUrl);
  await context.setOffline(true);
  await page.goto(new URL('uncached-runtime-probe', baseUrl).href, { waitUntil: 'domcontentloaded' });
  const offlineText = await page.locator('body').innerText();
  const catalogLinkCount = await page.getByRole('link', { name: /back to catalog/i }).count();
  if (!/offline/i.test(offlineText) || !catalogLinkCount) {
    fail('uncached offline navigation did not reach the branded offline fallback');
  }

  await context.close();
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (issues.length) {
  console.error(`PWA runtime check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('PWA runtime check passed: in-player cache, real outage, offline save continuity, mobile fit, direct replay, cache cap, and fallback.');
