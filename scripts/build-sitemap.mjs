#!/usr/bin/env node
// Regenerate the static SEO surfaces from websites/manifest.json:
//
//   1. sitemap.xml — one <url> entry per manifest game plus the catalog root.
//   2. JSON-LD ItemList in index.html — replaces the marker block between
//      <!-- workshop-catalog-jsonld:start --> and the matching end marker so
//      the structured data Google ingests always mirrors the manifest.
//
// Both surfaces are idempotent: re-running with no manifest changes produces
// byte-identical output, so `npm run test:seo` can detect drift.
//
// Run with `node scripts/build-sitemap.mjs` (or `npm run build:sitemap`).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://jakethehoffer.github.io/Workshop-Arcade/';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_DATE = '2025-09-01';

export const JSONLD_MARK_START = '<!-- workshop-catalog-jsonld:start -->';
export const JSONLD_MARK_END = '<!-- workshop-catalog-jsonld:end -->';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDate(value) {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value.trim())) {
    return value.trim();
  }
  return FALLBACK_DATE;
}

function newestDate(games) {
  let newest = FALLBACK_DATE;
  for (const game of games) {
    const candidate = normalizeDate(game.addedAt);
    if (candidate > newest) newest = candidate;
  }
  return newest;
}

function buildEntry({ loc, lastmod, priority, changefreq }) {
  const lines = ['  <url>'];
  lines.push(`    <loc>${escapeXml(loc)}</loc>`);
  lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  lines.push('  </url>');
  return lines.join('\n');
}

export async function loadManifest() {
  const raw = await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('websites/manifest.json must be an array');
  }
  return parsed;
}

export async function buildSitemap(manifestOverride) {
  const manifest = manifestOverride || (await loadManifest());

  const sorted = [...manifest].sort((a, b) => {
    const left = String(a.slug || a.id || a.url || '');
    const right = String(b.slug || b.id || b.url || '');
    return left.localeCompare(right);
  });

  const catalogEntry = buildEntry({
    loc: SITE,
    lastmod: newestDate(manifest),
    priority: '1.0',
    changefreq: 'weekly',
  });

  const gameEntries = sorted.map((game) => {
    if (typeof game.url !== 'string' || !game.url.trim()) {
      throw new Error(`Manifest entry ${game.id || game.title || '<unknown>'} is missing url`);
    }
    return buildEntry({
      loc: SITE + game.url.replace(/^\/+/, ''),
      lastmod: normalizeDate(game.addedAt),
      priority: '0.8',
      changefreq: 'monthly',
    });
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    catalogEntry,
    ...gameEntries,
    '</urlset>',
    '',
  ].join('\n');
}

export function buildItemList(manifest) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Workshop Arcade Games',
    description: 'Browser-playable HTML5 games in the Workshop Arcade catalog.',
    numberOfItems: manifest.length,
    itemListElement: manifest.map((game, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: SITE + String(game.url || '').replace(/^\/+/, ''),
      name: game.title,
    })),
  };
}

function escapeForScriptBlock(json) {
  // </script> inside a JSON string literal would close the surrounding
  // <script> tag and break the page. The standard fix is to escape the
  // forward slash so the parser still sees valid JSON.
  return json.replace(/<\/script/gi, '<\\/script');
}

export function renderItemListBlock(manifest) {
  const json = JSON.stringify(buildItemList(manifest), null, 2);
  return [
    JSONLD_MARK_START,
    '<script type="application/ld+json">',
    escapeForScriptBlock(json),
    '</script>',
    JSONLD_MARK_END,
  ].join('\n');
}

export function injectItemList(html, block) {
  const escapedStart = JSONLD_MARK_START.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const escapedEnd = JSONLD_MARK_END.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const reBlock = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);
  if (reBlock.test(html)) {
    return html.replace(reBlock, block);
  }
  // First insertion: place the block immediately before </head> so it lives
  // alongside the other meta/link tags but does not displace any existing
  // ones a future contributor might add.
  return html.replace(/<\/head>/i, `${block}\n</head>`);
}

async function writeSitemap(manifest) {
  const body = await buildSitemap(manifest);
  await writeFile(join(repoRoot, 'sitemap.xml'), body, 'utf8');
  const urlCount = body.split('\n').filter((line) => line.trim().startsWith('<url>')).length;
  console.log(`Wrote sitemap.xml with ${urlCount} URL entries.`);
}

async function writeIndexJsonLd(manifest) {
  const indexPath = join(repoRoot, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const block = renderItemListBlock(manifest);
  const next = injectItemList(html, block);
  if (next !== html) {
    await writeFile(indexPath, next, 'utf8');
    console.log(`Updated index.html JSON-LD ItemList with ${manifest.length} games.`);
  } else {
    console.log(`index.html JSON-LD ItemList already up to date (${manifest.length} games).`);
  }
}

async function main() {
  const manifest = await loadManifest();
  await writeSitemap(manifest);
  await writeIndexJsonLd(manifest);
}

const invokedDirectly = process.argv[1]?.endsWith('build-sitemap.mjs');
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
