#!/usr/bin/env node
// Post-deploy GitHub Pages smoke check.
//
// This is intentionally separate from `npm test`: it hits the deployed site,
// so it should run after Pages finishes or when explicitly pointed at a local
// preview with WORKSHOP_ARCADE_URL.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(repoRoot, 'websites', 'manifest.json'), 'utf8'));
const localServiceWorkerText = await readFile(resolve(repoRoot, 'sw.js'), 'utf8');
const localServiceWorker = parseServiceWorkerIdentity(localServiceWorkerText);
const baseUrl = normalizeBaseUrl(process.env.WORKSHOP_ARCADE_URL || 'https://jakethehoffer.github.io/Workshop-Arcade/');
const requestedSlugEnv = process.env.WORKSHOP_ARCADE_LIVE_SLUGS || process.env.WORKSHOP_ARCADE_TOUCHED_SLUGS;
const requestedSlugSource = process.env.WORKSHOP_ARCADE_LIVE_SLUGS
  ? 'WORKSHOP_ARCADE_LIVE_SLUGS'
  : process.env.WORKSHOP_ARCADE_TOUCHED_SLUGS
    ? 'WORKSHOP_ARCADE_TOUCHED_SLUGS'
    : null;
const requestedSlugs = parseSlugs(requestedSlugEnv);
const defaultSlugs = newestManifestSlugs(3);
const slugsToCheck = requestedSlugs.length ? requestedSlugs : defaultSlugs;
const issues = [];
const startedAt = new Date().toISOString();
const summaryDir = resolve(repoRoot, 'test-results', 'live-pages-smoke', startedAt.replace(/[:.]/g, '-'));
const summaryPath = resolve(summaryDir, 'summary.json');
const requireLiveSlugs = parseBooleanFlag(process.env.WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS);
const skipServiceWorkerRevision = parseBooleanFlag(process.env.WORKSHOP_ARCADE_SKIP_SW_REVISION);
const skipContentHash = parseBooleanFlag(process.env.WORKSHOP_ARCADE_SKIP_CONTENT_HASH);
const expectedServiceWorkerRevision = skipServiceWorkerRevision
  ? null
  : process.env.WORKSHOP_ARCADE_EXPECTED_SW_REVISION || localServiceWorker.shellRevision;
const summary = {
  status: 'running',
  startedAt,
  finishedAt: null,
  baseUrl,
  requireLiveSlugs,
  slugSource: requestedSlugSource || 'newest manifest entries',
  requestedSlugs,
  defaultSlugs,
  slugsToCheck,
  slugsChecked: [],
  fetches: [],
  pages: [],
  contentHash: {
    skipped: skipContentHash,
    normalizedLineEndings: true,
  },
  serviceWorker: {
    expectedShellRevision: expectedServiceWorkerRevision,
    expectedSource: skipServiceWorkerRevision
      ? 'skipped'
      : process.env.WORKSHOP_ARCADE_EXPECTED_SW_REVISION
        ? 'WORKSHOP_ARCADE_EXPECTED_SW_REVISION'
        : 'local sw.js',
    localShellRevision: localServiceWorker.shellRevision,
    localVersion: localServiceWorker.version,
    remoteShellRevision: null,
    remoteVersion: null,
    revisionCheck: skipServiceWorkerRevision ? 'skipped' : 'pending',
  },
  issues,
};

function normalizeBaseUrl(value) {
  return `${String(value || '').replace(/\/+$/, '')}/`;
}

function parseSlugs(value) {
  return String(value || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function newestManifestSlugs(count) {
  return [...manifest]
    .sort((a, b) => String(b?.addedAt || '').localeCompare(String(a?.addedAt || '')))
    .map((game) => game?.slug || game?.id)
    .filter(Boolean)
    .slice(0, count);
}

function parseBooleanFlag(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function parseServiceWorkerIdentity(text) {
  return {
    shellRevision: text.match(/const\s+SHELL_REVISION\s*=\s*['"`]([^'"`]+)['"`]/)?.[1] || null,
    version: text.match(/const\s+VERSION\s*=\s*['"`]([^'"`]+)['"`]/)?.[1] || null,
  };
}

function normalizedForHash(text) {
  return String(text).replace(/\r\n/g, '\n');
}

function sha256Text(text) {
  return createHash('sha256').update(normalizedForHash(text), 'utf8').digest('hex');
}

function relativeArtifactPath(file) {
  return relative(repoRoot, file).replace(/\\/g, '/');
}

function safeArtifactName(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
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
  const record = {
    label,
    relativePath,
    url,
    status: null,
    ok: false,
    contentType: '',
    bytes: 0,
  };
  summary.fetches.push(record);

  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    fail(label, `request failed for ${url}: ${error.message}`);
    return null;
  }

  record.status = response.status;
  record.contentType = response.headers.get('content-type') || '';
  if (response.status !== 200) {
    fail(label, `expected HTTP 200 for ${url}, got ${response.status}`);
    return null;
  }

  const text = await response.text();
  record.ok = true;
  record.bytes = Buffer.byteLength(text);
  if (validate) {
    try {
      await validate({ text, contentType: record.contentType, url, record, relativePath, label });
    } catch (error) {
      fail(label, `validation failed: ${error.message}`);
    }
  }
  return text;
}

async function assertGameContentHash(game, remoteText, record, label) {
  const remoteSha256 = sha256Text(remoteText);
  record.contentHash = {
    check: skipContentHash ? 'skipped' : 'pending',
    localPath: game.url,
    normalizedLineEndings: true,
    localSha256: null,
    remoteSha256,
  };

  if (skipContentHash) return;

  let localText;
  try {
    localText = await readFile(resolve(repoRoot, game.url), 'utf8');
  } catch (error) {
    record.contentHash.check = 'failed';
    fail(label, `unable to read local ${game.url} for content hash: ${error.message}`);
    return;
  }

  const localSha256 = sha256Text(localText);
  record.contentHash.localSha256 = localSha256;
  if (localSha256 !== remoteSha256) {
    record.contentHash.check = 'failed';
    fail(label, `content hash mismatch for ${game.url}: local ${localSha256}, remote ${remoteSha256}`);
    return;
  }

  record.contentHash.check = 'passed';
}

function gameForSlug(slug) {
  return manifest.find((game) =>
    game.slug === slug ||
    game.id === slug ||
    game.url === slug ||
    game.url === `websites/${slug}.html`
  );
}

async function observePage(page, label, githubRequests) {
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

  await page.route('https://api.github.com/**', async (route) => {
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
  return overflow;
}

async function captureRenderSnapshot(page, label) {
  const render = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') {
      return { available: false, text: null, bytes: 0, error: null };
    }
    try {
      const text = String(window.render_game_to_text());
      return {
        available: true,
        text: text.length > 4000 ? `${text.slice(0, 4000)}...[truncated]` : text,
        bytes: text.length,
        error: null,
      };
    } catch (error) {
      return {
        available: true,
        text: null,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  if (render.error) {
    fail(label, `render_game_to_text failed: ${render.error}`);
  }
  return render;
}

async function captureCanvasEvidence(page, label) {
  const evidence = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return { hasCanvas: false, width: 0, height: 0, nonblank: null, sampleCount: 0, uniqueSamples: 0, coloredSamples: 0, error: null };
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return { hasCanvas: true, width: canvas.width, height: canvas.height, nonblank: false, sampleCount: 0, uniqueSamples: 0, coloredSamples: 0, error: '2d context unavailable' };
    }
    const samples = new Set();
    let coloredSamples = 0;
    let sampleCount = 0;
    try {
      for (let row = 1; row <= 5; row += 1) {
        for (let column = 1; column <= 7; column += 1) {
          const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((canvas.width * column) / 8)));
          const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((canvas.height * row) / 6)));
          const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
          samples.add(`${red},${green},${blue},${alpha}`);
          if (alpha > 0 && red + green + blue > 16) coloredSamples += 1;
          sampleCount += 1;
        }
      }
    } catch (error) {
      return {
        hasCanvas: true,
        width: canvas.width,
        height: canvas.height,
        nonblank: false,
        sampleCount,
        uniqueSamples: samples.size,
        coloredSamples,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      hasCanvas: true,
      width: canvas.width,
      height: canvas.height,
      nonblank: samples.size > 1 || coloredSamples > 0,
      sampleCount,
      uniqueSamples: samples.size,
      coloredSamples,
      error: null,
    };
  });

  if (evidence.error) {
    fail(label, `canvas evidence failed: ${evidence.error}`);
  } else if (evidence.hasCanvas && !evidence.nonblank) {
    fail(label, 'canvas appears blank');
  }
  return evidence;
}

async function captureScreenshot(page, label) {
  await mkdir(summaryDir, { recursive: true });
  const screenshotPath = resolve(summaryDir, `${safeArtifactName(label)}.png`);
  await page.screenshot({ path: screenshotPath });
  return relativeArtifactPath(screenshotPath);
}

async function checkCatalog(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const githubRequests = [];
  const pageRecord = {
    label: 'catalog desktop',
    url: baseUrl,
    viewport: { width: 1280, height: 900 },
    loaded: false,
    cardCount: 0,
    overflow: null,
    githubRequests,
  };
  summary.pages.push(pageRecord);
  await observePage(page, 'catalog', githubRequests);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await page.waitForTimeout(500);

  pageRecord.cardCount = await page.locator('.card').count();
  pageRecord.loaded = pageRecord.cardCount === manifest.length;
  pageRecord.overflow = await assertNoOverflow(page, 'catalog');
  const title = await page.title();
  pageRecord.title = title;
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
  const mobileRecord = {
    label: 'catalog mobile',
    url: baseUrl,
    viewport: { width: 390, height: 844 },
    loaded: false,
    cardCount: 0,
    overflow: null,
    githubRequests: mobileGithubRequests,
  };
  summary.pages.push(mobileRecord);
  await observePage(mobilePage, 'catalog mobile', mobileGithubRequests);
  await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await mobilePage.waitForTimeout(500);
  mobileRecord.cardCount = await mobilePage.locator('.card').count();
  mobileRecord.loaded = mobileRecord.cardCount === manifest.length;
  mobileRecord.overflow = await assertNoOverflow(mobilePage, 'catalog mobile');
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
    const pageRecord = {
      label,
      url: pageUrl(game.url),
      viewport: viewport.options.viewport,
      loaded: false,
      hasRender: false,
      hasAdvance: false,
      render: null,
      canvas: null,
      screenshot: null,
      overflow: null,
      githubRequests,
    };
    summary.pages.push(pageRecord);
    await observePage(page, label, githubRequests);

    await page.goto(pageRecord.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(700);

    const loaded = await page.evaluate(() => {
      const textLength = (document.body?.innerText || '').trim().length;
      const controls = document.querySelectorAll('canvas,button,input,select,textarea,[role="button"]').length;
      const hasBox = document.body && document.body.getBoundingClientRect().width > 0 && document.body.getBoundingClientRect().height > 0;
      return Boolean(hasBox && (textLength > 20 || controls > 0));
    });
    pageRecord.loaded = loaded;
    if (!loaded) {
      fail(label, 'page appears blank or non-interactive');
    }

    const diagnostics = await page.evaluate(() => ({
      hasRender: typeof window.render_game_to_text === 'function',
      hasAdvance: typeof window.advanceTime === 'function',
    }));
    pageRecord.hasRender = diagnostics.hasRender;
    pageRecord.hasAdvance = diagnostics.hasAdvance;
    if (!diagnostics.hasRender) fail(label, 'missing render_game_to_text()');
    if (!diagnostics.hasAdvance) fail(label, 'missing advanceTime(ms)');
    pageRecord.render = await captureRenderSnapshot(page, label);
    pageRecord.canvas = await captureCanvasEvidence(page, label);
    pageRecord.screenshot = await captureScreenshot(page, label);
    pageRecord.overflow = await assertNoOverflow(page, label);
    if (githubRequests.length) {
      fail(label, `unexpected GitHub API request: ${githubRequests.join(', ')}`);
    }
    await context.close();
  }
}

async function writeSummary() {
  summary.status = issues.length ? 'failed' : 'passed';
  summary.finishedAt = new Date().toISOString();
  summary.issueCount = issues.length;
  summary.issues = [...issues];
  await mkdir(summaryDir, { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

let browser;
try {
  if (requireLiveSlugs && !requestedSlugs.length) {
    fail('config', 'WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1 requires WORKSHOP_ARCADE_LIVE_SLUGS or WORKSHOP_ARCADE_TOUCHED_SLUGS');
  }

  await assertFetchOk('', 'catalog root', ({ text, contentType }) => {
    if (!/html/i.test(contentType)) fail('catalog root', `unexpected content-type ${contentType}`);
    if (!/Workshop Arcade/i.test(text)) fail('catalog root', 'missing Workshop Arcade text');
  });

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
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedMinimum = manifest.length + 1;
    const canonicalRoot = 'https://jakethehoffer.github.io/Workshop-Arcade/';
    const hasTargetRoot = locs.some((loc) => normalizeBaseUrl(loc) === baseUrl || normalizeBaseUrl(loc) === canonicalRoot);
    if (!text.includes('<urlset') || locs.length < expectedMinimum || !hasTargetRoot) {
      fail('sitemap', `expected urlset with at least ${expectedMinimum} URLs and a catalog root reference, found ${locs.length}`);
    }
  });

  await assertFetchOk('app.webmanifest', 'app webmanifest', ({ text, contentType }) => {
    if (!/json|manifest/i.test(contentType)) fail('app webmanifest', `unexpected content-type ${contentType}`);
    try {
      const appManifest = JSON.parse(text);
      if (!appManifest.name || !Array.isArray(appManifest.icons)) {
        fail('app webmanifest', 'missing name or icons');
      }
    } catch (error) {
      fail('app webmanifest', `invalid JSON: ${error.message}`);
    }
  });

  await assertFetchOk('sw.js', 'service worker', ({ text }) => {
    const remoteServiceWorker = parseServiceWorkerIdentity(text);
    summary.serviceWorker.remoteShellRevision = remoteServiceWorker.shellRevision;
    summary.serviceWorker.remoteVersion = remoteServiceWorker.version;

    if (!/addEventListener\(['"`]fetch['"`]/.test(text)) fail('service worker', 'missing fetch listener');
    if (!/RUNTIME_CACHE_MAX_ENTRIES/.test(text)) fail('service worker', 'missing runtime cache cap');
    if (!remoteServiceWorker.shellRevision) fail('service worker', 'missing SHELL_REVISION');
    if (!remoteServiceWorker.version) fail('service worker', 'missing VERSION');
    if (skipServiceWorkerRevision) return;

    if (!expectedServiceWorkerRevision) {
      summary.serviceWorker.revisionCheck = 'failed';
      fail('service worker', 'missing expected SHELL_REVISION; set WORKSHOP_ARCADE_EXPECTED_SW_REVISION or WORKSHOP_ARCADE_SKIP_SW_REVISION=1');
      return;
    }

    if (remoteServiceWorker.shellRevision !== expectedServiceWorkerRevision) {
      summary.serviceWorker.revisionCheck = 'failed';
      fail('service worker', `expected SHELL_REVISION ${expectedServiceWorkerRevision}, got ${remoteServiceWorker.shellRevision || 'missing'}`);
      return;
    }

    summary.serviceWorker.revisionCheck = 'passed';
  });

  await assertFetchOk('offline.html', 'offline page', ({ text, contentType }) => {
    if (!/html/i.test(contentType)) fail('offline page', `unexpected content-type ${contentType}`);
    if (!/offline/i.test(text) || !/catalog/i.test(text)) fail('offline page', 'missing offline/catalog recovery copy');
  });

  await assertFetchOk('404.html', '404 page', ({ text, contentType }) => {
    if (!/html/i.test(contentType)) fail('404 page', `unexpected content-type ${contentType}`);
    if (!/404|not found/i.test(text) || !/catalog/i.test(text)) fail('404 page', 'missing not-found/catalog recovery copy');
  });

  await assertFetchOk('robots.txt', 'robots', ({ text, contentType }) => {
    if (!/text|plain/i.test(contentType)) fail('robots', `unexpected content-type ${contentType}`);
    if (!/Sitemap:/i.test(text)) fail('robots', 'missing Sitemap directive');
  });

  const games = slugsToCheck.map((slug) => {
    const game = gameForSlug(slug);
    if (!game) fail('config', `unknown game slug "${slug}"`);
    return game;
  }).filter(Boolean);
  summary.slugsChecked = games.map((game) => game.slug);

  for (const game of games) {
    await assertFetchOk(game.url, game.slug, async ({ text, record, label }) => {
      await assertGameContentHash(game, text, record, label);
    });
  }

  browser = await chromium.launch({ headless: !process.env.HEADED });
  await checkCatalog(browser);
  for (const game of games) {
    await checkGame(browser, game);
  }
} catch (error) {
  fail('runtime', error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  await writeSummary();
}

if (issues.length) {
  console.error(`Live Pages smoke failed against ${baseUrl} with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  console.error(`Summary: ${summaryPath}`);
  process.exit(1);
}

console.log(`Live Pages smoke passed against ${baseUrl}: catalog, manifest, feed, sitemap, runtime/PWA surfaces, and ${summary.slugsChecked.join(', ')}.`);
console.log(`Summary: ${summaryPath}`);
