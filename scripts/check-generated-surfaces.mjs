#!/usr/bin/env node
// Generated-surface integration contract.
//
// The catalog has several deterministic surfaces derived from
// websites/manifest.json. This check makes the integration failure mode
// concise: when a game is added to the manifest, its generated OG card,
// feed/sitemap entries, per-game meta/JSON-LD, and capture recipe must all
// exist before the heavier Playwright jobs run.

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteUrl } from './site-config.mjs';

const repoRoot = resolve(process.env.WORKSHOP_ARCADE_REPO_ROOT || dirname(fileURLToPath(import.meta.url)), process.env.WORKSHOP_ARCADE_REPO_ROOT ? '.' : '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

async function exists(relative) {
  try {
    await stat(join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function readText(relative) {
  try {
    return await readFile(join(repoRoot, relative), 'utf8');
  } catch (error) {
    fail(`${relative}: unable to read (${error.message})`);
    return '';
  }
}

async function loadManifest() {
  const raw = await readText('websites/manifest.json');
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest)) {
    throw new Error('websites/manifest.json must contain an array');
  }
  return manifest;
}

async function listFiles(relative, extension) {
  try {
    const entries = await readdir(join(repoRoot, relative), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => `${relative}/${entry.name}`.replace(/\\/g, '/'))
      .sort();
  } catch (error) {
    fail(`${relative}: unable to list (${error.message})`);
    return [];
  }
}

function findCaptureRecipe(captureSource, game) {
  const keys = [game.slug, game.id].filter(Boolean);
  return keys.some((key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quotedKey = new RegExp(`["']${escaped}["']\\s*:`);
    const bareKey = /^[A-Za-z_$][\w$]*$/.test(key)
      ? new RegExp(`(?:^|[,{\\s])${escaped}\\s*:`)
      : null;
    return quotedKey.test(captureSource) || (bareKey && bareKey.test(captureSource));
  });
}

function checkFeed(feedText, manifest) {
  let feed;
  try {
    feed = JSON.parse(feedText);
  } catch (error) {
    fail(`feed.json: unable to parse (${error.message})`);
    return;
  }
  const feedUrls = new Set((feed.items || []).map((item) => item && item.url));
  for (const game of manifest) {
    const url = siteUrl(game.url);
    if (!feedUrls.has(url)) {
      fail(`feed.json: missing item for ${game.title} (${url})`);
    }
  }
}

async function checkManifestClosure(manifest) {
  const manifestUrls = new Set(manifest.map((game) => String(game.url || '').replace(/\\/g, '/')));
  const htmlFiles = await listFiles('websites', '.html');
  for (const htmlPath of htmlFiles) {
    if (!manifestUrls.has(htmlPath)) {
      fail(`${htmlPath}: publishable game HTML is not listed in websites/manifest.json`);
    }
  }

  const manifestSlugs = new Set(manifest.map((game) => game.slug).filter(Boolean));
  const ogFiles = await listFiles('covers/og', '.svg');
  for (const ogPath of ogFiles) {
    const slug = ogPath.replace(/^covers\/og\//, '').replace(/\.svg$/, '');
    if (!manifestSlugs.has(slug)) {
      fail(`${ogPath}: orphan generated OG image has no matching manifest slug`);
    }
  }
}

async function checkGame(game, surfaces) {
  const label = game.slug || game.id || game.title || '<unknown>';
  const gameUrl = String(game.url || '').replace(/^\/+/, '');
  const canonical = siteUrl(gameUrl);
  const gamePath = game.url || '';

  if (!game.slug) {
    fail(`manifest entry ${label}: missing slug`);
    return;
  }
  if (!gamePath || !(await exists(gamePath))) {
    fail(`${label}: game file missing at ${gamePath || '<empty url>'}`);
    return;
  }

  const ogPath = `covers/og/${game.slug}.svg`;
  if (!(await exists(ogPath))) {
    fail(`${ogPath}: missing generated OG image for ${game.title}`);
  }

  const html = await readText(gamePath);
  if (!html.includes('<!-- workshop-meta:start -->') || !html.includes('<!-- workshop-meta:end -->')) {
    fail(`${gamePath}: missing workshop-meta marker block — run \`npm run inject:meta\``);
  }
  if (!html.includes('<!-- workshop-jsonld:start -->') || !html.includes('<!-- workshop-jsonld:end -->')) {
    fail(`${gamePath}: missing workshop-jsonld marker block — run \`npm run inject:meta\``);
  }

  if (!surfaces.sitemap.includes(`<loc>${canonical}</loc>`)) {
    fail(`sitemap.xml: missing ${canonical}`);
  }
  if (!findCaptureRecipe(surfaces.captureSource, game)) {
    fail(`scripts/capture-games.mjs: missing capture recipe for ${game.slug}`);
  }
}

const manifest = await loadManifest();
const surfaces = {
  sitemap: await readText('sitemap.xml'),
  feed: await readText('feed.json'),
  captureSource: await readText('scripts/capture-games.mjs'),
};

checkFeed(surfaces.feed, manifest);
await checkManifestClosure(manifest);
for (const game of manifest) {
  await checkGame(game, surfaces);
}

if (issues.length > 0) {
  console.error(`Generated-surface check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Generated-surface check passed for ${manifest.length} manifest games: OG cards, sitemap, feed, meta/JSON-LD, and capture recipes are present.`);
