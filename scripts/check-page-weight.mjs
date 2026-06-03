#!/usr/bin/env node
// Static page-weight contract check.
//
// The browser performance audit is the final source of truth, but it runs in a
// slow Playwright job. This fast gate catches deterministic payload drift by
// summing each manifest game HTML file plus its same-origin first-load assets
// and comparing that total with the same publish budgets used by
// scripts/audit-pagespeed.mjs. It also checks the catalog's local first-load
// shell: catalog HTML, manifest, service worker/install metadata, app icon, and
// the desktop eager cover set.

import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.env.WORKSHOP_ARCADE_REPO_ROOT
  ? resolve(process.env.WORKSHOP_ARCADE_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIN_CATALOG_SHELL_HEADROOM_KB = 20;
const MIN_CATALOG_SHELL_REQUEST_HEADROOM = 5;
const MIN_NAMED_EXCEPTION_HEADROOM_KB = 10;
const MIN_NAMED_EXCEPTION_REQUEST_HEADROOM = 1;
const NAMED_EXCEPTION_TITLES = new Set(['Lexica', 'Idle Tycoon', 'Arcade Jump', 'Brick Breaker']);
const issues = [];

function fail(message) {
  issues.push(message);
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readText(relativePath) {
  try {
    return await readFile(join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    fail(`${relativePath}: unable to read (${error.message})`);
    return '';
  }
}

async function fileSize(relativePath) {
  try {
    const info = await stat(join(repoRoot, relativePath));
    return info.size;
  } catch (error) {
    fail(`${relativePath}: unable to stat (${error.message})`);
    return 0;
  }
}

function readBudget(source, key) {
  const property = key === 'default'
    ? 'default'
    : `(?:"${escapeRegex(key)}"|${escapeRegex(key)})`;
  const match = source.match(new RegExp(`${property}:\\s*\\{\\s*transferKb:\\s*(\\d+),\\s*requests:\\s*(\\d+)\\s*\\}`));
  if (!match) {
    fail(`scripts/audit-pagespeed.mjs: unable to parse ${key} budget`);
    return null;
  }
  return { transferKb: Number(match[1]), requests: Number(match[2]) };
}

function tagAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? '').trim();
  }
  return attrs;
}

function cssUrls(source) {
  return [...source.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi)]
    .map((match) => (match[1] ?? match[2] ?? match[3] ?? '').trim())
    .filter(Boolean);
}

function srcsetUrls(srcset) {
  return srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
}

function firstLoadResourceRefs(html) {
  const refs = [];

  for (const match of html.matchAll(/<(script|img|audio|video|source|track)\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    if (attrs.src) refs.push(attrs.src);
    if (attrs.srcset) refs.push(...srcsetUrls(attrs.srcset));
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const rel = (attrs.rel || '').toLowerCase();
    const countsOnLoad = /\b(?:stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)\b/.test(rel);
    if (countsOnLoad && attrs.href) refs.push(attrs.href);
  }

  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    refs.push(...cssUrls(match[1]));
  }

  for (const match of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    refs.push(...cssUrls(match[1] ?? match[2] ?? ''));
  }

  return refs;
}

function isLocalSrc(src) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function resolveLocalDependency(fromRelativePath, src) {
  const withoutQuery = src.split(/[?#]/, 1)[0];
  const dependencyPath = withoutQuery.startsWith('/')
    ? withoutQuery.replace(/^\/+/, '')
    : join(dirname(fromRelativePath), withoutQuery);
  const absolute = resolve(repoRoot, dependencyPath);
  const resolvedRelative = relative(repoRoot, absolute);

  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) {
    fail(`${fromRelativePath}: local dependency escapes repo root (${src})`);
    return null;
  }

  return toPosixPath(resolvedRelative);
}

async function collectGameDependencies(htmlPath, html) {
  const dependencyPaths = firstLoadResourceRefs(html)
    .filter(isLocalSrc)
    .map((src) => resolveLocalDependency(htmlPath, src))
    .filter(Boolean);
  const seen = new Set(dependencyPaths);

  for (const cssPath of [...seen].filter((dependency) => dependency.endsWith('.css'))) {
    const css = await readText(cssPath);
    for (const src of cssUrls(css).filter(isLocalSrc)) {
      const dependency = resolveLocalDependency(cssPath, src);
      if (dependency) seen.add(dependency);
    }
  }

  return [...seen];
}

function defaultSortedGames(manifest) {
  return [...manifest].sort((a, b) => {
    const byDate = new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
    return byDate || 0;
  });
}

function readDesktopEagerCoverCount(indexHtml) {
  const helperMatch = indexHtml.match(/function\s+aboveFoldCoverCount\s*\(\)\s*\{[\s\S]*?\n\}/);
  if (!helperMatch) {
    fail('index.html: missing aboveFoldCoverCount() helper for catalog shell budget');
    return 6;
  }

  const desktopMatch = helperMatch[0].match(/return\s+(\d+)\s*;\s*(?:\/\/\s*desktop|$)/);
  if (!desktopMatch) {
    fail('index.html: unable to parse desktop eager cover count from aboveFoldCoverCount()');
    return 6;
  }

  return Number(desktopMatch[1]);
}

async function checkCatalogShell(manifest, budgets) {
  const indexHtml = await readText('index.html');
  const eagerCount = readDesktopEagerCoverCount(indexHtml);
  const eagerCovers = defaultSortedGames(manifest)
    .slice(0, eagerCount)
    .map((game) => game.cover)
    .filter(Boolean);

  const shellFiles = [
    'index.html',
    'websites/manifest.json',
    'sw.js',
    'app.webmanifest',
    'covers/app-icon.svg',
    ...eagerCovers,
  ];
  const uniqueShellFiles = [...new Set(shellFiles)];
  const totalBytes = (await Promise.all(uniqueShellFiles.map((file) => fileSize(file))))
    .reduce((sum, size) => sum + size, 0);
  const requestCount = uniqueShellFiles.length;
  const budget = budgets.Catalog;

  if (budget) {
    const byteBudget = budget.transferKb * 1024;
    const transferHeadroomKb = budget.transferKb - (totalBytes / 1024);
    const requestHeadroom = budget.requests - requestCount;
    if (totalBytes > byteBudget) {
      fail(`Catalog local shell: ${fmtKb(totalBytes)} exceeds ${budget.transferKb} KB budget (${uniqueShellFiles.length} files)`);
    }
    if (requestCount > budget.requests) {
      fail(`Catalog local shell: ${requestCount} local shell request(s) exceeds ${budget.requests} request budget`);
    }
    if (transferHeadroomKb < MIN_CATALOG_SHELL_HEADROOM_KB) {
      fail(`Catalog local shell: ${fmtKb(totalBytes)} leaves ${transferHeadroomKb.toFixed(1)} KB transfer headroom, below ${MIN_CATALOG_SHELL_HEADROOM_KB} KB minimum (${uniqueShellFiles.join(', ')})`);
    }
    if (requestHeadroom < MIN_CATALOG_SHELL_REQUEST_HEADROOM) {
      fail(`Catalog local shell: ${requestCount} local shell request(s) leaves ${requestHeadroom} request headroom, below ${MIN_CATALOG_SHELL_REQUEST_HEADROOM} minimum (${uniqueShellFiles.join(', ')})`);
    }
  }

  return {
    totalBytes,
    requestCount,
    eagerCount,
    transferHeadroomKb: budget ? budget.transferKb - (totalBytes / 1024) : null,
    requestHeadroom: budget ? budget.requests - requestCount : null,
  };
}

async function checkGames(manifest, budgets) {
  const results = [];

  for (const game of manifest) {
    if (!game || typeof game.title !== 'string' || typeof game.url !== 'string') {
      fail('websites/manifest.json: every entry needs title and url for page-weight checking');
      continue;
    }

    const htmlPath = game.url.replace(/^\/+/, '');
    const html = await readText(htmlPath);
    if (!html) continue;

    const uniqueDependencies = await collectGameDependencies(htmlPath, html);
    const htmlBytes = await fileSize(htmlPath);
    const dependencyBytes = (await Promise.all(uniqueDependencies.map((file) => fileSize(file))))
      .reduce((sum, size) => sum + size, 0);
    const totalBytes = htmlBytes + dependencyBytes;
    const requestCount = 1 + uniqueDependencies.length;
    const budget = budgets[game.title] || budgets.default;

    results.push({
      title: game.title,
      totalBytes,
      requestCount,
      budget,
    });

    if (!budget) continue;
    const byteBudget = budget.transferKb * 1024;
    if (totalBytes > byteBudget) {
      fail(`${game.title}: static page weight ${fmtKb(totalBytes)} exceeds ${budget.transferKb} KB budget (${htmlPath}${uniqueDependencies.length ? ` + ${uniqueDependencies.join(', ')}` : ''})`);
    }
    if (requestCount > budget.requests) {
      fail(`${game.title}: ${requestCount} local request(s) exceeds ${budget.requests} request budget`);
    }
    if (NAMED_EXCEPTION_TITLES.has(game.title)) {
      const transferHeadroomKb = budget.transferKb - (totalBytes / 1024);
      const requestHeadroom = budget.requests - requestCount;
      if (transferHeadroomKb < MIN_NAMED_EXCEPTION_HEADROOM_KB) {
        fail(`${game.title}: static page weight ${fmtKb(totalBytes)} leaves ${transferHeadroomKb.toFixed(1)} KB transfer headroom, below ${MIN_NAMED_EXCEPTION_HEADROOM_KB} KB named exception minimum (${htmlPath}${uniqueDependencies.length ? ` + ${uniqueDependencies.join(', ')}` : ''})`);
      }
      if (requestHeadroom < MIN_NAMED_EXCEPTION_REQUEST_HEADROOM) {
        fail(`${game.title}: ${requestCount} local request(s) leaves ${requestHeadroom} request headroom, below ${MIN_NAMED_EXCEPTION_REQUEST_HEADROOM} named exception minimum`);
      }
    }
  }

  return results;
}

const manifestText = await readText('websites/manifest.json');
let manifest = [];
try {
  manifest = JSON.parse(manifestText);
  if (!Array.isArray(manifest)) {
    fail('websites/manifest.json: expected an array');
    manifest = [];
  }
} catch (error) {
  fail(`websites/manifest.json: unable to parse JSON (${error.message})`);
}

const auditSource = await readText('scripts/audit-pagespeed.mjs');
const budgets = {
  Catalog: readBudget(auditSource, 'Catalog'),
  Lexica: readBudget(auditSource, 'Lexica'),
  'Idle Tycoon': readBudget(auditSource, 'Idle Tycoon'),
  'Arcade Jump': readBudget(auditSource, 'Arcade Jump'),
  'Brick Breaker': readBudget(auditSource, 'Brick Breaker'),
  default: readBudget(auditSource, 'default'),
};

const catalog = await checkCatalogShell(manifest, budgets);
const games = await checkGames(manifest, budgets);

if (issues.length > 0) {
  console.error(`Page-weight check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const closest = [...games]
  .filter((entry) => entry.budget)
  .map((entry) => ({
    ...entry,
    headroomBytes: entry.budget.transferKb * 1024 - entry.totalBytes,
  }))
  .sort((a, b) => a.headroomBytes - b.headroomBytes)
  .slice(0, 5)
  .map((entry) => {
    const transferHeadroomKb = entry.budget.transferKb - (entry.totalBytes / 1024);
    const requestHeadroom = entry.budget.requests - entry.requestCount;
    return `${entry.title} ${fmtKb(entry.totalBytes)} / ${entry.budget.transferKb} KB (${transferHeadroomKb.toFixed(1)} KB / ${requestHeadroom} req headroom)`;
  })
  .join('; ');

console.log(`Page-weight check passed: catalog local shell ${fmtKb(catalog.totalBytes)} / ${budgets.Catalog.transferKb} KB across ${catalog.requestCount}/${budgets.Catalog.requests} files (${catalog.eagerCount} eager covers; headroom ${catalog.transferHeadroomKb.toFixed(1)} KB / ${catalog.requestHeadroom} files); ${manifest.length} games under static budgets. Tightest: ${closest}.`);
