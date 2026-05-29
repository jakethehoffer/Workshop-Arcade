#!/usr/bin/env node
// Static PWA install-payload budget check.
//
// The browser perf audit measures first-load transfer size, while the
// service worker has a separate install-time payload: the worker script,
// shellAssets, newest pre-cached covers, and manifest icons. Keep that
// install payload inside the same Catalog budget so offline support cannot
// silently grow beyond the publish contract.

import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.env.WORKSHOP_ARCADE_REPO_ROOT
  ? resolve(process.env.WORKSHOP_ARCADE_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIN_INSTALL_HEADROOM_KB = 15;
const MIN_INSTALL_REQUEST_HEADROOM = 5;
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

function isLocalReference(src) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function resolveLocalReference(fromRelativePath, src) {
  const withoutQuery = src.split(/[?#]/, 1)[0];

  if (withoutQuery === '') {
    return 'index.html';
  }
  if (!isLocalReference(withoutQuery)) {
    return null;
  }

  const dependencyPath = withoutQuery.startsWith('/')
    ? withoutQuery.replace(/^\/+/, '')
    : join(dirname(fromRelativePath), withoutQuery);
  const absolute = resolve(repoRoot, dependencyPath);
  const resolvedRelative = relative(repoRoot, absolute);

  if (resolvedRelative.startsWith('..') || isAbsolute(resolvedRelative)) {
    fail(`${fromRelativePath}: local install asset escapes repo root (${src})`);
    return null;
  }

  return toPosixPath(resolvedRelative);
}

function quotedStrings(source) {
  return [...source.matchAll(/(['"])(.*?)\1/g)].map((match) => match[2]);
}

function readCoverPrefetchCount(swSource) {
  const match = swSource.match(/const\s+COVER_PREFETCH_COUNT\s*=\s*(\d+)\s*;/);
  if (!match) {
    fail('sw.js: unable to parse COVER_PREFETCH_COUNT');
    return 0;
  }
  return Number(match[1]);
}

function readShellAssets(swSource) {
  const match = swSource.match(/const\s+shellAssets\s*=\s*\[([\s\S]*?)\]\.map\s*\(/);
  if (!match) {
    fail('sw.js: unable to parse shellAssets array');
    return [];
  }
  return quotedStrings(match[1]);
}

function defaultSortedGames(manifest) {
  return [...manifest].sort((a, b) => {
    const byDate = new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
    return byDate || 0;
  });
}

function manifestIconPaths(appManifest) {
  if (!appManifest || !Array.isArray(appManifest.icons)) return [];
  return appManifest.icons
    .map((icon) => icon?.src)
    .filter((src) => typeof src === 'string' && src.trim())
    .map((src) => resolveLocalReference('app.webmanifest', src.trim()))
    .filter(Boolean);
}

async function collectInstallFiles() {
  const swSource = await readText('sw.js');
  const manifestText = await readText('websites/manifest.json');
  const appManifestText = await readText('app.webmanifest');

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

  let appManifest = {};
  try {
    appManifest = JSON.parse(appManifestText);
  } catch (error) {
    fail(`app.webmanifest: unable to parse JSON (${error.message})`);
  }

  const coverCount = readCoverPrefetchCount(swSource);
  const newestCovers = defaultSortedGames(manifest)
    .slice(0, coverCount)
    .map((game) => game?.cover)
    .filter((cover) => typeof cover === 'string' && cover.length > 0)
    .map((cover) => resolveLocalReference('index.html', cover))
    .filter(Boolean);

  const shellFiles = readShellAssets(swSource)
    .map((asset) => resolveLocalReference('sw.js', asset))
    .filter(Boolean);

  return [...new Set([
    'sw.js',
    ...shellFiles,
    ...newestCovers,
    ...manifestIconPaths(appManifest),
  ])];
}

const auditSource = await readText('scripts/audit-pagespeed.mjs');
const budget = readBudget(auditSource, 'Catalog');
const installFiles = await collectInstallFiles();
const totalBytes = (await Promise.all(installFiles.map((file) => fileSize(file))))
  .reduce((sum, size) => sum + size, 0);
const requestCount = installFiles.length;

if (budget) {
  const byteBudget = budget.transferKb * 1024;
  const transferHeadroomKb = budget.transferKb - (totalBytes / 1024);
  const requestHeadroom = budget.requests - requestCount;
  if (totalBytes > byteBudget) {
    fail(`PWA install payload: ${fmtKb(totalBytes)} exceeds ${budget.transferKb} KB Catalog budget (${installFiles.join(', ')})`);
  }
  if (requestCount > budget.requests) {
    fail(`PWA install payload: ${requestCount} local request(s) exceeds ${budget.requests} Catalog request budget (${installFiles.join(', ')})`);
  }
  if (transferHeadroomKb < MIN_INSTALL_HEADROOM_KB) {
    fail(`PWA install payload: ${fmtKb(totalBytes)} leaves ${transferHeadroomKb.toFixed(1)} KB install headroom, below ${MIN_INSTALL_HEADROOM_KB} KB minimum (${installFiles.join(', ')})`);
  }
  if (requestHeadroom < MIN_INSTALL_REQUEST_HEADROOM) {
    fail(`PWA install payload: ${requestCount} local request(s) leaves ${requestHeadroom} install request headroom, below ${MIN_INSTALL_REQUEST_HEADROOM} minimum (${installFiles.join(', ')})`);
  }
}

if (issues.length > 0) {
  console.error(`PWA install budget check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

const transferHeadroomKb = budget.transferKb - (totalBytes / 1024);
const requestHeadroom = budget.requests - requestCount;
console.log(`PWA install budget check passed: ${fmtKb(totalBytes)} / ${budget.transferKb} KB across ${requestCount}/${budget.requests} files; headroom ${transferHeadroomKb.toFixed(1)} KB / ${requestHeadroom} files (${installFiles.join(', ')}).`);
