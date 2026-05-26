#!/usr/bin/env node
// Post-deploy GitHub Pages smoke check.
//
// This is intentionally separate from `npm test`: it hits the deployed site,
// so it should run after Pages finishes or when explicitly pointed at a local
// preview with WORKSHOP_ARCADE_URL.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(repoRoot, 'websites', 'manifest.json'), 'utf8'));
const baseUrl = normalizeBaseUrl(process.env.WORKSHOP_ARCADE_URL || 'https://jakethehoffer.github.io/Workshop-Arcade/');
const requestedSlugs = parseSlugs(process.env.WORKSHOP_ARCADE_LIVE_SLUGS || process.env.WORKSHOP_ARCADE_TOUCHED_SLUGS);
const defaultSlugs = ['lumen-lander', 'relay-choir', 'tetris'];
const slugsToCheck = requestedSlugs.length ? requestedSlugs : defaultSlugs;
const issues = [];

function normalizeBaseUrl(value) {
  return `${String(value || '').replace(/\/+$/, '')}/`;
}

function parseSlugs(value) {
  return String(value || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function fail(label, message) {
  issues.push(`${label}: ${message}`);
}

function pageUrl(relativePath) {
  return new URL(relativePath.replace(/^\/+/, ''), baseUrl).href;
}

function sameOrigin(url) {
  return url.startsWith(baseUrl);
}

function isIgnoredUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith('/favicon.ico');
  } catch {
    return false;
  }
}

async function assertFetchOk(relativePath, label, validate) {
  const url = pageUrl(relativePath);
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    fail(label, `request failed for ${url}: ${error.message}`);
    return null;
  }

  if (response.status !== 200) {
    fail(label, `expected HTTP 200 for ${url}, got ${response.status}`);
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (validate) validate({ text, contentType, url });
  return text;
}

function gameForSlug(slug) {
  return manifest.find((game) =>
    game.slug === slug ||
    game.id === slug ||
    game.url === slug ||
    game.url === `websites/${slug}.html`
  );
}

function observePage(page, label, githubRequests) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const locationUrl = message.location()?.url || '';
    if (/favicon\.ico/i.test(text)) return;
    if (/api\.github\.com/i.test(text) || /api\.github\.com/i.test(locationUrl)) return;
    fail(label, `console error: ${text}`);
  });

  page.on('pageerror', (error) => {
    fail(label, `page error: ${error.message}`);
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!sameOrigin(url) || isIgnoredUrl(url)) return;
    if (response.status() >= 400) {
      fail(label, `HTTP ${response.status()} for ${url}`);
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!sameOrigin(url) || isIgnoredUrl(url)) return;
    const errorText = request.failure()?.errorText || '';
    if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(errorText)) return;
    fail(label, `request failed for ${url}: ${errorText || 'unknown error'}`);
  });

  page.route('https://api.github.com/**', async (route) => {
    githubRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json; charset=utf-8',
      },
      body: '[]',
    });
  });
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
  if (overflow > 2) {
    fail(label, `horizontal overflow ${overflow}px`);
  }
}

async function checkCatalog(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const githubRequests = [];
  observePage(page, 'catalog', githubRequests);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await page.waitForTimeout(500);

  const title = await page.title();
  if (!/Workshop Arcade/i.test(title)) {
    fail('catalog', `unexpected title "${title}"`);
  }
  if (githubRequests.length) {
    fail('catalog', `GitHub API requested during startup: ${githubRequests.join(', ')}`);
  }
  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  const mobileGithubRequests = [];
  observePage(mobilePage, 'catalog mobile', mobileGithubRequests);
  await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await mobilePage.waitForTimeout(500);
  await assertNoOverflow(mobilePage, 'catalog mobile');
  if (mobileGithubRequests.length) {
    fail('catalog mobile', `GitHub API requested during startup: ${mobileGithubRequests.join(', ')}`);
  }
  await mobileContext.close();
}

async function checkGame(browser, game) {
  for (const viewport of [
    { label: 'desktop', options: { viewport: { width: 1280, height: 800 } } },
    { label: 'mobile', options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ]) {
    const label = `${game.slug} ${viewport.label}`;
    const context = await browser.newContext(viewport.options);
    const page = await context.newPage();
    const githubRequests = [];
    observePage(page, label, githubRequests);

    await page.goto(pageUrl(game.url), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(700);

    const loaded = await page.evaluate(() => {
      const textLength = (document.body?.innerText || '').trim().length;
      const controls = document.querySelectorAll('canvas,button,input,select,textarea,[role="button"]').length;
      const hasBox = document.body && document.body.getBoundingClientRect().width > 0 && document.body.getBoundingClientRect().height > 0;
      return Boolean(hasBox && (textLength > 20 || controls > 0));
    });
    if (!loaded) {
      fail(label, 'page appears blank or non-interactive');
    }

    const diagnostics = await page.evaluate(() => ({
      hasRender: typeof window.render_game_to_text === 'function',
      hasAdvance: typeof window.advanceTime === 'function',
    }));
    if (!diagnostics.hasRender) fail(label, 'missing render_game_to_text()');
    if (!diagnostics.hasAdvance) fail(label, 'missing advanceTime(ms)');
    await assertNoOverflow(page, label);
    if (githubRequests.length) {
      fail(label, `unexpected GitHub API request: ${githubRequests.join(', ')}`);
    }
    await context.close();
  }
}

await assertFetchOk('websites/manifest.json', 'manifest', ({ text, contentType }) => {
  if (!/json/i.test(contentType)) fail('manifest', `unexpected content-type ${contentType}`);
  try {
    const remoteManifest = JSON.parse(text);
    if (!Array.isArray(remoteManifest)) {
      fail('manifest', 'remote manifest is not an array');
    } else if (remoteManifest.length !== manifest.length) {
      fail('manifest', `expected ${manifest.length} games, found ${remoteManifest.length}`);
    }
  } catch (error) {
    fail('manifest', `invalid JSON: ${error.message}`);
  }
});

await assertFetchOk('feed.json', 'feed', ({ text, contentType }) => {
  if (!/json/i.test(contentType)) fail('feed', `unexpected content-type ${contentType}`);
  try {
    const feed = JSON.parse(text);
    if (!Array.isArray(feed.items) || feed.items.length !== manifest.length) {
      fail('feed', `expected ${manifest.length} feed items, found ${Array.isArray(feed.items) ? feed.items.length : 'none'}`);
    }
  } catch (error) {
    fail('feed', `invalid JSON: ${error.message}`);
  }
});

await assertFetchOk('sitemap.xml', 'sitemap', ({ text, contentType }) => {
  if (!/xml/i.test(contentType)) fail('sitemap', `unexpected content-type ${contentType}`);
  if (!text.includes('<urlset') || !text.includes(pageUrl('websites/manifest.json').replace(/websites\/manifest\.json$/, ''))) {
    fail('sitemap', 'missing urlset or site root reference');
  }
});

const games = slugsToCheck.map((slug) => {
  const game = gameForSlug(slug);
  if (!game) fail('config', `unknown game slug "${slug}"`);
  return game;
}).filter(Boolean);

for (const game of games) {
  await assertFetchOk(game.url, game.slug);
}

let browser;
try {
  browser = await chromium.launch({ headless: !process.env.HEADED });
  await checkCatalog(browser);
  for (const game of games) {
    await checkGame(browser, game);
  }
} finally {
  if (browser) await browser.close();
}

if (issues.length) {
  console.error(`Live Pages smoke failed against ${baseUrl} with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log(`Live Pages smoke passed against ${baseUrl}: catalog, manifest, feed, sitemap, and ${games.map((game) => game.slug).join(', ')}.`);
