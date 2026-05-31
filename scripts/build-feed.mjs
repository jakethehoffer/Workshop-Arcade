#!/usr/bin/env node
// Generate feed.json (JSON Feed 1.1) from websites/manifest.json.
//
// One feed item per game, ordered newest-first by addedAt. Each item
// carries the manifest's title/subtitle/url/cover/tags/addedAt so feed
// readers and aggregators can surface new catalog additions without
// scraping the catalog page.
//
// Idempotent: re-running with no manifest changes produces byte-identical
// output, so `npm run test:feed` can detect drift the same way
// scripts/check-seo.mjs detects sitemap drift.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL, siteUrl } from './site-config.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_DATE = '2025-09-01';

function normalizeDate(value) {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value.trim())) {
    return value.trim();
  }
  return FALLBACK_DATE;
}

function dateToIso(value) {
  // JSON Feed wants RFC 3339, e.g. 2026-05-17T00:00:00Z. addedAt is
  // a calendar date in the manifest; pin to midnight UTC so the output is
  // stable across machines.
  return `${normalizeDate(value)}T00:00:00Z`;
}

function newestDate(games) {
  let newest = FALLBACK_DATE;
  for (const game of games) {
    const candidate = normalizeDate(game.addedAt);
    if (candidate > newest) newest = candidate;
  }
  return newest;
}

export async function loadManifest() {
  const raw = await readFile(join(repoRoot, 'websites', 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('websites/manifest.json must be an array');
  }
  return parsed;
}

export function buildFeed(manifest) {
  const sorted = [...manifest].sort((a, b) => {
    const left = normalizeDate(a.addedAt);
    const right = normalizeDate(b.addedAt);
    if (left === right) {
      // Stable secondary sort by slug so equal-date entries don't flip.
      return String(a.slug || a.id || '').localeCompare(String(b.slug || b.id || ''));
    }
    // Newest first.
    return right.localeCompare(left);
  });

  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Workshop Arcade — New Games',
    home_page_url: SITE_URL,
    feed_url: siteUrl('feed.json'),
    description: 'New and updated games in the Workshop Arcade catalog.',
    language: 'en',
    icon: siteUrl('covers/app-icon.svg'),
    favicon: siteUrl('covers/app-icon.svg'),
    authors: [
      {
        name: 'Workshop Arcade',
        url: SITE_URL,
      },
    ],
    items: sorted.map((game) => {
      if (typeof game.url !== 'string' || !game.url.trim()) {
        throw new Error(`Manifest entry ${game.id || game.title || '<unknown>'} is missing url`);
      }
      const canonical = siteUrl(game.url);
      const cover = typeof game.cover === 'string' && game.cover.trim()
        ? siteUrl(game.cover)
        : null;
      const tags = Array.isArray(game.tags)
        ? game.tags.filter((tag) => typeof tag === 'string' && tag.trim())
        : [];
      const item = {
        id: canonical,
        url: canonical,
        title: game.title || game.id || 'Untitled game',
        date_published: dateToIso(game.addedAt),
        summary: game.subtitle || 'A standalone HTML5 game from the Workshop Arcade catalog.',
        content_text: game.subtitle || 'A standalone HTML5 game from the Workshop Arcade catalog.',
      };
      if (cover) {
        item.image = cover;
        item.banner_image = cover;
      }
      if (tags.length) {
        item.tags = tags;
      }
      return item;
    }),
    _newest_date: newestDate(manifest),
  };
}

async function writeFeed(manifest) {
  const feed = buildFeed(manifest);
  // Drop the synthetic helper field before writing — it exists only so the
  // validator can sanity-check ordering without recomputing newestDate.
  // eslint-disable-next-line no-unused-vars
  const { _newest_date, ...publicFeed } = feed;
  const body = JSON.stringify(publicFeed, null, 2) + '\n';
  await writeFile(join(repoRoot, 'feed.json'), body, 'utf8');
  console.log(`Wrote feed.json with ${publicFeed.items.length} items (newest ${_newest_date}).`);
}

const invokedDirectly = process.argv[1]?.endsWith('build-feed.mjs');
if (invokedDirectly) {
  const manifest = await loadManifest();
  await writeFeed(manifest);
}
