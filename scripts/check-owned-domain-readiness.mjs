#!/usr/bin/env node
// Owned-domain launch readiness check.
//
// The committed generated surfaces currently target the GitHub Pages preview.
// This check proves the same generator helpers can switch to a root-domain
// deployment through environment config without hand-editing catalog or game
// pages, and without rewriting tracked generated files during the check.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCatalogCsp } from './catalog-csp.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN_ORIGIN = 'https://arcade.example.test';
const DRY_RUN_BASE_PATH = '/';
const PREVIEW_ORIGIN = 'https://jakethehoffer.github.io';

process.env.WORKSHOP_ARCADE_SITE_ORIGIN = DRY_RUN_ORIGIN;
process.env.WORKSHOP_ARCADE_SITE_BASE_PATH = DRY_RUN_BASE_PATH;

const issues = [];

function fail(message) {
  issues.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertNoPreviewUrl(label, value) {
  const text = String(value || '');
  if (text.includes(PREVIEW_ORIGIN)) {
    fail(`${label}: still contains preview origin ${PREVIEW_ORIGIN}`);
  }
}

function extractJsonLd(block, label) {
  const match = String(block).match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    fail(`${label}: missing application/ld+json script block`);
    return null;
  }
  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    fail(`${label}: JSON-LD does not parse (${error.message})`);
    return null;
  }
}

function assertRelativeManifestPath(field, value) {
  const raw = String(value || '');
  if (!raw) {
    fail(`app.webmanifest: missing ${field}`);
    return;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) {
    fail(`app.webmanifest: ${field} must stay relative for owned-domain installs, got ${raw}`);
  }
  if (raw.startsWith('/')) {
    fail(`app.webmanifest: ${field} must not be root-absolute before a final host is chosen, got ${raw}`);
  }
}

const [
  { SITE_URL, siteUrl },
  sitemapModule,
  feedModule,
  metaModule,
] = await Promise.all([
  import('./site-config.mjs'),
  import('./build-sitemap.mjs'),
  import('./build-feed.mjs'),
  import('./inject-game-meta.mjs'),
]);

const {
  buildSitemap,
  buildRobotsTxt,
  buildItemList,
  buildWebSite,
  renderItemListBlock,
  renderWebSiteBlock,
  refreshRootMetaUrls,
  injectItemList,
  injectWebSite,
} = sitemapModule;
const { buildFeed } = feedModule;
const { buildBlock, buildGameJsonLd } = metaModule;

const manifest = JSON.parse(await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8'));
assert(Array.isArray(manifest), 'websites/manifest.json must be an array');
assert(manifest.length > 0, 'websites/manifest.json must include at least one game');

assert(SITE_URL === `${DRY_RUN_ORIGIN}/`, `site-config: SITE_URL must be ${DRY_RUN_ORIGIN}/, got ${SITE_URL}`);
assert(siteUrl('sitemap.xml') === `${DRY_RUN_ORIGIN}/sitemap.xml`, 'site-config: sitemap URL must resolve at the root domain');
assert(siteUrl('?q=puzzle') === `${DRY_RUN_ORIGIN}/?q=puzzle`, 'site-config: query-only URLs must attach to the root domain');
assert(siteUrl('#play=slipsort') === `${DRY_RUN_ORIGIN}/#play=slipsort`, 'site-config: hash-only URLs must attach to the root domain');

const generatedSurfaces = [];

const sitemap = await buildSitemap(manifest);
generatedSurfaces.push(['sitemap.xml dry run', sitemap]);
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(sitemapLocs[0] === SITE_URL, `sitemap.xml dry run: first URL must be ${SITE_URL}`);
assert(sitemapLocs.length === manifest.length + 1, `sitemap.xml dry run: expected ${manifest.length + 1} URLs, got ${sitemapLocs.length}`);
for (const game of manifest) {
  const canonical = siteUrl(game.url);
  assert(sitemapLocs.includes(canonical), `sitemap.xml dry run: missing ${canonical}`);
}

const robots = buildRobotsTxt();
generatedSurfaces.push(['robots.txt dry run', robots]);
assert(robots.includes(`Sitemap: ${siteUrl('sitemap.xml')}`), 'robots.txt dry run: sitemap line must use the root-domain URL');

const feed = buildFeed(manifest);
assert(feed.home_page_url === SITE_URL, `feed.json dry run: home_page_url must be ${SITE_URL}`);
assert(feed.feed_url === siteUrl('feed.json'), `feed.json dry run: feed_url must be ${siteUrl('feed.json')}`);
assert(Array.isArray(feed.items) && feed.items.length === manifest.length, `feed.json dry run: expected ${manifest.length} items`);
const feedText = JSON.stringify(feed);
generatedSurfaces.push(['feed.json dry run', feedText]);
const feedUrls = new Set(feed.items.map((item) => item.url));
for (const game of manifest) {
  const canonical = siteUrl(game.url);
  assert(feedUrls.has(canonical), `feed.json dry run: missing item for ${canonical}`);
}

const indexHtml = await readFile(join(repoRoot, 'index.html'), 'utf8');
let generatedIndex = refreshRootMetaUrls(indexHtml);
generatedIndex = injectItemList(generatedIndex, renderItemListBlock(manifest));
generatedIndex = injectWebSite(generatedIndex, renderWebSiteBlock());
assertCatalogCsp(generatedIndex, 'index.html generator dry run');
generatedSurfaces.push(['index.html generator dry run', generatedIndex]);
assert(generatedIndex.includes(`<link rel="canonical" href="${SITE_URL}" />`), 'index.html dry run: root canonical URL must use the owned-domain URL');
assert(generatedIndex.includes(`<meta property="og:url" content="${SITE_URL}" />`), 'index.html dry run: root og:url must use the owned-domain URL');
assert(generatedIndex.includes(`<meta property="og:image" content="${siteUrl('covers/og-image.svg')}" />`), 'index.html dry run: root og:image must use the owned-domain URL');

const itemList = buildItemList(manifest);
assert(itemList.numberOfItems === manifest.length, `ItemList dry run: expected ${manifest.length} items`);
generatedSurfaces.push(['ItemList JSON-LD dry run', renderItemListBlock(manifest)]);
for (const item of itemList.itemListElement || []) {
  assert(String(item.url || '').startsWith(SITE_URL), `ItemList dry run: ${item.name || '<unknown>'} URL must use ${SITE_URL}`);
}

const webSite = buildWebSite();
generatedSurfaces.push(['WebSite JSON-LD dry run', renderWebSiteBlock()]);
assert(webSite.url === SITE_URL, `WebSite JSON-LD dry run: url must be ${SITE_URL}`);
assert(webSite.publisher?.url === SITE_URL, `WebSite JSON-LD dry run: publisher.url must be ${SITE_URL}`);
assert(
  webSite.potentialAction?.target?.urlTemplate === `${SITE_URL}?q={search_term_string}`,
  'WebSite JSON-LD dry run: SearchAction must target the root-domain ?q= contract'
);

for (const game of manifest) {
  const label = game.slug || game.id || game.title || '<unknown>';
  const canonical = siteUrl(game.url);
  const cover = siteUrl(game.cover);
  const metaBlock = buildBlock(game);
  const jsonLdBlock = buildGameJsonLd(game);
  generatedSurfaces.push([`${label} workshop-meta dry run`, metaBlock]);
  generatedSurfaces.push([`${label} VideoGame JSON-LD dry run`, jsonLdBlock]);

  assert(metaBlock.includes(`<link rel="canonical" href="${canonical}" />`), `${label}: canonical meta must use ${canonical}`);
  assert(metaBlock.includes(`<meta property="og:url" content="${canonical}" />`), `${label}: og:url must use ${canonical}`);
  assert(metaBlock.includes(`<meta property="og:image" content="${siteUrl(`covers/og/${game.slug}.svg`)}" />`), `${label}: og:image must use root-domain share card URL`);

  const data = extractJsonLd(jsonLdBlock, `${label} VideoGame JSON-LD dry run`);
  if (data) {
    assert(data.url === canonical, `${label}: VideoGame JSON-LD url must be ${canonical}`);
    assert(data.image === cover, `${label}: VideoGame JSON-LD image must be ${cover}`);
    assert(data.author?.url === SITE_URL, `${label}: VideoGame JSON-LD author.url must be ${SITE_URL}`);
    assert(data.publisher?.url === SITE_URL, `${label}: VideoGame JSON-LD publisher.url must be ${SITE_URL}`);
  }
}

for (const [label, value] of generatedSurfaces) {
  assertNoPreviewUrl(label, value);
}

const appManifest = JSON.parse(await readFile(join(repoRoot, 'app.webmanifest'), 'utf8'));
for (const field of ['id', 'start_url', 'scope']) {
  assertRelativeManifestPath(field, appManifest[field]);
}
for (const [index, icon] of (appManifest.icons || []).entries()) {
  assertRelativeManifestPath(`icons[${index}].src`, icon?.src);
}

const livePagesSource = await readFile(join(repoRoot, 'scripts', 'check-live-pages.mjs'), 'utf8');
assert(
  /process\.env\.WORKSHOP_ARCADE_URL/.test(livePagesSource),
  'scripts/check-live-pages.mjs: must keep WORKSHOP_ARCADE_URL override for final-domain smoke checks'
);
assert(
  /normalizeBaseUrl\(process\.env\.WORKSHOP_ARCADE_URL\s*\|\|/.test(livePagesSource),
  'scripts/check-live-pages.mjs: WORKSHOP_ARCADE_URL must feed the normalized base URL'
);

if (issues.length > 0) {
  console.error(`Owned-domain readiness check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Owned-domain readiness check passed: ${manifest.length} games can regenerate root-domain SEO/feed/meta surfaces for ${SITE_URL} without preview-path leakage.`);
