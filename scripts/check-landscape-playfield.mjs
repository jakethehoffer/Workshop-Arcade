#!/usr/bin/env node
// Phone-landscape playfield visibility gate.
//
// Every game page is responsive, but the responsive rules across the catalog
// are keyed on *width* alone. A phone held sideways is not narrow — it is
// short and wide (844x390 rather than 390x844) — so a width-only breakpoint
// happily serves the tall stacked "narrow phone" layout to a viewport with a
// third of the height. The HUD, the title block and the button row then eat
// the entire first screen and the play area lands below the fold.
//
// That failure is invisible to every other gate: `test:games`, `capture:games`
// and `audit:contrast` all run at 1280x820 desktop and 390x844 portrait, both
// of which are tall enough to hide the problem. It was found by measurement on
// 2026-09-10, when shape-inlay rendered *zero* pixels of its canvas in the
// first landscape screen (canvas top 862px into a 390px viewport) and
// gemline-cascade rendered 18 of 558.
//
// This probe loads every game at 844x390 and asserts that the playfield canvas
// both starts inside the first screen and shows a real strip of itself there.
// It is deliberately a blackout gate, not a layout-quality bar: it fails a page
// that shows the player no game at all, and records the full ranking in its
// summary so tighter thresholds can be argued from data later.
//
// Games that render their board in the DOM instead of a canvas have no single
// unambiguous playfield element to measure, so they are reported as skipped
// rather than silently passed. Such a game can still opt in by tagging the
// surfaces a sideways player cannot do without — its board and, on a touch
// device, its on-screen keypad — with `data-landscape-essential="<name>"`.
// Every tagged element must sit *entirely* inside the first landscape screen:
// half a digit pad is not a usable digit pad. That was added on 2026-09-10,
// when wordle, volt-sudoku and cipher-rooms were each found showing their
// puzzle with the only way to answer it 590-736px down a 390px screen.

import { createServer } from 'node:http';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createIsolatedViewportContext } from './playwright-harness.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// An iPhone-class handset turned sideways. Portrait 390x844 is already covered
// by the smoke and capture sweeps; this is the same device rotated.
const VIEWPORT = { width: 844, height: 390, isMobile: true, hasTouch: true };

// A canvas smaller than this in either direction is decoration (a sparkline, a
// gauge, an effects layer), not the playfield.
const MIN_PLAYFIELD_PX = 40;

// How much of the playfield must fall inside the first landscape screen. Low on
// purpose: the bug this guards against is "the player sees no game", and the
// worst passing game today sits at 109px, so 64 keeps real headroom while still
// failing a blackout outright.
const MIN_VISIBLE_PX = 64;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
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

  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

// Runs in the page. Picks the largest visible canvas as the playfield and
// reports where it sits relative to the first screen.
function measurePlayfield(minPlayfieldPx) {
  const viewportHeight = window.innerHeight;
  let best = null;
  for (const canvas of document.querySelectorAll('canvas')) {
    const style = getComputedStyle(canvas);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < minPlayfieldPx || rect.height < minPlayfieldPx) continue;
    if (!best || rect.width * rect.height > best.width * best.height) best = rect;
  }
  const essential = [...document.querySelectorAll('[data-landscape-essential]')].map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      name: node.getAttribute('data-landscape-essential'),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
    };
  });
  if (!best) return { hasCanvas: false, viewportHeight, essential };
  const visible = Math.max(0, Math.min(best.bottom, viewportHeight) - Math.max(best.top, 0));
  return {
    hasCanvas: true,
    viewportHeight,
    essential,
    top: Math.round(best.top),
    height: Math.round(best.height),
    width: Math.round(best.width),
    visible: Math.round(visible),
    documentHeight: document.documentElement.scrollHeight,
  };
}

const manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));
const startedAt = new Date().toISOString();
const { server, baseUrl } = await startServer();
const browser = await chromium.launch();
const measurements = [];

try {
  const context = await createIsolatedViewportContext(browser, VIEWPORT);
  try {
    const page = await context.newPage();
    for (const game of manifest) {
      const slug = game.slug;
      page.removeAllListeners('pageerror');
      page.on('pageerror', (error) => fail(`${slug}: page error at landscape — ${error.message}`));
      await page.goto(new URL(game.url, baseUrl).href, { waitUntil: 'load' });
      await page.waitForFunction(
        () => typeof window.render_game_to_text === 'function',
        undefined,
        { timeout: 15000 },
      );
      const result = await page.evaluate(measurePlayfield, MIN_PLAYFIELD_PX);
      measurements.push({ slug, ...result });

      // A tagged surface is one the player cannot play without. Unlike the
      // canvas floor above, it has to fit whole: a keypad cut off at the fold
      // is a keypad the player has to scroll away from the board to reach.
      for (const surface of result.essential) {
        if (surface.top < -1 || surface.bottom > result.viewportHeight + 1) {
          fail(
            `${slug}: the ${surface.name} does not fit the first landscape screen `
            + `(top=${surface.top}px, bottom=${surface.bottom}px, viewport=${result.viewportHeight}px) `
            + '— a sideways phone cannot reach it without scrolling away from the board',
          );
        }
      }

      if (!result.hasCanvas) continue;

      if (result.top >= result.viewportHeight) {
        fail(
          `${slug}: playfield starts below the first landscape screen `
          + `(top=${result.top}px, viewport=${result.viewportHeight}px) — a sideways phone shows no game at all`,
        );
        continue;
      }
      if (result.visible < MIN_VISIBLE_PX) {
        fail(
          `${slug}: only ${result.visible}px of the ${result.height}px playfield is inside the first landscape `
          + `screen (need ${MIN_VISIBLE_PX}px, top=${result.top}px, viewport=${result.viewportHeight}px)`,
        );
      }
    }
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}

const canvasGames = measurements.filter((entry) => entry.hasCanvas);
const skipped = measurements.filter((entry) => !entry.hasCanvas).map((entry) => entry.slug);
const taggedGames = measurements.filter((entry) => entry.essential.length > 0);
const ranked = [...canvasGames].sort((a, b) => a.visible - b.visible);

const outputDir = join(repoRoot, 'test-results', 'landscape-playfield', startedAt.replace(/[:.]/g, '-'));
await mkdir(outputDir, { recursive: true });
await writeFile(
  join(outputDir, 'summary.json'),
  `${JSON.stringify({
    startedAt,
    finishedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    minVisiblePx: MIN_VISIBLE_PX,
    minPlayfieldPx: MIN_PLAYFIELD_PX,
    gamesChecked: manifest.length,
    canvasGames: canvasGames.length,
    domRenderedSkipped: skipped,
    taggedSurfaces: taggedGames.map((entry) => ({ slug: entry.slug, essential: entry.essential })),
    passed: issues.length === 0,
    issues,
    measurements: ranked,
  }, null, 2)}\n`,
  'utf8',
);

console.log(`Landscape playfield summary: ${join(outputDir, 'summary.json')}`);
console.log(
  `Checked ${canvasGames.length} canvas games at ${VIEWPORT.width}x${VIEWPORT.height}; `
  + `${skipped.length} DOM-rendered games have no single playfield canvas to measure `
  + `(${skipped.join(', ') || 'none'}).`,
);
console.log(
  `${taggedGames.length} game(s) additionally require tagged surfaces to fit whole: `
  + `${taggedGames.map((entry) => `${entry.slug} (${entry.essential.map((surface) => surface.name).join(', ')})`).join('; ') || 'none'}.`,
);

if (issues.length) {
  console.error('\nLandscape playfield gate failed:');
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const tightest = ranked[0];
console.log(
  `Every playfield opens inside the first landscape screen. Tightest margin: `
  + `${tightest.slug} shows ${tightest.visible}px of ${tightest.height}px (floor ${MIN_VISIBLE_PX}px).`,
);
