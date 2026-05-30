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
const reportPath = resolve(summaryDir, 'report.md');
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
    shellAssets: [],
    selectedGames: [],
  },
  report: null,
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

async function assertLocalContentHash(localPath, remoteText, record, label, group) {
  const remoteSha256 = sha256Text(remoteText);
  const contentHash = {
    check: skipContentHash ? 'skipped' : 'pending',
    localPath,
    normalizedLineEndings: true,
    localSha256: null,
    remoteSha256,
  };
  record.contentHash = contentHash;
  if (group && summary.contentHash[group]) {
    summary.contentHash[group].push({
      label,
      relativePath: record.relativePath,
      ...contentHash,
    });
  }

  if (skipContentHash) return;

  let localText;
  try {
    localText = await readFile(resolve(repoRoot, localPath), 'utf8');
  } catch (error) {
    contentHash.check = 'failed';
    if (group && summary.contentHash[group]) {
      const aggregate = summary.contentHash[group].find((item) => item.label === label && item.relativePath === record.relativePath);
      if (aggregate) aggregate.check = 'failed';
    }
    fail(label, `unable to read local ${localPath} for content hash: ${error.message}`);
    return;
  }

  const localSha256 = sha256Text(localText);
  contentHash.localSha256 = localSha256;
  if (group && summary.contentHash[group]) {
    const aggregate = summary.contentHash[group].find((item) => item.label === label && item.relativePath === record.relativePath);
    if (aggregate) aggregate.localSha256 = localSha256;
  }
  if (localSha256 !== remoteSha256) {
    contentHash.check = 'failed';
    if (group && summary.contentHash[group]) {
      const aggregate = summary.contentHash[group].find((item) => item.label === label && item.relativePath === record.relativePath);
      if (aggregate) aggregate.check = 'failed';
    }
    fail(label, `content hash mismatch for ${localPath}: local ${localSha256}, remote ${remoteSha256}`);
    return;
  }

  contentHash.check = 'passed';
  if (group && summary.contentHash[group]) {
    const aggregate = summary.contentHash[group].find((item) => item.label === label && item.relativePath === record.relativePath);
    if (aggregate) aggregate.check = 'passed';
  }
}

async function assertGameContentHash(game, remoteText, record, label) {
  await assertLocalContentHash(game.url, remoteText, record, label, 'selectedGames');
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
    if (text.toLowerCase().includes('favicon.ico')) return;
    if (isGitHubApiUrl(locationUrl)) return;
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

function isGitHubApiUrl(value) {
  try {
    return new URL(value).hostname === 'api.github.com';
  } catch {
    return false;
  }
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
    const canvases = [...document.querySelectorAll('canvas')];

    function metadata(canvas, index) {
      const rect = canvas.getBoundingClientRect();
      const style = window.getComputedStyle(canvas);
      const visible = rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0;
      return {
        index,
        id: canvas.id || null,
        className: typeof canvas.className === 'string' ? canvas.className || null : null,
        ariaLabel: canvas.getAttribute('aria-label'),
        ariaHidden: canvas.getAttribute('aria-hidden'),
        role: canvas.getAttribute('role'),
        width: canvas.width,
        height: canvas.height,
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        visible,
        sampled: false,
        nonblank: null,
        sampleCount: 0,
        uniqueSamples: 0,
        coloredSamples: 0,
        error: null,
      };
    }

    function sampleCanvas(canvas, entry) {
      if (!entry.visible || entry.width <= 0 || entry.height <= 0) return entry;
      const context = canvas.getContext('2d');
      if (!context) {
        entry.error = '2d context unavailable';
        return entry;
      }
      const samples = new Set();
      let coloredSamples = 0;
      let sampleCount = 0;
      try {
        for (let row = 1; row <= 5; row += 1) {
          for (let column = 1; column <= 7; column += 1) {
            const x = Math.max(0, Math.min(entry.width - 1, Math.floor((entry.width * column) / 8)));
            const y = Math.max(0, Math.min(entry.height - 1, Math.floor((entry.height * row) / 6)));
            const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
            samples.add(`${red},${green},${blue},${alpha}`);
            if (alpha > 0 && red + green + blue > 16) coloredSamples += 1;
            sampleCount += 1;
          }
        }
      } catch (error) {
        entry.sampleCount = sampleCount;
        entry.uniqueSamples = samples.size;
        entry.coloredSamples = coloredSamples;
        entry.error = error instanceof Error ? error.message : String(error);
        return entry;
      }
      entry.sampled = true;
      entry.sampleCount = sampleCount;
      entry.uniqueSamples = samples.size;
      entry.coloredSamples = coloredSamples;
      entry.nonblank = samples.size > 1 || coloredSamples > 0;
      return entry;
    }

    const canvasEvidence = canvases.map((canvas, index) => sampleCanvas(canvas, metadata(canvas, index)));
    const sampledCanvases = canvasEvidence.filter((canvas) => canvas.sampled);
    const nonblankCanvases = sampledCanvases.filter((canvas) => canvas.nonblank);
    const primary = nonblankCanvases[0] || sampledCanvases[0] || canvasEvidence[0] || null;
    const aggregateError = canvasEvidence.length && !sampledCanvases.length
      ? 'no visible sampleable canvas could be evaluated'
      : null;

    if (!primary) {
      return {
        hasCanvas: false,
        canvasCount: 0,
        sampledCanvasCount: 0,
        nonblankCanvasCount: 0,
        nonblank: null,
        width: 0,
        height: 0,
        sampleCount: 0,
        uniqueSamples: 0,
        coloredSamples: 0,
        error: null,
        canvases: [],
      };
    }

    return {
      hasCanvas: canvasEvidence.length > 0,
      canvasCount: canvasEvidence.length,
      sampledCanvasCount: sampledCanvases.length,
      nonblankCanvasCount: nonblankCanvases.length,
      nonblank: sampledCanvases.length ? nonblankCanvases.length > 0 : false,
      width: primary.width,
      height: primary.height,
      sampleCount: primary.sampleCount,
      uniqueSamples: primary.uniqueSamples,
      coloredSamples: primary.coloredSamples,
      error: aggregateError,
      canvases: canvasEvidence,
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
    screenshot: null,
  };
  summary.pages.push(pageRecord);
  await observePage(page, 'catalog', githubRequests);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await page.waitForTimeout(500);

  pageRecord.cardCount = await page.locator('.card').count();
  pageRecord.loaded = pageRecord.cardCount === manifest.length;
  pageRecord.overflow = await assertNoOverflow(page, 'catalog');
  pageRecord.screenshot = await captureScreenshot(page, 'catalog desktop');
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
    screenshot: null,
  };
  summary.pages.push(mobileRecord);
  await observePage(mobilePage, 'catalog mobile', mobileGithubRequests);
  await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForFunction((count) => document.querySelectorAll('.card').length === count, manifest.length, { timeout: 15000 });
  await mobilePage.waitForTimeout(500);
  mobileRecord.cardCount = await mobilePage.locator('.card').count();
  mobileRecord.loaded = mobileRecord.cardCount === manifest.length;
  mobileRecord.overflow = await assertNoOverflow(mobilePage, 'catalog mobile');
  mobileRecord.screenshot = await captureScreenshot(mobilePage, 'catalog mobile');
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
  summary.report = relativeArtifactPath(reportPath);
  await mkdir(summaryDir, { recursive: true });
  // codeql[js/http-to-file-access] Live-smoke fetch metadata is intentionally written as release evidence under test-results/live-pages-smoke/.
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  // codeql[js/http-to-file-access] The Markdown report mirrors the bounded summary above for local handoff/release evidence.
  await writeFile(reportPath, buildReport(), 'utf8');
}

function hashCheckLabel(item) {
  return item?.contentHash?.check || item?.check || 'not-recorded';
}

function formatSha(value) {
  return value ? `\`${value.slice(0, 12)}\`` : '`n/a`';
}

function buildHashTable(title, rows) {
  if (!rows.length) return `\n## ${title}\n\nNo entries recorded.\n`;
  const lines = [
    `\n## ${title}`,
    '',
    '| Surface | Path | Check | Local | Remote |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.label} | \`${row.localPath || row.relativePath || ''}\` | ${row.check} | ${formatSha(row.localSha256)} | ${formatSha(row.remoteSha256)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function buildPageTable() {
  if (!summary.pages.length) return '\n## Render Evidence\n\nNo browser pages recorded.\n';
  const lines = [
    '\n## Render Evidence',
    '',
    '| Page | Viewport | Loaded | Overflow | Hooks | Canvas | Screenshot |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const page of summary.pages) {
    const viewport = page.viewport ? `${page.viewport.width}x${page.viewport.height}` : 'n/a';
    const hooks = page.hasRender == null
      ? 'n/a'
      : `render:${page.hasRender ? 'yes' : 'no'} advance:${page.hasAdvance ? 'yes' : 'no'}`;
    const canvas = page.canvas
      ? `${page.canvas.hasCanvas ? 'yes' : 'no'}${page.canvas.hasCanvas ? ` / nonblank:${page.canvas.nonblank ? 'yes' : 'no'} / sampled:${page.canvas.sampledCanvasCount ?? 0}/${page.canvas.canvasCount ?? 1}` : ''}`
      : 'n/a';
    const screenshot = page.screenshot ? `\`${page.screenshot}\`` : 'n/a';
    lines.push(`| ${page.label} | ${viewport} | ${page.loaded ? 'yes' : 'no'} | ${page.overflow ?? 'n/a'} | ${hooks} | ${canvas} | ${screenshot} |`);
  }
  return `${lines.join('\n')}\n`;
}

function buildReport() {
  const lines = [
    '# Workshop Arcade Live Pages Smoke',
    '',
    `- Status: ${summary.status}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Slugs: ${summary.slugsChecked.length ? summary.slugsChecked.join(', ') : 'none'}`,
    `- Content hash: ${summary.contentHash.skipped ? 'skipped' : 'enabled'}`,
    `- Service worker revision: ${summary.serviceWorker.revisionCheck}`,
    `- Summary JSON: \`${relativeArtifactPath(summaryPath)}\``,
  ];
  if (summary.issues.length) {
    lines.push('', '## Issues', '');
    for (const issue of summary.issues) lines.push(`- ${issue}`);
  }
  lines.push(buildHashTable('Shell Content Hashes', summary.contentHash.shellAssets));
  lines.push(buildHashTable('Selected Game Content Hashes', summary.contentHash.selectedGames));
  lines.push(buildPageTable());
  lines.push('\n## Fetches', '', '| Surface | Status | Bytes | Hash |', '| --- | --- | --- | --- |');
  for (const fetchRecord of summary.fetches) {
    lines.push(`| ${fetchRecord.label} | ${fetchRecord.status ?? 'n/a'} | ${fetchRecord.bytes ?? 0} | ${hashCheckLabel(fetchRecord)} |`);
  }
  return `${lines.join('\n')}\n`;
}

let browser;
try {
  if (requireLiveSlugs && !requestedSlugs.length) {
    fail('config', 'WORKSHOP_ARCADE_REQUIRE_LIVE_SLUGS=1 requires WORKSHOP_ARCADE_LIVE_SLUGS or WORKSHOP_ARCADE_TOUCHED_SLUGS');
  }

  await assertFetchOk('', 'catalog root', ({ text, contentType, record }) => {
    if (!/html/i.test(contentType)) fail('catalog root', `unexpected content-type ${contentType}`);
    if (!/Workshop Arcade/i.test(text)) fail('catalog root', 'missing Workshop Arcade text');
    return assertLocalContentHash('index.html', text, record, 'catalog root', 'shellAssets');
  });

  await assertFetchOk('websites/manifest.json', 'manifest', async ({ text, contentType, record }) => {
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
    await assertLocalContentHash('websites/manifest.json', text, record, 'manifest', 'shellAssets');
  });

  await assertFetchOk('feed.json', 'feed', async ({ text, contentType, record }) => {
    if (!/json/i.test(contentType)) fail('feed', `unexpected content-type ${contentType}`);
    try {
      const feed = JSON.parse(text);
      if (!Array.isArray(feed.items) || feed.items.length !== manifest.length) {
        fail('feed', `expected ${manifest.length} feed items, found ${Array.isArray(feed.items) ? feed.items.length : 'none'}`);
      }
    } catch (error) {
      fail('feed', `invalid JSON: ${error.message}`);
    }
    await assertLocalContentHash('feed.json', text, record, 'feed', 'shellAssets');
  });

  await assertFetchOk('sitemap.xml', 'sitemap', async ({ text, contentType, record }) => {
    if (!/xml/i.test(contentType)) fail('sitemap', `unexpected content-type ${contentType}`);
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedMinimum = manifest.length + 1;
    const canonicalRoot = 'https://jakethehoffer.github.io/Workshop-Arcade/';
    const hasTargetRoot = locs.some((loc) => normalizeBaseUrl(loc) === baseUrl || normalizeBaseUrl(loc) === canonicalRoot);
    if (!text.includes('<urlset') || locs.length < expectedMinimum || !hasTargetRoot) {
      fail('sitemap', `expected urlset with at least ${expectedMinimum} URLs and a catalog root reference, found ${locs.length}`);
    }
    await assertLocalContentHash('sitemap.xml', text, record, 'sitemap', 'shellAssets');
  });

  await assertFetchOk('app.webmanifest', 'app webmanifest', async ({ text, contentType, record }) => {
    if (!/json|manifest/i.test(contentType)) fail('app webmanifest', `unexpected content-type ${contentType}`);
    try {
      const appManifest = JSON.parse(text);
      if (!appManifest.name || !Array.isArray(appManifest.icons)) {
        fail('app webmanifest', 'missing name or icons');
      }
    } catch (error) {
      fail('app webmanifest', `invalid JSON: ${error.message}`);
    }
    await assertLocalContentHash('app.webmanifest', text, record, 'app webmanifest', 'shellAssets');
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

  await assertFetchOk('offline.html', 'offline page', async ({ text, contentType, record }) => {
    if (!/html/i.test(contentType)) fail('offline page', `unexpected content-type ${contentType}`);
    if (!/offline/i.test(text) || !/catalog/i.test(text)) fail('offline page', 'missing offline/catalog recovery copy');
    await assertLocalContentHash('offline.html', text, record, 'offline page', 'shellAssets');
  });

  await assertFetchOk('404.html', '404 page', async ({ text, contentType, record }) => {
    if (!/html/i.test(contentType)) fail('404 page', `unexpected content-type ${contentType}`);
    if (!/404|not found/i.test(text) || !/catalog/i.test(text)) fail('404 page', 'missing not-found/catalog recovery copy');
    await assertLocalContentHash('404.html', text, record, '404 page', 'shellAssets');
  });

  await assertFetchOk('robots.txt', 'robots', async ({ text, contentType, record }) => {
    if (!/text|plain/i.test(contentType)) fail('robots', `unexpected content-type ${contentType}`);
    if (!/Sitemap:/i.test(text)) fail('robots', 'missing Sitemap directive');
    await assertLocalContentHash('robots.txt', text, record, 'robots', 'shellAssets');
  });

  await assertFetchOk('.well-known/security.txt', 'security.txt', async ({ text, contentType, record }) => {
    if (!/text|plain/i.test(contentType)) fail('security.txt', `unexpected content-type ${contentType}`);
    if (!/^Contact:\s+\S+/m.test(text)) fail('security.txt', 'missing Contact line');

    const expiresMatch = text.match(/^Expires:\s*([^\s]+)/m);
    if (!expiresMatch) {
      fail('security.txt', 'missing Expires timestamp');
    } else {
      const expires = new Date(expiresMatch[1]);
      if (Number.isNaN(expires.getTime())) {
        fail('security.txt', `invalid Expires timestamp "${expiresMatch[1]}"`);
      } else if (expires.getTime() <= Date.now()) {
        fail('security.txt', `Expires timestamp is not in the future: ${expiresMatch[1]}`);
      }
    }

    const expectedCanonical = 'Canonical: https://jakethehoffer.github.io/Workshop-Arcade/.well-known/security.txt';
    if (!text.includes(expectedCanonical)) {
      fail('security.txt', `missing canonical line "${expectedCanonical}"`);
    }

    await assertLocalContentHash('.well-known/security.txt', text, record, 'security.txt', 'shellAssets');
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

console.log(`Live Pages smoke passed against ${baseUrl}: catalog, manifest, feed, sitemap, runtime/PWA/security surfaces, and ${summary.slugsChecked.join(', ')}.`);
console.log(`Summary: ${summaryPath}`);
