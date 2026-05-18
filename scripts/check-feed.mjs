#!/usr/bin/env node
// JSON Feed contract check.
//
// Verifies:
//   1. feed.json exists, parses, and matches what scripts/build-feed.mjs
//      would currently produce from websites/manifest.json (line-ending
//      agnostic after dropping the synthetic _newest_date helper). Drift
//      means a contributor added or edited a manifest entry without
//      rerunning `npm run build:feed`.
//   2. The top-level feed object declares the JSON Feed 1.1 version,
//      a same-origin feed_url, and a non-empty items array.
//   3. Each item's url points to an existing manifest game and the items
//      are ordered newest-first by date_published so feed readers
//      surface new catalog additions at the top.
//   4. index.html links the feed via
//      <link rel="alternate" type="application/feed+json" href="feed.json">
//      so browsers and feed readers can auto-discover it.

import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeed, loadManifest } from './build-feed.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://jakethehoffer.github.io/Workshop-Arcade/';
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

async function checkFeed(manifest) {
  if (!(await exists('feed.json'))) {
    fail('feed.json: file missing — run `npm run build:feed`');
    return;
  }

  const committed = await readFile(join(repoRoot, 'feed.json'), 'utf8');
  const expected = buildFeed(manifest);
  // eslint-disable-next-line no-unused-vars
  const { _newest_date, ...publicFeed } = expected;
  const expectedText = JSON.stringify(publicFeed, null, 2) + '\n';
  if (normalizeNewlines(committed) !== normalizeNewlines(expectedText)) {
    fail('feed.json: drifted from websites/manifest.json — run `npm run build:feed` to refresh');
  }

  let parsed;
  try {
    parsed = JSON.parse(committed);
  } catch (error) {
    fail(`feed.json: does not parse as JSON: ${error.message}`);
    return;
  }

  if (parsed.version !== 'https://jsonfeed.org/version/1.1') {
    fail(`feed.json: version must be "https://jsonfeed.org/version/1.1", got "${parsed.version}"`);
  }
  if (parsed.feed_url !== `${SITE}feed.json`) {
    fail(`feed.json: feed_url must be "${SITE}feed.json", got "${parsed.feed_url}"`);
  }
  if (parsed.home_page_url !== SITE) {
    fail(`feed.json: home_page_url must be "${SITE}", got "${parsed.home_page_url}"`);
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    fail('feed.json: items must be a non-empty array');
    return;
  }
  if (parsed.items.length !== manifest.length) {
    fail(`feed.json: items length ${parsed.items.length} does not match manifest length ${manifest.length}`);
  }

  const gameUrls = new Set(manifest.map((game) => SITE + String(game.url || '').replace(/^\/+/, '')));
  let prevDate = null;
  for (const [index, item] of parsed.items.entries()) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      fail(`feed.json: items[${index}] missing id`);
      continue;
    }
    if (!gameUrls.has(item.url)) {
      fail(`feed.json: items[${index}].url "${item.url}" does not match any manifest game URL`);
    }
    if (typeof item.title !== 'string' || !item.title.trim()) {
      fail(`feed.json: items[${index}].title must be a non-empty string`);
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.date_published || '')) {
      fail(`feed.json: items[${index}].date_published must be RFC 3339 UTC, got "${item.date_published}"`);
    }
    if (prevDate && item.date_published > prevDate) {
      fail(`feed.json: items[${index}] (${item.date_published}) is newer than the previous item (${prevDate}) — feed must be newest-first`);
    }
    prevDate = item.date_published;
  }
}

async function checkIndexLink() {
  if (!(await exists('index.html'))) {
    fail('index.html: file missing');
    return;
  }
  const src = await readFile(join(repoRoot, 'index.html'), 'utf8');
  const hasLink = /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/feed\+json["'][^>]+href=["']feed\.json["']/i.test(src)
    || /<link[^>]+type=["']application\/feed\+json["'][^>]+rel=["']alternate["'][^>]+href=["']feed\.json["']/i.test(src)
    || /<link[^>]+href=["']feed\.json["'][^>]+rel=["']alternate["'][^>]+type=["']application\/feed\+json["']/i.test(src);
  if (!hasLink) {
    fail('index.html: missing <link rel="alternate" type="application/feed+json" href="feed.json">');
  }
}

const manifest = await loadManifest();
await checkFeed(manifest);
await checkIndexLink();

if (issues.length > 0) {
  console.error(`Feed check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const message of issues) {
    console.error(` - ${message}`);
  }
  process.exit(1);
}

console.log(`Feed check passed: feed.json (${manifest.length} items, JSON Feed 1.1) and index.html alternate link both valid.`);
