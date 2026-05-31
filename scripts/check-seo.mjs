#!/usr/bin/env node
// Static SEO contract check.
//
// Verifies:
//   1. sitemap.xml matches what scripts/build-sitemap.mjs would currently
//      produce from websites/manifest.json. Drift means a contributor added
//      a game without rerunning `npm run build:sitemap`.
//   2. Every <url><loc> in the sitemap points to either the catalog root or
//      an existing manifest game URL.
//   3. robots.txt exists, allows crawling, and references the live sitemap.
//   4. index.html contains a JSON-LD ItemList between the marker comments
//      that mirrors the current manifest (length, positions, urls, names),
//      uses the schema.org context, and matches what build-sitemap.mjs
//      would currently inject.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSitemap,
  buildRobotsTxt,
  loadManifest,
  renderItemListBlock,
  renderWebSiteBlock,
  refreshRootMetaUrls,
  JSONLD_MARK_START,
  JSONLD_MARK_END,
  WEBSITE_MARK_START,
  WEBSITE_MARK_END,
} from './build-sitemap.mjs';
import { SITE_URL, siteUrl } from './site-config.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

function fail(message) {
  issues.push(message);
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, '\n');
}

async function exists(relative) {
  try {
    await stat(join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function checkSitemap(manifest) {
  if (!(await exists('sitemap.xml'))) {
    fail('sitemap.xml: file missing — run `npm run build:sitemap`');
    return;
  }
  const committed = await readFile(join(repoRoot, 'sitemap.xml'), 'utf8');
  const expected = await buildSitemap(manifest);
  if (normalizeNewlines(committed) !== normalizeNewlines(expected)) {
    fail('sitemap.xml: drifted from websites/manifest.json — run `npm run build:sitemap` to refresh');
  }

  const locs = [...committed.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (locs.length === 0) {
    fail('sitemap.xml: no <loc> entries found');
    return;
  }
  if (locs[0] !== SITE_URL) {
    fail(`sitemap.xml: first <loc> must be the catalog root "${SITE_URL}", got "${locs[0]}"`);
  }

  const gameUrls = new Set(manifest.map((game) => siteUrl(game.url)));
  const expectedSet = new Set([SITE_URL, ...gameUrls]);
  const committedSet = new Set(locs);
  for (const loc of locs.slice(1)) {
    if (!gameUrls.has(loc)) {
      fail(`sitemap.xml: <loc>${loc}</loc> does not match any manifest game URL`);
    }
  }
  for (const url of expectedSet) {
    if (!committedSet.has(url)) {
      fail(`sitemap.xml: missing entry for ${url}`);
    }
  }
}

async function checkRobots() {
  if (!(await exists('robots.txt'))) {
    fail('robots.txt: file missing');
    return;
  }
  const text = await readFile(join(repoRoot, 'robots.txt'), 'utf8');
  const expected = buildRobotsTxt();
  if (normalizeNewlines(text) !== normalizeNewlines(expected)) {
    fail('robots.txt: drifted from canonical site config — run `npm run build:sitemap` to refresh');
  }
  if (!/^\s*User-agent:\s*\*/m.test(text)) {
    fail('robots.txt: missing "User-agent: *" directive');
  }
  if (!/^\s*Allow:\s*\//m.test(text)) {
    fail('robots.txt: missing "Allow: /" directive (block-by-default is unsafe for static catalogs)');
  }
  if (!text.includes(siteUrl('sitemap.xml'))) {
    fail(`robots.txt: missing "Sitemap: ${siteUrl('sitemap.xml')}" line`);
  }
}

async function checkIndexJsonLd(manifest) {
  if (!(await exists('index.html'))) {
    fail('index.html: file missing');
    return;
  }
  const html = await readFile(join(repoRoot, 'index.html'), 'utf8');
  const expectedHtml = refreshRootMetaUrls(html);
  if (normalizeNewlines(html) !== normalizeNewlines(expectedHtml)) {
    fail('index.html: root canonical/OG URLs drifted from canonical site config — run `npm run build:sitemap` to refresh');
  }

  const startIndex = html.indexOf(JSONLD_MARK_START);
  const endIndex = html.indexOf(JSONLD_MARK_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    fail(`index.html: missing JSON-LD marker block (${JSONLD_MARK_START} ... ${JSONLD_MARK_END}) — run \`npm run build:sitemap\``);
    return;
  }
  const committedBlock = html.slice(startIndex, endIndex + JSONLD_MARK_END.length);
  const expectedBlock = renderItemListBlock(manifest);
  if (normalizeNewlines(committedBlock) !== normalizeNewlines(expectedBlock)) {
    fail('index.html: JSON-LD ItemList drifted from websites/manifest.json — run `npm run build:sitemap` to refresh');
  }

  const scriptMatch = committedBlock.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    fail('index.html: marker block missing <script type="application/ld+json">');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(scriptMatch[1].trim());
  } catch (error) {
    fail(`index.html: JSON-LD block does not parse: ${error.message}`);
    return;
  }
  if (parsed['@context'] !== 'https://schema.org') {
    fail('index.html: JSON-LD @context must be "https://schema.org"');
  }
  if (parsed['@type'] !== 'ItemList') {
    fail(`index.html: JSON-LD @type must be "ItemList", got "${parsed['@type']}"`);
  }
}

async function checkIndexWebSiteJsonLd() {
  if (!(await exists('index.html'))) return;
  const html = await readFile(join(repoRoot, 'index.html'), 'utf8');

  const startIndex = html.indexOf(WEBSITE_MARK_START);
  const endIndex = html.indexOf(WEBSITE_MARK_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    fail(`index.html: missing WebSite JSON-LD marker block (${WEBSITE_MARK_START} ... ${WEBSITE_MARK_END}) — run \`npm run build:sitemap\``);
    return;
  }
  const committed = html.slice(startIndex, endIndex + WEBSITE_MARK_END.length);
  const expected = renderWebSiteBlock();
  if (normalizeNewlines(committed) !== normalizeNewlines(expected)) {
    fail('index.html: WebSite JSON-LD drifted — run `npm run build:sitemap` to refresh');
  }

  const scriptMatch = committed.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    fail('index.html: WebSite marker block missing <script type="application/ld+json">');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(scriptMatch[1].trim());
  } catch (error) {
    fail(`index.html: WebSite JSON-LD block does not parse: ${error.message}`);
    return;
  }
  if (parsed['@context'] !== 'https://schema.org') {
    fail('index.html: WebSite JSON-LD @context must be "https://schema.org"');
  }
  if (parsed['@type'] !== 'WebSite') {
    fail(`index.html: WebSite JSON-LD @type must be "WebSite", got "${parsed['@type']}"`);
  }
  if (parsed.url !== SITE_URL) {
    fail(`index.html: WebSite JSON-LD url must be "${SITE_URL}", got "${parsed.url}"`);
  }
  const action = parsed.potentialAction;
  if (!action || action['@type'] !== 'SearchAction') {
    fail('index.html: WebSite JSON-LD must include potentialAction with @type "SearchAction" so Google can render the Sitelinks Search Box');
    return;
  }
  if (action['query-input'] !== 'required name=search_term_string') {
    fail(`index.html: SearchAction "query-input" must be "required name=search_term_string", got ${JSON.stringify(action['query-input'])}`);
  }
  const target = action.target;
  const urlTemplate = typeof target === 'string' ? target : target?.urlTemplate;
  if (!urlTemplate || !urlTemplate.includes('{search_term_string}')) {
    fail('index.html: SearchAction target.urlTemplate must include {search_term_string} so Google can substitute the visitor query');
  }
  if (urlTemplate && !urlTemplate.includes('?q=')) {
    fail(`index.html: SearchAction urlTemplate must use the catalog's ?q= URL state contract (test:url-filters reads the same param), got "${urlTemplate}"`);
  }
}

const manifest = await loadManifest();
await checkSitemap(manifest);
await checkRobots();
await checkIndexJsonLd(manifest);
await checkIndexWebSiteJsonLd();

if (issues.length > 0) {
  console.error(`SEO check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`SEO check passed: sitemap.xml (${manifest.length + 1} URLs), robots.txt, index.html ItemList (${manifest.length} items), and WebSite + SearchAction JSON-LD all in sync.`);
